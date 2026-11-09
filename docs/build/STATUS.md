# Build status

Updated by whoever completes a task (human, Fable or Opus via `/build-next`). One line per completed task, newest last. A phase is done when every box in it is ticked in `docs/BUILD.md` and `npm test && npm run typecheck` pass on `main`.

| Phase | State | Notes |
|---|---|---|
| 0 Handoff scaffolding | done | runbook, tracker, `/build-next`, three pilot hospitals (2026-11-09 13:05 KST) |
| 1 Domain core | done | 45 tests green: money, types, state machine, route, compare, FPL + tiers (three pilot hospitals), atlas loader, savings, demo clock, audit |
| 2 Adapters and guards | next | start with fixtures/policies/riverbend.json, then fixtures/cases |
| 3 Caregiver flow | not started | |
| 4 Staff workspace (lite) | not started | |
| 5 Demo video | not started | |
| 6 Persistence and auth | not started | |
| 7 Landing and polish | not started | |
| 8 Deploy | not started | |
| 9 Docs and honest report | not started | |

## Log

- 2026-11-09 12:55 KST — Phase 0 started: runbook and tracker written (Fable).
- 2026-11-09 13:05 KST — Phase 0 done: fixtures/hospitals.json (Cedars-Sinai CA, Alexian Brothers IL, NYU Langone NY) with 2026 FPL $15,960 verified at ASPE (Fable).

- 2026-11-09 13:25 KST — Phase 1: vitest + scripts + env example; money; types; state machine, screenFor, assertSimulated (Fable). Tests green.

- 2026-11-09 13:45 KST — Phase 1 done (Fable): compare, fpl/eligibility + pilots.ts, atlas, savings, demoClock, audit; 9 test files, 45 tests.

## Blockers

None.
