// Bux: moeda FICTÍCIA do Clube Campeão WORLD. Não tem relação com dinheiro real.
// Preços, metas e efeitos abaixo são regras internas do jogo, definidas pelo próprio jogo.
// A fonte da verdade do saldo é o servidor (drizzle/migrations/0003_bux.sql e 0004_bux_economia.sql);
// este módulo espelha as mesmas regras para a interface e é checado contra o SQL por bux.test.ts.
import { legacyClubs } from "./club-provider";

export const BUX_NOTICE = "Bux é uma moeda fictícia do jogo. Preços e efeitos são regras internas, sem relação com dinheiro real.";

export type BuxKind = "club_unlock" | "energy_buff" | "medical_buff" | "goal";
/** Multiplicadores (1 = sem efeito) e bônus (0 = sem efeito). */
export type BuxEffect = { energyDrainMult?: number; halftimeEnergyBonus?: number; injuryChanceMult?: number; recoveryDaysMult?: number };
export type DailyMetric = "played" | "wins" | "cupWins" | "goals" | "cleanSheets" | "seasons";
/** `amount` é o preço (itens) ou o prêmio (metas), sempre em Bux. */
export type BuxItem = { id: string; kind: BuxKind; name: string; amount: number; durationDays?: number; clubId?: string; effect?: BuxEffect; goal?: { metric: DailyMetric; target: number } };

/** Teto de Bux que as metas podem render por dia (dia do Brasil). */
export const BUX_DAILY_CAP = 20;
export const BUX_TIMEZONE = "America/Sao_Paulo";
export const FREE_CLUB_COUNT = 4;
export const brDay = (d: Date = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: BUX_TIMEZONE });

// ---------- clubes: os 4 mais fracos são grátis; os demais custam de 5 a 100 Bux conforme a força ----------
export const clubUnlockId = (clubId: string) => `club_${clubId.replace(/-/g, "_")}`;
const byStrength = [...legacyClubs.list()].sort((a, b) => a.rating - b.rating || a.budget - b.budget || a.id.localeCompare(b.id));
export const FREE_CLUBS = byStrength.slice(0, FREE_CLUB_COUNT).map((c) => c.id);
const paidClubs = byStrength.slice(FREE_CLUB_COUNT);
const lowest = paidClubs[0]!.rating, highest = paidClubs[paidClubs.length - 1]!.rating;
/** Mais fraco entre os pagos = 5 Bux; mais forte = 100 Bux; no meio, proporcional à força, em múltiplos de 5. */
export const clubPrice = (rating: number) => Math.max(5, Math.min(100, Math.round((5 + ((rating - lowest) / (highest - lowest)) * 95) / 5) * 5));

