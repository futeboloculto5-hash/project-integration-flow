import { supabase } from "@/integrations/supabase/client";
import { BUX_DAILY_CAP, goalKey, type BuxAccount, type BuxError, type BuxTx } from "./bux";

// Camada de acesso ao banco. O cliente só LÊ as tabelas; saldo e compras mudam por bux_purchase/bux_claim_reward.
export type BuxClient = Pick<typeof supabase, "from" | "rpc">;
export type BuxFailure = BuxError | "not_authenticated" | "network";
export type BuxActionResult = { ok: true; duplicate: boolean; balance: number } | { ok: false; error: BuxFailure };

export const BUX_ERROR_TEXT: Record<BuxFailure, string> = {
  unknown_item: "Item inexistente.", wrong_operation: "Operação inválida para este item.", invalid_key: "Pedido inválido. Tente de novo.",
  insufficient_funds: "Bux insuficientes.", already_unlocked: "Você já tem este item.", key_reused: "Pedido repetido com outro item.",
  daily_cap: `Limite de ${BUX_DAILY_CAP} Bux por dia nas metas atingido. Volte amanhã.`, not_authenticated: "Entre na sua conta para usar o Bux.",
  network: "Sem conexão com o servidor. Nada foi cobrado; tente de novo.",
};
const CODES = Object.keys(BUX_ERROR_TEXT).filter((c) => c !== "network") as BuxFailure[];

async function act(client: BuxClient, fn: "bux_purchase" | "bux_claim_reward", item: string, key: string): Promise<BuxActionResult> {
  try {
    const { data, error } = await client.rpc(fn, { p_item: item, p_key: key });
    if (error) return { ok: false, error: CODES.find((c) => String(error.message ?? "").includes(c)) ?? "network" };
    const d = data as { ok?: boolean; duplicate?: boolean; balance?: number } | null;
    if (!d?.ok || typeof d.balance !== "number") return { ok: false, error: "network" };
    return { ok: true, duplicate: !!d.duplicate, balance: d.balance };
  } catch { return { ok: false, error: "network" }; }
}
/** A mesma chave deve ser reutilizada ao repetir um pedido que falhou por rede; assim nunca cobra duas vezes. */
export const buxPurchase = (client: BuxClient, itemId: string, key: string) => act(client, "bux_purchase", itemId, key);
/** `day` é o dia do Brasil (brDay). O servidor só aceita a data de hoje. */
export const buxClaimGoal = (client: BuxClient, goalId: string, day: string) => act(client, "bux_claim_reward", goalId, goalKey(goalId, day));

export async function loadBuxAccount(client: BuxClient, userId: string, day: string): Promise<BuxAccount> {
  const [wallet, unlocks, recent, today] = await Promise.all([
    client.from("bux_wallets").select("balance").eq("user_id", userId).maybeSingle(),
    client.from("bux_unlocks").select("item_id").eq("user_id", userId),
    client.from("bux_transactions").select("idempotency_key,kind,item_id,amount,balance_after,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    client.from("bux_transactions").select("item_id,amount").eq("user_id", userId).eq("kind", "grant").like("idempotency_key", `goal:%:${day}`),
  ]);
  if (wallet.error || unlocks.error || recent.error || today.error) throw new Error("bux_load");
  return {
    balance: Number(wallet.data?.balance ?? 0),
    unlocked: (unlocks.data ?? []).map((r) => r.item_id),
    claimedToday: (today.data ?? []).map((r) => r.item_id),
    earnedToday: (today.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    recent: (recent.data ?? []).map((r): BuxTx => ({ key: r.idempotency_key, kind: r.kind === "grant" ? "grant" : "purchase", item: r.item_id, amount: Number(r.amount), balanceAfter: Number(r.balance_after), day: String(r.created_at).slice(0, 10) })),
  };
}
