import { ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { PageHeader } from "@/components/ui"
import { useAsync } from "@/hooks/useAsync"
import { formatCurrency } from "@/lib/format"
import { getPlatformStats } from "@/services/admin"
import { describeError } from "@/services/http"
import type { PlatformStats } from "@/types"

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")
}

function Bars({ title, rows, format = (v: number) => v.toLocaleString("pt-BR") }: {
  title: string
  rows: { label: string; value: number; detail?: string }[]
  format?: (value: number) => string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <section className="panel panel-pad">
      <h2 className="flow-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="muted-text">Sem dados no período.</p>
      ) : (
        <ul className="bar-list admin-bars" aria-label={title}>
          {rows.map((row) => (
            <li key={row.label} title={`${row.label}: ${format(row.value)}${row.detail ? ` · ${row.detail}` : ""}`}>
              <span className="bar-label">
                {row.label}
                {row.detail && <small>{row.detail}</small>}
              </span>
              <div className="bar-track" aria-hidden="true">
                <div className="bar-fill" style={{ width: `${Math.max(row.value ? 2 : 0, (row.value / max) * 100)}%` }} />
              </div>
              <strong>{format(row.value)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Uma série por mês, barras verticais com tooltip e tabela acessível. */
function MonthlyChart({ title, data, value, format }: {
  title: string
  data: NonNullable<PlatformStats["monthly"]>
  value: (row: NonNullable<PlatformStats["monthly"]>[number]) => number
  format: (v: number) => string
}) {
  const values = data.map(value)
  const max = Math.max(1, ...values)
  return (
    <section className="panel panel-pad">
      <h2 className="flow-title">{title}</h2>
      <figure className="daily-chart">
        <div className="daily-bars monthly-bars" role="img" aria-label={`${title}: ${data.map((row, i) => `${monthLabel(row.month)} ${format(values[i])}`).join(", ")}`}>
          {data.map((row, i) => {
            const tip = `${monthLabel(row.month)} · ${format(values[i])}`
            return (
              <div className="daily-bar" key={row.month} title={tip} tabIndex={0} aria-label={tip}>
                <span className="daily-fill" style={{ height: `${(values[i] / max) * 100}%` }} />
                <span className="daily-tip" role="tooltip">
                  <strong>{format(values[i])}</strong>
                  {monthLabel(row.month)}
                </span>
                <span className="daily-label">{monthLabel(row.month)}</span>
              </div>
            )
          })}
        </div>
      </figure>
    </section>
  )
}

export default function AdminIndicadores() {
  const result = useAsync((signal) => getPlatformStats(signal), [])
  const stats = result.data?.data
  const revenueMonth = stats?.revenue ? stats.revenue.reservationsThisMonth + stats.revenue.salesThisMonth : undefined

  return (
    <div className="page">
      <PageHeader title="Indicadores da plataforma" description="Movimento, faturamento e crescimento de todas as arenas do ArenaHub." />
      <SourceNotice source={result.data?.source} />
      {result.loading ? (
        <LoadingBlock label="Carregando indicadores…" />
      ) : result.error || !stats ? (
        <ErrorState title="Indicadores indisponíveis" message={describeError(result.error)} onRetry={result.reload} />
      ) : (
        <div className="dashboard">
          <div className="stat-grid">
            {revenueMonth !== undefined && (
              <div className="stat-card is-highlight">
                <span>Faturamento no mês</span>
                <strong>{formatCurrency(revenueMonth)}</strong>
                <small>
                  Reservas {formatCurrency(stats.revenue!.reservationsThisMonth)} · Vendas {formatCurrency(stats.revenue!.salesThisMonth)}
                </small>
              </div>
            )}
            <div className="stat-card">
              <span>Reservas no mês</span>
              <strong>{stats.reservations.thisMonth.toLocaleString("pt-BR")}</strong>
              <small>{stats.reservations.total.toLocaleString("pt-BR")} no total</small>
            </div>
            <div className="stat-card">
              <span>Arenas ativas</span>
              <strong>{stats.arenas.active}</strong>
              <small>
                {stats.arenas.total} cadastradas{stats.arenas.courts !== undefined ? ` · ${stats.arenas.courts} quadras ativas` : ""}
              </small>
            </div>
            <div className="stat-card">
              <span>Usuários</span>
              <strong>{stats.users.total.toLocaleString("pt-BR")}</strong>
              <small>
                {stats.users.managers} gestor(es) · {stats.users.suspended} suspenso(s)
              </small>
            </div>
          </div>

          {stats.monthly && stats.monthly.length > 0 && (
            <div className="detail-grid">
              <MonthlyChart title="Reservas por mês" data={stats.monthly} value={(row) => row.bookings} format={(v) => `${v.toLocaleString("pt-BR")} reservas`} />
              <MonthlyChart title="Faturamento de reservas por mês" data={stats.monthly} value={(row) => row.revenue} format={formatCurrency} />
            </div>
          )}

          <div className="detail-grid">
            <Bars
              title="Arenas com mais reservas (30 dias)"
              rows={(stats.topArenas ?? []).map((arena) => ({
                label: arena.name,
                value: arena.bookings,
                detail: `${arena.city}/${arena.state} · ${formatCurrency(arena.revenue)}`,
              }))}
            />
            <Bars
              title="Novos usuários por mês"
              rows={(stats.monthly ?? []).map((row) => ({ label: monthLabel(row.month), value: row.newUsers }))}
            />
          </div>

          <div className="detail-grid">
            <Bars
              title="Solicitações de arena"
              rows={[
                { label: "Pendentes", value: stats.requests.pendente },
                { label: "Aprovadas", value: stats.requests.aprovada },
                { label: "Rejeitadas", value: stats.requests.rejeitada },
              ]}
            />
            <Bars
              title="Usuários por perfil"
              rows={[
                { label: "Todas as contas", value: stats.users.total },
                { label: "Gestores", value: stats.users.managers },
                { label: "Suspensos", value: stats.users.suspended },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
