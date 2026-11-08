import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, ChevronRight, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type Club } from "@/lib/game/clubs";
import { legacyClubs } from "@/lib/game/club-provider";
import { money } from "@/lib/game/career";
import { brDay, buxItem, clubUnlockId, isClubAvailable, type BuxAccount } from "@/lib/game/bux";
import { BUX_ERROR_TEXT, buxPurchase, loadBuxAccount } from "@/lib/game/bux-storage";

export function Crest({ club, size = 44 }: { club: Club; size?: number }) {
  return (
    <span className="g-crest" style={{ ["--c1" as string]: club.color, ["--c2" as string]: club.color2, width: size, height: size, fontSize: size * 0.3 }}>
      {club.short}
    </span>
  );
}

export function Onboarding({ onStart, busy, userId = null }: { onStart: (manager: string, clubId: string) => void; busy: boolean; userId?: string | null }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState<string | null>(null);
  const club = legacyClubs.list().find((c) => c.id === clubId);
  // Os 4 clubes mais fracos são grátis; os demais ficam bloqueados até serem desbloqueados com Bux (moeda fictícia).
  const [account, setAccount] = useState<BuxAccount | null>(null);
  const [reload, setReload] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const unlockKey = useRef(new Map<string, string>());
  useEffect(() => {
    if (!userId) return;
    let off = false;
    loadBuxAccount(supabase, userId, brDay()).then((a) => { if (!off) setAccount(a); }).catch(() => { /* sem leitura, só os clubes grátis ficam liberados */ });
    return () => { off = true; };
  }, [userId, reload]);
  const unlocked = account?.unlocked ?? [];
  const locked = (id: string) => !isClubAvailable(unlocked, id);
  const unlockItem = club ? buxItem(clubUnlockId(club.id)) : undefined;
  const unlock = async () => {
    if (!unlockItem) return;
    const key = unlockKey.current.get(unlockItem.id) ?? `buy:${unlockItem.id}:${crypto.randomUUID()}`;
    unlockKey.current.set(unlockItem.id, key); setUnlocking(true);
    const r = await buxPurchase(supabase, unlockItem.id, key);
    setUnlocking(false);
    if (!r.ok) { if (r.error !== "network") unlockKey.current.delete(unlockItem.id); toast.error(BUX_ERROR_TEXT[r.error]); return; }
    unlockKey.current.delete(unlockItem.id); toast.success(`${unlockItem.name.replace("Desbloquear ", "")} desbloqueado`); setReload((n) => n + 1);
  };
  const stars = (r: number) => "★".repeat(Math.max(1, Math.round((r - 66) / 4))).padEnd(5, "☆");

  return (
    <main className="g-onb">
      <div className="g-onb-head">
        <div className="g-logo"><Trophy /> CLUBE CAMPEÃO <span>WORLD</span></div>
        <div className="g-steps">{[1, 2, 3].map((n) => <i key={n} className={step >= n ? "on" : ""} />)}</div>
      </div>

      {step === 1 && (
        <section className="g-onb-card">
          <h1 className="g-title">NOVA CARREIRA</h1>
          <p className="g-sub">Qual é o nome do técnico?</p>
          <input className="g-input" autoFocus maxLength={28} placeholder="Ex.: Rafael Costa" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && setStep(2)} />
          <button className="g-btn g-btn-big" disabled={name.trim().length < 2} onClick={() => setStep(2)}>CONTINUAR <ChevronRight /></button>
        </section>
      )}

      {step === 2 && (
        <section className="g-onb-wide">
          <h1 className="g-title">ESCOLHA SEU CLUBE</h1>
          <p className="g-sub">Brasileirão Série A 2025 · {legacyClubs.list().length} clubes</p>
          <div className="g-club-grid">
            {legacyClubs.list().map((c) => (
              <button key={c.id} className={`g-club ${clubId === c.id ? "g-club-on" : ""}`} onClick={() => setClubId(c.id)}>
                <Crest club={c} />
                <b>{c.name}</b>
                <span className="g-stars">{stars(c.rating)}</span>
                {locked(c.id) && <span className="g-stars"><Lock size={11} /> {buxItem(clubUnlockId(c.id))?.amount} Bux</span>}
              </button>
            ))}
          </div>
          {club && locked(club.id) && unlockItem && (
            <p className="g-mini">
              {club.name} está bloqueado. Desbloqueie por <b>{unlockItem.amount} Bux</b> (moeda fictícia do jogo).{" "}
              {!userId ? "Entre na sua conta para usar Bux." : account ? `Seu saldo: ${account.balance} Bux.` : "Carregando seu saldo…"}{" "}
              {userId && account && <button className="g-btn g-btn-sm" disabled={unlocking || account.balance < unlockItem.amount} onClick={unlock}>{unlocking ? "DESBLOQUEANDO…" : `DESBLOQUEAR · ${unlockItem.amount} Bux`}</button>}
            </p>
          )}
          <div className="g-sticky">
            <button className="g-btn g-btn-ghost" onClick={() => setStep(1)}>VOLTAR</button>
            <button className="g-btn g-btn-big" disabled={!clubId || (!!club && locked(club.id))} onClick={() => setStep(3)}>CONFIRMAR <ChevronRight /></button>
          </div>
        </section>
      )}

      {step === 3 && club && (
        <section className="g-onb-card">
          <Crest club={club} size={96} />
          <h1 className="g-title">{club.name.toUpperCase()}</h1>
          <div className="g-facts">
            <div><span>Técnico</span><b>{name.trim()}</b></div>
            <div><span>Estádio</span><b>{club.stadium}</b></div>
            <div><span>Força</span><b className="g-stars">{stars(club.rating)}</b></div>
            <div><span>Orçamento</span><b>{money(club.budget)}</b></div>
          </div>
          <p className="g-warn"><Lock /> Esta escolha é definitiva: você não poderá trocar de clube nesta carreira.</p>
          <button className="g-btn g-btn-big" disabled={busy || locked(club.id)} onClick={() => onStart(name.trim(), club.id)}>{busy ? "PREPARANDO ELENCO…" : "ASSINAR CONTRATO"}</button>
          <button className="g-btn g-btn-ghost" disabled={busy} onClick={() => setStep(2)}>ESCOLHER OUTRO</button>
        </section>
      )}
    </main>
  );
}
