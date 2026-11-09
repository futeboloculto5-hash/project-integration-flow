// Adaptadores de formato: cada um sabe ler UM formato de origem e entregar o contrato interno (ccw.datapack).
// Regras:
//  - um adaptador só converte; quem valida é sempre o validador do contrato (o adaptador não pode "pular" a validação);
//  - nenhum formato é suposto: sem adaptador que reconheça os arquivos, a importação é recusada com a lista dos suportados;
//  - adaptadores para formatos de terceiros só nascem com uma amostra real do formato em mãos (não há nenhum hoje).
import type { Issue } from "./types";
import { DATAPACK_SCHEMA } from "./types";
import { findManifestFile, findSingleFile, parseJsonFile, readNativeBundle, type PackFile } from "./bundle";

export type DetectResult = { match: boolean; reason?: string };
export type ConvertResult = { /** Objeto no formato do contrato, ainda NÃO validado. Ausente = não foi possível converter. */ pack?: unknown; issues: Issue[] };

export interface DatapackAdapter {
  /** Identificador estável, ex.: "ccw-native-v1". */
  readonly id: string;
  readonly label: string;
  /** Barato e sem efeitos: só olha os arquivos. Nunca lança. */
  detect(files: readonly PackFile[]): DetectResult;
  /** Converte para o contrato interno. Nunca lança; problemas vão em `issues`. */
  convert(files: readonly PackFile[]): ConvertResult;
}

// ---------- adaptador nativo ----------
const HEAD = 64 * 1024;
const marker = new RegExp(`"schema"\\s*:\\s*"${DATAPACK_SCHEMA.replace(".", "\\.")}"`);

function declaresNativeSchema(file: PackFile): boolean {
  // Pacotes gerados por nós trazem o manifesto primeiro; só se o marcador não estiver no começo lemos o JSON inteiro.
  if (marker.test(file.text.slice(0, HEAD))) return true;
  if (file.text.length <= HEAD) return false;
  const p = parseJsonFile(file);
  if (!p.ok || typeof p.value !== "object" || p.value === null) return false;
  const m = (p.value as Record<string, unknown>)["manifest"];
  return typeof m === "object" && m !== null && (m as Record<string, unknown>)["schema"] === DATAPACK_SCHEMA;
}

export const nativeAdapter: DatapackAdapter = {
  id: "ccw-native-v1",
  label: "Datapack nativo do Clube Campeão WORLD (ccw.datapack v1, JSON/NDJSON)",
  detect(files) {
    const single = findSingleFile(files);
    if (single) return declaresNativeSchema(single) ? { match: true } : { match: false, reason: `datapack.json não declara schema "${DATAPACK_SCHEMA}".` };
    const man = findManifestFile(files);
    if (!man) return { match: false, reason: "Sem datapack.json nem manifest.json." };
    const p = parseJsonFile(man);
    if (p.ok && typeof p.value === "object" && p.value !== null && (p.value as Record<string, unknown>)["schema"] === DATAPACK_SCHEMA) return { match: true };
    return { match: false, reason: `manifest.json não declara schema "${DATAPACK_SCHEMA}".` };
  },
  convert(files) {
    const r = readNativeBundle(files);
    return { ...(r.pack !== undefined ? { pack: r.pack } : {}), issues: r.issues };
  },
};

// ---------- registro ----------
export type AdapterRegistry = {
  list(): readonly DatapackAdapter[];
  /** Escolhe o adaptador. `formatId` força um (útil quando o usuário sabe o formato). */
  pick(files: readonly PackFile[], formatId?: string): { adapter: DatapackAdapter } | { error: { code: string; message: string } };
};

export function createAdapterRegistry(adapters: readonly DatapackAdapter[]): AdapterRegistry {
  const ids = new Set<string>();
  for (const a of adapters) {
    if (ids.has(a.id)) throw new Error(`Adaptador repetido: ${a.id}`);
    ids.add(a.id);
  }
  const supported = () => adapters.map((a) => `${a.id} (${a.label})`).join("; ") || "nenhum";
  return {
    list: () => adapters,
    pick(files, formatId) {
      if (formatId !== undefined) {
        const a = adapters.find((x) => x.id === formatId);
        if (!a) return { error: { code: "unknown_format_id", message: `Formato "${formatId}" não existe. Suportados: ${supported()}.` } };
        const d = a.detect(files);
        if (!d.match) return { error: { code: "format_mismatch", message: `Os arquivos não são do formato "${formatId}"${d.reason ? `: ${d.reason}` : ""}.` } };
        return { adapter: a };
      }
      const hits = adapters.filter((a) => a.detect(files).match);
      if (hits.length === 1) return { adapter: hits[0]! };
      if (hits.length > 1) return { error: { code: "ambiguous_format", message: `Mais de um adaptador reconhece os arquivos (${hits.map((h) => h.id).join(", ")}); informe o formato.` } };
      return { error: { code: "unknown_format", message: `Formato não reconhecido. Suportados: ${supported()}.` } };
    },
  };
}

/** Adaptadores que o jogo traz de fábrica: somente o nativo. */
export const defaultAdapters: readonly DatapackAdapter[] = [nativeAdapter];
export const defaultRegistry: AdapterRegistry = createAdapterRegistry(defaultAdapters);
