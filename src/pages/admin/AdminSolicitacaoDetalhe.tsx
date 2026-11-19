import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ConfirmDialog, RejectReasonDialog } from "@/components/ActionDialogs"
import { Alert, DefinitionList, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { Button, PageHeader } from "@/components/ui"
import { getSportLabel } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { formatDate } from "@/lib/format"
import { approveArenaRequest, getArenaRequest, rejectArenaRequest } from "@/services/admin"
import { describeError } from "@/services/http"
import type { ArenaRequest } from "@/types"

export default function AdminSolicitacaoDetalhe() {
  const { id = "" } = useParams()
  const result = useAsync((signal) => getArenaRequest(id, signal), [id])
  // Só é preenchido com a resposta do SERVIDOR após aprovar/rejeitar.
  const [confirmed, setConfirmed] = useState<ArenaRequest | null>(null)
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    setConfirmed(null)
    setDone(null)
  }, [id])

  const request = confirmed ?? result.data?.data
  const open = (kind: "approve" | "reject") => {
    setDialogError(null)
    setDialog(kind)
  }

  const run = async (action: () => Promise<ArenaRequest>, message: string) => {
    setBusy(true)
    setDialogError(null)
    try {
      const updated = await action()
      setConfirmed(updated)
      setDialog(null)
      setDone(message)
    } catch (error) {
      setDialogError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  if (result.loading) return <div className="page"><LoadingBlock label="Carregando solicitação…" /></div>
  if (result.error || !request) {
    return (
      <div className="page">
        <ErrorState title="Não foi possível carregar a solicitação" message={describeError(result.error)} onRetry={result.reload} />
        <p className="back-link"><Link to="/admin/solicitacoes">← Voltar à fila</Link></p>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="back-link"><Link to="/admin/solicitacoes">← Voltar à fila</Link></p>
      <PageHeader
        title={request.name}
        description={`Solicitação enviada em ${formatDate(request.createdAt)} por ${request.requesterName ?? "usuário não identificado"}.`}
        action={<StatusBadge status={request.status} />}
      />
      <SourceNotice source={result.data?.source} />
      {done && <Alert tone="success" title="Decisão registrada pelo servidor">{done}</Alert>}

      <div className="detail-grid">
        <section className="panel panel-pad">
          <h2 className="flow-title">Dados da arena</h2>
          <DefinitionList
            items={[
              { label: "Nome", value: request.name },
              { label: "Endereço", value: `${request.address} · ${request.city}/${request.state}` },
              { label: "Modalidades", value: request.sports.map(getSportLabel).join(", ") || "—" },
              { label: "Descrição", value: request.description },
              { label: "Imagens", value: request.imageCount ? `${request.imageCount} enviada(s)` : "Nenhuma" },
            ]}
          />
        </section>
        <section className="panel panel-pad">
          <h2 className="flow-title">Contato e solicitante</h2>
          <DefinitionList
            items={[
              { label: "Responsável", value: request.contactName },
              { label: "E-mail de contato", value: request.contactEmail },
              { label: "Telefone", value: request.contactPhone },
              { label: "Instagram", value: request.instagram || "—" },
              { label: "Conta solicitante", value: request.requesterEmail ?? "—" },
            ]}
          />
        </section>
      </div>

      {request.status === "pendente" ? (
        <section className="panel panel-pad decision-bar">
          <div>
            <h2 className="flow-title">Decisão</h2>
            <p className="muted-text">
              A aprovação e a rejeição são enviadas à API. Esta tela só muda depois que o servidor confirmar.
            </p>
          </div>
          <div className="flow-actions start">
            <Button variant="secondary" onClick={() => open("reject")}>Rejeitar</Button>
            <Button onClick={() => open("approve")}>Aprovar</Button>
          </div>
        </section>
      ) : (
        <Alert
          tone={request.status === "aprovada" ? "success" : "error"}
          title={request.status === "aprovada" ? `Aprovada em ${formatDate(request.decidedAt)}` : `Rejeitada em ${formatDate(request.decidedAt)}`}
        >
          {request.status === "rejeitada" ? request.rejectionReason ?? "Motivo não informado." : "Esta solicitação já foi decidida."}
        </Alert>
      )}

      <ConfirmDialog
        open={dialog === "approve"}
        title="Aprovar solicitação"
        description={`Confirmar a aprovação de “${request.name}”? O servidor registrará a arena e o vínculo do gestor.`}
        confirmLabel="Aprovar"
        busy={busy}
        error={dialogError}
        onClose={() => setDialog(null)}
        onConfirm={() => run(() => approveArenaRequest(request.id), "A solicitação foi aprovada.")}
      />
      <RejectReasonDialog
        open={dialog === "reject"}
        title="Rejeitar solicitação"
        busy={busy}
        error={dialogError}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => run(() => rejectArenaRequest(request.id, reason), "A solicitação foi rejeitada e o motivo foi registrado.")}
      />
    </div>
  )
}
