import { useState } from "react";
import { GraduationCap, Dumbbell, Binoculars, Trophy, X, ExternalLink, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { money, type CareerV2 } from "@/lib/game/career";
import {
  ATTR_LABEL, CATEGORIES, FOCUS_LABEL, MAX_SCOUTS, UPGRADE_COST, YOUTH_COMPETITIONS, YOUTH_SOURCE, academy, academyWeeklyCost, fireScout, hireScout,
  overall, promoteYouth, promotionWage, releaseYouth, scoutCandidates, setTraining, signProspect, upgradeAcademy, youthTable,
  type Attrs, type Intensity, type TrainingFocus, type Youth, type YouthCategory,
} from "@/lib/game/academy";
import { Tag } from "./club-tab";

type Props = { career: CareerV2; update: (c: CareerV2) => void };
type Sub = "jogadores" | "treino" | "olheiros" | "competicoes";
const apply = (r: { career: CareerV2; error?: string | undefined }, update: Props["update"], ok: string) => { if (r.error) toast.error(r.error); else { update(r.career); toast.success(ok); } };
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function AcademyTab({ career, update }: Props) {
  const [sub, setSub] = useState<Sub>("jogadores");
  const a = academy(career);
  return (
    <div className="g-stack">
      <section className="g-card">
        <h3 className="g-h"><GraduationCap /> CATEGORIAS DE BASE</h3>
        <div className="g-facts">
          <div><span>Centro de treinamento</span><b>Nível {a.level}/5</b></div>
          <div><span>Custo semanal</span><b className="g-neg-v">-{money(academyWeeklyCost(a))}</b></div>
          <div><span>Atletas na base</span><b>{a.players.length}</b></div>
          <div><span>Promovidos</span><b>{a.promoted.length}</b></div>
        </div>
        {a.level < 5 && <button className="g-btn g-btn-ghost" disabled={career.balance < UPGRADE_COST(a.level)} onClick={() => apply(upgradeAcademy(career), update, "Centro de treinamento melhorado")}>MELHORAR CT · {money(UPGRADE_COST(a.level))}</button>}
        <p className="g-mini">Todos os atletas da base são simulados <Tag status="simulado" />. Nível maior acelera a evolução e melhora a peneira anual.</p>
      </section>
      <div className="g-seg g-seg-icons">
        {([["jogadores", GraduationCap, "Atletas"], ["treino", Dumbbell, "Treino"], ["olheiros", Binoculars, "Olheiros"], ["competicoes", Trophy, "Torneios"]] as const).map(([k, Icon, l]) => (
          <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}><Icon />{l}{k === "olheiros" && a.prospects.length > 0 && <i className="g-dot" />}</button>
        ))}
      </div>
      {sub === "jogadores" && <Players career={career} update={update} />}
      {sub === "treino" && <Training career={career} update={update} />}
      {sub === "olheiros" && <Scouts career={career} update={update} />}
      {sub === "competicoes" && <Competitions career={career} />}
    </div>
  );
}

