// Camada de acesso aos clubes (datapack, etapa 2).
// Hoje serve EXCLUSIVAMENTE os clubes que o jogo já tem (`CLUBS`). Nada do jogo usa este módulo ainda:
// `clubs.ts`, `clubById` e todos os chamadores atuais continuam intactos. A etapa 3 poderá religar os chamadores aqui,
// e um provedor de datapack poderá ser plugado depois sem mudar quem consome.
import { CLUBS, clubById, type Club } from "./clubs";
import { makeId } from "@/lib/datapack/ids";
import type { Club as PackClub, ClubId } from "@/lib/datapack/types";

export interface ClubProvider {
  /** De onde os clubes vêm (para diagnóstico). */
  readonly source: string;
  /** Clubes da liga principal, na mesma ordem de `CLUBS`. */
  list(): readonly Club[];
  /** Procura sem efeitos colaterais: clube principal ou `undefined`. Nunca inventa clube. */
  find(id: string): Club | undefined;
  /** Igual ao antigo `clubById`: clube principal; `sim-b-N` gera o clube simulado da Série B; senão lança o mesmo erro. */
  get(id: string): Club;
  has(id: string): boolean;
}

/** Id que o clube atual terá num datapack (`flamengo` → `club:flamengo`). Determinístico e sem colisões entre os clubes atuais. */
export const datapackClubId = (legacyId: string): ClubId => makeId("club", legacyId) as ClubId;

/** Descreve um clube atual no formato do datapack, preservando o id antigo em `legacyId`. Não muda o clube original. */
export function toPackClub(club: Club, countryId: PackClub["countryId"] = "ctry:brasil"): PackClub {
  return {
    id: datapackClubId(club.id), name: club.name, short: club.short, countryId, city: club.city, stadium: club.stadium,
    colors: [club.color, club.color2], rating: club.rating, legacyId: club.id, externalIds: { apiFootball: club.apiId },
  };
}

/** Provedor dos clubes atuais. Mesmos objetos, mesma ordem, mesmo comportamento do código antigo. */
export function createLegacyClubProvider(clubs: readonly Club[] = CLUBS): ClubProvider {
  const index = new Map<string, Club>();
  for (const c of clubs) if (!index.has(c.id)) index.set(c.id, c); // em duplicata vale o primeiro, como o `find` antigo
  return {
    source: "jogo-atual",
    list: () => clubs,
    find: (id) => index.get(id),
    // Fora do índice, a regra antiga decide (Série B simulada ou erro), para o comportamento ser idêntico por construção.
    get: (id) => index.get(id) ?? clubById(id),
    has: (id) => index.has(id),
  };
}

export const legacyClubs: ClubProvider = createLegacyClubProvider();
