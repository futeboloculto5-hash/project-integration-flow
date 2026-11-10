// Entidades compartilhadas entre pacotes (etapa 7).
// O id estável é GLOBAL: o mesmo id em dois pacotes significa "é o mesmo jogador/clube". Isso só é aceito quando as duas
// descrições são compatíveis. Compatível = nada se contradiz E o nome é igual (ou, se o nome difere, há dado que corrobora).
// Qualquer dúvida é conflito: o pacote é rejeitado e nada é unido. Nome parecido com id diferente continua sendo só candidato
// (ver identity.ts); aqui só se trata de ids IGUAIS.
import { normalizeName } from "./identity";
import type { Club, Datapack, ExternalIds, Player } from "./types";

export type ClaimVerdict =
  | { same: true; /** Observações que merecem aviso (ex.: nomes diferentes corroborados por outros dados). */ notes: string[] }
  | { same: false; reasons: string[] };

const day = (d: string | undefined) => (d ? d.slice(0, 10) : undefined);

function externalConflicts(a: ExternalIds | undefined, b: ExternalIds | undefined): string[] {
  if (!a || !b) return [];
  const out: string[] = [];
  for (const k of Object.keys(a)) if (k in b && String(a[k]) !== String(b[k])) out.push(`id externo "${k}" diferente (${String(a[k])} × ${String(b[k])})`);
  return out;
}

export function comparePlayerClaims(a: Player, b: Player): ClaimVerdict {
  const reasons: string[] = [];
  let corroborated = false;
  const ba = day(a.birthDate), bb = day(b.birthDate);
  if (ba && bb) { if (ba === bb) corroborated = true; else reasons.push(`nascimento diferente (${ba} × ${bb})`); }
  else if (a.age !== undefined && b.age !== undefined && Math.abs(a.age - b.age) > 2) reasons.push(`idades incompatíveis (${a.age} × ${b.age})`);
  if (a.nationalityId && b.nationalityId) { if (a.nationalityId === b.nationalityId) corroborated = true; else reasons.push(`nacionalidade diferente (${a.nationalityId} × ${b.nationalityId})`); }
  reasons.push(...externalConflicts(a.externalIds, b.externalIds));
  if (a.legacyId !== undefined && b.legacyId !== undefined && a.legacyId !== b.legacyId) reasons.push(`legacyId diferente (${a.legacyId} × ${b.legacyId})`);
  const sameName = normalizeName(a.name) === normalizeName(b.name);
  if (!sameName && !corroborated) reasons.push(`nomes diferentes ("${a.name}" × "${b.name}") sem dado que confirme que é a mesma pessoa`);
  if (reasons.length > 0) return { same: false, reasons };
  return { same: true, notes: sameName ? [] : [`nome diferente ("${a.name}" × "${b.name}"), confirmado por nascimento/nacionalidade`] };
}

export function compareClubClaims(a: Club, b: Club): ClaimVerdict {
  const reasons: string[] = [];
  if (a.countryId !== b.countryId) reasons.push(`país diferente (${a.countryId} × ${b.countryId})`);
  if (a.legacyId !== undefined && b.legacyId !== undefined && a.legacyId !== b.legacyId) reasons.push(`legacyId diferente (${a.legacyId} × ${b.legacyId})`);
  reasons.push(...externalConflicts(a.externalIds, b.externalIds));
  const names = (c: Club) => new Set([c.name, ...(c.aliases ?? [])].map(normalizeName));
  const na = names(a), nb = names(b);
  const sameName = [...na].some((n) => nb.has(n));
  const corroborated = a.legacyId !== undefined && a.legacyId === b.legacyId;
  if (!sameName && !corroborated) reasons.push(`nomes diferentes ("${a.name}" × "${b.name}"); declare o outro nome em "aliases"`);
  if (reasons.length > 0) return { same: false, reasons };
  return { same: true, notes: sameName ? [] : [`nome diferente ("${a.name}" × "${b.name}"), confirmado pelo legacyId`] };
}

export type SharedScan = {
  conflicts: { path: string; message: string }[];
  notes: { path: string; message: string }[];
  sharedPlayers: number;
  sharedClubs: number;
  /** Pacotes com os quais há ids em comum. */
  withPacks: string[];
  /** Entre os compartilhados, quantos têm dados esportivos diferentes (clube, posição, força). A precedência decide qual vale. */
  sportingDifferences: number;
};

/** Compara os ids do pacote com os de pacotes JÁ instalados (de outros packIds). */
export function scanShared(pack: Datapack, others: readonly Datapack[]): SharedScan {
  const out: SharedScan = { conflicts: [], notes: [], sharedPlayers: 0, sharedClubs: 0, withPacks: [], sportingDifferences: 0 };
  if (others.length === 0) return out;
  const clubs = new Map<string, { club: Club; packId: string }>(), players = new Map<string, { player: Player; packId: string }>();
  for (const o of others) {
    const pid = o.manifest.packId;
    for (const c of o.clubs) if (!clubs.has(c.id)) clubs.set(c.id, { club: c, packId: pid });
    for (const p of o.players) if (!players.has(p.id)) players.set(p.id, { player: p, packId: pid });
  }
  const packs = new Set<string>();
  for (const c of pack.clubs) {
    const o = clubs.get(c.id);
    if (!o) continue;
    const v = compareClubClaims(c, o.club);
    if (!v.same) { out.conflicts.push({ path: c.id, message: `Clube ${c.id} também existe no pacote "${o.packId}", mas não parece ser o mesmo: ${v.reasons.join("; ")}.` }); continue; }
    out.sharedClubs++; packs.add(o.packId);
    for (const n of v.notes) out.notes.push({ path: c.id, message: `Clube ${c.id} (pacote "${o.packId}"): ${n}.` });
  }
  for (const p of pack.players) {
    const o = players.get(p.id);
    if (!o) continue;
    const v = comparePlayerClaims(p, o.player);
    if (!v.same) { out.conflicts.push({ path: p.id, message: `Jogador ${p.id} também existe no pacote "${o.packId}", mas não parece ser o mesmo: ${v.reasons.join("; ")}.` }); continue; }
    out.sharedPlayers++; packs.add(o.packId);
    for (const n of v.notes) out.notes.push({ path: p.id, message: `Jogador ${p.id} (pacote "${o.packId}"): ${n}.` });
    if (p.clubId !== o.player.clubId || p.position !== o.player.position || p.overall !== o.player.overall) out.sportingDifferences++;
  }
  out.withPacks = [...packs].sort();
  return out;
}
