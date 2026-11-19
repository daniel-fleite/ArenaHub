import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { Alert, ErrorState, FieldError, LoadingBlock } from "@/components/common"
import { FormField, describedBy } from "@/components/forms"
import { useAsync } from "@/hooks/useAsync"
import {
  COURT_STATUSES,
  courtStatusLabel,
  courtToForm,
  courtsPageState,
  emptyCourtForm,
  filterCourts,
  resolveSelectedArena,
  toCourtPayload,
  validateCourtForm,
  type CourtForm,
  type CourtFormErrors,
} from "@/lib/courts"
import { formatCurrency } from "@/lib/format"
import { createCourt, deleteCourt, listManagedArenas, updateCourt } from "@/services/courts"
import { describeError } from "@/services/http"
import type { ManagedCourt, ManagedCourtStatus } from "@/types"
import { sportOptions, type SportId } from "../data/courts"
import {
  Button,
  CheckOption,
  EmptyState,
  FieldLabel,
  Modal,
  PageHeader,
  Select,
  SectionTitle,
  SportBadge,
  TextInput,
} from "../components/ui"

type Editor = { mode: "create" } | { mode: "edit"; court: ManagedCourt }

export default function Quadras() {
  const navigate = useNavigate()
  const result = useAsync((signal) => listManagedArenas(signal), [])
  const arenas = result.data
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [sport, setSport] = useState<"all" | SportId>("all")
  const [status, setStatus] = useState<"all" | ManagedCourtStatus>("all")
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [editor, setEditor] = useState<Editor | null>(null)
  const [form, setForm] = useState<CourtForm>(emptyCourtForm)
  const [errors, setErrors] = useState<CourtFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [toDelete, setToDelete] = useState<ManagedCourt | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // A arena exibida é sempre uma das devolvidas pela API.
  const arenaId = resolveSelectedArena(arenas ?? [], selectedId)
  const arena = arenas?.find((item) => item.id === arenaId) ?? null
  const pageState = courtsPageState({ loading: result.loading, error: result.error, arenas })

  useEffect(() => {
    if (arenaId !== selectedId) setSelectedId(arenaId)
  }, [arenaId, selectedId])

  const hasFilters = Boolean(query || sport !== "all" || status !== "all")
  const filteredCourts = useMemo(
    () => (arena ? filterCourts(arena.courts, { query, sport, status }) : []),
    [arena, query, sport, status],
  )

  const clearFilters = () => {
    setQuery("")
    setSport("all")
    setStatus("all")
  }

  const openEditor = (next: Editor) => {
    setEditor(next)
    setForm(next.mode === "edit" ? courtToForm(next.court) : emptyCourtForm)
    setErrors({})
    setSaveError(null)
  }
  const closeEditor = () => !saving && setEditor(null)
  const set = <K extends keyof CourtForm>(key: K, value: CourtForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const toggleSport = (id: SportId, checked: boolean) =>
    set("sports", checked ? [...form.sports, id] : form.sports.filter((item) => item !== id))

  const save = async () => {
    if (!arena || !editor) return
    const found = validateCourtForm(form)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload = toCourtPayload(form)
      const saved =
        editor.mode === "edit"
          ? await updateCourt(arena.id, editor.court.id, payload)
          : await createCourt(arena.id, payload)
      setEditor(null)
      setNotice(editor.mode === "edit" ? `Quadra “${saved.name}” atualizada.` : `Quadra “${saved.name}” cadastrada.`)
      result.reload()
    } catch (error) {
      setSaveError(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!arena || !toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCourt(arena.id, toDelete.id)
      setNotice(`Quadra “${toDelete.name}” excluída.`)
      setToDelete(null)
      result.reload()
    } catch (error) {
      setDeleteError(describeError(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Quadras"
        description="Organize suas arenas, quadras e modalidades em um só lugar."
        action={
          <div className="page-header-actions">
            <Button variant="secondary" icon="plus" onClick={() => setShowCreate(true)}>
              Cadastrar arena
            </Button>
            <Button icon="plus" onClick={() => openEditor({ mode: "create" })} disabled={!arena}>
              Cadastrar quadra
            </Button>
          </div>
        }
      />

      {notice && (
        <Alert tone="success" title="Alteração salva pelo servidor">
          {notice}
        </Alert>
      )}

      {pageState === "loading" && <LoadingBlock label="Carregando suas arenas e quadras…" />}

      {pageState === "error" && (
        <ErrorState
          title="Não foi possível carregar suas quadras"
          message={describeError(result.error)}
          onRetry={result.reload}
        />
      )}

      {pageState === "no-arenas" && (
        <EmptyState
          icon="arena"
          title="Nenhuma arena vinculada à sua conta"
          description="Quadras só podem ser gerenciadas em arenas aprovadas para você. Solicite o cadastro de uma arena e aguarde a análise."
          action={
            <Button icon="plus" onClick={() => navigate("/arenas/solicitar")}>
              Solicitar cadastro de arena
            </Button>
          }
        />
      )}

      {pageState === "ready" && arena && (
        <>
          <section className="toolbar toolbar-wrap" aria-label="Filtros de quadras">
            {arenas && arenas.length > 1 && (
              <Select
                value={arena.id}
                onChange={(event) => setSelectedId(event.target.value)}
                aria-label="Selecionar arena"
              >
                {arenas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
            <TextInput
              icon="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome da quadra"
              aria-label="Buscar por nome da quadra"
              className="toolbar-search"
            />
            <Select
              value={sport}
              onChange={(event) => setSport(event.target.value as "all" | SportId)}
              aria-label="Filtrar por modalidade"
            >
              <option value="all">Todas as modalidades</option>
              {sportOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | ManagedCourtStatus)}
              aria-label="Filtrar por situação"
            >
              <option value="all">Todas as situações</option>
              <option value="ativa">Ativas</option>
              <option value="manutencao">Em manutenção</option>
              <option value="inativa">Inativas</option>
            </Select>
          </section>

          <article className="arena-panel" aria-busy={result.loading}>
            <header className="arena-panel-header">
              <div>
                <SectionTitle>{arena.name}</SectionTitle>
                <p>
                  {arena.city}/{arena.state}
                </p>
              </div>
              <span className="record-count">
                {arena.courts.length} {arena.courts.length === 1 ? "quadra" : "quadras"}
              </span>
            </header>

            {filteredCourts.length === 0 ? (
              <EmptyState
                icon="arena"
                title={hasFilters ? "Nenhuma quadra encontrada" : "Nenhuma quadra cadastrada"}
                description={
                  hasFilters
                    ? "Não encontramos quadras com os filtros selecionados."
                    : "Cadastre a primeira quadra desta arena para começar a organizar modalidades e reservas."
                }
                action={
                  hasFilters ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  ) : (
                    <Button icon="plus" onClick={() => openEditor({ mode: "create" })}>
                      Cadastrar primeira quadra
                    </Button>
                  )
                }
              />
            ) : (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Quadra</th>
                      <th>Modalidades</th>
                      <th>Situação</th>
                      <th>Capacidade</th>
                      <th>Valor/hora</th>
                      <th>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourts.map((court) => (
                      <tr key={court.id}>
                        <td data-label="Quadra">
                          <strong>{court.name}</strong>
                        </td>
                        <td data-label="Modalidades">
                          <div className="badge-list">
                            {court.sports.map((item) => (
                              <SportBadge key={item} sport={item} />
                            ))}
                          </div>
                        </td>
                        <td data-label="Situação">
                          <span className={`status-badge status-${court.status}`}>
                            {courtStatusLabel[court.status]}
                          </span>
                        </td>
                        <td data-label="Capacidade">
                          {court.capacity ? `${court.capacity} pessoas` : "Não informada"}
                        </td>
                        <td data-label="Valor/hora">
                          {court.hourlyRate != null ? formatCurrency(court.hourlyRate) : "Não informado"}
                        </td>
                        <td data-label="Ações">
                          <div className="row-actions">
                            <Button variant="secondary" onClick={() => openEditor({ mode: "edit", court })}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setDeleteError(null)
                                setToDelete(court)
                              }}
                            >
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      )}

      <Modal
        open={editor !== null}
        onClose={closeEditor}
        title={editor?.mode === "edit" ? "Editar quadra" : "Cadastrar quadra"}
        description={arena ? `Arena: ${arena.name}` : undefined}
      >
        <div className="form-grid">
          <FormField id="court-name" label="Nome da quadra" error={errors.name} className="field-span">
            <TextInput
              id="court-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Ex.: Quadra 1"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy("court-name", errors.name)}
            />
          </FormField>
          <div className="field-group field-span">
            <FieldLabel>Modalidades</FieldLabel>
            <div className="option-grid">
              {sportOptions.map((option) => (
                <CheckOption
                  key={option.id}
                  title={option.label}
                  description={option.group}
                  checked={form.sports.includes(option.id)}
                  onChange={(checked) => toggleSport(option.id, checked)}
                />
              ))}
            </div>
            <FieldError message={errors.sports} />
          </div>
          <FormField id="court-status" label="Situação" error={errors.status}>
            <Select
              id="court-status"
              value={form.status}
              onChange={(event) => set("status", event.target.value as ManagedCourtStatus)}
            >
              {COURT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {courtStatusLabel[item]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="court-capacity" label="Capacidade (opcional)" error={errors.capacity}>
            <TextInput
              id="court-capacity"
              inputMode="numeric"
              value={form.capacity}
              onChange={(event) => set("capacity", event.target.value)}
              placeholder="Ex.: 14"
              aria-invalid={Boolean(errors.capacity)}
              aria-describedby={describedBy("court-capacity", errors.capacity)}
            />
          </FormField>
          <FormField id="court-rate" label="Valor por hora em R$ (opcional)" error={errors.hourlyRate}>
            <TextInput
              id="court-rate"
              inputMode="decimal"
              value={form.hourlyRate}
              onChange={(event) => set("hourlyRate", event.target.value)}
              placeholder="Ex.: 120,00"
              aria-invalid={Boolean(errors.hourlyRate)}
              aria-describedby={describedBy("court-rate", errors.hourlyRate)}
            />
          </FormField>
        </div>
        {saveError && (
          <Alert tone="error" title="Quadra não salva">
            {saveError}
          </Alert>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={closeEditor} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} aria-busy={saving}>
            {saving ? "Salvando…" : "Salvar quadra"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir quadra"
        description={
          toDelete
            ? `Excluir “${toDelete.name}” de ${arena?.name ?? "sua arena"}? Esta ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir quadra"
        busy={deleting}
        error={deleteError}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Cadastrar arena"
        description="Defina os dados básicos. As quadras poderão ser adicionadas depois."
      >
        <div className="form-grid">
          <div className="field-group field-span">
            <FieldLabel>Nome da arena</FieldLabel>
            <TextInput placeholder="Nome da arena" />
          </div>
          <div className="field-group field-span">
            <FieldLabel>Endereço</FieldLabel>
            <TextInput placeholder="Endereço (opcional)" />
          </div>
          <div className="field-group field-span">
            <FieldLabel>Modalidades oferecidas</FieldLabel>
            <div className="option-grid">
              {sportOptions.map((option) => (
                <CheckOption
                  key={option.id}
                  title={option.label}
                  description={option.group}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="integration-note">
          O salvamento será habilitado quando a fonte de dados estiver
          conectada.
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>
            Cancelar
          </Button>
          <Button disabled>Salvar arena</Button>
        </div>
      </Modal>
    </div>
  )
}
