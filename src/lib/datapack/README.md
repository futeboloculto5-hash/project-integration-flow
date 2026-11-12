# Datapack: contratos (etapa 1)

Descreve e valida o formato dos datapacks do Clube Campeão WORLD. **Nada aqui é usado pelo jogo ainda**: nenhum arquivo existente importa este módulo, então o comportamento atual, os saves e o banco não mudam.

| Arquivo | Função |
|---|---|
| `types.ts` | Formas dos dados (manifesto, país, competição, edição, clube, jogador) e do resultado da validação. |
| `ids.ts` | Ids estáveis `<tipo>:<slug>` (`club:`, `plr:`, `ctry:`, `comp:`); o id do jogador não carrega o clube. |
| `version.ts` | Versão semântica do conteúdo e regra "só vale atualização com versão maior". |
| `positions.ts` | Ponte entre as 13 posições do contrato e as 4 do jogo atual (GOL/DEF/MEI/ATA). |
| `validate.ts` | `validateDatapack(input)`: confere estrutura, ids, duplicações, referências, faixas de valores e contagens. Nunca lança exceção. |
| `fixtures.ts` | Dados **sintéticos de teste** ("Clube Teste 001"). Não representam nada real. |

## Regras importantes
- **Erro** impede o uso do pacote; **aviso** (campo desconhecido, possível duplicado, pacote de teste) não impede.
- `origin: "teste"` gera o aviso `pack_is_test_data`: um carregador futuro deve recusar esses pacotes num jogo real.
- `legacyId` liga um clube novo ao id que ele tem hoje no jogo (ex.: `flamengo`), para os saves antigos continuarem válidos.
- O validador limita registros (500 mil) e problemas listados (200) e é linear: 20 mil jogadores validam em milissegundos.
- Decidir o formato dos arquivos do pacote (JSON, NDJSON, divisão por arquivo) e converter de outras fontes ficam para as próximas etapas.

## Etapa 2: camada de acesso aos clubes
`src/lib/game/club-provider.ts` (fora desta pasta, porque conhece o jogo) oferece `ClubProvider` com `list`, `find`, `get` e `has`.
Hoje só serve os 20 clubes atuais (`legacyClubs`): mesmos objetos, mesma ordem, e `get` se comporta como o antigo `clubById` (inclui `sim-b-N` e o mesmo erro para id desconhecido).
`toPackClub` descreve um clube atual no formato do datapack, mantendo o id antigo em `legacyId`.
Nenhum código do jogo usa isso ainda; religar os chamadores é a etapa 3.

## Etapa 4: jogadores (base + carreira)
- `src/lib/game/player-provider.ts`: `PlayerProvider` (listar, achar por id estável **ou legado**, por clube, por posição, buscar por nome, existir). Fontes: `legacyPlayers` (elencos que o jogo já gera, com ids estáveis `plr:`), `createDatapackPlayerProvider` (datapack validado; pacote de teste só com `allowTestData`) e `composePlayerProviders` (o datapack manda nos clubes que cobre; ids antigos continuam resolvendo).
- `src/lib/game/player-overlay.ts`: o que a carreira guarda sobre a base (só a diferença; jogador sem base fica inteiro) e `analyzeCareerPlayers`, que mede um save sem alterá-lo. `compactVerified` só compacta se a ida e volta for exata.
- **Ainda não conectado:** o salvamento e os sistemas continuam usando o formato atual. A troca do formato do save é a etapa 5 e exige migração própria.

## Etapa 5: ligação ao jogo e formato do save
**Elencos-base pelo provedor.** `createCareer`, `aiSquad` e o elenco inicial dos clubes passam por `legacyPlayers` (mesmos jogadores da fórmula; resultado idêntico, conferido por testes e por uma comparação de 146 cenários antes/depois).
Seguem fora do provedor, de propósito, por não terem base: jogadores da API-Football, agentes livres gerados no mercado, reforços de base e jogadores criados na carreira. Eles continuam guardados por inteiro.