export const BUX_CATALOG: BuxItem[] = [
  ...paidClubs.map((c): BuxItem => ({ id: clubUnlockId(c.id), kind: "club_unlock", name: `Desbloquear ${c.name}`, amount: clubPrice(c.rating), clubId: c.id })),
  { id: "energy_basic", kind: "energy_buff", name: "Energia básica", amount: 10, durationDays: 7, effect: { energyDrainMult: 0.85 } },
  { id: "energy_pro", kind: "energy_buff", name: "Energia profissional", amount: 25, durationDays: 14, effect: { energyDrainMult: 0.7, halftimeEnergyBonus: 6 } },
  { id: "medical_basic", kind: "medical_buff", name: "Departamento médico básico", amount: 12, durationDays: 14, effect: { injuryChanceMult: 0.8, recoveryDaysMult: 0.85 } },
  { id: "medical_pro", kind: "medical_buff", name: "Departamento médico profissional", amount: 30, durationDays: 30, effect: { injuryChanceMult: 0.6, recoveryDaysMult: 0.7 } },
  { id: "goal_play_5", kind: "goal", name: "Jogar 5 partidas", amount: 3, goal: { metric: "played", target: 5 } },
  { id: "goal_win_10", kind: "goal", name: "Ganhar 10 partidas", amount: 5, goal: { metric: "wins", target: 10 } },
  { id: "goal_season", kind: "goal", name: "Terminar uma temporada", amount: 10, goal: { metric: "seasons", target: 1 } },
  { id: "goal_cup_win", kind: "goal", name: "Vencer uma partida de copa", amount: 4, goal: { metric: "cupWins", target: 1 } },
  { id: "goal_score_10", kind: "goal", name: "Marcar 10 gols", amount: 3, goal: { metric: "goals", target: 10 } },
  { id: "goal_clean_3", kind: "goal", name: "Não sofrer gols em 3 partidas", amount: 4, goal: { metric: "cleanSheets", target: 3 } },
];
export const buxItem = (id: string) => BUX_CATALOG.find((x) => x.id === id);
export const BUX_GOALS = BUX_CATALOG.filter((x) => x.kind === "goal");
/** Gratuito ou já desbloqueado na conta. Só terá efeito na tela de escolha quando existir "Nova carreira". */
export const isClubAvailable = (unlocked: string[], clubId: string) => FREE_CLUBS.includes(clubId) || unlocked.includes(clubUnlockId(clubId));

// ---------- carteira (espelha o servidor; usada nos testes e para validar) ----------
export type BuxError = "unknown_item" | "wrong_operation" | "invalid_key" | "insufficient_funds" | "already_unlocked" | "key_reused" | "daily_cap";
export type BuxTx = { key: string; kind: "grant" | "purchase"; item: string; amount: number; balanceAfter: number; day: string };
export type BuxWallet = { version: 1; balance: number; tx: BuxTx[]; unlocked: string[] };
export type BuxResult = { wallet: BuxWallet; duplicate?: true; error?: BuxError };
/** Visão da conta vinda do servidor, só para exibir. */
export type BuxAccount = { balance: number; unlocked: string[]; claimedToday: string[]; earnedToday: number; recent: BuxTx[] };

export const newWallet = (): BuxWallet => ({ version: 1, balance: 0, tx: [], unlocked: [] });
/** Cada meta vale uma vez por dia: a chave carrega a data, e o servidor só aceita a data de hoje. */
export const goalKey = (goalId: string, day: string) => `goal:${goalId}:${day}`;

/** Mesma regra do SQL (bux_apply). Idempotente por chave: repetir a chave nunca cobra nem paga duas vezes. */
function apply(w: BuxWallet, itemId: string, key: string, goal: boolean, today: string): BuxResult {
  const item = buxItem(itemId);
  if (!item) return { wallet: w, error: "unknown_item" };
  if ((item.kind === "goal") !== goal) return { wallet: w, error: "wrong_operation" };
  if (typeof key !== "string" || key.length < 8 || key.length > 120) return { wallet: w, error: "invalid_key" };
  if (goal && key !== goalKey(itemId, today)) return { wallet: w, error: "invalid_key" };
  const prior = w.tx.find((t) => t.key === key);
  if (prior) return prior.item === itemId ? { wallet: w, duplicate: true } : { wallet: w, error: "key_reused" };
  const delta = goal ? item.amount : -item.amount;
  if (w.balance + delta < 0) return { wallet: w, error: "insufficient_funds" };
  if (goal) {
    const earned = w.tx.filter((t) => t.kind === "grant" && t.day === today).reduce((s, t) => s + t.amount, 0);
    if (earned + item.amount > BUX_DAILY_CAP) return { wallet: w, error: "daily_cap" };
  }
  if (item.kind === "club_unlock" && w.unlocked.includes(itemId)) return { wallet: w, error: "already_unlocked" };
  const balance = w.balance + delta;
  return { wallet: { version: 1, balance, unlocked: item.kind === "club_unlock" ? [...w.unlocked, itemId] : w.unlocked, tx: [...w.tx, { key, kind: goal ? "grant" : "purchase", item: itemId, amount: delta, balanceAfter: balance, day: today }] } };
}
export const purchase = (w: BuxWallet, itemId: string, key: string, today: string) => apply(w, itemId, key, false, today);
export const claimGoal = (w: BuxWallet, goalId: string, today: string) => apply(w, goalId, goalKey(goalId, today), true, today);

