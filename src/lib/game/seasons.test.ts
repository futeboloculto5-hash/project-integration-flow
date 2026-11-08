import { describe, expect, it } from 'vitest';
import { advanceDay, advanceToMatch, completeRound, createCareer, ensureFields, nextFixture, type CareerV2 } from './career';
import { allFixtures, applySeasonReference, divisionOf, initializeSeason, leaders, recordFixture, roundRobin, seasonFinished, seasonTable, simulateDue, startNextSeason, type SeasonReference } from './seasons';
import { createMatch, createTeam, makeSquad, step } from '@/lib/match/engine';

function fresh() { return ensureFields(createCareer('Temporadas','flamengo')); }
function finish(c: CareerV2) {
  for (const f of c.fixtures) recordFixture(c,f,f.home === c.clubId ? 0 : 2,f.away === c.clubId ? 0 : 2);
  for (let i=0;i<4;i++) { for (const f of c.seasonState?.cup ?? []) recordFixture(c,f,1,1); simulateDue(c,'2026-12-31'); }
  return c;
}
describe('Functional seasons', () => {
  it('generates 38 rounds with 380 fixtures, each opponent once at each venue', () => {
    const ids = Array.from({length:20},(_,i)=>`club${i}`), f = roundRobin(ids,'2027','A');
    expect(f).toHaveLength(380); expect(new Set(f.map(x=>x.round)).size).toBe(38);
    expect(new Set(f.map(x=>`${x.home}:${x.away}`)).size).toBe(380);
    expect(f.filter(x=>x.home==='club0')).toHaveLength(19); expect(f.filter(x=>x.away==='club0')).toHaveLength(19);
    expect(f[0]?.date).toBe('2027-03-29');
  });
  it('preserves old results and squads and does not apply migration twice', () => {
    const old = createCareer('Antigo','flamengo'); const f=old.fixtures[0]; if (!f) throw Error('fixture'); f.hg=3; f.ag=2;
    const next = initializeSeason(old);
    expect(next.fixtures.slice(0,380)).toEqual(old.fixtures); expect(next.squad).toEqual(old.squad);
    expect(initializeSeason(next)).toBe(next); expect(next.fixtures).toHaveLength(760);
  });
  it('blocks match-day advancement, simulates AI dates and records the user score only once', () => {
    let c = advanceToMatch(fresh()); const nf=nextFixture(c); if (!nf) throw Error('fixture');
    expect(advanceDay(c).blocked).toBeDefined();
    c=completeRound(c,3,1); const saved=allFixtures(c).find(f=>f.home===nf.home&&f.away===nf.away&&f.round===nf.round&&f.competition===nf.competition);
    expect(saved?.hg).toBe(3); expect(saved?.ag).toBe(1);
    if (!saved) throw Error('saved'); recordFixture(c,saved,8,9); expect(saved.hg).toBe(3);
    expect(c.fixtures.some(f=>f.home!==c.clubId&&f.away!==c.clubId&&f.hg!=null)).toBe(true);
  });
  it('uses wins=3, draws=1 and excludes cup results from league standings', () => {
    const c=fresh(); const f=c.fixtures.find(x=>x.home===c.clubId); if (!f) throw Error('fixture'); recordFixture(c,f,2,0);
    const cup=c.seasonState?.cup[0]; if (!cup) throw Error('cup'); recordFixture(c,cup,8,1);
    expect(seasonTable(c).find(r=>r.clubId===c.clubId)?.pts).toBe(3);
    expect(seasonTable(c).reduce((s,r)=>s+r.p,0)).toBe(2);
  });
  it('retains precise scorers and assists and does not fabricate old match events', () => {
    const c=fresh(), f=c.fixtures[0]; if (!f) throw Error('fixture');
    recordFixture(c,f,1,0,[{clubId:f.home,playerId:'scorer',player:'Atacante',assistId:'passer',assist:'Meia',minute:42}]);
    expect(leaders([f]).find(p=>p.playerId==='scorer')?.goals).toBe(1);
    expect(leaders([f]).find(p=>p.playerId==='passer')?.assists).toBe(1);
    const old={...f}; delete old.goals; expect(leaders([old])).toHaveLength(0);
  });
  it('resolves 15 knockout games including penalties and one champion', () => {
    const c=finish(fresh()); expect(c.seasonState?.cup).toHaveLength(15);
    expect(c.seasonState?.cup.filter(f=>f.round===4)).toHaveLength(1);
    expect(c.seasonState?.cup.every(f=>f.winner&&f.penalties)).toBe(true); expect(seasonFinished(c)).toBe(true);
  });
  it('relegates 4, promotes 4, archives scores and keeps the manager at the same club', () => {
    const c=finish(fresh()); const result=startNextSeason(c).career;
    expect(result.season).toBe('2026'); expect(result.clubId).toBe('flamengo'); expect(result.manager).toBe('Temporadas');
    expect(result.seasonState?.history[0]?.relegated).toHaveLength(4); expect(result.seasonState?.history[0]?.promoted).toHaveLength(4);
    expect(result.seasonState?.history[0]?.fixtures).toEqual(c.fixtures);
    expect(divisionOf(result)).toBe('B'); expect(result.seasonState?.divisions['A']).toHaveLength(20);
    expect(result.fixtures.every(f=>f.hg==null)).toBe(true); expect(result.squad[0]?.age).toBe((c.squad[0]?.age??0)+1);
    const ai=Object.keys(c.otherSquads??{})[0]; if (!ai) throw Error('AI'); expect(result.otherSquads?.[ai]?.[0]?.age).toBe((c.otherSquads?.[ai]?.[0]?.age??0)+1);
  });
  it('refuses rollover before all competitions finish', () => { expect(startNextSeason(fresh()).error).toBeDefined(); });
  it('does not overwrite simulated scores with official references', () => {
    const c=finish(fresh()); const reference:SeasonReference={year:'2025',source:'API-Football',verifiedAt:null,fixtures:[],standings:[],scorers:[],assists:[],unavailable:['fixtures']};
    const next=applySeasonReference(c,reference); expect(next.fixtures).toEqual(c.fixtures); expect(next.seasonState?.reference?.unavailable).toEqual(['fixtures']);
  });
  it('manages the away side while AI changes only the home opponent, retaining every live goal', () => {
    let m=createMatch(createTeam('Home','H','',80,makeSquad('h',80)),createTeam('Away','A','',80,makeSquad('a',80)),'away-test','away');
    for(let i=0;i<400&&!m.finished;i++) { if(m.paused)m={...m,paused:false}; m=step(m); }
    expect(m.finished).toBe(true); expect(m.managedSide).toBe('away'); expect(m.away.mentality).toBe('equilibrada');
    expect(m.goals.length).toBe(m.score.home+m.score.away); expect(m.events.filter(e=>e.type==='tactic').every(e=>e.side==='home')).toBe(true);
  });
});
describe('Metas diárias de Bux na carreira', () => {
  it('uma partida do usuário alimenta o progresso do dia e não altera a carreira original', () => {
    const c0 = advanceToMatch(fresh()), snapshot = structuredClone(c0);
    const nf = nextFixture(c0); if (!nf) throw Error('fixture');
    const my = nf.home === c0.clubId ? [3, 0] : [0, 3]; // vitória por 3 a 0 do usuário
    const c1 = completeRound(c0, my[0]!, my[1]!, undefined, '2026-11-08');
    expect(c1.buxDaily).toMatchObject({ day: '2026-11-08', played: 1, wins: 1, goals: 3, cleanSheets: 1, seasons: 0 });
    expect(c0).toEqual(snapshot); expect(c0.buxDaily).toBeUndefined();
  });
  it('em outro dia real o progresso recomeça do zero', () => {
    let c = advanceToMatch(fresh()); const nf = nextFixture(c); if (!nf) throw Error('fixture');
    const win = nf.home === c.clubId ? [1, 0] : [0, 1];
    c = completeRound(c, win[0]!, win[1]!, undefined, '2026-11-08');
    c = advanceToMatch(c); const n2 = nextFixture(c); if (!n2) throw Error('fixture');
    const loss = n2.home === c.clubId ? [0, 2] : [2, 0];
    c = completeRound(c, loss[0]!, loss[1]!, undefined, '2026-11-09');
    expect(c.buxDaily).toMatchObject({ day: '2026-11-09', played: 1, wins: 0, goals: 0 });
  });
  it('terminar a temporada conta uma vez e só no dia em que terminou', () => {
    const done = finish(fresh());
    const r = startNextSeason(done, '2026-11-08');
    expect(r.error).toBeUndefined(); expect(r.career.buxDaily).toMatchObject({ day: '2026-11-08', seasons: 1 });
  });
  it('carreira antiga, sem o campo, continua funcionando', () => {
    const old = advanceToMatch(fresh()); delete (old as { buxDaily?: unknown }).buxDaily;
    expect(() => completeRound(old, 1, 0, undefined, '2026-11-08')).not.toThrow();
  });
});
