import { useEffect, useMemo, useRef, useState } from "react";
import { Home, CalendarDays, ListOrdered, Shirt, ArrowLeftRight, Building2, Play, FastForward, SkipForward, Newspaper, Wallet, X, CloudCheck, CloudUpload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CLUBS, clubById } from "@/lib/game/clubs";
import {
  advanceDay, advanceToMatch, aiSquad, bestEleven, buyPlayer, completeRound, computeTable, createCareer, currentRound,
  ensureFields, money, nextFixture, refreshMarket, sellPlayer, squadFromApi, teamRating, type CareerV2, type Player, type Pos,
} from "@/lib/game/career";
import { Button } from "@/components/ui/button";
import { getSaveStatus, subscribeSave, retryCareerSave, type SaveStatus, loadCareer, saveCareer } from "@/lib/game/storage";
import { LiveMatch } from "@/components/live-match";
import { Crest, Onboarding } from "./onboarding";
import { ClubTab } from "./club-tab";

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
      for (let i = 0; i < others.length; i += 5) {
        await Promise.all(others.slice(i, i + 5).map(async (c) => {
          try {
            const res = await fetch(`/api/football/squad?teamId=${c.apiId}`);
            if (!res.ok) return;
            const data = await res.json();
            const sq = squadFromApi(c.id, c.rating, data.players ?? []);
            if (sq.length >= 16) result[c.id] = sq;
          } catch { /* keep generated squad */ }
        }));
      }
      if (Object.keys(result).length === 0) { fetchingSquads.current = false; return; }
      setCareer((cur) => {
        if (!cur) return cur;
        const next = { ...cur, otherSquads: result };
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
    const c = createCareer(manager, clubId, real);
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
        {tab === "inicio" && <HomeTab career={career} matchDay={matchDay} onAdvance={onAdvance} onSkip={() => update(advanceToMatch(career))} onPlay={() => setLive(true)} goto={setTab} />}
        {tab === "calendario" && <CalendarTab career={career} />}
        {tab === "tabela" && <TableTab career={career} />}
        {tab === "elenco" && <SquadTab career={career} update={update} />}
        {tab === "mercado" && <MarketTab career={career} update={update} />}
        {tab === "clube" && <ClubTab career={career} update={update} />}
      </main>

      <nav className="g-nav">
        {([["inicio", Home, "Início"], ["calendario", CalendarDays, "Jogos"], ["tabela", ListOrdered, "Tabela"], ["elenco", Shirt, "Elenco"], ["mercado", ArrowLeftRight, "Mercado"], ["clube", Building2, "Clube"]] as const).map(([k, Icon, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <Icon />{l}{k === "mercado" && career.offers.length > 0 && <i className="g-badge">{career.offers.length}</i>}{k === "clube" && career.sponsorOffers.length > 0 && <i className="g-badge">{career.sponsorOffers.length}</i>}
          </button>
        ))}
      </nav>

      {live && nf && <LiveFixture career={career} onDone={(my, opp) => {
        const isHome = nf.home === career.clubId;
        update(completeRound(career, isHome ? my : opp, isHome ? opp : my));
      }} onClose={() => setLive(false)} />}
    </div>
  );
}

function LiveFixture({ career, onDone, onClose }: { career: CareerV2; onDone: (my: number, opp: number) => void; onClose: () => void }) {
  const nf = nextFixture(career)!;
  const oppId = nf.home === career.clubId ? nf.away : nf.home;
  const me = clubById(career.clubId), opp = clubById(oppId);
  const myXI = bestEleven(career.squad, career.formation);
  const myBench = career.squad.filter((p) => !myXI.includes(p)).sort((a, b) => b.rating - a.rating).slice(0, 7);
  const oppSquad = aiSquad(career, oppId);
  const oppXI = bestEleven(oppSquad, "4-4-2");
  const oppBench = oppSquad.filter((p) => !oppXI.includes(p)).sort((a, b) => b.rating - a.rating).slice(0, 7);
  const done = useRef(false);
  return (
    <LiveMatch
      home={{ name: me.name, short: me.short, color: me.color === "#ffffff" || me.color === "#f2f2f2" || me.color === "#f3f3f3" ? me.color2 : me.color, rating: teamRating(career.squad, career.formation) }}
      away={{ name: opp.name, short: opp.short, color: opp.color, rating: teamRating(oppSquad) }}
      homeSquad={[...myXI, ...myBench]} awaySquad={[...oppXI, ...oppBench]} homeFormation={career.formation}
      seed={`${career.clubId}:${nf.round}:${career.date}`}
      onFinish={(s) => { if (!done.current) { done.current = true; onDone(s.home, s.away); } }}
      onClose={onClose}
    />
  );
}

function HomeTab({ career, matchDay, onAdvance, onSkip, onPlay, goto }: { career: CareerV2; matchDay: boolean; onAdvance: () => void; onSkip: () => void; onPlay: () => void; goto: (t: Tab) => void }) {
  const nf = nextFixture(career);
  const table = useMemo(() => computeTable(career.fixtures), [career.fixtures]);
  const pos = table.findIndex((r) => r.clubId === career.clubId) + 1;
  const row = table[pos - 1]!;
  const days = nf ? Math.round((+new Date(nf.date) - +new Date(career.date)) / 86400000) : 0;
  return (
    <div className="g-stack">
      {nf ? (
        <section className="g-hero">
          <div className="g-hero-meta"><span>BRASILEIRÃO · RODADA {nf.round}</span><span>{fmtDate(nf.date)}</span></div>
          <div className="g-vs">
            <div><Crest club={clubById(nf.home)} size={64} /><b>{clubById(nf.home).short}</b></div>
            <i>VS</i>
            <div><Crest club={clubById(nf.away)} size={64} /><b>{clubById(nf.away).short}</b></div>
          </div>
          <p className="g-hero-sub">{nf.home === career.clubId ? `Em casa · ${clubById(nf.home).stadium}` : `Fora · ${clubById(nf.home).stadium}`}</p>
          {matchDay ? (
            <button className="g-btn g-btn-big g-btn-play" onClick={onPlay}><Play /> JOGAR PARTIDA</button>
          ) : (
            <div className="g-row">
              <button className="g-btn g-btn-ghost" onClick={onAdvance}><FastForward /> AVANÇAR DIA</button>
              <button className="g-btn" onClick={onSkip}><SkipForward /> IR PARA O JOGO <small>{days}d</small></button>
            </div>
          )}
        </section>
      ) : (
        <section className="g-hero"><h2 className="g-title">TEMPORADA ENCERRADA</h2><p className="g-hero-sub">Você terminou em {pos}º lugar com {row.pts} pontos.</p></section>
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

function CalendarTab({ career }: { career: CareerV2 }) {
  const mine = career.fixtures.filter((f) => f.home === career.clubId || f.away === career.clubId);
  const nf = nextFixture(career);
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "center" }); }, []);
  return (
    <section className="g-card">
      <h3 className="g-h"><CalendarDays /> CALENDÁRIO · 38 RODADAS</h3>
      <ul className="g-cal">
        {mine.map((f) => {
          const home = f.home === career.clubId;
          const opp = clubById(home ? f.away : f.home);
          const played = f.hg != null;
          const my = home ? f.hg! : f.ag!, ot = home ? f.ag! : f.hg!;
          const res = played ? (my > ot ? "V" : my < ot ? "D" : "E") : null;
          const isNext = nf && f.round === nf.round;
          return (
            <li key={f.round} ref={isNext ? ref : undefined} className={isNext ? "g-cal-next" : played ? "g-cal-done" : ""}>
              <span className="g-cal-r">R{f.round}</span>
              <span className="g-cal-d">{fmtDate(f.date)}</span>
              <Crest club={opp} size={30} />
              <b>{opp.name}</b>
              <span className="g-cal-ha">{home ? "C" : "F"}</span>
              {played ? <span className={`g-res g-res-${res}`}>{my}-{ot}</span> : <span className="g-res">{isNext ? "PRÓX." : "--"}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TableTab({ career }: { career: CareerV2 }) {
  const table = useMemo(() => computeTable(career.fixtures), [career.fixtures]);
  const round = Math.min(currentRound(career) - 1, 38);
  const [view, setView] = useState<"tabela" | "rodada">("tabela");
  const [r, setR] = useState(Math.max(round, 1));
  const games = career.fixtures.filter((f) => f.round === r);
  return (
    <section className="g-card">
      <div className="g-seg">
        <button className={view === "tabela" ? "on" : ""} onClick={() => setView("tabela")}>CLASSIFICAÇÃO</button>
        <button className={view === "rodada" ? "on" : ""} onClick={() => setView("rodada")}>RODADAS</button>
      </div>
      {view === "tabela" ? (
        <>
          <p className="g-mini">Após {round} de 38 rodadas</p>
          <div className="g-table">
            <div className="g-tr g-th"><span>#</span><span>Clube</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span>P</span></div>
            {table.map((row, i) => {
              const c = clubById(row.clubId);
              const zone = i < 4 ? "g-z-lib" : i < 6 ? "g-z-pre" : i < 12 ? "g-z-sul" : i >= 16 ? "g-z-reb" : "";
              return (
                <div key={row.clubId} className={`g-tr ${zone} ${row.clubId === career.clubId ? "g-tr-me" : ""}`}>
                  <span className="g-pos">{i + 1}</span>
                  <span className="g-club-cell"><Crest club={c} size={22} /><b>{c.name}</b></span>
                  <span>{row.p}</span><span>{row.w}</span><span>{row.d}</span><span>{row.l}</span><span>{row.gf - row.ga}</span><span className="g-pts">{row.pts}</span>
                </div>
              );
            })}
          </div>
          <div className="g-legend"><i className="g-z-lib" />Libertadores <i className="g-z-pre" />Pré-Libertadores <i className="g-z-sul" />Sul-Americana <i className="g-z-reb" />Rebaixamento</div>
        </>
      ) : (
        <>
          <div className="g-round-nav">
            <button className="g-btn g-btn-ghost" disabled={r <= 1} onClick={() => setR(r - 1)}>‹</button>
            <b>RODADA {r}</b>
            <button className="g-btn g-btn-ghost" disabled={r >= 38} onClick={() => setR(r + 1)}>›</button>
          </div>
          <ul className="g-games">
            {games.map((f) => (
              <li key={f.home} className={f.home === career.clubId || f.away === career.clubId ? "g-tr-me" : ""}>
                <span className="g-gh">{clubById(f.home).short} <Crest club={clubById(f.home)} size={24} /></span>
                <b>{f.hg != null ? `${f.hg} - ${f.ag}` : fmtDate(f.date, { day: "2-digit", month: "2-digit" })}</b>
                <span className="g-ga"><Crest club={clubById(f.away)} size={24} /> {clubById(f.away).short}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const POS_ORDER: Pos[] = ["GOL", "DEF", "MEI", "ATA"];

function SquadTab({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const xi = bestEleven(career.squad, career.formation);
  const [sel, setSel] = useState<Player | null>(null);
  const sorted = [...career.squad].sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.rating - a.rating);
  return (
    <div className="g-stack">
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
                <b>{p.name}</b><small>{p.age}a</small>
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

function MarketTab({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const [filter, setFilter] = useState<Pos | "ALL">("ALL");
  const [sel, setSel] = useState<Player | null>(null);
  const list = career.market.filter((p) => filter === "ALL" || p.pos === filter);
  return (
    <div className="g-stack">
      {career.offers.length > 0 && (
        <section className="g-card g-card-hot">
          <h3 className="g-h">PROPOSTAS RECEBIDAS</h3>
          <ul className="g-offers">
            {career.offers.map((o) => {
              const p = career.squad.find((x) => x.id === o.playerId);
              if (!p) return null;
              const from = clubById(o.fromClub);
              return (
                <li key={o.id}>
                  <Crest club={from} size={34} />
                  <div><b>{p.name} <span className="g-ovr g-ovr-sm">{p.rating}</span></b><small>{from.name} oferece <strong>{money(o.fee)}</strong> · valor {money(p.value)}</small></div>
                  <div className="g-offer-act">
                    <button className="g-btn g-btn-sm" onClick={() => { const r = sellPlayer(career, p.id, o.fee, o.fromClub); if (r.error) toast.error(r.error); else { update(r.career); toast.success(`${p.name} vendido ao ${from.name}`); } }}>ACEITAR</button>
                    <button className="g-btn g-btn-sm g-btn-ghost" onClick={() => update({ ...career, offers: career.offers.filter((x) => x.id !== o.id) })}>RECUSAR</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="g-card">
        <h3 className="g-h"><ArrowLeftRight /> MERCADO · {money(career.balance)} disponível</h3>
        <div className="g-seg">
          {(["ALL", ...POS_ORDER] as const).map((p) => <button key={p} className={filter === p ? "on" : ""} onClick={() => setFilter(p)}>{p === "ALL" ? "TODOS" : p}</button>)}
        </div>
        <p className="g-mini">Lista renovada toda segunda-feira.</p>
        <ul className="g-players">
          {list.map((p) => {
            const fee = p.clubId === "livre" ? 0 : Math.round(p.value * 1.1);
            const c = CLUBS.find((x) => x.id === p.clubId);
            return (
              <li key={p.id}>
                <button onClick={() => setSel(p)}>
                  <span className={`g-pos-tag g-pos-${p.pos}`}>{p.pos}</span>
                  <b>{p.name}<small className="g-from">{c ? c.short : "LIVRE"} · {p.age}a</small></b>
                  <span className={`g-price ${fee > career.balance ? "g-price-no" : ""}`}>{fee ? money(fee) : "GRÁTIS"}</span>
                  <span className="g-ovr">{p.rating}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {sel && (
        <PlayerSheet player={sel} from={CLUBS.find((x) => x.id === sel.clubId)?.name ?? "Sem clube"} onClose={() => setSel(null)} actions={(() => {
          const fee = sel.clubId === "livre" ? 0 : Math.round(sel.value * 1.1);
          return (
            <button className="g-btn g-btn-big" disabled={fee > career.balance} onClick={() => {
              const r = buyPlayer(career, sel.id);
              if (r.error) toast.error(r.error); else { update(r.career); toast.success(`${sel.name} contratado!`); setSel(null); }
            }}>{fee > career.balance ? "SALDO INSUFICIENTE" : `CONTRATAR · ${fee ? money(fee) : "GRÁTIS"}`}</button>
          );
        })()} />
      )}
    </div>
  );
}
