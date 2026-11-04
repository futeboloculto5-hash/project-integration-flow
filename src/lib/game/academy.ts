import { addDays, playerValue, playerWage, seeded, type CareerV2, type Player, type Pos } from "./career";
import { book, budgetError } from "./finance";
import type { DataStatus } from "./finance-data";

// Youth academy rules. Every young player, scout, report and youth result is simulated.
// Only the competition names and age groups come from the CBF website (see YOUTH_SOURCE).

export type YouthCategory = "Sub-15" | "Sub-17" | "Sub-20";
export const CATEGORIES: YouthCategory[] = ["Sub-15", "Sub-17", "Sub-20"];
export type Attrs = { tecnica: number; fisico: number; tatico: number; mental: number };
export type TrainingFocus = "equilibrado" | "tecnica" | "fisico" | "tatico" | "mental";
export type Intensity = "leve" | "normal" | "intensa";

export type Youth = {
  id: string; name: string; pos: Pos; age: number; category: YouthCategory; attrs: Attrs;
  potential: number; // hidden ceiling
  potentialSeen: [number, number]; // what the staff can see
  origin: "base" | "olheiro"; joined: string; region?: string | undefined; injuredUntil?: string | undefined;
  history: { date: string; overall: number }[];
  status: DataStatus; // always "simulado"
};
export type Scout = { id: string; name: string; region: string; skill: number; weeklyCost: number; hired: string };
export type Prospect = { id: string; youth: Youth; scoutId: string; fee: number; expires: string };
export type YouthRow = { clubId: string; name: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
export type YouthCompetition = { id: string; name: string; category: YouthCategory; season: string; nameSource: "CBF"; resultsStatus: DataStatus; rows: YouthRow[]; rounds: number };

export type AcademyState = {
  version: 1; season: string; level: number;
  training: Record<YouthCategory, { focus: TrainingFocus; intensity: Intensity }>;
  players: Youth[]; scouts: Scout[]; prospects: Prospect[]; competitions: YouthCompetition[];
  promoted: { id: string; name: string; date: string; overall: number }[];
  archive: { season: string; name: string; position: number }[];
};

export const YOUTH_SOURCE = {
  publisher: "CBF – Confederação Brasileira de Futebol",
  url: "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20",
  accessed: "2026-11-04",
  methodology: "Página oficial de competições consultada: lista Campeonato Brasileiro Sub-20, Sub-20 B e Sub-17, e notícias da Copa do Brasil Sub-20 e da Supercopa Sub-17. Usamos apenas os nomes e as faixas etárias. Elencos, jogos e resultados da base no jogo são simulados; nenhum atleta real das categorias de base foi usado.",
};
/** Competitions listed on cbf.com.br. Sub-15 has no CBF national competition listed there, so it is a simulated tournament. */
export const YOUTH_COMPETITIONS: Record<YouthCategory, { name: string; real: boolean }> = {
  "Sub-20": { name: "Campeonato Brasileiro Sub-20", real: true },
  "Sub-17": { name: "Campeonato Brasileiro Sub-17", real: true },
  "Sub-15": { name: "Torneio de Base Sub-15 (simulado)", real: false },
};

export const FOCUS_LABEL: Record<TrainingFocus, string> = { equilibrado: "Equilibrado", tecnica: "Técnica", fisico: "Físico", tatico: "Tático", mental: "Mental" };
export const ATTR_LABEL: Record<keyof Attrs, string> = { tecnica: "Técnica", fisico: "Físico", tatico: "Tático", mental: "Mental" };
const INTENSITY = { leve: { gain: 0.7, injury: 0.002, cost: 0.8 }, normal: { gain: 1, injury: 0.008, cost: 1 }, intensa: { gain: 1.35, injury: 0.025, cost: 1.3 } } as const;
export const REGIONS = ["São Paulo", "Rio de Janeiro", "Minas Gerais", "Sul", "Nordeste", "Norte e Centro-Oeste"];
export const MAX_SCOUTS = 3;
export const UPGRADE_COST = (level: number) => level * 15_000_000;
export const academyWeeklyCost = (a: AcademyState) => Math.round(a.level * 120_000 * avgIntensityCost(a)) + a.scouts.reduce((s, x) => s + x.weeklyCost, 0);
const avgIntensityCost = (a: AcademyState) => CATEGORIES.reduce((s, k) => s + INTENSITY[a.training[k].intensity].cost, 0) / CATEGORIES.length;

const FIRST = ["Kauã", "Enzo", "Miguel", "Davi", "Arthur", "Gael", "Heitor", "Théo", "Bernardo", "Ravi", "Samuel", "Pietro", "Luan", "Ryan", "Kaique", "Isaac", "Benício", "Otávio", "Caio", "João Pedro", "Vitinho", "Rayan", "Wendel", "Yago"];
const LAST = ["Silva", "Souza", "Lima", "Ferreira", "Alves", "Rocha", "Moraes", "Barros", "Cunha", "Pinto", "Correia", "Monteiro", "Brito", "Farias", "Nogueira", "Campos", "Sales", "Teles", "Viana", "Prado"];

export const categoryFor = (age: number): YouthCategory => age <= 15 ? "Sub-15" : age <= 17 ? "Sub-17" : "Sub-20";
const clamp = (v: number) => Math.max(20, Math.min(99, Math.round(v)));

export function overall(y: Pick<Youth, "attrs" | "pos">) {
  const a = y.attrs;
  const w = { GOL: [0.2, 0.3, 0.3, 0.2], DEF: [0.2, 0.35, 0.3, 0.15], MEI: [0.35, 0.2, 0.25, 0.2], ATA: [0.4, 0.3, 0.1, 0.2] }[y.pos];
  return Math.round(a.tecnica * w[0]! + a.fisico * w[1]! + a.tatico * w[2]! + a.mental * w[3]!);
}

function seenRange(potential: number, skill: number, r: () => number): [number, number] {
  const spread = Math.round(18 - skill * 3);
  const off = Math.round((r() - 0.5) * spread);
  return [clamp(potential - spread / 2 + off), clamp(potential + spread / 2 + off)];
}

export function makeYouth(seed: string, date: string, age: number, quality: number, origin: Youth["origin"], skill = 2, region?: string): Youth {
  const r = seeded(seed);
  const pos = (["GOL", "DEF", "DEF", "MEI", "MEI", "ATA"] as Pos[])[Math.floor(r() * 6)]!;
  const base = quality - (20 - age) * 2.5;
  const attrs: Attrs = { tecnica: clamp(base + (r() - 0.5) * 16), fisico: clamp(base + (r() - 0.5) * 16), tatico: clamp(base + (r() - 0.5) * 16), mental: clamp(base + (r() - 0.5) * 16) };
  const potential = clamp(quality + 8 + r() * 18);
  const y: Youth = { id: `y-${seed}`, name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`, pos, age, category: categoryFor(age), attrs, potential, potentialSeen: seenRange(potential, skill, r), origin, joined: date, region, history: [], status: "simulado" };
  y.history.push({ date, overall: overall(y) });
  return y;
}

function intake(c: CareerV2, a: AcademyState, count: number) {
  const club = c.seasonState?.clubs.find((x) => x.id === c.clubId);
  const quality = 48 + a.level * 3 + ((club?.rating ?? 75) - 75) / 3;
  const r = seeded(`intake:${c.clubId}:${a.season}`);
  for (let i = 0; i < count; i++) a.players.push(makeYouth(`${c.clubId}-${a.season}-${i}`, c.date, 14 + Math.floor(r() * 2), quality, "base"));
}

function competitions(c: CareerV2, season: string): YouthCompetition[] {
  const ids = c.seasonState?.divisions["A"] ?? [];
  const names = Object.fromEntries((c.seasonState?.clubs ?? []).map((x) => [x.id, x.name]));
  const pool = [c.clubId, ...ids.filter((id) => id !== c.clubId)].slice(0, 12);
  return CATEGORIES.map((category) => ({
    id: `${category}-${season}`, name: YOUTH_COMPETITIONS[category].name, category, season, nameSource: "CBF" as const, resultsStatus: "simulado" as const, rounds: 0,
    rows: pool.map((id) => ({ clubId: id, name: names[id] ?? id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })),
  }));
}

export function createAcademy(c: CareerV2): AcademyState {
  const a: AcademyState = {
    version: 1, season: c.season, level: 1,
    training: { "Sub-15": { focus: "equilibrado", intensity: "normal" }, "Sub-17": { focus: "equilibrado", intensity: "normal" }, "Sub-20": { focus: "equilibrado", intensity: "normal" } },
    players: [], scouts: [], prospects: [], competitions: competitions(c, c.season), promoted: [], archive: [],
  };
  const r = seeded(`academy:${c.clubId}`);
  for (let i = 0; i < 12; i++) a.players.push(makeYouth(`${c.clubId}-start-${i}`, c.date, 14 + Math.floor(r() * 7), 52, "base"));
  return a;
}

export const academy = (c: CareerV2) => (c.academy ??= createAcademy(c));

function train(c: CareerV2, a: AcademyState) {
  for (const y of a.players) {
    if (y.injuredUntil && y.injuredUntil > c.date) continue;
    const r = seeded(`train:${c.date}:${y.id}`);
    const plan = a.training[y.category];
    const int = INTENSITY[plan.intensity];
    if (r() < int.injury) { y.injuredUntil = addDays(c.date, 7 + Math.floor(r() * 21)); c.news.unshift({ id: `inj-${y.id}-${c.date}`, date: c.date, kind: "info", title: `Lesão na base: ${y.name}`, body: `${y.category} · fora até ${y.injuredUntil.split("-").reverse().join("/")}. Treino ${plan.intensity}.` }); continue; }
    const room = Math.max(0, y.potential - overall(y));
    const ageFactor = y.age <= 16 ? 1.2 : y.age <= 18 ? 1 : 0.7;
    const gain = (room / 40) * ageFactor * int.gain * (1 + (a.level - 1) * 0.1);
    for (const k of Object.keys(y.attrs) as (keyof Attrs)[]) {
      const focus = plan.focus === "equilibrado" ? 1 : plan.focus === k ? 1.8 : 0.6;
      if (r() < Math.min(0.95, gain * focus)) y.attrs[k] = Math.min(y.potential + 4, y.attrs[k] + 1);
    }
    const ovr = overall(y);
    if (y.history.at(-1)?.overall !== ovr) y.history = [...y.history, { date: c.date, overall: ovr }].slice(-20);
  }
}

function playYouthRound(c: CareerV2, a: AcademyState) {
  for (const comp of a.competitions) {
    if (comp.rounds >= 22) continue;
    const r = seeded(`youth:${comp.id}:${comp.rounds}`);
    const mine = a.players.filter((y) => y.category === comp.category && !(y.injuredUntil && y.injuredUntil > c.date));
    const myStr = mine.length ? mine.map(overall).sort((x, z) => z - x).slice(0, 11).reduce((s, v) => s + v, 0) / Math.min(11, mine.length) : 40;
    const order = [...comp.rows].sort(() => r() - 0.5);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const h = order[i]!, w = order[i + 1]!;
      const str = (row: YouthRow) => (row.clubId === c.clubId ? myStr : 52 + r() * 14 - (comp.category === "Sub-15" ? 8 : comp.category === "Sub-17" ? 4 : 0));
      const sh = str(h), sw = str(w);
      const hg = Math.max(0, Math.round(r() * 2.6 + (sh - sw) / 12)), ag = Math.max(0, Math.round(r() * 2.2 + (sw - sh) / 12));
      for (const [row, gf, ga] of [[h, hg, ag], [w, ag, hg]] as const) {
        row.p++; row.gf += gf; row.ga += ga;
        if (gf > ga) { row.w++; row.pts += 3; } else if (gf === ga) { row.d++; row.pts++; } else row.l++;
      }
    }
    comp.rounds++;
    for (const y of mine) if (r() < 0.25) y.attrs.mental = Math.min(y.potential + 4, y.attrs.mental + 1); // match experience
  }
}

export const youthTable = (comp: YouthCompetition) => [...comp.rows].sort((x, y) => y.pts - x.pts || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);

function scouting(c: CareerV2, a: AcademyState) {
  a.prospects = a.prospects.filter((p) => p.expires >= c.date);
  for (const s of a.scouts) {
    const r = seeded(`scout:${s.id}:${c.date}`);
    if (r() > 0.1 + s.skill * 0.08) continue;
    const quality = 46 + s.skill * 3 + r() * 10;
    const y = makeYouth(`${s.id}-${c.date}`, c.date, 14 + Math.floor(r() * 5), quality, "olheiro", s.skill, s.region);
    const fee = Math.round((50_000 + Math.max(0, y.potentialSeen[1] - 60) * 40_000) / 10_000) * 10_000;
    a.prospects.unshift({ id: `pr-${y.id}`, youth: y, scoutId: s.id, fee, expires: addDays(c.date, 14) });
    c.news.unshift({ id: `pr-${y.id}`, date: c.date, kind: "offer", title: `Olheiro indica promessa: ${y.name}`, body: `${s.name} (${s.region}) viu um ${y.pos} de ${y.age} anos com potencial estimado ${y.potentialSeen[0]}–${y.potentialSeen[1]}. Jogador simulado. Veja em Elenco › Base.` });
  }
  a.prospects = a.prospects.slice(0, 12);
}

function rollover(c: CareerV2, a: AcademyState) {
  for (const comp of a.competitions) {
    const pos = youthTable(comp).findIndex((x) => x.clubId === c.clubId) + 1;
    a.archive.unshift({ season: comp.season, name: comp.name, position: pos });
  }
  a.archive = a.archive.slice(0, 30);
  const released: string[] = [];
  a.players = a.players.flatMap((y) => {
    const age = y.age + 1;
    if (age > 20) { released.push(y.name); return []; }
    return [{ ...y, age, category: categoryFor(age) }];
  });
  if (released.length) c.news.unshift({ id: `yrel-${c.season}`, date: c.date, kind: "info", title: "Fim do ciclo na base", body: `Passaram da idade do Sub-20 sem promoção e deixaram o clube: ${released.join(", ")}.` });
  a.season = c.season;
  intake(c, a, 4 + a.level);
  a.competitions = competitions(c, c.season);
  c.news.unshift({ id: `intake-${c.season}`, date: c.date, kind: "info", title: "Peneira da base", body: `${4 + a.level} novos garotos chegaram ao Sub-15. Atletas simulados.` });
}

/** Daily routine, called from advanceDay so academy progress can never be skipped. */
export function processAcademyDay(c: CareerV2) {
  const a = academy(c);
  if (a.season !== c.season) rollover(c, a);
  if (c.seasonState && a.competitions.every((x) => x.rows.length === 0)) a.competitions = competitions(c, a.season);
  const dow = new Date(`${c.date}T00:00:00Z`).getUTCDay();
  if (dow === 1) {
    train(c, a);
    scouting(c, a);
    book(c, "categorias_base", "Categorias de base e olheiros", -academyWeeklyCost(a));
  }
  if (dow === 6) playYouthRound(c, a);
}

// ---------- manager actions ----------
type Result = { career: CareerV2; error?: string | undefined };

export function setTraining(c: CareerV2, cat: YouthCategory, plan: Partial<{ focus: TrainingFocus; intensity: Intensity }>): Result {
  const next = structuredClone(c);
  const a = academy(next);
  a.training[cat] = { ...a.training[cat], ...plan };
  return { career: next };
}

export function scoutCandidates(c: CareerV2): Scout[] {
  const week = addDays(c.date, -((new Date(`${c.date}T00:00:00Z`).getUTCDay() + 6) % 7));
  const r = seeded(`scouts:${c.clubId}:${week}`);
  return [0, 1, 2].map((i) => {
    const skill = 1 + Math.floor(r() * 5);
    return { id: `sc-${week}-${i}`, name: `${FIRST[Math.floor(r() * FIRST.length)]!.split(" ")[0]} ${LAST[Math.floor(r() * LAST.length)]}`, region: REGIONS[Math.floor(r() * REGIONS.length)]!, skill, weeklyCost: skill * 15_000, hired: c.date };
  });
}

export function hireScout(c: CareerV2, scout: Scout): Result {
  const a = academy(c);
  if (a.scouts.length >= MAX_SCOUTS) return { career: c, error: `Máximo de ${MAX_SCOUTS} olheiros.` };
  if (a.scouts.some((s) => s.id === scout.id)) return { career: c, error: "Olheiro já contratado." };
  const next = structuredClone(c);
  academy(next).scouts.push({ ...scout, hired: c.date });
  return { career: next };
}

export function fireScout(c: CareerV2, id: string): Result {
  const next = structuredClone(c);
  const a = academy(next);
  a.scouts = a.scouts.filter((s) => s.id !== id);
  return { career: next };
}

export function signProspect(c: CareerV2, id: string): Result {
  const p = academy(c).prospects.find((x) => x.id === id);
  if (!p) return { career: c, error: "Relatório expirado." };
  if (p.fee > c.balance) return { career: c, error: "Saldo insuficiente." };
  if (academy(c).players.filter((y) => y.category === p.youth.category).length >= 25) return { career: c, error: `${p.youth.category} cheio (máximo 25).` };
  const next = structuredClone(c);
  const a = academy(next);
  a.prospects = a.prospects.filter((x) => x.id !== id);
  a.players.push({ ...p.youth, joined: c.date });
  book(next, "categorias_base", `Contratação para a base · ${p.youth.name}`, -p.fee);
  return { career: next };
}

export function releaseYouth(c: CareerV2, id: string): Result {
  const next = structuredClone(c);
  const a = academy(next);
  a.players = a.players.filter((y) => y.id !== id);
  return { career: next };
}

export function upgradeAcademy(c: CareerV2): Result {
  const a = academy(c);
  if (a.level >= 5) return { career: c, error: "Centro de treinamento já está no nível máximo." };
  const cost = UPGRADE_COST(a.level);
  if (cost > c.balance) return { career: c, error: "Saldo insuficiente." };
  const next = structuredClone(c);
  academy(next).level += 1;
  book(next, "obras", `Centro de treinamento da base · nível ${a.level + 1}`, -cost);
  return { career: next };
}

export const promotionWage = (ovr: number) => Math.max(8_000, Math.round((playerWage(ovr) * 0.5) / 1000) * 1000);

export function promoteYouth(c: CareerV2, id: string): Result {
  const y = academy(c).players.find((x) => x.id === id);
  if (!y) return { career: c, error: "Jogador não encontrado." };
  if (y.age < 16) return { career: c, error: "Só jogadores com 16 anos ou mais podem subir ao profissional." };
  if (c.squad.length >= 32) return { career: c, error: "Elenco profissional cheio (máximo 32)." };
  const ovr = overall(y);
  const wage = promotionWage(ovr);
  const over = budgetError(c, 0, wage);
  if (over) return { career: c, error: over };
  const next = structuredClone(c);
  const a = academy(next);
  a.players = a.players.filter((x) => x.id !== id);
  const player: Player = { id: `${c.clubId}-base-${y.id}`, name: y.name, pos: y.pos, age: y.age, rating: ovr, value: playerValue(ovr, y.age), wage, clubId: c.clubId, contractUntil: addDays(c.date, 1095), academy: true, potential: y.potential };
  next.squad.push(player);
  next.transferredIn = [...new Set([...next.transferredIn, player.id])];
  a.promoted.unshift({ id: player.id, name: y.name, date: c.date, overall: ovr });
  next.news.unshift({ id: `promo-${y.id}`, date: c.date, kind: "transfer", title: `${y.name} sobe ao profissional`, body: `Cria da base (${y.category}), ${y.pos}, ${y.age} anos, força ${ovr}. Contrato de 3 anos por ${wage.toLocaleString("pt-BR")} R$/mês. Jogador simulado.` });
  return { career: next };
}
