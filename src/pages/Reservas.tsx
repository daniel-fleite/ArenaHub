import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { ArenaSelect, ManagerArenaGate } from "@/components/ManagerArenaGate"
import { Alert, ErrorState, LoadingBlock } from "@/components/common"
import { useAsync } from "@/hooks/useAsync"
import { useManagedArena } from "@/hooks/useManagedArena"
import { formatCurrency, todayISO } from "@/lib/format"
import { describeError } from "@/services/http"
import { cancelArenaReservation, listArenaReservations } from "@/services/manager"
import type { ManagedArena, ManagerReservation } from "@/types"
import { getSportLabel, sportOptions, timeSlots, type SportId } from "../data/courts"
import { Button, EmptyState, PageHeader, Segmented, Select, TextInput, Textarea, FieldLabel } from "../components/ui"

type View = "lista" | "agenda"

const statusLabel: Record<ManagerReservation["status"], string> = {
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluída",
}
const formatDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR")

export default function Reservas() {
  const state = useManagedArena()
  const navigate = useNavigate()
  return (
    <div className="page">
      <PageHeader
        title="Reservas"
        description="Consulte a agenda e administre os horários das suas quadras."
        action={
          state.arena ? (
            <Button icon="plus" onClick={() => navigate(`/reservar/${encodeURIComponent(state.arena!.id)}`)}>
              Nova reserva
            </Button>
          ) : undefined
        }
      />
      <ManagerArenaGate state={state}>{(arena) => <ReservationsBody arena={arena} arenaPicker={<ArenaSelect state={state} />} />}</ManagerArenaGate>
    </div>
  )
}

