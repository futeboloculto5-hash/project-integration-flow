export type ClubReference = {
  id: string
  name: string
  short: string
  city: string
  country: string
  league: string
  division: string
  rating: number
  stadium: string
  capacity: number
  color: string
  source: string
  season: string
}

export type PlayerReference = {
  id: string
  clubId: string
  name: string
  pos: string
  age: number
  rating: number
  value: string
  status: 'Titular' | 'Reserva'
  dataStatus: 'referência de jogo'
}

export const worldClubs: ClubReference[] = [
  {id:'flamengo',name:'Flamengo',short:'FLA',city:'Rio de Janeiro',country:'Brasil',league:'Série A',division:'1ª divisão',rating:84,stadium:'Maracanã',capacity:78838,color:'#d51f2e',source:'https://www.flamengo.com.br/',season:'2025'},
  {id:'palmeiras',name:'Palmeiras',short:'PAL',city:'São Paulo',country:'Brasil',league:'Série A',division:'1ª divisão',rating:86,stadium:'Allianz Parque',capacity:43713,color:'#16864a',source:'https://www.palmeiras.com.br/',season:'2025'},
  {id:'corinthians',name:'Corinthians',short:'COR',city:'São Paulo',country:'Brasil',league:'Série A',division:'1ª divisão',rating:78,stadium:'Neo Química Arena',capacity:49205,color:'#eeeeee',source:'https://www.corinthians.com.br/',season:'2025'},
  {id:'santos',name:'Santos',short:'SAN',city:'Santos',country:'Brasil',league:'Série A',division:'1ª divisão',rating:74,stadium:'Vila Belmiro',capacity:20120,color:'#f3f3f3',source:'https://www.santosfc.com.br/',season:'2025'},
  {id:'gremio',name:'Grêmio',short:'GRE',city:'Porto Alegre',country:'Brasil',league:'Série A',division:'1ª divisão',rating:77,stadium:'Arena do Grêmio',capacity:55662,color:'#45a6d8',source:'https://gremio.net/',season:'2025'},
  {id:'bahia',name:'Bahia',short:'BAH',city:'Salvador',country:'Brasil',league:'Série A',division:'1ª divisão',rating:75,stadium:'Arena Fonte Nova',capacity:47907,color:'#2d79c7',source:'https://www.esporteclubebahia.com.br/',season:'2025'},
  {id:'atletico-mg',name:'Atlético-MG',short:'CAM',city:'Belo Horizonte',country:'Brasil',league:'Série A',division:'1ª divisão',rating:81,stadium:'Arena MRV',capacity:46000,color:'#333333',source:'https://atletico.com.br/',season:'2025'},
  {id:'fortaleza',name:'Fortaleza',short:'FOR',city:'Fortaleza',country:'Brasil',league:'Série A',division:'1ª divisão',rating:76,stadium:'Castelão',capacity:63903,color:'#df2939',source:'https://fortalezaec.net/',season:'2025'},
  {id:'fluminense',name:'Fluminense FC',short:'FLU',city:'Rio de Janeiro',country:'Brasil',league:'Série A',division:'1ª divisão',rating:78,stadium:'Maracanã',capacity:78838,color:'#4da3ff',source:'https://www.fluminense.com.br/',season:'2025'},
  {id:'manchester-city',name:'Manchester City',short:'MCI',city:'Manchester',country:'Inglaterra',league:'Premier League',division:'1ª divisão',rating:91,stadium:'Etihad Stadium',capacity:53400,color:'#6cabdd',source:'https://www.mancity.com/',season:'2025'},
  {id:'liverpool',name:'Liverpool',short:'LIV',city:'Liverpool',country:'Inglaterra',league:'Premier League',division:'1ª divisão',rating:89,stadium:'Anfield',capacity:61276,color:'#d71920',source:'https://www.liverpoolfc.com/',season:'2025'},
  {id:'real-madrid',name:'Real Madrid',short:'RMA',city:'Madrid',country:'Espanha',league:'La Liga',division:'1ª divisão',rating:93,stadium:'Santiago Bernabéu',capacity:83186,color:'#f5f5f5',source:'https://www.realmadrid.com/',season:'2025'},
  {id:'barcelona',name:'FC Barcelona',short:'BAR',city:'Barcelona',country:'Espanha',league:'La Liga',division:'1ª divisão',rating:90,stadium:'Spotify Camp Nou',capacity:99354,color:'#a50044',source:'https://www.fcbarcelona.com/',season:'2025'},
  {id:'bayern',name:'Bayern München',short:'BAY',city:'Munique',country:'Alemanha',league:'Bundesliga',division:'1ª divisão',rating:91,stadium:'Allianz Arena',capacity:75024,color:'#dc052d',source:'https://fcbayern.com/',season:'2025'},
  {id:'psg',name:'Paris Saint-Germain',short:'PSG',city:'Paris',country:'França',league:'Ligue 1',division:'1ª divisão',rating:88,stadium:'Parc des Princes',capacity:47929,color:'#004170',source:'https://en.psg.fr/',season:'2025'},
  {id:'benfica',name:'SL Benfica',short:'SLB',city:'Lisboa',country:'Portugal',league:'Primeira Liga',division:'1ª divisão',rating:83,stadium:'Estádio da Luz',capacity:64742,color:'#e30613',source:'https://www.slbenfica.pt/',season:'2025'}
]

