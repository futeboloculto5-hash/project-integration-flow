// Codec do save da carreira (etapa 5): guarda os elencos dos outros clubes só como diferença para o jogador-base.
// Vale APENAS na fronteira do salvamento: dentro do jogo a carreira continua exatamente como sempre (CareerV2 completo).
//
// Formatos (campo `saveFormat`):
//   ausente  → formato clássico: tudo por inteiro. Todo save criado até hoje é assim e continua abrindo.
//   2        → `otherSquads` sai e entra `playerStore` (diferenças para a base). Resto do save idêntico.
//
// Garantias: nunca perde dado (cada jogador é conferido ida e volta; sem base ou sem exatidão, fica por inteiro),
// é idempotente (codificar de novo não muda nada) e recusa abrir, sem alterar nada, se a base de jogadores mudou desde a gravação.
//
// Etapa 7: quando a base de jogadores muda por atualização de datapack, `decodeCareer(raw, provider, { rebase: true })` reabre o save
// em vez de recusar. Regra: o que a carreira alterou (campos em `set`/`unset`) FICA; o que ela nunca tocou adota a base nova; o clube
// em que o jogador está vale o do elenco salvo (a carreira manda) e o id salvo nunca é trocado. O padrão continua recusando (`base_changed`).
// O que muda é descrito em `RebaseReport` (use `decodeCareerWithReport`).
//
// LIMITAÇÃO: um save no formato 2 aberto por uma versão do jogo SEM este codec perde as mudanças dos elencos da IA
// (a versão antiga os regeneraria pela fórmula). Saves clássicos continuam abrindo em qualquer versão.
import type { CareerV2, Player } from "./career";
import { legacyPlayers, type PlayerProvider } from "./player-provider";
import { compactVerified, expandPlayer, type PlayerEntry } from "./player-overlay";
import { toGamePlayer } from "./player-provider";

export const SAVE_FORMAT_COMPACT = 2 as const;
/** Com quais pacotes a base foi montada na hora de gravar (informativo; ajuda a explicar mudanças). Campo opcional e aditivo. */
export type BaseRef = { source: string; packs: { packId: string; version: string }[] };
export type PlayerStore = { format: 1; baseFingerprint: string; otherSquads: Record<string, PlayerEntry[]>; baseRef?: BaseRef };
export type EncodedCareer = Omit<CareerV2, "otherSquads"> & { saveFormat: typeof SAVE_FORMAT_COMPACT; playerStore: PlayerStore };
export type StoredCareer = CareerV2 | EncodedCareer;

export type CodecErrorCode = "unsupported_format" | "bad_store" | "base_changed" | "base_missing";
export class CodecError extends Error {
  constructor(readonly code: CodecErrorCode, message: string) { super(message); this.name = "CodecError"; }
}

export const isEncoded = (c: unknown): c is EncodedCareer =>
  typeof c === "object" && c !== null && (c as { saveFormat?: unknown }).saveFormat === SAVE_FORMAT_COMPACT;

