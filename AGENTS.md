<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Persist complete career snapshots through `src/lib/game/storage.ts` with owner-only browser access, account-scoped recovery copies, stable row IDs and serialized retryable writes; this preserves existing saves without duplicate inserts.
- Football data endpoints live under `src/routes/api/football/*` as server routes so the API-Football key stays server-side.
- All upstream football reads use `src/lib/football-api.server.ts` with a durable service-only cache and atomic shared request reservation; fail closed when quota bookkeeping is unavailable so browsing cannot bypass plan safeguards.
- Career transfer rules live in `src/lib/game/transfers.ts`, with additive snapshot fields and authoritative club ownership after import; API refreshes must never undo simulated deals or overwrite the user's squad.
- Imported users from the old app are matched by verified email via `claim_legacy_account()` on sign-in; `legacy_users` is service-role only.
- Season rules live in `src/lib/game/seasons.ts` as additive snapshot state: official references never overwrite career results, and rollover archives competitions before applying division changes and player development.
- Career money rules live in `src/lib/game/finance.ts` (every cash movement goes through `book()`), with reference data and source metadata in `src/lib/game/finance-data.ts`; each figure carries a data-origin status so official, research, estimated and simulated values are never mixed.
- Youth academy rules live in `src/lib/game/academy.ts` as additive snapshot state run from `advanceDay`; youth players, scouts and youth results are always simulated, and only competition names verified on cbf.com.br are labeled official.
- Bux (moeda fictícia) tem regras em `src/lib/game/bux.ts` e fonte da verdade do saldo em `drizzle/migrations/0002_bux.sql`: o cliente só lê; compras e recompensas passam por `bux_purchase`/`bux_claim_reward` com chave de idempotência. Preços e efeitos são regras internas do jogo, nunca valores reais; `bux.test.ts` garante que catálogo e limite diário são idênticos no TypeScript e no SQL.
