import { useState } from "react"
import { ConfirmDialog } from "@/components/ActionDialogs"
import { ArenaSelect, ManagerArenaGate } from "@/components/ManagerArenaGate"
import { Alert, ErrorState, LoadingBlock } from "@/components/common"
import { FormField } from "@/components/forms"
import { useAsync } from "@/hooks/useAsync"
import { useManagedArena } from "@/hooks/useManagedArena"
import { formatCurrency } from "@/lib/format"
import { describeError } from "@/services/http"
import { createSale, deleteProduct, deleteSale, listProducts, listSales, saveProduct } from "@/services/manager"
import type { ManagedArena, Product, ProductCategory, Sale } from "@/types"
import { Button, EmptyState, Modal, PageHeader, Segmented, Select, TextInput, Textarea } from "../components/ui"

type Section = "produtos" | "historico"

const categoryLabel: Record<ProductCategory, string> = {
  bebida: "Bebida",
  alimento: "Alimento",
  equipamento: "Equipamento",
  combo: "Combo",
  servico: "Serviço",
  outro: "Outro",
}

interface ProductForm {
  name: string
  category: ProductCategory
  price: string
  stock: string
  description: string
  active: boolean
}
const emptyForm: ProductForm = { name: "", category: "combo", price: "", stock: "", description: "", active: true }
const toNumber = (value: string) => Number(value.trim().replace(",", "."))

export default function Vendas() {
  const state = useManagedArena()
  return (
    <div className="page">
      <PageHeader title="Vendas & Combos" description="Gerencie produtos e registre as vendas da arena." />
      <ManagerArenaGate state={state}>{(arena) => <SalesBody key={arena.id} arena={arena} picker={<ArenaSelect state={state} />} />}</ManagerArenaGate>
    </div>
  )
}

