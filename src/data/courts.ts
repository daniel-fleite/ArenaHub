export const sportOptions = [
  { id: "society", label: "Futebol society", group: "Futebol" },
  { id: "futsal", label: "Futsal", group: "Futebol" },
  { id: "futevolei", label: "Futevôlei", group: "Esportes de areia" },
  { id: "beach-tennis", label: "Beach tennis", group: "Esportes de areia" },
] as const

export type SportId = typeof sportOptions[number]["id"]

/** Horários de início exibidos na reserva e na agenda (06:00 a 22:00). */
export const timeSlots = Array.from(
  { length: 17 },
  (_, index) => `${String(index + 6).padStart(2, "0")}:00`,
)

export function getSportLabel(id: SportId) {
  return sportOptions.find((sport) => sport.id === id)?.label ?? id
}
