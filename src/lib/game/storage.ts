import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CareerV2 } from "./career";
import { clubById } from "./clubs";

const LOCAL_KEY = "ccw-career-v2";

export type Loaded = { career: CareerV2 | null; rowId: string | null };

export async function loadCareer(userId: string | null): Promise<Loaded> {
  if (userId) {
    const { data, error } = await supabase.from("careers").select("id,data").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) throw error;
    const v2 = (data ?? []).find((r) => (r.data as { version?: number } | null)?.version === 2);
    if (v2) return { career: v2.data as unknown as CareerV2, rowId: v2.id };
    // carry a guest career into the account
    const local = readLocal();
    if (local) {
      const rowId = await saveCareer(userId, null, local);
      localStorage.removeItem(LOCAL_KEY);
      return { career: local, rowId };
    }
    return { career: null, rowId: null };
  }
  return { career: readLocal(), rowId: null };
}

function readLocal(): CareerV2 | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const c = raw ? (JSON.parse(raw) as CareerV2) : null;
    return c?.version === 2 ? c : null;
  } catch { return null; }
}

export async function saveCareer(userId: string | null, rowId: string | null, c: CareerV2): Promise<string | null> {
  if (!userId) { localStorage.setItem(LOCAL_KEY, JSON.stringify(c)); return null; }
  const club = clubById(c.clubId);
  const row = {
    club_id: c.clubId, club_name: club.name, season: c.season, current_date: `${c.date}T12:00:00Z`,
    balance: Math.round(c.balance), transfer_budget: Math.round(Math.max(c.balance, 0)), data: c as unknown as Json, updated_at: new Date().toISOString(),
  };
  if (rowId) {
    const { error } = await supabase.from("careers").update(row).eq("id", rowId);
    if (error) throw error;
    return rowId;
  }
  const { data, error } = await supabase.from("careers").insert({ ...row, user_id: userId }).select("id").single();
  if (error) throw error;
  return data.id;
}
