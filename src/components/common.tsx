import type { ReactNode } from "react"
import { env } from "@/config/env"
import type { DataSource } from "@/types"
import { Button, Icon, type IconName } from "./ui"

// Componentes compartilhados das novas áreas (público, conta e administração).
// Mantêm os tokens e o estilo do projeto; ver src/styles/common.css.

type Tone = "info" | "success" | "warning" | "error"
const toneIcon: Record<Tone, IconName> = {
  info: "info",
  success: "check",
  warning: "alert",
  error: "alert",
}

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`alert alert-${tone} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={toneIcon[tone]} className="size-4 alert-icon" />
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  )
}

export function Spinner({ label = "Carregando" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="card-grid" aria-busy="true" aria-label="Carregando arenas">
      {Array.from({ length: count }, (_, index) => (
        <div className="arena-card" key={index}>
          <Skeleton className="skeleton-media" />
          <div className="arena-card-body">
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  title = "Não foi possível carregar",
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <section className="empty-state state-error" role="alert">
      <div className="empty-icon">
        <Icon name="alert" className="size-6" />
      </div>
      <h2 className="empty-title">{title}</h2>
      <p className="empty-description">{message}</p>
      {onRetry && (
        <div className="empty-action">
          <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      )}
    </section>
  )
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
  children: ReactNode
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Faixa global exibida em todas as áreas quando a demonstração está ativa. */
export function DemoBanner() {
  if (!env.demoEnabled) return null
  return (
    <div className="env-banner env-banner-demo" role="note">
      <Icon name="info" className="size-4" />
      <span>
        <strong>Modo demonstração.</strong> Os dados exibidos são fictícios e nenhuma ação é enviada ao
        servidor.
      </span>
    </div>
  )
}

/** Faixa global exibida quando as rotas protegidas estão liberadas só para revisão visual. */
export function PreviewBanner() {
  if (!env.previewWithoutAuth) return null
  return (
    <div className="env-banner env-banner-preview" role="note">
      <Icon name="alert" className="size-4" />
      <span>
        <strong>Pré-visualização sem autenticação.</strong> As telas protegidas estão liberadas só para
        revisão de interface. Nenhuma permissão está sendo aplicada.
      </span>
    </div>
  )
}

/** Aviso local junto a listas/telas que estão exibindo dados de demonstração. */
export function SourceNotice({ source }: { source?: DataSource }) {
  if (source !== "demo") return null
  return (
    <Alert tone="info" title="Dados de demonstração" className="source-notice">
      Estes registros são fictícios e existem apenas na interface.
    </Alert>
  )
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Etapas">
      {steps.map((label, index) => (
        <li
          key={label}
          className={index === current ? "is-current" : index < current ? "is-done" : ""}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="stepper-dot">{index < current ? <Icon name="check" className="size-3" /> : index + 1}</span>
          <span className="stepper-label">{label}</span>
        </li>
      ))}
    </ol>
  )
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  )
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="definition-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
