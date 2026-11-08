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