function Players({ career, update }: Props) {
  const a = academy(career);
  const [cat, setCat] = useState<YouthCategory>("Sub-20");
  const [sel, setSel] = useState<Youth | null>(null);
  const list = a.players.filter((y) => y.category === cat).sort((x, y) => overall(y) - overall(x));
  return (
    <>
      <div className="g-seg">
        {CATEGORIES.map((k) => <button key={k} className={cat === k ? "on" : ""} onClick={() => setCat(k)}>{k} · {a.players.filter((y) => y.category === k).length}</button>)}
      </div>
      <section className="g-card">
        {list.length === 0 && <p className="g-mini">Nenhum atleta nesta categoria.</p>}
        <ul className="g-players">
          {list.map((y) => (
            <li key={y.id}>
              <button onClick={() => setSel(y)}>
                <span className={`g-pos-tag g-pos-${y.pos}`}>{y.pos}</span>
                <b>{y.name}{y.injuredUntil && y.injuredUntil > career.date ? " 🩹" : ""}</b><small>{y.age}a · pot. {y.potentialSeen[0]}–{y.potentialSeen[1]}</small>
                <span className="g-ovr">{overall(y)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="g-mini">O potencial mostrado é uma estimativa da comissão técnica; o teto real pode ser diferente.</p>
      </section>
      {a.promoted.length > 0 && (
        <section className="g-card">
          <h3 className="g-h"><ArrowUpCircle /> CRIAS PROMOVIDAS</h3>
          <ul className="g-src-list">{a.promoted.map((p) => <li key={p.id}><b>{p.name}</b><span>Promovido em {fmtDate(p.date)} com força {p.overall}</span></li>)}</ul>
        </section>
      )}
      {sel && <YouthSheet y={sel} career={career} onClose={() => setSel(null)} onDone={(c) => { update(c); setSel(null); }} />}
    </>
  );
}

function YouthSheet({ y, career, onClose, onDone }: { y: Youth; career: CareerV2; onClose: () => void; onDone: (c: CareerV2) => void }) {
  const ovr = overall(y);
  const first = y.history[0]?.overall ?? ovr;
  return (
    <div className="g-sheet-bg" onClick={onClose}>
      <div className="g-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="g-sheet-x" onClick={onClose} aria-label="Fechar"><X /></button>
        <div className="g-card-player">
          <span className="g-ovr g-ovr-big">{ovr}</span>
          <span className={`g-pos-tag g-pos-${y.pos}`}>{y.pos}</span>
          <h3>{y.name} <Tag status="simulado" /></h3>
          <p>{y.age} anos · {y.category} · {y.origin === "olheiro" ? `descoberto por olheiro${y.region ? ` (${y.region})` : ""}` : "formado no clube"}</p>
        </div>
        <div className="g-attrs">
          {(Object.keys(y.attrs) as (keyof Attrs)[]).map((k) => (
            <div key={k}><span>{ATTR_LABEL[k]}</span><div className="g-progress"><i style={{ width: `${y.attrs[k]}%` }} /></div><b>{y.attrs[k]}</b></div>
          ))}
        </div>
        <div className="g-facts">
          <div><span>Potencial estimado</span><b>{y.potentialSeen[0]}–{y.potentialSeen[1]}</b></div>
          <div><span>Evolução</span><b className={ovr > first ? "g-pos-v" : ""}>{ovr > first ? "+" : ""}{ovr - first} desde {fmtDate(y.joined)}</b></div>
          <div><span>Salário se promovido</span><b>{money(promotionWage(ovr))}/mês</b></div>
          <div><span>Situação</span><b>{y.injuredUntil && y.injuredUntil > career.date ? `Lesionado até ${fmtDate(y.injuredUntil)}` : "Apto"}</b></div>
        </div>
        <button className="g-btn g-btn-big" disabled={y.age < 16} onClick={() => { const r = promoteYouth(career, y.id); if (r.error) toast.error(r.error); else { toast.success(`${y.name} subiu ao profissional`); onDone(r.career); } }}>
          {y.age < 16 ? "PROMOÇÃO A PARTIR DOS 16 ANOS" : "PROMOVER AO PROFISSIONAL"}
        </button>
        <button className="g-btn g-btn-ghost" onClick={() => { if (confirm(`Dispensar ${y.name} da base?`)) { onDone(releaseYouth(career, y.id).career); toast.success("Atleta dispensado"); } }}>DISPENSAR</button>
      </div>
    </div>
  );
}

function Training({ career, update }: Props) {
  const a = academy(career);
  return (
    <>
      {CATEGORIES.map((cat) => (
        <section key={cat} className="g-card">
          <h3 className="g-h"><Dumbbell /> {cat.toUpperCase()}</h3>
          <span className="g-mini">Foco</span>
          <div className="g-seg">
            {(Object.keys(FOCUS_LABEL) as TrainingFocus[]).map((f) => <button key={f} className={a.training[cat].focus === f ? "on" : ""} onClick={() => update(setTraining(career, cat, { focus: f }).career)}>{FOCUS_LABEL[f]}</button>)}
          </div>
          <span className="g-mini">Intensidade</span>
          <div className="g-seg">
            {(["leve", "normal", "intensa"] as Intensity[]).map((i) => <button key={i} className={a.training[cat].intensity === i ? "on" : ""} onClick={() => update(setTraining(career, cat, { intensity: i }).career)}>{i[0]!.toUpperCase() + i.slice(1)}</button>)}
          </div>
        </section>
      ))}
      <p className="g-mini">O treino roda toda segunda-feira. Foco acelera um atributo e desacelera os outros. Treino intenso evolui mais rápido, custa mais e aumenta o risco de lesão. Jogadores mais novos evoluem mais. <Tag status="simulado" /></p>
    </>
  );
}

function Scouts({ career, update }: Props) {
  const a = academy(career);
  const candidates = scoutCandidates(career).filter((s) => !a.scouts.some((x) => x.id === s.id));
  return (
    <>
      {a.prospects.length > 0 && (
        <section className="g-card g-card-hot">
          <h3 className="g-h"><Binoculars /> PROMESSAS INDICADAS</h3>
          <ul className="g-offers">
            {a.prospects.map((p) => (
              <li key={p.id}>
                <span className={`g-pos-tag g-pos-${p.youth.pos}`}>{p.youth.pos}</span>
                <div><b>{p.youth.name} <Tag status="simulado" /></b><small>{p.youth.age} anos · {p.youth.region} · força {overall(p.youth)} · potencial {p.youth.potentialSeen[0]}–{p.youth.potentialSeen[1]} · {money(p.fee)} · até {fmtDate(p.expires)}</small></div>
                <div className="g-offer-act"><button className="g-btn g-btn-sm" disabled={p.fee > career.balance} onClick={() => apply(signProspect(career, p.id), update, `${p.youth.name} chegou à base`)}>CONTRATAR</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="g-card">
        <h3 className="g-h">OLHEIROS CONTRATADOS · {a.scouts.length}/{MAX_SCOUTS}</h3>
        {a.scouts.length === 0 && <p className="g-mini">Nenhum olheiro. Contrate abaixo para receber relatórios semanais.</p>}
        <ul className="g-offers">
          {a.scouts.map((s) => (
            <li key={s.id}>
              <span className="g-logo-co">{"★".repeat(s.skill).slice(0, 5)}</span>
              <div><b>{s.name}</b><small>{s.region} · nível {s.skill}/5 · {money(s.weeklyCost)}/sem</small></div>
              <div className="g-offer-act"><button className="g-btn g-btn-sm g-btn-ghost" onClick={() => apply(fireScout(career, s.id), update, "Olheiro dispensado")}>DISPENSAR</button></div>
            </li>
          ))}
        </ul>
      </section>
      <section className="g-card">
        <h3 className="g-h">DISPONÍVEIS ESTA SEMANA</h3>
        <ul className="g-offers">
          {candidates.map((s) => (
            <li key={s.id}>
              <span className="g-logo-co">{s.skill}★</span>
              <div><b>{s.name} <Tag status="simulado" /></b><small>{s.region} · nível {s.skill}/5 · {money(s.weeklyCost)}/sem</small></div>
              <div className="g-offer-act"><button className="g-btn g-btn-sm" disabled={a.scouts.length >= MAX_SCOUTS} onClick={() => apply(hireScout(career, s), update, `${s.name} contratado`)}>CONTRATAR</button></div>
            </li>
          ))}
        </ul>
        <p className="g-mini">Olheiros melhores encontram promessas com mais frequência e estimam o potencial com mais precisão.</p>
      </section>
    </>
  );
}

function Competitions({ career }: { career: CareerV2 }) {
  const a = academy(career);
  return (
    <>
      {a.competitions.map((comp) => {
        const table = youthTable(comp);
        const real = YOUTH_COMPETITIONS[comp.category].real;
        return (
          <section key={comp.id} className="g-card">
            <h3 className="g-h"><Trophy /> {comp.name.toUpperCase()} {comp.season}</h3>
            <p className="g-mini">Nome {real ? <Tag status="oficial" /> : <Tag status="simulado" />} · Resultados <Tag status="simulado" /> · {comp.rounds}/22 rodadas</p>
            <table className="g-mini-table">
              <thead><tr><th>#</th><th>Clube</th><th>J</th><th>SG</th><th>P</th></tr></thead>
              <tbody>
                {table.map((r, i) => <tr key={r.clubId} className={r.clubId === career.clubId ? "g-me" : ""}><td>{i + 1}</td><td>{r.name}</td><td>{r.p}</td><td>{r.gf - r.ga}</td><td><b>{r.pts}</b></td></tr>)}
              </tbody>
            </table>
          </section>
        );
      })}
      {a.archive.length > 0 && (
        <section className="g-card">
          <h3 className="g-h">HISTÓRICO DA BASE</h3>
          <ul className="g-src-list">{a.archive.map((h, i) => <li key={i}><b>{h.name} {h.season}</b><span>{h.position}º lugar (simulado)</span></li>)}</ul>
        </section>
      )}
      <section className="g-card">
        <h3 className="g-h">FONTE</h3>
        <p className="g-mini"><b>{YOUTH_SOURCE.publisher}</b> · consultado em {fmtDate(YOUTH_SOURCE.accessed)}</p>
        <p className="g-mini">{YOUTH_SOURCE.methodology}</p>
        <a className="g-link" href={YOUTH_SOURCE.url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir fonte</a>
      </section>
    </>
  );
}