function ReservationsBody({ arena, arenaPicker }: { arena: ManagedArena; arenaPicker: React.ReactNode }) {
  const [view, setView] = useState<View>("lista")
  const [courtFilter, setCourtFilter] = useState("all")
  const [sportFilter, setSportFilter] = useState<"all" | SportId>("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [period, setPeriod] = useState("")
  const [agendaDate, setAgendaDate] = useState(todayISO())
  const [toCancel, setToCancel] = useState<ManagerReservation | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const result = useAsync((signal) => listArenaReservations(arena.id, {}, signal), [arena.id])
  const reservations = result.data ?? []

  const filtered = reservations.filter((r) => {
    if (courtFilter !== "all" && r.courtId !== courtFilter) return false
    if (sportFilter !== "all" && r.sport !== sportFilter) return false
    if (statusFilter !== "all" && r.status !== statusFilter) return false
    if (period && r.date !== period) return false
    return true
  })
  // Lista: confirmadas (próximas) primeiro, em ordem cronológica; depois o histórico mais recente.
  const sorted = [...filtered].sort((a, b) => {
    const af = a.status === "confirmada", bf = b.status === "confirmada"
    if (af !== bf) return af ? -1 : 1
    const key = (r: ManagerReservation) => `${r.date}${r.time}`
    return af ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))
  })
  const hasFilters = courtFilter !== "all" || sportFilter !== "all" || statusFilter !== "all" || Boolean(period)
  const clearFilters = () => {
    setCourtFilter("all")
    setSportFilter("all")
    setStatusFilter("all")
    setPeriod("")
  }

  const agenda = useMemo(() => {
    const busyMap = new Map<string, ManagerReservation>()
    for (const r of reservations) {
      if (r.date !== agendaDate || r.status === "cancelada") continue
      const start = Number(r.time.slice(0, 2))
      for (let h = start; h < start + r.duration; h++) busyMap.set(`${r.courtId}@${h}`, r)
    }
    return busyMap
  }, [reservations, agendaDate])

  const confirmCancel = async () => {
    if (!toCancel) return
    setBusy(true)
    setCancelError(null)
    try {
      await cancelArenaReservation(arena.id, toCancel.id, reason.trim() || null)
      setNotice(`Reserva de ${toCancel.customer.name || "cliente"} em ${formatDay(toCancel.date)} às ${toCancel.time} cancelada.`)
      setToCancel(null)
      result.reload()
    } catch (error) {
      setCancelError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="view-row">
        <Segmented
          label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: "lista", label: "Lista" },
            { value: "agenda", label: "Agenda do dia" },
          ]}
        />
      </div>

      {notice && (
        <Alert tone="success" title="Alteração salva pelo servidor">
          {notice}
        </Alert>
      )}

      <section className="toolbar toolbar-wrap" aria-label="Filtros de reservas">
        {arenaPicker}
        {view === "lista" ? (
          <>
            <Select value={courtFilter} onChange={(e) => setCourtFilter(e.target.value)} aria-label="Filtrar por quadra">
              <option value="all">Todas as quadras</option>
              {arena.courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </Select>
            <Select value={sportFilter} onChange={(e) => setSportFilter(e.target.value as "all" | SportId)} aria-label="Filtrar por modalidade">
              <option value="all">Todas as modalidades</option>
              {sportOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por status">
              <option value="all">Todos os status</option>
              <option value="confirmada">Confirmadas</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </Select>
            <TextInput type="date" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Filtrar por data" />
          </>
        ) : (
          <TextInput type="date" value={agendaDate} onChange={(e) => setAgendaDate(e.target.value || todayISO())} aria-label="Data da agenda" />
        )}
      </section>

      {result.loading && !result.data ? (
        <LoadingBlock label="Carregando reservas…" />
      ) : result.error ? (
        <ErrorState title="Não foi possível carregar as reservas" message={describeError(result.error)} onRetry={result.reload} />
      ) : view === "lista" ? (
        sorted.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={hasFilters ? "Nenhuma reserva encontrada" : "Nenhuma reserva registrada"}
            description={
              hasFilters
                ? "Não encontramos reservas com os filtros selecionados."
                : "As reservas feitas pelos clientes nesta arena aparecerão aqui."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="responsive-table panel">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Quadra</th>
                  <th>Modalidade</th>
                  <th>Data e horário</th>
                  <th>Duração</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Cliente">
                      <strong>{r.customer.name || "Cliente"}</strong>
                      <small>{r.customer.phone ?? "Telefone não informado"}</small>
                    </td>
                    <td data-label="Quadra">{r.courtName}</td>
                    <td data-label="Modalidade">{getSportLabel(r.sport)}</td>
                    <td data-label="Data e horário">
                      {formatDay(r.date)} · {r.time}–{r.endTime}
                    </td>
                    <td data-label="Duração">{r.duration}h</td>
                    <td data-label="Valor">{formatCurrency(r.total)}</td>
                    <td data-label="Status">
                      <span className={`status-badge status-${r.status}`}>{statusLabel[r.status]}</span>
                    </td>
                    <td data-label="Ações">
                      {r.canCancel ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setReason("")
                            setCancelError(null)
                            setToCancel(r)
                          }}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : arena.courts.length === 0 ? (
        <EmptyState icon="arena" title="Nenhuma quadra cadastrada" description="Cadastre quadras para ver a agenda." />
      ) : (
        <div className="responsive-table panel schedule">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                {arena.courts.map((court) => (
                  <th key={court.id}>{court.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((time) => {
                const hour = Number(time.slice(0, 2))
                return (
                  <tr key={time}>
                    <td data-label="Horário">{time}</td>
                    {arena.courts.map((court) => {
                      const booked = agenda.get(`${court.id}@${hour}`)
                      return (
                        <td data-label={court.name} key={court.id} className={booked ? "slot-booked" : "slot-free"}>
                          {booked ? (
                            <>
                              <strong>{booked.customer.name || "Reservado"}</strong>
                              <small>{getSportLabel(booked.sport)}</small>
                            </>
                          ) : court.status !== "ativa" ? (
                            "Indisponível"
                          ) : (
                            "Disponível"
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar reserva"
        description={
          toCancel
            ? `Cancelar a reserva de ${toCancel.customer.name || "cliente"} em ${formatDay(toCancel.date)}, ${toCancel.time}–${toCancel.endTime}? O horário será liberado.`
            : undefined
        }
        confirmLabel="Cancelar reserva"
        busy={busy}
        error={cancelError}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
      >
        <div className="field-group">
          <FieldLabel htmlFor="cancel-reason">Motivo (opcional)</FieldLabel>
          <Textarea id="cancel-reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
      </ConfirmDialog>
    </>
  )
}
