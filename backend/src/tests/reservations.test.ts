// Testes de reservas: autorização, validação, tradução de erros do banco e privacidade.
// Não acessam Supabase nem PostgreSQL: Auth simulado via fetch e pool em memória que reproduz
// as respostas do banco (23P01 da EXCLUDE, 23503 da FK de reservas, preço do trigger).
// As regras do próprio SQL foram validadas à parte em supabase/tests/reservations.pglite.mjs.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

process.env.SUPABASE_URL = 'https://auth.test'
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
process.env.DATABASE_URL = 'postgres://unused@localhost/unused'

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const MANAGER = '00000000-0000-0000-0000-0000000000a1'
const ALICE = '00000000-0000-0000-0000-0000000000c1'
const BOB = '00000000-0000-0000-0000-0000000000b0'
const NOPHONE = '00000000-0000-0000-0000-0000000000d0'
const tokens: Record<string, string> = {
    'admin-token': ADMIN, 'manager-token': MANAGER, 'alice-token': ALICE, 'bob-token': BOB, 'nophone-token': NOPHONE,
}

// Relógio fixo: 10/03/2027 12:00 em São Paulo (15:00 UTC).
const NOW = new Date('2027-03-10T15:00:00Z')
const TODAY = '2027-03-10'
const TOMORROW = '2027-03-11'

type Row = Record<string, any>
let db: { arenas: Row[]; courts: Row[]; profiles: Row[]; reservations: Row[]; managers: Row[]; admins: string[]; nextId: number; inserts: any[][]; forceError: any }
const hour = (t: string) => Number(String(t).slice(0, 2))

function reset() {
    db = {
        arenas: [{ id: 1, name: 'Arena Um' }, { id: 2, name: 'Arena Dois' }],
        courts: [
            { id: 10, arena_id: 1, name: 'Quadra 1', sports: ['society', 'futsal'], status: 'ativa', hourly_rate: '100.00' },
            { id: 11, arena_id: 1, name: 'Quadra Off', sports: ['futsal'], status: 'inativa', hourly_rate: '50.00' },
            { id: 12, arena_id: 1, name: 'Sem preço', sports: ['futsal'], status: 'ativa', hourly_rate: null },
            { id: 20, arena_id: 2, name: 'Areia', sports: ['futevolei'], status: 'ativa', hourly_rate: '80.00' },
        ],
        profiles: [
            { id: ALICE, full_name: 'Alice Cliente', phone: '(15) 99999-0001' },
            { id: BOB, full_name: 'Bob Cliente', phone: '15988880002' },
            { id: NOPHONE, full_name: 'Sem Telefone', phone: null },
            { id: MANAGER, full_name: 'Gestor', phone: '15977770003' },
            { id: ADMIN, full_name: 'Admin', phone: '15966660004' },
        ],
        reservations: [],
        managers: [{ arena_id: 1, user_id: MANAGER }],
        admins: [ADMIN],
        nextId: 1,
        inserts: [],
        forceError: null,
    }
}

const pgError = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`erro ${code}`), { code, ...extra })
const occupies = (r: Row) => r.status === 'confirmed' || r.status === 'completed'
const joined = (r: Row) => ({
    ...r,
    court_name: db.courts.find((c) => c.id === r.court_id)?.name,
    arena_name: db.arenas.find((a) => a.id === r.arena_id)?.name,
})
let localNow: () => { date: string; minutes: number }

/** Contas marcadas como suspensas nos testes. */
const suspendedUsers = new Set<string>()

