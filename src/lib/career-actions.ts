import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type CareerState = {
  version: 1;
  clubId: string;
  clubName: string;
  season: string;
  currentDate: string;
  balance: number;
  transferBudget: number;
  roster: unknown[];
  events: unknown[];
  results: unknown[];
  standings: unknown[];
};

export type Career = {
  id: string;
  userId: string;
  clubId: string;
  clubName: string;
  season: string;
  currentDate: Date;
  balance: number;
  transferBudget: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type Row = {
  id: string;
  user_id: string;
  club_id: string;
  club_name: string;
  season: string;
  current_date: string;
  balance: number;
  transfer_budget: number;
  data: Json | null;
  created_at: string;
  updated_at: string;
};

function toCareer(r: Row): Career {
  return {
    id: r.id,
    userId: r.user_id,
    clubId: r.club_id,
    clubName: r.club_name,
    season: r.season,
    currentDate: new Date(r.current_date),
    balance: Number(r.balance),
    transferBudget: Number(r.transfer_budget),
    data: r.data,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

async function getUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Unauthorized");
  return id;
}

function normalizeState(input: Partial<CareerState>, fallback: CareerState): CareerState {
  return {
    version: 1,
    clubId: input.clubId ?? fallback.clubId,
    clubName: input.clubName ?? fallback.clubName,
    season: input.season ?? fallback.season,
    currentDate: input.currentDate ?? fallback.currentDate,
    balance: Number.isFinite(input.balance) ? Number(input.balance) : fallback.balance,
    transferBudget: Number.isFinite(input.transferBudget) ? Number(input.transferBudget) : fallback.transferBudget,
    roster: Array.isArray(input.roster) ? input.roster : fallback.roster,
    events: Array.isArray(input.events) ? input.events : fallback.events,
    results: Array.isArray(input.results) ? input.results : fallback.results,
    standings: Array.isArray(input.standings) ? input.standings : fallback.standings,
  };
}

function fallbackFrom(c: Career): CareerState {
  return normalizeState((c.data ?? {}) as Partial<CareerState>, {
    version: 1, clubId: c.clubId, clubName: c.clubName, season: c.season,
    currentDate: c.currentDate.toISOString(), balance: c.balance, transferBudget: c.transferBudget,
    roster: [], events: [], results: [], standings: [],
  });
}

export async function listCareers(): Promise<Career[]> {
  const userId = await getUserId();
  const { data, error } = await supabase.from("careers").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toCareer);
}

export async function getCareer(id: string): Promise<Career | null> {
  await getUserId();
  const { data, error } = await supabase.from("careers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toCareer(data as Row) : null;
}

export async function createCareer(input: { clubId: string; clubName: string; season?: string; balance?: number; transferBudget?: number; data?: Partial<CareerState> }) {
  const userId = await getUserId();
  const now = new Date();
  const state = normalizeState(input.data ?? {}, {
    version: 1, clubId: input.clubId, clubName: input.clubName, season: input.season ?? "2025",
    currentDate: now.toISOString(), balance: input.balance ?? 42800000, transferBudget: input.transferBudget ?? 12000000,
    roster: [], events: [], results: [], standings: [],
  });
  const { data, error } = await supabase.from("careers").insert({
    user_id: userId, club_id: state.clubId, club_name: state.clubName, season: state.season,
    current_date: state.currentDate, balance: state.balance, transfer_budget: state.transferBudget, data: state as unknown as Json,
  }).select("*").single();
  if (error) throw error;
  return toCareer(data as Row);
}

export async function saveCareer(id: string, input: Partial<CareerState>) {
  const current = await getCareer(id);
  if (!current) throw new Error("Career not found");
  const state = normalizeState(input, fallbackFrom(current));
  const { data, error } = await supabase.from("careers").update({
    club_id: state.clubId, club_name: state.clubName, season: state.season, current_date: state.currentDate,
    balance: state.balance, transfer_budget: state.transferBudget, data: state as unknown as Json, updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error) throw error;
  return toCareer(data as Row);
}

export async function advanceCareerDay(id: string) {
  const career = await getCareer(id);
  if (!career) throw new Error("Career not found");
  const current = fallbackFrom(career);
  const next = new Date(current.currentDate);
  next.setUTCDate(next.getUTCDate() + 1);
  return saveCareer(id, { currentDate: next.toISOString(), events: [...current.events, { type: "day_advanced", date: next.toISOString() }] });
}

export async function deleteCareer(id: string) {
  await getUserId();
  const { error } = await supabase.from("careers").delete().eq("id", id);
  if (error) throw error;
}
