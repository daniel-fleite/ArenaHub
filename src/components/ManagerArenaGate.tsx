import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { ErrorState, LoadingBlock } from "@/components/common"
import { Button, EmptyState, Select } from "@/components/ui"
import type { useManagedArena } from "@/hooks/useManagedArena"
import { describeError } from "@/services/http"
import type { ManagedArena } from "@/types"

/** Estados comuns das telas do gestor: carregando, erro, sem arenas e o conteúdo da arena. */
export function ManagerArenaGate({
  state,
  children,
}: {
  state: ReturnType<typeof useManagedArena>
  children: (arena: ManagedArena) => ReactNode
}) {
  const navigate = useNavigate()
  if (state.loading) return <LoadingBlock label="Carregando suas arenas…" />
  if (state.error) {
    return (
      <ErrorState title="Não foi possível carregar suas arenas" message={describeError(state.error)} onRetry={state.reload} />
    )
  }
  if (!state.arena) {
    return (
      <EmptyState
        icon="arena"
        title="Nenhuma arena vinculada à sua conta"
        description="Este painel mostra apenas arenas aprovadas para você. Solicite o cadastro de uma arena e aguarde a análise."
        action={
          <Button icon="plus" onClick={() => navigate("/arenas/solicitar")}>
            Solicitar cadastro de arena
          </Button>
        }
      />
    )
  }
  return <>{children(state.arena)}</>
}

/** Seletor exibido só quando o gestor tem mais de uma arena. */
export function ArenaSelect({ state }: { state: ReturnType<typeof useManagedArena> }) {
  if (!state.arenas || state.arenas.length < 2 || !state.arena) return null
  return (
    <Select value={state.arena.id} onChange={(event) => state.selectArena(event.target.value)} aria-label="Selecionar arena">
      {state.arenas.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  )
}
