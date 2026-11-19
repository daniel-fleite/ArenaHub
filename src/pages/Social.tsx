import { useState } from "react"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { ArenaSelect, ManagerArenaGate } from "@/components/ManagerArenaGate"
import { Alert, ErrorState, LoadingBlock } from "@/components/common"
import { FormField } from "@/components/forms"
import { useAsync } from "@/hooks/useAsync"
import { useManagedArena } from "@/hooks/useManagedArena"
import { describeError } from "@/services/http"
import { createPost, deletePost, listPosts } from "@/services/manager"
import type { ArenaPost, ManagedArena, PostKind } from "@/types"
import { Button, EmptyState, Modal, PageHeader, SectionTitle, Select, Textarea } from "../components/ui"

const kindLabel: Record<PostKind, string> = {
  aviso: "Aviso",
  promocao: "Promoção",
  evento: "Evento",
  resultado: "Resultado",
}

export default function Social() {
  const state = useManagedArena()
  return (
    <div className="page social-page">
      <PageHeader title="Arena Social" description="Avisos, promoções, eventos e resultados da sua arena." />
      <ManagerArenaGate state={state}>{(arena) => <SocialBody key={arena.id} arena={arena} picker={<ArenaSelect state={state} />} />}</ManagerArenaGate>
    </div>
  )
}

function SocialBody({ arena, picker }: { arena: ManagedArena; picker: React.ReactNode }) {
  const result = useAsync((signal) => listPosts(arena.id, signal), [arena.id])
  const [showCreate, setShowCreate] = useState(false)
  const [kind, setKind] = useState<PostKind>("aviso")
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<ArenaPost | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const posts = result.data ?? []

  const publish = async () => {
    if (!content.trim()) return setFormError("Escreva a publicação.")
    setSaving(true)
    setFormError(null)
    try {
      await createPost(arena.id, { kind, content: content.trim() })
      setShowCreate(false)
      setContent("")
      result.reload()
    } catch (error) {
      setFormError(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setBusy(true)
    setDeleteError(null)
    try {
      await deletePost(arena.id, toDelete.id)
      setToDelete(null)
      result.reload()
    } catch (error) {
      setDeleteError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const counts = posts.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {})

  return (
    <>
      <div className="view-row view-row-split">
        <div className="page-header-actions">{picker}</div>
        <Button
          icon="plus"
          onClick={() => {
            setFormError(null)
            setShowCreate(true)
          }}
        >
          Nova publicação
        </Button>
      </div>
      <div className="social-layout">
        <div>
          {result.loading && !result.data ? (
            <LoadingBlock label="Carregando publicações…" />
          ) : result.error ? (
            <ErrorState title="Não foi possível carregar as publicações" message={describeError(result.error)} onRetry={result.reload} />
          ) : posts.length === 0 ? (
            <EmptyState
              icon="community"
              title="Nenhuma publicação ainda"
              description="Publique avisos, promoções e resultados para a comunidade da arena."
              action={
                <Button icon="plus" onClick={() => setShowCreate(true)}>
                  Criar publicação
                </Button>
              }
            />
          ) : (
            <ul className="post-list">
              {posts.map((post) => (
                <li className="post-card" key={post.id}>
                  <header>
                    <span className={`post-kind post-kind-${post.kind}`}>{kindLabel[post.kind]}</span>
                    <small>
                      {post.authorName ?? arena.name} ·{" "}
                      {new Date(post.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </small>
                  </header>
                  <p>{post.content}</p>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDeleteError(null)
                        setToDelete(post)
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="community-note">
          <span className="placeholder-label">Resumo</span>
          <SectionTitle>{arena.name}</SectionTitle>
          <p>
            {posts.length} publicação(ões) ·{" "}
            {Object.entries(kindLabel)
              .map(([value, label]) => `${counts[value] ?? 0} ${label.toLowerCase()}`)
              .join(" · ")}
          </p>
        </aside>
      </div>

      <Modal open={showCreate} onClose={() => !saving && setShowCreate(false)} title="Nova publicação" description={`Publicar em ${arena.name}`}>
        <FormField id="post-kind" label="Tipo">
          <Select id="post-kind" value={kind} onChange={(e) => setKind(e.target.value as PostKind)}>
            {Object.entries(kindLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="post-content" label="Conteúdo">
          <Textarea id="post-content" rows={6} maxLength={1000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escreva sua publicação" />
        </FormField>
        {formError && (
          <Alert tone="error" title="Publicação não enviada">
            {formError}
          </Alert>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={publish} disabled={saving} aria-busy={saving}>
            {saving ? "Publicando…" : "Publicar"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir publicação"
        description="Esta publicação será removida."
        confirmLabel="Excluir"
        busy={busy}
        error={deleteError}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
