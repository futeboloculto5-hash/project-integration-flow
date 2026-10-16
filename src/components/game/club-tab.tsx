import { useState } from "react";
import { Landmark, Building2, Handshake, Wallet, Hammer, Ticket } from "lucide-react";
import { toast } from "sonner";
import { clubById } from "@/lib/game/clubs";
import { EXPANSION, acceptSponsor, expandStadium, gateIncome, money, payDebt, type CareerV2 } from "@/lib/game/career";

type Sub = "financas" | "divida" | "estadio" | "patrocinio";

export function ClubTab({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const [sub, setSub] = useState<Sub>("financas");
  const club = clubById(career.clubId);
  return (
    <div className="g-stack">
      <div className="g-seg g-seg-icons">
        {([["financas", Wallet, "Finanças"], ["divida", Landmark, "Dívida"], ["estadio", Building2, "Estádio"], ["patrocinio", Handshake, "Patrocínio"]] as const).map(([k, Icon, l]) => (
          <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>
            <Icon />{l}{k === "patrocinio" && career.sponsorOffers.length > 0 && <i className="g-dot" />}
          </button>
        ))}
      </div>
      {sub === "financas" && <Finances career={career} />}
      {sub === "divida" && <Debt career={career} update={update} />}
      {sub === "estadio" && <Stadium career={career} update={update} stadiumName={club.stadium} city={club.city} />}
      {sub === "patrocinio" && <Sponsors career={career} update={update} />}
    </div>
  );
}

function Finances({ career }: { career: CareerV2 }) {
  const weeklySponsors = career.sponsors.reduce((s, x) => s + x.weekly, 0);
  const weeklyWages = Math.round(career.squad.reduce((s, p) => s + p.wage, 0) * 12 / 52);
  const net = weeklySponsors - weeklyWages - Math.round(career.stadium.capacity * 9);
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><Wallet /> CAIXA</h3>
        <div className="g-big-money">{money(career.balance)}</div>
        <div className="g-facts">
          <div><span>Patrocínios/semana</span><b className="g-pos-v">+{money(weeklySponsors)}</b></div>
          <div><span>Salários/semana</span><b className="g-neg-v">-{money(weeklyWages)}</b></div>
          <div><span>Saldo fixo/semana</span><b className={net >= 0 ? "g-pos-v" : "g-neg-v"}>{money(net)}</b></div>
          <div><span>Dívida total</span><b className="g-neg-v">{money(career.debt)}</b></div>
        </div>
        <p className="g-mini">Bilheteria entra em cada jogo em casa. Premiação entra a cada rodada.</p>
      </section>
      <section className="g-card">
        <h3 className="g-h">MOVIMENTAÇÕES</h3>
        {career.ledger.length === 0 && <p className="g-mini">Nenhuma movimentação ainda. Avance os dias.</p>}
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

function Debt({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const club = clubById(career.clubId);
  const paid = club.debt - career.debt;
  const pct = club.debt ? Math.round((paid / club.debt) * 100) : 100;
  const monthly = Math.round(career.debt * 0.003) + Math.round(Math.min(career.debt, career.debt * 0.002 + 200_000));
  const pay = (v: number) => { const r = payDebt(career, v); if (r.error) toast.error(r.error); else { update(r.career); toast.success(`${money(Math.min(v, career.debt))} amortizados`); } };
  return (
    <section className="g-card">
      <h3 className="g-h"><Landmark /> ENDIVIDAMENTO</h3>
      <div className="g-big-money g-neg-v">{money(career.debt)}</div>
      <div className="g-progress"><i style={{ width: `${pct}%` }} /></div>
      <p className="g-mini">{pct}% quitado desde o início da carreira (dívida inicial {money(club.debt)}, referência de balanços divulgados).</p>
      <div className="g-facts">
        <div><span>Parcela mensal</span><b>{money(monthly)}</b></div>
        <div><span>Juros</span><b>0,3% ao mês</b></div>
      </div>
      <p className="g-mini">A parcela é debitada todo dia 1º. Amortizar antes reduz os juros.</p>
      <div className="g-row3">
        {[1_000_000, 5_000_000, 10_000_000].map((v) => (
          <button key={v} className="g-btn g-btn-ghost" disabled={career.debt <= 0 || v > career.balance} onClick={() => pay(v)}>PAGAR {money(v).replace("R$ ", "")}</button>
        ))}
      </div>
    </section>
  );
}

function Stadium({ career, update, stadiumName, city }: { career: CareerV2; update: (c: CareerV2) => void; stadiumName: string; city: string }) {
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
        <p className="g-mini">Ingresso caro esvazia o estádio. Boa campanha na tabela atrai mais torcida.</p>
      </section>
      <section className="g-card">
        <h3 className="g-h"><Hammer /> OBRAS</h3>
        {career.stadium.building ? (
          <p className="g-mini">Ampliação de +{career.stadium.building.seats.toLocaleString("pt-BR")} lugares em andamento. Conclusão: {new Date(`${career.stadium.building.until}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}.</p>
        ) : (
          <button className="g-btn g-btn-big" disabled={career.balance < EXPANSION.cost} onClick={() => { const r = expandStadium(career); if (r.error) toast.error(r.error); else { update(r.career); toast.success("Obra iniciada!"); } }}>
            AMPLIAR +{EXPANSION.seats.toLocaleString("pt-BR")} · {money(EXPANSION.cost)}
          </button>
        )}
        <p className="g-mini">Leva {EXPANSION.days} dias. Cada lugar custa R$ 9 por semana de manutenção.</p>
      </section>
    </>
  );
}

function Sponsors({ career, update }: { career: CareerV2; update: (c: CareerV2) => void }) {
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
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
                  <div><b>{o.company}</b><small>{o.slot} · <strong>{money(o.weekly)}/sem</strong> · {o.weeks} semanas{current ? ` · hoje: ${money(current.weekly)}/sem (${current.company})` : ""}</small></div>
                  <div className="g-offer-act">
                    <button className="g-btn g-btn-sm" onClick={() => { update(acceptSponsor(career, o.id)); toast.success(`Contrato assinado com ${o.company}`); }}>ASSINAR</button>
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
              <div><b>{s.company}{s.real && <em className="g-real">patrocinador real 2025</em>}</b><small>{s.slot} · {money(s.weekly)}/sem · até {fmt(s.until)}</small></div>
            </li>
          ))}
        </ul>
        <p className="g-mini">Empresas brasileiras reais. Os valores dos contratos são simulados pelo jogo. Novas propostas chegam com o passar dos dias.</p>
      </section>
    </>
  );
}
