import { useState } from "react"
import { Link } from "react-router-dom"
import { ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { EmptyState, PageHeader, Segmented, TextInput } from "@/components/ui"
import { getSportLabel } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { formatDate } from "@/lib/format"
import { listArenaRequests } from "@/services/admin"
import { describeError } from "@/services/http"
import type { ArenaRequestStatus } from "@/types"

type Filter = ArenaRequestStatus | "todas"

export default function AdminSolicitacoes() {
  const result = useAsync((signal) => listArenaRequests(undefined, signal), [])
  const [filter, setFilter] = useState<Filter>("pendente")
  const [query, setQuery] = useState("")
  const all = result.data?.data ?? []
  const count = (status: ArenaRequestStatus) => all.filter((item) => item.status === status).length
  const term = query.trim().toLowerCase()
  const list = all
    .filter((item) => filter === "todas" || item.status === filter)
    .filter((item) => !term || `${item.name} ${item.city} ${item.requesterName ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <div className="page">
      <PageHeader
        title="Solicitações de arenas"
        description="Analise os pedidos de cadastro. Cada decisão só vale depois da confirmação do servidor."
      />
      <SourceNotice source={result.data?.source} />
      <div className="toolbar toolbar-wrap">
        <TextInput icon="search" className="toolbar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por arena, cidade ou solicitante" aria-label="Buscar solicitações" />
        <Segmented
          label="Filtrar por status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pendente", label: `Pendentes (${count("pendente")})` },
            { value: "aprovada", label: `Aprovadas (${count("aprovada")})` },
            { value: "rejeitada", label: `Rejeitadas (${count("rejeitada")})` },
            { value: "todas", label: "Todas" },
          ]}
        />
      </div>

      {result.loading ? (
        <LoadingBlock label="Carregando solicitações…" />
      ) : result.error ? (
        <ErrorState title="Não foi possível carregar as solicitações" message={describeError(result.error)} onRetry={result.reload} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="check"
          title={filter === "pendente" && !term ? "Fila vazia" : "Nenhuma solicitação encontrada"}
          description={filter === "pendente" && !term ? "Não há solicitações pendentes no momento." : "Nenhum registro corresponde aos filtros."}
        />
      ) : (
        <div className="panel responsive-table">
          <table>
            <thead>
              <tr>
                <th>Arena</th>
                <th>Local</th>
                <th>Modalidades</th>
                <th>Solicitante</th>
                <th>Enviada em</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id}>
                  <td data-label="Arena"><strong>{item.name}</strong></td>
                  <td data-label="Local">{item.city}/{item.state}</td>
                  <td data-label="Modalidades">{item.sports.map(getSportLabel).join(", ")}</td>
                  <td data-label="Solicitante">{item.requesterName ?? "—"}</td>
                  <td data-label="Enviada em">{formatDate(item.createdAt)}</td>
                  <td data-label="Status"><StatusBadge status={item.status} /></td>
                  <td><Link to={`/admin/solicitacoes/${encodeURIComponent(item.id)}`}>{item.status === "pendente" ? "Analisar" : "Ver detalhes"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
