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
