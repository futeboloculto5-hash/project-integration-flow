import type { IdKind } from "./types";

// Ids estáveis: `<tipo>:<slug>`. O slug usa a-z, 0-9 e separadores . _ - (sem espaço, sem acento, sem maiúscula).
const SLUG = "[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?";
const PATTERNS: Record<IdKind, RegExp> = {
  ctry: new RegExp(`^ctry:${SLUG}$`),
  comp: new RegExp(`^comp:${SLUG}$`),
  club: new RegExp(`^club:${SLUG}$`),
  plr: new RegExp(`^plr:${SLUG}$`),
};
export const ID_KINDS = Object.keys(PATTERNS) as IdKind[];
export const isValidId = (kind: IdKind, value: unknown): value is string => typeof value === "string" && PATTERNS[kind].test(value);
/** Id de pacote (packId): mesmas regras do slug. */
export const isValidPackId = (value: unknown): value is string => typeof value === "string" && new RegExp(`^${SLUG}$`).test(value);

/** Monta um id a partir de um texto livre (tira acentos, passa para minúsculas, troca o resto por "-"). */
export function slugify(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
}
export function makeId(kind: IdKind, text: string): string {
  const slug = slugify(text);
  if (!slug) throw new Error("slug vazio");
  return `${kind}:${slug}`;
}
export function parseId(id: string): { kind: IdKind; slug: string } | null {
  const i = id.indexOf(":");
  const kind = id.slice(0, i) as IdKind;
  return i > 0 && ID_KINDS.includes(kind) && PATTERNS[kind].test(id) ? { kind, slug: id.slice(i + 1) } : null;
}
