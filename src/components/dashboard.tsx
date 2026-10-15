// @ts-nocheck -- ported verbatim from the original app

import { useEffect, useMemo, useState } from 'react'
import { advanceCareerDay, createCareer, listCareers, saveCareer } from '@/lib/career-actions'
import { LiveMatch } from '@/components/live-match'
import { applyStandingsResult, compareStandings, simulateMatch, type StandingRow } from '@/lib/career/simulation'
import {
  ArrowDownRight, ArrowUpRight, Bell, CalendarDays, ChevronRight, CircleDollarSign,
  ClipboardList, Coins, Dumbbell, Flag, LayoutDashboard, Menu, Newspaper, Search,
  Settings, Shield, Shirt, ShoppingCart, Trophy, Users, X, Zap
} from 'lucide-react'

const clubs = [
  { name: 'Fluminense FC', short: 'FLU', city: 'Rio de Janeiro', league: 'Brasileirão Série A', rating: 78, cash: 'R$ 42,8 mi', debt: 'R$ 186 mi', color: '#4da3ff' },
  { name: 'Flamengo', short: 'FLA', city: 'Rio de Janeiro', league: 'Brasileirão Série A', rating: 84, cash: 'R$ 118 mi', debt: 'R$ 245 mi', color: '#d94b65' },
  { name: 'Palmeiras', short: 'PAL', city: 'São Paulo', league: 'Brasileirão Série A', rating: 86, cash: 'R$ 96 mi', debt: 'R$ 178 mi', color: '#287bc7' },
  { name: 'Corinthians', short: 'COR', city: 'São Paulo', league: 'Brasileirão Série A', rating: 78, cash: 'R$ 28 mi', debt: 'R$ 1,9 bi', color: '#8fa8c5' },
  { name: 'São Paulo FC', short: 'SAO', city: 'São Paulo', league: 'Brasileirão Série A', rating: 80, cash: 'R$ 41 mi', debt: 'R$ 666 mi', color: '#3f8fda' },
  { name: 'Grêmio', short: 'GRE', city: 'Porto Alegre', league: 'Brasileirão Série A', rating: 77, cash: 'R$ 35 mi', debt: 'R$ 486 mi', color: '#3c95d8' },
  { name: 'Internacional', short: 'INT', city: 'Porto Alegre', league: 'Brasileirão Série A', rating: 77, cash: 'R$ 32 mi', debt: 'R$ 650 mi', color: '#d95c70' },
  { name: 'Atlético-MG', short: 'CAM', city: 'Belo Horizonte', league: 'Brasileirão Série A', rating: 81, cash: 'R$ 24 mi', debt: 'R$ 1,4 bi', color: '#9aabc0' },
  { name: 'Cruzeiro', short: 'CRU', city: 'Belo Horizonte', league: 'Brasileirão Série A', rating: 75, cash: 'R$ 19 mi', debt: 'R$ 1,0 bi', color: '#347fd0' },
  { name: 'EC Bahia', short: 'BAH', city: 'Salvador', league: 'Brasileirão Série A', rating: 72, cash: 'R$ 28,4 mi', debt: 'R$ 94 mi', color: '#5aa7e8' },
  { name: 'Fortaleza', short: 'FOR', city: 'Fortaleza', league: 'Brasileirão Série A', rating: 76, cash: 'R$ 36 mi', debt: 'R$ 121 mi', color: '#4a91d9' },
  { name: 'Athletico Paranaense', short: 'CAP', city: 'Curitiba', league: 'Brasileirão Série A', rating: 76, cash: 'R$ 36,2 mi', debt: 'R$ 121 mi', color: '#d45f77' },
  { name: 'Santos', short: 'SAN', city: 'Santos', league: 'Brasileirão Série A', rating: 74, cash: 'R$ 22 mi', debt: 'R$ 700 mi', color: '#b8c9dd' },
  { name: 'Vasco da Gama', short: 'VAS', city: 'Rio de Janeiro', league: 'Brasileirão Série A', rating: 73, cash: 'R$ 25 mi', debt: 'R$ 700 mi', color: '#8199b5' },
  { name: 'Botafogo', short: 'BOT', city: 'Rio de Janeiro', league: 'Brasileirão Série A', rating: 79, cash: 'R$ 74 mi', debt: 'R$ 950 mi', color: '#6f829a' },
  { name: 'Coritiba FC', short: 'CFC', city: 'Curitiba', league: 'Brasileirão Série B', rating: 69, cash: 'R$ 13,7 mi', debt: 'R$ 152 mi', color: '#7daed2' },
  { name: 'Sport Recife', short: 'SPT', city: 'Recife', league: 'Brasileirão Série B', rating: 68, cash: 'R$ 11 mi', debt: 'R$ 180 mi', color: '#d66a83' },
  { name: 'Ceará', short: 'CEA', city: 'Fortaleza', league: 'Brasileirão Série B', rating: 67, cash: 'R$ 10 mi', debt: 'R$ 110 mi', color: '#a5b8cf' },
  { name: 'Novorizontino', short: 'NOV', city: 'Novo Horizonte', league: 'Brasileirão Série B', rating: 65, cash: 'R$ 8 mi', debt: 'R$ 41 mi', color: '#5b9ed7' },
  { name: 'Remo', short: 'REM', city: 'Belém', league: 'Brasileirão Série B', rating: 62, cash: 'R$ 5 mi', debt: 'R$ 64 mi', color: '#6da8d4' },
  { name: 'RB Bragantino', short: 'RBB', city: 'Bragança Paulista', league: 'Brasileirão Série A', rating: 73, cash: 'R$ 31 mi', debt: 'Não divulgado', color: '#d84d67' },
  { name: 'Vitória', short: 'VIT', city: 'Salvador', league: 'Brasileirão Série A', rating: 68, cash: 'R$ 9 mi', debt: 'Não divulgado', color: '#d85d76' },
  { name: 'Juventude', short: 'JUV', city: 'Caxias do Sul', league: 'Brasileirão Série A', rating: 66, cash: 'R$ 7 mi', debt: 'Não divulgado', color: '#8bb0d3' },
  { name: 'Mirassol', short: 'MIR', city: 'Mirassol', league: 'Brasileirão Série A', rating: 64, cash: 'R$ 6 mi', debt: 'Não divulgado', color: '#e0bd4f' },
  { name: 'Ponte Preta', short: 'PON', city: 'Campinas', league: 'Brasileirão Série B', rating: 63, cash: 'Não divulgado', debt: 'Não divulgado', color: '#8fa4bd' },
  { name: 'Goiás', short: 'GOI', city: 'Goiânia', league: 'Brasileirão Série B', rating: 67, cash: 'Não divulgado', debt: 'Não divulgado', color: '#86a9cb' },
  { name: 'América-MG', short: 'AMG', city: 'Belo Horizonte', league: 'Brasileirão Série B', rating: 68, cash: 'Não divulgado', debt: 'Não divulgado', color: '#77a6cd' },
  { name: 'Manchester City', short: 'MCI', city: 'Manchester', league: 'Premier League', rating: 91, cash: 'Dados em GBP', debt: 'Consultar relatório', color: '#6baddb' },
  { name: 'Liverpool', short: 'LIV', city: 'Liverpool', league: 'Premier League', rating: 89, cash: 'Dados em GBP', debt: 'Consultar relatório', color: '#c95a72' },
  { name: 'Arsenal', short: 'ARS', city: 'Londres', league: 'Premier League', rating: 87, cash: 'Dados em GBP', debt: 'Consultar relatório', color: '#d86178' },
  { name: 'Real Madrid', short: 'RMA', city: 'Madrid', league: 'La Liga', rating: 92, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#b9c9dc' },
  { name: 'Barcelona', short: 'BAR', city: 'Barcelona', league: 'La Liga', rating: 88, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#5a83bb' },
  { name: 'Atlético de Madrid', short: 'ATM', city: 'Madrid', league: 'La Liga', rating: 85, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#d2667b' },
  { name: 'Bayern Munich', short: 'BAY', city: 'Munique', league: 'Bundesliga', rating: 90, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#d65b73' },
  { name: 'Borussia Dortmund', short: 'BVB', city: 'Dortmund', league: 'Bundesliga', rating: 83, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#e4c957' },
  { name: 'Inter', short: 'INT', city: 'Milão', league: 'Serie A', rating: 87, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#5f97cc' },
  { name: 'Juventus', short: 'JUV', city: 'Turim', league: 'Serie A', rating: 84, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#9aadc3' },
  { name: 'PSG', short: 'PSG', city: 'Paris', league: 'Ligue 1', rating: 89, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#5d82b8' },
  { name: 'Benfica', short: 'SLB', city: 'Lisboa', league: 'Primeira Liga', rating: 82, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#d76379' },
  { name: 'Porto', short: 'FCP', city: 'Porto', league: 'Primeira Liga', rating: 83, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#6b9fce' },
  { name: 'Ajax', short: 'AJA', city: 'Amsterdã', league: 'Eredivisie', rating: 79, cash: 'Dados em EUR', debt: 'Consultar relatório', color: '#d96a7e' },
] as const

type RosterPlayer = { name: string; pos: string; age: number; rating: number; value: string; status: string }

const rosterByClub: Record<string, RosterPlayer[]> = {
  'Fluminense FC': [
    { name: 'Fábio', pos: 'GOL', age: 44, rating: 78, value: 'R$ 1,2 mi', status: 'Titular' }, { name: 'Samuel Xavier', pos: 'LD', age: 34, rating: 75, value: 'R$ 4,8 mi', status: 'Titular' }, { name: 'Thiago Silva', pos: 'ZAG', age: 41, rating: 84, value: 'R$ 8,5 mi', status: 'Titular' }, { name: 'Renê', pos: 'LE', age: 33, rating: 76, value: 'R$ 5,4 mi', status: 'Titular' }, { name: 'André', pos: 'VOL', age: 24, rating: 82, value: 'R$ 58 mi', status: 'Titular' }, { name: 'Martinelli', pos: 'MC', age: 24, rating: 78, value: 'R$ 16 mi', status: 'Titular' }, { name: 'Jhon Arias', pos: 'PD', age: 28, rating: 85, value: 'R$ 42 mi', status: 'Titular' }, { name: 'Germán Cano', pos: 'ATA', age: 37, rating: 81, value: 'R$ 12 mi', status: 'Titular' },
  ],
  Flamengo: [
    { name: 'Agustín Rossi', pos: 'GOL', age: 30, rating: 82, value: 'R$ 28 mi', status: 'Titular' }, { name: 'Wesley', pos: 'LD', age: 21, rating: 78, value: 'R$ 45 mi', status: 'Titular' }, { name: 'Léo Pereira', pos: 'ZAG', age: 29, rating: 81, value: 'R$ 42 mi', status: 'Titular' }, { name: 'Gerson', pos: 'MC', age: 28, rating: 84, value: 'R$ 92 mi', status: 'Titular' }, { name: 'Arrascaeta', pos: 'MEI', age: 31, rating: 87, value: 'R$ 75 mi', status: 'Titular' }, { name: 'Pedro', pos: 'ATA', age: 28, rating: 86, value: 'R$ 110 mi', status: 'Titular' },
  ],
  Palmeiras: [
    { name: 'Weverton', pos: 'GOL', age: 37, rating: 84, value: 'R$ 18 mi', status: 'Titular' }, { name: 'Gustavo Gómez', pos: 'ZAG', age: 32, rating: 86, value: 'R$ 34 mi', status: 'Titular' }, { name: 'Piquerez', pos: 'LE', age: 26, rating: 82, value: 'R$ 55 mi', status: 'Titular' }, { name: 'Raphael Veiga', pos: 'MEI', age: 30, rating: 85, value: 'R$ 75 mi', status: 'Titular' }, { name: 'Richard Ríos', pos: 'VOL', age: 25, rating: 81, value: 'R$ 62 mi', status: 'Titular' }, { name: 'Rony', pos: 'ATA', age: 30, rating: 80, value: 'R$ 38 mi', status: 'Titular' },
  ],
}


const nav = [
  ['Visão geral', LayoutDashboard], ['Elenco', Users], ['Tática e escalação', Shirt],
  ['Calendário', CalendarDays], ['Competições', Trophy], ['Mercado de transferências', ShoppingCart],
  ['Contratos', ClipboardList], ['Finanças', CircleDollarSign],
  ['Diretoria', Shield], ['Comissão técnica', Dumbbell],
  ['Estádio e infraestrutura', Zap], ['Torcida', Users], ['Notícias', Newspaper],
]

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 1 })

const financialSources = {
  ey: 'https://www.ey.com/pt_br/insights/media-entertainment/levantamento-financeiro-clubes-brasileiros',
  ge: 'https://ge.globo.com/pe/futebol/noticia/2026/06/03/dividas-dos-clubes-brasileiros-11-times-superam-r-1-bilhao-veja-ranking.ghtml',
  sportsValue: 'https://www.sportsvalue.com.br/',
  cbf: 'https://www.cbf.com.br/a-cbf/noticias/informes-comissao-medicos/a/cbf-apresenta-sistema-de-sustentabilidade-financeira-do-futebol-brasileiro',
  central: 'https://www.gov.br/pt-br/servicos/consultar-balancos-contabeis?id=22168&origem=servico',
}

const debtRecords: Record<string, { gross: string; net: string; tax: string; loans: string; source: string; sourceLabel: string; period: string; confidence: string }> = {
  Corinthians: { gross: 'R$ 2,75 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
  'Atlético-MG': { gross: 'R$ 2,66 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
  Botafogo: { gross: 'R$ 2,01 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
  'São Paulo FC': { gross: 'R$ 2,45 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
  Flamengo: { gross: 'R$ 1,26 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
  Palmeiras: { gross: 'Acima de R$ 1 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Faixa publicada; valor exato não confirmado aqui' },
  'Fluminense FC': { gross: 'R$ 1,04 bi', net: 'Não divulgado', tax: 'Não divulgado', loans: 'Não divulgado', source: financialSources.ge, sourceLabel: 'GE · ranking jornalístico baseado em balanços', period: 'Exercício 2025 · consulta 15/10/2026', confidence: 'Referência jornalística; conferir balanço original' },
}

const eySnapshot = { clubs: '20 clubes da Série A 2025', revenue: 'R$ 14,9 bi', netDebt: 'R$ 14,3 bi', loans: 'R$ 3 bi', taxDebt: 'R$ 4,5 bi', period: 'Exercício 2025' }

type Sponsorship = { company: string; slot: string; annual: string; status: string; source: string }

const sponsorshipsByClub: Record<string, Sponsorship[]> = {
  Corinthians: [
    { company: 'Esportes da Sorte', slot: 'Máster', annual: 'R$ 150 mi', status: 'Documentado', source: financialSources.ge },
    { company: 'Nike', slot: 'Material esportivo', annual: 'R$ 89 mi', status: 'Documentado', source: financialSources.ge },
    { company: 'Frimesa', slot: 'Omoplata', annual: 'R$ 9,6 mi', status: 'Documentado', source: financialSources.ge },
    { company: 'BYD', slot: 'Omoplata', annual: 'R$ 8 mi', status: 'Documentado', source: financialSources.ge },
    { company: 'BMG', slot: 'Manga', annual: 'R$ 5 mi', status: 'Documentado', source: financialSources.ge },
  ],
}

const marketCompanies = ['Itaú Unibanco', 'Banco do Brasil', 'Nubank', 'Magazine Luiza', 'Ambev', 'Vale', 'Azul', 'Porto Seguro', 'Vivo', 'Hapvida']

const stadiumsByClub: Record<string, { name: string; city: string; capacity: string; creditor?: string; stadiumDebt?: string; source: string; sourceDate: string; facilities: string[] }> = {
  Corinthians: { name: 'Neo Química Arena', city: 'São Paulo · SP', capacity: '49.205 lugares', creditor: 'Caixa Econômica Federal', stadiumDebt: 'Financiamento documentado; valor e saldo exigem balanço atualizado', source: 'https://www.corinthians.com.br/', sourceDate: 'Verificado em 15/10/2026', facilities: ['Gramado padrão FIFA', 'Iluminação para transmissões', 'Museu e tour da arena'] },
  'Fluminense FC': { name: 'Maracanã', city: 'Rio de Janeiro · RJ', capacity: '78.838 lugares', creditor: 'Concessionária / Estado do Rio de Janeiro', stadiumDebt: 'Operação e concessão; sem valor de dívida importado', source: 'https://www.maracana.com/', sourceDate: 'Verificado em 15/10/2026', facilities: ['Gramado padrão internacional', 'Acessibilidade e setores de hospitalidade', 'Operação por concessão'] },
  Flamengo: { name: 'Maracanã', city: 'Rio de Janeiro · RJ', capacity: '78.838 lugares', creditor: 'Concessionária / Estado do Rio de Janeiro', stadiumDebt: 'Operação e concessão; sem valor de dívida importado', source: 'https://www.maracana.com/', sourceDate: 'Verificado em 15/10/2026', facilities: ['Gramado padrão internacional', 'Acessibilidade e setores de hospitalidade', 'Operação por concessão'] },
  Palmeiras: { name: 'Allianz Parque', city: 'São Paulo · SP', capacity: '43.713 lugares', stadiumDebt: 'Contrato de operação; saldo não divulgado', source: 'https://www.palmeiras.com.br/', sourceDate: 'Verificado em 15/10/2026', facilities: ['Arena multiuso', 'Setores de hospitalidade', 'Centro de convenções e eventos'] },
}

const debtPaymentOptions = ['12 parcelas', '24 parcelas', '36 parcelas', '60 parcelas'] as const

const supporterProfiles: Record<string, { label: string; level: number; profile: string; source: string }> = {
  Corinthians: { label: 'Moral alta', level: 78, profile: 'Torcida de grande presença nacional; apoio tende a reagir a clássicos, desempenho e transparência.', source: 'https://www.corinthians.com.br/' },
  Flamengo: { label: 'Moral alta', level: 82, profile: 'Base nacional ampla; resultados e disputa por títulos pesam fortemente na percepção.', source: 'https://www.flamengo.com.br/' },
  Palmeiras: { label: 'Moral alta', level: 80, profile: 'Apoio elevado, com expectativa forte por títulos e desempenho competitivo.', source: 'https://www.palmeiras.com.br/' },
  'Fluminense FC': { label: 'Moral estável', level: 64, profile: 'Apoio tradicional; desempenho e calendário influenciam a temperatura das arquibancadas.', source: 'https://www.fluminense.com.br/' },
}

const supporterLevels = ['Torcida furiosa', 'Moral baixa', 'Moral estável', 'Moral alta', 'Torcida eufórica']

const competitions = [
  { name: 'Brasileirão Série A', region: 'Brasil', dates: '29 mar — 21 dez 2025', organizer: 'CBF', status: 'Temporada oficial', url: 'https://www.cbf.com.br/' },
  { name: 'Copa do Brasil', region: 'Brasil', dates: '19 fev — 09 nov 2025', organizer: 'CBF', status: 'Temporada oficial', url: 'https://www.cbf.com.br/' },
  { name: 'Brasileirão Série B', region: 'Brasil', dates: '05 abr — 22 nov 2025', organizer: 'CBF', status: 'Temporada oficial', url: 'https://www.cbf.com.br/' },
  { name: 'CONMEBOL Libertadores', region: 'América do Sul', dates: '05 fev — 29 nov 2025', organizer: 'CONMEBOL', status: 'Temporada oficial', url: 'https://www.conmebol.com/' },
  { name: 'CONMEBOL Sul-Americana', region: 'América do Sul', dates: '05 mar — 22 nov 2025', organizer: 'CONMEBOL', status: 'Temporada oficial', url: 'https://www.conmebol.com/' },
  { name: 'Mundial de Clubes FIFA', region: 'Mundo', dates: '14 jun — 13 jul 2025', organizer: 'FIFA', status: 'Competição oficial', url: 'https://www.fifa.com/' },
  { name: 'UEFA Champions League', region: 'Europa', dates: 'Calendário oficial UEFA 2025/26', organizer: 'UEFA', status: 'Temporada 2025/26', url: 'https://www.uefa.com/uefachampionsleague/' },
  { name: 'Premier League', region: 'Inglaterra', dates: '15 ago 2025 — 24 mai 2026', organizer: 'Premier League', status: 'Temporada 2025/26', url: 'https://www.premierleague.com/fixtures' },
  { name: 'LALIGA EA SPORTS', region: 'Espanha', dates: 'Calendário oficial 2025/26', organizer: 'LALIGA', status: 'Temporada 2025/26', url: 'https://www.laliga.com/en-GB/laliga-easports/standing' },
  { name: 'Bundesliga', region: 'Alemanha', dates: '22 ago 2025 — 16 mai 2026', organizer: 'DFL', status: 'Temporada 2025/26', url: 'https://www.bundesliga.com/en/bundesliga/table' },
  { name: 'AFC Champions League Elite', region: 'Ásia', dates: 'Calendário oficial AFC 2025/26', organizer: 'AFC', status: 'Temporada 2025/26', url: 'https://www.the-afc.com/en/club/afc_champions_league_elite.html' },
  { name: 'Concacaf Champions Cup', region: 'América do Norte', dates: 'Calendário oficial Concacaf', organizer: 'Concacaf', status: 'Competição oficial', url: 'https://www.concacaf.com/champions-cup/' },
]

type TransferRecord = { player: string; currentClub: string; origin: string; destination: string; date: string; type: string; fee: string; contractEnd: string; salary: string; status: 'Confirmada' | 'Rumor'; source: string; sourceDate: string }

const transferRecords: TransferRecord[] = [
  { player: 'Mercado de transferências', currentClub: 'Base verificável', origin: 'Não divulgado', destination: 'Não divulgado', date: 'A confirmar', type: 'Compra', fee: 'Não divulgado', contractEnd: 'Não divulgado', salary: 'Não divulgado', status: 'Confirmada', source: 'https://inside.fifa.com/transfer-system/transfer-reports', sourceDate: 'Última verificação: 15/10/2026' },
]

const transferWindow = { name: 'Janela nacional masculina', period: 'Duas janelas anuais de oito semanas', detail: 'Atletas envolvidos em estaduais podem se transferir para Séries A, B ou C até 11 de abril de 2025', source: 'https://www.cbf.com.br/a-cbf/noticias/informes-registro-transferencia/a/cbf-atualiza-regulamento-nacional-de-registro-e-transferencia-de-atletas-em-2025' }

const contractSources = [
  { name: 'FIFA · Transfer Reports', url: 'https://inside.fifa.com/transfer-system/transfer-reports' },
  { name: 'FIFA · Transfer System', url: 'https://inside.fifa.com/transfer-system/player-transfers' },
  { name: 'FIFA · Legal', url: 'https://www.fifa.com/legal' },
  { name: 'CBF · RNRTAF 2025', url: 'https://www.cbf.com.br/a-cbf/noticias/informes-registro-transferencia/a/cbf-atualiza-regulamento-nacional-de-registro-e-transferencia-de-atletas-em-2025' },
]

const calendarEvents = [
  { date: '15 FEV', time: '18:30', competition: 'Brasileirão Série A', match: 'Fluminense FC x Botafogo', venue: 'Maracanã · Rio de Janeiro', status: 'Próximo', source: 'CBF', url: 'https://www.cbf.com.br/' },
  { date: '22 FEV', time: '16:00', competition: 'Brasileirão Série A', match: 'Palmeiras x Fluminense FC', venue: 'Allianz Parque · São Paulo', status: 'Agendado', source: 'CBF', url: 'https://www.cbf.com.br/' },
  { date: '01 MAR', time: '21:30', competition: 'CONMEBOL Libertadores', match: 'A definir x Fluminense FC', venue: 'A definir', status: 'A confirmar', source: 'CONMEBOL', url: 'https://www.conmebol.com/' },
]

export default function Page() {
  const [active, setActive] = useState('Visão geral')
  const [selectedClub, setSelectedClub] = useState<(typeof clubs)[number]>(clubs[0])
  const [showClubPicker, setShowClubPicker] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [matchPlayed, setMatchPlayed] = useState(false)
  const [matchScore, setMatchScore] = useState<{ home: number; away: number } | null>(null)
  const [balance, setBalance] = useState(42800000)
  const [rosterQuery, setRosterQuery] = useState('')
  const [apiRoster, setApiRoster] = useState<RosterPlayer[]>([])
  const [rosterState, setRosterState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [tactic, setTactic] = useState('4-3-3')
  const [careerId, setCareerId] = useState<string | null>(null)
  const [careerStatus, setCareerStatus] = useState<'carregando' | 'salvo' | 'local'>('carregando')
  const [currentDate, setCurrentDate] = useState('2025-02-12T00:00:00.000Z')
  const [standings, setStandings] = useState<Record<string, Partial<StandingRow>>>({})
  useEffect(() => {
    let cancelled = false
    listCareers().then(async (items) => {
      if (cancelled) return
      const existing = items[0]
      if (existing) {
        const data = (existing.data ?? {}) as any
        setCareerId(existing.id); setCurrentDate(existing.currentDate.toISOString()); setBalance(existing.balance); setStandings(Array.isArray(data.standings) ? Object.fromEntries(data.standings.filter((row: any) => row?.clubId).map((row: any) => [row.clubId, row])) : (data.standings ?? {}))
        setCareerStatus('salvo')
      } else {
        const created = await createCareer({ clubId: selectedClub.short, clubName: selectedClub.name, balance, transferBudget: 12000000 })
        if (!cancelled) { setCareerId(created.id); setCareerStatus('salvo') }
      }
    }).catch(() => { if (!cancelled) setCareerStatus('local') })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    setRosterState('loading')
    fetch(`/api/football/squad?club=${encodeURIComponent(selectedClub.name)}`)
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => { if (cancelled) return; setApiRoster(ok ? (Array.isArray(data.players) ? data.players : []).map((player: any) => ({ name: typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : 'Jogador não identificado', pos: typeof player?.position === 'string' && player.position.trim() ? player.position.trim() : 'Não disponível', age: Number.isFinite(player?.age) ? player.age : 0, rating: 0, value: 'Não divulgado', status: player?.number ? `Camisa ${player.number}` : 'Registrado' })) : []); setRosterState(ok ? 'ready' : 'unavailable') })
      .catch(() => { if (!cancelled) { setApiRoster([]); setRosterState('unavailable') } })
    return () => { cancelled = true }
  }, [selectedClub.name])
  const roster = useMemo(() => {
    const seen = new Set<string>()
return apiRoster.filter((player) => {
  const name = typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : 'Jogador não identificado'
  const position = typeof player?.pos === 'string' && player.pos.trim() ? player.pos.trim() : 'Não disponível'
  const key = `${name.toLocaleLowerCase()}-${position.toLocaleLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [apiRoster])
  const filteredRoster = useMemo(() => roster.filter((player) => (player.name ?? '').toLowerCase().includes(rosterQuery.toLowerCase())), [roster, rosterQuery])
  const tableRows = useMemo(() => {
    const defaults: Record<string, StandingRow> = {
      PAL: { played: 7, wins: 5, draws: 2, losses: 0, points: 17, scored: 14, conceded: 5 },
      FLA: { played: 7, wins: 4, draws: 2, losses: 1, points: 14, scored: 13, conceded: 8 },
      BOT: { played: 7, wins: 4, draws: 1, losses: 2, points: 13, scored: 11, conceded: 8 },
      CAM: { played: 7, wins: 3, draws: 3, losses: 1, points: 12, scored: 10, conceded: 8 },
      [selectedClub.short]: { played: 7, wins: 4, draws: 3, losses: 0, points: 15, scored: 12, conceded: 6 },
    }
    const names: Record<string, string> = { PAL: 'Palmeiras', FLA: 'Flamengo', BOT: 'Botafogo', CAM: 'Atlético-MG', [selectedClub.short]: selectedClub.short }
    return Object.entries(defaults).map(([clubId, fallback]) => ({ clubId, name: names[clubId] ?? clubId, stats: { ...fallback, ...(standings[clubId] ?? {}) } })).sort((a, b) => compareStandings(a.stats, b.stats)).map((row, index) => ({ ...row, position: index + 1, goalDifference: row.stats.scored - row.stats.conceded }))
  }, [selectedClub.short, standings])
  const selectedStanding = tableRows.find((row) => row.clubId === selectedClub.short)?.stats
  const playedBeforeNextMatch = selectedStanding?.played ?? 7

  const [liveOpen, setLiveOpen] = useState(false)
  function simulateMatchAction() { if (!matchPlayed) setLiveOpen(true) }
  function finishLiveMatch(result: { home: number; away: number }) {
    applyMatchResult({ homeGoals: result.home, awayGoals: result.away })
  }
  function applyMatchResult(result: { homeGoals: number; awayGoals: number }) {
    const nextStandings = applyStandingsResult(standings, selectedClub.short, 'botafogo', result.homeGoals, result.awayGoals)
    const nextBalance = balance + 185000
    setMatchScore({ home: result.homeGoals, away: result.awayGoals })
    setStandings(nextStandings)
    setMatchPlayed(true)
    setBalance(nextBalance)
    if (careerId) saveCareer(careerId, { balance: nextBalance, standings: nextStandings, results: [{ date: currentDate, home: selectedClub.short, away: 'BOT', homeGoals: result.homeGoals, awayGoals: result.awayGoals }] }).then(() => setCareerStatus('salvo')).catch(() => setCareerStatus('local'))
  }

  return (
    <main className="football-app">
      {liveOpen && <LiveMatch home={{ name: selectedClub.name, short: selectedClub.short, color: selectedClub.color, rating: selectedClub.rating }} away={{ name: 'Botafogo', short: 'BOT', color: '#e8e8e8', rating: 76 }} roster={roster.map((p) => ({ name: p.name, pos: p.pos }))} seed={`${selectedClub.name}:${currentDate}`} onFinish={finishLiveMatch} onClose={() => setLiveOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Trophy /></div><div><strong>Clube Campeão</strong><span>WORLD</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X /></button></div>
        <div className="career-switcher" onClick={() => setShowClubPicker(true)} role="button" tabIndex={0}><div className="crest crest-small">{selectedClub.short.slice(0, 2)}</div><div><b>{selectedClub.name}</b><span>Carreira 01 · 2025</span></div><ChevronRight /></div>
        <nav className="main-nav">{nav.map(([label, Icon]) => <button key={label as string} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(label as string); setMobileOpen(false) }}><Icon /><span>{label as string}</span>{label === 'Notícias' && <i>3</i>}</button>)}</nav>
        <div className="sidebar-footer"><button className="nav-item"><Settings /><span>Configurações</span></button><div className="manager"><div className="avatar">RC</div><div><b>Rafael Costa</b><span>Presidente</span></div><button aria-label="Mais opções">•••</button></div></div>
      </aside>
      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}

      <section className="content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu /></button><div className="breadcrumb"><span>Carreira</span><ChevronRight /><b>{active}</b></div><div className="top-actions"><button className="icon-button" aria-label="Pesquisar"><Search /></button><button className="icon-button notification" aria-label="Notificações"><Bell /><i /></button><div className="season-pill"><span>Temporada</span><b>2025</b><ChevronRight /></div></div></header>
        <div className="page-wrap">
          <div className="page-heading"><div><p className="eyebrow">QUARTA-FEIRA, 12 DE FEVEREIRO DE 2025</p><h1>{active}</h1><p className="subtitle">Acompanhe cada decisão e construa a próxima era do seu clube.</p></div><div className="heading-actions"><span className="save-status"><span className="live-dot" /> {careerStatus === 'salvo' ? 'Salvo na carreira' : careerStatus === 'local' ? 'Modo local' : 'Sincronizando'}</span><button className="secondary-button" onClick={async () => { if (!careerId) return; try { const saved = await advanceCareerDay(careerId); setCurrentDate(saved.currentDate.toISOString()); setCareerStatus('salvo') } catch { const next = new Date(currentDate); next.setUTCDate(next.getUTCDate() + 1); setCurrentDate(next.toISOString()); setCareerStatus('local') } }}>Avançar dia</button><button className="primary-button" onClick={() => setShowClubPicker(true)}>Trocar clube</button></div></div>

          {active === 'Visão geral' && <>
            <section className="club-hero"><div className="hero-club"><div className="crest crest-large" style={{ background: `linear-gradient(145deg, ${selectedClub.color}, #112631)` }}>{selectedClub.short.slice(0, 2)}</div><div><p className="eyebrow">SEU CLUBE · BRASIL</p><h2>{selectedClub.name}</h2><p>{selectedClub.city} · {selectedClub.league}</p></div></div><div className="hero-metrics"><div><span>Reputação</span><b>{selectedClub.rating}<small>/100</small></b></div><div><span>Confiança da diretoria</span><b className="positive">84<small>/100</small></b></div><div><span>Objetivo da temporada</span><b>Top 8</b></div></div></section>
            <section className="dashboard-grid"><div className="card next-match"><div className="card-header"><div><span className="eyebrow">PRÓXIMA PARTIDA · BRASILEIRÃO</span><h3>Rodada {playedBeforeNextMatch + 1} <span>·</span> Em 3 dias</h3><p className="data-note">Histórico da carreira: {playedBeforeNextMatch} partidas disputadas</p></div><button className="more">•���•</button></div><div className="match-date">SÁBADO, 15 FEV · 18:30 <span>Maracanã · Rio de Janeiro</span></div><div className="match-teams"><div><div className="mini-crest">FLU</div><b>{selectedClub.short}</b><span>Casa</span></div><div className="versus"><b>{matchScore ? `${matchScore.home} — ${matchScore.away}` : '— — —'}</b><span>{matchPlayed ? 'Fim de jogo' : 'Pré-jogo'}</span></div><div><div className="mini-crest opponent">BOT</div><b>BOT</b><span>Visitante</span></div></div><button className="primary-button full" onClick={simulateMatchAction}>{matchPlayed ? 'Partida simulada' : 'Simular partida'} <Zap /></button></div>
            <div className="card standings"><div className="card-header"><div><span className="eyebrow">BRASILEIRÃO SÉRIE A</span><h3>Classificação</h3></div><button className="text-button" onClick={() => setActive('Competições')}>Abrir tabela <ChevronRight /></button></div><div className="table-head"><span>#</span><span>Clube</span><span>J</span><span>V</span><span>SG</span><span>GP</span><span>PTS</span></div>{tableRows.map((row) => <div className={`table-row ${row.clubId === selectedClub.short ? 'highlight' : ''}`} key={row.clubId}><span className="rank">{row.position}</span><span className="club-name"><i className="table-dot" />{row.name}</span><span>{row.stats.played}</span><span>{row.stats.wins}</span><span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span><span>{row.stats.scored}</span><b>{row.stats.points}</b></div>)}</div></section>
            <section className="lower-grid"><div className="card form-card"><div className="card-header"><div><span className="eyebrow">DESEMPENHO RECENTE</span><h3>Últimos resultados</h3></div><button className="text-button" onClick={() => setActive('Calendário')}>Calendário <ChevronRight /></button></div><div className="results"><Result opponent="CRU" name="Cruzeiro" score="2 — 0" result="V" date="08 FEV" /><Result opponent="GRE" name="Grêmio" score="1 — 1" result="E" date="02 FEV" /><Result opponent="VAS" name="Vasco" score="0 — 1" result="D" date="26 JAN" /></div></div><div className="card news-card"><div className="card-header"><div><span className="eyebrow">CENTRAL DO CLUBE</span><h3>Notícias e eventos</h3></div><button className="icon-button"><Bell /></button></div><div className="news-item"><span className="news-icon blue"><ArrowUpRight /></span><div><b>Receita de bilheteria atualizada</b><p>R$ 1,24 mi adicionados ao caixa</p></div><time>Hoje</time></div><div className="news-item"><span className="news-icon amber"><ClipboardList /></span><div><b>3 contratos perto do fim</b><p>Revise as renovações pendentes</p></div><time>Ontem</time></div></div></section>
          </>}

          {active === 'Elenco' && <section className="card roster-page"><div className="card-header"><div><span className="eyebrow">ELENCO REAL · {roster.length} JOGADORES</span><h3>Elenco do {selectedClub.short}</h3></div><button className="primary-button" onClick={() => setActive('Tática e escalação')}>Gerenciar escalação</button></div><div className="toolbar"><div className="search-field"><Search /><input value={rosterQuery} onChange={(e) => setRosterQuery(e.target.value)} placeholder="Pesquisar jogador" /></div><span className="coverage">API-Football · temporada atual · {rosterState === 'ready' ? 'verificado' : rosterState === 'loading' ? 'carregando' : 'indisponível'}</span></div>{rosterState === 'loading' ? <div className="roster-empty"><h3>Importando elenco oficial…</h3><p>Consultando a API-Football. Jogadores só aparecem depois da resposta da fonte.</p></div> : roster.length === 0 ? <div className="roster-empty"><div className="empty-icon"><Users /></div><h3>Elenco oficial indisponível</h3><p>Não foi possível obter o elenco deste clube na API-Football. Nenhum jogador fictício foi adicionado.</p><a href="https://www.api-football.com/" target="_blank" rel="noreferrer">Ver cobertura e documentação da API-Football</a></div> : <div className="roster-table"><div className="roster-head"><span>Jogador</span><span>Pos.</span><span>Idade</span><span>Avaliação</span><span>Valor de mercado</span><span>Status</span></div>{filteredRoster.map((player, index) => <div className="roster-row" key={`${player.name}-${player.pos}-${index}`}><div className="player-cell"><div className="player-avatar">{player.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div><b>{player.name}</b></div><span className="position-tag">{player.pos}</span><span>{player.age || 'Não divulgado'}</span><strong className="status-muted">Não divulgado</strong><span>{player.value}</span><span className="status-blue">{player.status}</span></div>)}</div>}</section>}
          {active === 'Tática e escalação' && <TacticsModule club={selectedClub.name} players={apiRoster} tactic={tactic} setTactic={setTactic} />}

          {active === 'Calendário' && <CalendarModule club={selectedClub.name} />}
          {active === 'Competições' && <CompetitionsModule />}
          {active === 'Mercado de transferências' && <TransferFlowMarket club={selectedClub.name} players={roster} balance={balance} setBalance={setBalance} setRoster={setApiRoster} />}
          {active === 'Contratos' && <ContractsModule club={selectedClub.name} players={roster} />}
          {active === 'Diretoria' && <BoardModule club={selectedClub.name} />}
          {active === 'Comissão técnica' && <StaffModule club={selectedClub.name} />}
          {active === 'Est��dio e infraestrutura' && <InfrastructureModule club={selectedClub.name} />}
          {active === 'Torcida' && <SupportersModule club={selectedClub.name} />}
          {active === 'Finanças' && <FinanceModule club={selectedClub.name} balance={balance} />}
          {active !== 'Visão geral' && active !== 'Elenco' && active !== 'Calendário' && active !== 'Competições' && active !== 'Mercado de transferências' && active !== 'Contratos' && active !== 'Diretoria' && active !== 'Comissão técnica' && active !== 'Estádio e infraestrutura' && active !== 'Torcida' && active !== 'Finanças' && <EmptyModule title={active} onAction={() => setActive('Visão geral')} />}
        </div>
      </section>
      {showClubPicker && <div className="modal-backdrop" onClick={() => setShowClubPicker(false)}><div className="club-modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">SELECIONAR CARREIRA</span><h2>Escolha seu clube</h2></div><button className="icon-button" onClick={() => setShowClubPicker(false)}><X /></button></div><p className="modal-copy">Cada clube possui uma realidade financeira, objetivos e desafios diferentes.</p>{clubs.map((club) => <button className={`club-option ${selectedClub.name === club.name ? 'selected' : ''}`} key={club.name} onClick={() => { setSelectedClub(club); setShowClubPicker(false) }}><div className="crest crest-small" style={{ background: club.color }}>{club.short.slice(0, 2)}</div><div><b>{club.name}</b><span>{club.city} · {club.league}</span></div><div className="club-option-meta"><span>Força <b>{club.rating}</b></span><ChevronRight /></div></button>)}</div></div>}
    </main>
  )
}

function TacticsModule({ club, players, tactic, setTactic }: { club: string; players: RosterPlayer[]; tactic: string; setTactic: (value: string) => void }) {
  const lineups = { '4-3-3': [{ p: 'GOL', x: 50, y: 88 }, { p: 'LD', x: 84, y: 70 }, { p: 'ZAG', x: 61, y: 72 }, { p: 'ZAG', x: 39, y: 72 }, { p: 'LE', x: 16, y: 70 }, { p: 'VOL', x: 50, y: 56 }, { p: 'MC', x: 68, y: 48 }, { p: 'MC', x: 32, y: 48 }, { p: 'PD', x: 82, y: 26 }, { p: 'ATA', x: 50, y: 20 }, { p: 'PE', x: 18, y: 26 }], '4-4-2': [{ p: 'GOL', x: 50, y: 88 }, { p: 'LD', x: 84, y: 70 }, { p: 'ZAG', x: 61, y: 72 }, { p: 'ZAG', x: 39, y: 72 }, { p: 'LE', x: 16, y: 70 }, { p: 'MD', x: 82, y: 48 }, { p: 'MC', x: 61, y: 48 }, { p: 'MC', x: 39, y: 48 }, { p: 'ME', x: 18, y: 48 }, { p: 'ATA', x: 62, y: 25 }, { p: 'ATA', x: 38, y: 25 }], '3-5-2': [{ p: 'GOL', x: 50, y: 88 }, { p: 'ZAG', x: 72, y: 70 }, { p: 'ZAG', x: 50, y: 74 }, { p: 'ZAG', x: 28, y: 70 }, { p: 'ALA', x: 88, y: 50 }, { p: 'VOL', x: 68, y: 48 }, { p: 'MC', x: 50, y: 42 }, { p: 'MC', x: 32, y: 48 }, { p: 'ALA', x: 12, y: 50 }, { p: 'ATA', x: 62, y: 24 }, { p: 'ATA', x: 38, y: 24 }] }
  const slots = lineups[tactic as keyof typeof lineups]
  return <section className="tactics-page"><div className="module-toolbar"><div><span className="eyebrow">COMANDO DO TÉCNICO · {club}</span><h2>Tática e escalação</h2><p>Formação com posições fixas no campo e jogadores sem repetição.</p></div><select value={tactic} onChange={(event) => setTactic(event.target.value)} aria-label="Escolher formação">{Object.keys(lineups).map((formation) => <option key={formation}>{formation}</option>)}</select></div><div className="tactics-grid"><div className="pitch"><div className="pitch-line" />{slots.map((slot, index) => <div className="pitch-player" style={{ left: `${slot.x}%`, top: `${slot.y}%` }} key={`${slot.p}-${index}`}><span>{players[index]?.name?.split(' ').slice(-1)[0] ?? 'Vaga'}</span><small>{slot.p}</small></div>)}</div><div className="card lineup-panel"><span className="eyebrow">ESCALAÇÃO SALVA</span><h3>Formação {tactic}</h3>{slots.map((slot, index) => <div className="lineup-row" key={`${slot.p}-${index}`}><span>{index + 1}</span><b>{players[index]?.name ?? 'Jogador não disponível'}</b><small>{slot.p}</small></div>)}<button className="primary-button full" onClick={() => setTactic(tactic)}>Salvar escalação</button></div></div><p className="data-note">A escalação é uma simulação da carreira. Atributos, pé dominante e avaliação aparecem como “Não divulgado” quando a API não os fornece.</p></section>
}

function CalendarModule({ club }: { club: string }) {
  const [filter, setFilter] = useState('Todas')
  const competitions = ['Todas', ...Array.from(new Set(calendarEvents.map((event) => event.competition)))]
  const events = calendarEvents.filter((event) => filter === 'Todas' || event.competition === filter).map((event) => ({ ...event, match: event.match.replace('Fluminense FC', club) }))
  return <section className="calendar-page"><div className="module-toolbar"><div><span className="eyebrow">AGENDA OFICIAL · TEMPORADA 2025</span><h2>Calendário de partidas</h2><p>Eventos organizados por competição, com fonte oficial indicada em cada registro.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar competição">{competitions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="calendar-list">{events.map((event) => <div className="card calendar-event" key={`${event.date}-${event.competition}`}><div className="calendar-date"><b>{event.date}</b><span>{event.time}</span></div><div className="calendar-event-main"><span className="eyebrow">{event.competition}</span><h3>{event.match}</h3><p>{event.venue}</p></div><div className="calendar-event-meta"><span className={`event-status ${event.status === 'Próximo' ? 'next' : ''}`}>{event.status}</span><a href={event.url} target="_blank" rel="noreferrer">Fonte: {event.source} <ChevronRight /></a></div></div>)}</div><p className="data-note">Calendário de referência. Datas, horários e mandos devem ser confirmados na entidade organizadora; APIs podem ter limitações de cobertura e não substituem as fontes oficiais.</p></section>
}

function CompetitionsModule() {
  const [region, setRegion] = useState('Todas')
  const regions = ['Todas', ...Array.from(new Set(competitions.map((competition) => competition.region)))]
  const filteredCompetitions = competitions.filter((competition) => region === 'Todas' || competition.region === region)
  return <section className="competitions-page"><div className="module-toolbar"><div><span className="eyebrow">CAMPEONATOS VERIFICADOS · TEMPORADAS 2025/26</span><h2>Competições</h2><p>Calendário e campeonatos conferidos nas entidades organizadoras oficiais.</p></div><select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Filtrar região">{regions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="competition-grid">{filteredCompetitions.map((competition) => <article className="card competition-card" key={competition.name}><div className="competition-card-top"><span className="source-badge">{competition.status}</span><span className="competition-region">{competition.region}</span></div><h3>{competition.name}</h3><p>{competition.dates}</p><div className="competition-organizer"><span>Organização</span><b>{competition.organizer}</b></div><a className="source-link" href={competition.url} target="_blank" rel="noreferrer">Ver calendário oficial <ChevronRight /></a></article>)}</div><p className="data-note">As datas foram conferidas nas páginas oficiais indicadas. Partidas, grupos e horários podem mudar; o jogo deve atualizar o evento quando a entidade organizadora publicar uma alteração.</p></section>
}

type MarketPlayer = RosterPlayer & { id: string; nationality: string; club: string; league: string; country: string; dataStatus: string; contractEnd: string; salary: string }

type MarketProposal = { id: string; player: MarketPlayer; amount: number; status: 'Pendente' | 'Recusada' | 'Contraproposta' | 'Concluída'; date: string }

function AdvancedTransferMarket({ club, players, balance, setBalance }: { club: string; players: RosterPlayer[]; balance: number; setBalance: (value: number | ((current: number) => number)) => void }) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('Todas')
  const [league, setLeague] = useState('Todas')
  const [tab, setTab] = useState('Mercado')
  const [catalog, setCatalog] = useState<MarketPlayer[]>([])
  const [apiResults, setApiResults] = useState<MarketPlayer[]>([])
  const [selected, setSelected] = useState<MarketPlayer | null>(null)
  const [offer, setOffer] = useState('')
  const [notice, setNotice] = useState('')
  const [favorites, setFavorites] = useState<string[]>([])
  const [proposals, setProposals] = useState<MarketProposal[]>([])
  const [aiMoves, setAiMoves] = useState<string[]>([])
  useEffect(() => { fetch('/api/football/market').then((response) => response.json()).then((data) => setCatalog(data.players ?? [])).catch(() => setNotice('Catálogo global indisponível. A API-Football continua acessível pela busca.')) }, [])
  const searchPlayers = async () => { if (!query.trim()) return; const response = await fetch(`/api/football/players?search=${encodeURIComponent(query)}`); const data = await response.json(); setApiResults((data.players ?? []).map((p: any) => ({ id: String(p.id), name: p.name, pos: p.position ?? 'Não disponível', age: p.age ?? 0, rating: 0, value: 'Não disponível', status: 'disponível', club: p.club ?? 'Não disponível', league: 'Não disponível', country: 'Não disponível', nationality: p.nationality ?? 'Não disponível', dataStatus: 'API-Football · real', contractEnd: 'Não disponível', salary: 'Não disponível' }))); setNotice(response.ok ? `${data.players?.length ?? 0} jogadores reais carregados pela API-Football.` : data.error ?? 'Consulta indisponível.') }
  const available = apiResults.length ? apiResults : catalog
  const filtered = available.filter((player) => (position === 'Todas' || player.pos.toLowerCase().includes(position.toLowerCase().slice(0, 3))) && (league === 'Todas' || player.league === league) && (!query || player.name.toLowerCase().includes(query.toLowerCase())))
  const sendOffer = () => { const amount = Number(offer); if (!selected || !amount || amount <= 0) return setNotice('Selecione um jogador e informe uma proposta válida.'); if (amount > balance) return setNotice('Proposta bloqueada: orçamento insuficiente.'); if (proposals.some((item) => item.player.id === selected.id && item.status === 'Pendente')) return setNotice('Já existe uma proposta pendente para este jogador.'); const status = amount >= 30000000 ? 'Contraproposta' : 'Recusada'; setProposals((items) => [...items, { id: `${selected.id}-${Date.now()}`, player: selected, amount, status, date: '12/02/2025' }]); setTab('Minhas propostas'); setNotice(status === 'Contraproposta' ? 'O clube respondeu com uma contraproposta simulada.' : 'A proposta foi recusada na simulação: oferta abaixo da necessidade do vendedor.') }
  const advanceAi = () => { const candidates = catalog.filter((player) => player.club !== club).slice(0, 3); setAiMoves(candidates.map((player) => `IA: ${player.club} observou ${player.name} (${player.pos}).`)); setNotice('Rodada de scouting da IA processada com limite de 3 alvos. Nenhuma transferência foi criada automaticamente.') }
  const list = tab === 'Minhas propostas' ? proposals.map((proposal) => proposal.player) : tab === 'Observação' ? catalog.filter((player) => favorites.includes(player.id)) : filtered
  return <section className="market-page advanced-market"><div className="transfer-header"><div><span className="eyebrow">CENTRAL GLOBAL · API + SIMULAÇÃO</span><h2>Mercado mundial</h2><p>Jogadores de vários clubes e ligas. Dados reais são identificados; preços, contratos e decisões são simulações da carreira.</p></div><div className="budget-chip"><span>Orçamento de {club}</span><b>{money.format(balance)}</b></div></div><div className="market-tabs">{['Mercado','Observação','Minhas propostas','Negociações','Transferências recentes','Notícias','Agentes livres'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="market-search card"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) searchPlayers() }} placeholder="Pesquisar no mercado mundial" aria-label="Pesquisar jogador" /></div><select value={position} onChange={(event) => setPosition(event.target.value)} aria-label="Filtrar posição"><option>Todas</option><option>GOL</option><option>DEF</option><option>MC</option><option>ATA</option></select><select value={league} onChange={(event) => setLeague(event.target.value)} aria-label="Filtrar liga"><option>Todas</option>{Array.from(new Set(catalog.map((player) => player.league))).filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select><button className="primary-button" onClick={searchPlayers}>Buscar API</button></div><div className="market-columns"><div><div className="market-result-head"><span>{list.length} jogadores · {apiResults.length ? 'API-Football' : 'catálogo disponível'}</span><small>Catálogo interno: referência de jogo, não fonte oficial</small></div><div className="player-market-list">{list.map((player, index) => <button className={`market-player ${selected?.id === player.id ? 'selected' : ''}`} onClick={() => setSelected(player)} key={`${player.id}-${index}`}><span className="player-avatar">{player.name.slice(0,2).toUpperCase()}</span><span><b>{player.name}</b><small>{player.club} · {player.country}</small></span><em>{player.pos}</em><strong>{player.age || 'N/D'}</strong><i onClick={(event) => { event.stopPropagation(); setFavorites((items) => items.includes(player.id) ? items.filter((id) => id !== player.id) : [...items, player.id]) }}>{favorites.includes(player.id) ? '★' : '☆'}</i></button>)}</div></div><div className="card data-boundary"><span className="eyebrow">MUNDO VIVO</span><p><b>IA dos clubes:</b> scouting determinístico com limite por ciclo.</p><button className="secondary-button full" onClick={advanceAi}>Processar rodada de IA</button>{aiMoves.map((move) => <p key={move}>{move}</p>)}<p><b>Dados:</b> {apiResults.length ? 'API-Football · reais' : 'catálogo de referência · simulado'}</p></div></div>{selected && <div className="card negotiation-card"><span className="eyebrow">PERFIL E PROPOSTA · {selected.dataStatus}</span><h3>{selected.name}</h3><p>{selected.club} · {selected.league} · {selected.nationality}</p><div className="player-facts"><span>Idade <b>{selected.age || 'Não disponível'}</b></span><span>Posição <b>{selected.pos}</b></span><span>Valor <b>{selected.value}</b></span><span>Contrato <b>{selected.contractEnd}</b></span></div><label>Oferta ao clube (R$)<input type="number" min="1" value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Valor simulado" /></label><button className="primary-button full" onClick={sendOffer}>Enviar proposta</button>{notice && <div className="action-notice">{notice}</div>}</div>}</section>
}

function TransferFlowMarket({ club, players, balance, setBalance, setRoster }: { club: string; players: RosterPlayer[]; balance: number; setBalance: (value: number | ((current: number) => number)) => void; setRoster: (value: RosterPlayer[] | ((current: RosterPlayer[]) => RosterPlayer[])) => void }) {
  const [tab, setTab] = useState('Mercado')
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('Todas')
  const [catalog, setCatalog] = useState<MarketPlayer[]>([])
  const [selected, setSelected] = useState<MarketPlayer | null>(null)
  const [offer, setOffer] = useState('')
  const [salary, setSalary] = useState('')
  const [notice, setNotice] = useState('')
  const [listed, setListed] = useState<string[]>([])
  const [incoming, setIncoming] = useState<{ player: RosterPlayer; amount: number; club: string }[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [apiResults, setApiResults] = useState<MarketPlayer[]>([])
  useEffect(() => { fetch('/api/football/market').then((response) => response.json()).then((data) => setCatalog(data.players ?? [])).catch(() => setNotice('Mercado global indisponível no momento.')) }, [])
  const candidates = (apiResults.length ? apiResults : catalog).filter((player) => (!query || player.name.toLowerCase().includes(query.toLowerCase())) && (position === 'Todas' || player.pos.toLowerCase().includes(position.toLowerCase().slice(0, 3))) && player.club !== club)
  const search = async () => { if (!query.trim()) return; const response = await fetch(`/api/football/players?search=${encodeURIComponent(query)}`); const data = await response.json(); setApiResults((data.players ?? []).map((p: any) => ({ id: String(p.id), name: p.name, pos: p.position ?? 'Não disponível', age: p.age ?? 0, rating: 0, value: 'Não disponível', status: 'disponível', club: p.club ?? 'Não disponível', league: 'Não disponível', country: p.nationality ?? 'Não disponível', nationality: p.nationality ?? 'Não disponível', dataStatus: 'API-Football · real', contractEnd: 'Não disponível', salary: 'Não disponível' }))); setNotice(response.ok ? 'Jogadores carregados pela API-Football.' : data.error ?? 'Busca indisponível.') }
  const buy = () => { const amount = Number(offer); const wage = Number(salary); if (!selected || !amount || !wage) return setNotice('Escolha um jogador e informe proposta e salário.'); if (amount > balance) return setNotice('Saldo insuficiente. Venda ou libere jogadores antes de negociar.'); if (salary && wage > 250000) return setNotice('Limite de folha salarial excedido para esta carreira.'); setBalance((current) => current - amount); setRoster((current) => [...current, { name: selected.name, pos: selected.pos, age: selected.age, rating: selected.rating, value: selected.value, status: `Contratado por ${club}` }]); setTab('Histórico'); setHistory((items) => [`Contratação de ${selected.name} por ${money.format(amount)} concluída.`, ...items]); setNotice(`${selected.name} foi adicionado ao elenco. Salário simulado: ${money.format(wage)}/mês.`) }
  const listPlayer = (player: RosterPlayer) => { if (listed.includes(player.name)) return setNotice('Este jogador já está na lista de transferências.'); setListed((items) => [...items, player.name]); setNotice(`${player.name} entrou na lista de transferências. A IA poderá enviar propostas.`) }
  const generateOffer = (player: RosterPlayer) => { if (!listed.includes(player.name)) return; setIncoming((items) => items.some((item) => item.player.name === player.name) ? items : [...items, { player, amount: 1800000, club: 'Clube interessado (IA)' }]); setNotice(`Proposta da IA recebida por ${player.name}.`) }
  const acceptSale = (item: { player: RosterPlayer; amount: number; club: string }) => { setBalance((current) => current + item.amount); setRoster((current) => current.filter((player) => player.name !== item.player.name)); setIncoming((items) => items.filter((candidate) => candidate.player.name !== item.player.name)); setHistory((items) => [`Venda de ${item.player.name} por ${money.format(item.amount)} concluída.`, ...items]); setNotice(`${item.player.name} saiu do elenco. ${money.format(item.amount)} foi somado ao orçamento.`) }
  const release = (player: RosterPlayer) => { setRoster((current) => current.filter((item) => item.name !== player.name)); setListed((items) => items.filter((name) => name !== player.name)); setHistory((items) => [`${player.name} foi liberado mediante rescisão simulada.`, ...items]); setNotice(`${player.name} foi liberado. Taxa de rescisão e impacto salarial: Não disponível.`) }
  return <section className="market-page advanced-market"><div className="transfer-header"><div><span className="eyebrow">MERCADO · COMPRA, VENDA E LIBERAÇÃO</span><h2>Central de transferências</h2><p>Fluxo de carreira inspirado em gestão futebolística: fundos, folha salarial e negociações simuladas; dados da API são identificados separadamente.</p></div><div className="budget-chip"><span>Orçamento disponível</span><b>{money.format(balance)}</b></div></div><div className="market-tabs">{['Mercado','Meu elenco','Propostas recebidas','Negociações','Histórico'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>{tab === 'Mercado' && <><div className="market-search card"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jogador por nome" aria-label="Buscar jogador" /></div><select value={position} onChange={(event) => setPosition(event.target.value)} aria-label="Filtrar posição"><option>Todas</option><option>GOL</option><option>DEF</option><option>MC</option><option>ATA</option></select><button className="primary-button" onClick={search}>Buscar jogadores</button></div><div className="market-flow-grid"><div className="player-market-list">{candidates.map((player) => <button className={`market-player ${selected?.id === player.id ? 'selected' : ''}`} onClick={() => setSelected(player)} key={player.id}><span className="player-avatar">{player.name.slice(0, 2).toUpperCase()}</span><span><b>{player.name}</b><small>{player.club} · {player.league}</small></span><em>{player.pos}</em><strong>{player.age || 'N/D'}</strong></button>)}</div><div className="card negotiation-card"><span className="eyebrow">COMPRA · PROPOSTA + CONTRATO</span><h3>{selected?.name ?? 'Selecione um jogador'}</h3><p>{selected ? `${selected.club} · ${selected.dataStatus}` : 'Verifique orçamento e folha antes de enviar.'}</p><label>Proposta de compra (R$)<input type="number" min="1" value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Valor simulado" /></label><label>Salário mensal (R$)<input type="number" min="1" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Limite da folha" /></label><button className="primary-button full" onClick={buy}>Enviar proposta</button>{notice && <div className="action-notice">{notice}</div>}</div></div></>}{tab === 'Meu elenco' && <div className="card transfer-roster"><span className="eyebrow">VENDA / DISPENSA · {players.length} JOGADORES</span><h3>Selecione um jogador para movimentar</h3>{players.map((player) => <div className="transfer-roster-row" key={player.name}><div><b>{player.name}</b><small>{player.pos} · {listed.includes(player.name) ? 'Na lista de transferências' : 'No elenco'}</small></div><button className="secondary-button" onClick={() => listPlayer(player)}>Colocar à venda</button><button className="text-button" onClick={() => release(player)}>Rescindir/liberar</button>{listed.includes(player.name) && <button className="text-button" onClick={() => generateOffer(player)}>Solicitar proposta IA</button>}</div>)}</div>}{tab === 'Propostas recebidas' && <div className="card transfer-roster"><span className="eyebrow">OFERTAS DA IA / OUTROS CLUBES</span><h3>Propostas aguardando decisão</h3>{incoming.length ? incoming.map((item) => <div className="transfer-roster-row" key={item.player.name}><div><b>{item.player.name}</b><small>{item.club} · {money.format(item.amount)}</small></div><button className="primary-button" onClick={() => acceptSale(item)}>Aceitar venda</button><button className="text-button" onClick={() => setNotice(`Contraproposta enviada por ${item.player.name}.`) }>Contraproposta</button><button className="text-button" onClick={() => setIncoming((items) => items.filter((candidate) => candidate.player.name !== item.player.name))}>Recusar</button></div>) : <p className="data-note">Nenhuma proposta recebida. Coloque jogadores à venda e solicite uma rodada de scouting da IA.</p>}</div>}{tab === 'Negociações' && <div className="card transfer-roster"><span className="eyebrow">FLUXO DE NEGOCIAÇÃO</span><h3>Etapas e pendências</h3><p className="data-note">A compra valida saldo e folha; a venda valida lista e gera proposta; a contratação só é concluída após proposta válida.</p>{notice && <div className="action-notice">{notice}</div>}</div>}{tab === 'Histórico' && <div className="card transfer-roster"><span className="eyebrow">HISTÓRICO DA CARREIRA</span><h3>Movimentações registradas</h3>{history.length ? history.map((item, index) => <div className="history-row" key={`${item}-${index}`}>{item}</div>) : <p className="data-note">Nenhuma movimentação concluída ainda.</p>}</div>}</section>
}

function TransferMarketModule({ club, players }: { club: string; players: RosterPlayer[] }) {
  const [filter, setFilter] = useState('Todos')
  const [notice, setNotice] = useState('')
  const [proposals, setProposals] = useState<string[]>([])
  const filtered = transferRecords.filter((record) => filter === 'Todos' || record.status === filter)
  const createProposal = (type: string) => { setProposals((current) => [...current, type]); setNotice(`${type} criada como simulação para ${club}. Nenhum acordo real foi alterado.`) }
  return <section className="market-page"><div className="module-toolbar"><div><span className="eyebrow">MERCADO DE TRANSFERÊNCIAS · FIFA / CBF</span><h2>Mercado e negociações</h2><p className="player-source-note">{players.length} jogadores disponíveis no elenco atual; expanda a integração por ligas para consultar atletas de outros clubes.</p><p>Registros confirmados ficam separados de rumores e propostas criadas na carreira.</p></div><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar status"><option>Todos</option><option>Confirmada</option><option>Rumor</option></select></div><div className="market-actions"><button className="primary-button" onClick={() => createProposal('Proposta de contratação')}>Contratar jogador</button><button className="secondary-button" onClick={() => createProposal('Proposta de empréstimo')}>Pedir empréstimo</button><button className="secondary-button" onClick={() => createProposal('Proposta de venda')}>Vender jogador</button></div>{notice && <div className="card provenance"><p>{notice}</p></div>}<div className="card window-card"><div><span className="eyebrow">JANELA REGULATÓRIA</span><h3>{transferWindow.name}</h3><p>{transferWindow.period}. {transferWindow.detail}</p></div><a href={transferWindow.source} target="_blank" rel="noreferrer">Regulamento CBF <ChevronRight /></a></div><div className="market-list">{filtered.map((record) => <article className="card transfer-card" key={record.player}><div className="transfer-player"><div className="player-avatar">{record.player.slice(0, 2).toUpperCase()}</div><div><h3>{record.player}</h3><span>{record.status} · {record.sourceDate}</span></div></div><div className="transfer-route"><span>{record.origin}</span><ChevronRight /><b>{record.destination}</b></div><div className="transfer-details"><span>Tipo <b>{record.type}</b></span><span>Valor <b>{record.fee}</b></span><span>Contrato até <b>{record.contractEnd}</b></span><span>Salário/bônus <b>{record.salary}</b></span></div><a href={record.source} target="_blank" rel="noreferrer">Fonte verificadora <ChevronRight /></a></article>)}</div>{proposals.length > 0 && <div className="card simulation-card"><span className="eyebrow">SIMULAÇÕES DA CARREIRA</span><h3>{proposals.length} proposta(s) em negociação</h3><p>As propostas são fictícias, não representam contratos reais e podem ser aprovadas, recusadas ou canceladas pela diretoria.</p></div>}<p className="data-note">Quando FIFA, CBF ou uma fonte confiável não divulgam valor, contrato, salário ou bônus, o jogo mostra “Não divulgado”.</p></section>
}

function ContractsModule({ club, players }: { club: string; players: RosterPlayer[] }) {
  const [notice, setNotice] = useState('')
  const [contractAction, setContractAction] = useState('')
  const runAction = (action: string) => { setContractAction(action); setNotice(`${action} registrada como simulação para ${club}. Valores e cláusulas precisam ser negociados no jogo.`) }
  return <section className="market-page"><div className="module-toolbar"><div><span className="eyebrow">CONTRATOS DE JOGADORES · SIMULAÇÃO</span><h2>Contratos e renovações</h2><p className="player-source-note">Vínculos do elenco atual: {players.length} jogadores. Selecione um atleta para iniciar renovação, empréstimo ou venda.</p><p>Gerencie vínculo, salário, bônus, empréstimos e rescisões sem alterar dados reais.</p></div><span className="status-blue">Carreira ativa</span></div>{notice && <div className="card provenance"><p>{notice}</p></div>}<div className="contract-actions"><div className="card action-card"><span className="eyebrow">NEGOCIAR</span><h3>Novo contrato</h3><p>Defina duração, salário fixo, bônus e multa rescisória.</p><button className="primary-button" onClick={() => runAction('Negociação de novo contrato')}>Iniciar negociação</button></div><div className="card action-card"><span className="eyebrow">VÍNCULO</span><h3>Renovação</h3><p>Evite jogador livre e compare contrapropostas do atleta.</p><button className="secondary-button" onClick={() => runAction('Renovação de contrato')}>Propor renovação</button></div><div className="card action-card"><span className="eyebrow">ENCERRAMENTO</span><h3>Rescisão</h3><p>Calcule multa, aviso prévio e impacto esportivo antes de encerrar.</p><button className="secondary-button" onClick={() => runAction('Pedido de rescisão')}>Simular rescisão</button></div></div><div className="card contract-table"><div className="table-head"><span>Jogador</span><span>Clube</span><span>Fim do contrato</span><span>Salário</span></div>{players.length ? players.slice(0, 12).map((player, index) => <div className="finance-row" key={`${player.name}-${player.pos}-${index}`}><b>{player.name}</b><span>{club} · {player.pos}</span><span>Não divulgado</span><span>Não divulgado</span></div>) : <div className="finance-row"><b>Dados do elenco</b><span>{club}</span><span>Não divulgado</span><span>Não divulgado</span></div>}<div className="contract-footnote">Sem fonte pública confirmando duração ou salário, nenhum valor é inventado. Ações e cláusulas desta carreira são simulação.</div></div><div className="card source-panel"><span className="eyebrow">REGRAS E REFERÊNCIAS</span><h3>Fontes oficiais de contratos e transferências</h3><div className="source-grid">{contractSources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.name}>{source.name} <ChevronRight /></a>)}</div></div>{contractAction && <p className="data-note">Última ação: {contractAction}. Todas as alterações nesta tela são simuladas e não modificam uma carreira salva sem confirmação.</p>}</section>
}

function BoardModule({ club }: { club: string }) {
  const [notice, setNotice] = useState('')
  const [objective, setObjective] = useState('')
  const actions = ['Aprovar orçamento', 'Definir meta esportiva', 'Reunir conselho', 'Avaliar comissão técnica']
  return <section className="management-page"><div className="management-hero card"><div><span className="eyebrow">SALA DA PRESIDÊNCIA</span><h2>Diretoria do {club}</h2><p>Você acumula a presidência e o comando técnico. Tome decisões estratégicas sem perder o controle do futebol.</p></div><div className="role-stack"><span>Presidente</span><span>Técnico</span></div></div><div className="management-grid"><div className="card leadership-card"><span className="eyebrow">SEU MANDATO</span><h3>Centro de decisões</h3><div className="leadership-row"><span>Autonomia</span><b>100%</b></div><div className="leadership-row"><span>Confiança do conselho</span><b>Alta</b></div><div className="leadership-row"><span>Pressão da torcida</span><b className="pressure">Moderada</b></div><div className="leadership-row"><span>Próxima eleição</span><b>Não definida</b></div></div><div className="card action-card"><span className="eyebrow">DECISÃO EXECUTIVA</span><h3>Registrar decisão</h3><p>Escolha uma pauta e registre a ação na carreira. Ela será simulada e poderá afetar objetivos futuros.</p><select value={objective} onChange={(event) => setObjective(event.target.value)} aria-label="Escolher decisão"><option value="">Selecione uma pauta</option>{actions.map((action) => <option key={action}>{action}</option>)}</select><button className="primary-button" disabled={!objective} onClick={() => setNotice(`${objective} registrada pelo presidente do ${club}.`)}>Confirmar decisão</button>{notice && <span className="action-notice">{notice}</span>}</div></div><div className="card board-table"><div className="section-title"><div><span className="eyebrow">ESTRUTURA</span><h3>Áreas sob sua responsabilidade</h3></div><button className="secondary-button" onClick={() => setNotice('Reunião extraordinária convocada.')}>Convocar reunião</button></div><div className="board-roles"><div><b>Presidência</b><span>Você · responsável final</span></div><div><b>Futebol profissional</b><span>Você · decisões esportivas</span></div><div><b>Finanças</b><span>Você + diretoria financeira</span></div><div><b>Patrimônio e estádio</b><span>Conselho administrativo</span></div></div></div><p className="data-note">As decisões da diretoria são simuladas no jogo. Nenhum dirigente real ou informação institucional é inferido.</p></section>
}

function StaffModule({ club }: { club: string }) {
  const [notice, setNotice] = useState('')
  const [training, setTraining] = useState('')
  const staffActions = ['Treino de intensidade', 'Treino tático', 'Recuperação física', 'Análise do adversário']
  return <section className="management-page"><div className="management-hero card"><div><span className="eyebrow">CENTRO DE TREINAMENTO</span><h2>Comissão técnica</h2><p>Você é o técnico do {club}. Monte a rotina, delegue responsabilidades e prepare o time para o calendário.</p></div><div className="role-stack"><span>Head coach</span><span>Presidente</span></div></div><div className="staff-grid"><div className="card staff-lead"><span className="eyebrow">COMANDO TÉCNICO</span><h3>Você · Técnico principal</h3><p>Responsável por escalação, tática, treinos, entrevistas e decisões durante a partida.</p><div className="staff-stats"><span><b>78</b> Gestão</span><span><b>84</b> Tática</span><span><b>81</b> Motivação</span></div></div><div className="card action-card"><span className="eyebrow">PLANO DA SEMANA</span><h3>Definir treinamento</h3><p>Escolha o foco para o próximo ciclo de preparação.</p><select value={training} onChange={(event) => setTraining(event.target.value)} aria-label="Escolher treinamento"><option value="">Selecione o foco</option>{staffActions.map((action) => <option key={action}>{action}</option>)}</select><button className="primary-button" disabled={!training} onClick={() => setNotice(`${training} definido pelo técnico para o ${club}.`)}>Salvar plano</button>{notice && <span className="action-notice">{notice}</span>}</div></div><div className="card staff-table"><div className="section-title"><div><span className="eyebrow">EQUIPE DE APOIO</span><h3>Funções da comissão</h3></div><button className="secondary-button" onClick={() => setNotice('Busca por profissional aberta no mercado.')}>Contratar profissional</button></div><div className="staff-list"><div><b>Auxiliar técnico</b><span>Vaga disponível · Não divulgado</span><button onClick={() => setNotice('Negociação com auxiliar técnico iniciada.')}>Negociar</button></div><div><b>Preparador físico</b><span>Vaga disponível · Não divulgado</span><button onClick={() => setNotice('Negociação com preparador físico iniciada.')}>Negociar</button></div><div><b>Analista de desempenho</b><span>Vaga disponível · Não divulgado</span><button onClick={() => setNotice('Negociação com analista iniciada.')}>Negociar</button></div><div><b>Treinador de goleiros</b><span>Vaga disponível · Não divulgado</span><button onClick={() => setNotice('Negociação com treinador de goleiros iniciada.')}>Negociar</button></div></div></div><p className="data-note">A comissão é uma estrutura simulada da carreira. Contratações, salários e qualificações ficam como negociação do jogo.</p></section>
}

function InfrastructureModule({ club }: { club: string }) {
  const [notice, setNotice] = useState('')
  const [project, setProject] = useState('')
  const fallback: { name: string; city: string; capacity: string; creditor?: string; stadiumDebt?: string; source: string; sourceDate: string; facilities: string[] } = { name: 'Estádio não cadastrado', city: 'Dados não divulgados', capacity: 'Não divulgado', source: 'https://www.cbf.com.br/', sourceDate: 'Fonte a confirmar', facilities: [] }
  const stadium = stadiumsByClub[club] ?? fallback
  const projects = ['Reformar gramado', 'Ampliar centro de treinamento', 'Melhorar acessibilidade', 'Instalar tecnologia de estádio']
  return <section className="management-page"><div className="management-hero card"><div><span className="eyebrow">PATRIMÔNIO DO CLUBE</span><h2>{stadium.name}</h2><p>{stadium.city} · Capacidade: {stadium.capacity}</p></div><span className="status-blue">Infraestrutura</span></div><div className="management-grid"><div className="card leadership-card"><span className="eyebrow">ESTRUTURA VERIFICADA</span><h3>Recursos cadastrados</h3>{stadium.facilities.length ? stadium.facilities.map((facility) => <div className="leadership-row" key={facility}><span>{facility}</span><b>Disponível</b></div>) : <div className="leadership-row"><span>Detalhes</span><b>Não divulgado</b></div>}<a className="source-link" href={stadium.source} target="_blank" rel="noreferrer">Fonte: {stadium.sourceDate} <ChevronRight /></a></div><div className="card action-card"><span className="eyebrow">OBRA E INVESTIMENTO</span><h3>Planejar melhoria</h3><p>Projetos criados aqui são simulações da sua carreira e afetam orçamento e satisfação.</p><select value={project} onChange={(event) => setProject(event.target.value)} aria-label="Escolher projeto"><option value="">Selecione uma melhoria</option>{projects.map((item) => <option key={item}>{item}</option>)}</select><button className="primary-button" disabled={!project} onClick={() => setNotice(`${project} incluído no planejamento de ${club}.`)}>Adicionar ao plano</button>{notice && <span className="action-notice">{notice}</span>}</div></div><div className="card stadium-debt-card"><span className="eyebrow">DÍVIDA E OPERAÇÃO</span><h3>{stadium.creditor ? `Credor: ${stadium.creditor}` : 'Credor não informado'}</h3><p>{stadium.stadiumDebt ?? 'Não há dívida de estádio confirmada nos dados carregados.'}</p><span className="data-note">Não divulgado significa que não há valor público confirmado, não que a dívida não exista.</span></div><p className="data-note">Fontes institucionais do clube/estádio. Capacidade e infraestrutura podem variar por configuração e evento; sempre confirme no comunicado oficial.</p></section>
}

function SupportersModule({ club }: { club: string }) {
  const [morale, setMorale] = useState<number | null>(null)
  const profile = supporterProfiles[club] ?? { label: 'Moral estável', level: 50, profile: 'Perfil de torcida ainda não verificado para este clube.', source: 'https://www.cbf.com.br/' }
  const currentLevel = morale ?? profile.level
  const currentLabel = morale === null ? profile.label : currentLevel < 25 ? 'Torcida furiosa' : currentLevel < 45 ? 'Moral baixa' : currentLevel < 70 ? 'Moral estável' : currentLevel < 90 ? 'Moral alta' : 'Torcida eufórica'
  return <section className="management-page"><div className="management-hero card"><div><span className="eyebrow">RELACIONAMENTO COM A TORCIDA</span><h2>{club}</h2><p>{profile.profile}</p></div><span className={`morale-badge morale-${currentLabel.toLowerCase().replaceAll(' ', '-')}`}>{currentLabel}</span></div><div className="supporter-score card"><div><span className="eyebrow">TERMÔMETRO DA ARQUIBANCADA</span><h3>Humor da torcida</h3><p>Indicador simulado da carreira, recalculado pelas decisões e resultados do clube.</p></div><strong>{currentLevel}<small>/100</small></strong><div className="morale-meter"><span style={{ width: `${currentLevel}%` }} /></div></div><div className="supporter-actions"><button className="secondary-button" onClick={() => setMorale(Math.max(0, currentLevel - 12))}>Resultado ruim</button><button className="primary-button" onClick={() => setMorale(Math.min(100, currentLevel + 12))}>Vitória importante</button><button className="secondary-button" onClick={() => setMorale(Math.min(100, currentLevel + 6))}>Ação com torcedores</button></div><div className="card source-panel"><span className="eyebrow">DADO E CONTEXTO</span><h3>Perfil público da torcida</h3><p>Pesquisas de torcida e presença de público variam por instituto e ano. O jogo não inventa um número nacional único; usa um indicador simulado para a carreira.</p><a href={profile.source} target="_blank" rel="noreferrer">Ver fonte institucional do clube <ChevronRight /></a></div></section>
}

function FinanceModule({ club, balance }: { club: string; balance: number }) {
  const [notice, setNotice] = useState('')
  const [installmentPlan, setInstallmentPlan] = useState('')
  const [loanRequested, setLoanRequested] = useState(false)
  const [stadiumProposal, setStadiumProposal] = useState(false)
  const clubSponsorships: Sponsorship[] = sponsorshipsByClub[club] ?? []
  const [activeDeals, setActiveDeals] = useState(clubSponsorships.map((item) => item.company))
  const record = debtRecords[club]
  const stadium = stadiumsByClub[club] ?? { name: 'Estádio municipal', city: 'Dados não importados', capacity: 'Não informado' }
  const terminate = (company: string) => { setActiveDeals((current) => current.filter((item) => item !== company)); setNotice(`Rescisão simulada registrada para ${company}. Consulte as penalidades no contrato.`) }
  return <section className="finance-page">
    <div className="finance-summary"><div className="card finance-lead"><span className="eyebrow">LIVRO ÚNICO DA CARREIRA · SIMULAÇÃO</span><h2>Central financeira</h2><p>Caixa, dívidas, operação e contratos comerciais da carreira ficam reunidos nesta aba.</p><div className="finance-balance">{money.format(balance)}<small>caixa disponível · {club}</small></div></div><div className="card source-snapshot"><span className="eyebrow">REFERÊNCIA EY · {eySnapshot.period}</span><h3>Panorama documentado</h3><div className="snapshot-grid"><span>Receita Série A <b>{eySnapshot.revenue}</b></span><span>Dívida líquida <b>{eySnapshot.netDebt}</b></span><span>Empréstimos <b>{eySnapshot.loans}</b></span><span>Dívida tributária <b>{eySnapshot.taxDebt}</b></span></div><a href={financialSources.ey} target="_blank" rel="noreferrer">Consultar fonte EY <ChevronRight /></a></div></div>
    <div className="section-title"><div><h3>Fluxo de caixa e obrigações</h3><span>Dados simulados separados da contabilidade histórica</span></div><button className="primary-button" onClick={() => setNotice('Movimento pronto para registro no livro da carreira.')}>Registrar movimento</button></div>
    <div className="finance-actions"><div className="card action-card"><span className="eyebrow">PAGAR OU PARCELAR</span><h3>Plano para dívida</h3><p>Crie um cronograma simulado sem alterar o histórico publicado do clube.</p><select value={installmentPlan} onChange={(event) => setInstallmentPlan(event.target.value)}><option value="">Escolha o número de parcelas</option>{debtPaymentOptions.map((option) => <option key={option}>{option}</option>)}</select><button className="primary-button" disabled={!installmentPlan} onClick={() => setNotice(`Plano de ${installmentPlan} criado para análise da diretoria.`)}>Criar parcelamento</button></div><div className="card action-card"><span className="eyebrow">CRÉDITO SIMULADO</span><h3>Solicitar empréstimo</h3><p>Receba uma proposta com juros, prazo e impacto no caixa da carreira.</p><button className="primary-button" onClick={() => { setLoanRequested(true); setNotice('Proposta de empréstimo enviada para aprovação da diretoria.') }}>{loanRequested ? 'Proposta enviada' : 'Pedir empréstimo'}</button></div></div>
    {notice && <div className="card provenance"><p>{notice}</p></div>}
    <div className="finance-columns"><div className="card finance-table"><div className="table-head"><span>Data</span><span>Descrição</span><span>Categoria</span><span>Valor</span></div><div className="finance-row"><span>12 fev</span><b>Receita de bilheteria</b><span>Matchday</span><strong className="finance-positive">+ R$ 1,24 mi</strong></div><div className="finance-row"><span>10 fev</span><b>Folha salarial mensal</b><span>Salários</span><strong className="finance-negative">− R$ 8,42 mi</strong></div><div className="finance-row"><span>02 fev</span><b>Premiação de rodada</b><span>Competição</span><strong className="finance-positive">+ R$ 185 mil</strong></div><div className="finance-row"><span>Vencimento</span><b>{record ? 'Dívida documentada do clube' : 'Obrigações sem dado verificado'}</b><span>Passivos</span><strong>{record?.gross ?? 'Não divulgado'}</strong></div></div><div className="card rules-card"><span className="eyebrow">DADOS HISTÓRICOS · {record?.period ?? 'sem registro'}</span><h3>{record ? `Endividamento: ${record.gross}` : 'Dívida não divulgada'}</h3><p>{record ? `${record.sourceLabel}. Tributos, empréstimos e dívida líquida não são inferidos quando a fonte não os separa.` : 'O app não inventa valores. Consulte balanços oficiais para atualizar este clube.'}</p><a href={record?.source ?? financialSources.central} target="_blank" rel="noreferrer">Abrir fonte financeira <ChevronRight /></a></div></div>
    <div className="card stadium-card"><div><span className="eyebrow">ESTÁDIO E INFRAESTRUTURA</span><h3>{stadium.name}</h3><p>{stadium.city} · {stadium.capacity}</p>{stadium.creditor && <span className="stadium-creditor">Credor/operador: <b>{stadium.creditor}</b><br />{stadium.stadiumDebt}</span>}</div><button className="primary-button" onClick={() => { setStadiumProposal(true); setNotice('Proposta comercial de naming rights criada para aprovação.') }}>{stadiumProposal ? 'Proposta criada' : 'Negociar naming rights'}</button></div>
    <div className="section-title"><div><h3>Patrocínios e naming rights</h3><span>Documentados em fontes públicas; negociações abaixo são simuladas</span></div><button className="primary-button" onClick={() => setNotice('Nova rodada de negociação aberta para empresas do mercado brasileiro.')}>Negociar parceiro</button></div>
    <div className="card sponsorship-table"><div className="table-head"><span>Empresa</span><span>Propriedade</span><span>Valor anual</span><span>Status / ação</span></div>{clubSponsorships.length > 0 ? clubSponsorships.map((deal) => <div className="finance-row" key={deal.company}><b>{deal.company}</b><span>{deal.slot}</span><span>{deal.annual}</span><span>{activeDeals.includes(deal.company) ? <button className="text-button" onClick={() => terminate(deal.company)}>Rescindir simulação</button> : <span className="status-muted">Encerrado na carreira</span>} <a href={deal.source} target="_blank" rel="noreferrer" className="source-link">Fonte</a></span></div>) : <div className="sponsorship-empty"><Coins /><strong>Nenhum patrocínio verificado carregado para {club}</strong><span>Os contratos do Corinthians não são exibidos em outros clubes.</span></div>}</div>
    <div className="finance-columns"><div className="card rules-card"><span className="eyebrow">MERCADO BRASILEIRO</span><h3>Empresas para negociação</h3><p>Catálogo de prospecção: presença cadastral não significa interesse confirmado nem patrocínio atual.</p><div className="company-chips">{marketCompanies.map((company) => <button key={company} onClick={() => setNotice(`Proposta simulada preparada para ${company}.`)}>{company}</button>)}</div></div><div className="card rules-card"><span className="eyebrow">NAMING RIGHTS</span><h3>Maracanã · oportunidade comercial</h3><p>Nome histórico preservado. Crie uma proposta simulada com valor, prazo, pagamento e cláusula de encerramento.</p><button className="primary-button" onClick={() => setNotice('Proposta de naming rights criada para análise da diretoria.')}>Criar proposta</button></div></div>
    <p className="data-note">Fonte de patrocínios: GE, balanço informado do Corinthians, consulta de 23/04/2026. Mapa IBOPE Repucom 2025: 164 marcas na Série A, sem divulgar necessariamente o valor individual de cada contrato. Valores não documentados permanecem como “não divulgado”.</p>
  </section>
}

function DebtModule({ club }: { club: string }) {
  const record = debtRecords[club]
  return <section className="debt-page"><div className="section-title"><div><span className="eyebrow">DADOS HISTÓRICOS · NÃO SIMULADOS</span><h2>Endividamento de {club}</h2><span>Indicadores exibidos com período, fonte e nível de confiança.</span></div><button className="text-button">Comparar clubes <ChevronRight /></button></div>{record ? <><div className="debt-grid"><DebtMetric label="Dívida bruta / passivo divulgado" value={record.gross} /><DebtMetric label="Dívida líquida" value={record.net} /><DebtMetric label="Dívida tributária" value={record.tax} /><DebtMetric label="Empréstimos" value={record.loans} /></div><div className="card provenance"><div><span className="eyebrow">PROVENIÊNCIA DO REGISTRO</span><h3>{record.sourceLabel}</h3><p>{record.period} · {record.confidence}</p></div><a href={record.source} target="_blank" rel="noreferrer">Abrir fonte <ChevronRight /></a></div></> : <div className="card no-data"><Coins /><h3>Sem dívida verificada para este clube</h3><p>Não há valor confiável importado para {club} no catálogo atual. O aplicativo não transforma ausência de informação em estimativa.</p><a href={financialSources.central} target="_blank" rel="noreferrer">Consultar Central de Balanços <ChevronRight /></a></div>}<p className="data-note">Metodologia: dívida bruta, líquida, passivos, tributos e empréstimos são conceitos distintos. O levantamento EY consolida clubes da Série A e informa que os dados foram obtidos de demonstrações financeiras publicadas; números individuais de terceiros permanecem identificados como referência jornalística.</p></section>
}

function DebtMetric({ label, value }: { label: string; value: string }) { return <div className="card debt-metric"><span>{label}</span><b>{value}</b><small>Período de referência informado na fonte</small></div> }

function Metric({ title, value, change, note, icon: Icon, positive }: { title: string; value: string; change: string; note: string; icon: React.ElementType; positive?: boolean }) { return <div className="metric-card"><div className="metric-icon"><Icon /></div><span>{title}</span><b>{value}</b><div className={positive ? 'metric-change positive' : 'metric-change'}>{positive ? <ArrowUpRight /> : <span>•</span>} {change} <small>{note}</small></div></div> }
function Result({ opponent, name, score, result, date }: { opponent: string; name: string; score: string; result: string; date: string }) { return <div className="result-row"><span className={`result-badge ${result === 'V' ? 'win' : result === 'E' ? 'draw' : 'loss'}`}>{result}</span><div className="mini-crest">{opponent}</div><b>{name}</b><strong>{score}</strong><time>{date}</time></div> }
function EmptyModule({ title, onAction }: { title: string; onAction: () => void }) { return <div className="empty-module"><div className="empty-icon"><Zap /></div><span className="eyebrow">MÓDULO DA CARREIRA</span><h2>{title}</h2><p>O núcleo de gestão está conectado à sua carreira. Este módulo está preparado para receber dados e ações da simulação.</p><button className="primary-button" onClick={onAction}>Voltar ao painel</button></div> }
