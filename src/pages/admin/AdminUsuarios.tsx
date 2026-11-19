import { useState } from "react"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { Alert, Badge, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { StatusBadge } from "@/components/status"
import { FormField } from "@/components/forms"
import { Button, EmptyState, Modal, PageHeader, Segmented, Select, TextInput } from "@/components/ui"
import { useAsync } from "@/hooks/useAsync"
import { formatDate } from "@/lib/format"
import { grantArenaAccess, listPlatformArenas, listPlatformUsers, revokeArenaAccess, setUserStatus } from "@/services/admin"
import { describeError } from "@/services/http"
import type { PlatformUser } from "@/types"

type Filter = "todos" | "gestores" | "suspensos"
type Pending =
  | { kind: "status"; user: PlatformUser }
  | { kind: "revoke"; user: PlatformUser; arena: { id: string; name: string } }

export default function AdminUsuarios() {
  const result = useAsync((signal) => listPlatformUsers(signal), [])
  const [filter, setFilter] = useState<Filter>("todos")
  const [query, setQuery] = useState("")
  // Somente versões devolvidas pelo servidor substituem a lista carregada.
  const [updated, setUpdated] = useState<Record<string, PlatformUser>>({})
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const arenaOptions = useAsync((signal) => listPlatformArenas(signal), [])
  const [granting, setGranting] = useState<PlatformUser | null>(null)
  const [grantArenaId, setGrantArenaId] = useState("")

  const users = (result.data?.data ?? []).map((user) => updated[user.id] ?? user)
  const term = query.trim().toLowerCase()
  const list = users.filter(
    (user) =>
      (filter === "todos" ||
        (filter === "gestores" && user.roles.includes("manager")) ||
        (filter === "suspensos" && user.status === "suspenso")) &&
      (!term || `${user.name} ${user.email}`.toLowerCase().includes(term)),
  )

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const next =
        pending.kind === "status"
          ? await setUserStatus(pending.user.id, pending.user.status === "ativo" ? "suspenso" : "ativo")
          : await revokeArenaAccess(pending.user.id, pending.arena.id)
      setUpdated((current) => ({ ...current, [next.id]: next }))
      setDone("Alteração registrada pelo servidor.")
      setPending(null)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmGrant = async () => {
    if (!granting || !grantArenaId) return setError("Selecione a arena.")
    setBusy(true)
    setError(null)
    try {
      const next = await grantArenaAccess(granting.id, grantArenaId)
      setUpdated((current) => ({ ...current, [next.id]: next }))
      const arenaName = arenaOptions.data?.data.find((a) => a.id === grantArenaId)?.name ?? "a arena"
      setDone(`${next.name} agora gerencia ${arenaName}.`)
      setGranting(null)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const open = (next: Pending) => {
    setError(null)
    setDone(null)
    setPending(next)
  }

  return (
    <div className="page">
      <PageHeader
        title="Usuários e gestores"
        description="Gerencie o status das contas e o acesso dos gestores às arenas. O papel de administrador é concedido apenas no backend."
      />
      <SourceNotice source={result.data?.source} />
      {done && <Alert tone="success">{done}</Alert>}
      <div className="toolbar toolbar-wrap">
        <TextInput icon="search" className="toolbar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuários" />
        <Segmented
          label="Filtrar usuários"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Todos" },
            { value: "gestores", label: "Gestores" },
            { value: "suspensos", label: "Suspensos" },
          ]}
        />
      </div>

      {result.loading ? (
        <LoadingBlock label="Carregando usuários…" />
      ) : result.error ? (
        <ErrorState title="Não foi possível carregar os usuários" message={describeError(result.error)} onRetry={result.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="community" title="Nenhum usuário encontrado" description="Não há usuários para os filtros aplicados." />
      ) : (
        <div className="panel responsive-table">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papéis</th>
                <th>Arenas</th>
                <th>Desde</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((user) => (
                <tr key={user.id}>
                  <td data-label="Usuário"><strong>{user.name}</strong><small>{user.email}</small></td>
                  <td data-label="Papéis">
                    <div className="badge-list">
                      <Badge tone="info">Atleta</Badge>
                      {user.roles.includes("manager") && <Badge tone="success">Gestor</Badge>}
                      {user.roles.includes("admin") && <Badge tone="warning">Admin</Badge>}
                    </div>
                  </td>
                  <td data-label="Arenas">
                    {user.arenas.length ? (
                      <div className="arena-links">
                        {user.arenas.map((arena) => (
                          <span key={arena.id} className="arena-chip">
                            {arena.name}
                            <button type="button" aria-label={`Revogar acesso a ${arena.name}`} onClick={() => open({ kind: "revoke", user, arena })}>
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Desde">{formatDate(user.createdAt)}</td>
                  <td data-label="Status"><StatusBadge status={user.status} /></td>
                  <td data-label="Ações">
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setError(null)
                          setDone(null)
                          setGrantArenaId("")
                          setGranting(user)
                        }}
                        disabled={user.status !== "ativo"}
                      >
                        Vincular arena
                      </Button>
                      {!user.roles.includes("admin") && (
                        <Button variant="ghost" onClick={() => open({ kind: "status", user })}>
                          {user.status === "ativo" ? "Suspender" : "Reativar"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={granting !== null}
        onClose={() => !busy && setGranting(null)}
        title="Vincular arena"
        description={granting ? `${granting.name} passará a gerenciar a arena escolhida (quadras, reservas, vendas e indicadores).` : undefined}
      >
        <FormField id="grant-arena" label="Arena">
          <Select id="grant-arena" value={grantArenaId} onChange={(e) => setGrantArenaId(e.target.value)}>
            <option value="">Selecione</option>
            {(arenaOptions.data?.data ?? [])
              .filter((arena) => !granting?.arenas.some((a) => a.id === arena.id))
              .map((arena) => (
                <option key={arena.id} value={arena.id}>
                  {arena.name} · {arena.city}/{arena.state}
                </option>
              ))}
          </Select>
        </FormField>
        {error && <Alert tone="error" title="Vínculo não criado">{error}</Alert>}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setGranting(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirmGrant} disabled={busy || !grantArenaId} aria-busy={busy}>
            {busy ? "Salvando…" : "Vincular"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "revoke" ? "Revogar acesso à arena" : pending?.user.status === "ativo" ? "Suspender conta" : "Reativar conta"}
        description={
          pending?.kind === "revoke"
            ? `Remover o acesso de ${pending.user.name} à arena “${pending.arena.name}”?`
            : pending
              ? `${pending.user.status === "ativo" ? "Suspender" : "Reativar"} a conta de ${pending.user.name}?`
              : undefined
        }
        confirmLabel="Confirmar"
        busy={busy}
        error={error}
        onClose={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  )
}
