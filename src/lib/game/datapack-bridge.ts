// Ponte entre o sistema de importação de datapack (src/lib/datapack) e o jogo (etapa 6).
// SOMENTE LEITURA e ainda não usada por nenhuma tela, save ou regra: os jogadores atuais continuam sendo os do jogo até a
// importação ser validada com um pacote real. Aqui o jogo só empresta seus clubes permanentes para reconciliar e transforma
// pacotes instalados num PlayerProvider. Nada do que o pacote traz sobre cidade, estádio, cores, caixa ou dívidas chega aos clubes.
import { createPackStore, type GameClubRef, type ImportResult, type PackFile, type PackStore, type Player } from "@/lib/datapack";
import { legacyClubs } from "./club-provider";
import { createPlayerProvider, legacyPlayers, toBasePlayers, type BasePlayer, type PlayerProvider } from "./player-provider";

/** Clubes permanentes do jogo, na forma mínima que o importador usa para reconciliar. */
export const gameClubRefs = (): GameClubRef[] => legacyClubs.list().map((c) => ({ id: c.id, name: c.name }));

/** Importa um pacote reconciliando com os clubes do jogo. Se aceito, fica instalado na loja (que é independente dos saves). */
export function importDatapackForGame(store: PackStore, files: readonly PackFile[], opts: { allowTestData?: boolean } = {}): ImportResult {
  return store.importFiles(files, { gameClubs: gameClubRefs(), ...(opts.allowTestData ? { allowTestData: true } : {}) });
}

export type WorldPlayers = { active: BasePlayer[]; retired: BasePlayer[]; /** id antigo → id canônico (ligações de identidade confirmadas). */ aliases: Map<string, string> };

/**
 * Jogadores-base dos pacotes instalados, já combinados (precedência determinística entre pacotes que compartilham ids).
 * `retired` = os que saíram de versões novas (continuam resolvendo por id).
 */
export function worldPlayersFromStore(store: PackStore, opts: { asOf: string; allowTestData?: boolean }): WorldPlayers {
  // dado de teste nunca entra no jogo real
  const w = store.world((p) => p.pack.manifest.origin !== "teste" || opts.allowTestData === true);
  const byPack = new Map<string, Player[]>();
  for (const p of w.players) {
    const origin = w.playerOrigin.get(p.id)!;
    const list = byPack.get(origin);
    if (list) list.push(p); else byPack.set(origin, [p]);
  }
  const active: BasePlayer[] = [], retired: BasePlayer[] = [];
  for (const [packId, list] of byPack) active.push(...toBasePlayers(list, (id) => w.clubGameId.get(id), packId, opts.asOf));
  for (const r of w.retired) retired.push(...toBasePlayers([r.player], () => r.lastClubGameId, r.packId, opts.asOf));
  return { active, retired, aliases: w.aliases };
}

/**
 * Provedor de jogadores do "mundo" importado, com os jogadores atuais do jogo como reserva.
 * Os pacotes mandam nos clubes que cobrem; para os demais valem os dados atuais. Ids antigos (jogo e aposentados) continuam resolvendo.
 */
export function createWorldPlayerProvider(store: PackStore, opts: { asOf: string; allowTestData?: boolean; fallback?: PlayerProvider }): PlayerProvider {
  const fallback = opts.fallback ?? legacyPlayers;
  const { active, retired, aliases } = worldPlayersFromStore(store, opts);
  const activeIds = new Set(active.map((p) => p.id));
  const covered = new Set(active.map((p) => p.clubId));
  const keep: BasePlayer[] = [], hidden: BasePlayer[] = [...retired];
  for (const p of fallback.list()) (covered.has(p.clubId) || activeIds.has(p.id) ? hidden : keep).push(p);
  return createPlayerProvider(`mundo+${fallback.source}`, [...active, ...keep], hidden, aliases);
}

export { createPackStore };
