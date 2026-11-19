import { useEffect, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Alert } from "@/components/common"
import { AuthNotConfiguredNotice, FormField, describedBy } from "@/components/forms"
import { Button, TextInput } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import { emailPattern } from "@/lib/format"

export default function Login() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<{ tone: "error" | "warning"; message: string } | null>(null)

  useEffect(() => {
    if (auth.status === "authenticated") navigate(from, { replace: true })
  }, [auth.status, from, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!emailPattern.test(email.trim())) next.email = "Informe um e-mail válido."
    if (!password) next.password = "Informe sua senha."
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    const result = await auth.signIn(email.trim(), password)
    setSubmitting(false)
    if (!result.ok) {
      setFormError({
        tone: result.code === "not_configured" ? "warning" : "error",
        message: result.message,
      })
    }
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form" aria-busy={submitting}>
      <h1 className="auth-title">Entrar</h1>
      <p className="auth-subtitle">Acesse sua conta para reservar quadras e gerenciar suas arenas.</p>

      {!auth.configured && <AuthNotConfiguredNotice />}
      {formError && <Alert tone={formError.tone}>{formError.message}</Alert>}

      <FormField id="login-email" label="E-mail" error={errors.email}>
        <TextInput
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("login-email", errors.email)}
        />
      </FormField>
      <FormField id="login-password" label="Senha" error={errors.password}>
        <TextInput
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Sua senha"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("login-password", errors.password)}
        />
      </FormField>

      <Link className="auth-link" to="/recuperar-senha">
        Esqueci minha senha
      </Link>
      <Button type="submit" disabled={submitting} className="auth-submit">
        {submitting ? "Entrando…" : "Entrar"}
      </Button>
      <p className="auth-switch">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </form>
  )
}
