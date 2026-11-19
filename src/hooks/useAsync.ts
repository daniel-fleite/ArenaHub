import { useCallback, useEffect, useState } from "react"

interface AsyncState<T> {
  data: T | null
  error: unknown
  loading: boolean
}

/** Carrega dados com cancelamento, estado de erro e recarga manual. */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => ({ ...current, error: null, loading: true }))
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ data: null, error, loading: false })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { ...state, reload }
}
