import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Alert } from "@/components/common"
import { AuthNotConfiguredNotice, FormField, describedBy } from "@/components/forms"
import { Button, TextInput } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Destino do link de recuperação enviado por e-mail. A sessão de recuperação é criada pelo
 * provedor de autenticação real; sem ele, esta tela apenas informa a dependência.
 */
export default function RedefinirSenha() {
  const auth = useAuth()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<{ tone: "error" | "warning"; message: string } | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (password.length < 8) next.password = "A senha deve ter pelo menos 8 caracteres."
    if (confirm !== password) next.confirm = "As senhas não coincidem."
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    const result = await auth.updatePassword(password)
    setSubmitting(false)
    if (result.ok) setDone(true)
    else
      setFormError({
        tone: result.code === "not_configured" ? "warning" : "error",
        message: result.message,
      })
  }

  if (done) {
    return (
      <div className="auth-form">
        <h1 className="auth-title">Senha atualizada</h1>
        <Alert tone="success">Sua senha foi redefinida. Entre com a nova senha.</Alert>
        <Link className="button button-primary auth-submit" to="/entrar">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form" aria-busy={submitting}>
      <h1 className="auth-title">Definir nova senha</h1>
      <p className="auth-subtitle">Escolha uma nova senha para sua conta.</p>

      {!auth.configured && <AuthNotConfiguredNotice />}
      {formError && <Alert tone={formError.tone}>{formError.message}</Alert>}

      <FormField id="reset-password" label="Nova senha" error={errors.password} hint="Mínimo de 8 caracteres.">
        <TextInput
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("reset-password", errors.password, true)}
        />
      </FormField>
      <FormField id="reset-confirm" label="Confirmar nova senha" error={errors.confirm}>
        <TextInput
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={describedBy("reset-confirm", errors.confirm)}
        />
      </FormField>
      <Button type="submit" disabled={submitting} className="auth-submit">
        {submitting ? "Salvando…" : "Salvar nova senha"}
      </Button>
      <p className="auth-switch">
        <Link to="/entrar">Voltar ao login</Link>
      </p>
    </form>
  )
}
