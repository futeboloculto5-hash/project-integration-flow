// Camada de acesso aos jogadores (datapack, etapa 4).
// Dados-BASE dos jogadores ficam aqui; o que muda durante uma carreira (clube atual, contrato, lesões...) é da carreira
// (ver player-overlay.ts). Nada do jogo usa este módulo ainda: nenhum save, tela ou regra foi alterado.
// Fontes: (1) dados atuais do jogo, gerados pela mesma fórmula de sempre; (2) um datapack validado; (3) os dois combinados.
import { generateSquad, playerValue, playerWage, type Player, type Pos } from "./career";
import { legacyClubs } from "./club-provider";
import { makeId } from "@/lib/datapack/ids";
import { positionToLegacy } from "@/lib/datapack/positions";
import { validateDatapack } from "@/lib/datapack/validate";
import type { ClubId, DataStatus, PlayerId } from "@/lib/datapack/types";

/** Dados-base de um jogador, na forma que o jogo entende (posição de 4 letras, `rating`, id de clube do jogo). */
export type BasePlayer = {
  /** Id estável global. Nunca muda, mesmo com transferência, empréstimo ou venda. */
  id: PlayerId;
  /** Id que o jogo e os saves antigos já usam para este jogador, quando existir (ex.: "flamengo-s1-3"). */
  legacyId?: string;
  name: string;
  pos: Pos;
  age: number;
  ageUnknown?: boolean;
  rating: number;
  potential?: number;
  value: number;
  wage: number;
  /** Clube de ORIGEM nos dados-base (id do jogo, ou "livre"). Onde ele está agora é dado da carreira. */
  clubId: string;
  apiId?: number;
  dataStatus?: DataStatus;
  /** "legado" para os gerados pelo jogo; senão o packId do datapack. */
  origin: string;
};

