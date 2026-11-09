// Pacotes instalados (em memória). A loja é a única que "instala": só depois de um relatório sem erros, e de uma vez só.
// Uma importação rejeitada deixa tudo como estava. Jogadores que somem de uma versão nova ficam APOSENTADOS:
// continuam existindo e resolvendo por id (carreiras antigas não perdem ninguém), mas deixam de ser listados no pacote.
import { importDatapack, type ImportOptions, type ImportResult } from "./import";
import type { PackFile } from "./bundle";
import type { Club, ClubId, Datapack, Player } from "./types";

export type RetiredPlayer = {
  player: Player;
  /** Id do clube (do jogo) onde ele estava quando saiu do pacote, já traduzido com `legacyId`. */
  lastClubGameId: string | undefined;
  /** Versão do pacote que ainda o tinha. */
  lastSeenVersion: string;
};

export type InstalledPack = {
  pack: Datapack;
  retired: RetiredPlayer[];
  /** Versões já instaladas deste packId, na ordem. */
  history: string[];
};

export const gameClubIdOf = (c: Pick<Club, "id" | "legacyId">): string => c.legacyId ?? c.id.slice("club:".length);

export interface PackStore {
  get(packId: string): InstalledPack | undefined;
  list(): readonly InstalledPack[];
  /** Importa e, se aceito, instala. Rejeição não altera nada. */
  importFiles(files: readonly PackFile[], opts?: Omit<ImportOptions, "installed" | "otherPacks" | "context">): ImportResult;
  /** Todos os jogadores aposentados (de todos os pacotes). */
  retiredPlayers(): readonly RetiredPlayer[];
}

export function createPackStore(): PackStore {
  const packs = new Map<string, InstalledPack>();
  return {
    get: (id) => packs.get(id),
    list: () => [...packs.values()],
    retiredPlayers: () => [...packs.values()].flatMap((p) => p.retired),
    importFiles(files, opts = {}) {
      const result = importDatapack(files, {
        ...opts,
        context: (packId) => ({
          ...(packs.has(packId) ? { installed: packs.get(packId)!.pack } : {}),
          otherPacks: [...packs.values()].filter((p) => p.pack.manifest.packId !== packId).map((p) => p.pack),
        }),
      });
      const installed = result.pack ? packs.get(result.pack.manifest.packId) : undefined;
      if ((result.status !== "new" && result.status !== "update") || !result.pack || !result.diff) return result;
      const pack = result.pack;
      const retiredMap = new Map<string, RetiredPlayer>();
      if (installed) {
        for (const r of installed.retired) retiredMap.set(r.player.id, r);
        const clubs = new Map<ClubId, Club>(installed.pack.clubs.map((c) => [c.id, c] as const));
        const gone = new Set<string>(result.diff.players.disappeared);
        for (const p of installed.pack.players) {
          if (!gone.has(p.id)) continue;
          const club = p.clubId ? clubs.get(p.clubId) : undefined;
          retiredMap.set(p.id, { player: p, lastClubGameId: club ? gameClubIdOf(club) : undefined, lastSeenVersion: installed.pack.manifest.version });
        }
      }
      for (const p of pack.players) retiredMap.delete(p.id); // voltou ao pacote: deixa de ser aposentado
      packs.set(pack.manifest.packId, { pack, retired: [...retiredMap.values()], history: [...(installed?.history ?? []), pack.manifest.version] });
      return result;
    },
  };
}
