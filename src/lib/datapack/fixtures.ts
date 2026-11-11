// Dados SINTÉTICOS só para testes. Nomes são placeholders ("Clube Teste 001"); nada aqui representa jogador, clube ou competição reais.
// Não é importado por nenhum código do jogo.
import type { Datapack } from "./types";

export function testPack(opts: { clubs?: number; playersPerClub?: number } = {}): Datapack {
  const clubsN = opts.clubs ?? 2, perClub = opts.playersPerClub ?? 2;
  const pad = (n: number, w = 3) => String(n).padStart(w, "0");
  const clubs: Datapack["clubs"] = Array.from({ length: clubsN }, (_, i) => ({
    id: `club:teste-${pad(i + 1)}`, name: `Clube Teste ${pad(i + 1)}`, countryId: "ctry:teste-a", rating: 50 + (i % 40), dataStatus: "simulado" as const,
  }));
  const players: Datapack["players"] = clubs.flatMap((c, i) => Array.from({ length: perClub }, (_, j) => ({
    id: `plr:teste-${pad(i + 1)}-${pad(j + 1)}` as const, name: `Jogador Teste ${pad(i + 1)}-${pad(j + 1)}`, position: (["GK", "CB", "CM", "ST"] as const)[j % 4]!,
    clubId: c.id, overall: 40 + ((i + j) % 50), age: 18 + (j % 20), dataStatus: "simulado" as const,
  })));
  return {
    manifest: {
      schema: "ccw.datapack", schemaVersion: 1, packId: "pacote-teste", version: "1.0.0", name: "Pacote de teste sintético",
      createdAt: "2026-11-08", origin: "teste", counts: { countries: 1, competitions: 1, clubs: clubs.length, players: players.length, editions: 1 },
    },
    countries: [{ id: "ctry:teste-a", name: "País Teste A", dataStatus: "simulado" }],
    competitions: [{ id: "comp:teste-liga", name: "Liga Teste", countryId: "ctry:teste-a", kind: "league", tier: 1, dataStatus: "simulado" }],
    editions: [{ competitionId: "comp:teste-liga", season: "2026", clubIds: clubs.map((c) => c.id), dataStatus: "simulado" }],
    clubs, players,
  };
}

/**
 * Pacote SINTÉTICO que cobre clubes do jogo (por legacyId) com elencos completos inventados — usado para provar que os sistemas do jogo
 * funcionam com jogadores importados. Declara-se "comunitario" só para passar pela política de pacotes reais; a fonte diz que é gerador de testes.
 * Nenhum nome, clube ou número aqui representa dado real.
 */
export function syntheticSquadPack(opts: { clubs: string[]; version?: string; squad?: number; free?: number; packId?: string; bump?: number } = { clubs: [] }): Datapack {
  const squadN = opts.squad ?? 26, freeN = opts.free ?? 6, bump = opts.bump ?? 0;
  const POS = ["GK", "GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "LB", "RB", "DM", "CM", "CM", "CM", "AM", "AM", "LM", "RM", "LW", "RW", "ST", "ST", "CF", "ST", "CF", "CB", "CM"] as const;
  const country = "ctry:sint-brasil" as const;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clubs: Datapack["clubs"] = opts.clubs.map((legacyId) => ({ id: `club:sint-${legacyId}` as const, name: `Clube Sintético ${legacyId}`, countryId: country, legacyId, dataStatus: "simulado" as const }));
  const players: Datapack["players"] = [];
  opts.clubs.forEach((legacyId) => {
    // derivado do nome do clube (não da posição na lista): o mesmo clube tem os mesmos jogadores em pacotes diferentes
    const ci = [...legacyId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1000, 7);
    for (let i = 0; i < squadN; i++) {
      players.push({ id: `plr:sint-${legacyId}-${pad(i + 1)}` as const, name: `Atleta Sintético ${legacyId} ${pad(i + 1)}`, position: POS[i % POS.length]!, clubId: `club:sint-${legacyId}`,
        overall: Math.min(95, 58 + ((ci * 3 + i * 7) % 24) + bump), age: 19 + ((i * 5 + ci) % 16), dataStatus: "simulado" });
    }
  });
  for (let i = 0; i < freeN; i++) players.push({ id: `plr:sint-livre-${pad(i + 1)}` as const, name: `Atleta Sintético Livre ${pad(i + 1)}`, position: POS[(i * 3) % POS.length]!, overall: 55 + i * 2 + bump, age: 24 + i, dataStatus: "simulado" });
  return {
    manifest: {
      schema: "ccw.datapack", schemaVersion: 1, packId: opts.packId ?? "pacote-sintetico", version: opts.version ?? "1.0.0", name: "Pacote sintético de integração",
      createdAt: "2026-11-10", origin: "comunitario", source: { name: "Gerador sintético dos testes (não são dados reais)", license: "Uso interno de testes" },
      counts: { countries: 1, competitions: 1, clubs: clubs.length, players: players.length, editions: 1 },
    },
    countries: [{ id: country, name: "País Sintético", confederation: "CONMEBOL", dataStatus: "simulado" }],
    competitions: [{ id: "comp:sint-liga", name: "Liga Sintética", countryId: country, kind: "league", tier: 1, dataStatus: "simulado" }],
    editions: [{ competitionId: "comp:sint-liga", season: "2026", clubIds: clubs.map((c) => c.id), dataStatus: "simulado" }],
    clubs, players,
  };
}
