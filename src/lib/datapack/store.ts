// Pacotes instalados (em memória). A loja é a única que "instala": só depois de um relatório sem erros, e de uma vez só.
// Uma importação rejeitada deixa tudo como estava. Jogadores que somem de uma versão nova ficam APOSENTADOS:
// continuam existindo e resolvendo por id (carreiras antigas não perdem ninguém), mas deixam de ser listados no pacote.
// Etapa 7: ids compartilhados entre pacotes são permitidos quando compatíveis; a loja mantém o livro de identidade
// (histórico e ligações confirmadas) e a prioridade de cada pacote, e entrega a visão efetiva do mundo.
import { importDatapack, type ImportOptions, type ImportResult } from "./import";
import type { PackFile } from "./bundle";
import { cloneLedger, createLedger, linkIds, parseLedger, recordPack, type IdentityLedger, type LinkResult } from "./identity-ledger";
import { gameClubIdOf, resolveWorld, type RetiredPlayer, type WorldView } from "./world";
import type { Club, ClubId, Datapack } from "./types";

export { gameClubIdOf, type RetiredPlayer } from "./world";

export type InstalledPack = {
  pack: Datapack;
  retired: RetiredPlayer[];
  /** Versões já instaladas deste packId, na ordem. */
  history: string[];
  /** Maior vence quando o mesmo id aparece em mais de um pacote (padrão 0). */
  priority: number;
};

export type StoreImportOptions = Omit<ImportOptions, "installed" | "otherPacks" | "context"> & {
  /** Prioridade do pacote. Numa atualização, se omitida, vale a que o pacote já tinha. */
  priority?: number;
};

export interface PackStore {
  get(packId: string): InstalledPack | undefined;
  list(): readonly InstalledPack[];
  /** Importa e, se aceito, instala. Rejeição não altera nada. */
  importFiles(files: readonly PackFile[], opts?: StoreImportOptions): ImportResult;
  /** Todos os jogadores aposentados (de todos os pacotes). */
  retiredPlayers(): readonly RetiredPlayer[];
  setPriority(packId: string, priority: number): boolean;
  /** Livro de identidade (histórico de ids e ligações confirmadas). Não altere diretamente: use `link`. */
  ledger(): IdentityLedger;
  /** Confirma que `from` é o mesmo que `to`. Decisão humana, com justificativa. Não altera nenhum pacote. */
  link(from: string, to: string, note: string): LinkResult;
  /** Restaura um livro salvo (substitui o atual). Recusa formato inválido sem alterar nada. */
  restoreLedger(input: unknown): { ok: true } | { ok: false; error: string };
  /** Visão efetiva: pacotes combinados, com precedência determinística, aliases e aposentados. `include` filtra pacotes (ex.: sem dados de teste). */
  world(include?: (p: InstalledPack) => boolean): WorldView;
}

export function createPackStore(): PackStore {
  const packs = new Map<string, InstalledPack>();
  let ledger: IdentityLedger = createLedger();
  return {
    get: (id) => packs.get(id),
    list: () => [...packs.values()],
    retiredPlayers: () => [...packs.values()].flatMap((p) => p.retired),
    ledger: () => ledger,
    setPriority(packId, priority) {
      const p = packs.get(packId);
      if (!p || !Number.isFinite(priority)) return false;
      p.priority = priority;
      return true;
    },
    link: (from, to, note) => linkIds(ledger, { from, to, note }),
    restoreLedger(input) {
      const r = parseLedger(input);
      if (!r.ok) return r;
      ledger = r.ledger;
      return { ok: true };
    },
    world: (include) => resolveWorld([...packs.values()].filter((p) => !include || include(p)).map((p) => ({ pack: p.pack, priority: p.priority, retired: p.retired })), ledger),
    importFiles(files, opts = {}) {
      const { priority, ...importOpts } = opts;
      const result = importDatapack(files, {
        ...importOpts,
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
      const work = cloneLedger(ledger);
      recordPack(work, pack);
      packs.set(pack.manifest.packId, { pack, retired: [...retiredMap.values()], history: [...(installed?.history ?? []), pack.manifest.version], priority: priority ?? installed?.priority ?? 0 });
      ledger = work;
      return result;
    },
  };
}
