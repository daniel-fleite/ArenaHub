import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { Alert, Badge, LoadingBlock } from "@/components/common"
import { FormField, describedBy } from "@/components/forms"
import { Button, PageHeader, TextInput } from "@/components/ui"
import { env } from "@/config/env"
import { useAuth } from "@/contexts/AuthContext"
import { describeError } from "@/services/http"
import { updateProfile } from "@/services/account"

export default function Perfil() {
  const auth = useAuth()
  const { account } = auth
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [nameError, setNameError] = useState<string | undefined>()
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    setName(account?.name ?? auth.user?.name ?? "")
    setPhone(account?.phone ?? "")
  }, [account, auth.user])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    if (name.trim().length < 2) {
      setNameError("Informe seu nome.")
      return
    }
    setNameError(undefined)
    // Mesmo critério do servidor e das reservas: com DDD, de 10 a 13 dígitos (ou vazio).
    const digits = phone.replace(/\D/g, "").length
    if (phone.trim() && (digits < 10 || digits > 13)) {
      setPhoneError("Informe o telefone com DDD, por exemplo (15) 99999-0000.")
      return
    }
    setPhoneError(undefined)
    setSaving(true)
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() || undefined })
      setFeedback({ tone: "success", message: "Perfil atualizado pelo servidor." })
      auth.reloadAccount()
    } catch (error) {
      setFeedback({
        tone: "error",
        message: `${describeError(error)} Suas alterações não foram salvas, mas os dados continuam no formulário.`,
      })
    } finally {
      setSaving(false)
    }
  }

  // Em caso de sucesso, o AuthContext redireciona para "/".
  const signOut = async () => {
    setSignOutError(null)
    const result = await auth.signOut()
    if (!result.ok) setSignOutError(result.message)
  }

  return (
    <div className="page-public narrow">
      <PageHeader title="Meu perfil" description="Seus dados e os papéis da sua conta no ArenaHub." />

      {!auth.user && (
        <Alert tone="warning" title="Sem sessão">
          {env.previewWithoutAuth
            ? "Você está na pré-visualização sem autenticação. Não há conta carregada."
            : "Entre para ver o seu perfil."}
        </Alert>
      )}
      {auth.accountStatus === "loading" && <LoadingBlock label="Carregando conta…" />}
      {auth.accountStatus === "error" && (
        <Alert
          tone="warning"
          title="Dados da conta indisponíveis"
          action={
            <Button variant="secondary" onClick={auth.reloadAccount}>
              Tentar novamente
            </Button>
          }
        >
          {auth.accountError}
        </Alert>
      )}

      <section className="flow-card">
        <h2 className="flow-title">Papéis da conta</h2>
        <div className="badge-list">
          <Badge tone="info">Atleta</Badge>
          {account?.roles.includes("manager") && <Badge tone="success">Gestor</Badge>}
          {account?.roles.includes("admin") && <Badge tone="warning">Administrador</Badge>}
        </div>
        <p className="muted-text">
          Uma única conta atua como atleta e gestor. Os papéis são definidos pelo servidor; não é possível
          alterá-los por aqui.
        </p>
        {account && account.managedArenas.length > 0 && (
          <ul className="plain-list">
            {account.managedArenas.map((arena) => (
              <li key={arena.id}>{arena.name}</li>
            ))}
          </ul>
        )}
        {!account?.roles.includes("manager") && (
          <Link to="/arenas/solicitar">Quero cadastrar uma arena</Link>
        )}
      </section>

      <form className="flow-card" onSubmit={save} noValidate aria-busy={saving}>
        <h2 className="flow-title">Dados pessoais</h2>
        {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
        <div className="form-grid">
          <FormField id="profile-name" label="Nome" error={nameError}>
            <TextInput
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(nameError)}
              aria-describedby={describedBy("profile-name", nameError)}
            />
          </FormField>
          <FormField id="profile-email" label="E-mail" hint="O e-mail é gerenciado pela autenticação.">
            <TextInput id="profile-email" value={auth.user?.email ?? ""} readOnly disabled />
          </FormField>
          <FormField
            id="profile-phone"
            label="Telefone com DDD"
            className="field-span"
            error={phoneError}
            hint="Obrigatório para reservar quadras. Ex.: (15) 99999-0000."
          >
            <TextInput
              id="profile-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setPhoneError(undefined)
              }}
              placeholder="(15) 99999-0000"
              aria-invalid={Boolean(phoneError)}
              aria-describedby={describedBy("profile-phone", phoneError, true)}
            />
          </FormField>
        </div>
        <div className="flow-actions">
          <Button type="submit" disabled={saving || !auth.user}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </form>

      <section className="flow-card">
        <h2 className="flow-title">Segurança</h2>
        {signOutError && <Alert tone="error">{signOutError}</Alert>}
        <div className="flow-actions start">
          <Link className="button button-secondary" to="/recuperar-senha">
            Alterar senha
          </Link>
          <Button
            variant="secondary"
            icon="logout"
            onClick={signOut}
            disabled={!auth.user || auth.signingOut}
            aria-busy={auth.signingOut}
          >
            {auth.signingOut ? "Saindo…" : "Sair da conta"}
          </Button>
        </div>
      </section>
    </div>
  )
}
