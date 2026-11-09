// Leitura de arquivos do datapack nativo (ccw.datapack v1). Não interpreta o conteúdo: só junta os arquivos
// num objeto cru, que depois passa pelo validador. Nunca lança exceção por dado ruim: devolve achados.
//
// Dois layouts aceitos:
//  - um arquivo único `datapack.json` com { manifest, countries, competitions, editions, clubs, players };
//  - pacote dividido: `manifest.json` (objeto) + `countries.json`, `competitions.json`, `editions.json`, `clubs.json`
//    (lista JSON ou NDJSON) + um ou mais arquivos de jogadores (`players.json`, `players-001.ndjson`, `players/br.json`...).
import type { Issue } from "./types";

/** Arquivo já lido como texto. Independe de navegador, Node ou Bun. */
export type PackFile = { name: string; text: string };

export const BUNDLE_LIMITS = { maxFileChars: 150_000_000, maxFiles: 2000, maxBadLines: 5 } as const;

/** Parte do navegador que usamos (File), sem depender dos tipos DOM. */
export type FileLike = { name: string; size?: number; text(): Promise<string>; webkitRelativePath?: string };
/** Lê arquivos escolhidos pelo usuário. Falha de leitura de um arquivo é relatada e o arquivo é pulado. */
export async function readFileList(files: readonly FileLike[]): Promise<{ files: PackFile[]; issues: Issue[] }> {
  const out: PackFile[] = [];
  const issues: Issue[] = [];
  if (files.length > BUNDLE_LIMITS.maxFiles) {
    issues.push({ severity: "error", code: "too_many_files", path: "", message: `Arquivos demais (${files.length}); o limite é ${BUNDLE_LIMITS.maxFiles}.` });
    return { files: out, issues };
  }
  for (const f of files) {
    const name = f.webkitRelativePath && f.webkitRelativePath.length > 0 ? f.webkitRelativePath : f.name;
    if (typeof f.size === "number" && f.size > BUNDLE_LIMITS.maxFileChars) {
      issues.push({ severity: "error", code: "file_too_large", path: name, message: `Arquivo grande demais (${f.size} bytes).` });
      continue;
    }
    try { out.push({ name, text: await f.text() }); }
    catch { issues.push({ severity: "error", code: "file_unreadable", path: name, message: "Não foi possível ler o arquivo." }); }
  }
  return { files: out, issues };
}

const base = (name: string) => name.replace(/\\/g, "/").split("/").pop() ?? name;
const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export type ParsedFile = { ok: true; value: unknown } | { ok: false; issue: Issue };
const memo = new WeakMap<PackFile, ParsedFile>();

/** Lê um arquivo JSON inteiro (memorizado: detectar e converter não leem duas vezes). */
export function parseJsonFile(file: PackFile): ParsedFile {
  const hit = memo.get(file);
  if (hit) return hit;
  let r: ParsedFile;
  if (file.text.length > BUNDLE_LIMITS.maxFileChars) r = { ok: false, issue: { severity: "error", code: "file_too_large", path: file.name, message: "Arquivo grande demais." } };
  else {
    try { r = { ok: true, value: JSON.parse(stripBom(file.text)) as unknown }; }
    catch (e) { r = { ok: false, issue: { severity: "error", code: "bad_json", path: file.name, message: `JSON inválido: ${e instanceof Error ? e.message : "erro de leitura"}` } }; }
  }
  memo.set(file, r);
  return r;
}

/** Lista de registros: JSON `[...]` ou NDJSON (um objeto por linha). */
function parseRecords(file: PackFile): { ok: true; items: unknown[] } | { ok: false; issues: Issue[] } {
  const ext = base(file.name).toLowerCase();
  const text = stripBom(file.text);
  if (ext.endsWith(".ndjson") || ext.endsWith(".jsonl")) {
    const items: unknown[] = [];
    const issues: Issue[] = [];
    let bad = 0;
    let lineNo = 0;
    for (const line of text.split("\n")) {
      lineNo++;
      const t = line.trim();
      if (!t) continue;
      try { items.push(JSON.parse(t) as unknown); }
      catch {
        bad++;
        if (bad <= BUNDLE_LIMITS.maxBadLines) issues.push({ severity: "error", code: "bad_json_line", path: `${file.name}:${lineNo}`, message: "Linha com JSON inválido." });
      }
    }
    if (bad > BUNDLE_LIMITS.maxBadLines) issues.push({ severity: "error", code: "bad_json_line", path: file.name, message: `${bad} linhas inválidas no total (mostradas as ${BUNDLE_LIMITS.maxBadLines} primeiras).` });
    return bad > 0 ? { ok: false, issues } : { ok: true, items };
  }
  const p = parseJsonFile(file);
  if (!p.ok) return { ok: false, issues: [p.issue] };
  if (!Array.isArray(p.value)) return { ok: false, issues: [{ severity: "error", code: "not_a_list", path: file.name, message: "Era esperada uma lista de registros." }] };
  return { ok: true, items: p.value };
}

