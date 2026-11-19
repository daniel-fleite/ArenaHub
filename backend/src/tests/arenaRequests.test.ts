// Testes de autorização e transições de status das solicitações de arena.
// Não acessam Supabase nem PostgreSQL: o Auth é simulado via fetch e o pool por um banco em memória.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.test'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const ALICE = '00000000-0000-0000-0000-0000000000a1'
const BOB = '00000000-0000-0000-0000-0000000000b0'
const tokens: Record<string, string> = { 'admin-token': ADMIN, 'alice-token': ALICE, 'bob-token': BOB }

// ── Banco em memória ─────────────────────────────────────────────────────────
type Row = Record<string, any>
interface State { requests: Row[]; arenas: Row[]; managers: Row[]; admins: string[]; nextId: number }
let db: State
let failOnManagerInsert = false

function reset() {
    db = { requests: [], arenas: [], managers: [], admins: [ADMIN], nextId: 1 }
    failOnManagerInsert = false
}

/** Contas marcadas como suspensas nos testes. */
const suspendedUsers = new Set<string>()

async function fakeQuery(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    // requireAuth: situação da conta (suspensas são bloqueadas)
    if (q.startsWith('SELECT status FROM public.profiles WHERE id')) {
        return { rows: [{ status: suspendedUsers.has(params[0]) ? 'suspenso' : 'ativo' }], rowCount: 1 }
    }
    const rows = (list: Row[]) => ({ rows: list, rowCount: list.length })
    const withRequester = (r: Row) => ({ ...r, requester_name: 'Pessoa', requester_email: 'pessoa@example.test' })

    if (q.includes('AS arena_ids')) {
        const [id] = params
        return rows([{
            has_profile: true,
            is_admin: db.admins.includes(id),
            arena_ids: db.managers.filter((m) => m.user_id === id).map((m) => m.arena_id),
        }])
    }
    if (q.startsWith('INSERT INTO public.arena_requests')) {
        const [requester_id, name, address, city, state, description, sports, contact_name, contact_email, contact_phone, instagram] = params
        const row = { id: db.nextId++, requester_id, name, address, city, state, description, sports, contact_name,
            contact_email, contact_phone, instagram, status: 'pending', decided_by: null, decided_at: null,
            rejection_reason: null, arena_id: null, created_at: new Date() }
        db.requests.push(row)
        return rows([row])
    }
    if (q.startsWith('SELECT * FROM public.arena_requests WHERE requester_id')) {
        return rows(db.requests.filter((r) => r.requester_id === params[0]))
    }
    if (q.includes('FOR UPDATE')) return rows(db.requests.filter((r) => r.id === params[0]))
    if (q.includes('LEFT JOIN') && q.includes('WHERE r.id')) {
        return rows(db.requests.filter((r) => r.id === params[0]).map(withRequester))
    }
    if (q.includes('LEFT JOIN') && q.includes('WHERE r.status')) {
        return rows(db.requests.filter((r) => r.status === params[0]).map(withRequester))
    }
    if (q.includes('LEFT JOIN')) return rows(db.requests.map(withRequester))
    if (q.startsWith('INSERT INTO public.arenas')) {
        const row = { id: 100 + db.arenas.length, name: params[0], city: params[1], state: params[2] }
        db.arenas.push(row)
        return rows([{ id: row.id }])
    }
    if (q.startsWith('INSERT INTO public.arena_managers')) {
        if (failOnManagerInsert) throw new Error('falha simulada')
        db.managers.push({ arena_id: params[0], user_id: params[1], granted_by: params[2] })
        return rows([])
    }
    if (q.includes("SET status = 'approved'")) {
        const r = db.requests.find((x) => x.id === params[0] && x.status === 'pending')
        if (r) Object.assign(r, { status: 'approved', decided_by: params[1], decided_at: new Date(), arena_id: params[2] })
        return rows(r ? [r] : [])
    }
    if (q.includes("SET status = 'rejected'")) {
        const r = db.requests.find((x) => x.id === params[0] && x.status === 'pending')
        if (r) Object.assign(r, { status: 'rejected', decided_by: params[1], decided_at: new Date(), rejection_reason: params[2] })
        return rows(r ? [{ id: r.id }] : [])
    }
    if (q.startsWith('SELECT 1 FROM public.arena_requests')) return rows(db.requests.filter((r) => r.id === params[0]))
    throw new Error(`SQL não simulado: ${q}`)
}

