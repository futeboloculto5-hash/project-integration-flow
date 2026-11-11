import { Database, Package, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import type { AdminSnapshot, ImportSummary, PackSummary, UpdateInfo } from "@/lib/datapack/admin-model";
import type { ReportIssue } from "@/lib/datapack/report";

// Administração de datapacks (etapa 7, fase 4). Componentes PUROS: recebem dados prontos (ver `lib/datapack/admin-model.ts`) e
// avisam por callbacks. Não leem arquivos, banco nem a carreira, e usam só as classes `g-*` que o jogo já tem (identidade azul).
// Ainda NÃO estão ligados a nenhuma tela; ver "Como conectar" em src/lib/datapack/README.md.

const n = (v: number) => v.toLocaleString("pt-BR");
const KIND: Record<string, string> = { league: "Liga", cup: "Copa", group_knockout: "Grupos + mata-mata", knockout: "Mata-mata" };

/** Quantidade de linhas que cada lista mostra por vez (listas enormes ficam resumidas). */
export const LIST_LIMIT = 50;

export function IssueList({ title, items, total, tone }: { title: string; items: ReportIssue[]; total: number; tone: "error" | "warning" | "info" }) {
  if (total === 0) return null;
  return (
    <div className={tone === "error" ? "g-warn" : undefined} data-tone={tone}>
      <div>
        <b>{title} ({n(total)})</b>
        <ul className="g-src-list">
          {items.slice(0, LIST_LIMIT).map((i, k) => (
            <li key={`${i.code}-${i.path}-${k}`}><b>{i.code}</b><span>{i.path ? `${i.path} — ` : ""}{i.message}</span></li>
          ))}
        </ul>
        {total > Math.min(items.length, LIST_LIMIT) && <small className="g-mini">… e mais {n(total - Math.min(items.length, LIST_LIMIT))} não mostrados.</small>}
      </div>
    </div>
  );
}

/** Resultado de uma importação: aceito/rejeitado, erros, avisos e o que mudou nos jogadores. */
export function ImportReportView({ summary }: { summary: ImportSummary }) {
  const c = summary.changes;
  return (
    <section className="g-card" data-testid="import-report">
      <h3 className="g-h"><Package /> IMPORTAÇÃO · {summary.statusLabel.toUpperCase()}</h3>
      {summary.pack && <p className="g-mini"><b>{summary.pack.name}</b> · v{summary.pack.version} · {summary.pack.originLabel}{summary.pack.seasons.length > 0 ? ` · temporada ${summary.pack.seasons.join(", ")}` : ""}</p>}
      <div className="g-facts">
        <div><span>Erros</span><b>{n(summary.counts.errors)}</b></div>
        <div><span>Avisos</span><b>{n(summary.counts.warnings)}</b></div>
      </div>
      {!summary.ok && <p className="g-mini">O pacote foi rejeitado por inteiro: nada foi instalado e nenhuma carreira foi tocada.</p>}
      <IssueList title="ERROS" items={summary.errors} total={summary.counts.errors} tone="error" />
      <IssueList title="AVISOS" items={summary.warnings} total={summary.counts.warnings} tone="warning" />
      {summary.possibleDuplicates > 0 && <p className="g-mini">{n(summary.possibleDuplicates)} possível(is) jogador(es) duplicado(s) para revisão. Nenhum foi unido automaticamente.</p>}
      {c && (
        <>
          <h3 className="g-h">O QUE MUDOU{c.fromVersion ? ` · v${c.fromVersion} → v${c.toVersion}` : ` · v${c.toVersion}`}</h3>
          <div className="g-facts">
            <div><span>Adicionados</span><b>{n(c.totals.added)}</b></div>
            <div><span>Alterados</span><b>{n(c.totals.changed)}</b></div>
            <div><span>Mudaram de clube</span><b>{n(c.totals.moved)}</b></div>
            <div><span>Saíram do pacote</span><b>{n(c.totals.disappeared)}</b></div>
          </div>
          <ChangeList title="ADICIONADOS" rows={c.added} total={c.totals.added} />
          <ChangeList title="ALTERADOS" rows={c.changed} total={c.totals.changed - c.totals.moved} />
          <ChangeList title="MUDARAM DE CLUBE" rows={c.moved} total={c.totals.moved} />
          <ChangeList title="SAÍRAM DO PACOTE" rows={c.disappeared} total={c.totals.disappeared} />
          {c.totals.disappeared > 0 && <p className="g-mini">Quem saiu do pacote continua guardado: nenhuma carreira perde jogadores por causa de uma atualização.</p>}
        </>
      )}
    </section>
  );
}

function ChangeList({ title, rows, total }: { title: string; rows: { id: string; name: string; what: string }[]; total: number }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="g-mini"><b>{title}</b></p>
      <ul className="g-src-list">
        {rows.slice(0, LIST_LIMIT).map((r) => <li key={r.id}><b>{r.name}</b><span>{r.what}</span></li>)}
      </ul>
      {total > Math.min(rows.length, LIST_LIMIT) && <small className="g-mini">… e mais {n(total - Math.min(rows.length, LIST_LIMIT))}.</small>}
    </>
  );
}

