import type { ReactNode } from "react"
import { Alert, FieldError } from "./common"
import { FieldLabel } from "./ui"

/** Rótulo + controle + mensagem de erro/ajuda, com ids acessíveis. */
export function FormField({
  id,
  label,
  error,
  hint,
  className = "",
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`field-group ${className}`}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

/** Aviso fixo exibido nas telas de autenticação enquanto não há provedor real configurado. */
export function AuthNotConfiguredNotice() {
  return (
    <Alert tone="warning" title="Autenticação não configurada">
      Este ambiente ainda não está conectado ao Supabase Auth. Os campos são validados, mas não é possível
      entrar nem criar conta até que a integração seja configurada.
    </Alert>
  )
}

export function describedBy(id: string, error?: string, hint?: boolean) {
  if (error) return `${id}-error`
  return hint ? `${id}-hint` : undefined
}
