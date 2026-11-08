import { useRef, useState } from 'react';
import { ArrowLeftRight, Search, X, Send, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { legacyClubs } from '@/lib/game/club-provider';
import { money, type CareerV2, type Player, type Pos } from '@/lib/game/career';
import { acceptNegotiation, importWorldSquad, marketClubName, proposeDeal, renewContract, transferPlayer, type DealTerms, type WorldClub } from '@/lib/game/transfers';

const statusName = { pending: 'Aguardando o clube', counter: 'Contraproposta', accepted: 'Clube aceitou', rejected: 'Recusada / vencida', completed: 'Concluída' };
export function WorldMarket({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const [view, setView] = useState<'players' | 'deals' | 'contracts' | 'history'>('players');
  const [search, setSearch] = useState('');
  const [clubs, setClubs] = useState<Omit<WorldClub, 'id' | 'fetchedAt'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [pos, setPos] = useState<Pos | 'all'>('all');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Player | null>(null);
  const [terms, setTerms] = useState<DealTerms>({ kind: 'buy', fee: 0, wage: 0, months: 24 });
  const [buyer, setBuyer] = useState('');
  const current = useRef(career); current.current = career;
  const choose = (p: Player) => { setSelected(p); setTerms({ kind: 'buy', fee: Math.round(p.value * (p.clubId === career.clubId ? 0.8 : 1.1)), wage: p.wage, months: 24 }); setBuyer(legacyClubs.list().find(x => x.id !== career.clubId)?.id ?? ''); };
  const act = (result: { career: CareerV2; error?: string }, message: string) => {
    if (result.error) { toast.error(result.error); return; }
    update(result.career); toast.success(message); setSelected(null);
  };
  const findClubs = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setClubs([]);
    try {
      const res = await fetch(`/api/football/market?search=${encodeURIComponent(search.trim())}`, { signal: AbortSignal.timeout(20000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Consulta indisponível.');
      setClubs(data.clubs ?? []);
      if (!data.clubs?.length) setError('Nenhum clube disponível nesta busca.');
      else if (data.stale) setError('Dados anteriores preservados; atualização indisponível.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na consulta.'); }
    finally { setBusy(false); }
  };
  const loadSquad = async (club: Omit<WorldClub, 'id' | 'fetchedAt'>) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/football/squad?teamId=${club.apiId}`, { signal: AbortSignal.timeout(20000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Elenco indisponível.');
      if (!data.players?.length || !data.team) throw new Error('A API não disponibiliza elenco para este clube. Nenhum jogador foi inventado.');
      const next = importWorldSquad(current.current, { ...club, name: data.team, fetchedAt: data.verifiedAt }, data.players);
      update(next);
      const id = legacyClubs.list().find(x => x.apiId === club.apiId)?.id ?? `world-${club.apiId}`;
      setClubFilter(id); setClubs([]);
      if (id === current.current.clubId) setError('Seu elenco atual foi preservado. Veja os contratos do seu clube.');
      else if (data.stale) setError('Elenco em cache: atualização indisponível no momento.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na consulta.'); }
    finally { setBusy(false); }
  };
  const allClubs = [...legacyClubs.list().map(x => ({ id: x.id, name: x.name })), ...(career.worldClubs ?? []).filter(x => !legacyClubs.list().some(y => y.id === x.id))];
  const players = career.market.filter(p => (clubFilter === 'all' || p.clubId === clubFilter) && (pos === 'all' || p.pos === pos) && p.name.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  const owned = selected?.clubId === career.clubId;
  const pending = career.negotiations?.filter(x => ['pending', 'counter', 'accepted'].includes(x.status)).length ?? 0;
  return <div className="g-stack">
    <header><h2 className="g-title">MERCADO MUNDIAL</h2><p className="g-mini">Dados: API-Football · Valores, força, salários, vínculos e negócios: simulação em R$.</p></header>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Mercado mundial">
      {([['players', 'Jogadores'], ['deals', `Propostas${pending ? ` (${pending})` : ''}`], ['contracts', 'Contratos'], ['history', 'Histórico']] as const).map(([v, label]) => <Button key={v} role="tab" aria-selected={view === v} variant={view === v ? 'default' : 'outline'} onClick={() => setView(v)}>{label}</Button>)}
    </div>
    {view === 'players' && <>
      <form onSubmit={findClubs} className="grid gap-2">
        <label htmlFor="world-club" className="text-sm font-bold">Buscar clube na API</label>
        <div className="flex gap-2"><Input id="world-club" value={search} onChange={e => setSearch(e.target.value)} minLength={3} maxLength={60} placeholder="Ex.: Barcelona, Arsenal, Santos" required /><Button size="icon" type="submit" disabled={busy} title="Buscar clube" aria-label="Buscar clube">{busy ? <RefreshCw className="animate-spin" /> : <Search />}</Button></div>
        <p className="g-mini">Elenco consultado na data da fonte, não necessariamente da temporada da carreira. Cache de 7 dias · teto preventivo compartilhado de 90 consultas/dia. Sem cobertura, nenhum elenco real é criado.</p>
        {error && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
      </form>
      {clubs.length > 0 && <ul className="grid gap-2">{clubs.map(club => <li key={club.apiId}><Button className="h-auto w-full justify-between whitespace-normal py-3 text-left" variant="outline" disabled={busy} onClick={() => void loadSquad(club)}><span>{club.name}<small className="block text-muted-foreground">{club.country ?? 'País não informado'}</small></span><ArrowLeftRight className="shrink-0" /></Button></li>)}</ul>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Clube<select aria-label="Filtrar clube" className="rounded-md border border-input bg-background p-2 text-foreground" value={clubFilter} onChange={e => setClubFilter(e.target.value)}><option value="all">Todos os clubes</option><option value="livre">Sem clube (simulação)</option>{allClubs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Nome<Input aria-label="Filtrar jogador" placeholder="Nome do jogador" value={name} onChange={e => setName(e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">{(['all', 'GOL', 'DEF', 'MEI', 'ATA'] as const).map(x => <Button size="sm" variant={pos === x ? 'default' : 'outline'} key={x} onClick={() => setPos(x)}>{x === 'all' ? 'Todos' : x}</Button>)}</div>
      <p className="g-mini">{players.length} jogadores · Caixa {money(career.balance)}</p>
      <ul className="grid gap-2">{players.map(p => <li key={p.id}><Button variant="outline" className="h-auto w-full justify-between gap-2 whitespace-normal py-3 text-left" onClick={() => choose(p)}><span className={`g-pos-tag g-pos-${p.pos}`}>{p.pos}</span><span className="min-w-0 flex-1 break-words">{p.name}<small className="block text-muted-foreground">{marketClubName(career, p.clubId)} · {p.real ? 'Identidade API' : 'Fictício'} · {p.ageUnknown ? 'Idade não informada' : `${p.age} anos`}</small></span><span className="shrink-0 text-right">{money(p.value)}<small className="block text-muted-foreground">simulado</small></span></Button></li>)}</ul>
      {!players.length && <p className="g-mini">Nenhum jogador nesta seleção. Busque um clube para consultar seu elenco.</p>}
      {!!career.worldClubs?.length && <p className="g-mini">Consultas: {career.worldClubs.map(x => `${x.name} (${x.fetchedAt?.slice(0, 10) ?? 'data indisponível'})`).join(' · ')}</p>}
    </>}
    {view === 'deals' && <>
      <h3 className="g-h">PROPOSTAS RECEBIDAS</h3>
      {!career.offers.length && <p className="g-mini">Nenhuma proposta recebida.</p>}
      {career.offers.map(o => { const p = career.squad.find(x => x.id === o.playerId); return p && <article key={o.id} className="border-b border-border py-3"><b>{p.name}</b><p className="g-mini">{marketClubName(career, o.fromClub)} · {money(o.fee)} · Até {o.expires}</p><div className="flex gap-2"><Button size="sm" disabled={o.expires < career.date} onClick={() => act(transferPlayer(career, p.id, career.clubId, o.fromClub, { kind: 'buy', fee: o.fee, wage: p.wage, months: 24 }), 'Venda concluída')}>Aceitar</Button><Button size="sm" variant="outline" onClick={() => update({ ...career, offers: career.offers.filter(x => x.id !== o.id) })}>Recusar</Button></div></article>; })}
      <h3 className="g-h">NEGOCIAÇÕES ENVIADAS</h3>
      {!career.negotiations?.length && <p className="g-mini">Nenhuma negociação enviada.</p>}
      {career.negotiations?.map(d => <article key={d.id} className="border-b border-border py-3"><b>{career.market.find(x => x.id === d.playerId)?.name ?? career.transferHistory?.find(x => x.playerId === d.playerId)?.player ?? d.playerId}</b><p className="g-mini">{statusName[d.status]} · {d.kind === 'loan' ? 'Empréstimo' : 'Compra'} · {money(d.fee)} · {money(d.wage)}/mês · {d.months} meses · Até {d.expires}</p>{['accepted', 'counter'].includes(d.status) && <Button size="sm" onClick={() => act(acceptNegotiation(career, d.id), 'Contrato assinado')}><Check /> Assinar contrato</Button>}{['pending', 'counter', 'accepted'].includes(d.status) && <Button className="ml-2" size="sm" variant="outline" onClick={() => update({ ...career, negotiations: (career.negotiations ?? []).map(x => x.id === d.id ? { ...x, status: 'rejected' } : x) })}>Cancelar</Button>}</article>)}
    </>}
    {view === 'contracts' && <>
      <p className="g-mini">Folha mensal simulada: {money(career.squad.reduce((sum, p) => sum + p.wage, 0))}. Empréstimos: salário integral pago pelo clube que recebe. Retorno automático; vaga reservada no clube dono. Elenco mínimo: 16 — renovação de segurança automática no limite.</p>
      {career.squad.map(p => <article key={p.id} className="flex items-center justify-between gap-2 border-b border-border py-3"><div className="min-w-0"><b>{p.name}</b><p className="g-mini">{money(p.wage)}/mês · Até {p.contractUntil ?? 'Renovação pendente'}{career.loans?.some(x => x.playerId === p.id) ? ' · Emprestado' : ''}</p></div><Button size="sm" variant="outline" onClick={() => choose(p)}>Negociar</Button></article>)}
      {career.loans?.map(l => <p key={l.playerId} className="g-mini">{career.squad.find(x => x.id === l.playerId)?.name ?? career.transferHistory?.find(x => x.playerId === l.playerId)?.player ?? l.playerId}: {marketClubName(career, l.owner)} → {marketClubName(career, l.borrower)} · retorno {l.until}</p>)}
    </>}
    {view === 'history' && <>
      <p className="g-mini">Negócios desta carreira — não são transferências oficiais.</p>
      {!career.transferHistory?.length && <p className="g-mini">Nenhum negócio registrado nesta versão; notícias antigas foram preservadas.</p>}
      {career.transferHistory?.map(t => <article key={t.id} className="border-b border-border py-3"><b>{t.player}</b><p className="g-mini">{t.date} · {t.kind === 'loan' ? 'Empréstimo' : t.kind === 'return' ? 'Retorno' : t.kind === 'renew' ? 'Renovação' : t.kind === 'release' ? 'Fim de contrato' : 'Compra/venda'}{t.ai ? ' · Clubes IA' : ''}<br />{marketClubName(career, t.from)} → {marketClubName(career, t.to)} · {money(t.fee)} · {money(t.wage)}/mês{t.until ? ` · Até ${t.until}` : ''}</p></article>)}
    </>}
    {selected && <div className="g-sheet-bg" onClick={() => setSelected(null)}><div className="g-sheet max-h-[90dvh] overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Negociar ${selected.name}`} onClick={e => e.stopPropagation()}>
      <Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label="Fechar negociação" onClick={() => setSelected(null)}><X /></Button>
      <h3 className="g-title pr-10 break-words">{selected.name}</h3><p className="g-mini">{marketClubName(career, selected.clubId)} · {selected.real ? 'Identidade API-Football' : 'Jogador fictício'}<br />Valores e vínculo abaixo são simulados.</p>
      <div className="flex gap-2"><Button variant={terms.kind === 'buy' ? 'default' : 'outline'} onClick={() => setTerms(t => ({ ...t, kind: 'buy', fee: Math.round(selected.value * (owned ? 0.8 : 1.1)), months: 24 }))}>{owned ? 'Venda' : 'Compra'}</Button><Button variant={terms.kind === 'loan' ? 'default' : 'outline'} disabled={selected.clubId === 'livre'} onClick={() => setTerms(t => ({ ...t, kind: 'loan', fee: Math.round(selected.value * 0.12), months: 6 }))}>Empréstimo</Button></div>
      {owned && <label className="grid gap-1 text-sm">Clube comprador<select aria-label="Clube comprador" className="rounded-md border border-input bg-background p-2 text-foreground" value={buyer} onChange={e => setBuyer(e.target.value)}>{allClubs.filter(x => x.id !== career.clubId).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">{terms.kind === 'loan' ? 'Taxa de empréstimo (R$)' : 'Proposta ao clube (R$)'}<Input aria-label="Valor da proposta" type="number" min={0} step={1000} value={terms.fee} onChange={e => setTerms(t => ({ ...t, fee: Number(e.target.value) }))} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-sm">Salário mensal (R$)<Input aria-label="Salário mensal" type="number" min={0} step={1000} value={terms.wage} onChange={e => setTerms(t => ({ ...t, wage: Number(e.target.value) }))} /></label><label className="grid gap-1 text-sm">Duração (meses)<Input aria-label="Duração do contrato" type="number" min={1} max={terms.kind === 'loan' ? 12 : 60} value={terms.months} onChange={e => setTerms(t => ({ ...t, months: Number(e.target.value) }))} /></label></div>
      {owned ? <><Button onClick={() => act(transferPlayer(career, selected.id, career.clubId, buyer, terms), terms.kind === 'loan' ? 'Empréstimo concluído' : 'Venda concluída')}><ArrowLeftRight /> Oferecer ao clube</Button><Button variant="outline" onClick={() => act(renewContract(career, selected.id, terms.wage, terms.months), 'Contrato renovado')}>Renovar com seu clube</Button></> : <Button onClick={() => act(proposeDeal(career, selected.id, terms), 'Proposta enviada; o clube responderá no próximo dia')}><Send /> Enviar proposta</Button>}
    </div></div>}
  </div>;
}