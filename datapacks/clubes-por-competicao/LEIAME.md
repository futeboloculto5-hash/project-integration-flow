# Clubes por competição (openfootball)

Pacote `clubes-por-competicao`: 15 países, 27 competições, 502 clubes, 27 edições. Sem jogadores.

- **Fonte:** projeto openfootball (football.db), domínio público (CC0 1.0). Os clubes saem dos jogos de cada liga.
- **Temporada:** a mais recente disponível por competição (ex.: Brasileirão Série A 2026, Premier League 2026/27, League One 2025/26). Cada edição guarda a sua temporada. Para saber a divisão ATUAL de um clube, vale a edição de temporada mais recente em que ele aparece.
- **Ids:** cada competição leva o id da API-Football em `externalIds.apiFootball`, para casar com a lista de competições do jogo.
- **Nomes dos clubes:** como aparecem na fonte (nomes oficiais, ex.: "CR Flamengo"). Ainda não passaram pelo ajuste de nomes de jogo.
- **Regerar:** `python3 -I gerar.py <pasta com os clones do openfootball> datapack.json` (ver o cabeçalho do script).
- **Fora:** competições sem arquivo no openfootball ficam sem clubes (copas, divisões inferiores, e países como México, EUA, Chile, Peru, China, Arábia Saudita, Coreia do Sul, Marrocos, Angola, Irã, Indonésia, EAU, Canadá, Dinamarca e San Marino).
