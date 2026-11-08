import { Coins, HeartPulse, Target, Zap } from "lucide-react";
import { BUX_DAILY_CAP, BUX_GOALS, BUX_NOTICE, activeBuffs, buxItem, effectLines, goalProgress, type BuxAccount, type BuxItem } from "@/lib/game/bux";
import type { CareerV2 } from "@/lib/game/career";

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const BUFFS = ["energy_basic", "energy_pro", "medical_basic", "medical_pro"].map((id) => buxItem(id)).filter((x): x is BuxItem => !!x);
type Props = { career: CareerV2; day: string; account: BuxAccount | null; guest: boolean; loadError: boolean; busy: string | null; onBuy: (item: BuxItem) => void; onClaim: (goalId: string) => void; onRetry: () => void };

/** Parte visual da loja (sem acesso ao banco), para poder ser testada sozinha. */
export function BuxShopView({ career, day, account, guest, loadError, busy, onBuy, onClaim, onRetry }: Props) {
  const active = activeBuffs(career.buxBuffs ?? [], career.date);
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><Coins /> BUX <em className="g-src g-src-simulado">Fictício</em></h3>
        {guest ? <p className="g-mini">Entre na sua conta para guardar e usar Bux.</p>
          : loadError ? <><p className="g-mini">Não foi possível carregar o seu saldo.</p><button className="g-btn g-btn-sm" onClick={onRetry}>TENTAR DE NOVO</button></>
          : !account ? <p className="g-mini">Carregando…</p>
          : <p className="g-mini"><b>Saldo: {account.balance.toLocaleString("pt-BR")} Bux</b></p>}
        <p className="g-mini">{BUX_NOTICE}</p>
      </section>
      {account && (
        <section className="g-card">
          <h3 className="g-h"><Target /> METAS DE HOJE · {account.earnedToday}/{BUX_DAILY_CAP} Bux</h3>
          <ul className="g-offers">
            {BUX_GOALS.map((goal) => {
              const p = goalProgress(goal, career.buxDaily, day), claimed = account.claimedToday.includes(goal.id), capped = account.earnedToday + goal.amount > BUX_DAILY_CAP;
              const label = claimed ? "RESGATADO" : !p.done ? "EM ANDAMENTO" : capped ? "LIMITE DIÁRIO" : `RESGATAR +${goal.amount}`;
              return (
                <li key={goal.id}>
                  <span className="g-logo-co"><Target /></span>
                  <div><b>{goal.name}</b><small>{p.value}/{p.target} · <strong>+{goal.amount} Bux</strong></small></div>
                  <div className="g-offer-act"><button className="g-btn g-btn-sm" disabled={claimed || !p.done || capped || busy !== null} onClick={() => onClaim(goal.id)}>{busy === goal.id ? "RESGATANDO…" : label}</button></div>
                </li>
              );
            })}
          </ul>
          <p className="g-mini">As metas valem por dia e renovam à meia-noite (horário de Brasília). O máximo é {BUX_DAILY_CAP} Bux por dia.</p>
        </section>
      )}
      {account && (
        <section className="g-card">
          <h3 className="g-h"><Zap /> ENERGIA E DEPARTAMENTO MÉDICO</h3>
          <ul className="g-offers">
            {BUFFS.map((item) => {
              const on = active.find((b) => b.itemId === item.id);
              return (
                <li key={item.id}>
                  <span className="g-logo-co">{item.kind === "energy_buff" ? <Zap /> : <HeartPulse />}</span>
                  <div>
                    <b>{item.name}</b>
                    <small>{effectLines(item).join(" · ")} · {item.durationDays} dias · <strong>{item.amount} Bux</strong>{on ? ` · ativo até ${fmt(on.until)}` : ""}</small>
                  </div>
                  <div className="g-offer-act">
                    <button className="g-btn g-btn-sm" disabled={busy !== null || account.balance < item.amount} onClick={() => onBuy(item)}>{busy === item.id ? "COMPRANDO…" : on ? "ESTENDER" : "COMPRAR"}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
