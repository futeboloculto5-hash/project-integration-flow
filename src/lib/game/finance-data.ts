// Reference data for the career economy. Every value carries its origin so the UI can
// separate verified facts from estimates and in-game simulation.

export type DataStatus = "oficial" | "pesquisa" | "estimativa" | "simulado";

export const STATUS_LABEL: Record<DataStatus, string> = {
  oficial: "Fonte oficial",
  pesquisa: "Pesquisa de mercado",
  estimativa: "Estimativa",
  simulado: "Simulado",
};

export type SourceRef = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published: string; // date of the publication or data cut, as stated by the source
  accessed: string; // ISO date when the source was consulted
  methodology: string;
  usedFor: string;
};

export const ACCESSED = "2026-11-01";

export const SOURCES: SourceRef[] = [
  {
    id: "ibope-2025",
    title: "Mapa do Patrocínio 2025 – uniformes da Série A",
    publisher: "IBOPE Repucom",
    url: "https://www.iboperepucom.com.br/br/estudos/mapa-do-patrocinio-de-uniforme-de-futebol-no-brasil-em-2025/",
    published: "2026-01-19",
    accessed: ACCESSED,
    methodology: "Leitura do quadro clube a clube do estudo (marcas com contrato ativo ao fim do Brasileirão 2025, propriedades Máster e Material esportivo) e dos totais por setor. O estudo não divulga valores de contrato.",
    usedFor: "Nome do patrocinador máster e do fornecedor de material esportivo de cada clube; peso dos setores nas propostas de patrocínio. Os valores dos contratos no jogo são simulados.",
  },
  {
    id: "ibge-cempre-2024",
    title: "Estatísticas do Cadastro Central de Empresas (CEMPRE) 2024",
    publisher: "IBGE",
    url: "https://www.ibge.gov.br/estatisticas/economicas/comercio/9016-estatisticas-do-cadastro-central-de-empresas.html",
    published: "2026-06-25",
    accessed: ACCESSED,
    methodology: "Salário médio mensal de todas as atividades em 2024 (R$ 3.932,45) e total de 10,6 milhões de empresas e outras organizações ativas, conforme divulgação oficial do IBGE.",
    usedFor: "Salário médio mensal dos funcionários do clube (sem encargos). A quantidade de funcionários é simulada.",
  },
  {
    id: "mapa-empresas",
    title: "Painel Mapa de Empresas",
    publisher: "Governo Federal (gov.br)",
    url: "https://www.gov.br/empresas-e-negocios/pt-br/mapa-de-empresas/painel-mapa-de-empresas",
    published: "Dados até set/2026",
    accessed: ACCESSED,
    methodology: "Painel interativo consultado. Os números ficam dentro de gráficos dinâmicos e não puderam ser extraídos com segurança.",
    usedFor: "Apenas contexto. Nenhum valor do jogo vem deste painel.",
  },
  {
    id: "modelo-jogo",
    title: "Modelo econômico da carreira",
    publisher: "Clube Campeão World",
    url: "",
    published: "2026-11-01",
    accessed: ACCESSED,
    methodology: "Juros, prazos, parcelas (tabela Price), cotas de patrocínio, bônus, público, premiação, orçamento da diretoria e empréstimos bancários são regras de jogo.",
    usedFor: "Todos os valores marcados como simulados.",
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);

/** Shirt brands active at the end of the 2025 Brasileirão, read from the IBOPE Repucom map. */
export const SPONSOR_MAP_2025: Record<string, { master: string | null; kit: string; note?: string }> = {
  "atletico-mg": { master: "H2bet", kit: "Adidas" },
  bahia: { master: "Viva Sorte Bet", kit: "Puma" },
  botafogo: { master: "VBet", kit: "Reebok" },
  bragantino: { master: "Red Bull", kit: "Puma" },
  ceara: { master: "Esportes da Sorte", kit: "Marca própria do clube" },
  corinthians: { master: "Esportes da Sorte", kit: "Nike" },
  cruzeiro: { master: "Betfair", kit: "Adidas" },
  flamengo: { master: "Betano", kit: "Adidas" },
  fluminense: { master: "Superbet", kit: "Umbro" },
  fortaleza: { master: "Cassino.bet", kit: "Volt" },
  gremio: { master: null, kit: "Umbro", note: "O mapa indica que o espaço máster terminou 2025 sem contrato ativo." },
  internacional: { master: "Alfa", kit: "Adidas" },
  juventude: { master: "Stake", kit: "19Treze" },
  mirassol: { master: "BET7K", kit: "Athleta", note: "Poty também aparece como máster ativo no mapa." },
  palmeiras: { master: "Sportingbet", kit: "Puma" },
  santos: { master: "BET7K", kit: "Umbro" },
  "sao-paulo": { master: "Superbet", kit: "New Balance" },
  sport: { master: "Betnacional", kit: "Umbro" },
  vasco: { master: "Betfair", kit: "Kappa" },
  vitoria: { master: "BET7K", kit: "Volt" },
};

/** Number of distinct brands per sector on Série A shirts in 2025 (IBOPE Repucom). */
export const SECTOR_WEIGHTS_2025: Record<string, number> = {
  Financeiro: 26,
  "Imobiliário e construção": 19,
  Apostas: 18,
  Alimentação: 12,
  "Serviços de saúde": 11,
  Outros: 78,
};

/** Real Brazilian brands. Their participation in offers and every value offered are simulated. */
export const SPONSOR_COMPANIES: { name: string; sector: keyof typeof SECTOR_WEIGHTS_2025 }[] = [
  ...["Itaú Unibanco", "Banco do Brasil", "Nubank", "Bradesco", "Caixa", "PicPay", "Inter", "C6 Bank", "BMG", "Stone", "Banrisul", "Porto Seguro"].map((name) => ({ name, sector: "Financeiro" as const })),
  ...["MRV", "Cyrela", "Tenda", "Direcional", "Tigre", "Portobello", "Eucatex", "Votorantim Cimentos"].map((name) => ({ name, sector: "Imobiliário e construção" as const })),
  ...["Betano", "Superbet", "Esportes da Sorte", "Betfair", "Sportingbet", "Betnacional", "BET7K", "Viva Sorte"].map((name) => ({ name, sector: "Apostas" as const })),
  ...["Sadia", "Seara", "Friboi", "BRF", "Frimesa", "Ambev", "Guaraná Antarctica", "Zé Delivery"].map((name) => ({ name, sector: "Alimentação" as const })),
  ...["Hapvida", "Unimed", "Rede D'Or", "Drogasil", "Cimed"].map((name) => ({ name, sector: "Serviços de saúde" as const })),
  ...["Magazine Luiza", "Casas Bahia", "Vale", "Petrobras", "Azul", "Gol", "Latam Brasil", "Vivo", "Claro", "TIM", "Natura", "O Boticário", "Havaianas", "Localiza", "Mercado Livre", "iFood", "Positivo", "Riachuelo", "Renner", "Centauro", "Netshoes", "BYD Brasil", "Havan"].map((name) => ({ name, sector: "Outros" as const })),
];

export const STAFF_SALARY_IBGE_2024 = 3932.45;

export type DebtReference = {
  value: number | null;
  metric: string;
  fiscalYear: number | null;
  entity: string;
  status: DataStatus;
  sourceTitle: string;
  sourceUrl: string;
  note: string;
};

/**
 * Club debt references. Only figures read in the club's own financial statements are
 * marked "oficial"; anything else stays an estimate used solely as a game starting point.
 */
export const DEBT_REFERENCES: Record<string, DebtReference> = {};

export function debtReference(clubId: string, gameEstimate: number): DebtReference {
  return DEBT_REFERENCES[clubId] ?? {
    value: gameEstimate,
    metric: "Endividamento aproximado",
    fiscalYear: null,
    entity: "Clube",
    status: "estimativa",
    sourceTitle: "Estimativa do jogo",
    sourceUrl: "",
    note: "Não confirmado em demonstração financeira oficial. Serve só como ponto de partida da carreira.",
  };
}
