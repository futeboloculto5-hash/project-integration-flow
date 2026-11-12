# Competições por país (somente nomes)

Pacote `ccw.datapack` v1 com **28 países e 86 competições**, sem clubes, jogadores nem edições. Ele só organiza as competições por país para
que outros pacotes (clubes e elencos vindos de outra fonte) possam referenciá-las. **O jogo ainda não usa este pacote.**

**Origem.** Os nomes vêm da lista `competitions.csv` do pacote de fãs "pro" v86 (Champholics). Foram usados **apenas os nomes**; nenhum id, imagem
ou outro dado desse pacote. País, confederação e divisão foram atribuídos por conhecimento público (`dataStatus: "pesquisa"`) e precisam de conferência.
O tipo das copas e dos estaduais (`cup` / `group_knockout`) é aproximado. Os ids (`comp:<país>-<nome>`) são do projeto.

**Versão 1.1.0:** o dono do projeto confirmou o país de 4 nomes, incluídos: Superliga (Dinamarca), Campeonato Primera B (Chile), Liga 1 e Liga 2 (Peru).

**Ficaram de fora, a pedido (países que ainda não estão no pacote):** Primera A e Primera B (Colômbia), Serie A e Serie B — 2ª entrada (Equador), Division Profesional e Division Intermedia (Paraguai).
**Sem país confirmado:** Premier League (2ª entrada) e National League (2ª entrada).

**Como usar:** `importDatapack` aceita o arquivo normalmente (`datapack.json`). Para atualizar, publique uma versão nova com o mesmo `packId`.
