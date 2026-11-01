import { useMemo, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type CareerV2, type Fixture } from '@/lib/game/career';
import { applySeasonReference, careerClub, divisionOf, leaders, seasonTable, type SeasonReference } from '@/lib/game/seasons';
import { Crest } from './onboarding';

export function SeasonTab({ career, update, calendar = false }: { career: CareerV2; update: (c: CareerV2) => void; calendar?: boolean }) {
  const [view, setView] = useState(calendar ? 'jogos' : 'tabela');
  const [division, setDivision] = useState(divisionOf(career));
  const [round, setRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [archive, setArchive] = useState('atual');
  const state = career.seasonState;
  const past = state?.history.find(h => h.year === archive);
  const fixtures = past?.fixtures ?? career.fixtures;
  const cup = past?.cup ?? state?.cup ?? [];
  const league = fixtures.filter(f => (f.division ?? 'A') === division);
  const table = past?.tables[division] ?? seasonTable(career, division);
  const stats = useMemo(() => leaders([...league, ...cup]), [fixtures, cup, division]);
  const maxRound = Math.max(1, ...league.map(f => f.round));
  const games = calendar ? [...fixtures, ...cup].filter(f => f.home === career.clubId || f.away === career.clubId).sort((a,b) => a.date.localeCompare(b.date)) : league.filter(f => f.round === round);
  const reference = state?.reference;
  const fetchReference = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/football/season?season=${career.season}`, { signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? 'Dados indisponíveis.');
      update(applySeasonReference(career, data as SeasonReference));
      toast(data.unavailable?.length ? 'Referência parcial: alguns dados não estão cobertos pelo plano.' : 'Referência oficial carregada. Resultados da carreira preservados.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Consulta indisponível; simulação preservada.'); }
    finally { setLoading(false); }
  };
  return <div className="g-stack">
    <section>
      <h3 className="g-h"><Trophy /> TEMPORADA {past?.year ?? career.season}</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select aria-label="Temporada" className="bg-background text-foreground border border-border rounded px-3 py-2" value={archive} onChange={e => setArchive(e.target.value)}>
          <option value="atual">{career.season} · Atual</option>
          {state?.history.map(h => <option key={h.year} value={h.year}>{h.year} · Histórico</option>)}
        </select>
        <select aria-label="Divisão" className="bg-background text-foreground border border-border rounded px-3 py-2" value={division} onChange={e => { setDivision(e.target.value); setRound(1); }}>
          <option value="A">Série A</option><option value="B">Série B · simulação</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {[["tabela", "Tabela"], ["jogos", "Jogos"], ["gols", "Artilharia"], ["assist", "Assistências"], ["copa", "Copa"], ["real", "API-Football"]].map(([key, label]) => <Button key={key} size="sm" variant={view === key ? 'default' : 'outline'} onClick={() => setView(key ?? 'tabela')}>{label}</Button>)}
      </div>
      <p className="g-mini">Carreira simulada · {past ? 'Temporada arquivada' : `${league.filter(f => f.hg != null).length}/${league.length} partidas da liga`} · Copa da carreira simulada</p>
      {(view === 'tabela') && <>
        <div className="g-table">
          <div className="g-tr g-th"><span>#</span><span>Clube</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>P</span></div>
          {table.map((row, i) => <div key={row.clubId} className={`g-tr ${i >= table.length - 4 && division === 'A' ? 'g-z-reb' : i < 4 && division === 'B' ? 'g-z-lib' : ''} ${row.clubId === career.clubId ? 'g-tr-me' : ''}`}>
            <span>{i + 1}</span><span className="g-club-cell"><Crest club={careerClub(career, row.clubId)} size={22} /><b>{careerClub(career, row.clubId).name}</b></span><span>{row.p}</span><span>{row.w}</span><span>{row.d}</span><span>{row.l}</span><span>{row.gf - row.ga}</span><span className="g-pts">{row.pts}</span>
          </div>)}
        </div>
        <p className="g-mini">{division === 'A' ? 'Últimos 4: rebaixamento para a Série B na próxima temporada.' : 'Primeiros 4: acesso à Série A na próxima temporada. Clubes da divisão inicial são fictícios.'}</p>
      </>}
      {view === 'jogos' && <>
        {!calendar && <div className="g-round-nav"><Button variant="outline" size="icon" aria-label="Rodada anterior" disabled={round <= 1} onClick={() => setRound(round - 1)}>‹</Button><b>RODADA {round}/{maxRound}</b><Button variant="outline" size="icon" aria-label="Próxima rodada" disabled={round >= maxRound} onClick={() => setRound(round + 1)}>›</Button></div>}
        <FixtureList career={career} fixtures={games} />
      </>}
      {(view === 'gols' || view === 'assist') && <>
        <ul className="g-news">{[...stats].sort((a,b) => view === 'assist' ? b.assists - a.assists : b.goals - a.goals).filter(p => view === 'assist' ? p.assists > 0 : p.goals > 0).slice(0, 30).map((p,i) => <li key={p.playerId}><b>{i + 1}. {p.player} · {view === 'assist' ? p.assists : p.goals}</b><p>{careerClub(career,p.clubId).name} · {p.goals} gols · {p.assists} assistências</p></li>)}</ul>
        {!stats.length && <p className="g-mini">Nenhum lance registrado nesta temporada.</p>}
        <p className="g-mini">Estatísticas simuladas da liga selecionada e da copa. Partidas antigas sem lances salvos não são reconstruídas.</p>
      </>}
      {view === 'copa' && <>{[1,2,3,4].map(r => <div key={r}><h3 className="g-h">{['Oitavas', 'Quartas', 'Semifinal', 'Final'][r-1]}</h3><FixtureList career={career} fixtures={cup.filter(f => f.round === r)} />{!cup.some(f => f.round === r) && <p className="g-mini">Aguardando classificados.</p>}</div>)}</>}
      {view === 'real' && <>
        <Button variant="outline" disabled={loading} onClick={fetchReference}><RefreshCw size={16} />{loading ? 'Consultando…' : 'Consultar temporada oficial'}</Button>
        <p className="g-mini">Referência oficial separada da carreira · Brasileirão Série A · {career.season}</p>
        {reference ? <>
          <p className="g-mini">API-Football · {reference.verifiedAt?.slice(0,10)} · {reference.fixtures.length} partidas{reference.unavailable.length ? ' · cobertura parcial' : ''}</p>
          <h3 className="g-h">Classificação oficial</h3>
          <ul className="g-news">{reference.standings.map(row => <li key={row.rank}><b>{row.rank}. {row.team.name} · {row.points} pts</b><p>{row.all.played} jogos · API-Football</p></li>)}</ul>
          {!reference.standings.length && <p className="g-mini">Classificação não disponibilizada nesta consulta.</p>}
          <h3 className="g-h">Resultados oficiais</h3>
          <ul className="g-news">{reference.fixtures.filter(f => f.hg != null && f.ag != null).slice(-20).map(f => <li key={f.id}><b>{state?.clubs.find(c => c.apiId === f.home)?.name ?? `Clube API ${f.home}`} {f.hg} × {f.ag} {state?.clubs.find(c => c.apiId === f.away)?.name ?? `Clube API ${f.away}`}</b><p>{f.date} · {f.round}</p></li>)}</ul>
          <h3 className="g-h">Artilharia oficial</h3><ul className="g-news">{reference.scorers.slice(0,10).map(p => <li key={`${p.name}:${p.club}`}><b>{p.name} · {p.goals ?? '—'} gols</b><p>{p.club}</p></li>)}</ul>
          <h3 className="g-h">Assistências oficiais</h3><ul className="g-news">{reference.assists.slice(0,10).map(p => <li key={`${p.name}:${p.club}`}><b>{p.name} · {p.assists ?? '—'} assistências</b><p>{p.club}</p></li>)}</ul>
          {!reference.scorers.length && <p className="g-mini">Artilharia não disponibilizada nesta consulta.</p>}{!reference.assists.length && <p className="g-mini">Assistências não disponibilizadas nesta consulta.</p>}
        </> : <p className="g-mini">Sem referência oficial carregada. Temporadas futuras e cobertura ausente permanecem simuladas.</p>}
      </>}
      {past && <p className="g-mini">Rebaixados: {past.relegated.map(id => careerClub(career,id).name).join(', ')} · Promovidos: {past.promoted.map(id => careerClub(career,id).name).join(', ')}</p>}
    </section>
  </div>;
}
function FixtureList({ career, fixtures }: { career: CareerV2; fixtures: Fixture[] }) {
  return <ul className="g-news">{fixtures.map(f => <li key={`${f.competition}:${f.round}:${f.home}:${f.away}`}>
    <b>{careerClub(career,f.home).short} {f.hg == null ? '×' : `${f.hg} - ${f.ag}`} {careerClub(career,f.away).short}</b>
    <p>{f.date} · {f.competition === 'cup' ? 'Copa' : `R${f.round}`} · Calendário {f.scheduleSource === 'API-Football' ? 'API-Football' : 'simulado'}{f.hg != null ? ' · Resultado simulado' : ''}</p>
    {f.penalties && <p>Pênaltis: {f.penalties[0]} - {f.penalties[1]} · {f.winner ? careerClub(career,f.winner).name : ''}</p>}
    {!!f.goals?.length && <p>{f.goals.map(g => `${g.minute}' ${g.player}${g.assist ? ` (${g.assist})` : ''}`).join(' · ')}</p>}
  </li>)}</ul>;
}