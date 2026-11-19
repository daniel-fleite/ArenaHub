import { useEffect, useState } from "react"
import { useAsync } from "@/hooks/useAsync"
import { resolveSelectedArena } from "@/lib/courts"
import { listManagedArenas } from "@/services/courts"

const STORAGE_KEY = "arenahub:manager-arena"

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Arenas que o servidor autoriza para o gestor (admin: todas) e a arena selecionada.
 * A seleção é sempre uma das devolvidas pela API e fica lembrada entre as telas do painel.
 */
export function useManagedArena() {
  const result = useAsync((signal) => listManagedArenas(signal), [])
  const [selectedId, setSelectedId] = useState<string | null>(readStored)
  const arenas = result.data
  const arenaId = resolveSelectedArena(arenas ?? [], selectedId)
  const arena = arenas?.find((item) => item.id === arenaId) ?? null

  useEffect(() => {
    if (!arenaId) return
    try {
      window.localStorage.setItem(STORAGE_KEY, arenaId)
    } catch {
      // Armazenamento indisponível: a seleção só não é lembrada.
    }
  }, [arenaId])

  return {
    arenas,
    arena,
    selectArena: setSelectedId,
    loading: result.loading && !arenas,
    error: arenas ? null : result.error,
    reload: result.reload,
  }
}
