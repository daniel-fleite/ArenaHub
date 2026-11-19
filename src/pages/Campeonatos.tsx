import { useState } from "react"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { ArenaSelect, ManagerArenaGate } from "@/components/ManagerArenaGate"
import { Alert, ErrorState, LoadingBlock } from "@/components/common"
import { FormField } from "@/components/forms"
import { useAsync } from "@/hooks/useAsync"
import { useManagedArena } from "@/hooks/useManagedArena"
import { formatCurrency } from "@/lib/format"
import { describeError } from "@/services/http"
import { addTeam, deleteChampionship, listChampionships, removeTeam, saveChampionship } from "@/services/manager"
import type { Championship, ChampionshipFormat, ChampionshipStatus, ManagedArena } from "@/types"
import { getSportLabel, sportOptions, type SportId } from "../data/courts"
import { Button, EmptyState, Modal, PageHeader, SectionTitle, Select, TextInput, Textarea } from "../components/ui"

const formatLabel: Record<ChampionshipFormat, string> = {
  "mata-mata": "Mata-mata",
  "grupos-mata-mata": "Fase de grupos e mata-mata",
  "pontos-corridos": "Pontos corridos",
}
const statusLabel: Record<ChampionshipStatus, string> = {
  inscricoes: "Inscrições abertas",
  andamento: "Em andamento",
  concluido: "Concluído",
}
const statusClass: Record<ChampionshipStatus, string> = { inscricoes: "confirmada", andamento: "manutencao", concluido: "concluida" }
const formatDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR")

interface Form {
  name: string
  sport: SportId | ""
  format: ChampionshipFormat | ""
  startsOn: string
  endsOn: string
  maxTeams: string
  entryFee: string
  status: ChampionshipStatus
  description: string
}
const emptyForm: Form = { name: "", sport: "", format: "", startsOn: "", endsOn: "", maxTeams: "8", entryFee: "", status: "inscricoes", description: "" }

export default function Campeonatos() {
  const state = useManagedArena()
  return (
    <div className="page">
      <PageHeader title="Campeonatos" description="Organize competições, inscrições e equipes por modalidade." />
      <ManagerArenaGate state={state}>{(arena) => <ChampionshipsBody key={arena.id} arena={arena} picker={<ArenaSelect state={state} />} />}</ManagerArenaGate>
    </div>
  )
}

