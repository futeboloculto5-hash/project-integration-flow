import { Coins, HeartPulse, Zap } from "lucide-react";
import { BUX_CATALOG, BUX_NOTICE, activeBuffs, effectLines, type BuxAccount, type BuxItem } from "@/lib/game/bux";
import type { CareerV2 } from "@/lib/game/career";

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
type Props = { career: CareerV2; account: BuxAccount | null; guest: boolean; loadError: boolean; busy: string | null; onBuy: (item: BuxItem) => void; onWelcome: () => void; onRetry: () => void };

/** Parte visual da loja (sem acesso ao banco), para poder ser testada sozinha. */
export function BuxShopView({ career, account, guest, loadError, busy, onBuy, onWelcome, onRetry }: Props) {
  const active = activeBuffs(career.buxBuffs ?? [], career.date);
  return (
    <>
      <section className="g-card">
        <h3 className="g-h"><Coins /> BUX <em className="g-src g-src-simulado">Fictício</em></h3>
        {guest ? <p className="g-mini">Entre na sua conta para guardar e usar Bux.</p>
          : loadError ? <><p className="g-mini">Não foi possível carregar o seu saldo.</p><button className="g-btn g-btn-sm" onClick={onRetry}>TENTAR DE NOVO</button></>
          : !account ? <p className="g-mini">Carregando…</p>
          : <>
            <p className="g-mini"><b>Saldo: {account.balance.toLocaleString("pt-BR")} Bux</b></p>
            {!account.welcomeClaimed && <button className="g-btn g-btn-sm" disabled={busy !== null} onClick={onWelcome}>RESGATAR BOAS-VINDAS · +100 Bux</button>}
          </>}
        <p className="g-mini">{BUX_NOTICE}</p>
      </section>
      {account && (
        <section className="g-card">
          <h3 className="g-h"><Zap /> ENERGIA E DEPARTAMENTO MÉDICO</h3>
          <ul className="g-offers">
            {BUX_CATALOG.filter((i) => i.kind === "energy_buff" || i.kind === "medical_buff").map((item) => {
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
