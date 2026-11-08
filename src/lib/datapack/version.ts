// Versão semântica (maior.menor.correção) do CONTEÚDO de um datapack.
export type Semver = { major: number; minor: number; patch: number };
const RE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;

export function parseSemver(v: unknown): Semver | null {
  const m = typeof v === "string" ? RE.exec(v) : null;
  return m ? { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) } : null;
}
/** Negativo se a < b, 0 se iguais, positivo se a > b. Versões inválidas devolvem null. */
export function compareSemver(a: string, b: string): number | null {
  const x = parseSemver(a), y = parseSemver(b);
  return x && y ? x.major - y.major || x.minor - y.minor || x.patch - y.patch : null;
}
/** Uma atualização só vale se a versão nova for maior que a instalada. */
export const isUpgrade = (installed: string, candidate: string) => (compareSemver(candidate, installed) ?? 0) > 0;
