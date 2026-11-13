// Junta ao datapack base os clubes baixados do API-Football.
// Uso (da raiz do projeto):  bun datapacks/mundo/montar-clubes.ts <pasta com os <liga>_<ano>.json> [outra pasta ...]
// Lê base.json (gerado por montar.py) e escreve datapack.json. Sem pastas, datapack.json = base.json.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { mergeApiClubs, type ApiClubFile } from "../../src/lib/datapack/api-clubs";

const dir = import.meta.dir;
const base = JSON.parse(readFileSync(resolve(dir, "base.json"), "utf8"));
const files: ApiClubFile[] = [];
const walk = (p: string) => { for (const e of readdirSync(p)) { const f = join(p, e); if (statSync(f).isDirectory()) walk(f); else if (/\d+_\d{4}\.json$/.test(e)) files.push({ name: e, json: JSON.parse(readFileSync(f, "utf8")) }); } };
for (const p of process.argv.slice(2)) walk(resolve(p));
const { pack, report } = mergeApiClubs(base, files);
writeFileSync(resolve(dir, "datapack.json"), JSON.stringify(pack, null, 1));
console.log(JSON.stringify({ ...report, possibleDuplicates: report.possibleDuplicates.length, amostraDuplicados: report.possibleDuplicates.slice(0, 5) }, null, 1));
console.log(pack.manifest.counts);