async function fakeQuery(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, ' ').trim()
    // requireAuth: situação da conta (suspensas são bloqueadas)
    if (q.startsWith('SELECT status FROM public.profiles WHERE id')) {
        return { rows: [{ status: suspendedUsers.has(params[0]) ? 'suspenso' : 'ativo' }], rowCount: 1 }
    }
    const rows = (list: Row[]) => ({ rows: list, rowCount: list.length })

    if (q.includes('AS arena_ids')) {
        const [id] = params
        return rows([{ has_profile: true, is_admin: db.admins.includes(id),
            arena_ids: db.managers.filter((m) => m.user_id === id).map((m) => m.arena_id) }])
    }
    if (q.startsWith('SELECT phone FROM public.profiles')) return rows(db.profiles.filter((p) => p.id === params[0]))
    if (q.startsWith('SELECT c.status, c.sports, c.hourly_rate, a.status AS arena_status FROM public.courts c')) {
        return rows(db.courts.filter((c) => c.id === params[0] && c.arena_id === params[1])
            .map((c) => ({ ...c, arena_status: db.arenas.find((a) => a.id === c.arena_id)?.status ?? 'ativa' })))
    }
    if (q.startsWith('INSERT INTO public.reservations')) {
        db.inserts.push(params)
        if (db.forceError) { const e = db.forceError; db.forceError = null; throw e }
        const [court_id, arena_id, user_id, sport, reservation_date, start_time, end_time, , , notes] = params
        const court = db.courts.find((c) => c.id === court_id && c.arena_id === arena_id)
        if (!court) throw pgError('23503', { constraint: 'reservations_court_arena_fkey' })
        const [s, e] = [hour(start_time), hour(end_time)]
        if (db.reservations.some((r) => r.court_id === court_id && r.reservation_date === reservation_date && occupies(r)
            && s < hour(r.end_time) && hour(r.start_time) < e)) {
            throw pgError('23P01', { constraint: 'reservations_no_overlap' })
        }
        // Como o trigger: preço sempre da quadra.
        const rate = Number(court.hourly_rate)
        const row = { id: db.nextId++, court_id, arena_id, user_id, sport, reservation_date, start_time: `${start_time}:00`,
            end_time: `${end_time}:00`, hourly_rate: rate.toFixed(2), total_price: (rate * (e - s)).toFixed(2),
            status: 'confirmed', notes, cancelled_at: null, cancelled_by: null, cancellation_reason: null,
            completed_at: null, created_at: new Date() }
        db.reservations.push(row)
        return rows([{ id: row.id }])
    }
    if (q.startsWith("UPDATE public.reservations SET status = 'completed'")) {
        const now = localNow()
        const scope = q.includes('AND user_id') ? (r: Row) => r.user_id === params[0]
            : q.includes('AND arena_id') ? (r: Row) => r.arena_id === params[0] : () => true
        const due = db.reservations.filter((r) => r.status === 'confirmed' && scope(r)
            && (r.reservation_date < now.date || (r.reservation_date === now.date && hour(r.end_time) * 60 <= now.minutes)))
        due.forEach((r) => Object.assign(r, { status: 'completed', completed_at: new Date() }))
        return rows(due)
    }
    if (q.startsWith('SELECT r.*, c.name AS court_name, a.name AS arena_name, p.full_name')) {
        let list = db.reservations.filter((r) => r.arena_id === params[0])
        if (q.includes('r.reservation_date = $2')) list = list.filter((r) => r.reservation_date === params[1])
        const statusParam = q.includes('r.status = $3') ? params[2] : q.includes('r.status = $2') ? params[1] : null
        if (statusParam) list = list.filter((r) => r.status === statusParam)
        return rows(list.map((r) => {
            const p = db.profiles.find((x) => x.id === r.user_id)
            return { ...joined(r), customer_name: p?.full_name, customer_phone: p?.phone }
        }))
    }
    if (q.includes('FROM public.reservations r JOIN') && q.includes('WHERE r.id = $1')) {
        return rows(db.reservations.filter((r) => r.id === params[0]).map(joined))
    }
    if (q.includes('FROM public.reservations r JOIN') && q.includes('WHERE r.user_id = $1')) {
        return rows(db.reservations.filter((r) => r.user_id === params[0]).map(joined))
    }
    if (q.startsWith('SELECT status, reservation_date, start_time FROM public.reservations')) {
        const byUser = q.includes('user_id = $2')
        return rows(db.reservations.filter((r) => r.id === params[0] && (byUser ? r.user_id === params[1] : r.arena_id === params[1])))
    }
    if (q.startsWith("UPDATE public.reservations SET status = 'cancelled'")) {
        if (db.forceError) { const e = db.forceError; db.forceError = null; throw e }
        const byUser = q.includes('user_id = $2')
        const r = db.reservations.find((x) => x.id === params[0] && x.status === 'confirmed'
            && (byUser ? x.user_id === params[1] : x.arena_id === params[1]))
        if (r) Object.assign(r, { status: 'cancelled', cancelled_by: params[2], cancellation_reason: params[3], cancelled_at: new Date() })
        return rows(r ? [{ id: r.id }] : [])
    }
    if (q.startsWith('SELECT c.id FROM public.courts c JOIN public.arenas a')) {
        return rows(db.courts.filter((c) => c.arena_id === params[0] && c.status === 'ativa' && c.hourly_rate != null
            && (db.arenas.find((a) => a.id === c.arena_id)?.status ?? 'ativa') === 'ativa'))
    }
    if (q.startsWith('SELECT court_id, start_time, end_time FROM public.reservations')) {
        return rows(db.reservations.filter((r) => r.arena_id === params[0] && r.reservation_date === params[1] && occupies(r))
            .map(({ court_id, start_time, end_time }) => ({ court_id, start_time, end_time })))
    }
    if (q.startsWith('DELETE FROM public.courts')) {
        const c = db.courts.find((x) => x.arena_id === params[0] && x.id === params[1])
        if (!c) return rows([])
        if (db.reservations.some((r) => r.court_id === c.id)) throw pgError('23503', { constraint: 'reservations_court_arena_fkey' })
        db.courts = db.courts.filter((x) => x !== c)
        return rows([{ ...c, created_at: new Date(), updated_at: new Date() }])
    }
    if (q.startsWith('DELETE FROM public.arenas')) {
        const a = db.arenas.find((x) => x.id === params[0])
        if (!a) return rows([])
        if (db.reservations.some((r) => r.arena_id === a.id)) throw pgError('23503', { constraint: 'reservations_court_arena_fkey' })
        db.arenas = db.arenas.filter((x) => x !== a)
        return rows([a])
    }
    throw new Error(`SQL não simulado: ${q}`)
}