**Formato do save (`career-codec.ts`, aplicado só na fronteira do salvamento, em `storage.ts`).** Dentro do jogo a carreira é a mesma de sempre.
- Sem `saveFormat`: formato clássico (todos os saves já criados). Continua abrindo em qualquer versão.
- `saveFormat: 2`: os elencos dos outros clubes (`otherSquads`) saem e entra `playerStore`, só com a diferença para a base. Elenco do técnico, mercado, finanças, dívidas, calendário etc. ficam idênticos.
- Cada jogador só é compactado se a reconstrução for exata; senão fica inteiro. Codificar de novo não muda nada.
- Na primeira conversão de um save clássico, uma cópia do original fica **neste aparelho** em `ccw-career-v2[:id]:original`. Na nuvem a linha é sobrescrita pelo formato novo.
- Se o save já existia e não pôde ser lido, o salvamento volta ao formato clássico (não arrisca).
- Abrir recusa (sem gravar nem apagar nada) se o formato for desconhecido, o bloco de jogadores estiver incompleto ou a base de jogadores mudou desde a gravação (assinatura fixa em teste).

**LIMITAÇÃO:** uma versão do jogo anterior a esta que abra um save `saveFormat: 2` não vê as mudanças dos elencos da IA (regenera pela fórmula). Saves clássicos abrem em qualquer versão.

## Etapa 6: importação e conversão de datapacks
Nada do jogo usa isto ainda (há um teste que garante). Os jogadores atuais continuam sendo os do jogo até a importação ser validada com um pacote real.

**Pipeline** (`importDatapack`, em `import.ts`; qualquer erro rejeita o pacote INTEIRO e não instala nada):
1. **Formato** — um adaptador (`adapters.ts`) reconhece os arquivos. Sem adaptador: erro `unknown_format` listando os suportados. Nunca se assume um formato.
2. **Conversão** — o adaptador entrega o contrato interno (`ccw.datapack`). Hoje só existe o `ccw-native-v1` (leitura em `bundle.ts`).
3. **Validação** — o validador do contrato roda SEMPRE; nenhum adaptador consegue pulá-lo.
4. **Política** — pacote real (origem ≠ `teste`) precisa declarar `source.name` e `source.license` (senão erro); origem `teste` é recusada a menos que `allowTestData` (só testes); pacote real com marcas de teste (ids `…:teste-…`, nomes com "Teste") é rejeitado. Avisos: clube fora de qualquer competição, elencos fora de 11–60, etc.
5. **Reconciliação com o jogo** — `legacyId` casa com os clubes permanentes. Cidade, estádio, cores e qualquer dado financeiro do pacote são IGNORADOS (informado no relatório); os clubes do jogo não são alterados.
6. **Identidade** (`identity.ts`) — o id estável é a identidade. Candidatos a duplicata (mesmo id externo; mesmo nome + nascimento; mesmo nome + nacionalidade como "possível") vão para o relatório; **nada é unido automaticamente e nome igual sozinho nunca é candidato**. Grupos com mais de 50 iguais não são comparados par a par (proteção contra custo quadrático).
7. **Versão e incremental** (`diff.ts`) — mesma versão e conteúdo = `unchanged`; mesma versão com conteúdo diferente = erro; versão menor = erro `downgrade`; maior = `update` com a diferença (jogadores adicionados, alterados, transferidos, sumidos; participantes de cada edição).

**Loja** (`store.ts`): instala só depois de um relatório sem erros, de uma vez. Rejeição não altera nada. Jogador que some de uma versão nova fica **aposentado** (guarda o último clube e a última versão): continua resolvendo por id, e quem volta deixa de ser aposentado. Pacotes de packIds diferentes convivem; o mesmo id de jogador ou clube em dois pacotes é erro (`id_collision_other_pack`).

**Fatias** (`slice.ts`): `sliceByCountry` (país e/ou confederação), `sliceByCompetition` e `catalogByCountry`. A fatia é um datapack válido (referências fechadas, contagens recalculadas) — dá para carregar só um país/liga em vez do mundo.

**Ponte com o jogo** (`src/lib/game/datapack-bridge.ts`): `importDatapackForGame`, `worldPlayersFromStore`, `createWorldPlayerProvider` (pacotes mandam nos clubes que cobrem, o jogo atual vale para o resto, aposentados e ids antigos continuam resolvendo). Um save compactado só abre com o provedor para o qual foi gravado (`base_changed` caso contrário).

