import { CLUBS, COMPANIES, KIT_BRANDS, clubById } from "./clubs";
import { simulateMatch } from "@/lib/career/simulation";

export type Pos = "GOL" | "DEF" | "MEI" | "ATA";
export type Player = { id: string; name: string; pos: Pos; age: number; rating: number; value: number; wage: number; clubId: string; real?: boolean };
export type Fixture = { round: number; date: string; home: string; away: string; hg?: number; ag?: number };
export type NewsItem = { id: string; date: string; title: string; body: string; kind: "info" | "offer" | "transfer" | "result" };
export type Offer = { id: string; playerId: string; fromClub: string; fee: number; expires: string };

export type CareerV2 = {
  version: 2;
  manager: string;
  clubId: string;
  season: string;
  date: string; // ISO yyyy-mm-dd
  balance: number;
  squad: Player[];
  fixtures: Fixture[];
  market: Player[];
  offers: Offer[];
  news: NewsItem[];
  transferredIn: string[];
  transferredOut: string[];
  formation: "4-3-3" | "4-4-2" | "3-5-2" | "5-3-2";
  debt: number;
  stadium: { capacity: number; ticketPrice: number; level: number; building?: { until: string; seats: number } };
  sponsors: Sponsor[];
  sponsorOffers: SponsorOffer[];
  otherSquads?: Record<string, Player[]>;
  ledger: { week: string; income: number; expense: number; items: { label: string; value: number }[] }[];
};

export type SponsorSlot = "Máster" | "Material esportivo" | "Manga" | "Costas" | "Naming rights";
export type Sponsor = { id: string; company: string; slot: SponsorSlot; weekly: number; until: string; real?: boolean };
export type SponsorOffer = { id: string; company: string; slot: SponsorSlot; weekly: number; weeks: number; expires: string };

// ---------- deterministic random ----------
export function seeded(seed: string) {
  let v = 2166136261;
  for (const c of seed) v = Math.imul(v ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; };
}

const FIRST = ["Lucas", "Gabriel", "Mateus", "Rafael", "Thiago", "Bruno", "Diego", "Caio", "Igor", "Vitor", "Pedro", "André", "Renan", "Danilo", "Felipe", "Hugo", "Marcos", "Wesley", "Gustavo", "Léo", "Matheus", "Kaio", "Éverton", "Rodrigo", "Yuri", "Luan", "Alex", "Vinícius", "Henrique", "Arthur", "Breno", "Davi"];
const LAST = ["Silva", "Santos", "Souza", "Oliveira", "Pereira", "Lima", "Costa", "Ribeiro", "Almeida", "Rocha", "Martins", "Barbosa", "Araújo", "Teixeira", "Moura", "Cardoso", "Nunes", "Freitas", "Gomes", "Vieira", "Mendes", "Batista", "Ramos", "Dias", "Pires", "Lopes"];

export function playerValue(rating: number, age: number) {
  const base = Math.pow(Math.max(rating - 55, 1), 2.6) * 2200;
  const ageMod = age <= 21 ? 1.5 : age <= 25 ? 1.25 : age <= 29 ? 1 : age <= 32 ? 0.6 : 0.3;
  return Math.round((base * ageMod) / 50_000) * 50_000;
}
export const playerWage = (rating: number) => Math.round(Math.pow(Math.max(rating - 50, 1), 2.2) * 90 / 1000) * 1000;

const LAYOUT: Pos[] = ["GOL", "GOL", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "MEI", "MEI", "MEI", "ATA", "ATA", "ATA", "ATA", "ATA", "DEF", "MEI", "GOL"];

export function generateSquad(clubId: string, rating: number, salt = "s1"): Player[] {
  const r = seeded(`${clubId}:${salt}`);
  return LAYOUT.map((pos, i) => {
    const starter = i < 19;
    const rt = Math.round(rating - (starter ? 6 : 12) + r() * (starter ? 11 : 9));
    const age = 18 + Math.floor(r() * 16);
    return {
      id: `${clubId}-${salt}-${i}`, clubId, pos, age, rating: rt,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      value: playerValue(rt, age), wage: playerWage(rt),
    };
  });
}

