import { useState } from "react"
import { ArenaSelect, ManagerArenaGate } from "@/components/ManagerArenaGate"
import { ErrorState, LoadingBlock } from "@/components/common"
import { getSportLabel, type SportId } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { useManagedArena } from "@/hooks/useManagedArena"
import { formatCurrency } from "@/lib/format"
import { describeError } from "@/services/http"
import { getDashboard } from "@/services/manager"
import type { ManagedArena, ManagerDashboard } from "@/types"
import { EmptyState, PageHeader, Segmented, SectionTitle } from "../components/ui"

type Period = "7" | "30" | "90"

const percent = (value: number) => `${Math.round(value * 100)}%`
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })

export default function Dashboard() {
  const state = useManagedArena()
  const [period, setPeriod] = useState<Period>("30")

  return (
    <div className="page">
      <PageHeader
        title="Indicadores"
        description="Acompanhe o desempenho da operação com dados reais da sua arena."
      />
      <ManagerArenaGate state={state}>
        {(arena) => (
          <>
            <div className="view-row dashboard-controls">
              <ArenaSelect state={state} />
              <Segmented
                label="Período"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: "7", label: "7 dias" },
                  { value: "30", label: "30 dias" },
                  { value: "90", label: "90 dias" },
                ]}
              />
            </div>
            <DashboardBody arena={arena} days={Number(period)} />
          </>
        )}
      </ManagerArenaGate>
    </div>
  )
}

