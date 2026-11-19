import { useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Alert, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { Button, Icon, SportBadge, TextInput } from "@/components/ui"
import { useAsync } from "@/hooks/useAsync"
import { formatCurrency, todayISO } from "@/lib/format"
import { getArena, getAvailability } from "@/services/arenas"
import { describeError } from "@/services/http"

export default function ArenaDetalhe() {
  const { id = "" } = useParams()
  const [params] = useSearchParams()
  const [date, setDate] = useState(params.get("data") || todayISO())

  const arena = useAsync((signal) => getArena(id, signal), [id])
  const availability = useAsync((signal) => getAvailability(id, date, signal), [id, date])

  const slotsByCourt = useMemo(
    () => new Map((availability.data?.data ?? []).map((item) => [item.courtId, item.slots])),
    [availability.data],
  )

  if (arena.loading) {
    return (
      <div className="page-public">
        <LoadingBlock label="Carregando arena…" />
      </div>
    )
  }
  if (arena.error || !arena.data) {
    return (
      <div className="page-public">
        <ErrorState
          title="Não foi possível carregar a arena"
          message={describeError(arena.error)}
          onRetry={arena.reload}
        />
        <p className="back-link">
          <Link to="/arenas">← Voltar às arenas</Link>
        </p>
      </div>
    )
  }

  const { data: item, source } = arena.data
  const location = [item.city, item.state].filter(Boolean).join(", ")

  return (
    <div className="page-public">
      <p className="back-link">
        <Link to="/arenas">← Voltar às arenas</Link>
      </p>
      <SourceNotice source={source} />

      <section className="detail-hero">
        <div className="detail-media">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={`Foto de ${item.name}`} />
          ) : (
            <span className="media-placeholder" aria-hidden="true">
              <Icon name="arena" className="size-6" />
            </span>
          )}
        </div>
        <div className="detail-info">
          <h1 className="page-title">{item.name}</h1>
          <p className="arena-card-location">
            <Icon name="pin" className="size-4" />
            {[item.address, location].filter(Boolean).join(" · ") || "Localização não informada"}
          </p>
          {item.sports.length > 0 && (
            <div className="badge-list">
              {item.sports.map((sport) => (
                <SportBadge key={sport} sport={sport} />
              ))}
            </div>
          )}
          <p className="detail-description">{item.description ?? "A arena ainda não publicou uma descrição."}</p>
          <Link className="button button-primary" to={`/reservar/${encodeURIComponent(item.id)}?data=${date}`}>
            Reservar nesta arena
          </Link>
        </div>
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h2>Quadras, preços e horários</h2>
          <TextInput
            type="date"
            value={date}
            min={todayISO()}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            aria-label="Data para consultar horários"
          />
        </div>

        {item.courts.length === 0 ? (
          <Alert tone="info" title="Quadras não informadas">
            O servidor ainda não devolve as quadras desta arena. Elas aparecerão aqui quando o backend
            fornecer esses dados.
          </Alert>
        ) : (
          <>
            {availability.error ? (
              <Alert
                tone="warning"
                title="Horários indisponíveis no momento"
                action={
                  <Button variant="secondary" onClick={availability.reload}>
                    Tentar novamente
                  </Button>
                }
              >
                {describeError(availability.error)}
              </Alert>
            ) : (
              <SourceNotice source={availability.data?.source} />
            )}
            <div className="court-list">
              {item.courts.map((court) => {
                const slots = slotsByCourt.get(court.id)
                return (
                  <article className="court-card" key={court.id}>
                    <header>
                      <div>
                        <h3>{court.name}</h3>
                        <div className="badge-list">
                          {court.sports.map((sport) => (
                            <SportBadge key={sport} sport={sport} />
                          ))}
                        </div>
                      </div>
                      <div className="court-price">
                        <strong>{formatCurrency(court.hourlyRate)}</strong>
                        <small>por hora{court.capacity ? ` · até ${court.capacity} pessoas` : ""}</small>
                      </div>
                    </header>
                    {availability.loading ? (
                      <LoadingBlock label="Consultando horários…" />
                    ) : slots ? (
                      <div className="slot-grid" role="group" aria-label={`Horários de ${court.name}`}>
                        {slots.map((slot) =>
                          slot.available ? (
                            <Link
                              key={slot.time}
                              className="slot"
                              to={`/reservar/${encodeURIComponent(item.id)}?quadra=${encodeURIComponent(court.id)}&data=${date}&hora=${slot.time}`}
                            >
                              {slot.time}
                            </Link>
                          ) : (
                            <span key={slot.time} className="slot is-taken" aria-label={`${slot.time} indisponível`}>
                              {slot.time}
                            </span>
                          ),
                        )}
                      </div>
                    ) : (
                      !availability.error && <p className="muted-text">Sem informação de horários para esta data.</p>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
