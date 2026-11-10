// Visão efetiva do "mundo" (etapa 7): junta os pacotes instalados num só conjunto de clubes e jogadores, resolvendo ids
// compartilhados de forma DETERMINÍSTICA, que não depende da ordem de instalação:
//   precedência = prioridade (maior vence) → data de criação do pacote (mais recente vence) → packId (ordem alfabética).
// O pacote vencedor fornece o registro; os demais ficam em `alsoIn` e as diferenças em `differs` (para a interface mostrar).
// Ligações de id confirmadas por uma pessoa (livro de identidade) viram aliases: o id antigo resolve para o canônico e não é listado.
import { changedFields } from "./diff";
import { aliasMap, type IdentityLedger } from "./identity-ledger";
import type { Club, ClubId, Datapack, Issue, Player } from "./types";

/** Jogador que saiu da versão mais nova de um pacote. Continua existindo e resolvendo por id. */
export type RetiredPlayer = {
  player: Player;
  /** Id do clube (do jogo) onde ele estava quando saiu do pacote, já traduzido com `legacyId`. */
  lastClubGameId: string | undefined;
  /** Versão do pacote que ainda o tinha. */
  lastSeenVersion: string;
};

/** Id que o jogo usa para o clube: o `legacyId` quando existe, senão o slug do id estável. */
export const gameClubIdOf = (c: Pick<Club, "id" | "legacyId">): string => c.legacyId ?? c.id.slice("club:".length);

export type WorldPack = { pack: Datapack; priority: number; retired: readonly RetiredPlayer[] };
export type Difference = { packId: string; fields: string[] };
export type Provenance = { winner: string; alsoIn: string[]; differs: Difference[] };
export type WorldView = {
  players: Player[];
  clubs: Club[];
  /** id estável do clube → id do jogo. */
  clubGameId: Map<ClubId, string>;
  /** id → packId que forneceu o registro efetivo. */
  playerOrigin: Map<string, string>;
  /** Só entidades presentes em mais de um pacote. */
  shared: { players: Map<string, Provenance>; clubs: Map<string, Provenance> };
  retired: (RetiredPlayer & { packId: string })[];
  /** id antigo → id canônico (ligações confirmadas). */
  aliases: Map<string, string>;
  issues: Issue[];
};

/** Ordem de precedência: o primeiro vence. */
export function precedenceOrder(packs: readonly WorldPack[]): WorldPack[] {
  return [...packs].sort((a, b) =>
    b.priority - a.priority
    || b.pack.manifest.createdAt.localeCompare(a.pack.manifest.createdAt)
    || a.pack.manifest.packId.localeCompare(b.pack.manifest.packId));
}

export function resolveWorld(packs: readonly WorldPack[], ledger?: IdentityLedger): WorldView {
  const ordered = precedenceOrder(packs);
  const issues: Issue[] = [];
  const clubs = new Map<string, { club: Club; packId: string }>(), players = new Map<string, { player: Player; packId: string }>();
  const sharedClubs = new Map<string, Provenance>(), sharedPlayers = new Map<string, Provenance>();
  const note = (m: Map<string, Provenance>, id: string, winner: { packId: string }, other: { packId: string }, a: object, b: object) => {
    let pv = m.get(id);
    if (!pv) { pv = { winner: winner.packId, alsoIn: [], differs: [] }; m.set(id, pv); }
    pv.alsoIn.push(other.packId);
    const f = changedFields(a, b).filter((k) => k !== "id");
    if (f.length > 0) pv.differs.push({ packId: other.packId, fields: f });
  };
  for (const wp of ordered) {
    const packId = wp.pack.manifest.packId;
    for (const c of wp.pack.clubs) {
      const have = clubs.get(c.id);
      if (!have) clubs.set(c.id, { club: c, packId }); else note(sharedClubs, c.id, have, { packId }, have.club, c);
    }
    for (const p of wp.pack.players) {
      const have = players.get(p.id);
      if (!have) players.set(p.id, { player: p, packId }); else note(sharedPlayers, p.id, have, { packId }, have.player, p);
    }
  }
  // ligações confirmadas: o id antigo só vale como alias se o canônico existir no mundo
  const aliases = new Map<string, string>();
  if (ledger) {
    for (const [from, to] of aliasMap(ledger)) {
      if (!players.has(to) && !clubs.has(to)) {
        if (players.has(from) || clubs.has(from)) issues.push({ severity: "warning", code: "link_target_missing", path: from, message: `${from} está ligado a ${to}, que não existe nos pacotes instalados; a ligação foi ignorada.` });
        continue;
      }
      aliases.set(from, to);
      players.delete(from); // o canônico é quem aparece; o id antigo continua resolvendo via alias
    }
  }
  const clubList = [...clubs.values()].map((x) => x.club);
  const clubGameId = new Map<ClubId, string>(clubList.map((c) => [c.id, gameClubIdOf(c)] as const));
  const playerOrigin = new Map<string, string>();
  const playerList: Player[] = [];
  for (const [id, x] of players) { playerList.push(x.player); playerOrigin.set(id, x.packId); }
  const retired: WorldView["retired"] = [];
  const seen = new Set<string>();
  for (const wp of ordered) {
    for (const r of wp.retired) {
      const id = r.player.id;
      if (players.has(id) || aliases.has(id) || seen.has(id)) continue;
      seen.add(id);
      retired.push({ ...r, packId: wp.pack.manifest.packId });
    }
  }
  return { players: playerList, clubs: clubList, clubGameId, playerOrigin, shared: { players: sharedPlayers, clubs: sharedClubs }, retired, aliases, issues };
}
