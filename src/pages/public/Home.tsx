import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArenaCard, SearchBar, type SearchValues } from "@/components/arena"
import { CardSkeletons, SourceNotice } from "@/components/common"
import { Icon, type IconName } from "@/components/ui"
import { sportOptions, type SportId } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { todayISO } from "@/lib/format"
import { listArenas } from "@/services/arenas"
import { describeError } from "@/services/http"

const steps: { icon: IconName; title: string; text: string }[] = [
  { icon: "search", title: "Busque", text: "Escolha cidade, modalidade e data para encontrar arenas." },
  { icon: "clock", title: "Escolha o horário", text: "Veja quadras, preços e horários antes de reservar." },
  { icon: "check", title: "Revise e envie", text: "Confira os dados e envie o pedido de reserva à arena." },
]

const managerPoints = [
  "Solicite o cadastro com a sua conta",
  "Acompanhe a análise da solicitação",
  "Depois da aprovação, gerencie quadras, reservas e campeonatos",
]

/** Campo de society visto de cima, usado como ilustração decorativa no topo e no bloco de gestores. */
function Pitch({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 380" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2">
        <rect x="20" y="20" width="560" height="340" rx="6" />
        <path d="M300 20v340" />
        <circle cx="300" cy="190" r="52" />
        <rect x="20" y="100" width="92" height="180" />
        <rect x="20" y="146" width="36" height="88" />
        <rect x="488" y="100" width="92" height="180" />
        <rect x="544" y="146" width="36" height="88" />
        <path d="M112 156a40 40 0 0 1 0 68M488 156a40 40 0 0 0 0 68" />
        <path d="M8 162h12v56H8zM580 162h12v56h-12z" />
      </g>
      <g fill="currentColor">
        <circle cx="300" cy="190" r="4" />
        <circle cx="84" cy="190" r="3" />
        <circle cx="516" cy="190" r="3" />
      </g>
      <path className="pitch-play" d="M190 300C260 290 330 230 392 130" stroke="currentColor" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" />
      <circle className="pitch-ball" cx="398" cy="120" r="9" fill="currentColor" />
    </svg>
  )
}

/** Diagrama simplificado da quadra de cada modalidade (decorativo). */
function SportCourt({ sport }: { sport: SportId }) {
  const sand = sport === "futevolei" || sport === "beach-tennis"
  return (
    <svg className="home-sport-court" viewBox="0 0 200 120" fill="none" aria-hidden="true" focusable="false">
      {sand && (
        <g fill="currentColor" opacity="0.28">
          {Array.from({ length: 40 }, (_, index) => (
            <circle key={index} cx={14 + ((index * 47) % 172)} cy={14 + ((index * index * 13) % 92)} r="0.9" />
          ))}
        </g>
      )}
      <g stroke="currentColor" strokeWidth="1.6">
        <rect x="8" y="8" width="184" height="104" rx="2" />
        {sport === "society" && (
          <>
            <path d="M100 8v104" />
            <circle cx="100" cy="60" r="17" />
            <rect x="8" y="32" width="30" height="56" />
            <rect x="162" y="32" width="30" height="56" />
          </>
        )}
        {sport === "futsal" && (
          <>
            <path d="M100 8v104" />
            <circle cx="100" cy="60" r="14" />
            <path d="M8 30c26 0 30 10 30 30s-4 30-30 30M192 30c-26 0-30 10-30 30s4 30 30 30" />
          </>
        )}
        {sand && <path d="M100 2v116" strokeWidth="3" />}
        {sport === "beach-tennis" && <path d="M100 8c-30 6-48 26-56 52" strokeDasharray="2 5" strokeLinecap="round" />}
      </g>
      {sport === "society" && <circle cx="100" cy="60" r="2.5" fill="currentColor" />}
      {sport === "futsal" && <circle cx="46" cy="60" r="2.5" fill="currentColor" />}
      {sand && <circle cx="100" cy="2" r="2.5" fill="currentColor" />}
      {sand && <circle cx="100" cy="118" r="2.5" fill="currentColor" />}
      {sport === "futevolei" && <circle cx="140" cy="38" r="7" fill="currentColor" />}
      {sport === "beach-tennis" && <circle cx="44" cy="62" r="4" fill="currentColor" />}
    </svg>
  )
}

