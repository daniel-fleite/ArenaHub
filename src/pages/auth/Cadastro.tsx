import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Alert } from "@/components/common"
import { AuthNotConfiguredNotice, FormField, describedBy } from "@/components/forms"
import { Button, TextInput } from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import { emailPattern } from "@/lib/format"

type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>

export default function Cadastro() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<{ tone: "error" | "warning"; message: string } | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    if (name.trim().length < 2) next.name = "Informe seu nome."
    if (!emailPattern.test(email.trim())) next.email = "Informe um e-mail válido."
    if (password.length < 8) next.password = "A senha deve ter pelo menos 8 caracteres."
    if (confirm !== password) next.confirm = "As senhas não coincidem."
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    // Nenhum papel é enviado: o servidor define os papéis da conta (todos começam como atleta).
    const result = await auth.signUp({ name: name.trim(), email: email.trim(), password })
    setSubmitting(false)
    if (!result.ok) {
      setFormError({
        tone: result.code === "not_configured" ? "warning" : "error",
        message: result.message,
      })
      return
    }
    if (result.data.needsEmailConfirmation) setConfirmationSent(true)
    else navigate("/", { replace: true })
  }

  if (confirmationSent) {
    return (
      <div className="auth-form">
        <h1 className="auth-title">Confirme seu e-mail</h1>
        <Alert tone="success" title="Conta criada">
          Enviamos uma mensagem para {email.trim()}. Confirme o e-mail antes de entrar.
        </Alert>
        <Link className="button button-primary auth-submit" to="/entrar">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form" aria-busy={submitting}>
      <h1 className="auth-title">Criar conta</h1>
      <p className="auth-subtitle">
        Uma única conta serve para reservar quadras como atleta e, depois, gerenciar arenas como gestor.
      </p>

      {!auth.configured && <AuthNotConfiguredNotice />}
      {formError && <Alert tone={formError.tone}>{formError.message}</Alert>}

      <FormField id="signup-name" label="Nome" error={errors.name}>
        <TextInput
          id="signup-name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Seu nome"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy("signup-name", errors.name)}
        />
      </FormField>
      <FormField id="signup-email" label="E-mail" error={errors.email}>
        <TextInput
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("signup-email", errors.email)}
        />
      </FormField>
      <FormField id="signup-password" label="Senha" error={errors.password} hint="Mínimo de 8 caracteres.">
        <TextInput
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("signup-password", errors.password, true)}
        />
      </FormField>
      <FormField id="signup-confirm" label="Confirmar senha" error={errors.confirm}>
        <TextInput
          id="signup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={describedBy("signup-confirm", errors.confirm)}
        />
      </FormField>

      <Button type="submit" disabled={submitting} className="auth-submit">
        {submitting ? "Criando conta…" : "Criar conta"}
      </Button>
      <p className="auth-switch">
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </p>
    </form>
  )
}
