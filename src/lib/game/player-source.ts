// Fonte ativa dos jogadores-base do jogo (etapa 7).
// Por padrão é `legacyPlayers` (os jogadores que o jogo sempre teve): enquanto ninguém chamar `usePlayerProvider`, nada muda.
// Ativar um provedor do mundo importado é gradual: ele só manda nos clubes que cobre (os demais seguem com os jogadores atuais,
// ver `createWorldPlayerProvider`). Nada na interface ou no salvamento ativa isto ainda; só testes e, no futuro, uma ação explícita.
// IMPORTANTE: quem grava ou abre saves compactados usa o provedor ativo; trocar o provedor muda a assinatura da base
// (um save gravado com outra base só abre com `rebase`, ver career-codec.ts).
import { legacyPlayers, type PlayerProvider } from "./player-provider";

let active: PlayerProvider | null = null;

/** Provedor em uso agora. Devolve o provedor REAL (não um intermediário) para que a assinatura da base possa ser guardada por provedor. */
export const activePlayers = (): PlayerProvider => active ?? legacyPlayers;
export const hasActiveWorld = (): boolean => active !== null;

/** Ativa um provedor (ex.: o do mundo importado). */
export function usePlayerProvider(provider: PlayerProvider): void { active = provider; }
/** Volta aos jogadores atuais do jogo. */
export function resetPlayerProvider(): void { active = null; }
