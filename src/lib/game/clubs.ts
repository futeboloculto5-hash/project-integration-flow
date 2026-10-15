export type Club = {
  id: string;
  name: string;
  short: string;
  city: string;
  stadium: string;
  color: string;
  color2: string;
  rating: number;
  budget: number; // initial cash in R$
  apiId: number; // API-Football team id
  capacity: number;
  debt: number; // R$
  master?: string; // real 2025 shirt sponsor when known
};

// Brasileirão Série A 2025
export const CLUBS: Club[] = [
  { id: "atletico-mg", name: "Atlético-MG", short: "CAM", city: "Belo Horizonte", stadium: "Arena MRV", color: "#1f1f1f", color2: "#ffffff", rating: 79, budget: 60_000_000, apiId: 1062, capacity: 46000, debt: 1400_000_000, master: "Betano" },
  { id: "bahia", name: "Bahia", short: "BAH", city: "Salvador", stadium: "Arena Fonte Nova", color: "#1f6fd1", color2: "#e1262d", rating: 77, budget: 55_000_000, apiId: 118, capacity: 47907, debt: 94_000_000 },
  { id: "botafogo", name: "Botafogo", short: "BOT", city: "Rio de Janeiro", stadium: "Nilton Santos", color: "#1a1a1a", color2: "#ffffff", rating: 81, budget: 70_000_000, apiId: 120, capacity: 44661, debt: 950_000_000, master: "VBet" },
  { id: "ceara", name: "Ceará", short: "CEA", city: "Fortaleza", stadium: "Castelão", color: "#111111", color2: "#ffffff", rating: 71, budget: 20_000_000, apiId: 129, capacity: 63903, debt: 110_000_000 },
  { id: "corinthians", name: "Corinthians", short: "COR", city: "São Paulo", stadium: "Neo Química Arena", color: "#f2f2f2", color2: "#111111", rating: 76, budget: 30_000_000, apiId: 131, capacity: 49205, debt: 1900_000_000, master: "Esportes da Sorte" },
  { id: "cruzeiro", name: "Cruzeiro", short: "CRU", city: "Belo Horizonte", stadium: "Mineirão", color: "#1847a8", color2: "#ffffff", rating: 79, budget: 65_000_000, apiId: 135, capacity: 61846, debt: 1000_000_000, master: "Betfair" },
  { id: "flamengo", name: "Flamengo", short: "FLA", city: "Rio de Janeiro", stadium: "Maracanã", color: "#d51f2e", color2: "#111111", rating: 84, budget: 120_000_000, apiId: 127, capacity: 78838, debt: 245_000_000, master: "Betano" },
  { id: "fluminense", name: "Fluminense", short: "FLU", city: "Rio de Janeiro", stadium: "Maracanã", color: "#7a1f3d", color2: "#0f7a3a", rating: 77, budget: 40_000_000, apiId: 124, capacity: 78838, debt: 186_000_000, master: "Superbet" },
  { id: "fortaleza", name: "Fortaleza", short: "FOR", city: "Fortaleza", stadium: "Castelão", color: "#1d4fa0", color2: "#df2939", rating: 75, budget: 35_000_000, apiId: 154, capacity: 63903, debt: 121_000_000 },
  { id: "gremio", name: "Grêmio", short: "GRE", city: "Porto Alegre", stadium: "Arena do Grêmio", color: "#45a6d8", color2: "#111111", rating: 76, budget: 40_000_000, apiId: 130, capacity: 55662, debt: 486_000_000 },
  { id: "internacional", name: "Internacional", short: "INT", city: "Porto Alegre", stadium: "Beira-Rio", color: "#d6202f", color2: "#ffffff", rating: 77, budget: 45_000_000, apiId: 119, capacity: 50128, debt: 650_000_000 },
  { id: "juventude", name: "Juventude", short: "JUV", city: "Caxias do Sul", stadium: "Alfredo Jaconi", color: "#0f7a3a", color2: "#ffffff", rating: 70, budget: 15_000_000, apiId: 152, capacity: 23726, debt: 60_000_000 },
  { id: "mirassol", name: "Mirassol", short: "MIR", city: "Mirassol", stadium: "Maião", color: "#f5d000", color2: "#0f7a3a", rating: 71, budget: 15_000_000, apiId: 7848, capacity: 15000, debt: 30_000_000 },
  { id: "palmeiras", name: "Palmeiras", short: "PAL", city: "São Paulo", stadium: "Allianz Parque", color: "#16864a", color2: "#ffffff", rating: 85, budget: 110_000_000, apiId: 121, capacity: 43713, debt: 178_000_000, master: "Sportingbet" },
  { id: "bragantino", name: "Red Bull Bragantino", short: "RBB", city: "Bragança Paulista", stadium: "Nabi Abi Chedid", color: "#ffffff", color2: "#d6202f", rating: 75, budget: 50_000_000, apiId: 794, capacity: 17000, debt: 150_000_000 },
  { id: "santos", name: "Santos", short: "SAN", city: "Santos", stadium: "Vila Belmiro", color: "#f3f3f3", color2: "#111111", rating: 74, budget: 30_000_000, apiId: 128, capacity: 16068, debt: 700_000_000 },
  { id: "sao-paulo", name: "São Paulo", short: "SAO", city: "São Paulo", stadium: "MorumBIS", color: "#e2262d", color2: "#111111", rating: 77, budget: 45_000_000, apiId: 126, capacity: 66795, debt: 666_000_000, master: "Superbet" },
  { id: "sport", name: "Sport", short: "SPT", city: "Recife", stadium: "Ilha do Retiro", color: "#d6202f", color2: "#111111", rating: 70, budget: 15_000_000, apiId: 123, capacity: 26418, debt: 180_000_000 },
  { id: "vasco", name: "Vasco", short: "VAS", city: "Rio de Janeiro", stadium: "São Januário", color: "#111111", color2: "#ffffff", rating: 75, budget: 35_000_000, apiId: 133, capacity: 21880, debt: 700_000_000, master: "Betfair" },
  { id: "vitoria", name: "Vitória", short: "VIT", city: "Salvador", stadium: "Barradão", color: "#d6202f", color2: "#111111", rating: 71, budget: 18_000_000, apiId: 136, capacity: 30793, debt: 90_000_000 },
];

export const clubById = (id: string) => CLUBS.find((c) => c.id === id)!;

// Real Brazilian companies used for sponsorship negotiations (deal values are simulated in-game).
export const COMPANIES = [
  "Itaú Unibanco", "Banco do Brasil", "Nubank", "Bradesco", "Caixa", "Magazine Luiza", "Casas Bahia", "Ambev", "Brahma", "Guaraná Antarctica",
  "Vale", "Petrobras", "Azul", "Gol", "Latam Brasil", "Porto Seguro", "Vivo", "Claro", "TIM", "Hapvida", "Unimed", "Natura", "O Boticário",
  "Havaianas", "Localiza", "Mercado Livre", "iFood", "Sadia", "Seara", "Friboi", "BRF", "Positivo", "Riachuelo", "Renner", "Centauro", "Netshoes",
  "PicPay", "Inter", "C6 Bank", "BMG", "Stone", "Betano", "Superbet", "Esportes da Sorte", "Betfair", "Sportingbet", "Frimesa", "BYD Brasil",
];
export const KIT_BRANDS = ["Umbro", "Penalty", "Topper", "Kappa", "Adidas", "Nike", "Puma", "New Balance", "Volt", "Reebok"];
