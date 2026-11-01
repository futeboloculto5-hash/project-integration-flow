// Live match engine: minute-by-minute simulation driven by tactics, ratings and stamina.
export type Side = "home" | "away";
export type Mentality = "defensiva" | "equilibrada" | "ofensiva";
export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "5-3-2";

export type MatchPlayer = {
  id: string;
  name: string;
  pos: "GOL" | "DEF" | "MEI" | "ATA";
  number: number;
  rating: number;
  energy: number; // 0-100
  yellow: boolean;
  sentOff: boolean;
  goals: number;
  form: number; // match rating 0-10
};

export type TeamState = {
  name: string;
  short: string;
  color: string;
  baseRating: number;
  formation: Formation;
  mentality: Mentality;
  pressing: number; // 0-2
  lineup: MatchPlayer[]; // 11 on pitch
  bench: MatchPlayer[];
  subsLeft: number;
};

export type MatchEventType = "kickoff" | "chance" | "goal" | "save" | "miss" | "yellow" | "red" | "corner" | "foul" | "sub" | "halftime" | "fulltime" | "injury" | "tactic";
export type MatchEvent = { minute: number; side?: Side; type: MatchEventType; text: string };

export type MatchStats = { shots: number; onTarget: number; possession: number; corners: number; fouls: number; xg: number };

export type MatchGoal = { side: Side; playerId: string; player: string; assistId?: string; assist?: string; minute: number };
export type MatchState = {
  goals: MatchGoal[];
  managedSide: Side;
  minute: number;
  second: number; // sub-steps within minute (0-2)
  half: 1 | 2;
  finished: boolean;
  paused: boolean;
  score: { home: number; away: number };
  ball: { x: number; y: number; side: Side };
  home: TeamState;
  away: TeamState;
  events: MatchEvent[];
  stats: { home: MatchStats; away: MatchStats };
  momentum: number; // -100 (away) .. 100 (home)
  flash: { type: "goal" | "card"; side: Side; text: string; at: number } | null;
  seed: number;
  addedTime: number;
};

function rng(state: MatchState) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

const FIRST = ["Lucas", "Gabriel", "Mateus", "Rafael", "Thiago", "Bruno", "Diego", "Caio", "Igor", "Vitor", "Pedro", "André", "Renan", "Danilo", "Felipe", "Hugo", "Júnior", "Marcos"];
const LAST = ["Silva", "Santos", "Souza", "Oliveira", "Pereira", "Lima", "Costa", "Ribeiro", "Almeida", "Rocha", "Martins", "Barbosa", "Araújo", "Teixeira", "Moura", "Cardoso"];

