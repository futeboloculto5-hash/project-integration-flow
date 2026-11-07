import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startBuff, type BuxAccount, type BuxItem } from "@/lib/game/bux";
import { BUX_ERROR_TEXT, buxClaimWelcome, buxPurchase, loadBuxAccount } from "@/lib/game/bux-storage";
import type { CareerV2 } from "@/lib/game/career";
import { BuxShopView } from "./bux-shop-view";

export function BuxShop({ career, update, userId }: { career: CareerV2; update: (c: CareerV2) => void; userId: string | null }) {
  const [account, setAccount] = useState<BuxAccount | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(career); latest.current = career;
  const keys = useRef(new Map<string, string>()); // chave por item: repetir após falha de rede não cobra duas vezes

  useEffect(() => {
    if (!userId) return;
    let off = false; setLoadError(false);
    loadBuxAccount(supabase, userId).then((a) => { if (!off) setAccount(a); }).catch(() => { if (!off) setLoadError(true); });
    return () => { off = true; };
  }, [userId, attempt]);

  const buy = async (item: BuxItem) => {
    const key = keys.current.get(item.id) ?? `buy:${item.id}:${crypto.randomUUID()}`;
    keys.current.set(item.id, key); setBusy(item.id);
    const r = await buxPurchase(supabase, item.id, key);
    setBusy(null);
    if (!r.ok) { if (r.error !== "network") keys.current.delete(item.id); toast.error(BUX_ERROR_TEXT[r.error]); return; }
    keys.current.delete(item.id);
    if (r.duplicate) { toast("Esta compra já estava registrada."); setAttempt((n) => n + 1); return; }
    update({ ...latest.current, buxBuffs: startBuff(latest.current.buxBuffs ?? [], item.id, latest.current.date) });
    toast.success(`${item.name} ativado`); setAttempt((n) => n + 1);
  };
  const welcome = async () => {
    setBusy("welcome");
    const r = await buxClaimWelcome(supabase);
    setBusy(null);
    if (!r.ok) { toast.error(BUX_ERROR_TEXT[r.error]); return; }
    toast.success(r.duplicate ? "Boas-vindas já resgatadas." : "+100 Bux"); setAttempt((n) => n + 1);
  };
  return <BuxShopView career={career} account={account} guest={!userId} loadError={loadError} busy={busy} onBuy={buy} onWelcome={welcome} onRetry={() => setAttempt((n) => n + 1)} />;
}
