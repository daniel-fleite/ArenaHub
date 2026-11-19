// Rotas de administração da plataforma e bloqueio de contas suspensas.
// As consultas SQL de indicadores/listas foram validadas à parte contra as migrações reais (PGlite).
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.test'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const OTHER_ADMIN = '00000000-0000-0000-0000-00000000000b'
const USER = '00000000-0000-0000-0000-0000000000c1'
const SUSPENDED = '00000000-0000-0000-0000-0000000000d1'
const tokens: Record<string, string> = { 'admin-token': ADMIN, 'user-token': USER, 'suspended-token': SUSPENDED }
const suspendedUsers = new Set<string>([SUSPENDED])
const writes: string[] = []

async function fakeQuery(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    const rows = (list: any[]) => ({ rows: list, rowCount: list.length })
    if (q.startsWith('SELECT status FROM public.profiles WHERE id')) {
        return rows([{ status: suspendedUsers.has(params[0]) ? 'suspenso' : 'ativo' }])
    }
    if (q.includes('AS arena_ids')) {
        return rows([{ has_profile: true, is_admin: [ADMIN, OTHER_ADMIN].includes(params[0]), arena_ids: [] }])
    }
    // Usuário-alvo das ações de administração.
    if (q.includes('FROM auth.users u JOIN public.profiles p') && q.includes('WHERE u.id = $1')) {
        const id = params[0]
        return rows([{ id, email: `${id.slice(-2)}@example.test`, created_at: new Date(), full_name: 'Alvo',
            status: suspendedUsers.has(id) ? 'suspenso' : 'ativo', is_admin: id === OTHER_ADMIN, arenas: [] }])
    }
    if (q.startsWith('UPDATE') || q.startsWith('INSERT') || q.startsWith('DELETE')) {
        writes.push(q)
        throw new Error('escrita não esperada no teste')
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
            const id = tokens[String(init?.headers?.Authorization ?? '').replace('Bearer ', '')]
            return id ? new Response(JSON.stringify({ id, email: 'x@example.test' }), { status: 200 }) : new Response('{}', { status: 401 })
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

async function call(method: string, path: string, token?: string, body?: unknown) {
    const response = await realFetch(baseUrl + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json().catch(() => null) as any }
}

describe('acesso às rotas de administração', () => {
    const routes: [string, string, unknown?][] = [
        ['GET', '/api/admin/stats'],
        ['GET', '/api/admin/arenas'],
        ['PATCH', '/api/admin/arenas/1', { status: 'inativa' }],
        ['GET', '/api/admin/users'],
        ['PATCH', `/api/admin/users/${USER}/status`, { status: 'suspenso' }],
        ['POST', `/api/admin/users/${USER}/arenas`, { arenaId: 1 }],
        ['DELETE', `/api/admin/users/${USER}/arenas/1`],
    ]
    for (const [method, path, body] of routes) {
        test(`${method} ${path}: 401 sem token, 403 para não-admin`, async () => {
            assert.equal((await call(method, path, undefined, body)).status, 401)
            assert.equal((await call(method, path, 'user-token', body)).status, 403)
        })
    }
})

describe('validações e regras da administração', () => {
    const invalid: [string, string, unknown][] = [
        ['PATCH', '/api/admin/arenas/1', {}],
        ['PATCH', '/api/admin/arenas/1', { status: 'apagada' }],
        ['PATCH', '/api/admin/arenas/1', { imageUrl: 'http://inseguro.example/foto.jpg' }],
        ['PATCH', '/api/admin/arenas/1', { imageUrl: 'não é url' }],
        ['PATCH', '/api/admin/arenas/abc', { status: 'ativa' }],
        ['PATCH', '/api/admin/users/nao-e-uuid/status', { status: 'suspenso' }],
        ['PATCH', `/api/admin/users/${USER}/status`, { status: 'banido' }],
        ['POST', `/api/admin/users/${USER}/arenas`, { arenaId: 'x' }],
    ]
    for (const [method, path, body] of invalid) {
        test(`400: ${method} ${path} ${JSON.stringify(body)}`, async () => {
            const res = await call(method, path, 'admin-token', body)
            assert.equal(res.status, 400)
            assert.ok(res.body.error)
        })
    }

    test('admin não altera a própria conta', async () => {
        const res = await call('PATCH', `/api/admin/users/${ADMIN}/status`, 'admin-token', { status: 'suspenso' })
        assert.equal(res.status, 409)
    })

    test('outro administrador não pode ser suspenso por aqui', async () => {
        const res = await call('PATCH', `/api/admin/users/${OTHER_ADMIN}/status`, 'admin-token', { status: 'suspenso' })
        assert.equal(res.status, 409)
        assert.match(res.body.error, /admin/i)
    })

    test('nenhuma das tentativas inválidas gravou no banco', () => {
        assert.deepEqual(writes, [])
    })
})

describe('conta suspensa', () => {
    test('é bloqueada em rotas autenticadas com mensagem clara', async () => {
        for (const path of ['/api/me', '/api/me/reservations', '/api/manager/arenas']) {
            const res = await call('GET', path, 'suspended-token')
            assert.equal(res.status, 403)
            assert.match(res.body.error, /suspensa/)
        }
    })

    test('rotas públicas continuam acessíveis sem login', async () => {
        assert.equal((await call('GET', '/api/health')).status, 200)
    })
})
