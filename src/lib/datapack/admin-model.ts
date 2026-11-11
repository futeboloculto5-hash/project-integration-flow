// Modelo da administração de datapacks (etapa 7, fase 4): transforma o que a loja e o importador já sabem em dados prontos
// para uma tela (listas, contagens, textos). Funções puras, sem React e sem acesso ao jogo ou ao banco.
import type { PackDiff } from "./diff";
import type { ImportResult, ImportStatus } from "./import";
import type { ReportIssue } from "./report";
import type { InstalledPack, PackStore } from "./store";
import type { Datapack } from "./types";
import { compareSemver } from "./version";

export const ORIGIN_LABEL: Record<string, string> = { oficial: "Oficial", licenciado: "Licenciado", comunitario: "Comunitário", teste: "TESTE (dados sintéticos)" };
export const STATUS_LABEL: Record<ImportStatus, string> = { new: "Pacote novo", update: "Atualização", unchanged: "Já instalado (sem mudanças)", rejected: "Rejeitado" };

export type CompetitionInfo = { id: string; name: string; country: string | null; kind: string; tier: number | null; seasons: string[]; clubs: number };
export type PackSummary = {
  packId: string; name: string; version: string; origin: string; originLabel: string; isTest: boolean; priority: number;
  seasons: string[]; countries: { id: string; name: string; confederation: string | null }[]; confederations: string[];
  counts: { clubs: number; players: number; competitions: number; editions: number; retired: number; freeAgents: number };
  competitions: CompetitionInfo[];
  source: { name: string | null; url: string | null; license: string | null; retrievedAt: string | null };
  createdAt: string; history: string[]; notes: string | null;
};

/** Resumo de um pacote instalado, para a lista e o detalhe. */
export function summarizePack(inst: InstalledPack): PackSummary {
  const p = inst.pack, m = p.manifest;
  const countryName = new Map(p.countries.map((c) => [c.id, c.name] as const));
  const seasonsOf = new Map<string, Set<string>>(), clubsOf = new Map<string, Set<string>>();
  for (const e of p.editions) {
    (seasonsOf.get(e.competitionId) ?? seasonsOf.set(e.competitionId, new Set()).get(e.competitionId)!).add(e.season);
    const set = clubsOf.get(e.competitionId) ?? clubsOf.set(e.competitionId, new Set()).get(e.competitionId)!;
    for (const id of e.clubIds) set.add(id);
  }
  return {
    packId: m.packId, name: m.name, version: m.version, origin: m.origin, originLabel: ORIGIN_LABEL[m.origin] ?? m.origin, isTest: m.origin === "teste", priority: inst.priority,
    seasons: [...new Set(p.editions.map((e) => e.season))].sort(),
    countries: p.countries.map((c) => ({ id: c.id, name: c.name, confederation: c.confederation ?? null })),
    confederations: [...new Set(p.countries.flatMap((c) => (c.confederation ? [c.confederation] : [])))].sort(),
    counts: { clubs: p.clubs.length, players: p.players.length, competitions: p.competitions.length, editions: p.editions.length, retired: inst.retired.length, freeAgents: p.players.filter((x) => !x.clubId).length },
    competitions: p.competitions.map((c) => ({
      id: c.id, name: c.name, country: c.countryId ? (countryName.get(c.countryId) ?? c.countryId) : null, kind: c.kind, tier: c.tier ?? null,
      seasons: [...(seasonsOf.get(c.id) ?? [])].sort(), clubs: clubsOf.get(c.id)?.size ?? 0,
    })),
    source: { name: m.source?.name ?? null, url: m.source?.url ?? null, license: m.source?.license ?? null, retrievedAt: m.source?.retrievedAt ?? null },
    createdAt: m.createdAt, history: inst.history.slice(), notes: m.notes ?? null,
  };
}

export type AdminSnapshot = {
  packs: PackSummary[];
  totals: { packs: number; clubs: number; players: number; retired: number; sharedPlayers: number; sharedClubs: number; confirmedLinks: number };
  /** Algum pacote de teste está instalado (a interface deve avisar: não entra no jogo real). */
  hasTestPacks: boolean;
};

export function adminSnapshot(store: PackStore): AdminSnapshot {
  const packs = store.list().map(summarizePack).sort((a, b) => a.name.localeCompare(b.name) || a.packId.localeCompare(b.packId));
  const world = store.world();
  return {
    packs,
    totals: {
      packs: packs.length, clubs: world.clubs.length, players: world.players.length, retired: world.retired.length,
      sharedPlayers: world.shared.players.size, sharedClubs: world.shared.clubs.size, confirmedLinks: store.ledger().links.length,
    },
    hasTestPacks: packs.some((p) => p.isTest),
  };
}

