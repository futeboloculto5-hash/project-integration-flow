# Competições por país (somente nomes)

Pacote `ccw.datapack` v1 com **28 países e 82 competições**, sem clubes, jogadores nem edições. Ele só organiza as competições por país para
que outros pacotes (clubes e elencos vindos de outra fonte) possam referenciá-las. **O jogo ainda não usa este pacote.**

**Origem.** Os nomes vêm da lista `competitions.csv` do pacote de fãs "pro" v86 (Champholics). Foram usados **apenas os nomes**; nenhum id, imagem
ou outro dado desse pacote. País, confederação e divisão foram atribuídos por conhecimento público (`dataStatus: "pesquisa"`) e precisam de conferência.
O tipo das copas e dos estaduais (`cup` / `group_knockout`) é aproximado. Os ids (`comp:<país>-<nome>`) são do projeto.

**Ficaram de fora 12 nomes ambíguos** (o mesmo nome existe em mais de um país ou o país não é inequívoco). Confirmar o país antes de incluir:
`Premier League` (segunda entrada), `Campeonato Primera B`, `Primera A`, `Primera B`, `Superliga`, `Serie A` e `Serie B` (a segunda entrada de cada; provavelmente Equador),
`Division Profesional`, `Division Intermedia`, `Liga 1`, `Liga 2` e `National League` (segunda entrada).

**Como usar:** `importDatapack` aceita o arquivo normalmente (`datapack.json`). Para atualizar, publique uma versão nova com o mesmo `packId`.
