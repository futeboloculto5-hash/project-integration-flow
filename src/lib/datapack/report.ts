// Relatório de importação: tudo o que o importador encontra (erros, avisos, informações) fica registrado aqui.
// Dados puros, sem dependência do jogo. Um relatório com erros significa "pacote rejeitado": nada é instalado.
import type { Issue, ValidationStats } from "./types";

export type ReportSeverity = "error" | "warning" | "info";
/** Etapa do pipeline em que o achado surgiu. */
export type ImportStage = "read" | "detect" | "convert" | "validate" | "policy" | "reconcile" | "diff";
export type ReportIssue = { severity: ReportSeverity; stage: ImportStage; code: string; path: string; message: string };

export const REPORT_LIMITS = { maxIssues: 500 } as const;

export type ImportReport = {
  /** true = pacote aceito (nenhum erro). Avisos e informações não rejeitam. */
  ok: boolean;
  /** Adaptador que reconheceu o formato (ausente se nenhum reconheceu). */
  formatId?: string;
  pack?: { packId: string; version: string; name: string; origin: string };
  /** Totais EXATOS, mesmo quando a lista `issues` foi cortada. */
  errors: number;
  warnings: number;
  infos: number;
  issues: ReportIssue[];
  /** true = havia mais achados do que cabem em `issues`. */
  truncated: boolean;
  stats?: ValidationStats;
};

export class ReportBuilder {
  private issues: ReportIssue[] = [];
  private counts = { error: 0, warning: 0, info: 0 };
  private cut = false;
  formatId: string | undefined;
  pack: ImportReport["pack"];
  stats: ValidationStats | undefined;

  add(severity: ReportSeverity, stage: ImportStage, code: string, path: string, message: string): void {
    this.counts[severity]++;
    if (this.issues.length < REPORT_LIMITS.maxIssues) this.issues.push({ severity, stage, code, path, message });
    else this.cut = true;
  }
  error(stage: ImportStage, code: string, path: string, message: string) { this.add("error", stage, code, path, message); }
  warn(stage: ImportStage, code: string, path: string, message: string) { this.add("warning", stage, code, path, message); }
  info(stage: ImportStage, code: string, path: string, message: string) { this.add("info", stage, code, path, message); }
  /** Incorpora achados vindos de outro módulo (validador, adaptador). */
  addAll(stage: ImportStage, issues: readonly Issue[]) { for (const i of issues) this.add(i.severity, stage, i.code, i.path, i.message); }
  /** Quando o módulo de origem já cortou a lista, o corte é herdado. */
  markTruncated() { this.cut = true; }
  get hasErrors(): boolean { return this.counts.error > 0; }

  build(): ImportReport {
    return {
      ok: this.counts.error === 0,
      ...(this.formatId !== undefined ? { formatId: this.formatId } : {}),
      ...(this.pack ? { pack: this.pack } : {}),
      errors: this.counts.error, warnings: this.counts.warning, infos: this.counts.info,
      issues: this.issues.slice(), truncated: this.cut,
      ...(this.stats ? { stats: this.stats } : {}),
    };
  }
}

/** Resumo em texto, curto, para mostrar ao usuário ou guardar em log. */
export function summarizeReport(r: ImportReport): string {
  const head = r.ok ? "Importação aceita" : "Importação REJEITADA";
  const pack = r.pack ? ` — ${r.pack.name} (${r.pack.packId} v${r.pack.version})` : "";
  const lines = [`${head}${pack}`, `${r.errors} erro(s), ${r.warnings} aviso(s), ${r.infos} informação(ões)${r.truncated ? " (lista cortada)" : ""}`];
  for (const i of r.issues.filter((x) => x.severity === "error").slice(0, 10)) lines.push(`  erro [${i.code}] ${i.path}: ${i.message}`);
  return lines.join("\n");
}

export const issuesOf = (r: ImportReport, severity: ReportSeverity): ReportIssue[] => r.issues.filter((i) => i.severity === severity);
export const hasCode = (r: ImportReport, code: string): boolean => r.issues.some((i) => i.code === code);
