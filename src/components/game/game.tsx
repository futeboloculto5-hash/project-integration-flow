import { useEffect, useMemo, useRef, useState } from "react";
import { Home, CalendarDays, ListOrdered, Shirt, ArrowLeftRight, Building2, Play, FastForward, SkipForward, Newspaper, Wallet, X, CloudCheck, CloudUpload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CLUBS, clubById } from "@/lib/game/clubs";
import {
  advanceDay, advanceToMatch, aiSquad, bestEleven, completeRound, computeTable, createCareer, currentRound,
  ensureFields, money, nextFixture, refreshMarket, sellPlayer, squadFromApi, teamRating, type CareerV2, type Player, type Pos,
} from "@/lib/game/career";
import { Button } from "@/components/ui/button";
import { simulateMatch } from "@/lib/career/simulation";
import { getSaveStatus, subscribeSave, retryCareerSave, type SaveStatus, loadCareer, saveCareer } from "@/lib/game/storage";
import { LiveMatch } from "@/components/live-match";
import { Crest, Onboarding } from "./onboarding";
import { ClubTab } from "./club-tab";
import { WorldMarket } from "./world-market";
import { SeasonTab } from "./season-tab";
import { AcademyTab } from "./academy-tab";
import { buffEffect } from "@/lib/game/bux";
import { careerClub, divisionOf, initializeSeason, seasonFinished, seasonTable, startNextSeason, type Goal } from "@/lib/game/seasons";

type Tab = "inicio" | "calendario" | "tabela" | "elenco" | "mercado" | "clube";
const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short" }) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { ...opts, timeZone: "UTC" });