export function mapApiPos(p?: string): Pos {
  const u = (p ?? "").toLowerCase();
  if (u.startsWith("goal")) return "GOL";
  if (u.startsWith("def")) return "DEF";
  if (u.startsWith("att") || u.startsWith("for")) return "ATA";
  return "MEI";
}

export function squadFromApi(clubId: string, rating: number, api: { id: number | string; name: string; position?: string; age?: number | null }[]): Player[] {
  const r = seeded(`${clubId}:api`);
  return api.slice(0, 32).map((a) => {
    const age = a.age ?? 24;
    const rt = Math.round(rating - 7 + r() * 11 - (age < 20 ? 4 : 0));
    return { id: `${clubId}-api-${a.id}`, clubId, name: a.name, pos: mapApiPos(a.position), age, rating: rt, value: playerValue(rt, age), wage: playerWage(rt), real: true };
  });
}

// ---------- calendar ----------
export function makeFixtures(seed: string): Fixture[] {
  const ids = CLUBS.map((c) => c.id);
  const r = seeded(seed);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
  const n = ids.length;
  const rounds: [string, string][][] = [];
  const arr = [...ids];
  for (let rd = 0; rd < n - 1; rd++) {
    const games: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!, b = arr[n - 1 - i]!;
      games.push(rd % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop()!);
  }
  const all = [...rounds, ...rounds.map((g) => g.map(([a, b]) => [b, a] as [string, string]))];
  const start = new Date("2025-03-29T00:00:00Z");
  return all.flatMap((games, rd) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + Math.floor(rd * 3.5));
    const date = d.toISOString().slice(0, 10);
    return games.map(([home, away]) => ({ round: rd + 1, date, home, away }));
  });
}