**Medição** (51 mil jogadores, 1.500 clubes, 60 países, arquivo de 11 MB): ler+validar+importar ≈ 0,3 s; atualização de 10% dos jogadores ≈ 0,8 s; catálogo por país 6 ms; fatia de um país 3 ms; `PlayerProvider` de 51 mil ≈ 75 ms. Nenhuma otimização complexa foi necessária.

**Como importar um pacote real no futuro:** (1) ter a amostra real e a autorização de uso; (2) escrever um adaptador novo (`DatapackAdapter`) só para esse formato, testado com a amostra, que entrega o contrato interno e registra a fonte e a licença no manifesto; (3) `importDatapackForGame(store, arquivos)` e ler o relatório; (4) só depois decidir ligar o provedor do mundo ao jogo.

## Etapa 7: administração de datapacks (fase 4)
Componentes isolados, ainda **não ligados a nenhuma tela**:
- `src/lib/datapack/admin-model.ts` — funções puras que transformam a loja e o relatório de importação em dados de tela: `adminSnapshot(store)`, `summarizePack`, `summarizeImport(result, versãoAnterior)`, `checkForUpdates(store, catálogo)`.
- `src/components/game/datapack-admin-view.tsx` — `DatapackAdminView` (tela completa), `PackDetailView`, `ImportReportView`, `UpdatesView`. Só recebem dados e chamam callbacks; usam apenas classes `g-*` que o jogo já tem (um teste confere), então seguem a identidade azul atual.
- Mostram: pacotes instalados, país, temporada, versão, quantidade de clubes e jogadores, competições, origem e licença, erros e avisos, e jogadores adicionados, alterados, transferidos e removidos. Pacote de teste aparece com aviso.

**Como conectar (etapa 8, depois de decidir onde guardar os pacotes):**
1. Criar um contêiner (ex.: `datapack-admin.tsx`) que guarda um `PackStore` e o último `ImportSummary`.
2. `onPickFiles`: `readFileList(arquivos)` → `importDatapackForGame(store, arquivos)` → `summarizeImport(resultado, versão anterior)` → atualizar `adminSnapshot(store)`.
3. `onCheckUpdates`: buscar o catálogo de versões numa fonte definida pelo dono do jogo e chamar `checkForUpdates`. O componente não faz acesso à rede.
4. Acrescentar uma entrada de navegação (ex.: dentro de "Clube") que renderize o contêiner. Nenhuma tela existente precisa ser reescrita.
5. Persistir pacotes e livro de identidade (hoje só em memória) antes de liberar para usuários.

## Etapa 7: identidade entre pacotes, versões e saves, integração (fases 1–3 e 5)
**Identidade global (fase 1).** O id estável (`plr:…`, `club:…`) é GLOBAL: o mesmo id em dois pacotes significa "é o mesmo". Isso só é aceito se os registros forem compatíveis (`shared.ts`): nada se contradiz e o nome é igual (ou há dado que corrobora). Qualquer dúvida é `identity_conflict` e o pacote é rejeitado. Pacotes por país, região ou liga podem repetir um clube ou jogador sem duplicá-lo. A visão efetiva (`world.ts`, `store.world()`) combina os pacotes com precedência determinística, que não depende da ordem de instalação: prioridade, depois data de criação, depois packId. O livro de identidade (`identity-ledger.ts`) guarda o histórico (quem trouxe cada id e quais nomes já teve) e só aceita ligações entre ids confirmadas por uma pessoa (`store.link(from, to, nota)`). **Nada é unido por nome**; nome parecido com id diferente continua sendo só candidato no relatório.

**Versões e saves (fase 2).** O padrão não mudou: um save compactado só abre com a base de jogadores para a qual foi gravado (`base_changed` se mudou; nada é alterado). Com `decodeCareer(raw, provider, { rebase: true })` o save reabre depois de uma atualização de datapack: o que a carreira alterou **fica** (evolução preservada), o que ela nunca tocou adota a base nova, o clube do jogador e o id salvos nunca são trocados, e quem saiu do pacote continua resolvendo (aposentados). `decodeCareerWithReport` descreve o que aconteceria sem gravar nada. O formato do save **não foi alterado** (só um campo opcional `baseRef`); saves antigos e clássicos abrem como antes.