const rawPlayers: [string,string,string,string,string,number,number,string,'Titular'|'Reserva'][] = [
  ['rossi','flamengo','Agustín Rossi','GOL','Argentina',29,82,'R$ 22 mi','Titular'],
  ['bruno-henrique','flamengo','Bruno Henrique','ATA','Brasil',34,84,'R$ 18 mi','Titular'],
  ['arrascaeta','flamengo','Giorgian De Arrascaeta','MEI','Uruguai',31,87,'R$ 58 mi','Titular'],
  ['weverton','palmeiras','Weverton','GOL','Brasil',37,84,'R$ 16 mi','Titular'],
  ['gustavo-gomez','palmeiras','Gustavo Gómez','ZAG','Paraguai',32,86,'R$ 38 mi','Titular'],
  ['raphael-veiga','palmeiras','Raphael Veiga','MEI','Brasil',30,85,'R$ 45 mi','Titular'],
  ['hugo-souza','corinthians','Hugo Souza','GOL','Brasil',26,78,'R$ 14 mi','Titular'],
  ['garro','corinthians','Rodrigo Garro','MEI','Argentina',27,82,'R$ 42 mi','Titular'],
  ['yuri-alberto','corinthians','Yuri Alberto','ATA','Brasil',24,79,'R$ 32 mi','Titular'],
  ['soteldo','santos','Yeferson Soteldo','PE','Venezuela',28,78,'R$ 25 mi','Titular'],
  ['neymar','santos','Neymar Jr.','PE','Brasil',33,83,'R$ 28 mi','Titular'],
  ['gil','santos','Gil','ZAG','Brasil',38,74,'R$ 3 mi','Reserva'],
  ['braithwaite','gremio','Martin Braithwaite','ATA','Dinamarca',34,79,'R$ 12 mi','Titular'],
  ['villasanti','gremio','Mathías Villasanti','VOL','Paraguai',28,81,'R$ 35 mi','Titular'],
  ['everton-ribeiro','bahia','Éverton Ribeiro','MEI','Brasil',36,80,'R$ 8 mi','Titular'],
  ['hulk','atletico-mg','Hulk','ATA','Brasil',39,83,'R$ 10 mi','Titular'],
  ['paulinho','atletico-mg','Paulinho','ATA','Brasil',25,84,'R$ 48 mi','Titular'],
  ['lucero','fortaleza','Juan Martín Lucero','ATA','Argentina',33,78,'R$ 15 mi','Titular'],
  ['fabio','fluminense','Fábio','GOL','Brasil',44,78,'R$ 1,2 mi','Titular'],
  ['thiago-silva','fluminense','Thiago Silva','ZAG','Brasil',41,84,'R$ 8,5 mi','Titular'],
  ['andre','fluminense','André','VOL','Brasil',24,82,'R$ 58 mi','Titular'],
  ['arias','fluminense','Jhon Arias','PD','Colômbia',28,85,'R$ 42 mi','Titular'],
  ['haaland','manchester-city','Erling Haaland','ATA','Noruega',25,92,'€ 180 mi','Titular'],
  ['salah','liverpool','Mohamed Salah','PD','Egito',33,90,'€ 55 mi','Titular'],
  ['vinicius','real-madrid','Vinícius Júnior','PE','Brasil',25,93,'€ 200 mi','Titular'],
  ['mbappe','real-madrid','Kylian Mbappé','ATA','França',26,94,'€ 180 mi','Titular'],
  ['yamal','barcelona','Lamine Yamal','PD','Espanha',18,88,'€ 120 mi','Titular'],
  ['kane','bayern','Harry Kane','ATA','Inglaterra',32,91,'€ 90 mi','Titular'],
  ['dembele','psg','Ousmane Dembélé','PD','França',28,88,'€ 75 mi','Titular'],
  ['di-maria','benfica','Ángel Di María','PD','Argentina',37,82,'€ 4 mi','Titular']
]

export const worldPlayers: PlayerReference[] = rawPlayers.map(([id,clubId,name,pos,_nationality,age,rating,value,status]) => ({id,clubId,name,pos,age,rating,value,status,dataStatus:'referência de jogo'}))

export const dataCoverage = {clubs:worldClubs.length,players:worldPlayers.length,season:'2025',sourceType:'clubes oficiais; avaliações de jogo identificadas',note:'Catálogo inicial verificável e expansível; não representa cobertura mundial completa.'}

export const clubCatalog = worldClubs.map(({id,name,short,city,league,rating,stadium,capacity,color}) => ({id,name,short,city,league,rating,stadium,capacity,color}))
export const rosterCatalog = worldPlayers.map(({name,pos,age,rating,value,status}) => ({name,pos,age,rating,value,status}))

type CountryGroup = {country:string;leagues:string[]}
export const leagueCatalog: CountryGroup[] = [
  {country:'Brasil',leagues:['Série A','Série B','Série C','Série D','Copa do Brasil','Libertadores','Sul-Americana']},
  {country:'Inglaterra',leagues:['Premier League','Championship','League One','League Two','FA Cup','EFL Cup']},
  {country:'Espanha',leagues:['La Liga','Segunda División','Copa del Rey']},
  {country:'Itália',leagues:['Serie A','Serie B','Coppa Italia']},
  {country:'Alemanha',leagues:['Bundesliga','2. Bundesliga','DFB-Pokal']},
  {country:'França',leagues:['Ligue 1','Ligue 2','Coupe de France']},
  {country:'Portugal',leagues:['Primeira Liga','Liga Portugal 2','Taça de Portugal']},
  {country:'Países Baixos',leagues:['Eredivisie','Eerste Divisie']}
]

export function searchWorldCatalog(query:string){const normalized=query.trim().toLocaleLowerCase('pt-BR');if(!normalized)return{clubs:worldClubs,players:worldPlayers};return{clubs:worldClubs.filter((club)=>`${club.name} ${club.city} ${club.country} ${club.league}`.toLocaleLowerCase('pt-BR').includes(normalized)),players:worldPlayers.filter((player)=>player.name.toLocaleLowerCase('pt-BR').includes(normalized))}}

export type {CountryGroup}
export default worldClubs
