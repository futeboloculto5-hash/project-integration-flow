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
