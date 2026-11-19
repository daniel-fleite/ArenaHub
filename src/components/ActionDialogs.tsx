import { useEffect, useState, type ReactNode } from "react"
import { Alert } from "./common"
import { Button, FieldLabel, Modal, Textarea } from "./ui"

/** Diálogo de confirmação com estado de envio e erro. Fecha só quando o chamador decidir. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} description={description}>
      {children}
      {error && <Alert tone="error" title="Ação não concluída">{error}</Alert>}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {busy ? "Enviando…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export const MIN_REJECTION_REASON = 10

/** Rejeição exige motivo (mínimo de caracteres). O motivo é enviado ao servidor. */
export function RejectReasonDialog({
  open,
  title,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  busy: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (open) {
      setReason("")
      setTouched(false)
    }
  }, [open])

  const trimmed = reason.trim()
  const invalid = trimmed.length < MIN_REJECTION_REASON

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description="Informe o motivo da rejeição. Ele ficará registrado e será exibido ao solicitante."
    >
      <div className="field-group">
        <FieldLabel htmlFor="reject-reason">Motivo da rejeição (obrigatório)</FieldLabel>
        <Textarea
          id="reject-reason"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && invalid}
          placeholder="Explique o que precisa ser corrigido ou por que a solicitação não pode ser aprovada"
        />
        {touched && invalid && (
          <p className="field-error" role="alert">
            Descreva o motivo com pelo menos {MIN_REJECTION_REASON} caracteres.
          </p>
        )}
      </div>
      {error && <Alert tone="error" title="Ação não concluída">{error}</Alert>}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            setTouched(true)
            if (!invalid) onConfirm(trimmed)
          }}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Enviando…" : "Rejeitar solicitação"}
        </Button>
      </div>
    </Modal>
  )
}
