import { Link } from "react-router-dom"
import { ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { EmptyState, PageHeader } from "@/components/ui"
import { useAsync } from "@/hooks/useAsync"
import { formatCurrency, formatDate } from "@/lib/format"
import { getPlatformStats, listArenaRequests } from "@/services/admin"
import { describeError } from "@/services/http"

export default function AdminDashboard() {
  const stats = useAsync((signal) => getPlatformStats(signal), [])
  const pending = useAsync((signal) => listArenaRequests("pendente", signal), [])
  const data = stats.data?.data
  const queue = pending.data?.data.slice(0, 5) ?? []

  return (
    <div className="page">
      <PageHeader
        title="Visão geral da plataforma"
        description="Resumo das arenas, usuários e solicitações do ArenaHub."
      />
      <SourceNotice source={stats.data?.source} />

      {stats.loading ? (
        <LoadingBlock label="Carregando indicadores…" />
      ) : stats.error || !data ? (
        <ErrorState
          title="Indicadores indisponíveis"
          message={describeError(stats.error)}
          onRetry={stats.reload}
        />
      ) : (
        <div className="stat-grid">
          <Stat label="Arenas ativas" value={data.arenas.active} hint={`${data.arenas.total} cadastradas`} />
          <Stat label="Solicitações pendentes" value={data.requests.pendente} hint="Aguardando análise" highlight />
          <Stat label="Usuários" value={data.users.total} hint={`${data.users.managers} gestores`} />
          <Stat
            label="Reservas no mês"
            value={data.reservations.thisMonth}
            hint={
              data.revenue
                ? `${formatCurrency(data.revenue.reservationsThisMonth + data.revenue.salesThisMonth)} faturados no mês`
                : `${data.reservations.total} no total`
            }
          />
        </div>
      )}

      <section className="panel admin-section">
        <div className="arena-panel-header">
          <div>
            <h2>Fila de solicitações pendentes</h2>
            <p>As cinco solicitações mais recentes aguardando decisão.</p>
          </div>
          <Link className="button button-secondary" to="/admin/solicitacoes">
            Ver fila completa
          </Link>
        </div>
        {pending.loading ? (
          <LoadingBlock label="Carregando fila…" />
        ) : pending.error ? (
          <div className="panel-pad">
            <ErrorState title="Fila indisponível" message={describeError(pending.error)} onRetry={pending.reload} />
          </div>
        ) : queue.length === 0 ? (
          <div className="panel-pad">
            <EmptyState icon="check" title="Nenhuma solicitação pendente" description="Quando houver novas solicitações, elas aparecerão aqui." />
          </div>
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Arena</th>
                  <th>Local</th>
                  <th>Solicitante</th>
                  <th>Enviada em</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Arena"><strong>{item.name}</strong></td>
                    <td data-label="Local">{item.city}/{item.state}</td>
                    <td data-label="Solicitante">{item.requesterName ?? "—"}</td>
                    <td data-label="Enviada em">{formatDate(item.createdAt)}</td>
                    <td data-label="Status"><StatusBadge status={item.status} /></td>
                    <td><Link to={`/admin/solicitacoes/${encodeURIComponent(item.id)}`}>Analisar</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, hint, highlight }: { label: string; value: number; hint: string; highlight?: boolean }) {
  return (
    <div className={`stat-card ${highlight ? "is-highlight" : ""}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("pt-BR")}</strong>
      <small>{hint}</small>
    </div>
  )
}
