import { Link } from "react-router-dom"
import { Alert, DefinitionList, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { EmptyState, PageHeader } from "@/components/ui"
import { getSportLabel } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { formatDate } from "@/lib/format"
import { listMyArenaRequests } from "@/services/arenaRequests"
import { describeError } from "@/services/http"

export default function MinhasSolicitacoes() {
  const result = useAsync((signal) => listMyArenaRequests(signal), [])
  const list = result.data?.data ?? []

  return (
    <div className="page-public narrow">
      <PageHeader
        title="Minhas solicitações"
        description="Acompanhe a análise dos pedidos de cadastro de arena."
        action={
          <Link className="button button-primary" to="/arenas/solicitar">
            Nova solicitação
          </Link>
        }
      />
      <SourceNotice source={result.data?.source} />

      {result.loading ? (
        <LoadingBlock label="Carregando solicitações…" />
      ) : result.error ? (
        <ErrorState
          title="Não foi possível carregar suas solicitações"
          message={describeError(result.error)}
          onRetry={result.reload}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon="arena"
          title="Nenhuma solicitação"
          description="Quando você solicitar o cadastro de uma arena, o andamento aparecerá aqui."
          action={
            <Link className="button button-primary" to="/arenas/solicitar">
              Solicitar cadastro
            </Link>
          }
        />
      ) : (
        <div className="request-list">
          {list.map((request) => (
            <article className={`request-card request-${request.status}`} key={request.id}>
              <header>
                <h2>{request.name}</h2>
                <StatusBadge status={request.status} />
              </header>
              <DefinitionList
                items={[
                  { label: "Local", value: `${request.city}/${request.state}` },
                  { label: "Modalidades", value: request.sports.map(getSportLabel).join(", ") || "—" },
                  { label: "Enviada em", value: formatDate(request.createdAt) },
                  ...(request.decidedAt ? [{ label: "Decisão em", value: formatDate(request.decidedAt) }] : []),
                ]}
              />
              {request.status === "pendente" && (
                <Alert tone="info">Em análise. Você será avisado quando houver uma decisão.</Alert>
              )}
              {request.status === "aprovada" && (
                <Alert tone="success" title="Solicitação aprovada">
                  O acesso à gestão da arena é concedido pelo servidor. Se o painel não aparecer no menu,
                  atualize a página ou entre novamente.
                </Alert>
              )}
              {request.status === "rejeitada" && (
                <Alert tone="error" title="Solicitação rejeitada">
                  {request.rejectionReason ?? "Motivo não informado."}
                </Alert>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
