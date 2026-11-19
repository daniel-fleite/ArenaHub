import type { ArenaRequestStatus, ReservationStatus } from "@/types"

const labels: Record<ArenaRequestStatus | ReservationStatus | "ativo" | "suspenso" | "ativa" | "inativa", string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  concluida: "Concluída",
  ativo: "Ativo",
  suspenso: "Suspenso",
  ativa: "Ativa",
  inativa: "Inativa",
}

/** Reaproveita .status-badge do projeto; as variações novas estão em styles/common.css. */
export function StatusBadge({ status }: { status: keyof typeof labels }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>
}