// ---------- table ----------
export type Row = { clubId: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; form: ("V" | "E" | "D")[] };
export function computeTable(fixtures: Fixture[]): Row[] {
  const rows = new Map<string, Row>(CLUBS.map((c) => [c.id, { clubId: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
  for (const f of fixtures) {
    if (f.hg == null || f.ag == null) continue;
    const h = rows.get(f.home)!, a = rows.get(f.away)!;
    h.p++; a.p++; h.gf += f.hg; h.ga += f.ag; a.gf += f.ag; a.ga += f.hg;
    if (f.hg > f.ag) { h.w++; h.pts += 3; a.l++; h.form.push("V"); a.form.push("D"); }
    else if (f.hg < f.ag) { a.w++; a.pts += 3; h.l++; h.form.push("D"); a.form.push("V"); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("E"); a.form.push("E"); }
  }
  return [...rows.values()].map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort((x, y) => y.pts - x.pts || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || clubById(x.clubId).name.localeCompare(clubById(y.clubId).name));
}

// ---------- strength ----------
export function bestEleven(squad: Player[], formation: CareerV2["formation"] = "4-3-3") {
  const [d, m, a] = formation.split("-").map(Number) as [number, number, number];
  const by = (p: Pos) => squad.filter((x) => x.pos === p).sort((x, y) => y.rating - x.rating);
  const pick = [...by("GOL").slice(0, 1), ...by("DEF").slice(0, d), ...by("MEI").slice(0, m), ...by("ATA").slice(0, a)];
  const rest = squad.filter((p) => !pick.includes(p)).sort((x, y) => y.rating - x.rating);
  while (pick.length < 11 && rest.length) pick.push(rest.shift()!);
  return pick;
}
export const teamRating = (squad: Player[], formation?: CareerV2["formation"]) => {
  const xi = bestEleven(squad, formation);
  return xi.length ? Math.round(xi.reduce((s, p) => s + p.rating, 0) / xi.length) : 60;
};

export function aiSquad(career: CareerV2, clubId: string) {
  const c = clubById(clubId);
  const base = career.otherSquads?.[clubId]?.length ? career.otherSquads[clubId]! : generateSquad(clubId, c.rating);
  return base.filter((p) => !career.transferredOut.includes(p.id) && !career.transferredIn.includes(p.id));
}
export function aiRating(career: CareerV2, clubId: string) {
  return teamRating(aiSquad(career, clubId));
}

// ---------- create ----------
export function createCareer(manager: string, clubId: string, apiSquad?: Player[]): CareerV2 {
  const club = clubById(clubId);
  const squad = apiSquad && apiSquad.length >= 16 ? apiSquad : generateSquad(clubId, club.rating);
  const base: CareerV2 = {
    version: 2, manager, clubId, season: "2025", date: "2025-03-24", balance: club.budget,
    squad, fixtures: makeFixtures(`${clubId}:${manager}:2025`), market: [], offers: [], news: [],
    transferredIn: [], transferredOut: [], formation: "4-3-3",
    debt: club.debt, stadium: { capacity: club.capacity, ticketPrice: 60, level: 1 }, sponsors: initialSponsors(clubId), sponsorOffers: [], ledger: [],
  };
  base.market = refreshMarket(base, "2025-03-24");
  base.news = [{ id: "welcome", date: base.date, kind: "info", title: `${manager} é o novo técnico do ${club.name}!`, body: `A diretoria espera brigar na parte de cima da tabela. Orçamento disponível: ${money(club.budget)}.` }];
  return base;
}

export function refreshMarket(career: CareerV2, date: string): Player[] {
  const r = seeded(`market:${date}`);
  const pool: Player[] = [];
  for (const c of CLUBS) {
    if (c.id === career.clubId) continue;
    const sq = aiSquad(career, c.id);
    for (let i = 0; i < 2; i++) pool.push(sq[Math.floor(r() * sq.length)]!);
  }
  // free agents
  for (let i = 0; i < 6; i++) {
    const pos = (["GOL", "DEF", "MEI", "ATA"] as Pos[])[Math.floor(r() * 4)]!;
    const age = 27 + Math.floor(r() * 8); const rt = 64 + Math.floor(r() * 12);
    pool.push({ id: `fa-${date}-${i}`, clubId: "livre", pos, age, rating: rt, value: 0, wage: playerWage(rt), name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}` });
  }
  return [...new Map(pool.map((p) => [p.id, p])).values()].sort((a, b) => b.rating - a.rating).slice(0, 40);
}

export const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `R$ ${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(".", ",")} mi` : `R$ ${Math.round(a / 1000)} mil`;
  return v < 0 ? `-${s}` : s;
};

// ---------- flow ----------
export const nextFixture = (c: CareerV2) => c.fixtures.find((f) => f.hg == null && (f.home === c.clubId || f.away === c.clubId));
export const currentRound = (c: CareerV2) => nextFixture(c)?.round ?? 39;

export function addDays(date: string, n: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** Advance one day. Blocked on match day until the match is played. */
export function advanceDay(c: CareerV2): { career: CareerV2; blocked?: string } {
  const nf = nextFixture(c);
  if (nf && c.date >= nf.date) return { career: c, blocked: "Hoje é dia de jogo! Jogue a partida para continuar." };
  const next: CareerV2 = structuredClone(c);
  next.date = addDays(c.date, 1);
  const r = seeded(`day:${next.date}:${c.clubId}`);
  // weekly wages on Mondays
  const dow = new Date(`${next.date}T00:00:00Z`).getUTCDay();
  if (dow === 1) weeklyFinance(next);
  if (next.date.endsWith("-01")) monthlyDebt(next);
  if (next.stadium.building && next.date >= next.stadium.building.until) {
    next.stadium.capacity += next.stadium.building.seats; next.stadium.level += 1;
    next.news.unshift({ id: `stad-${next.date}`, date: next.date, kind: "info", title: "Obra concluída no estádio!", body: `Capacidade agora: ${next.stadium.capacity.toLocaleString("pt-BR")} lugares.` });
    delete next.stadium.building;
  }
  next.sponsorOffers = next.sponsorOffers.filter((o) => o.expires >= next.date);
  if (r() < 0.12) addSponsorOffer(next, r);
  // expire offers
  next.offers = next.offers.filter((o) => o.expires >= next.date);
  // AI offer for one of your players
  if (r() < 0.22 && next.squad.length > 18) {
    const target = [...next.squad].sort((a, b) => b.rating - a.rating)[Math.floor(r() * 8)]!;
    const buyers = CLUBS.filter((x) => x.id !== c.clubId);
    const from = buyers[Math.floor(r() * buyers.length)]!;
    const fee = Math.round((target.value * (0.85 + r() * 0.5)) / 50_000) * 50_000;
    if (!next.offers.some((o) => o.playerId === target.id)) {
      const o: Offer = { id: `of-${next.date}-${target.id}`, playerId: target.id, fromClub: from.id, fee, expires: addDays(next.date, 3) };
      next.offers.unshift(o);
      next.news.unshift({ id: o.id, date: next.date, kind: "offer", title: `Proposta do ${from.name}`, body: `${from.name} oferece ${money(fee)} por ${target.name}. Responda no Mercado em até 3 dias.` });
    }
  }
  if (new Date(`${next.date}T00:00:00Z`).getUTCDay() === 1) next.market = refreshMarket(next, next.date);
  next.news = next.news.slice(0, 40);
  return { career: next };
}

export function advanceToMatch(c: CareerV2) {
  let cur = c; let guard = 0;
  while (guard++ < 30) { const r = advanceDay(cur); if (r.blocked) break; cur = r.career; }
  return cur;
}

/** Record the user's match and simulate every other game of that round. */
export function completeRound(c: CareerV2, hg: number, ag: number): CareerV2 {
  const nf = nextFixture(c);
  if (!nf) return c;
  const next: CareerV2 = structuredClone(c);
  for (const f of next.fixtures) {
    if (f.round !== nf.round) continue;
    if (f.home === nf.home && f.away === nf.away) { f.hg = hg; f.ag = ag; continue; }
    const res = simulateMatch(aiRating(next, f.home) + 2, aiRating(next, f.away), `${f.round}:${f.home}:${f.away}`);
    f.hg = res.homeGoals; f.ag = res.awayGoals;
  }
  const isHome = nf.home === c.clubId;
  const my = isHome ? hg : ag, opp = isHome ? ag : hg;
  const club = clubById(c.clubId);
  const gate = isHome ? gateIncome(c) : null;
  const prize = (my > opp ? 1_200_000 : my === opp ? 500_000 : 200_000) + (gate?.income ?? 0);
  next.balance += prize;
  const wk = currentWeek(next);
  wk.income += prize; wk.items.push({ label: `Rodada ${nf.round}${gate ? ` · ${gate.attendance.toLocaleString("pt-BR")} torcedores` : " · premiação"}`, value: prize });
  const oppClub = clubById(isHome ? nf.away : nf.home);
  next.news.unshift({ id: `res-${nf.round}`, date: next.date, kind: "result", title: `${my > opp ? "Vitória" : my === opp ? "Empate" : "Derrota"}: ${club.short} ${my} x ${opp} ${oppClub.short}`, body: `Rodada ${nf.round} do Brasileirão.${gate ? ` Público: ${gate.attendance.toLocaleString("pt-BR")}.` : ""} Receita: ${money(prize)}.` });
  next.date = addDays(next.date, 1);
  return next;
}

// ---------- transfers ----------
export function buyPlayer(c: CareerV2, playerId: string): { career: CareerV2; error?: string } {
  const p = c.market.find((x) => x.id === playerId);
  if (!p) return { career: c, error: "Jogador não está mais disponível." };
  if (c.squad.length >= 32) return { career: c, error: "Elenco cheio (máximo 32). Venda alguém primeiro." };
  const fee = p.clubId === "livre" ? 0 : Math.round(p.value * 1.1);
  if (fee > c.balance) return { career: c, error: `Saldo insuficiente. Precisa de ${money(fee)}.` };
  const next = structuredClone(c);
  next.balance -= fee;
  next.market = next.market.filter((x) => x.id !== playerId);
  next.squad.push({ ...p, clubId: c.clubId, id: p.id });
  next.transferredIn.push(p.id);
  const from = p.clubId === "livre" ? "sem clube" : clubById(p.clubId).name;
  next.news.unshift({ id: `in-${p.id}`, date: c.date, kind: "transfer", title: `Contratado: ${p.name}`, body: `${p.pos} de ${p.age} anos, vindo de ${from}, por ${fee ? money(fee) : "custo zero"}.` });
  return { career: next };
}

export function sellPlayer(c: CareerV2, playerId: string, fee: number, toClub?: string): { career: CareerV2; error?: string } {
  if (c.squad.length <= 16) return { career: c, error: "Elenco mínimo de 16 jogadores." };
  const p = c.squad.find((x) => x.id === playerId);
  if (!p) return { career: c };
  const next = structuredClone(c);
  next.squad = next.squad.filter((x) => x.id !== playerId);
  next.balance += fee;
  next.offers = next.offers.filter((o) => o.playerId !== playerId);
  next.transferredOut.push(playerId);
  next.news.unshift({ id: `out-${p.id}`, date: c.date, kind: "transfer", title: `Vendido: ${p.name}`, body: `${toClub ? `Para o ${clubById(toClub).name}` : "Negociado"} por ${money(fee)}.` });
  return { career: next };
}


// ---------- finances ----------
export function ensureFields(c: CareerV2): CareerV2 {
  const club = clubById(c.clubId);
  return {
    ...c,
    debt: c.debt ?? club.debt,
    stadium: c.stadium ?? { capacity: club.capacity, ticketPrice: 60, level: 1 },
    sponsors: c.sponsors ?? initialSponsors(c.clubId),
    sponsorOffers: c.sponsorOffers ?? [],
    ledger: c.ledger ?? [],
  };
}

function initialSponsors(clubId: string): Sponsor[] {
  const club = clubById(clubId);
  const r = seeded(`sp:${clubId}`);
  const scale = club.rating >= 80 ? 1 : club.rating >= 75 ? 0.6 : 0.35;
  const pick = (arr: string[]) => arr[Math.floor(r() * arr.length)]!;
  return [
    { id: "sp-master", company: club.master ?? pick(COMPANIES), slot: "Máster", weekly: Math.round(2_400_000 * scale / 1000) * 1000, until: "2025-12-31", real: !!club.master },
    { id: "sp-kit", company: pick(KIT_BRANDS), slot: "Material esportivo", weekly: Math.round(1_300_000 * scale / 1000) * 1000, until: "2026-12-31" },
    { id: "sp-sleeve", company: pick(COMPANIES), slot: "Manga", weekly: Math.round(180_000 * scale / 1000) * 1000, until: "2025-09-30" },
  ];
}

export const SLOT_BASE: Record<SponsorSlot, number> = { "Máster": 2_400_000, "Material esportivo": 1_300_000, "Manga": 180_000, "Costas": 300_000, "Naming rights": 900_000 };

function addSponsorOffer(c: CareerV2, r: () => number) {
  const taken = new Set(c.sponsors.map((s) => s.slot));
  const slots = (Object.keys(SLOT_BASE) as SponsorSlot[]).filter((s) => s !== "Material esportivo");
  const slot = slots[Math.floor(r() * slots.length)]!;
  const pos = computeTable(c.fixtures).findIndex((x) => x.clubId === c.clubId) + 1;
  const prestige = (clubById(c.clubId).rating - 60) / 25 + (pos > 0 && pos <= 6 ? 0.2 : 0);
  const company = (slot === "Máster" ? ["Betano", "Superbet", "Itaú Unibanco", "Nubank", "Banco do Brasil", "Magazine Luiza", "Ambev", "Mercado Livre", "Esportes da Sorte", "PicPay"] : COMPANIES)[Math.floor(r() * (slot === "Máster" ? 10 : COMPANIES.length))]!;
  if (c.sponsors.some((s) => s.company === company)) return;
  const weekly = Math.round((SLOT_BASE[slot] * Math.max(0.25, prestige) * (0.8 + r() * 0.5)) / 1000) * 1000;
  const o: SponsorOffer = { id: `so-${c.date}-${slot}`, company, slot, weekly, weeks: [20, 40, 52][Math.floor(r() * 3)]!, expires: addDays(c.date, 5) };
  c.sponsorOffers.unshift(o);
  c.news.unshift({ id: o.id, date: c.date, kind: "offer", title: `${company} quer patrocinar o clube`, body: `${slot}: ${money(weekly)}/semana por ${o.weeks} semanas${taken.has(slot) ? " (substitui o contrato atual)" : ""}. Veja em Clube › Patrocínios.` });
}

export function acceptSponsor(c: CareerV2, offerId: string): CareerV2 {
  const o = c.sponsorOffers.find((x) => x.id === offerId);
  if (!o) return c;
  const next = structuredClone(c);
  next.sponsors = next.sponsors.filter((s) => s.slot !== o.slot);
  next.sponsors.push({ id: `sp-${o.id}`, company: o.company, slot: o.slot, weekly: o.weekly, until: addDays(c.date, o.weeks * 7) });
  next.sponsorOffers = next.sponsorOffers.filter((x) => x.id !== offerId);
  next.news.unshift({ id: `spok-${o.id}`, date: c.date, kind: "transfer", title: `Novo patrocínio: ${o.company}`, body: `${o.slot} · ${money(o.weekly)} por semana.` });
  return next;
}

export function currentWeek(c: CareerV2) {
  const d = new Date(`${c.date}T00:00:00Z`);
  const monday = addDays(c.date, -((d.getUTCDay() + 6) % 7));
  let wk = c.ledger[0];
  if (!wk || wk.week !== monday) { wk = { week: monday, income: 0, expense: 0, items: [] }; c.ledger.unshift(wk); c.ledger = c.ledger.slice(0, 8); }
  return wk;
}

function weeklyFinance(c: CareerV2) {
  const wk = currentWeek(c);
  const wages = Math.round(c.squad.reduce((s, p) => s + p.wage, 0) * 12 / 52);
  c.sponsors = c.sponsors.filter((s) => {
    if (s.until < c.date) { c.news.unshift({ id: `spend-${s.id}-${c.date}`, date: c.date, kind: "info", title: `Fim do contrato com ${s.company}`, body: `O espaço ${s.slot} está livre. Aguarde novas propostas.` }); return false; }
    return true;
  });
  const sponsorIncome = c.sponsors.reduce((s, x) => s + x.weekly, 0);
  const upkeep = Math.round(c.stadium.capacity * 9);
  c.balance += sponsorIncome - wages - upkeep;
  wk.income += sponsorIncome; wk.expense += wages + upkeep;
  wk.items.push({ label: "Patrocínios", value: sponsorIncome }, { label: "Salários", value: -wages }, { label: "Manutenção do estádio", value: -upkeep });
}

function monthlyDebt(c: CareerV2) {
  if (c.debt <= 0) return;
  const interest = Math.round(c.debt * 0.003);
  const principal = Math.round(Math.min(c.debt, c.debt * 0.002 + 200_000));
  c.balance -= interest + principal;
  c.debt -= principal;
  const wk = currentWeek(c);
  wk.expense += interest + principal;
  wk.items.push({ label: "Parcela da dívida (juros)", value: -interest }, { label: "Parcela da dívida (amortização)", value: -principal });
  c.news.unshift({ id: `debt-${c.date}`, date: c.date, kind: "info", title: "Parcela da dívida paga", body: `${money(interest + principal)} debitados. Dívida restante: ${money(c.debt)}.` });
}

export function payDebt(c: CareerV2, amount: number): { career: CareerV2; error?: string } {
  const value = Math.min(amount, c.debt);
  if (value <= 0) return { career: c };
  if (value > c.balance) return { career: c, error: "Saldo insuficiente para essa amortização." };
  const next = structuredClone(c);
  next.balance -= value; next.debt -= value;
  const wk = currentWeek(next); wk.expense += value; wk.items.push({ label: "Amortização antecipada", value: -value });
  return { career: next };
}

export function gateIncome(c: CareerV2) {
  const table = computeTable(c.fixtures);
  const pos = table.findIndex((r) => r.clubId === c.clubId) + 1;
  const hype = 0.95 - (pos - 1) * 0.015;
  const priceFactor = Math.max(0.25, 1.25 - c.stadium.ticketPrice / 160);
  const fill = Math.max(0.2, Math.min(1, hype * priceFactor));
  const attendance = Math.round(c.stadium.capacity * fill);
  return { attendance, fill, income: attendance * c.stadium.ticketPrice };
}

export const EXPANSION = { seats: 5000, cost: 25_000_000, days: 60 };
export function expandStadium(c: CareerV2): { career: CareerV2; error?: string } {
  if (c.stadium.building) return { career: c, error: "Já existe uma obra em andamento." };
  if (c.balance < EXPANSION.cost) return { career: c, error: `Precisa de ${money(EXPANSION.cost)} em caixa.` };
  const next = structuredClone(c);
  next.balance -= EXPANSION.cost;
  next.stadium.building = { until: addDays(c.date, EXPANSION.days), seats: EXPANSION.seats };
  const wk = currentWeek(next); wk.expense += EXPANSION.cost; wk.items.push({ label: "Obra de ampliação do estádio", value: -EXPANSION.cost });
  return { career: next };
}
