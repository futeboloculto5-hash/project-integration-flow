import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, FastForward, Repeat2, Swords, BarChart3, MessageSquare, X } from "lucide-react";
import {
  createMatch, createTeam, makeSquad, playerPositions, setTactics, step, substitute,
  type Formation, type MatchPlayer, type MatchState, type Mentality, type MatchGoal, type Side,
} from "@/lib/match/engine";

type SquadIn = { id: string; name: string; pos: "GOL" | "DEF" | "MEI" | "ATA"; rating: number };
const toMatch = (list: SquadIn[]): MatchPlayer[] => list.map((p, i) => ({ id: p.id, name: p.name, pos: p.pos, rating: p.rating, number: i === 0 ? 1 : i + 1, energy: 100, yellow: false, sentOff: false, goals: 0, form: 6.5 }));
type TeamInfo = { name: string; short: string; color: string; rating: number };

type Props = {
  home: TeamInfo;
  away: TeamInfo;
  roster?: { name: string; pos?: string }[];
  seed: string;
  homeSquad?: SquadIn[];
  awaySquad?: SquadIn[];
  homeFormation?: Formation;
  awayFormation?: Formation;
  managedSide?: Side;
  /** Efeitos de Bux ativos para o time do técnico. */
  boost?: { energyDrainMult: number; halftimeEnergyBonus: number };
  onFinish: (score: { home: number; away: number; goals: MatchGoal[] }) => void;
  onClose: () => void;
};

const SPEEDS = [1, 2, 4] as const;
const TICK_MS = 260;
type Tab = "lances" | "tatica" | "elenco" | "stats";

