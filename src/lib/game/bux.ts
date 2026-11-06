// Bux: moeda FICTÍCIA do Clube Campeão WORLD. Não tem relação com dinheiro real.
// Preços, recompensas e efeitos abaixo são regras internas do jogo, definidas pelo próprio jogo.
// A fonte da verdade do saldo é o servidor (supabase/pending-migrations/bux.sql); este módulo espelha
// as mesmas regras para a interface e é checado contra o SQL por bux.test.ts.

export const BUX_NOTICE = "Bux é uma moeda fictícia do jogo. Preços e efeitos são regras internas, sem relação com dinheiro real.";

export type BuxKind = "club_unlock" | "energy_buff" | "medical_buff" | "reward";
/** Multiplicadores (1 = sem efeito) e bônus (0 = sem efeito). */
export type BuxEffect = { energyDrainMult?: number; halftimeEnergyBonus?: number; injuryChanceMult?: number; recoveryDaysMult?: number };
/** `amount` é o preço (itens) ou o prêmio (recompensas), sempre em Bux. */
export type BuxItem = { id: string; kind: BuxKind; name: string; amount: number; durationDays?: number; clubId?: string; effect?: BuxEffect };

export const BUX_DAILY_REWARD_CAP = 600;
export const WELCOME_KEY = "reward:reward_welcome:account";

export const BUX_CATALOG: BuxItem[] = [
  { id: "club_botafogo", kind: "club_unlock", name: "Desbloquear Botafogo", amount: 800, clubId: "botafogo" },
  { id: "club_flamengo", kind: "club_unlock", name: "Desbloquear Flamengo", amount: 1500, clubId: "flamengo" },
  { id: "club_palmeiras", kind: "club_unlock", name: "Desbloquear Palmeiras", amount: 1500, clubId: "palmeiras" },
  { id: "energy_basic", kind: "energy_buff", name: "Energia básica", amount: 120, durationDays: 7, effect: { energyDrainMult: 0.85 } },
  { id: "energy_pro", kind: "energy_buff", name: "Energia profissional", amount: 300, durationDays: 14, effect: { energyDrainMult: 0.7, halftimeEnergyBonus: 6 } },
  { id: "medical_basic", kind: "medical_buff", name: "Departamento médico básico", amount: 150, durationDays: 14, effect: { injuryChanceMult: 0.8, recoveryDaysMult: 0.85 } },
  { id: "medical_pro", kind: "medical_buff", name: "Departamento médico profissional", amount: 400, durationDays: 30, effect: { injuryChanceMult: 0.6, recoveryDaysMult: 0.7 } },
  { id: "reward_welcome", kind: "reward", name: "Boas-vindas", amount: 100 },
  { id: "reward_first_win", kind: "reward", name: "Primeira vitória da carreira", amount: 50 },
  { id: "reward_season_played", kind: "reward", name: "Temporada concluída", amount: 200 },
  { id: "reward_cup_champion", kind: "reward", name: "Campeão da copa", amount: 300 },
  { id: "reward_promotion", kind: "reward", name: "Acesso à divisão superior", amount: 250 },
];
export const buxItem = (id: string) => BUX_CATALOG.find((x) => x.id === id);
/** Clubes que só entram numa carreira nova depois de desbloqueados. Carreiras já criadas nunca são revalidadas. */
export const BUX_LOCKED_CLUBS = BUX_CATALOG.filter((x) => x.kind === "club_unlock").map((x) => x.clubId as string);
export const isClubAvailable = (w: BuxWallet, clubId: string) => {
  const unlock = BUX_CATALOG.find((x) => x.kind === "club_unlock" && x.clubId === clubId);
  return !unlock || w.unlocked.includes(unlock.id);
};

export type BuxError = "unknown_item" | "wrong_operation" | "invalid_key" | "insufficient_funds" | "already_unlocked" | "key_reused" | "daily_cap";
export type BuxTx = { key: string; kind: "grant" | "purchase"; item: string; amount: number; balanceAfter: number; day: string };
export type BuxWallet = { version: 1; balance: number; tx: BuxTx[]; unlocked: string[] };
export type BuxResult = { wallet: BuxWallet; duplicate?: true; error?: BuxError };

export const newWallet = (): BuxWallet => ({ version: 1, balance: 0, tx: [], unlocked: [] });

/** Chave de recompensa: a de boas-vindas é única por conta; as demais valem uma vez por escopo (ex.: carreira + temporada). */
export const rewardKey = (rewardId: string, scope: string) => rewardId === "reward_welcome" ? WELCOME_KEY : `reward:${rewardId}:${scope}`;