function SalesBody({ arena, picker }: { arena: ManagedArena; picker: React.ReactNode }) {
  const [section, setSection] = useState<Section>("produtos")
  const products = useAsync((signal) => listProducts(arena.id, signal), [arena.id])
  const sales = useAsync((signal) => listSales(arena.id, signal), [arena.id])
  const [notice, setNotice] = useState<string | null>(null)

  const [editing, setEditing] = useState<Product | "new" | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [selling, setSelling] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState("1")
  const [toRemove, setToRemove] = useState<{ kind: "product"; item: Product } | { kind: "sale"; item: Sale } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const reloadAll = () => {
    products.reload()
    sales.reload()
  }

  const openProduct = (product: Product | "new") => {
    setEditing(product)
    setFormError(null)
    setForm(
      product === "new"
        ? emptyForm
        : {
            name: product.name,
            category: product.category,
            price: String(product.price).replace(".", ","),
            stock: product.stock != null ? String(product.stock) : "",
            description: product.description ?? "",
            active: product.active,
          },
    )
  }

  const saveForm = async () => {
    if (!editing) return
    const price = toNumber(form.price)
    if (form.name.trim().length < 2) return setFormError("Informe o nome do produto.")
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) return setFormError("Informe um preço válido.")
    const stock = form.stock.trim() ? Number(form.stock) : null
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return setFormError("Estoque deve ser um número inteiro.")
    setSaving(true)
    setFormError(null)
    try {
      const saved = await saveProduct(
        arena.id,
        {
          name: form.name.trim(),
          category: form.category,
          price: Math.round(price * 100) / 100,
          stock,
          description: form.description.trim() || null,
          active: form.active,
        },
        editing === "new" ? undefined : editing.id,
      )
      setNotice(editing === "new" ? `Produto “${saved.name}” cadastrado.` : `Produto “${saved.name}” atualizado.`)
      setEditing(null)
      products.reload()
    } catch (error) {
      setFormError(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const confirmSale = async () => {
    if (!selling) return
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return setDialogError("Quantidade deve ser de 1 a 999.")
    setBusy(true)
    setDialogError(null)
    try {
      const sale = await createSale(arena.id, { productId: selling.id, quantity: qty })
      setNotice(`Venda registrada: ${sale.quantity}× ${sale.productName} (${formatCurrency(sale.total)}).`)
      setSelling(null)
      reloadAll()
    } catch (error) {
      setDialogError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!toRemove) return
    setBusy(true)
    setDialogError(null)
    try {
      if (toRemove.kind === "product") {
        await deleteProduct(arena.id, toRemove.item.id)
        setNotice(`Produto “${toRemove.item.name}” excluído.`)
      } else {
        await deleteSale(arena.id, toRemove.item.id)
        setNotice(`Venda de ${toRemove.item.productName} estornada.`)
      }
      setToRemove(null)
      reloadAll()
    } catch (error) {
      setDialogError(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const productList = products.data ?? []
  const saleList = sales.data ?? []

  return (
    <>
      <div className="view-row view-row-split">
        <Segmented
          label="Seções de vendas"
          value={section}
          onChange={setSection}
          options={[
            { value: "produtos", label: "Produtos" },
            { value: "historico", label: "Histórico de vendas" },
          ]}
        />
        <div className="page-header-actions">
          {picker}
          <Button icon="plus" onClick={() => openProduct("new")}>
            Novo produto
          </Button>
        </div>
      </div>

      {notice && (
        <Alert tone="success" title="Alteração salva pelo servidor">
          {notice}
        </Alert>
      )}

      {section === "produtos" ? (
        products.loading && !products.data ? (
          <LoadingBlock label="Carregando produtos…" />
        ) : products.error ? (
          <ErrorState title="Não foi possível carregar os produtos" message={describeError(products.error)} onRetry={products.reload} />
        ) : productList.length === 0 ? (
          <EmptyState
            icon="package"
            title="Nenhum produto cadastrado"
            description="Cadastre combos, bebidas e adicionais para registrar vendas na arena."
            action={
              <Button icon="plus" onClick={() => openProduct("new")}>
                Cadastrar produto
              </Button>
            }
          />
        ) : (
          <div className="responsive-table panel">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Vendidos</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {productList.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Produto">
                      <strong>{p.name}</strong>
                      {p.description && <small>{p.description}</small>}
                    </td>
                    <td data-label="Categoria">{categoryLabel[p.category]}</td>
                    <td data-label="Preço">{formatCurrency(p.price)}</td>
                    <td data-label="Estoque">{p.stock ?? "Sem controle"}</td>
                    <td data-label="Vendidos">{p.soldQuantity}</td>
                    <td data-label="Situação">
                      <span className={`status-badge status-${p.active ? "ativa" : "inativa"}`}>{p.active ? "Ativo" : "Inativo"}</span>
                    </td>
                    <td data-label="Ações">
                      <div className="row-actions">
                        <Button
                          onClick={() => {
                            setQuantity("1")
                            setDialogError(null)
                            setSelling(p)
                          }}
                          disabled={!p.active || p.stock === 0}
                        >
                          Vender
                        </Button>
                        <Button variant="secondary" onClick={() => openProduct(p)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDialogError(null)
                            setToRemove({ kind: "product", item: p })
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : sales.loading && !sales.data ? (
        <LoadingBlock label="Carregando vendas…" />
      ) : sales.error ? (
        <ErrorState title="Não foi possível carregar as vendas" message={describeError(sales.error)} onRetry={sales.reload} />
      ) : saleList.length === 0 ? (
        <EmptyState icon="package" title="Nenhuma venda registrada" description="As vendas registradas na aba Produtos aparecerão aqui." />
      ) : (
        <div className="responsive-table panel">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Preço unitário</th>
                <th>Total</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {saleList.map((s) => (
                <tr key={s.id}>
                  <td data-label="Data">
                    {new Date(s.soldAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td data-label="Produto">
                    <strong>{s.productName}</strong>
                    <small>{categoryLabel[s.category]}</small>
                  </td>
                  <td data-label="Quantidade">{s.quantity}</td>
                  <td data-label="Preço unitário">{formatCurrency(s.unitPrice)}</td>
                  <td data-label="Total">{formatCurrency(s.total)}</td>
                  <td data-label="Ações">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDialogError(null)
                        setToRemove({ kind: "sale", item: s })
                      }}
                    >
                      Estornar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "Novo produto" : "Editar produto"}
        description={`Arena: ${arena.name}`}
      >
        <div className="form-grid">
          <FormField id="product-name" label="Nome do produto" className="field-span">
            <TextInput id="product-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Combo água + isotônico" />
          </FormField>
          <FormField id="product-category" label="Categoria">
            <Select id="product-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}>
              {Object.entries(categoryLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="product-price" label="Preço (R$)">
            <TextInput id="product-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Ex.: 15,00" />
          </FormField>
          <FormField id="product-stock" label="Estoque (opcional)" hint="Deixe vazio para não controlar estoque.">
            <TextInput id="product-stock" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </FormField>
          <FormField id="product-active" label="Situação">
            <Select id="product-active" value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </Select>
          </FormField>
          <FormField id="product-description" label="Descrição (opcional)" className="field-span">
            <Textarea id="product-description" rows={3} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
        </div>
        {formError && (
          <Alert tone="error" title="Produto não salvo">
            {formError}
          </Alert>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={saveForm} disabled={saving} aria-busy={saving}>
            {saving ? "Salvando…" : "Salvar produto"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={selling !== null}
        title="Registrar venda"
        description={selling ? `${selling.name} · ${formatCurrency(selling.price)} cada. O preço é o cadastrado no produto.` : undefined}
        confirmLabel="Registrar venda"
        busy={busy}
        error={dialogError}
        onClose={() => setSelling(null)}
        onConfirm={confirmSale}
      >
        <FormField id="sale-quantity" label="Quantidade">
          <TextInput id="sale-quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={toRemove !== null}
        title={toRemove?.kind === "sale" ? "Estornar venda" : "Excluir produto"}
        description={
          toRemove?.kind === "sale"
            ? `Estornar ${toRemove.item.quantity}× ${toRemove.item.productName} (${formatCurrency(toRemove.item.total)})? O estoque será devolvido.`
            : toRemove
              ? `Excluir “${toRemove.item.name}”? Produtos com vendas não podem ser excluídos; nesse caso, desative-o.`
              : undefined
        }
        confirmLabel={toRemove?.kind === "sale" ? "Estornar" : "Excluir"}
        busy={busy}
        error={dialogError}
        onClose={() => setToRemove(null)}
        onConfirm={confirmRemove}
      />
    </>
  )
}