/** Detecta saldo alterado à mão: devolve a lista de problemas (vazia = carteira íntegra). */
export function walletIntegrity(w: BuxWallet): string[] {
  const problems: string[] = [];
  let running = 0; const keys = new Set<string>(); const clubs = new Set<string>();
  for (const t of w.tx) {
    const item = buxItem(t.item);
    if (!item) { problems.push(`item desconhecido: ${t.item}`); continue; }
    if (keys.has(t.key)) problems.push(`chave repetida: ${t.key}`);
    keys.add(t.key);
    if (t.amount !== (item.kind === "goal" ? item.amount : -item.amount)) problems.push(`valor fora do catálogo: ${t.item}`);
    running += t.amount;
    if (running < 0) problems.push("saldo negativo no histórico");
    if (t.balanceAfter !== running) problems.push(`saldo do histórico não confere: ${t.key}`);
    if (item.kind === "club_unlock") clubs.add(item.id);
  }
  if (w.balance !== running) problems.push("saldo diferente da soma do histórico");
  if (w.unlocked.length !== clubs.size || w.unlocked.some((id) => !clubs.has(id))) problems.push("clubes desbloqueados não conferem com as compras");
  return problems;
}

// ---------- metas diárias: progresso contado na carreira, por dia real (Brasil) ----------
export type DailyProgress = { day: string } & Record<DailyMetric, number>;
export const emptyProgress = (day: string): DailyProgress => ({ day, played: 0, wins: 0, cupWins: 0, goals: 0, cleanSheets: 0, seasons: 0 });
const fresh = (p: DailyProgress | undefined, day: string) => (p && p.day === day ? p : emptyProgress(day));
export function trackMatch(p: DailyProgress | undefined, day: string, m: { my: number; opp: number; cup: boolean }): DailyProgress {
  const b = fresh(p, day), win = m.my > m.opp;
  return { ...b, played: b.played + 1, wins: b.wins + (win ? 1 : 0), cupWins: b.cupWins + (win && m.cup ? 1 : 0), goals: b.goals + m.my, cleanSheets: b.cleanSheets + (m.opp === 0 ? 1 : 0) };
}
export const trackSeason = (p: DailyProgress | undefined, day: string): DailyProgress => { const b = fresh(p, day); return { ...b, seasons: b.seasons + 1 }; };
export function goalProgress(goal: BuxItem, p: DailyProgress | undefined, day: string) {
  const target = goal.goal?.target ?? 1, value = p && p.day === day && goal.goal ? p[goal.goal.metric] : 0;
  return { value: Math.min(value, target), target, done: value >= target };
}

// ---------- buffs (aplicados pelo motor da partida e pela base) ----------
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

/** Texto dos efeitos de um item, exatamente o que o motor aplica. Lesões e recuperação valem para a base. */
export function effectLines(item: BuxItem): string[] {
  const e = item.effect ?? {}, out: string[] = [];
  if (e.energyDrainMult !== undefined) out.push(`Desgaste de energia −${Math.round((1 - e.energyDrainMult) * 100)}%`);
  if (e.halftimeEnergyBonus) out.push(`+${e.halftimeEnergyBonus} de energia no intervalo`);
  if (e.injuryChanceMult !== undefined) out.push(`Lesões na base −${Math.round((1 - e.injuryChanceMult) * 100)}%`);
  if (e.recoveryDaysMult !== undefined) out.push(`Recuperação ${Math.round((1 - e.recoveryDaysMult) * 100)}% mais rápida`);
  return out;
}