function DashboardBody({ arena, days }: { arena: ManagedArena; days: number }) {
  const result = useAsync((signal) => getDashboard(arena.id, days, signal), [arena.id, days])
  if (result.loading && !result.data) return <LoadingBlock label="Calculando indicadores…" />
  if (result.error || !result.data) {
    return <ErrorState title="Não foi possível calcular os indicadores" message={describeError(result.error)} onRetry={result.reload} />
  }
  const d = result.data
  const empty = d.reservations.bookings === 0 && d.sales.count === 0 && d.upcoming.length === 0
  if (empty) {
    return (
      <EmptyState
        icon="chart"
        title="Ainda não há movimento neste período"
        description="Os indicadores aparecem assim que houver reservas ou vendas registradas na arena."
      />
    )
  }
  return (
    <div className="dashboard" aria-busy={result.loading}>
      <div className="stat-grid">
        <div className="stat-card is-highlight">
          <span>Faturamento total</span>
          <strong>{formatCurrency(d.totalRevenue)}</strong>
          <small>
            Reservas {formatCurrency(d.reservations.revenue)} · Vendas {formatCurrency(d.sales.revenue)}
          </small>
        </div>
        <div className="stat-card">
          <span>Reservas</span>
          <strong>{d.reservations.bookings}</strong>
          <small>
            {d.reservations.cancelled} cancelada(s) · {d.reservations.customers} cliente(s)
          </small>
        </div>
        <div className="stat-card">
          <span>Ocupação das quadras</span>
          <strong>{percent(d.occupancy.rate)}</strong>
          <small>
            {Math.round(d.occupancy.bookedHours)}h de {d.occupancy.availableHours}h · {d.occupancy.activeCourts} quadra(s)
          </small>
        </div>
        <div className="stat-card">
          <span>Ticket médio</span>
          <strong>{formatCurrency(d.reservations.averageTicket)}</strong>
          <small>
            {d.sales.items} item(ns) vendidos · {d.championships.active} campeonato(s) ativo(s)
          </small>
        </div>
      </div>

      <section className="panel panel-pad">
        <SectionTitle>Faturamento por dia</SectionTitle>
        <p className="muted-text">Reservas e vendas somadas, nos últimos {d.periodDays} dias.</p>
        <DailyChart daily={d.daily} />
      </section>

      <div className="detail-grid">
        <section className="panel panel-pad">
          <SectionTitle>Ocupação por quadra</SectionTitle>
          <BarList
            label="Ocupação por quadra"
            items={d.byCourt.map((c) => ({
              key: c.courtId,
              label: c.name,
              value: c.occupancy,
              display: percent(c.occupancy),
              detail: `${Math.round(c.hours)}h reservadas · ${formatCurrency(c.revenue)}`,
            }))}
            max={1}
          />
        </section>
        <section className="panel panel-pad">
          <SectionTitle>Reservas por modalidade</SectionTitle>
          <BarList
            label="Reservas por modalidade"
            items={d.bySport.map((s) => ({
              key: s.sport,
              label: getSportLabel(s.sport as SportId),
              value: s.bookings,
              display: String(s.bookings),
              detail: formatCurrency(s.revenue),
            }))}
            max={Math.max(1, ...d.bySport.map((s) => s.bookings))}
          />
        </section>
      </div>

      <div className="detail-grid">
        <section className="panel panel-pad">
          <SectionTitle>Próximas reservas</SectionTitle>
          {d.upcoming.length === 0 ? (
            <p className="muted-text">Nenhuma reserva futura confirmada.</p>
          ) : (
            <ul className="upcoming-list">
              {d.upcoming.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>
                      {longDate(r.date)} · {r.time}–{r.endTime}
                    </strong>
                    <small>
                      {r.courtName} · {getSportLabel(r.sport)}
                    </small>
                  </div>
                  <div className="upcoming-customer">
                    <span>{r.customer.name || "Cliente"}</span>
                    <small>{r.customer.phone ?? "Telefone não informado"}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel panel-pad">
          <SectionTitle>Produtos mais vendidos</SectionTitle>
          {d.sales.topProducts.length === 0 ? (
            <p className="muted-text">Nenhuma venda no período.</p>
          ) : (
            <BarList
              label="Produtos mais vendidos"
              items={d.sales.topProducts.map((p) => ({
                key: p.name,
                label: p.name,
                value: p.revenue,
                display: formatCurrency(p.revenue),
                detail: `${p.quantity} unidade(s)`,
              }))}
              max={Math.max(1, ...d.sales.topProducts.map((p) => p.revenue))}
            />
          )}
        </section>
      </div>
    </div>
  )
}

/** Barras verticais de uma série (faturamento diário), com tooltip e tabela acessível. */
function DailyChart({ daily }: { daily: ManagerDashboard["daily"] }) {
  const totals = daily.map((day) => day.reservationRevenue + day.salesRevenue)
  const max = Math.max(1, ...totals)
  const best = totals.indexOf(Math.max(...totals))
  const labelEvery = daily.length > 31 ? 14 : daily.length > 10 ? 5 : 1
  return (
    <figure className="daily-chart">
      <div className="daily-bars" role="img" aria-label={`Faturamento diário; maior valor ${formatCurrency(totals[best] ?? 0)} em ${daily[best] ? shortDate(daily[best].date) : ""}`}>
        {daily.map((day, index) => {
          const total = totals[index]
          const tip = `${shortDate(day.date)} · ${formatCurrency(total)} (${day.bookings} reserva(s))`
          return (
            <div className="daily-bar" key={day.date} title={tip} tabIndex={0} aria-label={tip}>
              <span className="daily-fill" style={{ height: `${(total / max) * 100}%` }} />
              <span className="daily-tip" role="tooltip">
                <strong>{formatCurrency(total)}</strong>
                {shortDate(day.date)} · {day.bookings} reserva(s)
              </span>
              {index % labelEvery === 0 || index === daily.length - 1 ? (
                <span className="daily-label">{shortDate(day.date)}</span>
              ) : null}
            </div>
          )
        })}
      </div>
      <details className="chart-table">
        <summary>Ver tabela</summary>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Reservas</th>
                <th>Faturamento reservas</th>
                <th>Faturamento vendas</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <td data-label="Dia">{shortDate(day.date)}</td>
                  <td data-label="Reservas">{day.bookings}</td>
                  <td data-label="Reservas (R$)">{formatCurrency(day.reservationRevenue)}</td>
                  <td data-label="Vendas (R$)">{formatCurrency(day.salesRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

function BarList({
  label,
  items,
  max,
}: {
  label: string
  items: { key: string; label: string; value: number; display: string; detail: string }[]
  max: number
}) {
  if (items.length === 0) return <p className="muted-text">Sem dados no período.</p>
  return (
    <ul className="bar-list" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} title={`${item.label}: ${item.display} · ${item.detail}`}>
          <span className="bar-label">
            {item.label}
            <small>{item.detail}</small>
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </span>
          <strong>{item.display}</strong>
        </li>
      ))}
    </ul>
  )
}
