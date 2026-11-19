import { Link } from "react-router-dom"
import { getSportLabel, sportOptions, type SportId } from "@/data/courts"
import { formatCurrency } from "@/lib/format"
import type { CatalogArena } from "@/types"
import { Button, Icon, Select, SportBadge, TextInput } from "./ui"

export function ArenaCard({ arena, date }: { arena: CatalogArena; date?: string }) {
  const to = `/arenas/${encodeURIComponent(arena.id)}${date ? `?data=${date}` : ""}`
  const location = [arena.city, arena.state].filter(Boolean).join(", ")
  return (
    <article className="arena-card">
      <Link to={to} className="arena-card-media" aria-label={`Ver ${arena.name}`}>
        {arena.imageUrl ? (
          <img src={arena.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="media-placeholder" aria-hidden="true">
            <Icon name="arena" className="size-6" />
          </span>
        )}
      </Link>
      <div className="arena-card-body">
        <h3 className="arena-card-title">
          <Link to={to}>{arena.name}</Link>
        </h3>
        <p className="arena-card-location">
          <Icon name="pin" className="size-4" />
          {location || "Localização não informada"}
        </p>
        {arena.sports.length ? (
          <div className="badge-list">
            {arena.sports.map((sport) => (
              <SportBadge key={sport} sport={sport} />
            ))}
          </div>
        ) : (
          <p className="muted-text">Modalidades não informadas</p>
        )}
        <div className="arena-card-footer">
          <span className="arena-card-price">
            {arena.priceFrom !== undefined ? (
              <>
                <small>a partir de</small>
                <strong>{formatCurrency(arena.priceFrom)}/h</strong>
              </>
            ) : (
              <small>Preços não informados</small>
            )}
          </span>
          <Link className="button button-secondary" to={to}>
            Ver arena
          </Link>
        </div>
      </div>
    </article>
  )
}

export interface SearchValues {
  cidade: string
  modalidade: "" | SportId
  data: string
}

/** Barra de busca (cidade, modalidade, data). Só devolve os valores; quem usa decide o destino. */
export function SearchBar({
  values,
  onChange,
  onSubmit,
  submitLabel = "Buscar arenas",
  minDate,
}: {
  values: SearchValues
  onChange: (values: SearchValues) => void
  onSubmit: () => void
  submitLabel?: string
  minDate?: string
}) {
  return (
    <form
      className="search-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <TextInput
        icon="pin"
        value={values.cidade}
        onChange={(event) => onChange({ ...values, cidade: event.target.value })}
        placeholder="Cidade"
        aria-label="Cidade"
      />
      <Select
        value={values.modalidade}
        onChange={(event) => onChange({ ...values, modalidade: event.target.value as SearchValues["modalidade"] })}
        aria-label="Modalidade esportiva"
      >
        <option value="">Todas as modalidades</option>
        {sportOptions.map((sport) => (
          <option key={sport.id} value={sport.id}>
            {sport.label}
          </option>
        ))}
      </Select>
      <TextInput
        type="date"
        value={values.data}
        min={minDate}
        onChange={(event) => onChange({ ...values, data: event.target.value })}
        aria-label="Data"
      />
      <Button type="submit" icon="search">
        {submitLabel}
      </Button>
    </form>
  )
}

export function sportsLabel(sports: SportId[]) {
  return sports.map(getSportLabel).join(", ")
}