async function fakeConnect() {
    let snapshot: string | null = null
    return {
        query: async (sql: string, params?: any[]) => {
            if (sql === 'BEGIN') { snapshot = JSON.stringify(db); return { rows: [], rowCount: 0 } }
            if (sql === 'COMMIT') { snapshot = null; return { rows: [], rowCount: 0 } }
            if (sql === 'ROLLBACK') {
                if (snapshot) db = JSON.parse(snapshot)
                snapshot = null
                return { rows: [], rowCount: 0 }
            }
            return fakeQuery(sql, params)
        },
        release: () => {},
    }
}

// ── Servidor de teste ───────────────────────────────────────────────────────
let baseUrl = ''
let close: () => void
const realFetch = globalThis.fetch

before(async () => {
    const { pool } = await import('../config/database.js')
    ;(pool as any).query = fakeQuery
    ;(pool as any).connect = fakeConnect
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input)
        if (url.startsWith('https://auth.test/auth/v1/user')) {
            const token = String(init?.headers?.Authorization ?? '').replace('Bearer ', '')
            const id = tokens[token]
            return id
                ? new Response(JSON.stringify({ id, email: `${token}@example.test` }), { status: 200 })
                : new Response('{}', { status: 401 })
        }
        return realFetch(input, init)
    }) as typeof fetch
    const { app } = await import('../app.js')
    const server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
})
after(() => {
    globalThis.fetch = realFetch
    close?.()
})
beforeEach(reset)

async function call(method: string, path: string, token?: string, body?: unknown) {
    const response = await realFetch(baseUrl + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json().catch(() => null) as any }
}

const validInput = {
    name: 'Arena Teste',
    address: 'Rua das Quadras, 100',
    city: 'Sorocaba',
    state: 'sp',
    description: 'Arena com duas quadras de areia e uma de society.',
    sports: ['society', 'beach-tennis'],
    contactName: 'Alice',
    contactEmail: 'alice@example.test',
    contactPhone: '(15) 99999-0000',
}

async function createAsAlice(extra: Record<string, unknown> = {}) {
    const res = await call('POST', '/api/arena-requests', 'alice-token', { ...validInput, ...extra })
    assert.equal(res.status, 201)
    return res.body.request
}

// ── Testes ──────────────────────────────────────────────────────────────────
describe('envio de solicitação', () => {
    test('exige autenticação', async () => {
        assert.equal((await call('POST', '/api/arena-requests', undefined, validInput)).status, 401)
        assert.equal((await call('POST', '/api/arena-requests', 'token-falso', validInput)).status, 401)
    })

    test('ignora requester, status e decisor enviados pelo cliente', async () => {
        const request = await createAsAlice({ status: 'aprovada', requesterId: BOB, decidedBy: ADMIN, arenaId: 1 })
        assert.equal(request.status, 'pendente')
        assert.equal(db.requests[0].requester_id, ALICE)
        assert.equal(db.requests[0].status, 'pending')
        assert.equal(db.requests[0].decided_by, null)
        assert.equal(db.requests[0].state, 'SP')
    })

    test('rejeita dados inválidos', async () => {
        const res = await call('POST', '/api/arena-requests', 'alice-token', { ...validInput, sports: ['xadrez'] })
        assert.equal(res.status, 400)
        assert.equal(db.requests.length, 0)
    })

    test('cada usuário lista só as próprias solicitações', async () => {
        await createAsAlice()
        await call('POST', '/api/arena-requests', 'bob-token', { ...validInput, name: 'Arena do Bob' })
        const res = await call('GET', '/api/me/arena-requests', 'alice-token')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.requests.map((r: any) => r.name), ['Arena Teste'])
    })
})