**Integração gradual (fase 3).** `src/lib/game/player-source.ts` define a fonte ativa de jogadores. O padrão é o jogo atual; `usePlayerProvider(createWorldPlayerProvider(...))` ativa um mundo importado, que só manda nos clubes que cobre. Carreira, elencos da IA, mercado (inclui agentes livres do pacote), compra e venda, empréstimos, contratos, temporada, evolução, histórico e salvamento foram exercitados com jogadores importados em `world-integration.test.ts` (dados sintéticos). Nada na interface ativa isso ainda. A importação avisa quando um clube não tem jogadores para escalar um time (`squad_position_gap`).

**Testes de regressão.** Com os mesmos dados, o resultado é idêntico ao anterior: a comparação golden de 146 cenários (carreiras novas, rodadas, temporadas) é idêntica ao original, e há teste de que ativar e desativar um mundo deixa a carreira nova igual.

**Limitações restantes.**
- Pacotes instalados, livro de identidade e prioridades vivem só em memória: falta persistência (decidir onde guardar).
- Ativar um mundo importado ainda não está ligado a nenhuma tela, e o save compactado não grava sozinho quais pacotes usou (`baseRef` é opcional).
- Jogadores novos de uma atualização de datapack não entram sozinhos numa carreira em andamento (nenhum é inserido; o relatório só informa quantos há).
- O motor de partida ao vivo e a interface não foram exercitados num navegador; só a lógica (`completeRound`, escalação, tabela).
- Não há adaptador para nenhum formato de terceiros: falta uma amostra real e a autorização de uso.
- Type-check, lint e build não puderam ser rodados neste ambiente.

**Para importar o datapack real:** receber a amostra e a licença; inspecionar a estrutura e os relacionamentos; escrever o adaptador (ou o site de vocês exportar já em `ccw.datapack` v1); testar a conversão; gerar o relatório; só então persistir e ativar o mundo.

## Importador de liga do API-Football (`api-football.ts` + rota `/api/football/datapack`)

Gera um datapack de UMA liga (país, competição, edição, clubes e elencos) respeitando um teto de chamadas. Custo: 1 (`leagues`) + 1 (`teams`) + 1 por clube (`players/squads`) ≈ 22 para 20 clubes. Chamadas em cache não contam; se o orçamento do dia acabar, rodar de novo no dia seguinte continua de onde parou (cache de 14 dias).

- Rota administrativa e isolada: devolve 404 sem o segredo `DATAPACK_ADMIN_TOKEN`; exige o cabeçalho `x-admin-token`. Não grava nada no jogo nem em saves. Parâmetros: `league`, `season`, `maxCalls` (1–60, padrão 30), `competitionId` (opcional).
- Pacote: `packId = apifootball-<liga>`, versão `1.<aammdd>.0`, origem `licenciado`, ids de jogador `plr:<nome>-<id do API>` (nunca levam o clube).
- **Limitações**: formato das respostas lido da documentação v3, ainda não conferido com uma resposta real desta conta; `players/squads` não traz força, então `overall` é ESTIMATIVA (jogadores saem com `dataStatus: "estimativa"`); posições em 4 categorias (GK/CB/CM/ST); elenco é o atual mesmo que a temporada seja antiga; fotos não são copiadas; o plano gratuito costuma limitar as temporadas; o orçamento é compartilhado com o jogo (teto de 90/dia).

**Catálogo de países e competições**: `GET /api/football/datapack?mode=catalog` (mesmo segredo) faz 2 chamadas (`countries` e `leagues`), agrupa por país e devolve nome, id do API, tipo (liga/copa) e temporadas de cada competição. `&countries=Brazil,Colombia` filtra. Serve para conferir países e nomes e gerar o pacote de competições sem depender de memória.

**Clubes e competições por país** (`club-country.ts`): pega uma lista externa `id,nome` (sem país) e organiza por país usando o API-Football. `mode=teams&countries=Albania,Argentina` traz os clubes de cada país (1 chamada por país). Regras: nome igual em um só país => atribui; nome em vários países ("Arsenal", "Premier League") => só atribui pela ordem dos ids (a lista vem em blocos por país, em ordem alfabética do nome em inglês) e só se essa ordem se confirmar nos dados; o resto fica **pendente** com candidatos, nunca por palpite. O pacote gerado leva só clubes e competições (sem jogadores), com os ids do API e da lista externa em `externalIds`.
