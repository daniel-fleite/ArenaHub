// Testes de autorização e validação das quadras.
// Não acessam Supabase nem PostgreSQL: o Auth é simulado via fetch e o pool por um banco em memória
// que reproduz o UNIQUE (arena_id, name) e a FK de arena.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.test'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const MANAGER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b0'
const tokens: Record<string, string> = { 'admin-token': ADMIN, 'manager-token': MANAGER, 'other-token': OTHER }

type Row = Record<string, any>
let db: { arenas: Row[]; courts: Row[]; managers: Row[]; admins: string[]; nextId: number }

function reset() {
    const now = new Date()
    db = {
        arenas: [
            { id: 1, name: 'Arena Um', city: 'Sorocaba', state: 'SP' },
            { id: 2, name: 'Arena Dois', city: 'Itu', state: 'SP' },
        ],
        courts: [
            { id: 10, arena_id: 1, name: 'Quadra 1', sports: ['society'], status: 'ativa', capacity: 14, hourly_rate: '150.00', created_at: now, updated_at: now },
            { id: 11, arena_id: 1, name: 'Quadra 2', sports: ['futsal'], status: 'inativa', capacity: null, hourly_rate: null, created_at: now, updated_at: now },
            { id: 20, arena_id: 2, name: 'Areia', sports: ['futevolei'], status: 'ativa', capacity: null, hourly_rate: '80.00', created_at: now, updated_at: now },
        ],
        managers: [{ arena_id: 1, user_id: MANAGER }],
        admins: [ADMIN],
        nextId: 100,
    }
}

const pgError = (code: string) => Object.assign(new Error(code), { code })

/** Contas marcadas como suspensas nos testes. */
const suspendedUsers = new Set<string>()

async function fakeQuery(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    // requireAuth: situação da conta (suspensas são bloqueadas)
    if (q.startsWith('SELECT status FROM public.profiles WHERE id')) {
        return { rows: [{ status: suspendedUsers.has(params[0]) ? 'suspenso' : 'ativo' }], rowCount: 1 }
    }
    const rows = (list: Row[]) => ({ rows: list, rowCount: list.length })
    const duplicate = (arenaId: number, name: string, exceptId?: number) =>
        db.courts.some((c) => c.arena_id === arenaId && c.name === name && c.id !== exceptId)

    if (q.includes('AS arena_ids')) {
        const [id] = params
        return rows([{
            has_profile: true,
            is_admin: db.admins.includes(id),
            arena_ids: db.managers.filter((m) => m.user_id === id).map((m) => m.arena_id),
        }])
    }
    if (q.startsWith('SELECT id, name, city, state FROM public.arenas WHERE id = ANY')) {
        return rows(db.arenas.filter((a) => params[0].map(Number).includes(a.id)))
    }
    if (q.startsWith('SELECT id, name, city, state FROM public.arenas')) return rows(db.arenas)
    if (q.includes('FROM public.courts WHERE arena_id = ANY')) {
        return rows(db.courts.filter((c) => params[0].map(Number).includes(c.arena_id)))
    }
    if (q.includes("FROM public.courts WHERE arena_id = $1 AND status = 'ativa'")) {
        return rows(db.courts.filter((c) => c.arena_id === params[0] && c.status === 'ativa'))
    }
    if (q.startsWith('INSERT INTO public.courts')) {
        const [arena_id, name, sports, status, capacity, hourly_rate] = params
        if (!db.arenas.some((a) => a.id === arena_id)) throw pgError('23503')
        if (duplicate(arena_id, name)) throw pgError('23505')
        const now = new Date()
        const row = { id: db.nextId++, arena_id, name, sports, status, capacity,
            hourly_rate: hourly_rate == null ? null : Number(hourly_rate).toFixed(2), created_at: now, updated_at: now }
        db.courts.push(row)
        return rows([row])
    }
    if (q.startsWith('UPDATE public.courts')) {
        const [arenaId, courtId, name, sports, status, capacity, hourly_rate] = params
        const row = db.courts.find((c) => c.arena_id === arenaId && c.id === courtId)
        if (!row) return rows([])
        if (duplicate(arenaId, name, courtId)) throw pgError('23505')
        Object.assign(row, { name, sports, status, capacity,
            hourly_rate: hourly_rate == null ? null : Number(hourly_rate).toFixed(2), updated_at: new Date() })
        return rows([row])
    }
    if (q.startsWith('DELETE FROM public.courts')) {
        const index = db.courts.findIndex((c) => c.arena_id === params[0] && c.id === params[1])
        return rows(index === -1 ? [] : db.courts.splice(index, 1))
    }
    throw new Error(`SQL não simulado: ${q}`)
}

