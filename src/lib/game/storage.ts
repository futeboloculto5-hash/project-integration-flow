import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { CareerV2 } from "./career";
import { legacyClubs } from "./club-provider";

const LOCAL_KEY = "ccw-career-v2";
const accountKey = (userId: string) => `${LOCAL_KEY}:${userId}`;
export type SaveStatus = "idle" | "saving" | "saved" | "pending" | "error";
export type Loaded = { career: CareerV2 | null; rowId: string | null };
type Backup = { career: CareerV2; rowId: string; updatedAt: string; dirty: boolean };
type Writer = { pending: Backup | null; running: Promise<void> | null; timer: ReturnType<typeof setTimeout> | null; status: SaveStatus; listeners: Set<() => void>; attempts: number };
const writers = new Map<string, Writer>();
function writer(userId: string) {
  let state = writers.get(userId);
  if (!state) { state = { pending: null, running: null, timer: null, status: "idle", listeners: new Set(), attempts: 0 }; writers.set(userId, state); }
  return state;
}
function status(userId: string, value: SaveStatus) { const state = writer(userId); state.status = value; state.listeners.forEach((fn) => fn()); }
export function getSaveStatus(userId: string | null): SaveStatus { return userId ? writer(userId).status : "saved"; }
export function subscribeSave(userId: string | null, callback: () => void) {
  if (!userId) return () => {};
  const state = writer(userId); state.listeners.add(callback);
  return () => { state.listeners.delete(callback); };
}
function read<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; } }
function valid(c: CareerV2 | null | undefined): c is CareerV2 {
  return c?.version === 2 && typeof c.clubId === "string" && typeof c.manager === "string" && Array.isArray(c.squad) && Array.isArray(c.fixtures);
}
function localGuest() { const c = read<CareerV2>(LOCAL_KEY); return valid(c) ? c : null; }
function backup(userId: string) { const b = read<Backup>(accountKey(userId)); return b && valid(b.career) && typeof b.rowId === "string" ? b : null; }

// The synchronous write happens before any network request, including on page exit.
export function saveCareer(userId: string | null, rowId: string | null, c: CareerV2): Promise<string | null> {
  const snapshot = structuredClone(c);
  if (!userId) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot)); return Promise.resolve(null); }
    catch { return Promise.reject(new Error("Local save unavailable")); }
  }
  const previous = backup(userId);
  const id = rowId ?? previous?.rowId ?? crypto.randomUUID();
  const item: Backup = { career: snapshot, rowId: id, updatedAt: new Date().toISOString(), dirty: true };
  try { localStorage.setItem(accountKey(userId), JSON.stringify(item)); }
  catch { status(userId, "error"); return Promise.reject(new Error("Recovery copy unavailable")); }
  const state = writer(userId);
  state.pending = item;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  return flush(userId).then(() => id);
}
function flush(userId: string): Promise<void> {
  const state = writer(userId);
  if (state.running) return state.running;
  state.running = (async () => {
    status(userId, "saving");
    while (state.pending) {
      const item = state.pending;
      const c = item.career;
      const club = legacyClubs.get(c.clubId);
      const { data, error } = await supabase.from("careers").upsert({
        id: item.rowId, user_id: userId, club_id: c.clubId, club_name: club.name,
        season: c.season, current_date: `${c.date}T12:00:00Z`, balance: Math.round(c.balance),
        transfer_budget: Math.round(Math.max(c.balance, 0)), data: c as unknown as Json, updated_at: item.updatedAt,
      }, { onConflict: "id" }).select("id").single();
      if (error || !data) throw new Error("Cloud save unavailable");
      if (state.pending === item) {
        localStorage.setItem(accountKey(userId), JSON.stringify({ ...item, dirty: false }));
        state.pending = null;
      }
    }
    state.attempts = 0;
    status(userId, "saved");
  })().catch((error: unknown) => {
    status(userId, "pending");
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(state.attempts++, 5));
    state.timer = setTimeout(() => { state.timer = null; void flush(userId).catch(() => {}); }, delay);
    throw error;
  }).finally(() => { state.running = null; });
  return state.running;
}
export function retryCareerSave(userId: string | null) {
  if (!userId) return Promise.resolve();
  const state = writer(userId);
  if (!state.pending) { const b = backup(userId); if (b?.dirty) state.pending = b; }
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  return flush(userId);
}
export async function loadCareer(userId: string | null): Promise<Loaded> {
  if (!userId) return { career: localGuest(), rowId: null };
  const local = backup(userId);
  const { data, error } = await supabase.from("careers").select("id,data,updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) {
    if (local) { status(userId, "pending"); if (local.dirty) { writer(userId).pending = local; void retryCareerSave(userId).catch(() => {}); } return { career: local.career, rowId: local.rowId }; }
    throw new Error("Career load unavailable");
  }
  const cloud = (data ?? []).find((row) => valid(row.data as unknown as CareerV2));
  // Recover interrupted writes only for the same career, never replace another cloud career.
  if (local?.dirty && (!cloud || (cloud.id === local.rowId && local.updatedAt >= cloud.updated_at))) {
    writer(userId).pending = local;
    void retryCareerSave(userId).catch(() => {});
    return { career: local.career, rowId: local.rowId };
  }
  if (cloud) {
    const career = cloud.data as unknown as CareerV2;
    try { localStorage.setItem(accountKey(userId), JSON.stringify({ career, rowId: cloud.id, updatedAt: cloud.updated_at, dirty: false })); } catch { /* cloud copy remains intact */ }
    status(userId, "saved");
    return { career, rowId: cloud.id };
  }
  if (local) return { career: local.career, rowId: local.rowId };
  const guest = localGuest();
  if (guest) {
    // Retain the original guest save even if the network fails during import.
    try { const id = await saveCareer(userId, null, guest); return { career: guest, rowId: id }; }
    catch { return { career: guest, rowId: backup(userId)?.rowId ?? null }; }
  }
  return { career: null, rowId: null };
}
