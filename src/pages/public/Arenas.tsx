import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArenaCard, SearchBar, type SearchValues } from "@/components/arena"
import { CardSkeletons, ErrorState, SourceNotice } from "@/components/common"
import { Button, EmptyState, Select, TextInput } from "@/components/ui"
import type { SportId } from "@/data/courts"
import { useAsync } from "@/hooks/useAsync"
import { todayISO } from "@/lib/format"
import { listArenas } from "@/services/arenas"
import { describeError } from "@/services/http"

type Order = "nome" | "menor-preco" | "maior-preco"

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export default function Arenas() {
  const [params, setParams] = useSearchParams()
  const cidade = params.get("cidade") ?? ""
  const modalidade = (params.get("modalidade") ?? "") as "" | SportId
  const data = params.get("data") ?? ""
  const q = params.get("q") ?? ""
  const ordem = (params.get("ordem") ?? "nome") as Order
  const precoMax = params.get("preco") ?? ""

  const result = useAsync((signal) => listArenas(signal), [])

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const list = (result.data?.data ?? []).filter((arena) => {
      if (cidade && !normalize(arena.city).includes(normalize(cidade))) return false
      if (modalidade && !arena.sports.includes(modalidade)) return false
      if (q && !normalize(arena.name).includes(normalize(q))) return false
      if (precoMax && (arena.priceFrom === undefined || arena.priceFrom > Number(precoMax))) return false
      return true
    })
    const price = (value?: number) => value ?? Number.POSITIVE_INFINITY
    return [...list].sort((a, b) => {
      if (ordem === "menor-preco") return price(a.priceFrom) - price(b.priceFrom)
      if (ordem === "maior-preco") return (b.priceFrom ?? -1) - (a.priceFrom ?? -1)
      return a.name.localeCompare(b.name, "pt-BR")
    })
  }, [result.data, cidade, modalidade, q, precoMax, ordem])

  const activeFilters = [cidade, modalidade, data, q, precoMax].filter(Boolean).length
  const clear = () => setParams(new URLSearchParams(), { replace: true })
  const searchValues: SearchValues = { cidade, modalidade, data }

  return (
    <div className="page-public">
      <header className="page-public-header">
        <h1 className="page-title">Explorar arenas</h1>
        <p className="page-description">Filtre por cidade, modalidade e data e compare as opções.</p>
      </header>

      <SearchBar
        values={searchValues}
        minDate={todayISO()}
        onChange={(values) => update({ cidade: values.cidade, modalidade: values.modalidade, data: values.data })}
        onSubmit={() => {}}
        submitLabel="Atualizar"
      />

      <section className="toolbar toolbar-wrap" aria-label="Filtros e ordenação">
        <TextInput
          icon="search"
          type="search"
          value={q}
          onChange={(event) => update({ q: event.target.value })}
          placeholder="Buscar pelo nome da arena"
          aria-label="Buscar pelo nome da arena"
          className="toolbar-search"
        />
        <TextInput
          type="number"
          min="0"
          value={precoMax}
          onChange={(event) => update({ preco: event.target.value })}
          placeholder="Preço máx. por hora (R$)"
          aria-label="Preço máximo por hora"
        />
        <Select value={ordem} onChange={(event) => update({ ordem: event.target.value })} aria-label="Ordenar por">
          <option value="nome">Ordenar: nome (A–Z)</option>
          <option value="menor-preco">Ordenar: menor preço</option>
          <option value="maior-preco">Ordenar: maior preço</option>
        </Select>
        {activeFilters > 0 && (
          <Button variant="secondary" onClick={clear}>
            Limpar filtros ({activeFilters})
          </Button>
        )}
      </section>

      <SourceNotice source={result.data?.source} />

      {result.loading ? (
        <CardSkeletons />
      ) : result.error ? (
        <ErrorState
          title="Não foi possível carregar as arenas"
          message={describeError(result.error)}
          onRetry={result.reload}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="arena"
          title={activeFilters ? "Nenhuma arena encontrada" : "Nenhuma arena disponível"}
          description={
            activeFilters
              ? "Nenhuma arena corresponde aos filtros. Ajuste a busca ou limpe os filtros."
              : "Ainda não há arenas cadastradas. Quando houver, elas aparecerão aqui."
          }
          action={
            activeFilters ? (
              <Button variant="secondary" onClick={clear}>
                Limpar filtros
              </Button>
            ) : (
              <Link className="button button-primary" to="/arenas/solicitar">
                Solicitar cadastro de arena
              </Link>
            )
          }
        />
      ) : (
        <>
          <p className="result-count" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "arena encontrada" : "arenas encontradas"}
          </p>
          <div className="card-grid">
            {filtered.map((arena) => (
              <ArenaCard key={arena.id} arena={arena} date={data} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
