// Pipeline de importação de datapack. Etapas, nesta ordem (qualquer erro encerra e REJEITA o pacote inteiro):
//   1. detectar o formato (adaptador)  2. converter para o contrato interno  3. validar o contrato
//   4. política de origem/licença/dados de teste  5. reconciliar com os clubes fixos do jogo
//   6. identidade (candidatos a duplicata)  7. versão e comparação com o pacote já instalado.
// A função NÃO instala nada e NÃO altera o jogo: devolve o relatório e, se aceito, o pacote validado e a diferença.
import { diffPacks, isEmptyDiff, summarizeDiff, type PackDiff } from "./diff";
import { scanShared } from "./shared";
import { defaultRegistry, type AdapterRegistry } from "./adapters";
import type { PackFile } from "./bundle";
import { buildIdentityIndex, findDuplicateCandidates, findInternalDuplicates, type DuplicateCandidate, type PlayerSource } from "./identity";
import { ReportBuilder, type ImportReport } from "./report";
import { compareSemver } from "./version";
import type { Club, Datapack, Player } from "./types";
import { validateDatapack } from "./validate";

/** Clube permanente do jogo (só o necessário para reconciliar; o importador nunca altera estes dados). */
export type GameClubRef = { id: string; name: string };

export type ImportOptions = {
  /** Força um formato (id do adaptador) em vez de detectar. */
  formatId?: string;
  registry?: AdapterRegistry;
  /** Só para testes: aceita pacotes com origem "teste". Num jogo real fica desligado. */
  allowTestData?: boolean;
  /** Clubes permanentes do jogo, para reconciliar `legacyId`. Sem isto, a reconciliação é pulada. */
  gameClubs?: readonly GameClubRef[];
  /** Versão já instalada do MESMO packId, para regras de versão e importação incremental. */
  installed?: Datapack;
  /** Pacotes instalados de OUTROS packIds, para colisões de ids e duplicatas entre pacotes. */
  otherPacks?: readonly Datapack[];
  /** Alternativa a `installed`/`otherPacks`: consultada depois da validação, quando o packId já é conhecido (usada pela loja). */
  context?: (packId: string) => { installed?: Datapack; otherPacks: readonly Datapack[] };
};

export type ImportStatus =
  /** Pacote novo (nada instalado com esse packId). */
  | "new"
  /** Versão mais nova de um pacote instalado. */
  | "update"
  /** Mesma versão e mesmo conteúdo já instalados: nada a fazer. */
  | "unchanged"
  | "rejected";

export type ClubReconciliation = {
  /** legacyIds que existem no jogo. */
  matched: string[];
  /** legacyIds declarados pelo pacote que NÃO existem no jogo. */
  unknownLegacy: string[];
  /** Clubes do pacote sem legacyId (ou com id desconhecido): ficam fora do jogo até serem adotados. */
  packOnly: number;
  /** Clubes do jogo que o pacote não cobre (continuam com os dados atuais). */
  gameClubsNotCovered: number;
};

export type SharedSummary = { players: number; clubs: number; withPacks: string[]; sportingDifferences: number };

export type ImportResult = {
  status: ImportStatus;
  report: ImportReport;
  /** Presente quando aceito (new/update/unchanged). */
  pack?: Datapack;
  diff?: PackDiff;
  duplicates: DuplicateCandidate[];
  duplicatesTotal: number;
  reconciliation?: ClubReconciliation;
  /** Entidades que este pacote tem em comum com pacotes já instalados (mesmo id, mesma entidade). */
  shared?: SharedSummary;
};

export const POLICY = { minSquad: 11, maxSquad: 60, listed: 10 } as const;