describe('autorização administrativa', () => {
    test('usuário comum não lista, não aprova e não rejeita, nem a própria solicitação', async () => {
        const request = await createAsAlice()
        assert.equal((await call('GET', '/api/admin/arena-requests', 'alice-token')).status, 403)
        assert.equal((await call('GET', `/api/admin/arena-requests/${request.id}`, 'alice-token')).status, 403)
        assert.equal((await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'alice-token')).status, 403)
        assert.equal((await call('POST', `/api/admin/arena-requests/${request.id}/reject`, 'alice-token', {})).status, 403)
        assert.equal(db.requests[0].status, 'pending')
        assert.equal(db.arenas.length, 0)
    })

    test('sem token recebe 401 nas rotas administrativas', async () => {
        assert.equal((await call('GET', '/api/admin/arena-requests')).status, 401)
    })

    test('admin lista pendentes com dados do solicitante', async () => {
        await createAsAlice()
        const res = await call('GET', '/api/admin/arena-requests?status=pendente', 'admin-token')
        assert.equal(res.status, 200)
        assert.equal(res.body.requests.length, 1)
        assert.equal(res.body.requests[0].requesterEmail, 'pessoa@example.test')
        assert.equal((await call('GET', '/api/admin/arena-requests?status=qualquer', 'admin-token')).status, 400)
    })
})

describe('transições de status', () => {
    test('aprovação cria arena, vínculo do solicitante e marca como aprovada', async () => {
        const request = await createAsAlice()
        const res = await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'admin-token')
        assert.equal(res.status, 200)
        assert.equal(res.body.request.status, 'aprovada')
        assert.equal(db.arenas.length, 1)
        assert.deepEqual(db.managers, [{ arena_id: db.arenas[0].id, user_id: ALICE, granted_by: ADMIN }])
        assert.equal(db.requests[0].decided_by, ADMIN)
        assert.equal(db.requests[0].arena_id, db.arenas[0].id)
    })

    test('aprovação repetida retorna 409 e não cria outra arena', async () => {
        const request = await createAsAlice()
        await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'admin-token')
        const again = await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'admin-token')
        assert.equal(again.status, 409)
        assert.equal(db.arenas.length, 1)
        const reject = await call('POST', `/api/admin/arena-requests/${request.id}/reject`, 'admin-token', {})
        assert.equal(reject.status, 409)
        assert.equal(db.requests[0].status, 'approved')
    })

    test('falha no meio da aprovação desfaz tudo (rollback)', async () => {
        const request = await createAsAlice()
        failOnManagerInsert = true
        const res = await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'admin-token')
        assert.equal(res.status, 500)
        assert.equal(db.arenas.length, 0)
        assert.equal(db.managers.length, 0)
        assert.equal(db.requests[0].status, 'pending')
    })

    test('rejeição registra admin e motivo opcional; depois não pode ser aprovada', async () => {
        const request = await createAsAlice()
        const res = await call('POST', `/api/admin/arena-requests/${request.id}/reject`, 'admin-token', { reason: '  Documentação incompleta.  ' })
        assert.equal(res.status, 200)
        assert.equal(res.body.request.status, 'rejeitada')
        assert.equal(db.requests[0].decided_by, ADMIN)
        assert.equal(db.requests[0].rejection_reason, 'Documentação incompleta.')
        const approve = await call('POST', `/api/admin/arena-requests/${request.id}/approve`, 'admin-token')
        assert.equal(approve.status, 409)
        assert.equal(db.arenas.length, 0)
    })

    test('rejeição sem motivo é aceita', async () => {
        const request = await createAsAlice()
        const res = await call('POST', `/api/admin/arena-requests/${request.id}/reject`, 'admin-token')
        assert.equal(res.status, 200)
        assert.equal(db.requests[0].rejection_reason, null)
    })

    test('id inexistente ou inválido', async () => {
        assert.equal((await call('POST', '/api/admin/arena-requests/999/approve', 'admin-token')).status, 404)
        assert.equal((await call('POST', '/api/admin/arena-requests/abc/reject', 'admin-token', {})).status, 400)
    })
})