/** Detalhe de um pacote: versão, país, temporada, quantidades, competições, origem e licença. */
export function PackDetailView({ pack }: { pack: PackSummary }) {
  return (
    <section className="g-card" data-testid="pack-detail">
      <h3 className="g-h"><Database /> {pack.name.toUpperCase()} <em className={`g-src ${pack.isTest ? "g-src-simulado" : "g-src-oficial"}`}>{pack.originLabel}</em></h3>
      {pack.isTest && <p className="g-warn"><TriangleAlert />Pacote de TESTE: dados sintéticos que não devem entrar num jogo real.</p>}
      <div className="g-facts">
        <div><span>Versão</span><b>{pack.version}</b></div>
        <div><span>Temporada</span><b>{pack.seasons.length > 0 ? pack.seasons.join(", ") : "—"}</b></div>
        <div><span>Clubes</span><b>{n(pack.counts.clubs)}</b></div>
        <div><span>Jogadores</span><b>{n(pack.counts.players)}</b></div>
        <div><span>Agentes livres</span><b>{n(pack.counts.freeAgents)}</b></div>
        <div><span>Guardados (saíram do pacote)</span><b>{n(pack.counts.retired)}</b></div>
      </div>
      <p className="g-mini"><b>Países:</b> {pack.countries.length > 0 ? pack.countries.map((c) => c.name).join(", ") : "—"}{pack.confederations.length > 0 ? ` (${pack.confederations.join(", ")})` : ""}</p>
      <h3 className="g-h">COMPETIÇÕES ({n(pack.competitions.length)})</h3>
      {pack.competitions.length === 0 ? <p className="g-mini">Este pacote não traz competições.</p> : (
        <ul className="g-src-list">
          {pack.competitions.slice(0, LIST_LIMIT).map((c) => (
            <li key={c.id}><b>{c.name}</b><span>{[KIND[c.kind] ?? c.kind, c.country, c.tier ? `divisão ${c.tier}` : null, c.seasons.length ? `temporada ${c.seasons.join(", ")}` : null, `${n(c.clubs)} clubes`].filter(Boolean).join(" · ")}</span></li>
          ))}
        </ul>
      )}
      <h3 className="g-h">ORIGEM E LICENÇA</h3>
      <ul className="g-src-list">
        <li><b>Fonte</b><span>{pack.source.name ?? "não declarada"}</span></li>
        <li><b>Licença / autorização</b><span>{pack.source.license ?? "não declarada"}</span></li>
        {pack.source.url && <li><b>Endereço</b><a href={pack.source.url} target="_blank" rel="noreferrer">{pack.source.url}</a></li>}
        {pack.source.retrievedAt && <li><b>Obtido em</b><span>{pack.source.retrievedAt}</span></li>}
        <li><b>Criado em</b><span>{pack.createdAt}</span></li>
        <li><b>Versões instaladas</b><span>{pack.history.join(" → ")}</span></li>
      </ul>
      {pack.notes && <p className="g-mini">{pack.notes}</p>}
    </section>
  );
}

