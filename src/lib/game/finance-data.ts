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
const official = (value: number, metric: string, entity: string, sourceTitle: string, sourceUrl: string, note: string): DebtReference => ({ value, metric, fiscalYear: 2025, entity, status: "oficial", sourceTitle, sourceUrl, note });
const LIAB = "Soma dos passivos circulante e não circulante publicados no balanço. Passivo total não equivale a dívida.";

export const DEBT_REFERENCES: Record<string, DebtReference> = {
  "atletico-mg": official(1_772_000_000, "Endividamento líquido", "SAF (inclui Arena MRV)", "Relatório Integrado 2025 – Atlético Mineiro SAF", "https://atletico.com.br/wp-content/uploads/2026/04/20260430-Relatorio-Integrado-AM-SAFGALO.pdf", "Indicador do relatório da administração, arredondado em R$ milhões."),
  bahia: official(425_787_000, "Passivo total", "SAF", "Demonstrações financeiras 2025 – Esporte Clube Bahia SAF", "https://esporteclubebahia.com.br/wp-content/uploads/2026/04/Esporte-Clube-Bahia-SAF-Demonstracoes-Financeiras-e-Relatorio-dos-Auditores-Independentes.pdf", LIAB),
  ceara: official(217_216_333, "Passivo total", "Associação", "Demonstrações contábeis 2025 – Ceará Sporting Club", "https://transparencia.cearasc.com/wp-content/uploads/2024/05/Demonstracoes-2025-com-relatorio-adm.pdf", LIAB),
  corinthians: official(2_757_292_000, "Passivo total", "Associação", "Demonstrações financeiras 2025 – SC Corinthians Paulista", "https://futebolpaulista.com.br/Repositorio/Institucional/2025/Demonstra%C3%A7%C3%B5es%20Financeiras%20-%20Sport%20Club%20Corinthians%20Paulista%20-%20Federa%C3%A7%C3%A3o%20Paulista.pdf", `${LIAB} Documento do clube publicado pela Federação Paulista.`),
  cruzeiro: official(1_363_690_000, "Passivo total", "SAF", "Informativo financeiro 2025 – Cruzeiro EC SAF", "https://cruzeiro-website-project-documents.s3.us-east-1.amazonaws.com/Documentos+obrigat%C3%B3rios+SITE/FINANCEIRO/%5B3.1.4%5D+Informativo+Financeiro+2025.pdf", LIAB),
  fluminense: official(1_042_916_000, "Passivo total", "Associação", "Demonstrações financeiras 2025 – Fluminense FC", "https://transparenciafluminense.com.br/public/download/b87bed12954890a8af4b5df47633ced9fdf85923", `${LIAB} Auditoria com ressalva.`),
  fortaleza: official(290_815_000, "Passivo total", "SAF", "Demonstrações contábeis 2025 – Fortaleza EC SAF", "https://transparencia.fortaleza1918.com.br/wp-content/uploads/2026/04/DEMONSTRACOES-CONTABEIS-FEC-SAF-31-12-2025.pdf", `${LIAB} Somente a SAF.`),
  gremio: official(935_630_000, "Passivo total", "Associação", "Demonstrações contábeis 2025 – Grêmio FBPA", "https://gremio.net/documentos/GREMIO_-_DFS+RAI_2025_-_final_-_23-03-2026_CD_(1).pdf", LIAB),
  internacional: official(1_273_794_000, "Passivo total", "Associação", "Relatório anual 2025 – SC Internacional", "https://static.internacional.com.br/cms/assets/ra_2025_6be6c85b2a.pdf", `${LIAB} Inclui receitas diferidas.`),
  juventude: official(29_314_316, "Passivo total", "Associação", "Relatório de gestão 2025 – EC Juventude", "https://r2.juventude.com.br/Juventude/multimedia/notices/01KN2GXFP48G9DHNS1484JJSTT.pdf", LIAB),
  bragantino: official(772_375_000, "Passivo total", "Red Bull Bragantino Futebol Ltda.", "Demonstrações contábeis 2025 – Red Bull Bragantino", "https://futebolpaulista.com.br/Repositorio/Institucional/2025/3333-26%20%20Relat%C3%B3rio%20dos%20auditores%20independentes%20RB%20Bragantino%202025.pdf", LIAB),
  santos: official(1_231_959_000, "Passivo total", "Associação", "Demonstrações financeiras 2025 – Santos FC", "https://futebolpaulista.com.br/Repositorio/Institucional/2025/Demonstra%C3%A7%C3%B5es_Financeiras%202025%20assinada%20SFC.pdf", `${LIAB} Inclui receitas a realizar e contingências.`),
  "sao-paulo": official(858_205_000, "Endividamento líquido", "Associação", "Demonstrações financeiras 2025 – São Paulo FC", "https://cdn.saopaulofc.net/2026/04/420-2026-7-spfc-df-31-12-2025-rai-pdf-ass-1-1_completo.pdf", "Relatório da administração: endividamento final em 31/12/2025."),
  vasco: official(1_096_298_000, "Passivo total", "SAF", "Demonstrações contábeis 2025 – Vasco da Gama SAF", "https://media.vasco.com.br/static/2026/04/VASCO_DEMONSTRACOES_CONTABEIS_2025.pdf", `${LIAB} Valores ajustados a valor presente da recuperação judicial.`),
  vitoria: official(407_767_000, "Passivo total", "Associação (consolidado)", "Demonstrações financeiras 2025 – EC Vitória", "https://ecvitoria.com.br/wp-content/uploads/2026/07/Esporte-Clube-Vitoria_Demonstracoes-Financeiras-2025.pdf", `${LIAB} Auditoria com ressalva.`),
};

/** Official statements found but no figure could be read: Botafogo, Flamengo, Mirassol, Sport. Palmeiras not yet consulted. */
export const DEBT_PENDING: Record<string, string> = {
  botafogo: "Demonstrações 2025 publicadas pelo clube, mas o documento não pôde ser lido.",
  flamengo: "Demonstrações 2025 publicadas pelo clube, mas o documento não pôde ser lido integralmente.",
  mirassol: "Notas explicativas 2025 localizadas, sem total de dívida verificável.",
  sport: "Portal de transparência sem documento legível com valores.",
  palmeiras: "Demonstração oficial ainda não consultada.",
};

/** Opening debt of a new career: an official net-debt figure when available, otherwise the game estimate. */
export function startingDebt(clubId: string, gameEstimate: number): { value: number; status: DataStatus; note: string } {
  const ref = DEBT_REFERENCES[clubId];
  if (ref?.value && ref.metric === "Endividamento líquido") return { value: ref.value, status: "oficial", note: `Saldo inicial: ${ref.metric} ${ref.fiscalYear} (${ref.sourceTitle}). Juros e prazo simulados.` };
  return { value: gameEstimate, status: "estimativa", note: "Saldo inicial estimado pelo jogo, não confirmado como dívida em demonstração oficial. Juros e prazo simulados." };
}

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
