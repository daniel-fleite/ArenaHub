// Rotas do painel do gestor (indicadores, produtos, vendas, campeonatos, publicações):
// autenticação, autorização por arena e validação de entrada. As regras de banco e os cálculos
// foram validados à parte contra as migrações reais (PGlite).
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.test'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const MANAGER = '00000000-0000-0000-0000-0000000000a1'
const OTHER = '00000000-0000-0000-0000-0000000000b0'
const tokens: Record<string, string> = { 'manager-token': MANAGER, 'other-token': OTHER }
const queries: string[] = []

/** Contas marcadas como suspensas nos testes. */
const suspendedUsers = new Set<string>()

async function fakeQuery(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    queries.push(q)
    // requireAuth: situação da conta (suspensas são bloqueadas)
    if (q.startsWith('SELECT status FROM public.profiles WHERE id')) {
        return { rows: [{ status: suspendedUsers.has(params[0]) ? 'suspenso' : 'ativo' }], rowCount: 1 }
    }
    if (q.includes('AS arena_ids')) {
        return { rows: [{ has_profile: true, is_admin: false, arena_ids: params[0] === MANAGER ? [1] : [] }], rowCount: 1 }
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

const routes: [string, string, unknown?][] = [
    ['GET', '/dashboard'],
    ['GET', '/products'], ['POST', '/products', { name: 'Água', price: 5 }], ['PUT', '/products/1', { name: 'Água', price: 5 }], ['DELETE', '/products/1'],
    ['GET', '/sales'], ['POST', '/sales', { productId: 1, quantity: 1 }], ['DELETE', '/sales/1'],
    ['GET', '/championships'], ['POST', '/championships', {}], ['PUT', '/championships/1', {}], ['DELETE', '/championships/1'],
    ['POST', '/championships/1/teams', { name: 'Time' }], ['DELETE', '/championships/1/teams/1'],
    ['GET', '/posts'], ['POST', '/posts', { content: 'Oi' }], ['DELETE', '/posts/1'],
]

describe('autorização das rotas do gestor', () => {
    for (const [method, path, body] of routes) {
        test(`${method} ${path}: 401 sem token e 403 sem vínculo`, async () => {
            assert.equal((await call(method, `/api/manager/arenas/1${path}`, undefined, body)).status, 401)
            const forbidden = await call(method, `/api/manager/arenas/1${path}`, 'other-token', body)
            assert.equal(forbidden.status, 403)
            assert.doesNotMatch(JSON.stringify(forbidden.body), /select|insert|delete from/i)
        })
    }
    test('gestor de outra arena não acessa a arena 2', async () => {
        assert.equal((await call('GET', '/api/manager/arenas/2/products', 'manager-token')).status, 403)
    })
})

describe('validação antes de tocar no banco', () => {
    const invalid: [string, string, unknown, RegExp][] = [
        ['POST', '/products', { name: 'A', price: 5 }, /nome/i],
        ['POST', '/products', { name: 'Água', price: -1 }, /preço/i],
        ['POST', '/products', { name: 'Água', price: 5.555 }, /preço/i],
        ['POST', '/products', { name: 'Água', price: 5, category: 'xyz' }, /categoria/i],
        ['POST', '/products', { name: 'Água', price: 5, stock: -2 }, /estoque/i],
        ['POST', '/sales', { productId: 'abc' }, /produto/i],
        ['POST', '/sales', { productId: 1, quantity: 0 }, /quantidade/i],
        ['POST', '/championships', { name: 'Copa', sport: 'xadrez', format: 'mata-mata', startsOn: '2027-01-01', maxTeams: 8 }, /modalidade/i],
        ['POST', '/championships', { name: 'Copa', sport: 'futsal', format: 'mata-mata', startsOn: '2027-01-10', endsOn: '2027-01-01', maxTeams: 8 }, /término/i],
        ['POST', '/championships', { name: 'Copa', sport: 'futsal', format: 'mata-mata', startsOn: '2027-01-01', maxTeams: 1 }, /equipes/i],
        ['POST', '/championships/1/teams', { name: 'A' }, /equipe/i],
        ['POST', '/posts', { content: '' }, /publicação/i],
        ['POST', '/posts', { content: 'x', kind: 'spam' }, /tipo/i],
        ['GET', '/dashboard?days=15', undefined, /período/i],
        ['DELETE', '/products/abc', undefined, /ID/i],
    ]
    for (const [method, path, body, message] of invalid) {
        test(`400: ${method} ${path} ${JSON.stringify(body ?? '')}`, async () => {
            const before = queries.length
            const res = await call(method, `/api/manager/arenas/1${path}`, 'manager-token', body)
            assert.equal(res.status, 400)
            assert.match(res.body.error, message)
            const touched = queries.slice(before).filter((q) => !q.includes('AS arena_ids') && !q.startsWith('SELECT status FROM public.profiles'))
            assert.deepEqual(touched, [], 'nenhuma consulta além da autenticação e da verificação de papéis')
        })
    }
})
