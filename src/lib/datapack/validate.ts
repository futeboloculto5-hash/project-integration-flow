import { isValidId, isValidPackId } from "./ids";
import { compareSemver, parseSemver } from "./version";
import {
  COMPETITION_KINDS, CONFEDERATIONS, DATAPACK_SCHEMA, POSITIONS, SUPPORTED_SCHEMA_VERSIONS,
  type Datapack, type Issue, type IssueSeverity, type ValidationResult, type ValidationStats,
} from "./types";

/** Limites de segurança: um arquivo malformado ou hostil não pode travar o jogo. */
export const LIMITS = { maxRecords: 500_000, maxIssues: 200, maxString: 200, maxAliases: 20, maxAttributes: 64, maxEditionClubs: 1000 } as const;
const STATUSES = ["oficial", "pesquisa", "estimativa", "simulado"];
const ORIGINS = ["oficial", "licenciado", "comunitario", "teste"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number = LIMITS.maxString): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
/** Data real (aaaa-mm-dd), com ou sem hora ISO. 2026-02-30 não vale. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

class Report {
  issues: Issue[] = [];
  errors = 0;
  truncated = false;
  add(severity: IssueSeverity, code: string, path: string, message: string) {
    if (severity === "error") this.errors++;
    if (this.issues.length < LIMITS.maxIssues) this.issues.push({ severity, code, path, message });
    else this.truncated = true;
  }
  error(code: string, path: string, message: string) { this.add("error", code, path, message); }
  warn(code: string, path: string, message: string) { this.add("warning", code, path, message); }
}

function unknownKeys(r: Report, o: Obj, allowed: readonly string[], path: string) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) r.warn("unknown_field", `${path}.${k}`, `Campo desconhecido "${k}" (ignorado).`);
}
function checkStatus(r: Report, o: Obj, path: string) {
  if (o["dataStatus"] !== undefined && !STATUSES.includes(o["dataStatus"] as string)) r.error("bad_status", `${path}.dataStatus`, `dataStatus deve ser um de: ${STATUSES.join(", ")}.`);
}
function checkExternalIds(r: Report, o: Obj, path: string) {
  const e = o["externalIds"];
  if (e === undefined) return;
  if (!isObj(e)) { r.error("bad_external_ids", `${path}.externalIds`, "externalIds deve ser um objeto."); return; }
  for (const [k, v] of Object.entries(e)) if (!(isStr(v, 80) || (typeof v === "number" && Number.isFinite(v)))) r.error("bad_external_ids", `${path}.externalIds.${k}`, "Valor deve ser texto ou número.");
}
function checkId(r: Report, kind: "ctry" | "comp" | "club" | "plr", o: Obj, path: string, seen: Set<string>) {
  const id = o["id"];
  if (!isValidId(kind, id)) { r.error("bad_id", `${path}.id`, `Id inválido; use "${kind}:<slug>" (a-z, 0-9, . _ -).`); return; }
  if (seen.has(id)) r.error("duplicate_id", `${path}.id`, `Id repetido: ${id}.`);
  seen.add(id);
}
function checkName(r: Report, o: Obj, path: string) { if (!isStr(o["name"])) r.error("bad_name", `${path}.name`, "Nome obrigatório (texto de até 200 caracteres)."); }

const KEYS = {
  manifest: ["schema", "schemaVersion", "packId", "version", "name", "createdAt", "origin", "source", "previousVersion", "counts", "notes"],
  country: ["id", "name", "code", "confederation", "dataStatus"],
  competition: ["id", "name", "countryId", "kind", "tier", "legacyDivision", "externalIds", "dataStatus"],
  edition: ["competitionId", "season", "clubIds", "dataStatus"],
  club: ["id", "name", "short", "countryId", "city", "stadium", "colors", "rating", "legacyId", "aliases", "externalIds", "dataStatus"],
  player: ["id", "name", "birthDate", "age", "nationalityId", "position", "secondaryPositions", "clubId", "overall", "potential", "attributes", "value", "contract", "externalIds", "dataStatus"],
  root: ["manifest", "countries", "competitions", "editions", "clubs", "players"],
} as const;

function validateManifest(r: Report, m: unknown): boolean {
  if (!isObj(m)) { r.error("bad_manifest", "manifest", "Manifesto ausente ou inválido."); return false; }
  unknownKeys(r, m, KEYS.manifest, "manifest");
  if (m["schema"] !== DATAPACK_SCHEMA) { r.error("bad_schema", "manifest.schema", `schema deve ser "${DATAPACK_SCHEMA}".`); return false; }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(m["schemaVersion"] as number)) { r.error("unsupported_schema_version", "manifest.schemaVersion", `Versão de esquema não suportada (suportadas: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}).`); return false; }
  if (!isValidPackId(m["packId"])) r.error("bad_pack_id", "manifest.packId", "packId inválido (a-z, 0-9, . _ -).");
  if (!parseSemver(m["version"])) r.error("bad_version", "manifest.version", "version deve ser semver (ex.: 1.0.0).");
  if (m["previousVersion"] !== undefined && !parseSemver(m["previousVersion"])) r.error("bad_version", "manifest.previousVersion", "previousVersion deve ser semver.");
  if (typeof m["version"] === "string" && typeof m["previousVersion"] === "string") {
    const cmp = compareSemver(m["version"], m["previousVersion"]);
    if (cmp !== null && cmp <= 0) r.error("version_not_increasing", "manifest.version", "version deve ser maior que previousVersion.");
  }
  if (!isStr(m["name"])) r.error("bad_name", "manifest.name", "Nome do pacote obrigatório.");
  if (!isIsoDate(m["createdAt"])) r.error("bad_date", "manifest.createdAt", "createdAt deve ser uma data ISO real.");
  if (!ORIGINS.includes(m["origin"] as string)) r.error("bad_origin", "manifest.origin", `origin deve ser um de: ${ORIGINS.join(", ")}.`);
  else if (m["origin"] === "teste") r.warn("pack_is_test_data", "manifest.origin", "Pacote marcado como dados de TESTE: não deve ser carregado num jogo real.");
  const s = m["source"];
  if (s !== undefined) {
    if (!isObj(s) || !isStr(s["name"])) r.error("bad_source", "manifest.source", "source precisa de um nome.");
    else {
      if (s["url"] !== undefined && !(isStr(s["url"], 500) && /^https?:\/\//.test(s["url"]))) r.error("bad_source", "manifest.source.url", "url deve começar com http(s)://.");
      if (s["retrievedAt"] !== undefined && !isIsoDate(s["retrievedAt"])) r.error("bad_date", "manifest.source.retrievedAt", "retrievedAt deve ser uma data ISO real.");
    }
  } else if (m["origin"] !== "teste") r.warn("no_source", "manifest.source", "Pacote sem fonte declarada (nome, link, licença).");
  const c = m["counts"];
  if (!isObj(c)) r.error("bad_counts", "manifest.counts", "counts obrigatório.");
  else for (const k of ["countries", "competitions", "clubs", "players", "editions"]) if (!isInt(c[k], 0, LIMITS.maxRecords)) r.error("bad_counts", `manifest.counts.${k}`, "Deve ser um inteiro não negativo.");
  return true;
}

export function validateDatapack(input: unknown): ValidationResult {
  const r = new Report();
  const stats: ValidationStats = { countries: 0, competitions: 0, clubs: 0, players: 0, editions: 0 };
  const fail = (): ValidationResult => ({ ok: false, issues: r.issues, stats, truncated: r.truncated });
  try {
    if (!isObj(input)) { r.error("bad_root", "", "O datapack deve ser um objeto."); return fail(); }
    unknownKeys(r, input, KEYS.root, "");
    if (!validateManifest(r, input["manifest"])) return fail();

    const arrays = {} as Record<"countries" | "competitions" | "editions" | "clubs" | "players", unknown[]>;
    let total = 0;
    for (const k of ["countries", "competitions", "editions", "clubs", "players"] as const) {
      const a = input[k];
      if (!Array.isArray(a)) { r.error("bad_collection", k, `${k} deve ser uma lista.`); arrays[k] = []; continue; }
      arrays[k] = a; stats[k] = a.length; total += a.length;
    }
    if (total > LIMITS.maxRecords) { r.error("too_large", "", `Pacote grande demais (${total} registros; máximo ${LIMITS.maxRecords}).`); return fail(); }
    const m = input["manifest"] as Obj, counts = m["counts"];
    if (isObj(counts)) for (const k of Object.keys(stats) as (keyof ValidationStats)[]) if (isInt(counts[k], 0, LIMITS.maxRecords) && counts[k] !== stats[k]) r.error("count_mismatch", `manifest.counts.${k}`, `O manifesto diz ${counts[k]}, mas há ${stats[k]} registros.`);

    // ----- países -----
    const countryIds = new Set<string>(), codes = new Set<string>();
    arrays.countries.forEach((c, i) => {
      const p = `countries[${i}]`;
      if (!isObj(c)) { r.error("bad_record", p, "Registro inválido."); return; }
      unknownKeys(r, c, KEYS.country, p); checkId(r, "ctry", c, p, countryIds); checkName(r, c, p); checkStatus(r, c, p);
      if (c["code"] !== undefined) {
        if (typeof c["code"] !== "string" || !/^[A-Z]{3}$/.test(c["code"])) r.error("bad_code", `${p}.code`, "code deve ter 3 letras maiúsculas.");
        else if (codes.has(c["code"])) r.error("duplicate_code", `${p}.code`, `Código repetido: ${c["code"]}.`); else codes.add(c["code"]);
      }
      if (c["confederation"] !== undefined && !(CONFEDERATIONS as readonly string[]).includes(c["confederation"] as string)) r.error("bad_confederation", `${p}.confederation`, `confederation deve ser um de: ${CONFEDERATIONS.join(", ")}.`);
    });

    // ----- competições -----
    const compIds = new Set<string>();
    arrays.competitions.forEach((c, i) => {
      const p = `competitions[${i}]`;
      if (!isObj(c)) { r.error("bad_record", p, "Registro inválido."); return; }
      unknownKeys(r, c, KEYS.competition, p); checkId(r, "comp", c, p, compIds); checkName(r, c, p); checkStatus(r, c, p); checkExternalIds(r, c, p);
      if (!(COMPETITION_KINDS as readonly string[]).includes(c["kind"] as string)) r.error("bad_kind", `${p}.kind`, `kind deve ser um de: ${COMPETITION_KINDS.join(", ")}.`);
      if (c["countryId"] !== undefined) { if (!isValidId("ctry", c["countryId"])) r.error("bad_id", `${p}.countryId`, "countryId inválido."); else if (!countryIds.has(c["countryId"])) r.error("missing_ref", `${p}.countryId`, `País inexistente: ${c["countryId"]}.`); }
      if (c["tier"] !== undefined && !isInt(c["tier"], 1, 20)) r.error("bad_number", `${p}.tier`, "tier deve ser inteiro de 1 a 20.");
      if (c["legacyDivision"] !== undefined && !isStr(c["legacyDivision"], 10)) r.error("bad_name", `${p}.legacyDivision`, "legacyDivision inválido.");
    });

    // ----- clubes -----
    const clubIds = new Set<string>(), legacy = new Map<string, string>(), names = new Map<string, string>(), nameOwner = new Map<string, string>(), aliasOwner = new Map<string, string>();
    arrays.clubs.forEach((c, i) => {
      const p = `clubs[${i}]`;
      if (!isObj(c)) { r.error("bad_record", p, "Registro inválido."); return; }
      unknownKeys(r, c, KEYS.club, p); checkId(r, "club", c, p, clubIds); checkName(r, c, p); checkStatus(r, c, p); checkExternalIds(r, c, p);
      const id = typeof c["id"] === "string" ? c["id"] : p;
      if (!isValidId("ctry", c["countryId"])) r.error("bad_id", `${p}.countryId`, "countryId obrigatório e válido.");
      else if (!countryIds.has(c["countryId"])) r.error("missing_ref", `${p}.countryId`, `País inexistente: ${c["countryId"]}.`);
      for (const k of ["short", "city", "stadium"]) if (c[k] !== undefined && !isStr(c[k])) r.error("bad_name", `${p}.${k}`, `${k} inválido.`);
      if (c["rating"] !== undefined && !isNum(c["rating"], 1, 100)) r.error("bad_number", `${p}.rating`, "rating deve estar entre 1 e 100.");
      if (c["colors"] !== undefined && !(Array.isArray(c["colors"]) && c["colors"].length === 2 && c["colors"].every((x) => typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x)))) r.error("bad_color", `${p}.colors`, "colors deve ser [#rrggbb, #rrggbb].");
      if (c["legacyId"] !== undefined) {
        if (!isStr(c["legacyId"], 64)) r.error("bad_name", `${p}.legacyId`, "legacyId inválido.");
        else if (legacy.has(c["legacyId"])) r.error("duplicate_legacy_id", `${p}.legacyId`, `legacyId "${c["legacyId"]}" já usado por ${legacy.get(c["legacyId"])}.`); else legacy.set(c["legacyId"], id);
      }
      if (c["aliases"] !== undefined) {
        if (!Array.isArray(c["aliases"]) || c["aliases"].length > LIMITS.maxAliases || !c["aliases"].every((a) => isStr(a, 80))) r.error("bad_aliases", `${p}.aliases`, `aliases deve ser uma lista de até ${LIMITS.maxAliases} textos.`);
        else for (const a of c["aliases"] as string[]) {
          const key = norm(a), owner = aliasOwner.get(key);
          if (owner && owner !== id) r.error("alias_collision", `${p}.aliases`, `Apelido "${a}" já pertence a ${owner}.`); else aliasOwner.set(key, id);
        }
      }
      if (isStr(c["name"]) && isValidId("ctry", c["countryId"])) {
        const key = `${norm(c["name"])}|${c["countryId"]}`, other = names.get(key);
        if (other && other !== id) r.warn("possible_duplicate_club", `${p}.name`, `Mesmo nome e país de ${other}: possível clube duplicado.`); else names.set(key, id);
        if (!nameOwner.has(norm(c["name"]))) nameOwner.set(norm(c["name"]), id);
      }
    });
    for (const [key, owner] of aliasOwner) { const named = nameOwner.get(key); if (named && named !== owner) r.error("alias_collision", "clubs", `Apelido "${key}" de ${owner} é o nome oficial de ${named}.`); }

    // ----- edições -----
    const editionKeys = new Set<string>();
    arrays.editions.forEach((e, i) => {
      const p = `editions[${i}]`;
      if (!isObj(e)) { r.error("bad_record", p, "Registro inválido."); return; }
      unknownKeys(r, e, KEYS.edition, p); checkStatus(r, e, p);
      if (!isValidId("comp", e["competitionId"])) r.error("bad_id", `${p}.competitionId`, "competitionId inválido."); else if (!compIds.has(e["competitionId"])) r.error("missing_ref", `${p}.competitionId`, `Competição inexistente: ${e["competitionId"]}.`);
      if (typeof e["season"] !== "string" || !/^\d{4}(?:[/-]\d{2}(?:\d{2})?)?$/.test(e["season"])) r.error("bad_season", `${p}.season`, 'season deve ser como "2026" ou "2025/26".');
      else if (typeof e["competitionId"] === "string") { const k = `${e["competitionId"]}|${e["season"]}`; if (editionKeys.has(k)) r.error("duplicate_edition", p, "Edição repetida (mesma competição e temporada)."); editionKeys.add(k); }
      const list = e["clubIds"];
      if (!Array.isArray(list) || list.length > LIMITS.maxEditionClubs) { r.error("bad_collection", `${p}.clubIds`, "clubIds deve ser uma lista."); return; }
      const seen = new Set<string>();
      for (const [j, id] of list.entries()) {
        if (!isValidId("club", id)) r.error("bad_id", `${p}.clubIds[${j}]`, "Id de clube inválido.");
        else { if (!clubIds.has(id)) r.error("missing_ref", `${p}.clubIds[${j}]`, `Clube inexistente: ${id}.`); if (seen.has(id)) r.error("duplicate_id", `${p}.clubIds[${j}]`, `Clube repetido na edição: ${id}.`); seen.add(id); }
      }
    });

    // ----- jogadores -----
    const playerIds = new Set<string>(), sameBody = new Map<string, string>();
    arrays.players.forEach((pl, i) => {
      const p = `players[${i}]`;
      if (!isObj(pl)) { r.error("bad_record", p, "Registro inválido."); return; }
      unknownKeys(r, pl, KEYS.player, p); checkId(r, "plr", pl, p, playerIds); checkName(r, pl, p); checkStatus(r, pl, p); checkExternalIds(r, pl, p);
      const id = typeof pl["id"] === "string" ? pl["id"] : p;
      const posOk = (POSITIONS as readonly string[]).includes(pl["position"] as string);
      if (!posOk) r.error("bad_position", `${p}.position`, `position deve ser um de: ${POSITIONS.join(", ")}.`);
      if (pl["secondaryPositions"] !== undefined) {
        const s = pl["secondaryPositions"];
        if (!Array.isArray(s) || s.length > 4 || !s.every((x) => (POSITIONS as readonly string[]).includes(x as string))) r.error("bad_position", `${p}.secondaryPositions`, "secondaryPositions deve ter até 4 posições válidas.");
        else if (new Set(s).size !== s.length || s.includes(pl["position"])) r.warn("redundant_position", `${p}.secondaryPositions`, "Posição secundária repetida ou igual à principal.");
      }
      if (!isInt(pl["overall"], 1, 99)) r.error("bad_number", `${p}.overall`, "overall deve ser inteiro de 1 a 99.");
      if (pl["potential"] !== undefined) { if (!isInt(pl["potential"], 1, 99)) r.error("bad_number", `${p}.potential`, "potential deve ser inteiro de 1 a 99."); else if (isInt(pl["overall"], 1, 99) && pl["potential"] < pl["overall"]) r.warn("potential_below_overall", `${p}.potential`, "potential menor que overall."); }
      if (pl["birthDate"] !== undefined && !isIsoDate(pl["birthDate"])) r.error("bad_date", `${p}.birthDate`, "birthDate deve ser uma data real (aaaa-mm-dd).");
      if (pl["age"] !== undefined && !isInt(pl["age"], 14, 60)) r.error("bad_number", `${p}.age`, "age deve ser inteiro de 14 a 60.");
      if (pl["birthDate"] === undefined && pl["age"] === undefined) r.warn("age_missing", p, "Sem data de nascimento nem idade (o jogo marcará a idade como desconhecida).");
      if (pl["value"] !== undefined && !isNum(pl["value"], 0, 1e10)) r.error("bad_number", `${p}.value`, "value inválido.");
      if (pl["nationalityId"] !== undefined) { if (!isValidId("ctry", pl["nationalityId"])) r.error("bad_id", `${p}.nationalityId`, "nationalityId inválido."); else if (!countryIds.has(pl["nationalityId"])) r.error("missing_ref", `${p}.nationalityId`, `País inexistente: ${pl["nationalityId"]}.`); }
      if (pl["clubId"] !== undefined) { if (!isValidId("club", pl["clubId"])) r.error("bad_id", `${p}.clubId`, "clubId inválido."); else if (!clubIds.has(pl["clubId"])) r.error("missing_ref", `${p}.clubId`, `Clube inexistente: ${pl["clubId"]}.`); }
      if (pl["contract"] !== undefined) {
        const k = pl["contract"];
        if (!isObj(k) || !isIsoDate(k["until"])) r.error("bad_contract", `${p}.contract`, "contract precisa de until (data real).");
        else { unknownKeys(r, k, ["until", "wage"], `${p}.contract`); if (k["wage"] !== undefined && !isNum(k["wage"], 0, 1e9)) r.error("bad_number", `${p}.contract.wage`, "wage inválido."); }
        if (pl["clubId"] === undefined) r.warn("contract_without_club", `${p}.contract`, "Contrato sem clube.");
      }
      if (pl["attributes"] !== undefined) {
        const a = pl["attributes"];
        if (!isObj(a) || Object.keys(a).length > LIMITS.maxAttributes) r.error("bad_attributes", `${p}.attributes`, `attributes deve ser um objeto com até ${LIMITS.maxAttributes} itens.`);
        else for (const [k, v] of Object.entries(a)) { if (!/^[a-z][a-zA-Z0-9]{0,30}$/.test(k)) r.error("bad_attributes", `${p}.attributes.${k}`, "Nome de atributo inválido."); if (!isInt(v, 1, 99)) r.error("bad_number", `${p}.attributes.${k}`, "Atributo deve ser inteiro de 1 a 99."); }
      }
      if (isStr(pl["name"]) && typeof pl["birthDate"] === "string" && typeof pl["clubId"] === "string") {
        const key = `${norm(pl["name"])}|${pl["birthDate"]}|${pl["clubId"]}`, other = sameBody.get(key);
        if (other && other !== id) r.warn("possible_duplicate_player", p, `Mesmo nome, nascimento e clube de ${other}: possível jogador duplicado.`); else sameBody.set(key, id);
      }
    });
  } catch (e) {
    r.error("validator_crash", "", `Falha inesperada ao validar: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.errors > 0) return fail();
  return { ok: true, issues: r.issues, stats, truncated: false, pack: input as unknown as Datapack };
}

/** Atalho para quem só quer saber se o pacote pode ser usado. */
export const isValidDatapack = (input: unknown): input is Datapack => validateDatapack(input).ok;