// ---------- assinatura da base ----------
// Se a fórmula ou as listas de nomes mudarem, a assinatura muda e saves compactos deixam de abrir (em vez de trocar jogadores em silêncio).
const fingerprints = new WeakMap<PlayerProvider, string>();
export function baseFingerprint(provider: PlayerProvider = legacyPlayers): string {
  const cached = fingerprints.get(provider);
  if (cached) return cached;
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (const p of provider.list()) {
    const s = `${p.id}|${p.legacyId ?? ""}|${p.name}|${p.pos}|${p.age}|${p.rating}|${p.value}|${p.wage}|${p.clubId};`;
    for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); a = Math.imul(a ^ ch, 16777619) >>> 0; b = Math.imul(b + ch, 2246822519) >>> 0; b = (b ^ (b >>> 13)) >>> 0; }
  }
  const out = `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
  fingerprints.set(provider, out);
  return out;
}

// ---------- codificar ----------
/**
 * Compacta os elencos dos outros clubes. Devolve o MESMO objeto se não houver o que compactar.
 * Não altera a carreira recebida. Cada jogador só é compactado se a reconstrução for exata.
 */
export function encodeCareer(c: StoredCareer, provider: PlayerProvider = legacyPlayers, opts: { baseRef?: BaseRef } = {}): StoredCareer {
  if (isEncoded(c)) return c;
  const squads = c.otherSquads;
  if (!squads || Object.keys(squads).length === 0) return c;
  const store: Record<string, PlayerEntry[]> = {};
  let compacted = 0;
  for (const [clubId, players] of Object.entries(squads)) {
    store[clubId] = players.map((p) => { const e = compactVerified(p, provider); if (!("full" in e)) compacted++; return e; });
  }
  if (compacted === 0) return c; // nada a ganhar: continua no formato clássico
  const { otherSquads: _removed, ...rest } = c;
  return { ...rest, saveFormat: SAVE_FORMAT_COMPACT, playerStore: { format: 1, baseFingerprint: baseFingerprint(provider), otherSquads: store, ...(opts.baseRef ? { baseRef: structuredClone(opts.baseRef) } : {}) } };
}

// ---------- decodificar ----------
export type DecodeOptions = {
  /** Abre o save mesmo que a base de jogadores tenha mudado (atualização de datapack), pela regra descrita no topo do arquivo. */
  rebase?: boolean;
};

/** O que a decodificação encontrou. Serve também como simulação ("o que aconteceria?"): decodificar nunca grava nada. */
export type RebaseReport = {
  /** A base atual é diferente da que gravou o save e foi usado o "rebase". */
  rebased: boolean;
  squads: number;
  players: number;
  /** Guardados por inteiro (sem base): nada a reconstruir. */
  embedded: number;
  /** Com base, mas a base é um registro aposentado (fora das listas, só resolvendo por id). */
  onRetiredBase: number;
  /** Campos que a carreira alterou e foram mantidos (`-campo` = campo removido). */
  careerOwnedFields: Record<string, number>;
  /** Jogadores da base atual, de clubes cujo elenco o save guarda ou do clube do técnico, que não estão em nenhum elenco, mercado ou lista de transferências. Informativo: nenhum é inserido. */
  unplacedBasePlayers: number;
  /** Pacotes da base na hora de gravar, se o save registrou. */
  savedWith?: BaseRef;
};

const emptyReport = (): RebaseReport => ({ rebased: false, squads: 0, players: 0, embedded: 0, onRetiredBase: 0, careerOwnedFields: {}, unplacedBasePlayers: 0 });

/** Reconstrói a carreira completa e descreve o que encontrou. Formato clássico passa direto (mesmo objeto). Erros NÃO apagam nada: quem chama mostra a falha. */
export function decodeCareerWithReport(raw: StoredCareer, provider: PlayerProvider = legacyPlayers, opts: DecodeOptions = {}): { career: CareerV2; report: RebaseReport } {
  if (!isEncoded(raw)) {
    const f = (raw as unknown as { saveFormat?: unknown }).saveFormat;
    if (f !== undefined) throw new CodecError("unsupported_format", `Formato de save desconhecido: ${String(f)}. Atualize o jogo para abrir esta carreira.`);
    return { career: raw, report: emptyReport() };
  }
  const store = raw.playerStore as PlayerStore | undefined;
  if (!store || store.format !== 1 || typeof store.otherSquads !== "object" || store.otherSquads === null) throw new CodecError("bad_store", "Dados de jogadores do save estão incompletos.");
  const changed = store.baseFingerprint !== baseFingerprint(provider);
  if (changed && !opts.rebase) throw new CodecError("base_changed", "A base de jogadores mudou desde que esta carreira foi salva; o save foi preservado sem alterações.");
  const report = emptyReport();
  report.rebased = changed;
  if (store.baseRef) report.savedWith = store.baseRef;
  const listed = changed ? new Set(provider.list().map((p) => p.id)) : null;
  const otherSquads: Record<string, Player[]> = {};
  for (const [clubId, entries] of Object.entries(store.otherSquads)) {
    if (!Array.isArray(entries)) throw new CodecError("bad_store", `Elenco inválido: ${clubId}`);
    report.squads++;
    otherSquads[clubId] = entries.map((e) => {
      const p = expandPlayer(e, provider);
      if (!p) throw new CodecError("base_missing", `Jogador-base não encontrado: ${e.id}`);
      report.players++;
      if ("full" in e) { report.embedded++; return p; }
      for (const k of Object.keys(e.set ?? {})) report.careerOwnedFields[k] = (report.careerOwnedFields[k] ?? 0) + 1;
      for (const k of e.unset ?? []) report.careerOwnedFields[`-${k}`] = (report.careerOwnedFields[`-${k}`] ?? 0) + 1;
      if (changed) {
        // a carreira manda no id salvo e no clube em que o jogador está (a menos que ela mesma tenha mudado esse campo)
        if (!e.set || !("id" in e.set)) p.id = e.id;
        if (!e.set || !("clubId" in e.set)) p.clubId = clubId;
        const base = provider.find(e.id);
        if (base && listed && !listed.has(base.id)) report.onRetiredBase++;
      }
      return p;
    });
  }
  const { saveFormat: _f, playerStore: _s, ...rest } = raw;
  const career = { ...rest, otherSquads } as CareerV2;
  if (changed) report.unplacedBasePlayers = countUnplaced(career, provider);
  return { career, report };
}

/** Compatível com o uso antigo: devolve só a carreira. */
export function decodeCareer(raw: StoredCareer, provider: PlayerProvider = legacyPlayers, opts: DecodeOptions = {}): CareerV2 {
  return decodeCareerWithReport(raw, provider, opts).career;
}

function countUnplaced(c: CareerV2, provider: PlayerProvider): number {
  const known = new Set<string>();
  const add = (ids: Iterable<string>) => { for (const id of ids) known.add(id); };
  add(c.squad.map((p) => p.id)); add(c.market.map((p) => p.id)); add(c.transferredIn); add(c.transferredOut);
  add((c.loans ?? []).map((l) => l.playerId));
  const clubs = new Set<string>([c.clubId]);
  for (const [clubId, list] of Object.entries(c.otherSquads ?? {})) { clubs.add(clubId); add(list.map((p) => p.id)); }
  let n = 0;
  for (const b of provider.list()) if (clubs.has(b.clubId) && !known.has(toGamePlayer(b).id)) n++;
  return n;
}
