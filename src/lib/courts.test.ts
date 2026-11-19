// Estados e fluxos da tela de Quadras (lógica pura). Rodar com: pnpm test
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { ManagedArena, ManagedCourt } from "../types/index.ts"
import {
  courtToForm,
  courtsPageState,
  emptyCourtForm,
  filterCourts,
  resolveSelectedArena,
  toCourtPayload,
  validateCourtForm,
} from "./courts.ts"

const court = (patch: Partial<ManagedCourt> = {}): ManagedCourt => ({
  id: "10",
  arenaId: "1",
  name: "Quadra 1",
  sports: ["society"],
  status: "ativa",
  capacity: 14,
  hourlyRate: 150,
  createdAt: "2026-10-27T00:00:00.000Z",
  updatedAt: "2026-10-27T00:00:00.000Z",
  ...patch,
})
const arena = (id: string, courts: ManagedCourt[] = []): ManagedArena => ({
  id,
  name: `Arena ${id}`,
  city: "Sorocaba",
  state: "SP",
  courts,
})

describe("estado da página", () => {
  test("carregando enquanto não há dados", () => {
    assert.equal(courtsPageState({ loading: true, error: null, arenas: null }), "loading")
  })
  test("erro da API tem prioridade", () => {
    assert.equal(courtsPageState({ loading: false, error: new Error("x"), arenas: null }), "error")
  })
  test("sem arenas vinculadas", () => {
    assert.equal(courtsPageState({ loading: false, error: null, arenas: [] }), "no-arenas")
  })
  test("pronto com arenas; recarregar não volta ao estado de carregamento", () => {
    assert.equal(courtsPageState({ loading: false, error: null, arenas: [arena("1")] }), "ready")
    assert.equal(courtsPageState({ loading: true, error: null, arenas: [arena("1")] }), "ready")
  })
})

describe("seleção de arena", () => {
  const arenas = [arena("1"), arena("2")]
  test("mantém a arena escolhida quando a API a devolveu", () => {
    assert.equal(resolveSelectedArena(arenas, "2"), "2")
  })
  test("ignora arena que a API não devolveu", () => {
    assert.equal(resolveSelectedArena(arenas, "99"), "1")
  })
  test("primeira arena por padrão; nenhuma sem arenas", () => {
    assert.equal(resolveSelectedArena(arenas, null), "1")
    assert.equal(resolveSelectedArena([], "1"), null)
  })
})

describe("filtros", () => {
  const courts = [
    court({ id: "1", name: "Quadra Society", sports: ["society"], status: "ativa" }),
    court({ id: "2", name: "Areia", sports: ["futevolei", "beach-tennis"], status: "manutencao" }),
    court({ id: "3", name: "Futsal Coberta", sports: ["futsal"], status: "inativa" }),
  ]
  test("sem filtros retorna todas", () => {
    assert.equal(filterCourts(courts, { query: "", sport: "all", status: "all" }).length, 3)
  })
  test("busca por nome sem diferenciar maiúsculas", () => {
    assert.deepEqual(filterCourts(courts, { query: "  areia ", sport: "all", status: "all" }).map((c) => c.id), ["2"])
  })
  test("modalidade e situação combinadas", () => {
    assert.deepEqual(filterCourts(courts, { query: "", sport: "beach-tennis", status: "manutencao" }).map((c) => c.id), ["2"])
    assert.equal(filterCourts(courts, { query: "", sport: "futsal", status: "ativa" }).length, 0)
  })
})

describe("formulário de quadra", () => {
  const valid = { ...emptyCourtForm, name: "Quadra Nova", sports: ["society" as const] }

  test("formulário vazio aponta nome e modalidade", () => {
    const errors = validateCourtForm(emptyCourtForm)
    assert.ok(errors.name)
    assert.ok(errors.sports)
  })
  test("campos opcionais vazios viram null no corpo enviado", () => {
    assert.deepEqual(validateCourtForm(valid), {})
    assert.deepEqual(toCourtPayload(valid), {
      name: "Quadra Nova",
      sports: ["society"],
      status: "ativa",
      capacity: null,
      hourlyRate: null,
    })
  })
  test("corpo enviado tem exatamente os campos aceitos pelo backend", () => {
    assert.deepEqual(Object.keys(toCourtPayload(valid)).sort(), ["capacity", "hourlyRate", "name", "sports", "status"])
  })
  test("valor com vírgula ou ponto vira número", () => {
    assert.equal(toCourtPayload({ ...valid, hourlyRate: "120,50" }).hourlyRate, 120.5)
    assert.equal(toCourtPayload({ ...valid, hourlyRate: "120.5" }).hourlyRate, 120.5)
    assert.equal(toCourtPayload({ ...valid, hourlyRate: "80" }).hourlyRate, 80)
  })
  test("capacidade e valor inválidos são apontados antes do envio", () => {
    for (const capacity of ["0", "201", "2,5", "dez"]) assert.ok(validateCourtForm({ ...valid, capacity }).capacity, capacity)
    for (const hourlyRate of ["-1", "10,555", "1.200,00", "abc"]) assert.ok(validateCourtForm({ ...valid, hourlyRate }).hourlyRate, hourlyRate)
    assert.deepEqual(validateCourtForm({ ...valid, capacity: "200", hourlyRate: "0" }), {})
  })
  test("nome é aparado e modalidades repetidas são removidas", () => {
    const payload = toCourtPayload({ ...valid, name: "  Quadra 2  ", sports: ["futsal", "futsal"] })
    assert.equal(payload.name, "Quadra 2")
    assert.deepEqual(payload.sports, ["futsal"])
  })
  test("edição preenche o formulário e ida e volta preserva os dados", () => {
    const original = court({ name: "Q", sports: ["futsal", "society"], status: "manutencao", capacity: 10, hourlyRate: 99.9 })
    const form = courtToForm(original)
    assert.equal(form.hourlyRate, "99,9")
    assert.deepEqual(toCourtPayload(form), {
      name: "Q",
      sports: ["futsal", "society"],
      status: "manutencao",
      capacity: 10,
      hourlyRate: 99.9,
    })
  })
  test("edição de quadra sem capacidade e valor deixa os campos vazios", () => {
    const form = courtToForm(court({ capacity: undefined, hourlyRate: undefined }))
    assert.equal(form.capacity, "")
    assert.equal(form.hourlyRate, "")
  })
})