export function makeSquad(seedStr: string, base: number, names: { name: string; pos?: string }[] = []): MatchPlayer[] {
  let s = 0;
  for (const c of seedStr) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const layout: MatchPlayer["pos"][] = ["GOL", "DEF", "DEF", "DEF", "DEF", "MEI", "MEI", "MEI", "ATA", "ATA", "ATA", "GOL", "DEF", "DEF", "MEI", "MEI", "ATA", "ATA"];
  const mapPos = (p?: string): MatchPlayer["pos"] | null => {
    if (!p) return null; const u = p.toLowerCase();
    if (u.startsWith("goal") || u.startsWith("gol")) return "GOL";
    if (u.startsWith("def") || ["zag", "ld", "le"].includes(u)) return "DEF";
    if (u.startsWith("mid") || ["mc", "mei", "vol"].includes(u)) return "MEI";
    if (u.startsWith("att") || u.startsWith("for") || ["ata", "pe", "pd"].includes(u)) return "ATA";
    return null;
  };
  const pool = names.map((n) => ({ name: n.name, pos: mapPos(n.pos) }));
  const used = new Set<number>();
  return layout.map((pos, i) => {
    let idx = pool.findIndex((p, k) => !used.has(k) && p.pos === pos);
    if (idx >= 0) used.add(idx);
    const name = idx >= 0 ? pool[idx]!.name : `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const rating = Math.round(base - 4 + r() * 8 - (i >= 11 ? 3 : 0));
    return { id: `${seedStr}-${i}`, name, pos, number: i === 0 ? 1 : i === 11 ? 12 : i + 1, rating, energy: 100, yellow: false, sentOff: false, goals: 0, form: 6.5 };
  });
}

export function createTeam(name: string, short: string, color: string, rating: number, players: MatchPlayer[], formation: Formation = "4-3-3"): TeamState {
  return { name, short, color, baseRating: rating, formation, mentality: "equilibrada", pressing: 1, lineup: players.slice(0, 11), bench: players.slice(11), subsLeft: 5 };
}

const emptyStats = (): MatchStats => ({ shots: 0, onTarget: 0, possession: 0, corners: 0, fouls: 0, xg: 0 });

export function createMatch(home: TeamState, away: TeamState, seed: string, managedSide: Side = "home"): MatchState {
  let s = 7;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return {
    goals: [], managedSide, minute: 0, second: 0, half: 1, finished: false, paused: false,
    score: { home: 0, away: 0 }, ball: { x: 50, y: 50, side: "home" },
    home, away, events: [{ minute: 0, type: "kickoff", text: `Bola rolando! ${home.name} x ${away.name}` }],
    stats: { home: emptyStats(), away: emptyStats() }, momentum: 0, flash: null, seed: s, addedTime: 0,
  };
}

function strength(t: TeamState) {
  const active = t.lineup.filter((p) => !p.sentOff);
  const avg = active.reduce((a, p) => a + p.rating * (0.75 + p.energy / 400), 0) / 11;
  return avg;
}

const mentMod = { defensiva: { atk: 0.8, def: 1.18 }, equilibrada: { atk: 1, def: 1 }, ofensiva: { atk: 1.2, def: 0.85 } };

function pick<T>(st: MatchState, arr: T[]) { return arr[Math.floor(rng(st) * arr.length)]!; }

function attacker(st: MatchState, t: TeamState) {
  const opts = t.lineup.filter((p) => !p.sentOff && p.pos !== "GOL");
  const weighted = opts.flatMap((p) => Array(p.pos === "ATA" ? 4 : p.pos === "MEI" ? 2 : 1).fill(p));
  return pick(st, weighted) as MatchPlayer;
}

function push(st: MatchState, e: MatchEvent) { st.events = [e, ...st.events].slice(0, 60); }

/** Advance one sub-step (3 per minute). Returns the same (mutated clone) state. */
export function step(prev: MatchState): MatchState {
  if (prev.finished || prev.paused) return prev;
  const st: MatchState = structuredClone(prev);
  const atkSide = st.ball.side;
  const defSide: Side = atkSide === "home" ? "away" : "home";
  const atk = st[atkSide];
  const def = st[defSide];
  const dir = atkSide === "home" ? 1 : -1;

  const aStr = strength(atk) * mentMod[atk.mentality].atk * (atkSide === "home" ? 1.04 : 1);
  const dStr = strength(def) * mentMod[def.mentality].def * (1 + (def.pressing - 1) * 0.06);
  const edge = (aStr - dStr) / 25; // ~ -0.5..0.5

  st.stats[atkSide].possession += 1;
  st.momentum = Math.max(-100, Math.min(100, st.momentum * 0.94 + (atkSide === "home" ? 6 : -6) * (1 + edge)));

  // Ball progression
  const progress = (8 + rng(st) * 16) * (1 + edge);
  const lose = rng(st) < 0.24 - edge * 0.2 + (def.pressing - 1) * 0.06;
  if (lose) {
    st.ball.side = defSide;
    if (rng(st) < 0.12) {
      st.stats[defSide].fouls += 1;
      const offender = pick(st, def.lineup.filter((p) => !p.sentOff && p.pos !== "GOL"));
      if (rng(st) < 0.22 + (def.pressing - 1) * 0.1) {
        if (offender.yellow) {
          offender.sentOff = true;
          push(st, { minute: st.minute, side: defSide, type: "red", text: `Segundo amarelo! ${offender.name} (${def.short}) está expulso!` });
          st.flash = { type: "card", side: defSide, text: "CARTÃO VERMELHO", at: Date.now() };
        } else {
          offender.yellow = true; offender.form -= 0.4;
          push(st, { minute: st.minute, side: defSide, type: "yellow", text: `Amarelo para ${offender.name} (${def.short}) após falta dura.` });
        }
      } else if (rng(st) < 0.3) {
        push(st, { minute: st.minute, side: defSide, type: "foul", text: `Falta de ${offender.name}. Jogo parado.` });
      }
      st.ball.side = atkSide; // free kick keeps possession
    }
  } else {
    st.ball.x = Math.max(4, Math.min(96, st.ball.x + progress * dir));
  }
  st.ball.y = Math.max(8, Math.min(92, st.ball.y + (rng(st) - 0.5) * 34));

  // Chance in the final third
  const inFinal = atkSide === "home" ? st.ball.x > 74 : st.ball.x < 26;
  if (!lose && inFinal && rng(st) < 0.14 + edge * 0.15) {
    const shooter = attacker(st, atk);
    const gk = def.lineup.find((p) => p.pos === "GOL")!;
    const quality = Math.max(0.04, Math.min(0.55, 0.075 + (shooter.rating - gk.rating) / 160 + edge * 0.12 + (rng(st) - 0.5) * 0.12));
    st.stats[atkSide].shots += 1;
    st.stats[atkSide].xg += quality;
    const roll = rng(st);
    if (roll < quality) {
      const options = atk.lineup.filter(p => p.id !== shooter.id && p.pos !== "GOL" && !p.sentOff);
      const assist = rng(st) < 0.75 ? options[Math.floor(rng(st) * options.length)] : undefined;
      st.goals.push({ side: atkSide, playerId: shooter.id, player: shooter.name, minute: st.minute, ...(assist ? { assistId: assist.id, assist: assist.name } : {}) });
      st.score[atkSide] += 1; shooter.goals += 1; shooter.form += 1.2;
      st.stats[atkSide].onTarget += 1;
      const how = pick(st, ["chute colocado no ângulo", "cabeçada firme", "bomba de fora da área", "toque de cavadinha", "finalização cruzada", "rebote empurrado para as redes"]);
      push(st, { minute: st.minute, side: atkSide, type: "goal", text: `GOOOL! ${shooter.name} marca com ${how}! ${st.home.short} ${st.score.home} x ${st.score.away} ${st.away.short}` });
      st.flash = { type: "goal", side: atkSide, text: shooter.name, at: Date.now() };
      st.ball = { x: 50, y: 50, side: defSide };
      st.momentum = atkSide === "home" ? 80 : -80;
    } else if (roll < quality + 0.3) {
      st.stats[atkSide].onTarget += 1; gk.form += 0.3;
      push(st, { minute: st.minute, side: atkSide, type: "save", text: `${shooter.name} finaliza e ${gk.name} faz grande defesa!` });
      if (rng(st) < 0.45) { st.stats[atkSide].corners += 1; push(st, { minute: st.minute, side: atkSide, type: "corner", text: `Escanteio para o ${atk.short}.` }); }
      else st.ball = { x: atkSide === "home" ? 88 : 12, y: 50, side: defSide };
    } else {
      push(st, { minute: st.minute, side: atkSide, type: "miss", text: `${shooter.name} arrisca... ${pick(st, ["por cima do gol!", "rente à trave!", "pela linha de fundo."])}` });
      st.ball = { x: atkSide === "home" ? 92 : 8, y: 50, side: defSide };
    }
  }

  // Stamina drain
  for (const side of ["home", "away"] as Side[]) {
    const t = st[side];
    for (const p of t.lineup) {
      if (p.sentOff) continue;
      p.energy = Math.max(15, p.energy - (0.14 + t.pressing * 0.07 + (t.mentality === "ofensiva" ? 0.04 : 0)) * (p.pos === "GOL" ? 0.3 : 1));
    }
  }

  // AI opponent manages the game
  if (st.second === 0 && st.minute > 55 && st.minute % 10 === 0) aiManage(st);

  // Clock
  st.second += 1;
  if (st.second >= 3) {
    st.second = 0;
    st.minute += 1;
    if (st.half === 1 && st.minute === 45 + st.addedTime) {
      push(st, { minute: 45, type: "halftime", text: `Fim do primeiro tempo: ${st.home.short} ${st.score.home} x ${st.score.away} ${st.away.short}` });
      st.half = 2; st.minute = 45; st.addedTime = 2 + Math.floor(rng(st) * 4);
      st.ball = { x: 50, y: 50, side: "away" };
      st.paused = true;
      for (const t of [st.home, st.away]) for (const p of t.lineup) p.energy = Math.min(100, p.energy + 12);
    } else if (st.half === 1 && st.minute === 44) {
      st.addedTime = 1 + Math.floor(rng(st) * 3);
    } else if (st.half === 2 && st.minute >= 90 + st.addedTime) {
      st.finished = true;
      push(st, { minute: st.minute, type: "fulltime", text: `Fim de jogo! ${st.home.short} ${st.score.home} x ${st.score.away} ${st.away.short}` });
    }
  }
  return st;
}

function aiManage(st: MatchState) {
  const side: Side = st.managedSide === "home" ? "away" : "home";
  const t = st[side];
  const diff = st.score[side] - st.score[st.managedSide];
  const want: Mentality = diff < 0 ? "ofensiva" : diff > 0 ? "defensiva" : "equilibrada";
  if (t.mentality !== want) {
    t.mentality = want;
    push(st, { minute: st.minute, side, type: "tactic", text: `${t.short} muda postura: ${want}.` });
  }
  if (t.subsLeft > 0 && t.bench.length) {
    const tired = [...t.lineup].filter((p) => p.pos !== "GOL" && !p.sentOff).sort((a, b) => a.energy - b.energy)[0];
    if (tired && tired.energy < 70) {
      const inIdx = t.bench.findIndex((b) => b.pos === tired.pos);
      const sub = t.bench.splice(inIdx >= 0 ? inIdx : 0, 1)[0]!;
      t.lineup = t.lineup.map((p) => (p.id === tired.id ? sub : p));
      t.subsLeft -= 1;
      push(st, { minute: st.minute, side, type: "sub", text: `Substituição ${t.short}: sai ${tired.name}, entra ${sub.name}.` });
    }
  }
}

export function substitute(prev: MatchState, side: Side, outId: string, inId: string): MatchState {
  const st = structuredClone(prev);
  const t = st[side];
  const out = t.lineup.find((p) => p.id === outId);
  const inIdx = t.bench.findIndex((p) => p.id === inId);
  if (!out || out.sentOff || inIdx < 0 || t.subsLeft <= 0) return prev;
  const sub = t.bench.splice(inIdx, 1)[0]!;
  t.lineup = t.lineup.map((p) => (p.id === outId ? sub : p));
  t.subsLeft -= 1;
  push(st, { minute: st.minute, side, type: "sub", text: `Substituição ${t.short}: sai ${out.name}, entra ${sub.name}.` });
  return st;
}

export function setTactics(prev: MatchState, side: Side, patch: Partial<Pick<TeamState, "mentality" | "pressing" | "formation">>): MatchState {
  const st = structuredClone(prev);
  Object.assign(st[side], patch);
  const label = patch.mentality ? `postura ${patch.mentality}` : patch.formation ? `formação ${patch.formation}` : `pressão ${["baixa", "média", "alta"][patch.pressing ?? 1]}`;
  push(st, { minute: st.minute, side, type: "tactic", text: `${st[side].short} ajusta: ${label}.` });
  return st;
}

/** Formation slots in "attacking right" coordinates: x 0..100 along the pitch, y 0..100 across. */
const SLOTS: Record<Formation, [number, number][]> = {
  "4-3-3": [[5, 50], [22, 15], [20, 38], [20, 62], [22, 85], [40, 30], [37, 50], [40, 70], [60, 18], [64, 50], [60, 82]],
  "4-4-2": [[5, 50], [22, 15], [20, 38], [20, 62], [22, 85], [42, 15], [40, 40], [40, 60], [42, 85], [62, 40], [62, 60]],
  "3-5-2": [[5, 50], [20, 28], [19, 50], [20, 72], [40, 10], [38, 34], [36, 50], [38, 66], [40, 90], [62, 40], [62, 60]],
  "5-3-2": [[5, 50], [24, 8], [19, 30], [18, 50], [19, 70], [24, 92], [40, 30], [38, 50], [40, 70], [60, 40], [60, 60]],
};

export function playerPositions(st: MatchState, side: Side) {
  const t = st[side];
  const slots = SLOTS[t.formation];
  const shift = (st.ball.x - 50) * 0.42;
  const attacking = st.ball.side === side;
  return t.lineup.map((p, i) => {
    const [sx, sy] = slots[i] ?? [50, 50];
    let x = sx + (i === 0 ? shift * 0.15 : (side === "home" ? shift : -shift) + (attacking ? 6 : -4));
    let y = sy + (st.ball.y - 50) * (i === 0 ? 0.1 : 0.22);
    x = Math.max(2, Math.min(i === 0 ? 18 : 92, x));
    y = Math.max(5, Math.min(95, y));
    if (side === "away") x = 100 - x;
    return { p, x, y };
  });
}
