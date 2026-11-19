import { useState } from "react"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { Alert, ErrorState, LoadingBlock, SourceNotice } from "@/components/common"
import { FormField } from "@/components/forms"
import { StatusBadge } from "@/components/status"
import { Button, EmptyState, Modal, PageHeader, Segmented, TextInput } from "@/components/ui"
import { useAsync } from "@/hooks/useAsync"
import { formatDate } from "@/lib/format"
import { listPlatformArenas, updatePlatformArena } from "@/services/admin"
import { describeError } from "@/services/http"
import type { PlatformArena } from "@/types"

type Filter = "todas" | "ativa" | "inativa"

export default function AdminArenas() {
  const result = useAsync((signal) => listPlatformArenas(signal), [])
  const [filter, setFilter] = useState<Filter>("todas")
  const [query, setQuery] = useState("")
  // Só versões devolvidas pelo servidor substituem a lista carregada.
  const [updated, setUpdated] = useState<Record<string, PlatformArena>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [toToggle, setToToggle] = useState<PlatformArena | null>(null)
  const [photoFor, setPhotoFor] = useState<PlatformArena | null>(null)
  const [photoUrl, setPhotoUrl] = useState("")
  const [previewOk, setPreviewOk] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const arenas = (result.data?.data ?? []).map((arena) => updated[arena.id] ?? arena)
  const term = query.trim().toLowerCase()
  const list = arenas.filter(
    (arena) =>
      (filter === "todas" || arena.status === filter) &&
      (!term || `${arena.name} ${arena.city} ${arena.managerName ?? ""}`.toLowerCase().includes(term)),
  )

  const run = async (action: () => Promise<PlatformArena>, message: (arena: PlatformArena) => string) => {
    setBusy(true)
    setError(null)
    try {
      const arena = await action()
      setUpdated((current) => ({ ...current, [arena.id]: arena }))
      setNotice(message(arena))
      setToToggle(null)
      setPhotoFor(null)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const openPhoto = (arena: PlatformArena) => {
    setError(null)
    setPhotoUrl(arena.imageUrl ?? "")
    setPreviewOk(arena.imageUrl ? true : null)
    setPhotoFor(arena)
  }

  const savePhoto = () => {
    if (!photoFor) return
    const url = photoUrl.trim()
    if (url && !/^https:\/\//i.test(url)) return setError("Use um endereço que comece com https://.")
    if (url && previewOk === false) return setError("A imagem não carregou. Confira o endereço.")
    run(
      () => updatePlatformArena(photoFor.id, { imageUrl: url || null }),
      (arena) => (url ? `Foto de “${arena.name}” atualizada.` : `Foto de “${arena.name}” removida.`),
    )
  }

  return (
    <div className="page">
      <PageHeader title="Arenas cadastradas" description="Situação, foto, gestores e movimento de todas as arenas da plataforma." />
      <SourceNotice source={result.data?.source} />
      {notice && (
        <Alert tone="success" title="Alteração salva pelo servidor">
          {notice}
        </Alert>
      )}
      <div className="toolbar toolbar-wrap">
        <TextInput icon="search" className="toolbar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por arena, cidade ou gestor" aria-label="Buscar arenas" />
        <Segmented
          label="Filtrar por status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todas", label: `Todas (${arenas.length})` },
            { value: "ativa", label: "Ativas" },
            { value: "inativa", label: "Inativas" },
          ]}
        />
      </div>

      {result.loading ? (
        <LoadingBlock label="Carregando arenas…" />
      ) : result.error ? (
        <ErrorState title="Não foi possível carregar as arenas" message={describeError(result.error)} onRetry={result.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="arena" title="Nenhuma arena encontrada" description="Não há arenas para os filtros aplicados." />
      ) : (
        <div className="panel responsive-table">
          <table>
            <thead>
              <tr>
                <th>Arena</th>
                <th>Local</th>
                <th>Gestores</th>
                <th>Quadras</th>
                <th>Reservas (30 dias)</th>
                <th>Cadastro</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((arena) => (
                <tr key={arena.id}>
                  <td data-label="Arena">
                    <div className="admin-arena-cell">
                      <span className="admin-arena-thumb">
                        {arena.imageUrl ? <img src={arena.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">Sem foto</span>}
                      </span>
                      <strong>{arena.name}</strong>
                    </div>
                  </td>
                  <td data-label="Local">
                    {arena.city}/{arena.state}
                  </td>
                  <td data-label="Gestores">{arena.managerName ?? "Sem gestor"}</td>
                  <td data-label="Quadras">{arena.courtCount ?? "—"}</td>
                  <td data-label="Reservas (30 dias)">{arena.reservations30d ?? "—"}</td>
                  <td data-label="Cadastro">{formatDate(arena.createdAt)}</td>
                  <td data-label="Status">
                    <StatusBadge status={arena.status} />
                  </td>
                  <td data-label="Ações">
                    <div className="row-actions">
                      <Button variant="secondary" onClick={() => openPhoto(arena)}>
                        Foto
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setError(null)
                          setToToggle(arena)
                        }}
                      >
                        {arena.status === "ativa" ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={toToggle !== null}
        title={toToggle?.status === "ativa" ? "Desativar arena" : "Ativar arena"}
        description={
          toToggle?.status === "ativa"
            ? `Desativar “${toToggle.name}”? Ela sai do catálogo e deixa de aceitar novas reservas. Reservas já feitas são mantidas.`
            : toToggle
              ? `Ativar “${toToggle.name}”? Ela volta ao catálogo e passa a aceitar reservas.`
              : undefined
        }
        confirmLabel={toToggle?.status === "ativa" ? "Desativar" : "Ativar"}
        busy={busy}
        error={error}
        onClose={() => setToToggle(null)}
        onConfirm={() =>
          toToggle &&
          run(
            () => updatePlatformArena(toToggle.id, { status: toToggle.status === "ativa" ? "inativa" : "ativa" }),
            (arena) => `“${arena.name}” agora está ${arena.status === "ativa" ? "ativa" : "inativa"}.`,
          )
        }
      />

      <Modal open={photoFor !== null} onClose={() => !busy && setPhotoFor(null)} title="Foto da arena" description={photoFor?.name}>
        <FormField id="arena-photo" label="Endereço da imagem (https)" hint="Use uma foto da arena ou da quadra. Deixe vazio para remover.">
          <TextInput
            id="arena-photo"
            type="url"
            value={photoUrl}
            onChange={(e) => {
              setPhotoUrl(e.target.value)
              setPreviewOk(null)
              setError(null)
            }}
            placeholder="https://…"
          />
        </FormField>
        {photoUrl.trim() && /^https:\/\//i.test(photoUrl.trim()) && (
          <div className="admin-photo-preview">
            <img
              src={photoUrl.trim()}
              alt="Pré-visualização da foto"
              onLoad={() => setPreviewOk(true)}
              onError={() => setPreviewOk(false)}
            />
          </div>
        )}
        {error && (
          <Alert tone="error" title="Foto não salva">
            {error}
          </Alert>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setPhotoFor(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={savePhoto} disabled={busy} aria-busy={busy}>
            {busy ? "Salvando…" : "Salvar foto"}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
