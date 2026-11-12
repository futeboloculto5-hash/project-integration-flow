// Filtro e nomes de jogo para o catálogo de competições do API-Football.
// Regras do dono do projeto: só futebol MASCULINO e adulto; dos estaduais, só a primeira divisão.
// Tudo é decidido por regras explícitas sobre o nome (o API não informa gênero nem categoria); o que sai é listado com o motivo,
// para revisão humana. Nada é adivinhado em silêncio.
import type { ApiCatalog, CatalogLeague } from "./api-football-catalog";

const FEMALE = /\b(women|womens|woman|femin\w*|femen\w*|f[eé]minine|femmes?|frauen|femminile|vrouwen|kobiet\w*|ladies|girls?|nwsl|wsl|damallsvenskan|toppserien|liga f|shebelieves cup|algarve cup)\b/i;
const YOUTH = /(\bu[- ]?\d{2}\b|\bunder[- ]?\d{2}\b|\bsub[- ]?\d{2}\b|\byouth\b|\bjunior\w*|\bjuvenil\w*|\bjuniores\b|\bprimavera\b|\baspirantes\b|\bacademy\b|\breserves?\b|\bcadete\w*|\bnext gen\b|\bdevelopment\b|\bpremier league 2\b)/i;
const OTHER = /(futsal|beach|e-?sports?|virtual|friendl|\bkings? (cup|league)\b|\bgames\b)/i;

// ---- Brasil: nomes de jogo e estaduais ----
const BR_NATIONAL: Readonly<Record<string, string>> = {
  "Serie A": "Brasileirão Série A", "Serie B": "Brasileirão Série B", "Serie C": "Brasileirão Série C", "Serie D": "Brasileirão Série D",
  "Copa Do Brasil": "Copa do Brasil", "Supercopa do Brasil": "Supercopa do Brasil", "Copa do Nordeste": "Copa do Nordeste", "Copa Verde": "Copa Verde",
};
/** Estaduais: só a 1ª divisão. Aceita "Nome", "Nome - 1" e "Paulista - A1". */
const BR_STATE_FIRST = /^(Acreano|Alagoano|Amapaense|Amazonense|Baiano|Brasiliense|Capixaba|Carioca|Catarinense|Cearense|Gaúcho|Goiano|Maranhense|Matogrossense|Mineiro|Paraense|Paraibano|Paranaense|Pernambucano|Piauiense|Potiguar|Rondoniense|Roraimense|Sergipano|Sul-Matogrossense|Tocantinense|Paulista)(?: - (?:1|A1))?$/;
const BR_STATE_ANY = /^(Acreano|Alagoano|Amapaense|Amazonense|Baiano|Brasiliense|Capixaba|Carioca|Catarinense|Cearense|Gaúcho|Goiano|Maranhense|Matogrossense|Mineiro|Paraense|Paraibano|Paranaense|Pernambucano|Piauiense|Potiguar|Rondoniense|Roraimense|Sergipano|Sul-Matogrossense|Tocantinense|Paulista)\b/;

/** Corrige maiúsculas de ligações em português/espanhol ("Copa De La Liga" -> "Copa de la Liga"). */
export function fixCase(name: string): string {
  return name.replace(/\b(Do|Da|De|Dos|Das|Del|La|El|Los|Las|Y|E)\b/g, (w, _a, i: number) => (i === 0 ? w : w.toLowerCase()));
}

export type Decision = { keep: true; name: string } | { keep: false; reason: string };
export function decide(country: string, league: CatalogLeague): Decision {
  const n = league.name;
  if (FEMALE.test(n)) return { keep: false, reason: "feminino" };
  if (YOUTH.test(n)) return { keep: false, reason: "base/reservas" };
  if (/play-?offs?$/i.test(n)) return { keep: false, reason: "fase (play-offs) da mesma competição" };
  if (OTHER.test(n)) return { keep: false, reason: "futsal/amistoso/outro" };
  if (country === "Brazil") {
    const nat = BR_NATIONAL[n];
    if (nat) return { keep: true, name: nat };
    const m = BR_STATE_FIRST.exec(n);
    if (m) return { keep: true, name: `Campeonato ${m[1]}` };
    if (BR_STATE_ANY.test(n)) return { keep: false, reason: "estadual: só a 1ª divisão" };
    return { keep: false, reason: "brasil: copa regional/estadual fora da lista" };
  }
  return { keep: true, name: fixCase(n) };
}

export type FilteredCatalog = { countries: { name: string; leagues: (CatalogLeague & { gameName: string })[] }[]; removed: { country: string; league: CatalogLeague; reason: string }[]; kept: number };
export function filterCatalog(catalog: ApiCatalog): FilteredCatalog {
  const removed: FilteredCatalog["removed"] = [];
  const countries: FilteredCatalog["countries"] = [];
  let kept = 0;
  for (const c of catalog.countries) {
    const leagues: (CatalogLeague & { gameName: string })[] = [];
    for (const l of c.leagues) { const d = decide(c.name, l); if (d.keep) { leagues.push({ ...l, gameName: d.name }); kept++; } else removed.push({ country: c.name, league: l, reason: d.reason }); }
    if (leagues.length) countries.push({ name: c.name, leagues });
  }
  return { countries, removed, kept };
}
