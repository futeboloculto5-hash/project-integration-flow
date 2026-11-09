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
// LIMITAÇÃO: um save no formato 2 aberto por uma versão do jogo SEM este codec perde as mudanças dos elencos da IA
// (a versão antiga os regeneraria pela fórmula). Saves clássicos continuam abrindo em qualquer versão.
import type { CareerV2, Player } from "./career";
import { legacyPlayers, type PlayerProvider } from "./player-provider";
import { compactVerified, expandPlayer, type PlayerEntry } from "./player-overlay";

export const SAVE_FORMAT_COMPACT = 2 as const;
export type PlayerStore = { format: 1; baseFingerprint: string; otherSquads: Record<string, PlayerEntry[]> };
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
export function encodeCareer(c: StoredCareer, provider: PlayerProvider = legacyPlayers): StoredCareer {
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
  return { ...rest, saveFormat: SAVE_FORMAT_COMPACT, playerStore: { format: 1, baseFingerprint: baseFingerprint(provider), otherSquads: store } };
}

// ---------- decodificar ----------
/** Reconstrói a carreira completa. Formato clássico passa direto (mesmo objeto). Erros NÃO apagam nada: quem chama mostra a falha. */
export function decodeCareer(raw: StoredCareer, provider: PlayerProvider = legacyPlayers): CareerV2 {
  if (!isEncoded(raw)) {
    const f = (raw as unknown as { saveFormat?: unknown }).saveFormat;
    if (f !== undefined) throw new CodecError("unsupported_format", `Formato de save desconhecido: ${String(f)}. Atualize o jogo para abrir esta carreira.`);
    return raw;
  }
  const store = raw.playerStore as PlayerStore | undefined;
  if (!store || store.format !== 1 || typeof store.otherSquads !== "object" || store.otherSquads === null) throw new CodecError("bad_store", "Dados de jogadores do save estão incompletos.");
  if (store.baseFingerprint !== baseFingerprint(provider)) throw new CodecError("base_changed", "A base de jogadores mudou desde que esta carreira foi salva; o save foi preservado sem alterações.");
  const otherSquads: Record<string, Player[]> = {};
  for (const [clubId, entries] of Object.entries(store.otherSquads)) {
    if (!Array.isArray(entries)) throw new CodecError("bad_store", `Elenco inválido: ${clubId}`);
    otherSquads[clubId] = entries.map((e) => {
      const p = expandPlayer(e, provider);
      if (!p) throw new CodecError("base_missing", `Jogador-base não encontrado: ${e.id}`);
      return p;
    });
  }
  const { saveFormat: _f, playerStore: _s, ...rest } = raw;
  return { ...rest, otherSquads } as CareerV2;
}