function ChampionshipsBody({ arena, picker }: { arena: ManagedArena; picker: React.ReactNode }) {
  const result = useAsync((signal) => listChampionships(arena.id, signal), [arena.id])
  const [sport, setSport] = useState("all")
  const [status, setStatus] = useState("all")
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Championship | "new" | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Championship | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [teamDraft, setTeamDraft] = useState<Record<string, string>>({})
  const [teamError, setTeamError] = useState<Record<string, string | undefined>>({})

  const list = (result.data ?? []).filter(
    (c) => (sport === "all" || c.sport === sport) && (status === "all" || c.status === status),
  )
  const hasFilters = sport !== "all" || status !== "all"

  const open = (c: Championship | "new") => {
    setEditing(c)
    setFormError(null)
    setForm(
      c === "new"
        ? emptyForm
        : {
            name: c.name,
            sport: c.sport,
            format: c.format,
            startsOn: c.startsOn,
            endsOn: c.endsOn ?? "",
            maxTeams: String(c.maxTeams),
            entryFee: c.entryFee != null ? String(c.entryFee).replace(".", ",") : "",
            status: c.status,
            description: c.description ?? "",
          },
    )
  }

  const save = async () => {
    if (!editing) return
    const maxTeams = Number(form.maxTeams)
    const fee = form.entryFee.trim() ? Number(form.entryFee.trim().replace(",", ".")) : null
    if (form.name.trim().length < 3) return setFormError("Informe o nome do campeonato.")
    if (!form.sport || !form.format) return setFormError("Selecione modalidade e formato.")
    if (!form.startsOn) return setFormError("Informe a data de início.")
    if (!Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 64) return setFormError("O limite de equipes deve ser de 2 a 64.")
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return setFormError("Taxa de inscrição inválida.")
    setSaving(true)
    setFormError(null)
    try {
      const saved = await saveChampionship(
        arena.id,
        {
          name: form.name.trim(),
          sport: form.sport,
          format: form.format,
          startsOn: form.startsOn,
          endsOn: form.endsOn || null,
          maxTeams,
          entryFee: fee === null ? null : Math.round(fee * 100) / 100,
          status: form.status,
          description: form.description.trim() || null,
        },
        editing === "new" ? undefined : editing.id,
      )
      setNotice(editing === "new" ? `Campeonato “${saved.name}” criado.` : `Campeonato “${saved.name}” atualizado.`)
      setEditing(null)
      result.reload()
    } catch (error) {
      setFormError(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteChampionship(arena.id, toDelete.id)
      setNotice(`Campeonato “${toDelete.name}” excluído.`)
      setToDelete(null)
      result.reload()
    } catch (error) {
      setDeleteError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const submitTeam = async (c: Championship) => {
    const name = (teamDraft[c.id] ?? "").trim()
    if (name.length < 2) return setTeamError({ ...teamError, [c.id]: "Informe o nome da equipe." })
    try {
      await addTeam(arena.id, c.id, name)
      setTeamDraft({ ...teamDraft, [c.id]: "" })
      setTeamError({ ...teamError, [c.id]: undefined })
      result.reload()
    } catch (error) {
      setTeamError({ ...teamError, [c.id]: describeError(error) })
    }
  }

  const dropTeam = async (c: Championship, teamId: string) => {
    try {
      await removeTeam(arena.id, c.id, teamId)
      result.reload()
    } catch (error) {
      setTeamError({ ...teamError, [c.id]: describeError(error) })
    }
  }

  return (
    <>
      <section className="toolbar toolbar-wrap" aria-label="Filtros de campeonatos">
        {picker}
        <Select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Filtrar por modalidade">
          <option value="all">Todas as modalidades</option>
          {sportOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="all">Todas as situações</option>
          <option value="inscricoes">Inscrições abertas</option>
          <option value="andamento">Em andamento</option>
          <option value="concluido">Concluídos</option>
        </Select>
        <Button icon="plus" onClick={() => open("new")}>
          Novo campeonato
        </Button>
      </section>

      {notice && (
        <Alert tone="success" title="Alteração salva pelo servidor">
          {notice}
        </Alert>
      )}

      {result.loading && !result.data ? (
        <LoadingBlock label="Carregando campeonatos…" />
      ) : result.error ? (
        <ErrorState title="Não foi possível carregar os campeonatos" message={describeError(result.error)} onRetry={result.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="trophy"
          title={hasFilters ? "Nenhum campeonato encontrado" : "Nenhum campeonato cadastrado"}
          description={
            hasFilters
              ? "Não há competições que correspondam aos filtros selecionados."
              : "Crie uma competição para organizar equipes e inscrições."
          }
          action={
            hasFilters ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSport("all")
                  setStatus("all")
                }}
              >
                Limpar filtros
              </Button>
            ) : (
              <Button icon="plus" onClick={() => open("new")}>
                Criar campeonato
              </Button>
            )
          }
        />
      ) : (
        <div className="championship-list">
          {list.map((c) => (
            <article className="arena-panel" key={c.id}>
              <header className="arena-panel-header">
                <div>
                  <SectionTitle>{c.name}</SectionTitle>
                  <p>
                    {getSportLabel(c.sport)} · {formatLabel[c.format]} · {formatDay(c.startsOn)}
                    {c.endsOn ? ` a ${formatDay(c.endsOn)}` : ""}
                    {c.entryFee != null ? ` · Inscrição ${formatCurrency(c.entryFee)}` : ""}
                  </p>
                </div>
                <span className={`status-badge status-${statusClass[c.status]}`}>{statusLabel[c.status]}</span>
              </header>
              <div className="championship-body">
                {c.description && <p className="muted-text">{c.description}</p>}
                <div className="team-header">
                  <strong>
                    Equipes ({c.teams.length}/{c.maxTeams})
                  </strong>
                  <div className="row-actions">
                    <Button variant="secondary" onClick={() => open(c)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDeleteError(null)
                        setToDelete(c)
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
                {c.teams.length > 0 ? (
                  <ul className="team-list">
                    {c.teams.map((t) => (
                      <li key={t.id}>
                        <span>{t.name}</span>
                        {c.status === "inscricoes" && (
                          <button type="button" aria-label={`Remover ${t.name}`} onClick={() => dropTeam(c, t.id)}>
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">Nenhuma equipe inscrita.</p>
                )}
                {c.status === "inscricoes" && c.teams.length < c.maxTeams && (
                  <form
                    className="team-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitTeam(c)
                    }}
                  >
                    <TextInput
                      value={teamDraft[c.id] ?? ""}
                      onChange={(e) => setTeamDraft({ ...teamDraft, [c.id]: e.target.value })}
                      placeholder="Nome da equipe"
                      aria-label={`Inscrever equipe em ${c.name}`}
                      maxLength={60}
                    />
                    <Button type="submit" variant="secondary" icon="plus">
                      Inscrever
                    </Button>
                  </form>
                )}
                {teamError[c.id] && <p className="field-error" role="alert">{teamError[c.id]}</p>}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "Novo campeonato" : "Editar campeonato"}
        description="Configure as informações essenciais da competição."
      >
        <div className="form-grid">
          <FormField id="champ-name" label="Nome" className="field-span">
            <TextInput id="champ-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do campeonato" />
          </FormField>
          <FormField id="champ-sport" label="Modalidade">
            <Select id="champ-sport" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value as SportId })}>
              <option value="" disabled>
                Selecione
              </option>
              {sportOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="champ-format" label="Formato">
            <Select id="champ-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as ChampionshipFormat })}>
              <option value="" disabled>
                Selecione
              </option>
              {Object.entries(formatLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="champ-start" label="Data de início">
            <TextInput id="champ-start" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
          </FormField>
          <FormField id="champ-end" label="Data de término (opcional)">
            <TextInput id="champ-end" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
          </FormField>
          <FormField id="champ-teams" label="Limite de equipes">
            <TextInput id="champ-teams" inputMode="numeric" value={form.maxTeams} onChange={(e) => setForm({ ...form, maxTeams: e.target.value })} />
          </FormField>
          <FormField id="champ-fee" label="Taxa de inscrição (opcional)">
            <TextInput id="champ-fee" inputMode="decimal" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: e.target.value })} placeholder="R$ 0,00" />
          </FormField>
          <FormField id="champ-status" label="Situação">
            <Select id="champ-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ChampionshipStatus })}>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="champ-description" label="Descrição (opcional)" className="field-span">
            <Textarea id="champ-description" rows={3} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
        </div>
        {formError && (
          <Alert tone="error" title="Campeonato não salvo">
            {formError}
          </Alert>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} aria-busy={saving}>
            {saving ? "Salvando…" : "Salvar campeonato"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir campeonato"
        description={toDelete ? `Excluir “${toDelete.name}” e as ${toDelete.teams.length} equipe(s) inscrita(s)?` : undefined}
        confirmLabel="Excluir"
        busy={busy}
        error={deleteError}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
