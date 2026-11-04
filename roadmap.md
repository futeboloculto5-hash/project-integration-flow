# Career persistence
- [x] Persist complete career snapshots with immediate local recovery and serialized cloud writes.
- [x] Preserve existing careers; show saving/retry and safe load failure states.
- [x] Test field recovery, retries, simultaneous changes, reload and authenticated recovery.

# World market
- [x] Replace reference market endpoint with real club search and on-demand squads, shared cache and quota safeguards.
- [x] Add persisted negotiations, transfers, loans, contracts, wages and AI club activity without replacing old saves.
- [x] Integrate market controls and test rules, persistence and the real-data UI flow.

# Functional seasons
- [x] Add additive season state, league calendars, goals/assists, relegation/promotion, knockouts and club evolution.
- [x] Connect real calendar/results references with protected API reads and clearly labeled fallback simulations.
- [x] Integrate season controls and archive history; verify rules, complete guest browser flow and snapshot/cloud persistence tests.
- [ ] Verify hosted authenticated recovery and live season API reads: blocked by Lovable Cloud returning database inaccessible while minting the user's session.

# Club finances
- [x] Categorized revenues/expenses with monthly statement, board transfer and wage budgets, staff salaries (IBGE reference).
- [x] Debts as installment contracts (Price), interest, early payment, bank loans; official 2025 club statements recorded with source/date/metric.
- [x] Sponsorship contracts with IBOPE Repucom 2025 brands, simulated values/bonuses, counter-offers and rescission; sources tab.
- [ ] Official debt figures for Botafogo, Flamengo, Mirassol, Sport and Palmeiras: club documents could not be read or were not yet consulted.
