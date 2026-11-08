import type { Position } from "./types";

/** Posições do jogo atual (`Pos` em career.ts). Copiadas aqui como valores para este módulo não depender do jogo. */
export type LegacyPos = "GOL" | "DEF" | "MEI" | "ATA";

const TO_LEGACY: Record<Position, LegacyPos> = {
  GK: "GOL",
  CB: "DEF", LB: "DEF", RB: "DEF",
  DM: "MEI", CM: "MEI", AM: "MEI", LM: "MEI", RM: "MEI",
  LW: "ATA", RW: "ATA", CF: "ATA", ST: "ATA",
};
/** Ponte para o jogo atual, que só conhece 4 posições. */
export const positionToLegacy = (p: Position): LegacyPos => TO_LEGACY[p];
