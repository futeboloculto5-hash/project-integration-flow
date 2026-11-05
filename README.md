# Clube Campeão WORLD

Simulador de gestão de futebol: o jogador vive a carreira de técnico no clube brasileiro que escolher, com temporadas, transferências, contratos, finanças, dívidas e categorias de base.

Construído com [Lovable](https://lovable.dev) e mantido em sincronia com este repositório. Editor do projeto: [Lovable](https://lovable.dev/projects/09d04a48-4070-45db-bb8d-a8e6b01a3da1).

## Tecnologias

- TanStack Start (React 19, Vite, Tailwind 4, componentes shadcn/Radix)
- Supabase (Lovable Cloud): autenticação e banco Postgres
- API-Football, lida só pelo servidor (`API_FOOTBALL_KEY`), com cache e limite diário de consultas
- Vitest para os testes; gerenciador de pacotes: bun (`bun.lock`)

## Como rodar

```sh
bun install
bun run dev     # desenvolvimento
bun run test    # testes
bun run build   # build de produção
```

## Mapa do código

| Pasta | O que tem |
| --- | --- |
| `src/lib/game/` | Regras do jogo: carreira, temporadas, transferências, finanças, base, salvamento |
| `src/lib/match/` | Motor da partida ao vivo |
| `src/components/game/` | Telas do jogo |
| `src/routes/api/football/` | Rotas de servidor que consultam a API-Football |
| `src/integrations/supabase/` | Cliente e autenticação (arquivos gerados, não editar à mão) |
| `drizzle/migrations/` | Migrations SQL do banco |

As regras de arquitetura de cada sistema estão em `AGENTS.md`; o andamento, em `roadmap.md`.

## Banco de dados

- `careers`: uma linha por carreira, com o jogo inteiro no campo `data` (JSON). Cada usuário só acessa as próprias linhas (RLS).
- `legacy_users`: usuários importados do app antigo, ligados à conta pelo e-mail verificado (`claim_legacy_account()`).
- `football_api_cache` e `football_api_budget`: cache e cota da API de futebol, só acessíveis pelo servidor.

## Regras para quem for alterar o jogo

- **Nunca quebrar carreiras salvas.** Campos novos em `CareerV2` são sempre opcionais e preenchidos em `ensureFields`. O teste `src/lib/game/legacy-saves.test.ts` protege isso.
- **Não inventar dados.** Cada valor financeiro ou de referência indica sua origem: oficial, pesquisa, estimativa ou simulado (`src/lib/game/finance-data.ts`).
- **Dinheiro só se move por `book()`** (`src/lib/game/finance.ts`).
- Não reescrever o histórico do Git já publicado (o Lovable sincroniza a partir dele).
