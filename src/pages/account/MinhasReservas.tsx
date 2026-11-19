import { useState } from "react"
import { Link } from "react-router-dom"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { Alert, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { Button, EmptyState, PageHeader, Segmented } from "@/components/ui"
import { getSportLabel } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { formatCurrency, formatDate, todayISO } from "@/lib/format"
import { describeError } from "@/services/http"
import { cancelMyReservation, listMyReservations } from "@/services/bookings"
import type { Reservation } from "@/types"

type Tab = "proximas" | "historico"

export default function MinhasReservas() {
  const [tab, setTab] = useState<Tab>("proximas")
  const result = useAsync((signal) => listMyReservations(signal), [])
  const today = todayISO()
  const [toCancel, setToCancel] = useState<Reservation | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const confirmCancel = async () => {
    if (!toCancel) return
    setBusy(true)
    setCancelError(null)
    try {
      await cancelMyReservation(toCancel.id, null)
      setNotice(`Reserva em ${toCancel.arenaName} (${formatDate(toCancel.date)} às ${toCancel.time}) cancelada.`)
      setToCancel(null)
      result.reload()
    } catch (error) {
      setCancelError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const all = result.data?.data ?? []
  const upcoming = all
    .filter((item) => (item.status === "pendente" || item.status === "confirmada") && item.date >= today)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  const history = all
    .filter((item) => !upcoming.includes(item))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
  const list = tab === "proximas" ? upcoming : history

  return (
    <div className="page-public">
      <PageHeader
        title="Minhas reservas"
        description="Acompanhe o status dos seus pedidos e consulte o histórico."
        action={
          <Link className="button button-primary" to="/arenas">
            Nova reserva
          </Link>
        }
      />
      <div className="view-row">
        <Segmented
          label="Período das reservas"
          value={tab}
          onChange={setTab}
          options={[
            { value: "proximas", label: `Próximas (${upcoming.length})` },
            { value: "historico", label: `Histórico (${history.length})` },
          ]}
        />
      </div>
      <SourceNotice source={result.data?.source} />
      {notice && (
        <Alert tone="success" title="Reserva cancelada">
          {notice}
        </Alert>
      )}

      {result.loading ? (
        <LoadingBlock label="Carregando reservas…" />
      ) : result.error ? (
        <ErrorState
          title="Não foi possível carregar suas reservas"
          message={describeError(result.error)}
          onRetry={result.reload}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={tab === "proximas" ? "Nenhuma reserva futura" : "Nenhuma reserva no histórico"}
          description={
            tab === "proximas"
              ? "Quando você reservar uma quadra, o pedido aparecerá aqui com o status informado pela arena."
              : "Reservas concluídas ou canceladas aparecerão aqui."
          }
          action={
            tab === "proximas" ? (
              <Link className="button button-primary" to="/arenas">
                Explorar arenas
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="responsive-table panel">
          <table>
            <thead>
              <tr>
                <th>Arena / quadra</th>
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
              {list.map((item) => (
                <tr key={item.id}>
                  <td data-label="Arena / quadra">
                    <strong>{item.arenaName}</strong>
                    <small>{item.courtName}</small>
                  </td>
                  <td data-label="Modalidade">{getSportLabel(item.sport)}</td>
                  <td data-label="Data e horário">
                    {formatDate(item.date)} · {item.time}
                    {item.endTime ? `–${item.endTime}` : ""}
                  </td>
                  <td data-label="Duração">{item.duration}h</td>
                  <td data-label="Valor">{formatCurrency(item.total)}</td>
                  <td data-label="Status">
                    <StatusBadge status={item.status} />
                  </td>
                  <td data-label="Ações">
                    {item.canCancel ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setCancelError(null)
                          setToCancel(item)
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
      )}

      <ConfirmDialog
        open={toCancel !== null}
        title="Cancelar reserva"
        description={
          toCancel
            ? `Cancelar a reserva em ${toCancel.arenaName}, ${toCancel.courtName}, ${formatDate(toCancel.date)} às ${toCancel.time}? Só é possível cancelar antes do início.`
            : undefined
        }
        confirmLabel="Cancelar reserva"
        busy={busy}
        error={cancelError}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
      />
    </div>
  )
}
