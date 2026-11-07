import { useState } from "react";
import { Landmark, Building2, Handshake, Wallet, Hammer, Ticket, BookOpen, PiggyBank, ExternalLink, Coins } from "lucide-react";
import { toast } from "sonner";
import { clubById } from "@/lib/game/clubs";
import { EXPANSION, SPONSOR_EXIT_FEE, acceptSponsor, cancelSponsor, counterSponsor, expandStadium, gateIncome, money, payDebt, sponsorExitFee, type CareerV2 } from "@/lib/game/career";
import { CATEGORY_LABEL, EXPENSE, INCOME, LOAN_OPTIONS, OVERDRAFT_RATE, STRUCTURAL_DEBT, finance, installment, loanCapacity, monthStatement, monthlyInstallments, payroll, reallocateBudget, takeLoan, transferRemaining, weeklyFixed } from "@/lib/game/finance";
import { BuxShop } from "./bux-shop";
import { DEBT_PENDING, DEBT_REFERENCES, SECTOR_WEIGHTS_2025, SOURCES, SPONSOR_MAP_2025, STATUS_LABEL, sourceById, type DataStatus } from "@/lib/game/finance-data";

type Sub = "financas" | "divida" | "estadio" | "patrocinio" | "bux" | "fontes";
type Props = { career: CareerV2; update: (c: CareerV2) => void };

export function Tag({ status }: { status: DataStatus }) {
  return <em className={`g-src g-src-${status}`}>{STATUS_LABEL[status]}</em>;
}
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const monthName = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const apply = (r: { career: CareerV2; error?: string | undefined }, update: Props["update"], ok: string) => { if (r.error) toast.error(r.error); else { update(r.career); toast.success(ok); } };

export function ClubTab({ career, update, userId = null }: Props & { userId?: string | null }) {
  const [sub, setSub] = useState<Sub>("financas");
  const club = clubById(career.clubId);
  return (
    <div className="g-stack">
      <div className="g-seg g-seg-icons">
        {([["financas", Wallet, "Finanças"], ["divida", Landmark, "Dívidas"], ["estadio", Building2, "Estádio"], ["patrocinio", Handshake, "Patrocínio"], ["bux", Coins, "Bux"], ["fontes", BookOpen, "Fontes"]] as const).map(([k, Icon, l]) => (
          <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>
            <Icon />{l}{k === "patrocinio" && career.sponsorOffers.length > 0 && <i className="g-dot" />}
          </button>
        ))}
      </div>
      {sub === "financas" && <Finances career={career} update={update} />}
      {sub === "divida" && <Debt career={career} update={update} />}
      {sub === "estadio" && <Stadium career={career} update={update} stadiumName={club.stadium} city={club.city} />}
      {sub === "patrocinio" && <Sponsors career={career} update={update} />}
      {sub === "bux" && <BuxShop career={career} update={update} userId={userId} />}
      {sub === "fontes" && <Sources career={career} />}
    </div>
  );
}

