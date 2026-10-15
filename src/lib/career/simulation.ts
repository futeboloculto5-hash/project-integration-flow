export type ClubProfile = {
  id: string
  name: string
  budget: number
  wageBudget: number
  squad: Array<{ id: string; position: string; rating: number; wage: number }>
  needs: string[]
  strategy: 'ambitious' | 'balanced' | 'economical'
}

export type SimulationEvent = {
  type: 'scouting' | 'proposal' | 'transfer' | 'rejected'
  date: string
  clubId: string
  targetId?: string
  message: string
}

export type MarketTarget = { id: string; name: string; clubId: string; position: string; rating: number; value: number; wage: number }

function seededRandom(seed: string) {
  let value = 0
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

export function rankTargets(club: ClubProfile, targets: MarketTarget[]) {
  return targets
    .filter((target) => target.clubId !== club.id && club.needs.includes(target.position) && target.value <= club.budget)
    .map((target) => ({ target, score: target.rating * 3 - target.value / Math.max(club.budget, 1) * 20 - target.wage / Math.max(club.wageBudget, 1) * 10 }))
    .sort((a, b) => b.score - a.score)
}

export function processClubMarket(club: ClubProfile, targets: MarketTarget[], date: string, cycle: number): SimulationEvent[] {
  const random = seededRandom(`${club.id}:${date}:${cycle}`)
  const ranked = rankTargets(club, targets)
  if (!ranked.length || random() > (club.strategy === 'ambitious' ? 0.8 : club.strategy === 'economical' ? 0.35 : 0.55)) {
    return [{ type: 'scouting', date, clubId: club.id, message: `${club.name} analisou o mercado sem enviar proposta.` }]
  }
  const target = ranked[0].target
  const offered = Math.round(target.value * (0.92 + random() * 0.2))
  if (offered < target.value * 0.85) return [{ type: 'rejected', date, clubId: club.id, targetId: target.id, message: `${club.name} desistiu de ${target.name}: valor fora do orçamento.` }]
  return [{ type: 'proposal', date, clubId: club.id, targetId: target.id, message: `${club.name} enviou proposta por ${target.name}.` }]
}

export function advanceSimulation(clubs: ClubProfile[], targets: MarketTarget[], date: string, cycle = 0) {
  const events = clubs.flatMap((club) => processClubMarket(club, targets, date, cycle))
  return { date, cycle, events }
}

export function simulateMatch(homeRating: number, awayRating: number, seed: string) {
  const random = seededRandom(seed)
  const homeGoals = Math.max(0, Math.floor(random() * 3 + (homeRating - awayRating) / 30))
  const awayGoals = Math.max(0, Math.floor(random() * 3 + (awayRating - homeRating) / 35))
  return { homeGoals, awayGoals }
}

export type StandingRow = { played: number; wins: number; draws: number; losses: number; points: number; scored: number; conceded: number }

export function compareStandings(a: StandingRow, b: StandingRow) {
  return b.points - a.points || b.wins - a.wins || (b.scored - b.conceded) - (a.scored - a.conceded) || b.scored - a.scored
}

export function applyStandingsResult(standings: Record<string, Partial<StandingRow>>, homeId: string, awayId: string, homeGoals: number, awayGoals: number) {
  const next = structuredClone(standings) as Record<string, StandingRow>
  for (const id of [homeId, awayId]) next[id] = { played: 0, wins: 0, draws: 0, losses: 0, points: 0, scored: 0, conceded: 0, ...next[id] }
  next[homeId].played += 1; next[awayId].played += 1
  next[homeId].scored += homeGoals; next[homeId].conceded += awayGoals
  next[awayId].scored += awayGoals; next[awayId].conceded += homeGoals
  if (homeGoals > awayGoals) { next[homeId].points += 3; next[homeId].wins += 1; next[awayId].losses += 1 }
  else if (awayGoals > homeGoals) { next[awayId].points += 3; next[awayId].wins += 1; next[homeId].losses += 1 }
  else { next[homeId].points += 1; next[awayId].points += 1; next[homeId].draws += 1; next[awayId].draws += 1 }
  return next
}
