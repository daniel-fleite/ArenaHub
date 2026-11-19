// Validação local das migrações de reservas com PGlite (PostgreSQL em WebAssembly).
// NÃO acessa o Supabase. PGlite NÃO é dependência do projeto. Para rodar, numa pasta temporária:
//   npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <projeto>/supabase/tests/reservations.pglite.mjs .
//   node reservations.pglite.mjs <projeto>/supabase/migrations
// Limitação: conexão única — concorrência real não é testável aqui.
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync } from 'node:fs'
const dir = process.argv[2]
const db = new PGlite({ extensions: { btree_gist } })
const ADMIN='00000000-0000-0000-0000-00000000000a', MGR='00000000-0000-0000-0000-0000000000a1', MGR2='00000000-0000-0000-0000-0000000000a2'
const ALICE='00000000-0000-0000-0000-0000000000c1', BOB='00000000-0000-0000-0000-0000000000b0', CAROL='00000000-0000-0000-0000-0000000000d0'
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; grant usage on schema auth to anon, authenticated; create schema extensions;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated;
  create table public.arenas (id bigint generated always as identity primary key, name text not null, city text not null, state varchar(2) not null);
  insert into public.arenas (name, city, state) values ('Arena 1','Sorocaba','SP'), ('Arena 2','Itu','SP');
  insert into auth.users values ('${ADMIN}','a@x','{"name":"Admin"}'),('${MGR}','m@x','{"name":"Gestor 1"}'),('${MGR2}','m2@x','{"name":"Gestor 2"}'),
    ('${ALICE}','al@x','{"name":"Alice"}'),('${BOB}','b@x','{"name":"Bob"}'),('${CAROL}','c@x','{"name":"Carol"}');`)
await db.exec('alter default privileges in schema public grant all on sequences to anon, authenticated')
for (const f of ['20261026000100_profiles_roles_arena_managers.sql','20261026000200_arenas_rls.sql','20261027000100_arena_requests.sql','20261027000200_courts.sql','20261028000100_reservations.sql'])
  await db.exec(readFileSync(`${dir}/${f}`, 'utf8'))
await db.exec(`insert into public.platform_admins (user_id, granted_by) values ('${ADMIN}','t');
  insert into public.arena_managers (arena_id, user_id) values (1,'${MGR}'),(2,'${MGR2}');
  update public.profiles set phone='(15) 99999-0001' where id='${ALICE}';
  update public.profiles set phone='15988880002' where id='${BOB}';
  update public.profiles set phone='12345678' where id='${MGR}';  -- 8 dígitos: válido no perfil, insuficiente para reservar
  insert into public.courts (arena_id,name,sports,status,hourly_rate) values
    (1,'C1','{society,futsal}','ativa',100),(1,'C2','{futsal}','ativa',80.5),(2,'D1','{futevolei}','ativa',60),
    (1,'Off','{futsal}','inativa',50),(1,'SemPreco','{futsal}','ativa',null);`)
let fails = 0
const ok = (label, cond, extra='') => { if (!cond) fails++; console.log(cond ? 'OK  ' : 'FAIL', label, extra) }
async function expectError(label, sql, code) { try { await db.exec(sql); ok(label, false, '(deveria falhar)') } catch (e) { ok(label, !code || e.code === code, `-> ${e.code} ${e.message}`) } }
async function expectOk(label, sql) { try { await db.exec(sql); ok(label, true) } catch (e) { ok(label, false, e.message) } }
const ins = (court, arena, user, date, s, e, extra = {}) => {
  const f = { sport: "'futsal'", status: "'confirmed'", hourly_rate: 0, total_price: 0, created_at: 'default', updated_at: 'default', ...extra }
  return `insert into public.reservations (court_id, arena_id, user_id, sport, reservation_date, start_time, end_time, hourly_rate, total_price, status, created_at, updated_at)
    values (${court}, ${arena}, ${user ? `'${user}'` : 'null'}, ${f.sport}, '${date}', '${s}', '${e}', ${f.hourly_rate}, ${f.total_price}, ${f.status}, ${f.created_at}, ${f.updated_at})`
}
const D = '2027-03-10', D2 = '2027-03-11'
const get = async (where) => (await db.query(`select * from public.reservations where ${where}`)).rows[0]
const count = async (w = '') => (await db.query(`select count(*)::int c from public.reservations ${w}`)).rows[0].c

console.log('— criação, preço e datas')
await expectOk('reserva nasce confirmada', ins(1,1,ALICE,D,'19:00','20:00'))
ok('  -> status confirmed', (await get(`start_time='19:00' and court_id=1`)).status === 'confirmed')
await expectOk('preço/datas enviados são ignorados', ins(2,1,BOB,D,'10:00','12:00', {hourly_rate: 1, total_price: 1, created_at: "'2000-01-01'", updated_at: "'2000-01-01'"}))
const priced = await get(`court_id=2 and start_time='10:00'`)
ok('  -> preço do banco: 80.50/h × 2h = 161.00', priced.hourly_rate === '80.50' && priced.total_price === '161.00', `${priced.hourly_rate} / ${priced.total_price}`)
ok('  -> created_at/updated_at definidos pelo banco', new Date(priced.created_at).getFullYear() > 2000 && new Date(priced.updated_at).getFullYear() > 2000)
await db.exec(`update public.courts set hourly_rate = 999 where id = 2`)
ok('  -> mudar o preço da quadra não altera a reserva', (await get(`id=${priced.id}`)).total_price === '161.00')
await expectError('nasce cancelada', ins(1,1,BOB,D,'08:00','09:00', {status:"'cancelled'"}), '23514')
await expectError('status pending não existe', ins(1,1,BOB,D,'08:00','09:00', {status:"'pending'"}), '23514')
await expectError('status expired não existe', ins(1,1,BOB,D,'08:00','09:00', {status:"'expired'"}), '23514')
await expectError('sem responsável', ins(1,1,null,D,'08:00','09:00'), '23514')

console.log('— quadra e arena')
await expectError('quadra sem preço', ins(5,1,BOB,D,'10:00','11:00'), '23514')
await expectError('quadra inativa', ins(4,1,BOB,D,'10:00','11:00'), '23514')
await expectError('modalidade não oferecida', ins(2,1,BOB,D,'14:00','15:00', {sport:"'society'"}), '23514')
await expectError('quadra de outra arena', ins(3,1,BOB,D,'10:00','11:00', {sport:"'futevolei'"}), '23503')

console.log('— telefone')
await expectError('perfil sem telefone', ins(1,1,CAROL,D,'08:00','09:00'), '23514')
await expectError('telefone com menos de 10 dígitos', ins(1,1,MGR,D,'08:00','09:00'), '23514')
await db.exec(`update public.profiles set phone='(15) 97777-0003' where id='${CAROL}'`)
await expectOk('após completar o telefone, reserva aceita', ins(1,1,CAROL,D,'08:00','09:00'))
ok('telefone segue opcional nos perfis', (await db.query(`select count(*)::int c from public.profiles where phone is null`)).rows[0].c > 0)

console.log('— horários')
await expectError('início no passado', ins(1,1,BOB,'2020-01-01','10:00','11:00'), '23514')
await expectError('início não cheio (19:30)', ins(1,1,BOB,D2,'19:30','20:30'), '23514')
await expectError('fim não cheio (20:30)', ins(1,1,BOB,D2,'19:00','20:30'), '23514')
await expectError('segundos no horário', ins(1,1,BOB,D2,'19:00:15','20:00'), '23514')
await expectError('fim antes do início', ins(1,1,BOB,D2,'20:00','19:00'), '23514')
await expectError('fim igual ao início', ins(1,1,BOB,D2,'20:00','20:00'), '23514')
await expectError('9 horas', ins(1,1,BOB,D2,'06:00','15:00'), '23514')
await expectOk('8 horas', ins(1,1,BOB,D2,'06:00','14:00'))
await expectOk('1 hora até 24:00', ins(1,1,BOB,D2,'23:00','24:00'))

console.log('— conflitos')
await expectError('sobreposição total', ins(1,1,BOB,D,'19:00','20:00'), '23P01')
await expectError('sobreposição parcial (18:00-20:00)', ins(1,1,BOB,D,'18:00','20:00'), '23P01')
await expectError('englobando (18:00-21:00)', ins(1,1,BOB,D,'18:00','21:00'), '23P01')
await expectOk('consecutiva antes (18:00-19:00)', ins(1,1,BOB,D,'18:00','19:00'))
await expectOk('consecutiva depois (20:00-22:00)', ins(1,1,BOB,D,'20:00','22:00'))
await expectOk('mesmo horário em outra quadra', ins(2,1,BOB,D,'19:00','20:00'))
console.log('  (concorrência real: NÃO testável no PGlite — conexão única; garantida pela EXCLUDE no PostgreSQL)')

console.log('— cancelamento antes do início')
const r19 = (await get(`court_id=1 and reservation_date='${D}' and start_time='19:00'`)).id
await expectError('cancelar sem informar o autor', `update public.reservations set status='cancelled' where id=${r19}`, '23514')
await expectOk('cliente cancela antes do início', `update public.reservations set status='cancelled', cancelled_by='${ALICE}', cancellation_reason='imprevisto', cancelled_at='2000-01-01' where id=${r19}`)
const c = await get(`id=${r19}`)
ok('  -> cancelled_at definido pelo banco (ignora o enviado)', new Date(c.cancelled_at).getFullYear() > 2000)
await expectOk('cancelamento libera o horário', ins(1,1,BOB,D,'19:00','20:00'))
const r20 = (await get(`court_id=1 and reservation_date='${D}' and start_time='20:00'`)).id
await expectOk('gestor cancela antes do início', `update public.reservations set status='cancelled', cancelled_by='${MGR}', cancellation_reason='manutenção' where id=${r20}`)
await expectError('cancelada não volta a confirmada', `update public.reservations set status='confirmed', cancelled_at=null, cancelled_by=null, cancellation_reason=null where id=${r19}`, '23514')
await expectError('cancelada não vira concluída', `update public.reservations set status='completed' where id=${r19}`, '23514')
await expectError('motivo do cancelamento não muda', `update public.reservations set cancellation_reason='outro' where id=${r19}`, '23514')
await expectError('data do cancelamento não muda', `update public.reservations set cancelled_at=now() - interval '1 day' where id=${r19}`, '23514')

console.log('— reservas iniciadas/encerradas (fixtures inseridas com o trigger desligado; regras testadas com ele ligado)')
const nowLocal = (await db.query(`select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d, extract(hour from now() at time zone 'America/Sao_Paulo')::int h`)).rows[0]
const ongS = `${String(nowLocal.h).padStart(2,'0')}:00`, ongE = nowLocal.h === 23 ? '24:00' : `${String(nowLocal.h + 1).padStart(2,'0')}:00`
console.log(`  (em andamento: ${nowLocal.d} ${ongS}-${ongE})`)
await db.exec(`alter table public.reservations disable trigger reservations_guard;
  insert into public.reservations (court_id, arena_id, user_id, sport, reservation_date, start_time, end_time, hourly_rate, total_price) values
    (1,1,'${ALICE}','futsal', current_date - 2, '10:00','11:00',100,100),
    (2,1,'${ALICE}','futsal', current_date - 2, '10:00','11:00',80,80),
    (1,1,'${ALICE}','futsal', '${nowLocal.d}', '${ongS}','${ongE}',100,100),
    (2,1,'${BOB}','futsal', '${nowLocal.d}', '${ongS}','${ongE}',80,80);
  alter table public.reservations enable trigger reservations_guard;`)
const past1 = (await get(`court_id=1 and reservation_date=current_date - 2`)).id
const past2 = (await get(`court_id=2 and reservation_date=current_date - 2`)).id
const ongA = (await get(`court_id=1 and reservation_date='${nowLocal.d}' and start_time='${ongS}'`)).id
const ongB = (await get(`court_id=2 and reservation_date='${nowLocal.d}' and start_time='${ongS}'`)).id
await expectError('cliente NÃO cancela após o início', `update public.reservations set status='cancelled', cancelled_by='${ALICE}' where id=${ongA}`, '23514')
await expectError('gestor NÃO cancela após o início', `update public.reservations set status='cancelled', cancelled_by='${MGR}' where id=${ongB}`, '23514')
await expectError('admin NÃO cancela após o início', `update public.reservations set status='cancelled', cancelled_by='${ADMIN}' where id=${ongB}`, '23514')
await expectError('ninguém cancela reserva encerrada', `update public.reservations set status='cancelled', cancelled_by='${MGR}' where id=${past1}`, '23514')

console.log('— conclusão')
const futureR = (await get(`court_id=1 and reservation_date='${D2}' and start_time='06:00'`)).id
await expectError('não conclui reserva futura', `update public.reservations set status='completed' where id=${futureR}`, '23514')
await expectError('não conclui reserva em andamento', `update public.reservations set status='completed' where id=${ongA}`, '23514')
const sweep = `update public.reservations set status='completed'
  where status='confirmed' and private.reservation_instant(reservation_date, end_time) <= now()`
const first = await db.query(sweep)
ok('lote conclui as encerradas', first.affectedRows === 2, `(${first.affectedRows} linhas)`)
ok('  -> completed_at definido pelo banco', (await get(`id=${past1}`)).completed_at !== null && (await get(`id=${past2}`)).status === 'completed')
ok('  -> em andamento e futuras intactas', (await get(`id=${ongA}`)).status === 'confirmed' && (await get(`id=${futureR}`)).status === 'confirmed')
const second = await db.query(sweep)
ok('lote é idempotente (segunda execução: 0 linhas)', second.affectedRows === 0, `(${second.affectedRows})`)
// Trigger desligado só aqui: isola a EXCLUDE (o trigger recusaria antes por "início no passado").
await db.exec('alter table public.reservations disable trigger reservations_guard')
await expectError('concluída continua bloqueando o horário (EXCLUDE)', `insert into public.reservations (court_id, arena_id, user_id, sport, reservation_date, start_time, end_time, hourly_rate, total_price) values (1,1,'${BOB}','futsal', current_date - 2, '10:00','11:00',1,1)`, '23P01')
await db.exec('alter table public.reservations enable trigger reservations_guard')
await expectError('concluída não pode ser cancelada', `update public.reservations set status='cancelled', cancelled_by='${MGR}' where id=${past1}`, '23514')
await expectError('concluída não volta a confirmada', `update public.reservations set status='confirmed', completed_at=null where id=${past1}`, '23514')
await expectError('completed_at não muda', `update public.reservations set completed_at=now() - interval '1 day' where id=${past1}`, '23514')

console.log('— imutabilidade')
for (const [col, val] of [['start_time',"'07:00'"],['end_time',"'15:00'"],['reservation_date',"'2027-03-12'"],['court_id','2'],['arena_id','2'],['total_price','1'],['hourly_rate','1'],['sport',"'society'"],['user_id',`'${ALICE}'`],['notes',"'x'"],['created_at','now()']])
  await expectError(`não altera ${col}`, `update public.reservations set ${col}=${val} where id=${futureR}`, '23514')

console.log('— exclusões')
await expectError('quadra com reservas não pode ser excluída', `delete from public.courts where id=1`, '23503')
await expectError('arena com reservas não pode ser excluída', `delete from public.arenas where id=1`, '23503')
await expectOk('quadra sem reservas pode ser excluída', `delete from public.courts where id=4`)
const bobBefore = await count(`where user_id='${BOB}'`)
await expectOk('excluir conta preserva reservas (SET NULL)', `delete from auth.users where id='${BOB}'`)
ok('  -> reservas mantidas com user_id NULL', (await count('where user_id is null')) === bobBefore, `(${bobBefore})`)

console.log('— RLS e privilégios')
await db.exec(`insert into auth.users values ('${BOB}','b@x','{}'); update public.profiles set phone='15988880002' where id='${BOB}'`)
await db.exec(ins(3,2,BOB,D,'10:00','11:00',{sport:"'futevolei'"}))
async function as(role, uid, sql) { await db.exec(`reset role; select set_config('request.jwt.sub', '${uid ?? ''}', false); set role ${role};`); try { return await db.query(sql) } finally { await db.exec('reset role') } }
const total = await count(), aliceOwn = await count(`where user_id='${ALICE}'`), arena1 = await count('where arena_id=1'), arena2 = await count('where arena_id=2')
try { await as('anon', null, 'select * from public.reservations'); ok('anon não lê reservas', false) } catch (e) { ok('anon não lê reservas', e.message.includes('permission denied'), '-> ' + e.message) }
ok('cliente lê só as próprias', (await as('authenticated', ALICE, 'select * from public.reservations')).rows.length === aliceOwn, `(${aliceOwn})`)
const mgrRows = (await as('authenticated', MGR, 'select arena_id from public.reservations')).rows
ok('gestor 1 lê só as da arena 1', mgrRows.length === arena1 && mgrRows.every(r => Number(r.arena_id) === 1), `(${mgrRows.length})`)
const mgr2Rows = (await as('authenticated', MGR2, 'select arena_id from public.reservations')).rows
ok('gestor 2 lê só as da arena 2', mgr2Rows.length === arena2 && mgr2Rows.every(r => Number(r.arena_id) === 2), `(${mgr2Rows.length})`)
ok('admin lê todas', (await as('authenticated', ADMIN, 'select * from public.reservations')).rows.length === total, `(${total})`)
ok('gestor NÃO lê perfil de cliente da própria arena', (await as('authenticated', MGR, `select * from public.profiles where id in ('${ALICE}','${BOB}','${CAROL}')`)).rows.length === 0)
ok('gestor lê só o próprio perfil', (await as('authenticated', MGR, 'select id from public.profiles')).rows.every(r => r.id === MGR))
try { await as('anon', null, 'select * from public.profiles'); ok('anon não lê perfis', false) } catch (e) { ok('anon não lê perfis', true, '-> ' + e.message) }
for (const [label, sql] of [['insert', ins(1,1,ALICE,'2027-12-01','10:00','11:00')], ['update (cancelar)', `update public.reservations set status='cancelled', cancelled_by='${ALICE}' where user_id='${ALICE}'`], ['delete', `delete from public.reservations where user_id='${ALICE}'`]]) {
  for (const who of [['cliente', ALICE], ['gestor', MGR], ['admin', ADMIN]]) {
    try { await as('authenticated', who[1], sql); ok(`Data API sem ${label} (${who[0]})`, false) } catch (e) { ok(`Data API sem ${label} (${who[0]})`, e.message.includes('permission denied')) }
  }
}

console.log('— consulta de contato (modelo para o backend: JOIN restrito à arena gerenciada)')
const contacts = await db.query(`select r.id, p.full_name, p.phone from public.reservations r
  join public.arena_managers m on m.arena_id = r.arena_id and m.user_id = $1
  left join public.profiles p on p.id = r.user_id where r.arena_id = $2`, [MGR, 1])
ok('gestor da arena 1 obtém nome e telefone', contacts.rows.length === arena1 && contacts.rows.some(r => r.phone), `(${contacts.rows.length})`)
const denied = await db.query(`select r.id from public.reservations r
  join public.arena_managers m on m.arena_id = r.arena_id and m.user_id = $1 where r.arena_id = $2`, [MGR, 2])
ok('mesma consulta para arena não gerenciada: 0 linhas', denied.rows.length === 0)

console.log('— ajustes finais: idempotência, sequência, limite de valor')
try { await db.exec(readFileSync(`${dir}/20261028000100_reservations.sql`, 'utf8')); ok('migração de reservas pode ser reexecutada (idempotente)', true) }
catch (e) { ok('migração de reservas pode ser reexecutada (idempotente)', false, e.message) }
ok('  -> courts_id_arena_id_key existe uma única vez', (await db.query(`select count(*)::int c from pg_constraint where conname='courts_id_arena_id_key' and conrelid='public.courts'::regclass`)).rows[0].c === 1)
ok('  -> dados preservados após reexecução', (await count()) > 0)
const seqPriv = (await db.query(`select has_sequence_privilege('anon', 'public.reservations_id_seq', 'USAGE') a_u,
  has_sequence_privilege('authenticated', 'public.reservations_id_seq', 'USAGE') u_u,
  has_sequence_privilege('authenticated', 'public.reservations_id_seq', 'UPDATE') u_up,
  has_sequence_privilege('authenticated', 'public.courts_id_seq', 'USAGE') courts_u`)).rows[0]
ok('sequência de reservas sem privilégios para anon/authenticated', !seqPriv.a_u && !seqPriv.u_u && !seqPriv.u_up)
ok('  -> controle: privilégio padrão simulado existe em outras sequências', seqPriv.courts_u === true)
await expectOk('backend (dono) continua inserindo após o revoke', ins(2,1,ALICE,'2027-05-05','10:00','11:00'))
await db.exec(`update public.courts set hourly_rate = 99999999.99 where id = 2`)
await expectError('valor/hora no limite × 8 h estoura numeric(10,2) e nada é gravado', ins(2,1,ALICE,'2027-05-06','06:00','14:00'), '22003')
await db.exec(`update public.courts set hourly_rate = 12499999.99 where id = 2`)
await expectOk('valor/hora 12.499.999,99 × 8 h cabe', ins(2,1,ALICE,'2027-05-07','06:00','14:00'))
console.log('falhas:', fails)