/** Mesma regra do SQL (bux_apply). Idempotente por chave: repetir a chave nunca cobra nem paga duas vezes. */
function apply(w: BuxWallet, itemId: string, key: string, reward: boolean, today: string): BuxResult {
  const item = buxItem(itemId);
  if (!item) return { wallet: w, error: "unknown_item" };
  if ((item.kind === "reward") !== reward) return { wallet: w, error: "wrong_operation" };
  if (typeof key !== "string" || key.length < 8 || key.length > 120) return { wallet: w, error: "invalid_key" };
  if (reward && (itemId === "reward_welcome" ? key !== WELCOME_KEY : !key.startsWith(`reward:${itemId}:`))) return { wallet: w, error: "invalid_key" };
  const prior = w.tx.find((t) => t.key === key);
  if (prior) return prior.item === itemId ? { wallet: w, duplicate: true } : { wallet: w, error: "key_reused" };
  const delta = reward ? item.amount : -item.amount;
  if (w.balance + delta < 0) return { wallet: w, error: "insufficient_funds" };
  if (item.kind === "club_unlock" && w.unlocked.includes(itemId)) return { wallet: w, error: "already_unlocked" };
  if (reward && itemId !== "reward_welcome") {
    const earned = w.tx.filter((t) => t.kind === "grant" && t.item !== "reward_welcome" && t.day === today).reduce((s, t) => s + t.amount, 0);
    if (earned + item.amount > BUX_DAILY_REWARD_CAP) return { wallet: w, error: "daily_cap" };
  }
  const balance = w.balance + delta;
  return { wallet: { version: 1, balance, unlocked: item.kind === "club_unlock" ? [...w.unlocked, itemId] : w.unlocked, tx: [...w.tx, { key, kind: reward ? "grant" : "purchase", item: itemId, amount: delta, balanceAfter: balance, day: today }] } };
}
export const purchase = (w: BuxWallet, itemId: string, key: string, today: string) => apply(w, itemId, key, false, today);
export const claimReward = (w: BuxWallet, rewardId: string, scope: string, today: string) => apply(w, rewardId, rewardKey(rewardId, scope), true, today);

/** Detecta saldo alterado à mão: devolve a lista de problemas (vazia = carteira íntegra). */
export function walletIntegrity(w: BuxWallet): string[] {
  const problems: string[] = [];
  let running = 0; const keys = new Set<string>(); const clubs = new Set<string>();
  for (const t of w.tx) {
    const item = buxItem(t.item);
    if (!item) { problems.push(`item desconhecido: ${t.item}`); continue; }
    if (keys.has(t.key)) problems.push(`chave repetida: ${t.key}`);
    keys.add(t.key);
    if (t.amount !== (item.kind === "reward" ? item.amount : -item.amount)) problems.push(`valor fora do catálogo: ${t.item}`);
    running += t.amount;
    if (running < 0) problems.push("saldo negativo no histórico");
    if (t.balanceAfter !== running) problems.push(`saldo do histórico não confere: ${t.key}`);
    if (item.kind === "club_unlock") clubs.add(item.id);
  }
  if (w.balance !== running) problems.push("saldo diferente da soma do histórico");
  if (w.unlocked.length !== clubs.size || w.unlocked.some((id) => !clubs.has(id))) problems.push("clubes desbloqueados não conferem com as compras");
  return problems;
}

// ---------- buffs (aplicados pelo motor da partida e pela base; ver AGENTS.md) ----------
export type ActiveBuff = { itemId: string; until: string };
const addIso = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Comprar o mesmo buff de novo estende a validade a partir do fim atual, nunca encurta. */
export function startBuff(buffs: ActiveBuff[], itemId: string, date: string): ActiveBuff[] {
  const item = buxItem(itemId);
  if (!item?.durationDays || !item.effect) return buffs;
  const current = buffs.find((b) => b.itemId === itemId && b.until >= date);
  const until = addIso(current ? current.until : date, item.durationDays);
  return [...buffs.filter((b) => b.itemId !== itemId), { itemId, until }];
}
/** Para cada efeito vale o mais forte entre os buffs ativos (sem somar acima do previsto). */
export function buffEffect(buffs: ActiveBuff[], date: string): Required<BuxEffect> {
  const out: Required<BuxEffect> = { energyDrainMult: 1, halftimeEnergyBonus: 0, injuryChanceMult: 1, recoveryDaysMult: 1 };
  for (const b of buffs) {
    const e = b.until >= date ? buxItem(b.itemId)?.effect : undefined;
    if (!e) continue;
    out.energyDrainMult = Math.min(out.energyDrainMult, e.energyDrainMult ?? 1);
    out.halftimeEnergyBonus = Math.max(out.halftimeEnergyBonus, e.halftimeEnergyBonus ?? 0);
    out.injuryChanceMult = Math.min(out.injuryChanceMult, e.injuryChanceMult ?? 1);
    out.recoveryDaysMult = Math.min(out.recoveryDaysMult, e.recoveryDaysMult ?? 1);
  }
  return out;
}
export const activeBuffs = (buffs: ActiveBuff[], date: string) => buffs.filter((b) => b.until >= date);