function Finances({ career, update }: Props) {
  const f = finance(career);
  const fx = weeklyFixed(career);
  const months = Object.keys(f.months).sort().reverse();
  const [month, setMonth] = useState(months[0] ?? career.date.slice(0, 7));
  const st = monthStatement(career, month);
  const b = f.budget;
  const used = payroll(career);
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><Wallet /> CAIXA</h3>
        <div className={`g-big-money ${career.balance < 0 ? "g-neg-v" : ""}`}>{money(career.balance)}</div>
        <div className="g-facts">
          <div><span>Patrocínios/semana</span><b className="g-pos-v">+{money(fx.sponsors)}</b></div>
          <div><span>Salários elenco/semana</span><b className="g-neg-v">-{money(fx.wages)}</b></div>
          <div><span>Funcionários/semana</span><b className="g-neg-v">-{money(fx.staff)}</b></div>
          <div><span>Manutenção/semana</span><b className="g-neg-v">-{money(fx.upkeep)}</b></div>
          <div><span>Saldo fixo/semana</span><b className={fx.net >= 0 ? "g-pos-v" : "g-neg-v"}>{money(fx.net)}</b></div>
          <div><span>Parcelas/mês</span><b className="g-neg-v">-{money(monthlyInstallments(career))}</b></div>
        </div>
        <p className="g-mini">Bilheteria e premiação entram a cada jogo. Caixa negativo paga {OVERDRAFT_RATE * 100}% de juros ao mês. <Tag status="simulado" /></p>
      </section>

      <section className="g-card">
        <h3 className="g-h"><PiggyBank /> ORÇAMENTO {b.season}</h3>
        <div className="g-facts">
          <div><span>Transferências</span><b>{money(b.transfer)}</b></div>
          <div><span>Disponível</span><b className="g-pos-v">{money(transferRemaining(career))}</b></div>
          <div><span>Folha mensal aprovada</span><b>{money(b.wagesMonthly)}</b></div>
          <div><span>Folha atual</span><b className={used > b.wagesMonthly ? "g-neg-v" : ""}>{money(used)}</b></div>
        </div>
        <div className="g-progress"><i style={{ width: `${Math.min(100, Math.round((used / Math.max(1, b.wagesMonthly)) * 100))}%` }} /></div>
        <div className="g-row3">
          <button className="g-btn g-btn-ghost" onClick={() => apply(reallocateBudget(career, -100_000), update, "R$ 1,2 mi foram para transferências")}>− FOLHA</button>
          <span className="g-mini g-center">R$ 100 mil/mês ⇄ R$ 1,2 mi</span>
          <button className="g-btn g-btn-ghost" onClick={() => apply(reallocateBudget(career, 100_000), update, "R$ 100 mil/mês foram para a folha")}>+ FOLHA</button>
        </div>
        <p className="g-mini">A diretoria aprova um novo orçamento a cada temporada. Vendas de jogadores voltam para o orçamento de transferências. <Tag status="simulado" /></p>
      </section>

      <section className="g-card">
        <h3 className="g-h">DEMONSTRATIVO MENSAL</h3>
        {months.length > 1 && (
          <select className="g-select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        )}
        {months.length === 0 ? <p className="g-mini">Nenhuma movimentação ainda. Avance os dias.</p> : (
          <div className="g-dre">
            <b className="g-dre-h">Receitas · {monthName(month)}</b>
            {INCOME.filter((k) => st.rows[k]).map((k) => <div key={k}><span>{CATEGORY_LABEL[k]}</span><span className="g-pos-v">+{money(st.rows[k] ?? 0)}</span></div>)}
            <div className="g-dre-t"><span>Total de receitas</span><span className="g-pos-v">{money(st.income)}</span></div>
            <b className="g-dre-h">Despesas</b>
            {EXPENSE.filter((k) => st.rows[k]).map((k) => <div key={k}><span>{CATEGORY_LABEL[k]}</span><span className="g-neg-v">{money(st.rows[k] ?? 0)}</span></div>)}
            <div className="g-dre-t"><span>Total de despesas</span><span className="g-neg-v">-{money(st.expense)}</span></div>
            <div className="g-dre-t g-dre-r"><span>Resultado do mês</span><span className={st.result >= 0 ? "g-pos-v" : "g-neg-v"}>{money(st.result)}</span></div>
          </div>
        )}
      </section>

      <section className="g-card">
        <h3 className="g-h">ÚLTIMAS SEMANAS</h3>
        {career.ledger.length === 0 && <p className="g-mini">Nenhuma movimentação ainda.</p>}
        {career.ledger.map((w) => (
          <div key={w.week} className="g-ledger">
            <div className="g-ledger-h"><b>Semana de {new Date(`${w.week}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })}</b><span className={w.income - w.expense >= 0 ? "g-pos-v" : "g-neg-v"}>{money(w.income - w.expense)}</span></div>
            {w.items.map((it, i) => <div key={i} className="g-ledger-row"><span>{it.label}</span><span className={it.value >= 0 ? "g-pos-v" : "g-neg-v"}>{it.value >= 0 ? "+" : ""}{money(it.value)}</span></div>)}
          </div>
        ))}
      </section>
    </>
  );
}

function Debt({ career, update }: Props) {
  const f = finance(career);
  const ref = DEBT_REFERENCES[career.clubId];
  const pending = DEBT_PENDING[career.clubId];
  const cap = loanCapacity(career);
  const [months, setMonths] = useState<number>(LOAN_OPTIONS[1].months);
  const opt = LOAN_OPTIONS.find((o) => o.months === months)!;
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><Landmark /> ENDIVIDAMENTO DA CARREIRA</h3>
        <div className="g-big-money g-neg-v">{money(career.debt)}</div>
        <div className="g-facts">
          <div><span>Parcelas deste mês</span><b>{money(monthlyInstallments(career))}</b></div>
          <div><span>Contratos ativos</span><b>{f.debts.filter((d) => d.balance > 0).length}</b></div>
        </div>
        <p className="g-mini">Parcelas fixas (tabela Price) debitadas todo dia 1º. Amortizar antes reduz as próximas parcelas.</p>
      </section>

      {f.debts.map((d) => {
        const pct = d.original ? Math.round(((d.original - d.balance) / d.original) * 100) : 100;
        return (
          <section key={d.id} className="g-card">
            <h3 className="g-h">{d.label.toUpperCase()}</h3>
            <p className="g-mini">Saldo inicial <Tag status={d.status} /> · Juros e prazo <Tag status="simulado" /></p>
            <div className="g-facts">
              <div><span>Saldo devedor</span><b className="g-neg-v">{money(d.balance)}</b></div>
              <div><span>Parcela</span><b>{money(installment(d))}</b></div>
              <div><span>Juros</span><b>{(d.monthlyRate * 100).toLocaleString("pt-BR")}% ao mês</b></div>
              <div><span>Parcelas pagas</span><b>{d.installmentsPaid}/{d.installmentsTotal}</b></div>
            </div>
            <div className="g-progress"><i style={{ width: `${pct}%` }} /></div>
            <p className="g-mini">{pct}% quitado · início em {fmtDate(d.startedAt)}. {d.note}</p>
            <div className="g-row3">
              {[1_000_000, 5_000_000, 10_000_000].map((v) => (
                <button key={v} className="g-btn g-btn-ghost" disabled={d.balance <= 0 || Math.min(v, d.balance) > career.balance} onClick={() => apply(payDebt(career, v, d.id), update, `${money(Math.min(v, d.balance))} amortizados`)}>PAGAR {money(Math.min(v, d.balance)).replace("R$ ", "")}</button>
              ))}
            </div>
          </section>
        );
      })}

      <section className="g-card">
        <h3 className="g-h"><PiggyBank /> EMPRÉSTIMO BANCÁRIO</h3>
        <p className="g-mini">Limite de crédito: <b>{money(cap)}</b> (60% dos patrocínios anuais, descontados empréstimos em aberto). <Tag status="simulado" /></p>
        <div className="g-seg">
          {LOAN_OPTIONS.map((o) => <button key={o.months} className={months === o.months ? "on" : ""} onClick={() => setMonths(o.months)}>{o.months}x · {(o.monthlyRate * 100).toLocaleString("pt-BR")}%</button>)}
        </div>
        <div className="g-row3">
          {[5_000_000, 10_000_000, 20_000_000].map((v) => (
            <button key={v} className="g-btn g-btn-ghost" disabled={v > cap} onClick={() => apply(takeLoan(career, v, months), update, `Empréstimo de ${money(v)} liberado`)}>
              {money(v).replace("R$ ", "")}<small className="g-btn-sub">{money(installment({ balance: v, monthlyRate: opt.monthlyRate, installmentsTotal: opt.months, installmentsPaid: 0 }))}/mês</small>
            </button>
          ))}
        </div>
      </section>

      <section className="g-card">
        <h3 className="g-h"><BookOpen /> REFERÊNCIA OFICIAL DO CLUBE</h3>
        {ref?.value ? (
          <>
            <div className="g-facts">
              <div><span>{ref.metric} {ref.fiscalYear}</span><b>{money(ref.value)}</b></div>
              <div><span>Entidade</span><b className="g-small-b">{ref.entity}</b></div>
            </div>
            <p className="g-mini"><Tag status="oficial" /> {ref.note}</p>
            <a className="g-link" href={ref.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink /> {ref.sourceTitle}</a>
            <p className="g-mini">Consultado em {fmtDate("2026-11-01")}. {ref.metric === "Endividamento líquido" ? "Este valor foi usado como saldo inicial em carreiras novas." : "Por não ser dívida, não substitui o saldo inicial estimado da carreira."}</p>
          </>
        ) : (
          <p className="g-mini"><Tag status="estimativa" /> Nenhum valor oficial verificado para este clube. {pending ?? ""} A dívida da carreira é uma estimativa do jogo.</p>
        )}
        <p className="g-mini">Carreiras já existentes mantêm o saldo que tinham; nada foi apagado ou recalculado.</p>
      </section>
    </>
  );
}

function Stadium({ career, update, stadiumName, city }: Props & { stadiumName: string; city: string }) {
  const g = gateIncome(career);
  const naming = career.sponsors.find((s) => s.slot === "Naming rights");
  return (
    <>
      <section className="g-stadium">
        <div className="g-stadium-art" aria-hidden><i /><i /><i /><i /></div>
        <div className="g-stadium-info">
          <span>{city}</span>
          <h2>{naming ? `${naming.company} Arena` : stadiumName}</h2>
          <b>{career.stadium.capacity.toLocaleString("pt-BR")} lugares · Nível {career.stadium.level}</b>
        </div>
      </section>
      <section className="g-card">
        <h3 className="g-h"><Ticket /> INGRESSOS</h3>
        <div className="g-price-row">
          <button className="g-btn g-btn-ghost" onClick={() => update({ ...career, stadium: { ...career.stadium, ticketPrice: Math.max(10, career.stadium.ticketPrice - 10) } })}>−</button>
          <div><b>R$ {career.stadium.ticketPrice}</b><span>preço médio</span></div>
          <button className="g-btn g-btn-ghost" onClick={() => update({ ...career, stadium: { ...career.stadium, ticketPrice: Math.min(300, career.stadium.ticketPrice + 10) } })}>+</button>
        </div>
        <div className="g-facts">
          <div><span>Público previsto</span><b>{g.attendance.toLocaleString("pt-BR")} ({Math.round(g.fill * 100)}%)</b></div>
          <div><span>Bilheteria/jogo</span><b className="g-pos-v">{money(g.income)}</b></div>
        </div>
        <p className="g-mini">Ingresso caro esvazia o estádio. Boa campanha atrai mais torcida. <Tag status="simulado" /></p>
      </section>
      <section className="g-card">
        <h3 className="g-h"><Hammer /> OBRAS</h3>
        {career.stadium.building ? (
          <p className="g-mini">Ampliação de +{career.stadium.building.seats.toLocaleString("pt-BR")} lugares em andamento. Conclusão: {fmtDate(career.stadium.building.until)}.</p>
        ) : (
          <button className="g-btn g-btn-big" disabled={career.balance < EXPANSION.cost} onClick={() => apply(expandStadium(career), update, "Obra iniciada!")}>
            AMPLIAR +{EXPANSION.seats.toLocaleString("pt-BR")} · {money(EXPANSION.cost)}
          </button>
        )}
        <p className="g-mini">Leva {EXPANSION.days} dias. Cada lugar custa R$ 9 por semana de manutenção. <Tag status="simulado" /></p>
      </section>
    </>
  );
}

function Sponsors({ career, update }: Props) {
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  const map = SPONSOR_MAP_2025[career.clubId];
  return (
    <>
      {career.sponsorOffers.length > 0 && (
        <section className="g-card g-card-hot">
          <h3 className="g-h"><Handshake /> PROPOSTAS DE EMPRESAS</h3>
          <ul className="g-offers">
            {career.sponsorOffers.map((o) => {
              const current = career.sponsors.find((s) => s.slot === o.slot);
              return (
                <li key={o.id}>
                  <span className="g-logo-co">{o.company.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <b>{o.company} <Tag status="simulado" /></b>
                    <small>{o.slot}{o.sector ? ` · ${o.sector}` : ""} · <strong>{money(o.weekly)}/sem</strong> · {o.weeks} semanas{o.bonusWin ? ` · bônus ${money(o.bonusWin)}/vitória` : ""}{current ? ` · hoje: ${money(current.weekly)}/sem (${current.company})` : ""} · até {fmtDate(o.expires)}</small>
                  </div>
                  <div className="g-offer-act">
                    <button className="g-btn g-btn-sm" onClick={() => { update(acceptSponsor(career, o.id)); toast.success(`Contrato assinado com ${o.company}`); }}>ASSINAR</button>
                    {!o.countered && <button className="g-btn g-btn-sm g-btn-ghost" onClick={() => { const r = counterSponsor(career, o.id); update(r.career); if (r.accepted) toast.success(`${o.company} aceitou +12%`); else toast.error(`${o.company} desistiu da proposta`); }}>PEDIR +12%</button>}
                    <button className="g-btn g-btn-sm g-btn-ghost" onClick={() => update({ ...career, sponsorOffers: career.sponsorOffers.filter((x) => x.id !== o.id) })}>RECUSAR</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="g-card">
        <h3 className="g-h"><Handshake /> CONTRATOS ATIVOS</h3>
        <ul className="g-offers">
          {career.sponsors.map((s) => (
            <li key={s.id} className="g-sponsor">
              <span className="g-logo-co">{s.company.slice(0, 2).toUpperCase()}</span>
              <div>
                <b>{s.company} {s.real ? <em className="g-real">marca no uniforme em 2025</em> : <Tag status="simulado" />}</b>
                <small>{s.slot}{s.sector ? ` · ${s.sector}` : ""} · {money(s.weekly)}/sem{s.bonusWin ? ` · bônus ${money(s.bonusWin)}/vitória` : ""} · até {fmt(s.until)}</small>
              </div>
              {s.slot !== "Material esportivo" && (
                <div className="g-offer-act">
                  <button className="g-btn g-btn-sm g-btn-ghost" onClick={() => { if (confirm(`Rescindir com ${s.company}? Multa de ${money(sponsorExitFee(career, s))}.`)) apply(cancelSponsor(career, s.id), update, "Contrato rescindido"); }}>RESCINDIR</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="g-mini">Marcas com selo amarelo aparecem no Mapa do Patrocínio 2025 do IBOPE Repucom{map?.note ? ` (${map.note})` : ""}. Valores, prazos, bônus e propostas são simulados — o estudo não divulga valores. Rescisão: multa de {SPONSOR_EXIT_FEE * 100}% do restante do contrato.</p>
      </section>
    </>
  );
}

function Sources({ career }: { career: CareerV2 }) {
  const f = finance(career);
  const total = Object.values(SECTOR_WEIGHTS_2025).reduce((a, b) => a + b, 0);
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><BookOpen /> COMO LER OS DADOS</h3>
        <div className="g-legend">
          {(["oficial", "pesquisa", "estimativa", "simulado"] as const).map((s) => <div key={s}><Tag status={s} /><span>{{ oficial: "Lido em demonstração ou estatística oficial.", pesquisa: "Lido em estudo de mercado publicado.", estimativa: "Aproximação do jogo, sem confirmação oficial.", simulado: "Regra ou evento criado pelo jogo." }[s]}</span></div>)}
        </div>
      </section>
      {SOURCES.map((s) => (
        <section key={s.id} className="g-card">
          <h3 className="g-h">{s.title.toUpperCase()}</h3>
          <p className="g-mini"><b>{s.publisher}</b> · publicado: {/^\d{4}-\d{2}-\d{2}$/.test(s.published) ? fmtDate(s.published) : s.published} · consultado: {fmtDate(s.accessed)}</p>
          <p className="g-mini"><b>Metodologia:</b> {s.methodology}</p>
          <p className="g-mini"><b>Uso no jogo:</b> {s.usedFor}</p>
          {s.url && <a className="g-link" href={s.url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir fonte</a>}
          {s.id === "ibope-2025" && <p className="g-mini">Setores (marcas únicas): {Object.entries(SECTOR_WEIGHTS_2025).map(([k, v]) => `${k} ${v} (${Math.round((v / total) * 100)}%)`).join(" · ")}.</p>}
          {s.id === "ibge-cempre-2024" && <p className="g-mini">No seu clube: {f.staff.count} funcionários (quantidade simulada) × R$ {f.staff.monthlySalary.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês (sem encargos).</p>}
          {s.id === "modelo-jogo" && <p className="g-mini">Dívida histórica: {(STRUCTURAL_DEBT.monthlyRate * 100).toLocaleString("pt-BR")}% ao mês em {STRUCTURAL_DEBT.installments} parcelas. Empréstimos: {LOAN_OPTIONS.map((o) => `${o.months}x a ${(o.monthlyRate * 100).toLocaleString("pt-BR")}%`).join(", ")}.</p>}
        </section>
      ))}
      <section className="g-card">
        <h3 className="g-h">DEMONSTRAÇÕES DOS CLUBES</h3>
        <p className="g-mini">Exercício 2025, documentos dos próprios clubes, consultados em {fmtDate("2026-11-01")}. Passivo total e endividamento líquido são métricas diferentes e não devem ser comparados diretamente.</p>
        <ul className="g-src-list">
          {Object.entries(DEBT_REFERENCES).map(([id, r]) => (
            <li key={id}><b>{clubById(id).name}</b><span>{r.metric}: {money(r.value ?? 0)} · {r.entity}</span><a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.sourceTitle}</a></li>
          ))}
          {Object.entries(DEBT_PENDING).map(([id, note]) => <li key={id}><b>{clubById(id).name}</b><span>Não verificado: {note}</span></li>)}
        </ul>
        <p className="g-mini">Marca máster por clube: {sourceById("ibope-2025")?.publisher}.</p>
      </section>
    </>
  );
}