const TEST_NAME = /\bteste\b/i;
const TEST_SLUG = /^(?:[a-z]+:)?teste(?:[-_.]|$)/;
/** Procura marcas de dado sintético de teste (ids "…:teste-…", nomes com "Teste"). Devolve alguns exemplos. */
export function findTestMarkers(pack: Datapack, max = 5): string[] {
  const out: string[] = [];
  const hit = (kind: string, id: string, name: string) => { if (out.length < max && (TEST_SLUG.test(id) || TEST_NAME.test(name))) out.push(`${kind} ${id} ("${name}")`); };
  if (TEST_SLUG.test(pack.manifest.packId) || TEST_NAME.test(pack.manifest.name)) out.push(`manifesto ${pack.manifest.packId} ("${pack.manifest.name}")`);
  for (const c of pack.countries) hit("país", c.id, c.name);
  for (const c of pack.competitions) hit("competição", c.id, c.name);
  for (const c of pack.clubs) hit("clube", c.id, c.name);
  for (const p of pack.players) { if (out.length >= max) break; hit("jogador", p.id, p.name); }
  return out;
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

/** Emite até `POLICY.listed` achados individuais e, se houver mais, um resumo com o total. */
function listCapped(rb: ReportBuilder, severity: "error" | "warning" | "info", stage: "policy" | "reconcile" | "diff", code: string, items: { path: string; message: string }[], summary: (n: number) => string) {
  for (const it of items.slice(0, POLICY.listed)) rb.add(severity, stage, code, it.path, it.message);
  if (items.length > POLICY.listed) rb.add(severity, stage, code, "", summary(items.length));
}

export function importDatapack(files: readonly PackFile[], opts: ImportOptions = {}): ImportResult {
  const rb = new ReportBuilder();
  const reject = (): ImportResult => ({ status: "rejected", report: rb.build(), duplicates: [], duplicatesTotal: 0 });
  const registry = opts.registry ?? defaultRegistry;

  // 1. formato
  const picked = registry.pick(files, opts.formatId);
  if ("error" in picked) { rb.error("detect", picked.error.code, "", picked.error.message); return reject(); }
  rb.formatId = picked.adapter.id;

  // 2. conversão
  const conv = picked.adapter.convert(files);
  rb.addAll("convert", conv.issues);
  if (rb.hasErrors) return reject();
  if (conv.pack === undefined) { rb.error("convert", "no_pack", "", "O adaptador não entregou nenhum pacote."); return reject(); }

  // 3. validação do contrato (o adaptador não consegue pular esta etapa)
  const v = validateDatapack(conv.pack);
  rb.addAll("validate", v.issues);
  if (v.truncated) rb.markTruncated();
  rb.stats = v.stats;
  if (!v.ok) {
    if (!rb.hasErrors) rb.error("validate", "invalid", "", "Pacote inválido.");
    return reject();
  }
  const pack = v.pack;
  const m = pack.manifest;
  const ctx = opts.context ? opts.context(m.packId) : { installed: opts.installed, otherPacks: opts.otherPacks ?? [] };
  const installedPack = ctx.installed;

  // 4. política de origem, licença e dados de teste
  const isTest = m.origin === "teste";
  if (isTest) {
    if (!opts.allowTestData) rb.error("policy", "test_pack_rejected", "manifest.origin", "Pacote de TESTE recusado: dados sintéticos não entram num jogo real.");
  } else {
    if (!m.source?.name) rb.error("policy", "missing_source", "manifest.source.name", "Pacote real precisa declarar a fonte dos dados (source.name).");
    if (!m.source?.license) rb.error("policy", "missing_license", "manifest.source.license", "Pacote real precisa declarar a licença ou autorização de uso (source.license).");
    const marks = findTestMarkers(pack);
    if (marks.length > 0) rb.error("policy", "test_data_in_real_pack", "manifest.origin", `Pacote declarado como "${m.origin}" contém dados de teste: ${marks.join("; ")}.`);
  }

  const seasons = [...new Set(pack.editions.map((e) => e.season))].sort();
  const confederations = [...new Set(pack.countries.flatMap((c) => (c.confederation ? [c.confederation] : [])))].sort();
  rb.pack = { packId: m.packId, version: m.version, name: m.name, origin: m.origin, seasons, confederations, countries: pack.countries.length };
  if (seasons.length === 0) rb.warn("policy", "no_season", "editions", "O pacote não tem edições de competição; não há temporada identificável.");

  // estrutura esportiva
  const inEdition = new Set<string>();
  for (const e of pack.editions) for (const id of e.clubIds) inEdition.add(id);
  listCapped(rb, "warning", "policy", "club_without_edition",
    pack.clubs.filter((c) => !inEdition.has(c.id)).map((c) => ({ path: c.id, message: `Clube ${c.id} não participa de nenhuma competição do pacote.` })),
    (n) => `${n} clubes não participam de nenhuma competição do pacote.`);
  const perClub = new Map<string, number>();
  let free = 0;
  for (const p of pack.players) { if (p.clubId) perClub.set(p.clubId, (perClub.get(p.clubId) ?? 0) + 1); else free++; }
  const odd: { path: string; message: string }[] = [];
  let empty = 0;
  for (const c of pack.clubs) {
    const n = perClub.get(c.id) ?? 0;
    if (n === 0) empty++;
    else if (n < POLICY.minSquad || n > POLICY.maxSquad) odd.push({ path: c.id, message: `Clube ${c.id} tem ${n} jogadores (esperado entre ${POLICY.minSquad} e ${POLICY.maxSquad}).` });
  }
  listCapped(rb, "warning", "policy", "squad_size_out_of_range", odd, (n) => `${n} clubes com elenco fora de ${POLICY.minSquad}–${POLICY.maxSquad} jogadores.`);
  if (empty > 0) rb.info("policy", "club_without_players", "", `${empty} clube(s) sem jogadores no pacote.`);
  if (free > 0) rb.info("policy", "free_agents", "", `${free} jogador(es) sem clube (agentes livres).`);

  // 5. reconciliação com os clubes permanentes do jogo
  let reconciliation: ClubReconciliation | undefined;
  if (opts.gameClubs) {
    const game = new Map(opts.gameClubs.map((c) => [c.id, c] as const));
    const matched: string[] = [], unknown: string[] = [];
    let packOnly = 0, adminIgnored = 0;
    const renamed: { path: string; message: string }[] = [];
    for (const c of pack.clubs as Club[]) {
      if (c.legacyId === undefined) { packOnly++; continue; }
      const g = game.get(c.legacyId);
      if (!g) { unknown.push(c.legacyId); packOnly++; continue; }
      matched.push(c.legacyId);
      if (c.city !== undefined || c.stadium !== undefined || c.colors !== undefined) adminIgnored++;
      if (c.name !== g.name) renamed.push({ path: c.id, message: `Clube ${c.id} se chama "${c.name}" no pacote e "${g.name}" no jogo (vale o nome do jogo).` });
    }
    listCapped(rb, "warning", "reconcile", "legacy_club_unknown", unknown.map((id) => ({ path: id, message: `legacyId "${id}" não existe nos clubes do jogo; o clube fica fora do jogo.` })), (n) => `${n} legacyId(s) não existem nos clubes do jogo.`);
    if (adminIgnored > 0) rb.info("reconcile", "admin_fields_ignored", "", `${adminIgnored} clube(s) do jogo trazem cidade/estádio/cores no pacote; esses dados administrativos do jogo permanecem como estão.`);
    listCapped(rb, "info", "reconcile", "club_name_differs", renamed, (n) => `${n} clubes com nome diferente do jogo.`);
    const matchedSet = new Set(matched);
    reconciliation = { matched, unknownLegacy: unknown, packOnly, gameClubsNotCovered: opts.gameClubs.filter((c) => !matchedSet.has(c.id)).length };
  }

  // ids compartilhados com outros pacotes instalados: o id é global; só é aceito se as descrições forem compatíveis
  const others = ctx.otherPacks;
  let shared: SharedSummary | undefined;
  if (others.length > 0) {
    const scan = scanShared(pack, others);
    listCapped(rb, "error", "policy", "identity_conflict", scan.conflicts, (n) => `${n} ids repetidos em outros pacotes não parecem ser a mesma entidade.`);
    listCapped(rb, "warning", "policy", "shared_identity_note", scan.notes, (n) => `${n} entidades compartilhadas com observações.`);
    if (scan.sharedPlayers + scan.sharedClubs > 0) {
      rb.info("policy", "shared_with_other_pack", "", `${scan.sharedPlayers} jogador(es) e ${scan.sharedClubs} clube(s) já existem em ${scan.withPacks.map((p) => `"${p}"`).join(", ")} e são a mesma entidade (mesmo id); nada é duplicado.`);
      if (scan.sportingDifferences > 0) rb.info("policy", "shared_sporting_differences", "", `${scan.sportingDifferences} jogador(es) compartilhado(s) têm clube, posição ou força diferentes entre pacotes; vale o pacote de maior precedência.`);
    }
    shared = { players: scan.sharedPlayers, clubs: scan.sharedClubs, withPacks: scan.withPacks, sportingDifferences: scan.sportingDifferences };
    const countryName = new Map<string, string>();
    for (const o of others) for (const c of o.countries) countryName.set(c.id, c.name);
    const conflicts: { path: string; message: string }[] = [];
    for (const c of pack.countries) { const n = countryName.get(c.id); if (n !== undefined && n !== c.name) conflicts.push({ path: c.id, message: `País ${c.id} se chama "${c.name}" aqui e "${n}" em outro pacote.` }); }
    listCapped(rb, "warning", "policy", "country_name_conflict", conflicts, (n) => `${n} países com nome diferente de outro pacote.`);
  }

  // 6. identidade
  const sources: PlayerSource[] = others.map((o) => ({ packId: o.manifest.packId, players: o.players }));
  const nextIds = new Set<string>(pack.players.map((p) => p.id));
  const gone: Player[] = installedPack ? installedPack.players.filter((p) => !nextIds.has(p.id)) : [];
  if (gone.length > 0) sources.push({ packId: `${m.packId}@${installedPack?.manifest.version ?? "anterior"}`, players: gone });
  const internal = findInternalDuplicates(m.packId, pack.players);
  const cross = sources.length > 0 ? findDuplicateCandidates(pack.players, buildIdentityIndex(sources), m.packId) : { candidates: [], total: 0, truncated: false, skippedGroups: 0 };
  const duplicates = [...internal.candidates, ...cross.candidates];
  const duplicatesTotal = internal.total + cross.total;
  const dupItems = (list: DuplicateCandidate[]) => list.map((d) => ({ path: d.a, message: `${d.a} ~ ${d.b} (${d.sourceOfB}): ${d.detail} Não foram unidos; é preciso revisão.` }));
  listCapped(rb, "warning", "policy", "possible_duplicate_player", dupItems(duplicates.filter((d) => d.confidence === "probable")), (n) => `${n} pares de jogadores prováveis duplicatas.`);
  const possible = duplicates.filter((d) => d.confidence === "possible");
  if (possible.length > 0) rb.info("policy", "possible_same_name", "", `${possible.length} par(es) com mesmo nome e nacionalidade (apenas informativo; nenhum foi unido).`);
  if (internal.truncated || cross.truncated) rb.markTruncated();
  if (internal.skippedGroups + cross.skippedGroups > 0) rb.warn("policy", "duplicate_scan_skipped", "", `${internal.skippedGroups + cross.skippedGroups} grupo(s) com mais de 50 jogadores iguais em nome/nascimento/id externo não foram comparados par a par; revise o pacote.`);

  // 7. versão e atualização incremental
  let status: ImportStatus = "new";
  let diff: PackDiff | undefined;
  const prev = installedPack;
  if (prev) {
    const cmp = compareSemver(m.version, prev.manifest.version) ?? 0;
    diff = diffPacks(prev, pack);
    if (cmp < 0) rb.error("diff", "downgrade", "manifest.version", `Versão ${m.version} é mais antiga que a instalada (${prev.manifest.version}).`);
    else if (cmp === 0) {
      if (isEmptyDiff(diff) && stable(prev.manifest) === stable(m)) { status = "unchanged"; rb.info("diff", "already_installed", "manifest.version", `Versão ${m.version} já está instalada, com o mesmo conteúdo.`); }
      else rb.error("diff", "same_version_different_content", "manifest.version", `A versão ${m.version} já está instalada com conteúdo diferente; publique uma versão nova.`);
    } else {
      status = "update";
      if (m.previousVersion !== undefined && m.previousVersion !== prev.manifest.version) rb.warn("diff", "previous_version_mismatch", "manifest.previousVersion", `O pacote diz substituir a v${m.previousVersion}, mas a instalada é a v${prev.manifest.version}.`);
      rb.info("diff", "update_summary", "", summarizeDiff(diff));
      if (diff.players.disappeared.length > 0) rb.info("diff", "players_disappeared", "", `${diff.players.disappeared.length} jogador(es) não aparecem mais no pacote; ficam preservados (nenhum é apagado das carreiras).`);
    }
  } else {
    diff = diffPacks(null, pack);
  }

  if (rb.hasErrors) return { ...reject(), duplicates, duplicatesTotal, ...(reconciliation ? { reconciliation } : {}), ...(shared ? { shared } : {}) };
  return { status, report: rb.build(), pack, ...(diff ? { diff } : {}), duplicates, duplicatesTotal, ...(reconciliation ? { reconciliation } : {}), ...(shared ? { shared } : {}) };
}