/** Lista de atualizações disponíveis (o catálogo vem de quem usa o componente). */
export function UpdatesView({ updates }: { updates: UpdateInfo[] }) {
  return (
    <section className="g-card" data-testid="updates">
      <h3 className="g-h"><RefreshCw /> ATUALIZAÇÕES</h3>
      {updates.length === 0 ? <p className="g-mini">Nenhuma verificação feita ainda ou nenhum pacote instalado consta do catálogo.</p> : (
        <ul className="g-src-list">
          {updates.map((u) => (
            <li key={u.packId}>
              <b>{u.name}</b>
              <span>{u.state === "update" ? `Atualização disponível: v${u.installed} → v${u.available}` : u.state === "current" ? `Em dia (v${u.installed})` : `O catálogo tem uma versão mais antiga (v${u.available}) que a instalada (v${u.installed})`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type DatapackAdminProps = {
  snapshot: AdminSnapshot;
  selectedId: string | null;
  lastImport: ImportSummary | null;
  updates: UpdateInfo[];
  busy: boolean;
  onSelect: (packId: string) => void;
  /** Arquivos escolhidos pela pessoa; quem usa o componente lê, importa e atualiza `snapshot` e `lastImport`. */
  onPickFiles: (files: FileList) => void;
  onCheckUpdates: () => void;
};

/** Tela completa: totais, pacotes instalados, importar, verificar atualizações, detalhe e último relatório. */
export function DatapackAdminView({ snapshot, selectedId, lastImport, updates, busy, onSelect, onPickFiles, onCheckUpdates }: DatapackAdminProps) {
  const selected = snapshot.packs.find((p) => p.packId === selectedId) ?? null;
  const t = snapshot.totals;
  return (
    <>
      <section className="g-card" data-testid="admin-home">
        <h3 className="g-h"><Database /> DADOS DO JOGO · DATAPACKS</h3>
        <div className="g-facts">
          <div><span>Pacotes</span><b>{n(t.packs)}</b></div>
          <div><span>Clubes no mundo</span><b>{n(t.clubs)}</b></div>
          <div><span>Jogadores no mundo</span><b>{n(t.players)}</b></div>
          <div><span>Guardados</span><b>{n(t.retired)}</b></div>
        </div>
        {(t.sharedPlayers > 0 || t.sharedClubs > 0) && <p className="g-mini">{n(t.sharedClubs)} clube(s) e {n(t.sharedPlayers)} jogador(es) aparecem em mais de um pacote e contam uma vez só.</p>}
        {snapshot.hasTestPacks && <p className="g-warn"><TriangleAlert />Há pacote(s) de TESTE instalado(s). Eles não entram num jogo real.</p>}
        <div className="g-row">
          <label className="g-btn g-btn-sm">
            <Upload /> {busy ? "IMPORTANDO…" : "IMPORTAR PACOTE"}
            <input type="file" multiple hidden disabled={busy} aria-label="Importar pacote" onChange={(e) => { if (e.target.files && e.target.files.length > 0) onPickFiles(e.target.files); }} />
          </label>
          <button className="g-btn g-btn-sm g-btn-ghost" disabled={busy || t.packs === 0} onClick={onCheckUpdates}>VERIFICAR ATUALIZAÇÕES</button>
        </div>
        <p className="g-mini">Importar não altera as carreiras salvas. Um pacote com erros é rejeitado por inteiro.</p>
      </section>
      <section className="g-card" data-testid="pack-list">
        <h3 className="g-h"><Package /> PACOTES INSTALADOS</h3>
        {snapshot.packs.length === 0 ? <p className="g-mini">Nenhum datapack instalado. O jogo usa os jogadores atuais.</p> : (
          <ul className="g-offers">
            {snapshot.packs.map((p) => (
              <li key={p.packId}>
                <span className="g-logo-co"><Database /></span>
                <div><b>{p.name}</b><small>v{p.version} · {p.seasons.join(", ") || "sem temporada"} · {n(p.counts.clubs)} clubes · {n(p.counts.players)} jogadores · {p.originLabel}</small></div>
                <div className="g-offer-act"><button className="g-btn g-btn-sm" aria-pressed={p.packId === selectedId} onClick={() => onSelect(p.packId)}>{p.packId === selectedId ? "ABERTO" : "VER"}</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && <PackDetailView pack={selected} />}
      {updates.length > 0 && <UpdatesView updates={updates} />}
      {lastImport && <ImportReportView summary={lastImport} />}
    </>
  );
}