let baseUrl = ''
let close: () => void
const realFetch = globalThis.fetch

before(async () => {
    const { pool } = await import('../config/database.js')
    ;(pool as any).query = fakeQuery
    globalThis.fetch = (async (input: any, init?: any) => {
        if (String(input).startsWith('https://auth.test/auth/v1/user')) {
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
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json().catch(() => null) as any }
}

const court = { name: 'Quadra Nova', sports: ['society', 'futsal'], status: 'ativa', capacity: 12, hourlyRate: 120.5 }

describe('leitura', () => {
    test('catálogo público lista só quadras ativas, sem token', async () => {
        const res = await call('GET', '/api/arenas/1/courts')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.courts.map((c: any) => c.name), ['Quadra 1'])
        assert.equal(res.body.courts[0].hourlyRate, 150)
    })

    test('painel exige autenticação', async () => {
        assert.equal((await call('GET', '/api/manager/arenas')).status, 401)
    })

    test('gestor vê só as arenas vinculadas, com quadras inativas', async () => {
        const res = await call('GET', '/api/manager/arenas', 'manager-token')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.arenas.map((a: any) => a.id), ['1'])
        assert.deepEqual(res.body.arenas[0].courts.map((c: any) => c.name), ['Quadra 1', 'Quadra 2'])
    })

    test('usuário sem vínculo recebe lista vazia', async () => {
        const res = await call('GET', '/api/manager/arenas', 'other-token')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.arenas, [])
    })

    test('admin vê todas as arenas', async () => {
        const res = await call('GET', '/api/manager/arenas', 'admin-token')
        assert.deepEqual(res.body.arenas.map((a: any) => a.id).sort(), ['1', '2'])
    })
})

describe('autorização de escrita', () => {
    test('sem token: 401 em criar, editar e excluir', async () => {
        assert.equal((await call('POST', '/api/arenas/1/courts', undefined, court)).status, 401)
        assert.equal((await call('PUT', '/api/arenas/1/courts/10', undefined, court)).status, 401)
        assert.equal((await call('DELETE', '/api/arenas/1/courts/10')).status, 401)
    })

    test('usuário sem vínculo: 403 e nada muda', async () => {
        assert.equal((await call('POST', '/api/arenas/1/courts', 'other-token', court)).status, 403)
        assert.equal((await call('PUT', '/api/arenas/1/courts/10', 'other-token', court)).status, 403)
        assert.equal((await call('DELETE', '/api/arenas/1/courts/10', 'other-token')).status, 403)
        assert.equal(db.courts.length, 3)
        assert.equal(db.courts[0].name, 'Quadra 1')
    })

    test('gestor não escreve em arena de outro gestor', async () => {
        assert.equal((await call('POST', '/api/arenas/2/courts', 'manager-token', court)).status, 403)
        assert.equal((await call('PUT', '/api/arenas/2/courts/20', 'manager-token', court)).status, 403)
        assert.equal((await call('DELETE', '/api/arenas/2/courts/20', 'manager-token')).status, 403)
        assert.ok(db.courts.some((c) => c.id === 20 && c.name === 'Areia'))
    })

    test('gestor não alcança quadra de outra arena pela URL da própria arena', async () => {
        assert.equal((await call('PUT', '/api/arenas/1/courts/20', 'manager-token', court)).status, 404)
        assert.equal((await call('DELETE', '/api/arenas/1/courts/20', 'manager-token')).status, 404)
        assert.ok(db.courts.some((c) => c.id === 20 && c.arena_id === 2 && c.name === 'Areia'))
    })

    test('arenaId/id/datas enviados no corpo são ignorados', async () => {
        const res = await call('POST', '/api/arenas/1/courts', 'manager-token',
            { ...court, arenaId: 2, arena_id: 2, id: 999, createdAt: '2000-01-01' })
        assert.equal(res.status, 201)
        assert.equal(res.body.court.arenaId, '1')
        assert.notEqual(res.body.court.id, '999')
    })
})