export interface PlayerProvider {
  readonly source: string;
  list(): readonly BasePlayer[];
  /** Aceita o id estável OU um id legado (saves antigos). */
  find(id: string): BasePlayer | undefined;
  /** Como `find`, mas lança erro se não existir. */
  get(id: string): BasePlayer;
  has(id: string): boolean;
  /** Converte qualquer id conhecido (estável ou legado) no id estável. */
  resolveId(id: string): PlayerId | null;
  /** Jogadores de um clube nos dados-base (id do jogo). */
  byClub(clubId: string): readonly BasePlayer[];
  byPosition(pos: Pos): readonly BasePlayer[];
  /** Busca por nome, sem diferenciar maiúsculas nem acentos, em ordem alfabética. */
  search(text: string, limit?: number): BasePlayer[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Provedor genérico sobre uma lista de jogadores. `hidden` fica fora de listas e buscas, mas continua resolvendo por id (compatibilidade). */
export function createPlayerProvider(source: string, players: readonly BasePlayer[], hidden: readonly BasePlayer[] = []): PlayerProvider {
  const byId = new Map<string, BasePlayer>(), clubs = new Map<string, BasePlayer[]>(), positions = new Map<Pos, BasePlayer[]>();
  const list: BasePlayer[] = [], names: string[] = [];
  const index = (p: BasePlayer) => { byId.set(p.id, p); if (p.legacyId && !byId.has(p.legacyId)) byId.set(p.legacyId, p); };
  for (const p of players) {
    if (byId.has(p.id)) continue; // id repetido: vale o primeiro
    index(p); list.push(p); names.push(norm(p.name));
    (clubs.get(p.clubId) ?? clubs.set(p.clubId, []).get(p.clubId)!).push(p);
    (positions.get(p.pos) ?? positions.set(p.pos, []).get(p.pos)!).push(p);
  }
  for (const p of hidden) if (!byId.has(p.id)) index(p);
  const find = (id: string) => byId.get(id);
  return {
    source,
    list: () => list,
    find,
    get: (id) => { const p = find(id); if (!p) throw new Error(`Jogador não encontrado: ${id}`); return p; },
    has: (id) => byId.has(id),
    resolveId: (id) => find(id)?.id ?? null,
    byClub: (clubId) => clubs.get(clubId) ?? [],
    byPosition: (pos) => positions.get(pos) ?? [],
    search: (text, limit = 20) => {
      const q = norm(text);
      if (!q) return [];
      const out: BasePlayer[] = [];
      list.forEach((p, i) => { if (names[i]!.includes(q)) out.push(p); });
      return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
    },
  };
}

// ---------- conversão para o jogador que o jogo já usa ----------
/** O id que os sistemas atuais usam: o legado quando existe (saves antigos continuam batendo), senão o estável. */
export const gameId = (b: BasePlayer) => b.legacyId ?? b.id;
/** Jogador no formato atual do jogo, só com os dados-base. Contrato e estado de carreira são acrescentados pela carreira. */
export function toGamePlayer(b: BasePlayer): Player {
  return {
    id: gameId(b), clubId: b.clubId, pos: b.pos, age: b.age, rating: b.rating, name: b.name, value: b.value, wage: b.wage,
    ...(b.apiId !== undefined ? { apiId: b.apiId } : {}),
    ...(b.ageUnknown ? { ageUnknown: true } : {}),
    ...(b.potential !== undefined ? { potential: b.potential } : {}),
  };
}

// ---------- fonte 1: dados atuais do jogo ----------
/** Id estável de um jogador legado: derivado do id antigo, uma vez, e depois nunca mais muda. */
export const stableIdForLegacy = (legacyId: string): PlayerId => makeId("plr", legacyId) as PlayerId;

/** Elencos gerados pelo jogo (fórmula `generateSquad`) para os 20 clubes e para a Série B simulada. São dados SIMULADOS, não jogadores reais. */
export function createLegacyPlayerProvider(): PlayerProvider {
  const clubIds = [...legacyClubs.list().map((c) => c.id), ...Array.from({ length: 20 }, (_, i) => `sim-b-${i + 1}`)];
  const players = clubIds.flatMap((id) => generateSquad(id, legacyClubs.get(id).rating).map((p): BasePlayer => ({
    id: stableIdForLegacy(p.id), legacyId: p.id, name: p.name, pos: p.pos, age: p.age, rating: p.rating, value: p.value, wage: p.wage,
    clubId: p.clubId, dataStatus: "simulado", origin: "legado",
  })));
  return createPlayerProvider("jogo-atual", players);
}
export const legacyPlayers: PlayerProvider = createLegacyPlayerProvider();

// ---------- fonte 2: datapack ----------
const yearsBetween = (birth: string, asOf: string) => {
  const b = new Date(birth), a = new Date(asOf);
  let y = a.getUTCFullYear() - b.getUTCFullYear();
  if (a.getUTCMonth() < b.getUTCMonth() || (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate())) y--;
  return y;
};

/** Jogadores de um datapack, já no formato base. O pacote é validado antes; inválido ou de teste lança erro (a menos que `allowTestData`). */
export function playersFromDatapack(input: unknown, opts: { asOf: string; allowTestData?: boolean }): BasePlayer[] {
  const r = validateDatapack(input);
  if (!r.ok) { const first = r.issues.find((i) => i.severity === "error"); throw new Error(`Datapack inválido: ${first ? `${first.path} ${first.message}` : "erro desconhecido"}`); }
  const { pack } = r;
  if (pack.manifest.origin === "teste" && !opts.allowTestData) throw new Error("Datapack de TESTE recusado: dados de teste não entram no jogo real.");
  const clubOf = new Map<ClubId, string>(pack.clubs.map((c) => [c.id, c.legacyId ?? c.id.slice("club:".length)]));
  return pack.players.map((p): BasePlayer => {
    const age = p.age ?? (p.birthDate ? yearsBetween(p.birthDate, opts.asOf) : undefined);
    const known = age !== undefined && age >= 14;
    const finalAge = known ? age : 24, rating = p.overall;
    const api = p.externalIds?.["apiFootball"];
    return {
      id: p.id, name: p.name, pos: positionToLegacy(p.position), age: finalAge, rating,
      value: p.value ?? playerValue(rating, finalAge), wage: p.contract?.wage ?? playerWage(rating),
      clubId: p.clubId ? (clubOf.get(p.clubId) ?? p.clubId) : "livre", origin: pack.manifest.packId,
      ...(known ? {} : { ageUnknown: true }),
      ...(p.potential !== undefined ? { potential: p.potential } : {}),
      ...(typeof api === "number" ? { apiId: api } : {}),
      ...(p.dataStatus ? { dataStatus: p.dataStatus } : {}),
    };
  });
}
export function createDatapackPlayerProvider(input: unknown, opts: { asOf: string; allowTestData?: boolean }): PlayerProvider {
  return createPlayerProvider("datapack", playersFromDatapack(input, opts));
}

// ---------- fonte 3: datapack com dados atuais como reserva ----------
/**
 * O datapack manda nos clubes que ele cobre. Para clubes que o datapack não cobre, valem os dados atuais.
 * Os jogadores atuais dos clubes cobertos saem das listas e buscas, mas seus ids antigos continuam resolvendo (saves antigos não quebram).
 */
export function composePlayerProviders(primary: PlayerProvider, fallback: PlayerProvider): PlayerProvider {
  const covered = new Set(primary.list().map((p) => p.clubId));
  const keep: BasePlayer[] = [], hidden: BasePlayer[] = [];
  for (const p of fallback.list()) (covered.has(p.clubId) || primary.has(p.id) ? hidden : keep).push(p);
  return createPlayerProvider(`${primary.source}+${fallback.source}`, [...primary.list(), ...keep], [...hidden]);
}
