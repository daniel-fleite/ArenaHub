import { useMemo, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { Alert, DefinitionList, ErrorState, FieldError, LoadingBlock, Stepper } from "@/components/common"
import { FormField, describedBy } from "@/components/forms"
import { StatusBadge } from "@/components/status"
import { Button, Select, TextInput } from "@/components/ui"
import { getSportLabel, sportOptions, timeSlots, type SportId } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { formatCurrency, formatDate, todayISO } from "@/lib/format"
import { getArena, getAvailability } from "@/services/arenas"
import { createReservation } from "@/services/bookings"
import { describeError } from "@/services/http"
import type { CatalogArena, Reservation } from "@/types"

export default function Reservar() {
  const { arenaId = "" } = useParams()
  const arena = useAsync((signal) => getArena(arenaId, signal), [arenaId])

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
        <ErrorState title="Não foi possível carregar a arena" message={describeError(arena.error)} onRetry={arena.reload} />
      </div>
    )
  }
  return <ReservaFlow arena={arena.data.data} demo={arena.data.source === "demo"} />
}

type Errors = Partial<Record<"sport" | "court" | "date" | "time", string>>

function ReservaFlow({ arena, demo }: { arena: CatalogArena; demo: boolean }) {
  const [params] = useSearchParams()
  const initialCourt = arena.courts.find((court) => court.id === params.get("quadra"))

  const [step, setStep] = useState(0)
  const [sport, setSport] = useState<"" | SportId>(initialCourt?.sports[0] ?? "")
  const [courtId, setCourtId] = useState(initialCourt?.id ?? "")
  const [date, setDate] = useState(params.get("data") || todayISO())
  const [time, setTime] = useState(params.get("hora") ?? "")
  const [duration, setDuration] = useState(1)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<Reservation | null>(null)

  const sports = useMemo(
    () => sportOptions.filter((option) => arena.sports.includes(option.id)),
    [arena.sports],
  )
  const courts = arena.courts.filter((court) => !sport || court.sports.includes(sport))
  const court = arena.courts.find((item) => item.id === courtId)

  const availability = useAsync(
    (signal) =>
      date ? getAvailability(arena.id, date, signal) : Promise.resolve({ data: [], source: "api" as const }),
    [arena.id, date],
  )
  const slotInfo = availability.data?.data.find((item) => item.courtId === courtId)?.slots
  const availabilityKnown = Boolean(slotInfo)
  const timeOptions = slotInfo ?? timeSlots.map((slot) => ({ time: slot, available: true }))
  const total = court?.hourlyRate !== undefined ? court.hourlyRate * duration : undefined

  const clear = (...keys: (keyof Errors)[]) =>
    setErrors((current) => {
      const next = { ...current }
      keys.forEach((key) => delete next[key])
      return next
    })

  const validate = () => {
    const next: Errors = {}
    if (!sport) next.sport = "Selecione a modalidade."
    if (!courtId) next.court = "Selecione a quadra."
    if (!date || date < todayISO()) next.date = "Escolha uma data a partir de hoje."
    if (!time) next.time = "Selecione o horário."
    else if (Number(time.slice(0, 2)) + duration > 24) next.time = "A reserva precisa terminar no mesmo dia."
    else if (
      availabilityKnown &&
      Array.from({ length: duration }, (_, i) => `${String(Number(time.slice(0, 2)) + i).padStart(2, "0")}:00`).some(
        (slot) => slotInfo?.find((item) => item.time === slot)?.available === false,
      )
    )
      next.time = duration > 1 ? "Algum horário dentro dessa duração não está disponível." : "Este horário não está disponível."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const send = async () => {
    if (!sport) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const reservation = await createReservation({
        arenaId: arena.id,
        courtId,
        sport,
        date,
        time,
        duration,
      })
      setCreated(reservation)
      setStep(2)
    } catch (error) {
      setSubmitError(describeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-public narrow">
      <p className="back-link">
        <Link to={`/arenas/${encodeURIComponent(arena.id)}`}>← Voltar para {arena.name}</Link>
      </p>
      <h1 className="page-title">Reservar em {arena.name}</h1>
      {demo && (
        <Alert tone="info" title="Dados de demonstração">
          Arena fictícia: o envio do pedido não é realizado no modo demonstração.
        </Alert>
      )}
      <Stepper steps={["Escolha", "Revisão", "Resultado"]} current={step} />

      {step === 0 && (
        <form
          className="flow-card"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (validate()) setStep(1)
          }}
        >
          <div className="form-grid">
            <FormField id="res-sport" label="Modalidade" error={errors.sport}>
              <Select
                id="res-sport"
                value={sport}
                onChange={(event) => {
                  setSport(event.target.value as "" | SportId)
                  setCourtId("")
                  setTime("")
                  clear("sport", "court", "time")
                }}
                aria-invalid={Boolean(errors.sport)}
                aria-describedby={describedBy("res-sport", errors.sport)}
              >
                <option value="">Selecione</option>
                {sports.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="res-court" label="Quadra" error={errors.court}>
              <Select
                id="res-court"
                value={courtId}
                disabled={!sport || courts.length === 0}
                onChange={(event) => {
                  setCourtId(event.target.value)
                  setTime("")
                  clear("court", "time")
                }}
                aria-invalid={Boolean(errors.court)}
                aria-describedby={describedBy("res-court", errors.court)}
              >
                <option value="">{courts.length || !sport ? "Selecione" : "Nenhuma quadra compatível"}</option>
                {courts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatCurrency(item.hourlyRate)}/h
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="res-date" label="Data" error={errors.date}>
              <TextInput
                id="res-date"
                type="date"
                min={todayISO()}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                  setTime("")
                  clear("date", "time")
                }}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={describedBy("res-date", errors.date)}
              />
            </FormField>
            <FormField id="res-duration" label="Duração">
              <Select id="res-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                {[1, 2, 3, 4].map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} {hours === 1 ? "hora" : "horas"}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="field-group">
            <span className="field-label" id="res-time-label">
              Horário
            </span>
            {!courtId ? (
              <p className="muted-text">Selecione a quadra para ver os horários.</p>
            ) : (
              <>
                {availability.loading ? (
                  <LoadingBlock label="Consultando horários…" />
                ) : !availabilityKnown ? (
                  <Alert tone="warning" title="Disponibilidade não verificada">
                    {availability.error ? describeError(availability.error) : "O servidor não informou horários."}{" "}
                    Você pode escolher um horário, mas a disponibilidade só será validada pelo servidor.
                  </Alert>
                ) : null}
                <div className="slot-grid" role="radiogroup" aria-labelledby="res-time-label">
                  {timeOptions.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      role="radio"
                      aria-checked={time === slot.time}
                      disabled={!slot.available}
                      className={`slot ${time === slot.time ? "is-selected" : ""} ${slot.available ? "" : "is-taken"}`}
                      onClick={() => {
                        setTime(slot.time)
                        clear("time")
                      }}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </>
            )}
            <FieldError message={errors.time} />
          </div>

          <div className="flow-actions">
            <Button type="submit">Revisar reserva</Button>
          </div>
        </form>
      )}

      {step === 1 && sport && (
        <div className="flow-card">
          <h2 className="flow-title">Revise os dados do pedido</h2>
          <DefinitionList
            items={[
              { label: "Arena", value: arena.name },
              { label: "Quadra", value: court?.name ?? "—" },
              { label: "Modalidade", value: getSportLabel(sport) },
              { label: "Data", value: formatDate(date) },
              { label: "Horário", value: `${time} · ${duration} ${duration === 1 ? "hora" : "horas"}` },
              {
                label: "Valor estimado",
                value: total !== undefined ? formatCurrency(total) : "Não informado pela arena",
              },
            ]}
          />
          <Alert tone="warning" title="Esta reserva ainda não foi enviada">
            Ela só passa a existir depois que o servidor validar a disponibilidade e confirmar o registro. O
            valor acima é uma estimativa.
          </Alert>
          {submitError && (
            <Alert tone="error" title="Reserva não registrada">
              {submitError} Seus dados foram mantidos: você pode tentar novamente ou voltar para ajustar.
              {/perfil/i.test(submitError) && (
                <>
                  {" "}
                  <Link to="/perfil">Completar meu perfil</Link>
                </>
              )}
            </Alert>
          )}
          <div className="flow-actions">
            <Button variant="secondary" onClick={() => setStep(0)} disabled={submitting}>
              Voltar e editar
            </Button>
            <Button onClick={send} disabled={submitting} aria-busy={submitting}>
              {submitting ? "Enviando…" : "Enviar pedido de reserva"}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && created && (
        <div className="flow-card">
          <Alert tone="success" title="Pedido registrado pelo servidor">
            O servidor confirmou o registro do pedido. O status abaixo é o informado por ele.
          </Alert>
          <DefinitionList
            items={[
              { label: "Arena", value: created.arenaName || arena.name },
              { label: "Quadra", value: created.courtName || court?.name || "—" },
              { label: "Data e horário", value: `${formatDate(created.date)} · ${created.time}` },
              { label: "Status", value: <StatusBadge status={created.status} /> },
            ]}
          />
          <div className="flow-actions">
            <Link className="button button-secondary" to="/arenas">
              Explorar outras arenas
            </Link>
            <Link className="button button-primary" to="/minhas-reservas">
              Ver minhas reservas
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