export function Game({ userId }: { userId: string | null }) {
  const [career, setCareer] = useState<CareerV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  const [live, setLive] = useState(false);
  const rowId = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<SaveStatus>(() => getSaveStatus(userId));
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => subscribeSave(userId, () => setSaveState(getSaveStatus(userId))), [userId]);
  useEffect(() => {
    const retry = () => { void retryCareerSave(userId).catch(() => {}); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [userId]);

  useEffect(() => {
    let off = false;
    setLoading(true); setLoadError(false);
    loadCareer(userId).then((r) => { if (off) return; setCareer(r.career ? ensureFields(r.career) : null); rowId.current = r.rowId; })
      .catch(() => { if (!off) { setLoadError(true); toast.error("Não foi possível carregar sua carreira. Seus dados não foram alterados."); } })
      .finally(() => !off && setLoading(false));
    return () => { off = true; };
  }, [userId, loadAttempt]);

  // Load real squads for every other club once per career
  const fetchingSquads = useRef(false);
  useEffect(() => {
    if (!career || career.otherSquads || fetchingSquads.current) return;
    fetchingSquads.current = true;
    (async () => {
      const result: Record<string, Player[]> = {};
      const others = CLUBS.filter((c) => c.id !== career.clubId);
      for (let i = 0; i < others.length; i += 1) {
        await Promise.all(others.slice(i, i + 1).map(async (c) => {
          try {
            const res = await fetch(`/api/football/squad?teamId=${c.apiId}`);
            if (!res.ok) return;
            const data = await res.json();
            const sq = squadFromApi(c.id, c.rating, data.players ?? []);
            if (sq.length >= 16) result[c.id] = sq.filter(p => !career.squad.some(x => x.apiId === p.apiId || x.id === p.id) && !career.transferredIn.includes(p.id));
          } catch { /* keep generated squad */ }
        }));
      }
      if (Object.keys(result).length === 0) { fetchingSquads.current = false; return; }
      setCareer((cur) => {
        if (!cur) return cur;
        const next = { ...cur, otherSquads: { ...result, ...cur.otherSquads } };
        next.market = refreshMarket(next, next.date);
        queueSave(next);
        return next;
      });
    })();
  }, [career?.clubId, !!career?.otherSquads]);

  const queueSave = (c: CareerV2) => {
    void saveCareer(userId, rowId.current, c).then((id) => { rowId.current = id; }).catch(() => {
      toast.error(userId ? "Carreira guardada neste aparelho. A sincronização será tentada novamente." : "Não foi possível salvar neste aparelho.");
    });
  };

  const update = (c: CareerV2) => {
    setCareer(c);
    queueSave(c);
  };

  const start = async (manager: string, clubId: string) => {
    setBusy(true);
    let real: Player[] | undefined;
    try {
      const club = clubById(clubId);
      const res = await fetch(`/api/football/squad?teamId=${club.apiId}`);
      if (res.ok) { const data = await res.json(); real = squadFromApi(clubId, club.rating, data.players ?? []); }
    } catch { /* fall back to generated squad */ }
    const c = initializeSeason(createCareer(manager, clubId, real));
    queueSave(c);
    setCareer(c); setBusy(false);
  };

  if (loading) return <div className="g-loading"><div className="g-spinner" /></div>;
  if (loadError) return <div className="g-loading"><div className="g-stack"><p>Não foi possível recuperar sua carreira.</p><Button onClick={() => setLoadAttempt((n) => n + 1)}><RefreshCw /> Tentar novamente</Button></div></div>;
  if (!career) return <Onboarding onStart={start} busy={busy} />;

  const club = clubById(career.clubId);
  const nf = nextFixture(career);
  const matchDay = !!nf && career.date >= nf.date;

  const onAdvance = () => {
    const r = advanceDay(career);
    if (r.blocked) { toast(r.blocked); return; }
    update(r.career);
  };

  return (
    <div className="g-app">
      <header className="g-top">
        <Crest club={club} size={40} />
        <div className="g-top-info"><b>{club.name}</b><span>{career.manager} · {fmtDate(career.date, { day: "2-digit", month: "short", year: "numeric" })}</span></div>
        <div className="g-cash"><Wallet /> {money(career.balance)}</div>
      </header>

      <div className="flex items-center justify-end gap-2 px-4 py-1 text-xs text-muted-foreground" role="status" aria-live="polite">
        {saveState === "saving" ? <CloudUpload size={14} /> : <CloudCheck size={14} />}
        <span>{saveState === "saving" ? "Salvando…" : saveState === "pending" ? "Salvo no aparelho · sincronização pendente" : saveState === "error" ? "Falha no salvamento" : userId ? "Carreira salva na nuvem" : "Carreira salva neste aparelho"}</span>
        {(saveState === "pending" || saveState === "error") && <Button variant="ghost" size="icon" title="Tentar salvar novamente" aria-label="Tentar salvar novamente" onClick={() => { if (career) queueSave(career); }}><RefreshCw /></Button>}
      </div>
      <main className="g-main">
        {tab === "inicio" && <HomeTab career={career} matchDay={matchDay} onAdvance={onAdvance} onSkip={() => update(advanceToMatch(career))} onPlay={() => setLive(true)} onSimulate={() => update(completeRound(career, ...simulateUserFixture(career)))} onNext={() => { const result = startNextSeason(career); if (result.error) toast.error(result.error); else update(result.career); }} goto={setTab} />}
        {tab === "calendario" && <SeasonTab career={career} update={update} calendar />}
        {tab === "tabela" && <SeasonTab career={career} update={update} />}
        {tab === "elenco" && <SquadTab career={career} update={update} />}
        {tab === "mercado" && <WorldMarket career={career} update={update} />}
        {tab === "clube" && <ClubTab career={career} update={update} userId={userId} />}
      </main>

      <nav className="g-nav">
        {([["inicio", Home, "Início"], ["calendario", CalendarDays, "Jogos"], ["tabela", ListOrdered, "Tabela"], ["elenco", Shirt, "Elenco"], ["mercado", ArrowLeftRight, "Mercado"], ["clube", Building2, "Clube"]] as const).map(([k, Icon, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <Icon />{l}{k === "mercado" && career.offers.length > 0 && <i className="g-badge">{career.offers.length}</i>}{k === "clube" && career.sponsorOffers.length > 0 && <i className="g-badge">{career.sponsorOffers.length}</i>}
          </button>
        ))}
      </nav>

      {live && nf && <LiveFixture career={career} onDone={(hg, ag, goals) => {
        update(completeRound(career, hg, ag, goals));
      }} onClose={() => setLive(false)} />}
    </div>
  );
}

function simulateUserFixture(career: CareerV2): [number, number] {
  const nf = nextFixture(career); if (!nf) return [0, 0];
  const home = nf.home === career.clubId ? career.squad : aiSquad(career, nf.home);
  const away = nf.away === career.clubId ? career.squad : aiSquad(career, nf.away);
  const result = simulateMatch(teamRating(home) + 2, teamRating(away), `${career.season}:${nf.competition}:${nf.round}:${nf.home}:${nf.away}`);
  return [result.homeGoals, result.awayGoals];
}
function LiveFixture({ career, onDone, onClose }: { career: CareerV2; onDone: (hg: number, ag: number, goals: Goal[]) => void; onClose: () => void }) {
  const nf = nextFixture(career);
  const done = useRef(false);
  if (!nf) return null;
  const isHome = nf.home === career.clubId;
  const home = careerClub(career, nf.home), away = careerClub(career, nf.away);
  const order = (sq: Player[], formation: CareerV2['formation']) => { const xi = bestEleven(sq, formation); return [...xi, ...sq.filter(p => !xi.includes(p)).sort((a,b) => b.rating-a.rating).slice(0,7)]; };
  const hs = isHome ? career.squad : aiSquad(career,nf.home), as = isHome ? aiSquad(career,nf.away) : career.squad;
  const fx = buffEffect(career.buxBuffs ?? [], career.date);
  const boost = fx.energyDrainMult < 1 || fx.halftimeEnergyBonus > 0 ? { energyDrainMult: fx.energyDrainMult, halftimeEnergyBonus: fx.halftimeEnergyBonus } : undefined;
  return <LiveMatch
    home={{ name: home.name, short: home.short, color: home.color, rating: teamRating(hs) }}
    away={{ name: away.name, short: away.short, color: away.color, rating: teamRating(as) }}
    homeSquad={order(hs,isHome ? career.formation : '4-4-2')} awaySquad={order(as,isHome ? '4-4-2' : career.formation)}
    homeFormation={isHome ? career.formation : '4-4-2'} awayFormation={isHome ? '4-4-2' : career.formation} managedSide={isHome ? 'home' : 'away'}
    {...(boost ? { boost } : {})}
    seed={`${career.season}:${nf.competition}:${nf.round}:${nf.home}:${nf.away}`}
    onFinish={(score) => { if (done.current) return; done.current = true; onDone(score.home,score.away,score.goals.map(g => ({ ...g, clubId: g.side === 'home' ? nf.home : nf.away }))); }} onClose={onClose}
  />;
}

function HomeTab({ career, matchDay, onAdvance, onSkip, onPlay, onSimulate, onNext, goto }: { career: CareerV2; matchDay: boolean; onAdvance: () => void; onSkip: () => void; onPlay: () => void; onSimulate: () => void; onNext: () => void; goto: (t: Tab) => void }) {
  const nf = nextFixture(career);
  const table = useMemo(() => seasonTable(career), [career.fixtures]);
  const pos = table.findIndex((r) => r.clubId === career.clubId) + 1;
  const row = table[pos - 1]!;
  const days = nf ? Math.round((+new Date(nf.date) - +new Date(career.date)) / 86400000) : 0;
  return (
    <div className="g-stack">
      {nf ? (
        <section className="g-hero">
          <div className="g-hero-meta"><span>{nf.competition === "cup" ? "COPA SIMULADA" : `SÉRIE ${divisionOf(career)}`} · RODADA {nf.round}</span><span>{fmtDate(nf.date)}</span></div>
          <div className="g-vs">
            <div><Crest club={careerClub(career,nf.home)} size={64} /><b>{careerClub(career,nf.home).short}</b></div>
            <i>VS</i>
            <div><Crest club={careerClub(career,nf.away)} size={64} /><b>{careerClub(career,nf.away).short}</b></div>
          </div>
          <p className="g-hero-sub">{nf.home === career.clubId ? `Em casa · ${careerClub(career,nf.home).stadium}` : `Fora · ${careerClub(career,nf.home).stadium}`}</p>
          {matchDay ? (
            <div className="g-stack"><Button className="g-btn g-btn-big g-btn-play" onClick={onPlay}><Play /> JOGAR PARTIDA</Button><Button variant="outline" onClick={onSimulate}><FastForward /> SIMULAR PARTIDA</Button></div>
          ) : (
            <div className="g-row">
              <button className="g-btn g-btn-ghost" onClick={onAdvance}><FastForward /> AVANÇAR DIA</button>
              <button className="g-btn" onClick={onSkip}><SkipForward /> IR PARA O JOGO <small>{days}d</small></button>
            </div>
          )}
        </section>
      ) : (
        <section className="g-hero"><h2 className="g-title">{seasonFinished(career) ? "TEMPORADA ENCERRADA" : "AGUARDANDO OUTROS CLUBES"}</h2><p className="g-hero-sub">Série {divisionOf(career)} · {pos}º lugar · {row?.pts ?? 0} pontos.</p>{seasonFinished(career) ? <Button className="g-btn" onClick={onNext}>INICIAR TEMPORADA {Number(career.season) + 1}</Button> : <Button onClick={onAdvance}><FastForward /> AVANÇAR DIA</Button>}</section>
      )}

      <div className="g-tiles">
        <button className="g-tile" onClick={() => goto("tabela")}><span>Posição</span><b>{pos}º</b><small>{row.pts} pts · {row.p} jogos</small></button>
        <button className="g-tile" onClick={() => goto("elenco")}><span>Força</span><b>{teamRating(career.squad, career.formation)}</b><small>{career.squad.length} jogadores</small></button>
        <button className="g-tile" onClick={() => goto("clube")}><span>Dívida</span><b className="g-tile-debt">{money(career.debt).replace("R$ ", "")}</b><small>{clubById(career.clubId).stadium}</small></button>
      </div>

      <section className="g-card">
        <h3 className="g-h"><Newspaper /> NOTÍCIAS</h3>
        <ul className="g-news">
          {career.news.slice(0, 8).map((n) => (
            <li key={n.id} className={`g-news-${n.kind}`}><b>{n.title}</b><p>{n.body}</p><span>{fmtDate(n.date)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const POS_ORDER: Pos[] = ["GOL", "DEF", "MEI", "ATA"];

function SquadTab({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const xi = bestEleven(career.squad, career.formation);
  const [sel, setSel] = useState<Player | null>(null);
  const [view, setView] = useState<"pro" | "base">("pro");
  const sorted = [...career.squad].sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.rating - a.rating);
  const toggle = (
    <div className="g-seg">
      <button className={view === "pro" ? "on" : ""} onClick={() => setView("pro")}>PROFISSIONAL</button>
      <button className={view === "base" ? "on" : ""} onClick={() => setView("base")}>BASE{(career.academy?.prospects.length ?? 0) > 0 && <i className="g-dot" />}</button>
    </div>
  );
  if (view === "base") return <div className="g-stack">{toggle}<AcademyTab career={career} update={update} /></div>;
  return (
    <div className="g-stack">
      {toggle}
      <section className="g-card">
        <h3 className="g-h"><Shirt /> FORMAÇÃO · FORÇA {teamRating(career.squad, career.formation)}</h3>
        <div className="g-seg">
          {(["4-3-3", "4-4-2", "3-5-2", "5-3-2"] as const).map((f) => <button key={f} className={career.formation === f ? "on" : ""} onClick={() => update({ ...career, formation: f })}>{f}</button>)}
        </div>
        <p className="g-mini">Os 11 melhores de cada posição entram como titulares automaticamente.</p>
      </section>
      <section className="g-card">
        <ul className="g-players">
          {sorted.map((p) => (
            <li key={p.id}>
              <button onClick={() => setSel(p)} className={xi.includes(p) ? "g-starter" : ""}>
                <span className={`g-pos-tag g-pos-${p.pos}`}>{p.pos}</span>
                <b>{p.name}{p.academy && <em className="g-tag-base">BASE</em>}</b><small>{p.age}a</small>
                <span className="g-ovr">{p.rating}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {sel && (
        <PlayerSheet player={sel} onClose={() => setSel(null)} actions={
          <button className="g-btn g-btn-danger" onClick={() => {
            const fee = Math.round(sel.value * 0.8);
            if (!confirm(`Vender ${sel.name} por ${money(fee)} agora? (propostas de clubes costumam pagar mais)`)) return;
            const r = sellPlayer(career, sel.id, fee);
            if (r.error) toast.error(r.error); else { update(r.career); toast.success(`${sel.name} vendido por ${money(fee)}`); setSel(null); }
          }}>VENDER JÁ · {money(Math.round(sel.value * 0.8))}</button>
        } />
      )}
    </div>
  );
}

function PlayerSheet({ player, onClose, actions, from }: { player: Player; onClose: () => void; actions: React.ReactNode; from?: string }) {
  return (
    <div className="g-sheet-bg" onClick={onClose}>
      <div className="g-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="g-sheet-x" onClick={onClose} aria-label="Fechar"><X /></button>
        <div className="g-card-player">
          <span className="g-ovr g-ovr-big">{player.rating}</span>
          <span className={`g-pos-tag g-pos-${player.pos}`}>{player.pos}</span>
          <h3>{player.name}</h3>
          <p>{player.age} anos{from ? ` · ${from}` : ""}</p>
        </div>
        <div className="g-facts">
          <div><span>Valor</span><b>{player.value ? money(player.value) : "Livre"}</b></div>
          <div><span>Salário/mês</span><b>{money(player.wage)}</b></div>
        </div>
        {actions}
      </div>
    </div>
  );
}
