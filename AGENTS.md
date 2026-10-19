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
