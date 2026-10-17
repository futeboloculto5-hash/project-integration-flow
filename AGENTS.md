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
- Imported users from the old app are matched by verified email via `claim_legacy_account()` on sign-in; `legacy_users` is service-role only.
