import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Alert, DefinitionList, FieldError, Stepper } from "@/components/common"
import { FormField, describedBy } from "@/components/forms"
import { StatusBadge } from "@/components/status"
import { Button, CheckOption, PageHeader, Select, TextInput, Textarea } from "@/components/ui"
import { getSportLabel, sportOptions, type SportId } from "@/data/courts"
import { brazilStates, emailPattern } from "@/lib/format"
import { createArenaRequest, type CreateArenaRequestResult } from "@/services/arenaRequests"
import { describeError } from "@/services/http"
import type { ArenaRequestInput } from "@/types"

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

type Form = ArenaRequestInput
type Errors = Partial<Record<keyof Form | "sports" | "images", string>>

const empty: Form = {
  name: "",
  address: "",
  city: "",
  state: "",
  description: "",
  sports: [],
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  instagram: "",
}

function validateStep(step: number, form: Form, images: File[]): Errors {
  const e: Errors = {}
  if (step === 0) {
    if (form.name.trim().length < 3) e.name = "Informe o nome da arena (mínimo de 3 caracteres)."
    if (form.address.trim().length < 5) e.address = "Informe o endereço completo."
    if (form.city.trim().length < 2) e.city = "Informe a cidade."
    if (!form.state) e.state = "Selecione o estado."
    if (form.description.trim().length < 20) e.description = "Descreva a arena com pelo menos 20 caracteres."
    if (form.sports.length === 0) e.sports = "Selecione ao menos uma modalidade."
  }
  if (step === 1) {
    if (form.contactName.trim().length < 2) e.contactName = "Informe o nome do responsável."
    if (!emailPattern.test(form.contactEmail.trim())) e.contactEmail = "Informe um e-mail válido."
    if (form.contactPhone.replace(/\D/g, "").length < 10) e.contactPhone = "Informe um telefone com DDD."
    if (images.length > MAX_IMAGES) e.images = `Envie no máximo ${MAX_IMAGES} imagens.`
    else if (images.some((file) => !file.type.startsWith("image/")))
      e.images = "Apenas arquivos de imagem são aceitos."
    else if (images.some((file) => file.size > MAX_IMAGE_BYTES))
      e.images = "Cada imagem deve ter até 5 MB."
  }
  return e
}

