import type { Account } from "@/types"
import { apiRequest } from "./http"

/** GET /api/me: conta, papéis e arenas autorizadas, decididos pelo servidor (404 = sem perfil). */
export async function getAccount(signal?: AbortSignal): Promise<Account> {
  const res = await apiRequest<{ account: Account }>("/api/me", { signal })
  return res.account
}

/** PATCH /api/me: altera apenas nome e telefone. */
export async function updateProfile(
  input: { name: string; phone?: string },
  signal?: AbortSignal,
): Promise<Account> {
  const res = await apiRequest<{ account: Account }>("/api/me", {
    method: "PATCH",
    body: input,
    signal,
  })
  return res.account
}