// ---------- atualizações ----------
export type AvailablePack = { packId: string; version: string; url?: string };
export type UpdateInfo = { packId: string; name: string; installed: string; available: string; state: "update" | "current" | "older"; url: string | null };
/** Compara o que está instalado com um catálogo informado (quem decide de onde vem o catálogo é quem chama; aqui não há acesso à rede). */
export function checkForUpdates(store: PackStore, catalog: readonly AvailablePack[]): UpdateInfo[] {
  const out: UpdateInfo[] = [];
  for (const a of catalog) {
    const inst = store.get(a.packId);
    if (!inst) continue;
    const c = compareSemver(a.version, inst.pack.manifest.version) ?? 0;
    out.push({ packId: a.packId, name: inst.pack.manifest.name, installed: inst.pack.manifest.version, available: a.version, state: c > 0 ? "update" : c === 0 ? "current" : "older", url: a.url ?? null });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

// ---------- relatório de uma importação ----------
export type PlayerChange = { id: string; name: string; what: string };
export type ImportSummary = {
  status: ImportStatus; statusLabel: string; ok: boolean;
  pack: { packId: string; name: string; version: string; originLabel: string; seasons: string[] } | null;
  counts: { errors: number; warnings: number; infos: number };
  truncated: boolean;
  errors: ReportIssue[]; warnings: ReportIssue[]; infos: ReportIssue[];
  /** Presente quando houve comparação (pacote aceito). */
  changes: null | {
    fromVersion: string | null; toVersion: string;
    added: PlayerChange[]; changed: PlayerChange[]; moved: PlayerChange[]; disappeared: PlayerChange[];
    totals: { added: number; changed: number; moved: number; disappeared: number; unchanged: number };
    clubs: { added: number; removed: number; changed: number };
    competitionsAdded: string[]; competitionsRemoved: string[];
  };
  possibleDuplicates: number;
};

const FIELD_LABEL: Record<string, string> = { overall: "força", potential: "potencial", age: "idade", birthDate: "nascimento", clubId: "clube", position: "posição", value: "valor", contract: "contrato", name: "nome", attributes: "atributos", nationalityId: "nacionalidade" };
const fieldText = (fields: string[]) => fields.map((f) => FIELD_LABEL[f] ?? f).join(", ");

/** Resumo do resultado de `importDatapack`/`store.importFiles` para a tela. `previous` é a versão anterior (para dar nomes aos sumidos). Listas são limitadas. */
export function summarizeImport(r: ImportResult, previous?: Datapack | null, limit = 50): ImportSummary {
  const rep = r.report;
  const next = r.pack ?? null;
  const names = new Map<string, string>();
  for (const p of previous?.players ?? []) names.set(p.id, p.name);
  for (const p of next?.players ?? []) names.set(p.id, p.name);
  const nm = (id: string) => names.get(id) ?? id;
  const clubName = (id: string | null) => (id === null ? "sem clube" : (next?.clubs.find((c) => c.id === id) ?? previous?.clubs.find((c) => c.id === id))?.name ?? id);
  const d: PackDiff | undefined = r.diff;
  const compName = (id: string) => (next?.competitions.find((c) => c.id === id) ?? previous?.competitions.find((c) => c.id === id))?.name ?? id;
  return {
    status: r.status, statusLabel: STATUS_LABEL[r.status], ok: rep.ok,
    pack: rep.pack ? { packId: rep.pack.packId, name: rep.pack.name, version: rep.pack.version, originLabel: ORIGIN_LABEL[rep.pack.origin] ?? rep.pack.origin, seasons: rep.pack.seasons } : null,
    counts: { errors: rep.errors, warnings: rep.warnings, infos: rep.infos },
    truncated: rep.truncated,
    errors: rep.issues.filter((i) => i.severity === "error"), warnings: rep.issues.filter((i) => i.severity === "warning"), infos: rep.issues.filter((i) => i.severity === "info"),
    changes: d && r.status !== "rejected" ? {
      fromVersion: d.fromVersion, toVersion: d.toVersion,
      added: d.players.added.slice(0, limit).map((id) => ({ id, name: nm(id), what: "novo no pacote" })),
      changed: d.players.changed.filter((c) => !c.fields.every((f) => f === "clubId")).slice(0, limit).map((c) => ({ id: c.id, name: nm(c.id), what: fieldText(c.fields) })),
      moved: d.players.moved.slice(0, limit).map((m) => ({ id: m.id, name: nm(m.id), what: `${clubName(m.from)} → ${clubName(m.to)}` })),
      disappeared: d.players.disappeared.slice(0, limit).map((id) => ({ id, name: nm(id), what: "saiu do pacote (continua guardado nas carreiras)" })),
      totals: { added: d.players.added.length, changed: d.players.changed.length, moved: d.players.moved.length, disappeared: d.players.disappeared.length, unchanged: d.players.unchanged },
      clubs: { added: d.clubs.added.length, removed: d.clubs.removed.length, changed: d.clubs.changed.length },
      competitionsAdded: d.competitions.added.map(compName), competitionsRemoved: d.competitions.removed.map(compName),
    } : null,
    possibleDuplicates: r.duplicatesTotal,
  };
}
