import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Alert } from "@/components/common"
import { AuthNotConfiguredNotice, FormField, describedBy } from "@/components/forms"
import { Button, TextInput } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import { emailPattern } from "@/lib/format"

export default function RecuperarSenha() {
  const auth = useAuth()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<{ tone: "error" | "warning"; message: string } | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!emailPattern.test(email.trim())) {
      setError("Informe um e-mail válido.")
      return
    }
    setError(undefined)
    setSubmitting(true)
    const result = await auth.requestPasswordReset(email.trim())
    setSubmitting(false)
    if (result.ok) setSent(true)
    else
      setFormError({
        tone: result.code === "not_configured" ? "warning" : "error",
        message: result.message,
      })
  }

  if (sent) {
    return (
      <div className="auth-form">
        <h1 className="auth-title">Verifique seu e-mail</h1>
        <Alert tone="success" title="Solicitação enviada">
          Se existir uma conta para {email.trim()}, você receberá as instruções para redefinir a senha.
        </Alert>
        <Link className="button button-secondary auth-submit" to="/entrar">
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form" aria-busy={submitting}>
      <h1 className="auth-title">Recuperar senha</h1>
      <p className="auth-subtitle">Informe o e-mail da conta para receber o link de redefinição.</p>

      {!auth.configured && <AuthNotConfiguredNotice />}
      {formError && <Alert tone={formError.tone}>{formError.message}</Alert>}

      <FormField id="recover-email" label="E-mail" error={error}>
        <TextInput
          id="recover-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy("recover-email", error)}
        />
      </FormField>
      <Button type="submit" disabled={submitting} className="auth-submit">
        {submitting ? "Enviando…" : "Enviar instruções"}
      </Button>
      <p className="auth-switch">
        Lembrou a senha? <Link to="/entrar">Entrar</Link>
      </p>
    </form>
  )
}
