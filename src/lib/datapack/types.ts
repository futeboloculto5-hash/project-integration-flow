// Contratos do datapack do Clube Campeão WORLD (esquema v1).
// Um datapack é um conjunto de dados SOMENTE LEITURA, versionado, separado dos saves.
// Este módulo só descreve formas de dados: não importa nada do jogo e não altera nenhum comportamento atual.

export const DATAPACK_SCHEMA = "ccw.datapack" as const;
/** Versão do FORMATO (não do conteúdo). Muda só quando o contrato muda de forma incompatível. */
export const DATAPACK_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

/** Mesmo vocabulário já usado em `finance-data.ts`, para a interface rotular a procedência igual em todo o jogo. */
export type DataStatus = "oficial" | "pesquisa" | "estimativa" | "simulado";
/** De onde vem o pacote como um todo. "teste" = dados sintéticos de teste, nunca devem entrar num jogo real. */
export type PackOrigin = "oficial" | "licenciado" | "comunitario" | "teste";

// ---------- ids estáveis ----------
// Formato `<tipo>:<slug>`; o slug é minúsculo, estável entre versões do pacote e nunca contém o clube/competição de origem
// (assim, transferir um jogador não muda o id dele).
export type IdKind = "ctry" | "comp" | "club" | "plr";
export type CountryId = `ctry:${string}`;
export type CompetitionId = `comp:${string}`;
export type ClubId = `club:${string}`;
export type PlayerId = `plr:${string}`;

// ---------- posições ----------
export const POSITIONS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "CF", "ST"] as const;
export type Position = (typeof POSITIONS)[number];
export const CONFEDERATIONS = ["CONMEBOL", "UEFA", "CONCACAF", "CAF", "AFC", "OFC"] as const;
export type Confederation = (typeof CONFEDERATIONS)[number];
export const COMPETITION_KINDS = ["league", "cup", "group_knockout", "knockout"] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

/** Identificadores do mesmo registro em fontes externas (ex.: { apiFootball: 127 }). Nunca substituem o id estável. */
export type ExternalIds = Record<string, string | number>;

// ---------- manifesto ----------
export type Manifest = {
  schema: typeof DATAPACK_SCHEMA;
  schemaVersion: number;
  /** Identifica o pacote entre versões, ex.: "exemplo-liga". */
  packId: string;
  /** Versão do CONTEÚDO, semver (1.2.0). */
  version: string;
  name: string;
  /** Data de criação do pacote, ISO (aaaa-mm-dd ou data e hora). */
  createdAt: string;
  origin: PackOrigin;
  source?: { name: string; url?: string; license?: string; retrievedAt?: string };
  /** Versão do pacote que este substitui, para atualizações encadeadas. */
  previousVersion?: string;
  /** Quantidade de cada tipo de registro; o validador confere com o conteúdo real. */
  counts: { countries: number; competitions: number; clubs: number; players: number; editions: number };
  notes?: string;
};

// ---------- entidades ----------
export type Country = { id: CountryId; name: string; code?: string; confederation?: Confederation; dataStatus?: DataStatus };

export type Competition = {
  id: CompetitionId;
  name: string;
  /** Ausente = competição internacional. */
  countryId?: CountryId;
  kind: CompetitionKind;
  /** 1 = primeira divisão do país. */
  tier?: number;
  /** Nome da divisão no jogo atual ("A", "B"), para a ponte com a estrutura existente. */
  legacyDivision?: string;
  externalIds?: ExternalIds;
  dataStatus?: DataStatus;
};

/** Quem disputa uma competição em uma temporada. Calendário e regras detalhadas entram em etapas futuras. */
export type Edition = { competitionId: CompetitionId; season: string; clubIds: ClubId[]; dataStatus?: DataStatus };

export type Club = {
  id: ClubId;
  name: string;
  short?: string;
  countryId: CountryId;
  city?: string;
  stadium?: string;
  /** Cor principal e secundária, #rrggbb. */
  colors?: [string, string];
  /** Força geral do clube, 1 a 100 (mesma escala de `rating` dos clubes atuais). */
  rating?: number;
  /** Id que este clube tem hoje no jogo (ex.: "flamengo"), para saves antigos continuarem apontando para ele. */
  legacyId?: string;
  aliases?: string[];
  externalIds?: ExternalIds;
  dataStatus?: DataStatus;
};

export type Contract = { until: string; wage?: number };

export type Player = {
  id: PlayerId;
  /** Id que este jogador tem hoje no jogo (ex.: "flamengo-s1-3"), para saves antigos e para pacotes que espelham os dados atuais. Opcional; pacotes reais normalmente não têm. */
  legacyId?: string;
  name: string;
  /** Data de nascimento (aaaa-mm-dd) quando conhecida; sem ela, `age` pode informar a idade. */
  birthDate?: string;
  age?: number;
  nationalityId?: CountryId;
  position: Position;
  secondaryPositions?: Position[];
  /** Ausente = sem clube (agente livre). */
  clubId?: ClubId;
  /** Força geral, 1 a 99. */
  overall: number;
  potential?: number;
  /** Atributos individuais, 1 a 99, por nome (ex.: { pace: 80 }). O conjunto de nomes é livre nesta versão. */
  attributes?: Record<string, number>;
  value?: number;
  contract?: Contract;
  externalIds?: ExternalIds;
  dataStatus?: DataStatus;
};

export type Datapack = {
  manifest: Manifest;
  countries: Country[];
  competitions: Competition[];
  editions: Edition[];
  clubs: Club[];
  players: Player[];
};

// ---------- resultado da validação ----------
export type IssueSeverity = "error" | "warning";
export type Issue = { severity: IssueSeverity; code: string; path: string; message: string };
export type ValidationStats = { countries: number; competitions: number; clubs: number; players: number; editions: number };
export type ValidationResult =
  | { ok: true; issues: Issue[]; stats: ValidationStats; truncated: boolean; pack: Datapack }
  | { ok: false; issues: Issue[]; stats: ValidationStats; truncated: boolean };