function SectionHead({ index, id, title, text, link }: { index: string; id: string; title: string; text?: string; link?: { to: string; label: string } }) {
  return (
    <header className="home-head">
      <span className="home-index" aria-hidden="true">
        {index}
      </span>
      <div className="home-head-text">
        <h2 id={id} className="home-h2">
          {title}
        </h2>
        {text && <p>{text}</p>}
      </div>
      {link && (
        <Link className="home-head-link" to={link.to}>
          {link.label}
          <Icon name="chevron" className="size-4" />
        </Link>
      )}
    </header>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [values, setValues] = useState<SearchValues>({ cidade: "", modalidade: "", data: "" })
  const featured = useAsync((signal) => listArenas(signal), [])

  const search = () => {
    const params = new URLSearchParams()
    if (values.cidade.trim()) params.set("cidade", values.cidade.trim())
    if (values.modalidade) params.set("modalidade", values.modalidade)
    if (values.data) params.set("data", values.data)
    const query = params.toString()
    navigate(`/arenas${query ? `?${query}` : ""}`)
  }

  const arenas = featured.data?.data.slice(0, 3) ?? []
  // A faixa anima até -50%: as duas metades precisam ser iguais e mais largas que a tela.
  const tickerItems = Array.from({ length: 4 }, () => sportOptions).flat()

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <Pitch className="home-hero-pitch" />
        <div className="home-hero-inner">
          <h1 id="home-title" className="home-title">
            Ache a quadra.
            <span className="home-title-accent">Marque o jogo.</span>
          </h1>
          <p className="home-lead">
            Futebol society, futsal, futevôlei e beach tennis em um só lugar. Busque por cidade, modalidade e
            data, veja as quadras de cada arena e envie seu pedido de reserva.
          </p>
          <div className="home-search">
            <p className="home-search-label" aria-hidden="true">
              Onde vai ser o jogo?
            </p>
            <SearchBar values={values} onChange={setValues} onSubmit={search} minDate={todayISO()} />
          </div>
        </div>
      </section>

      <div className="home-ticker" aria-hidden="true">
        <div className="home-ticker-track">
          {tickerItems.map((sport, index) => (
            <span key={`${sport.id}-${index}`}>{sport.label}</span>
          ))}
        </div>
      </div>

      <section className="home-section" aria-labelledby="home-sports-title">
        <div className="home-section-inner">
          <SectionHead
            index="01"
            id="home-sports-title"
            title="Escolha a modalidade"
            text="Vá direto para as arenas que oferecem o seu esporte."
          />
          <ul className="home-sports" aria-label="Atalhos por modalidade">
            {sportOptions.map((sport) => (
              <li key={sport.id}>
                <Link
                  className={`home-sport home-sport-${sport.id}`}
                  to={`/arenas?modalidade=${sport.id}`}
                  aria-label={`Ver arenas de ${sport.label}`}
                >
                  <SportCourt sport={sport.id} />
                  <span className="home-sport-group">{sport.group}</span>
                  <span className="home-sport-name">{sport.label}</span>
                  <span className="home-sport-go">
                    Ver arenas
                    <Icon name="chevron" className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-featured-title">
        <div className="home-section-inner">
          <SectionHead
            index="02"
            id="home-featured-title"
            title="Arenas em destaque"
            text="Algumas das arenas cadastradas na plataforma."
            link={{ to: "/arenas", label: "Ver todas" }}
          />
          <SourceNotice source={featured.data?.source} />
          {featured.loading ? (
            <CardSkeletons count={3} />
          ) : featured.error ? (
            <div className="home-state">
              <Icon name="alert" className="size-5" />
              <p>Não foi possível carregar as arenas agora. {describeError(featured.error)}</p>
            </div>
          ) : arenas.length ? (
            <div className="card-grid">
              {arenas.map((arena) => (
                <ArenaCard key={arena.id} arena={arena} />
              ))}
            </div>
          ) : (
            <div className="home-state">
              <Icon name="arena" className="size-5" />
              <p>Nenhuma arena cadastrada ainda.</p>
            </div>
          )}
        </div>
      </section>

      <section className="home-section home-section-alt" aria-labelledby="home-how-title">
        <div className="home-section-inner">
          <SectionHead
            index="03"
            id="home-how-title"
            title="Como funciona"
            text="Da busca ao pedido de reserva em três jogadas."
          />
          <ol className="home-steps">
            {steps.map((step, index) => (
              <li className="home-step" key={step.title}>
                <span className="home-step-num" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="home-step-icon">
                  <Icon name={step.icon} className="size-5" />
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section" aria-labelledby="home-cta-title">
        <div className="home-cta">
          <Pitch className="home-cta-pitch" />
          <div className="home-cta-text">
            <p className="home-cta-kicker">Para gestores de arenas</p>
            <h2 id="home-cta-title">Tem uma arena? Coloque suas quadras em campo.</h2>
            <ul>
              {managerPoints.map((point) => (
                <li key={point}>
                  <Icon name="check" className="size-4" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <Link className="home-cta-button" to="/arenas/solicitar">
            Solicitar cadastro de arena
            <Icon name="chevron" className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
