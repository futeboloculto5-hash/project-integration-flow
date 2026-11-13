# Datapack final: competições do mundo por país + clubes

`datapack.json` (packId `mundo-competicoes-clubes`): 31 países, 458 competições (368 por país + 90 "World" sem país), 502 clubes em 27 edições. Sem jogadores.

- **Competições:** da lista aprovada pelo dono do projeto (`competicoes.md`), com o id da API-Football em `externalIds.apiFootball`. Só masculino e adulto; estaduais do Brasil só 1ª divisão; bases nacionais do Brasil e a Copinha entram.
- **Clubes:** do pacote `clubes-por-competicao` (openfootball, CC0): só onde o openfootball tem a liga. O resto das competições está sem clubes por enquanto.
- **Regerar:** `python3 -I montar.py` (usa `competicoes.md` e os pacotes `competicoes-por-pais` e `clubes-por-competicao`).
- **Licença:** as competições vêm do API-Football da conta do dono do projeto (não redistribuir); os clubes são CC0.
- Substitui, para uso no jogo, os pacotes `competicoes-por-pais` e `clubes-por-competicao` (que ficam como fonte). Não instale os três ao mesmo tempo.

## Clubes vindos do API-Football (`fonte-api/`)
Arquivos `<liga>_<temporada>.json` baixados com `baixar_clubes.py` (a temporada é a mais nova que o plano permite; no plano grátis testado foi 2024). `montar.py` os lê e cria clubes e edições só para competições que ainda não têm clubes do openfootball. Clubes são unidos pelo id do API (`externalIds.apiFootball`). Fotos/logos não são copiados. Esses arquivos são dados do API-Football da conta do dono do projeto: não deixe este repositório público.