export function LiveMatch({ home, away, roster, seed, homeSquad, awaySquad, homeFormation, awayFormation, managedSide = "home", boost, onFinish, onClose }: Props) {
  const initial = useMemo(() => {
    const h = createTeam(home.name, home.short, home.color, home.rating, homeSquad ? toMatch(homeSquad) : makeSquad(`${seed}-h`, home.rating, roster), homeFormation ?? "4-3-3");
    const a = createTeam(away.name, away.short, away.color, away.rating, awaySquad ? toMatch(awaySquad) : makeSquad(`${seed}-a`, away.rating), awayFormation ?? "4-4-2");
    if (boost) Object.assign(managedSide === "home" ? h : a, boost);
    const m = createMatch(h, a, seed, managedSide);
    return { ...m, paused: true };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [match, setMatch] = useState<MatchState>(initial);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [tab, setTab] = useState<Tab>("lances");
  const [subOut, setSubOut] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [flash, setFlash] = useState<MatchState["flash"]>(null);
  const reported = useRef(false);

  useEffect(() => {
    if (match.paused || match.finished) return;
    const id = setInterval(() => setMatch((m) => step(m)), TICK_MS / speed);
    return () => clearInterval(id);
  }, [match.paused, match.finished, speed]);

  useEffect(() => {
    if (!match.flash) return;
    setFlash(match.flash);
    const id = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(id);
  }, [match.flash?.at]);

  useEffect(() => {
    if (match.finished && !reported.current) { reported.current = true; onFinish({ ...match.score, goals: match.goals }); }
  }, [match.finished]);

  const togglePlay = () => { setStarted(true); setMatch((m) => ({ ...m, paused: !m.paused })); };
  const homePos = playerPositions(match, "home");
  const awayPos = playerPositions(match, "away");
  const totalPoss = match.stats.home.possession + match.stats.away.possession || 1;
  const possHome = Math.round((match.stats.home.possession / totalPoss) * 100);
  const clock = `${String(Math.min(match.minute, match.half === 1 ? 45 : 90)).padStart(2, "0")}'${match.minute >= (match.half === 1 ? 45 : 90) ? `+${match.minute - (match.half === 1 ? 45 : 90) + 1}` : ""}`;

  const mentality = (v: Mentality) => setMatch((m) => setTactics(m, managedSide, { mentality: v }));
  const formation = (v: Formation) => setMatch((m) => setTactics(m, managedSide, { formation: v }));
  const pressing = (v: number) => setMatch((m) => setTactics(m, managedSide, { pressing: v }));

  return (
    <div className="lm-overlay" role="dialog" aria-label="Partida ao vivo">
      <div className="lm-shell">
        {/* Scoreboard */}
        <header className="lm-score">
          <button className="lm-x" onClick={onClose} aria-label="Sair da partida"><X /></button>
          <div className="lm-team lm-team-home">
            <span className="lm-crest" style={{ ["--team" as string]: home.color }}>{home.short}</span>
            <b>{home.name}</b>
          </div>
          <div className="lm-board">
            <div className="lm-goals"><span>{match.score.home}</span><i>-</i><span>{match.score.away}</span></div>
            <div className={`lm-clock ${match.paused && started && !match.finished ? "lm-clock-paused" : ""}`}>
              {match.finished ? "FIM" : !started ? "PRÉ-JOGO" : match.paused && match.minute === 45 && match.half === 2 ? "INTERVALO" : clock}
            </div>
          </div>
          <div className="lm-team lm-team-away">
            <b>{away.name}</b>
            <span className="lm-crest" style={{ ["--team" as string]: away.color }}>{away.short}</span>
          </div>
        </header>

        {/* Momentum */}
        <div className="lm-momentum" aria-label="Pressão no jogo">
          <div className="lm-momentum-fill" style={{ ["--m" as string]: `${50 + match.momentum / 2}%` }} />
        </div>

        {/* Pitch */}
        <div className="lm-pitch-wrap">
          <div className="lm-pitch">
            <div className="lm-line lm-half" />
            <div className="lm-circle" />
            <div className="lm-box lm-box-l" /><div className="lm-box lm-box-r" />
            <div className="lm-six lm-six-l" /><div className="lm-six lm-six-r" />
            <div className="lm-goal lm-goal-l" /><div className="lm-goal lm-goal-r" />
            {homePos.map(({ p, x, y }) => (
              <div key={p.id} className={`lm-dot lm-dot-home ${p.sentOff ? "lm-dot-off" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} title={p.name}>{p.number}</div>
            ))}
            {awayPos.map(({ p, x, y }) => (
              <div key={p.id} className={`lm-dot lm-dot-away ${p.sentOff ? "lm-dot-off" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} title={p.name}>{p.number}</div>
            ))}
            <div className="lm-ball" style={{ left: `${match.ball.x}%`, top: `${match.ball.y}%` }} />
            {flash && (
              <div className={`lm-flash ${flash.type === "goal" ? "lm-flash-goal" : "lm-flash-card"}`}>
                <strong>{flash.type === "goal" ? "GOL!" : flash.text}</strong>
                {flash.type === "goal" && <span>{flash.text} · {match[flash.side].short}</span>}
              </div>
            )}
            {!started && (
              <button className="lm-kickoff" onClick={togglePlay}><Play /> COMEÇAR PARTIDA</button>
            )}
            {match.finished && (
              <div className="lm-final">
                <span>{match.score[managedSide] > match.score[managedSide === "home" ? "away" : "home"] ? "VITÓRIA!" : match.score[managedSide] < match.score[managedSide === "home" ? "away" : "home"] ? "DERROTA" : "EMPATE"}</span>
                <b>{home.short} {match.score.home} x {match.score.away} {away.short}</b>
                <button className="lm-cta" onClick={onClose}>CONTINUAR</button>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="lm-controls">
          <button className="lm-ctrl lm-ctrl-main" onClick={togglePlay} disabled={match.finished} aria-label={match.paused ? "Continuar" : "Pausar"}>
            {match.paused ? <Play /> : <Pause />}
          </button>
          <button className="lm-ctrl" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)} aria-label="Velocidade">
            <FastForward /> {speed}x
          </button>
          <div className="lm-poss"><span>{possHome}%</span><div><i style={{ width: `${possHome}%` }} /></div><span>{100 - possHome}%</span></div>
        </div>

        {/* Tabs */}
        <nav className="lm-tabs">
          {([["lances", MessageSquare, "Lances"], ["tatica", Swords, "Tática"], ["elenco", Repeat2, `Trocas (${match[managedSide].subsLeft})`], ["stats", BarChart3, "Números"]] as const).map(([k, Icon, label]) => (
            <button key={k} className={tab === k ? "lm-tab lm-tab-on" : "lm-tab"} onClick={() => setTab(k)}><Icon />{label}</button>
          ))}
        </nav>

        <section className="lm-panel">
          {tab === "lances" && (
            <ul className="lm-feed">
              {match.events.map((e, i) => (
                <li key={`${e.minute}-${i}-${e.text}`} className={`lm-ev lm-ev-${e.type} ${e.side ? `lm-ev-${e.side}` : ""}`}>
                  <span className="lm-ev-min">{e.minute}'</span><p>{e.text}</p>
                </li>
              ))}
            </ul>
          )}

          {tab === "tatica" && (
            <div className="lm-tactics">
              <div className="lm-group"><h4>Postura</h4><div className="lm-seg">
                {(["defensiva", "equilibrada", "ofensiva"] as Mentality[]).map((v) => <button key={v} className={match[managedSide].mentality === v ? "lm-seg-on" : ""} onClick={() => mentality(v)}>{v}</button>)}
              </div></div>
              <div className="lm-group"><h4>Formação</h4><div className="lm-seg">
                {(["4-3-3", "4-4-2", "3-5-2", "5-3-2"] as Formation[]).map((v) => <button key={v} className={match[managedSide].formation === v ? "lm-seg-on" : ""} onClick={() => formation(v)}>{v}</button>)}
              </div></div>
              <div className="lm-group"><h4>Pressão</h4><div className="lm-seg">
                {["baixa", "média", "alta"].map((v, i) => <button key={v} className={match[managedSide].pressing === i ? "lm-seg-on" : ""} onClick={() => pressing(i)}>{v}</button>)}
              </div></div>
              <p className="lm-hint">Pressão alta recupera mais bolas, mas cansa o time e gera mais cartões.</p>
            </div>
          )}

          {tab === "elenco" && (
            <div className="lm-squad">
              <p className="lm-hint">{subOut ? "Agora escolha quem entra." : "Toque em quem vai sair."}</p>
              <ul>
                {match[managedSide].lineup.map((p) => (
                  <li key={p.id}>
                    <button className={`lm-pl ${subOut === p.id ? "lm-pl-sel" : ""}`} disabled={p.sentOff || match[managedSide].subsLeft === 0 || match.finished} onClick={() => setSubOut(subOut === p.id ? null : p.id)}>
                      <span className="lm-pos">{p.pos}</span><b>{p.name}{p.goals > 0 && " ⚽".repeat(p.goals)}{p.yellow && <i className="lm-yc" />}{p.sentOff && <i className="lm-rc" />}</b>
                      <span className="lm-energy"><i style={{ width: `${p.energy}%` }} className={p.energy < 55 ? "lm-low" : ""} /></span>
                    </button>
                  </li>
                ))}
              </ul>
              {subOut && (
                <>
                  <h4 className="lm-bench-h">Banco</h4>
                  <ul>
                    {match[managedSide].bench.map((p) => (
                      <li key={p.id}>
                        <button className="lm-pl lm-pl-bench" onClick={() => { setMatch((m) => substitute(m, managedSide, subOut, p.id)); setSubOut(null); }}>
                          <span className="lm-pos">{p.pos}</span><b>{p.name}</b><span className="lm-rt">{p.rating}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {tab === "stats" && (
            <div className="lm-stats">
              {([
                ["Posse", `${possHome}%`, `${100 - possHome}%`, possHome],
                ["Finalizações", match.stats.home.shots, match.stats.away.shots],
                ["No gol", match.stats.home.onTarget, match.stats.away.onTarget],
                ["Gols esperados", match.stats.home.xg.toFixed(1), match.stats.away.xg.toFixed(1)],
                ["Escanteios", match.stats.home.corners, match.stats.away.corners],
                ["Faltas", match.stats.home.fouls, match.stats.away.fouls],
              ] as [string, string | number, string | number, number?][]).map(([label, h, a, pct]) => {
                const hn = Number(String(h).replace("%", "")), an = Number(String(a).replace("%", ""));
                const p = pct ?? (hn + an ? (hn / (hn + an)) * 100 : 50);
                return (
                  <div key={label} className="lm-stat">
                    <div className="lm-stat-row"><b>{h}</b><span>{label}</span><b>{a}</b></div>
                    <div className="lm-stat-bar"><i style={{ width: `${p}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