const TABLES = ["countries", "competitions", "editions", "clubs"] as const;
const isPlayersFile = (name: string) => {
  const n = name.replace(/\\/g, "/").toLowerCase();
  const b = base(n);
  return /^players([-_.].*)?\.(json|ndjson|jsonl)$/.test(b) || /(^|\/)players\/[^/]+\.(json|ndjson|jsonl)$/.test(n);
};
const tableOf = (name: string) => {
  const m = /^(countries|competitions|editions|clubs)\.(json|ndjson|jsonl)$/.exec(base(name).toLowerCase());
  return m ? (m[1] as (typeof TABLES)[number]) : null;
};
const isJson = (name: string) => /\.(json|ndjson|jsonl)$/i.test(name);

/** O arquivo `datapack.json` (único) ou o manifesto de um pacote dividido, se existirem. */
export const findSingleFile = (files: readonly PackFile[]) => files.find((f) => base(f.name).toLowerCase() === "datapack.json");
export const findManifestFile = (files: readonly PackFile[]) => files.find((f) => base(f.name).toLowerCase() === "manifest.json");

export type BundleResult = { pack?: unknown; issues: Issue[]; ignoredFiles: string[] };

/** Junta os arquivos num objeto cru no formato do contrato. Qualquer erro de leitura = nenhum `pack` (rejeição inteira). */
export function readNativeBundle(files: readonly PackFile[]): BundleResult {
  const issues: Issue[] = [];
  const ignored: string[] = [];
  const names = new Set<string>();
  for (const f of files) {
    const key = f.name.replace(/\\/g, "/").toLowerCase();
    if (names.has(key)) issues.push({ severity: "error", code: "duplicate_file", path: f.name, message: "Arquivo repetido no pacote." });
    names.add(key);
  }
  if (files.length > BUNDLE_LIMITS.maxFiles) issues.push({ severity: "error", code: "too_many_files", path: "", message: `Arquivos demais (${files.length}).` });
  if (issues.length > 0) return { issues, ignoredFiles: ignored };

  const single = findSingleFile(files);
  if (single) {
    const p = parseJsonFile(single);
    if (!p.ok) return { issues: [p.issue], ignoredFiles: ignored };
    for (const f of files) if (f !== single) ignored.push(f.name);
    if (ignored.length > 0) issues.push({ severity: "warning", code: "ignored_files", path: "", message: `datapack.json é o pacote; ${ignored.length} outro(s) arquivo(s) foram ignorados.` });
    return { pack: p.value, issues, ignoredFiles: ignored };
  }

  const manifestFile = findManifestFile(files);
  if (!manifestFile) return { issues: [{ severity: "error", code: "no_manifest", path: "", message: "Faltam datapack.json ou manifest.json." }], ignoredFiles: ignored };
  const m = parseJsonFile(manifestFile);
  if (!m.ok) return { issues: [m.issue], ignoredFiles: ignored };

  const tables: Record<string, unknown[]> = { countries: [], competitions: [], editions: [], clubs: [], players: [] };
  const seenTable = new Set<string>();
  let failed = false;
  for (const f of files) {
    if (f === manifestFile) continue;
    if (!isJson(f.name)) { ignored.push(f.name); continue; }
    const table = tableOf(f.name);
    const isPlayers = !table && isPlayersFile(f.name);
    if (!table && !isPlayers) { ignored.push(f.name); continue; }
    const key = table ?? "players";
    if (table) {
      if (seenTable.has(table)) { issues.push({ severity: "error", code: "duplicate_table", path: f.name, message: `Tabela "${table}" aparece em mais de um arquivo.` }); failed = true; continue; }
      seenTable.add(table);
    }
    const r = parseRecords(f);
    if (!r.ok) { issues.push(...r.issues); failed = true; continue; }
    const target = tables[key]!;
    for (const it of r.items) target.push(it);
  }
  if (ignored.length > 0) issues.push({ severity: "warning", code: "ignored_files", path: "", message: `${ignored.length} arquivo(s) não reconhecido(s) foram ignorados: ${ignored.slice(0, 5).join(", ")}${ignored.length > 5 ? "…" : ""}.` });
  if (failed) return { issues, ignoredFiles: ignored };
  return { pack: { manifest: m.value, ...tables }, issues, ignoredFiles: ignored };
}