let baseUrl = ''
let close: () => void
const realFetch = globalThis.fetch

before(async () => {
    const { pool } = await import('../config/database.js')
    ;(pool as any).query = fakeQuery
    const service = await import('../services/reservationService.js')
    service.clock.now = () => NOW
    localNow = () => service.localNow()
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

const draft = { arenaId: '1', courtId: '10', sport: 'futsal', date: TOMORROW, time: '19:00', duration: 2 }
const book = (token: string, patch: Record<string, unknown> = {}) => call('POST', '/api/reservations', token, { ...draft, ...patch })
const seed = (patch: Partial<Row>) => {
    const row = { id: db.nextId++, court_id: 10, arena_id: 1, user_id: ALICE, sport: 'futsal', reservation_date: TOMORROW,
        start_time: '19:00:00', end_time: '20:00:00', hourly_rate: '100.00', total_price: '100.00', status: 'confirmed',
        notes: null, cancelled_at: null, cancelled_by: null, cancellation_reason: null, completed_at: null, created_at: new Date(), ...patch }
    db.reservations.push(row)
    return row
}

describe('criação', () => {
    test('sem token: 401 e nada é gravado', async () => {
        assert.equal((await call('POST', '/api/reservations', undefined, draft)).status, 401)
        assert.equal(db.inserts.length, 0)
    })

    test('válida: 201, confirmada, no formato do frontend', async () => {
        const res = await book('alice-token')
        assert.equal(res.status, 201)
        const r = res.body.reservation
        assert.equal(r.status, 'confirmada')
        assert.equal(r.arenaName, 'Arena Um')
        assert.equal(r.courtName, 'Quadra 1')
        assert.equal(r.date, TOMORROW)
        assert.equal(r.time, '19:00')
        assert.equal(r.endTime, '21:00')
        assert.equal(r.duration, 2)
        assert.equal(r.canCancel, true)
    })

    test('preço vem do banco; preço, usuário e status do corpo são ignorados', async () => {
        const res = await book('alice-token', { total: 1, total_price: 1, hourlyRate: 1, userId: BOB, user_id: BOB, status: 'cancelada' })
        assert.equal(res.status, 201)
        assert.equal(res.body.reservation.total, 200)
        assert.equal(res.body.reservation.hourlyRate, 100)
        const sent = db.inserts[0]
        assert.equal(sent[2], ALICE, 'user_id do token')
        // Parâmetros: quadra, arena, usuário, modalidade, data, início, fim, observação.
        // O preço vai como literal 0 no SQL e é recalculado pelo trigger.
        assert.deepEqual(sent, [10, 1, ALICE, 'futsal', TOMORROW, '19:00', '21:00', null],
            'nenhum preço, usuário ou status do cliente chega ao banco')
        assert.equal(db.reservations[0].user_id, ALICE)
    })

    const invalid: [string, Record<string, unknown>][] = [
        ['sem arena', { arenaId: undefined }],
        ['quadra inválida', { courtId: 'abc' }],
        ['modalidade desconhecida', { sport: 'xadrez' }],
        ['data inválida', { date: '2027-02-30' }],
        ['data em outro formato', { date: '11/03/2027' }],
        ['hora não cheia', { time: '19:30' }],
        ['hora fora do dia', { time: '24:00' }],
        ['duração 0', { duration: 0 }],
        ['duração 9', { duration: 9 }],
        ['duração fracionada', { duration: 1.5 }],
        ['passa da meia-noite', { time: '22:00', duration: 3 }],
        ['observação longa', { notes: 'x'.repeat(501) }],
    ]
    for (const [label, patch] of invalid) {
        test(`400: ${label}`, async () => {
            const res = await book('alice-token', patch)
            assert.equal(res.status, 400)
            assert.ok(res.body.error)
            assert.equal(db.inserts.length, 0)
        })
    }

    test('termina exatamente às 24:00', async () => {
        const res = await book('alice-token', { time: '22:00', duration: 2 })
        assert.equal(res.status, 201)
        assert.equal(res.body.reservation.endTime, '24:00')
    })

    test('telefone ausente: 422 orientando a completar o perfil', async () => {
        const res = await book('nophone-token')
        assert.equal(res.status, 422)
        assert.match(res.body.error, /telefone/i)
        assert.match(res.body.error, /perfil/i)
        assert.equal(db.inserts.length, 0)
    })

    for (const phone of ['123456789', '1'.repeat(14), '   ', '(15) 9999']) {
        test(`telefone inválido (${JSON.stringify(phone)}): 422`, async () => {
            db.profiles.find((p) => p.id === ALICE)!.phone = phone
            assert.equal((await book('alice-token')).status, 422)
        })
    }

    test('quadra inexistente ou de outra arena: 404', async () => {
        assert.equal((await book('alice-token', { courtId: '999' })).status, 404)
        assert.equal((await book('alice-token', { arenaId: '1', courtId: '20', sport: 'futevolei' })).status, 404)
        assert.equal(db.inserts.length, 0)
    })

    test('arena inativa: 422 e nada é gravado', async () => {
        db.arenas.find((a) => a.id === 1)!.status = 'inativa'
        const res = await book('alice-token')
        assert.equal(res.status, 422)
        assert.match(res.body.error, /arena/i)
        assert.equal(db.inserts.length, 0)
    })

    test('quadra inativa, sem preço ou sem a modalidade: 422', async () => {
        const off = await book('alice-token', { courtId: '11' })
        assert.equal(off.status, 422)
        assert.match(off.body.error, /não está disponível/)
        const noPrice = await book('alice-token', { courtId: '12' })
        assert.equal(noPrice.status, 422)
        assert.match(noPrice.body.error, /preço/)
        const sport = await book('alice-token', { sport: 'beach-tennis' })
        assert.equal(sport.status, 422)
        assert.match(sport.body.error, /modalidade/)
    })

    test('início no passado ou já iniciado (fuso de São Paulo): 422', async () => {
        assert.equal((await book('alice-token', { date: '2027-03-09' })).status, 422)
        assert.equal((await book('alice-token', { date: TODAY, time: '12:00', duration: 1 })).status, 422, '12:00 de hoje já começou')
        assert.equal((await book('alice-token', { date: TODAY, time: '13:00', duration: 1 })).status, 201)
    })

    test('conflito de horário (23P01): 409 sem detalhes internos', async () => {
        assert.equal((await book('alice-token')).status, 201)
        const res = await book('bob-token', { time: '20:00', duration: 1 })
        assert.equal(res.status, 409)
        assert.doesNotMatch(res.body.error, /23P01|exclusion|reservations_/)
    })

    test('consecutiva e após cancelamento são aceitas', async () => {
        assert.equal((await book('alice-token')).status, 201)
        assert.equal((await book('bob-token', { time: '21:00', duration: 1 })).status, 201)
        seed({ court_id: 10, reservation_date: '2027-03-12', start_time: '10:00:00', end_time: '11:00:00', status: 'cancelled', cancelled_at: new Date() })
        assert.equal((await book('bob-token', { date: '2027-03-12', time: '10:00', duration: 1 })).status, 201)
    })

    test('erros do trigger viram mensagens previsíveis', async () => {
        db.forceError = pgError('23514', { message: 'reservations: o horário escolhido já começou ou passou', constraint: undefined })
        const late = await book('alice-token')
        assert.equal(late.status, 422)
        assert.doesNotMatch(late.body.error, /reservations:/)
        db.forceError = pgError('23514', { message: 'new row violates check constraint "reservations_time_window"' })
        const generic = await book('alice-token')
        assert.equal(generic.status, 422)
        assert.equal(generic.body.error, 'Dados de reserva inválidos.')
        db.forceError = pgError('23503', { constraint: 'reservations_court_arena_fkey' })
        assert.equal((await book('alice-token')).status, 404)
        db.forceError = pgError('22003')
        assert.equal((await book('alice-token')).status, 422)
        db.forceError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
        const crash = await book('alice-token')
        assert.equal(crash.status, 500)
        assert.doesNotMatch(crash.body.error, /connection|ECONN/)
    })
})

describe('minhas reservas', () => {
    test('exige autenticação', async () => {
        assert.equal((await call('GET', '/api/me/reservations')).status, 401)
    })

    test('lista só as próprias e sem dados de contato', async () => {
        seed({ user_id: ALICE })
        seed({ user_id: BOB, start_time: '21:00:00', end_time: '22:00:00' })
        const res = await call('GET', '/api/me/reservations', 'alice-token')
        assert.equal(res.status, 200)
        assert.equal(res.body.reservations.length, 1)
        assert.equal(res.body.reservations[0].customer, undefined)
        assert.doesNotMatch(JSON.stringify(res.body), /99999|88880|Bob/)
    })

    test('conclui antes de listar as vencidas; idempotente; não conclui antes do fim', async () => {
        const ended = seed({ reservation_date: '2027-03-09' })
        const ongoing = seed({ reservation_date: TODAY, start_time: '11:00:00', end_time: '13:00:00' })
        const future = seed({ reservation_date: TOMORROW })
        await call('GET', '/api/me/reservations', 'alice-token')
        assert.equal(ended.status, 'completed')
        assert.equal(ongoing.status, 'confirmed', 'em andamento (termina 13:00) não é concluída às 12:00')
        assert.equal(future.status, 'confirmed')
        const completedAt = ended.completed_at
        const again = await call('GET', '/api/me/reservations', 'alice-token')
        assert.equal(ended.completed_at, completedAt, 'segunda listagem não altera')
        const map = Object.fromEntries(again.body.reservations.map((r: any) => [r.id, r]))
        assert.equal(map[ended.id].status, 'concluida')
        assert.equal(map[ended.id].canCancel, false)
        assert.equal(map[ongoing.id].canCancel, false)
        assert.equal(map[future.id].canCancel, true)
    })
})

describe('cancelamento pelo cliente', () => {
    test('cancela a própria antes do início, registrando o autor', async () => {
        const r = seed({})
        const res = await call('POST', `/api/me/reservations/${r.id}/cancel`, 'alice-token', { reason: 'imprevisto' })
        assert.equal(res.status, 200)
        assert.equal(res.body.reservation.status, 'cancelada')
        assert.equal(r.cancelled_by, ALICE)
        assert.equal(r.cancellation_reason, 'imprevisto')
    })

    test('reserva de outro usuário: 404 e nada muda', async () => {
        const r = seed({ user_id: BOB })
        const res = await call('POST', `/api/me/reservations/${r.id}/cancel`, 'alice-token')
        assert.equal(res.status, 404)
        assert.equal(r.status, 'confirmed')
    })

    test('após o início: 409', async () => {
        const r = seed({ reservation_date: TODAY, start_time: '11:00:00', end_time: '13:00:00' })
        const res = await call('POST', `/api/me/reservations/${r.id}/cancel`, 'alice-token')
        assert.equal(res.status, 409)
        assert.match(res.body.error, /antes do início/)
        assert.equal(r.status, 'confirmed')
    })

    test('já cancelada ou concluída: 409', async () => {
        const c = seed({ status: 'cancelled', cancelled_at: new Date() })
        assert.equal((await call('POST', `/api/me/reservations/${c.id}/cancel`, 'alice-token')).status, 409)
        const d = seed({ status: 'completed', reservation_date: '2027-03-01', completed_at: new Date() })
        assert.equal((await call('POST', `/api/me/reservations/${d.id}/cancel`, 'alice-token')).status, 409)
    })

    test('trigger como última barreira: 23514 de cancelamento vira 409', async () => {
        const r = seed({})
        db.forceError = pgError('23514', { message: 'reservations: só é possível cancelar antes do início da reserva' })
        assert.equal((await call('POST', `/api/me/reservations/${r.id}/cancel`, 'alice-token')).status, 409)
    })

    test('sem token: 401; id inválido: 400', async () => {
        assert.equal((await call('POST', '/api/me/reservations/1/cancel')).status, 401)
        assert.equal((await call('POST', '/api/me/reservations/abc/cancel', 'alice-token')).status, 400)
    })
})

describe('gestão', () => {
    test('gestor lista reservas da própria arena com nome e telefone', async () => {
        seed({ user_id: ALICE })
        const res = await call('GET', '/api/manager/arenas/1/reservations', 'manager-token')
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.reservations[0].customer, { name: 'Alice Cliente', phone: '(15) 99999-0001' })
    })

    test('gestor não acessa arena não gerenciada: 403 sem dados', async () => {
        seed({ arena_id: 2, court_id: 20, sport: 'futevolei' })
        const res = await call('GET', '/api/manager/arenas/2/reservations', 'manager-token')
        assert.equal(res.status, 403)
        assert.doesNotMatch(JSON.stringify(res.body), /Alice|99999/)
    })

    test('cliente sem vínculo não usa rotas de gestão', async () => {
        seed({})
        assert.equal((await call('GET', '/api/manager/arenas/1/reservations', 'alice-token')).status, 403)
        assert.equal((await call('GET', '/api/manager/arenas/1/reservations')).status, 401)
    })

    test('admin acessa qualquer arena', async () => {
        seed({ arena_id: 2, court_id: 20, sport: 'futevolei' })
        const res = await call('GET', '/api/manager/arenas/2/reservations', 'admin-token')
        assert.equal(res.status, 200)
        assert.equal(res.body.reservations.length, 1)
    })

    test('filtros de data e status; status inválido: 400', async () => {
        seed({ reservation_date: TOMORROW })
        seed({ reservation_date: '2027-03-12' })
        const byDate = await call('GET', `/api/manager/arenas/1/reservations?date=${TOMORROW}`, 'manager-token')
        assert.equal(byDate.body.reservations.length, 1)
        const byStatus = await call('GET', '/api/manager/arenas/1/reservations?status=cancelada', 'manager-token')
        assert.equal(byStatus.body.reservations.length, 0)
        assert.equal((await call('GET', '/api/manager/arenas/1/reservations?status=pendente', 'manager-token')).status, 400)
        assert.equal((await call('GET', '/api/manager/arenas/1/reservations?date=ontem', 'manager-token')).status, 400)
    })

    test('gestor cancela reserva da própria arena antes do início', async () => {
        const r = seed({})
        const res = await call('POST', `/api/manager/arenas/1/reservations/${r.id}/cancel`, 'manager-token', { reason: 'manutenção' })
        assert.equal(res.status, 200)
        assert.equal(r.cancelled_by, MANAGER)
    })

    test('gestor não cancela após o início', async () => {
        const r = seed({ reservation_date: TODAY, start_time: '11:00:00', end_time: '13:00:00' })
        assert.equal((await call('POST', `/api/manager/arenas/1/reservations/${r.id}/cancel`, 'manager-token')).status, 409)
        assert.equal(r.status, 'confirmed')
    })

    test('gestor não cancela reserva de outra arena, nem pela URL da própria', async () => {
        const r = seed({ arena_id: 2, court_id: 20, sport: 'futevolei' })
        assert.equal((await call('POST', `/api/manager/arenas/2/reservations/${r.id}/cancel`, 'manager-token')).status, 403)
        assert.equal((await call('POST', `/api/manager/arenas/1/reservations/${r.id}/cancel`, 'manager-token')).status, 404)
        assert.equal(r.status, 'confirmed')
    })
})

describe('disponibilidade pública', () => {
    test('sem token, horários ocupados sem dados pessoais', async () => {
        seed({ reservation_date: TOMORROW, start_time: '19:00:00', end_time: '21:00:00' })
        seed({ reservation_date: TOMORROW, start_time: '08:00:00', end_time: '09:00:00', status: 'cancelled', cancelled_at: new Date() })
        const res = await call('GET', `/api/arenas/1/availability?date=${TOMORROW}`)
        assert.equal(res.status, 200)
        assert.deepEqual(res.body.courts.map((c: any) => c.courtId), ['10'], 'só quadra ativa e com preço')
        const slots = Object.fromEntries(res.body.courts[0].slots.map((s: any) => [s.time, s.available]))
        assert.equal(slots['19:00'], false)
        assert.equal(slots['20:00'], false)
        assert.equal(slots['21:00'], true, '[início, fim): 21:00 livre')
        assert.equal(slots['08:00'], true, 'cancelada libera')
        assert.deepEqual(res.body.courts[0].busy, [{ start: '19:00', end: '21:00' }])
        assert.doesNotMatch(JSON.stringify(res.body), /Alice|99999|user|customer|00000000/)
    })

    test('horários de hoje que já começaram ficam indisponíveis', async () => {
        const res = await call('GET', `/api/arenas/1/availability?date=${TODAY}`)
        const slots = Object.fromEntries(res.body.courts[0].slots.map((s: any) => [s.time, s.available]))
        assert.equal(slots['12:00'], false)
        assert.equal(slots['13:00'], true)
    })

    test('data inválida: 400', async () => {
        assert.equal((await call('GET', '/api/arenas/1/availability')).status, 400)
        assert.equal((await call('GET', '/api/arenas/1/availability?date=2027-13-01')).status, 400)
    })
})

describe('exclusões bloqueadas por reservas (23503)', () => {
    test('quadra com reservas: 409 orientando inativar', async () => {
        seed({})
        const res = await call('DELETE', '/api/arenas/1/courts/10', 'manager-token')
        assert.equal(res.status, 409)
        assert.match(res.body.error, /Inativa/)
        assert.ok(db.courts.some((c) => c.id === 10))
    })

    test('quadra sem reservas continua podendo ser excluída', async () => {
        assert.equal((await call('DELETE', '/api/arenas/1/courts/11', 'manager-token')).status, 200)
    })

    test('arena com reservas: 409 (admin)', async () => {
        seed({})
        const res = await call('DELETE', '/api/arenas/1', 'admin-token')
        assert.equal(res.status, 409)
        assert.match(res.body.error, /reservas/)
        assert.ok(db.arenas.some((a) => a.id === 1))
    })

    test('arena sem reservas continua podendo ser excluída', async () => {
        assert.equal((await call('DELETE', '/api/arenas/2', 'admin-token')).status, 200)
    })
})