export default function SolicitarArena() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(empty)
  const [images, setImages] = useState<File[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateArenaRequestResult | null>(null)

  const previews = useMemo(() => images.map((file) => ({ file, url: URL.createObjectURL(file) })), [images])
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews])

  const clearError = (key: keyof Errors) =>
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    clearError(key)
  }
  const toggleSport = (id: SportId, checked: boolean) =>
    set("sports", checked ? [...form.sports, id] : form.sports.filter((item) => item !== id))
  const pickImages = (files: File[]) => {
    setImages(files)
    clearError("images")
  }

  const next = () => {
    const found = validateStep(step, form, images)
    setErrors(found)
    if (Object.keys(found).length === 0) setStep(step + 1)
  }

  const submit = async () => {
    const found = { ...validateStep(0, form, images), ...validateStep(1, form, images) }
    if (Object.keys(found).length) {
      setErrors(found)
      setStep(Object.keys(validateStep(0, form, images)).length ? 0 : 1)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await createArenaRequest(
        { ...form, instagram: form.instagram?.trim() || undefined },
        images,
      )
      setResult(created)
      setStep(3)
    } catch (error) {
      setSubmitError(describeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-public narrow">
      <PageHeader
        title="Solicitar cadastro de arena"
        description="Preencha os dados da arena. A solicitação fica pendente até a análise de um administrador do ArenaHub."
      />
      <Stepper steps={["Arena", "Contato e imagens", "Resumo", "Confirmação"]} current={step} />

      {step === 0 && (
        <div className="flow-card">
          <div className="form-grid">
            <FormField id="req-name" label="Nome da arena" error={errors.name} className="field-span">
              <TextInput id="req-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("req-name", errors.name)} />
            </FormField>
            <FormField id="req-address" label="Endereço" error={errors.address} className="field-span">
              <TextInput id="req-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua, número e bairro" aria-invalid={Boolean(errors.address)} aria-describedby={describedBy("req-address", errors.address)} />
            </FormField>
            <FormField id="req-city" label="Cidade" error={errors.city}>
              <TextInput id="req-city" value={form.city} onChange={(e) => set("city", e.target.value)} aria-invalid={Boolean(errors.city)} aria-describedby={describedBy("req-city", errors.city)} />
            </FormField>
            <FormField id="req-state" label="Estado" error={errors.state}>
              <Select id="req-state" value={form.state} onChange={(e) => set("state", e.target.value)} aria-invalid={Boolean(errors.state)} aria-describedby={describedBy("req-state", errors.state)}>
                <option value="">Selecione</option>
                {brazilStates.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="req-description" label="Descrição" error={errors.description} className="field-span" hint="Conte sobre estrutura, diferenciais e horários de funcionamento.">
              <Textarea id="req-description" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={describedBy("req-description", errors.description, true)} />
            </FormField>
            <div className="field-group field-span">
              <span className="field-label">Modalidades oferecidas</span>
              <div className="option-grid">
                {sportOptions.map((option) => (
                  <CheckOption
                    key={option.id}
                    title={option.label}
                    description={option.group}
                    checked={form.sports.includes(option.id)}
                    onChange={(checked) => toggleSport(option.id, checked)}
                  />
                ))}
              </div>
              <FieldError message={errors.sports} />
            </div>
          </div>
          <div className="flow-actions">
            <Button onClick={next}>Continuar</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flow-card">
          <div className="form-grid">
            <FormField id="req-contact-name" label="Responsável" error={errors.contactName}>
              <TextInput id="req-contact-name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} aria-invalid={Boolean(errors.contactName)} aria-describedby={describedBy("req-contact-name", errors.contactName)} />
            </FormField>
            <FormField id="req-contact-phone" label="Telefone / WhatsApp" error={errors.contactPhone}>
              <TextInput id="req-contact-phone" type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="(00) 00000-0000" aria-invalid={Boolean(errors.contactPhone)} aria-describedby={describedBy("req-contact-phone", errors.contactPhone)} />
            </FormField>
            <FormField id="req-contact-email" label="E-mail de contato" error={errors.contactEmail}>
              <TextInput id="req-contact-email" type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} aria-invalid={Boolean(errors.contactEmail)} aria-describedby={describedBy("req-contact-email", errors.contactEmail)} />
            </FormField>
            <FormField id="req-instagram" label="Instagram (opcional)">
              <TextInput id="req-instagram" value={form.instagram ?? ""} onChange={(e) => set("instagram", e.target.value)} placeholder="@suaarena" />
            </FormField>
            <FormField
              id="req-images"
              label={`Imagens (opcional, até ${MAX_IMAGES}, 5 MB cada)`}
              error={errors.images}
              className="field-span"
              hint="O envio de imagens ainda não está disponível no servidor: a solicitação será registrada sem elas."
            >
              <input
                id="req-images"
                className="field file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => pickImages(Array.from(event.target.files ?? []))}
              />
            </FormField>
            {previews.length > 0 && (
              <ul className="thumb-list field-span" aria-label="Imagens selecionadas">
                {previews.map((item) => (
                  <li key={item.url}>
                    <img src={item.url} alt={item.file.name} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flow-actions">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Voltar
            </Button>
            <Button onClick={next}>Revisar resumo</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flow-card">
          <h2 className="flow-title">Confira os dados antes de enviar</h2>
          <DefinitionList
            items={[
              { label: "Arena", value: form.name },
              { label: "Endereço", value: `${form.address} · ${form.city}/${form.state}` },
              { label: "Modalidades", value: form.sports.map(getSportLabel).join(", ") },
              { label: "Descrição", value: form.description },
              { label: "Responsável", value: form.contactName },
              { label: "Contato", value: `${form.contactEmail} · ${form.contactPhone}` },
              { label: "Instagram", value: form.instagram?.trim() || "—" },
              { label: "Imagens", value: images.length ? `${images.length} selecionada(s)` : "Nenhuma" },
            ]}
          />
          <Alert tone="warning" title="Esta solicitação ainda não foi enviada">
            Ela só será registrada quando o servidor confirmar. Depois do envio ela ficará pendente até a
            análise.
          </Alert>
          {submitError && (
            <Alert tone="error" title="Solicitação não enviada">
              {submitError} Seus dados foram mantidos: tente novamente ou volte para ajustar.
            </Alert>
          )}
          <div className="flow-actions">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>
              Voltar e editar
            </Button>
            <Button onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? "Enviando…" : "Enviar solicitação"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="flow-card">
          <Alert tone="success" title="Solicitação registrada pelo servidor">
            O servidor confirmou o registro. Ela aguarda a análise de um administrador.
          </Alert>
          {result.imagesUploaded === false && (
            <Alert tone="warning" title="Imagens não enviadas">
              A solicitação foi registrada, mas o envio das imagens falhou: {describeError(result.imageError)}
            </Alert>
          )}
          <DefinitionList
            items={[
              { label: "Arena", value: result.request.name },
              { label: "Status", value: <StatusBadge status={result.request.status} /> },
            ]}
          />
          <div className="flow-actions">
            <Link className="button button-primary" to="/minhas-solicitacoes">
              Acompanhar solicitação
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