describe('CRUD do gestor vinculado', () => {
    test('cria, edita e exclui na própria arena', async () => {
        const created = await call('POST', '/api/arenas/1/courts', 'manager-token', court)
        assert.equal(created.status, 201)
        assert.equal(created.body.court.hourlyRate, 120.5)
        const id = created.body.court.id

        const updated = await call('PUT', `/api/arenas/1/courts/${id}`, 'manager-token',
            { ...court, name: 'Quadra Renomeada', status: 'manutencao', capacity: null, hourlyRate: null })
        assert.equal(updated.status, 200)
        assert.equal(updated.body.court.status, 'manutencao')
        assert.equal(updated.body.court.capacity, undefined)

        const removed = await call('DELETE', `/api/arenas/1/courts/${id}`, 'manager-token')
        assert.equal(removed.status, 200)
        assert.ok(!db.courts.some((c) => String(c.id) === id))
    })

    test('status padrão é ativa', async () => {
        const res = await call('POST', '/api/arenas/1/courts', 'manager-token', { name: 'Sem status', sports: ['futsal'] })
        assert.equal(res.body.court.status, 'ativa')
    })

    test('admin escreve em qualquer arena', async () => {
        assert.equal((await call('POST', '/api/arenas/2/courts', 'admin-token', court)).status, 201)
    })

    test('admin em arena inexistente recebe 404', async () => {
        assert.equal((await call('POST', '/api/arenas/999/courts', 'admin-token', court)).status, 404)
    })
})

describe('validação e conflitos', () => {
    const invalid: [string, Record<string, unknown>][] = [
        ['nome curto', { name: 'A' }],
        ['sem modalidade', { sports: [] }],
        ['modalidade inválida', { sports: ['xadrez'] }],
        ['situação inválida', { status: 'aberta' }],
        ['capacidade zero', { capacity: 0 }],
        ['capacidade fracionada', { capacity: 2.5 }],
        ['capacidade como texto', { capacity: '10' }],
        ['valor negativo', { hourlyRate: -1 }],
        ['valor com 3 casas', { hourlyRate: 10.555 }],
    ]
    for (const [label, patch] of invalid) {
        test(`400: ${label}`, async () => {
            const res = await call('POST', '/api/arenas/1/courts', 'manager-token', { ...court, ...patch })
            assert.equal(res.status, 400)
            assert.equal(db.courts.length, 3)
        })
    }

    test('nome duplicado na mesma arena: 409 (criar e renomear)', async () => {
        assert.equal((await call('POST', '/api/arenas/1/courts', 'manager-token', { ...court, name: 'Quadra 1' })).status, 409)
        assert.equal((await call('PUT', '/api/arenas/1/courts/11', 'manager-token', { ...court, name: 'Quadra 1' })).status, 409)
    })

    test('ids inválidos: 400; quadra inexistente: 404', async () => {
        assert.equal((await call('PUT', '/api/arenas/1/courts/abc', 'manager-token', court)).status, 400)
        assert.equal((await call('DELETE', '/api/arenas/1/courts/9999', 'manager-token')).status, 404)
        assert.equal((await call('GET', '/api/arenas/abc/courts')).status, 400)
    })
})
