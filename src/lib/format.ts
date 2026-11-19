export function todayISO(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDate(iso?: string) {
  if (!iso) return "—"
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("pt-BR")
}

export function formatCurrency(value?: number) {
  return typeof value === "number"
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—"
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const brazilStates = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const
