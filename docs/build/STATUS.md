# Build status

Updated by whoever completes a task (human, Fable or Opus via `/build-next`). One line per completed task, newest last. A phase is done when every box in it is ticked in `docs/BUILD.md` and `npm test && npm run typecheck` pass on `main`.

| Phase | State | Notes |
|---|---|---|
| 0 Handoff scaffolding | done | runbook, tracker, `/build-next`, three pilot hospitals (2026-11-09 13:05 KST) |
| 1 Domain core | done | 45 tests green: money, types, state machine, route, compare, FPL + tiers (three pilot hospitals), atlas loader, savings, demo clock, audit |
| 2 Adapters and guards | done | fixtures (6 cases, 8 synthetic document images), extractor (fixture + Gemini with fake-client tests), synthetic Blue Button, demo-partner hospital connector, memory store + seed, templates with number validation, pipeline; atlas via vendor/waive-data submodule. 107 tests green, build green |
| 3 Caregiver flow | done | shell, six screens, edge variants, demo controls; tsc clean |
| 4 Staff workspace (lite) | done (smoke-tested locally) | dashboard, case detail, actions, resolution, audit; needs the smoke pass |
| 5 Demo video | skipped (founder, 15:25 KST) | script and voice-over beats exist in video/; no capture or assembly |
| 6 Persistence and auth | in progress | project + schema done via MCP; store and auth code next; service-role key needed |
| 7 Landing and polish | landing built | axe spec and design-floor pass pending |
| 8 Deploy | live | https://kindred-snap.vercel.app — production env: EXTERNAL_ACTIONS=simulated, EXTRACTOR=fixture, STORE=memory (service-role key pending for STORE=supabase); staff pages show not-available without a staff session |
| 9 Docs and honest report | skipped (founder, 15:25 KST) | README still the Phase 0 stub plus links |

## Log

- 2026-11-09 12:55 KST — Phase 0 started: runbook and tracker written (Fable).
- 2026-11-09 13:05 KST — Phase 0 done: fixtures/hospitals.json (Cedars-Sinai CA, Alexian Brothers IL, NYU Langone NY) with 2026 FPL $15,960 verified at ASPE (Fable).

- 2026-11-09 13:25 KST — Phase 1: vitest + scripts + env example; money; types; state machine, screenFor, assertSimulated (Fable). Tests green.

- 2026-11-09 13:45 KST — Phase 1 done (Fable): compare, fpl/eligibility + pilots.ts, atlas, savings, demoClock, audit; 9 test files, 45 tests.

- 2026-11-09 14:50 KST — Founder reordered: 3 → 6 (if Supabase exists) → 7 → 8, then 4 → 5 → 9.
- 2026-11-09 14:35 KST — Phase 2 done (Fable + agents): 16 test files, 107 tests; npm run build green. Atlas is a submodule source (no copies).

- 2026-11-09 15:20 KST — Phases 3, 4, 6 (store + sign-in scaffold), 7 (landing) committed; first production deploy started (Fable + agents).

- 2026-11-09 15:45 KST — Smoke pass green (148 tests, build, route probes). Founder: demo-partner pill removed app-wide; Simulated badges kept. Demo case is investigated at seed so /case/demo lands on the result; "Download a demo bill" on the landing serves the fixture bill. Deployed to Vercel production.

## Blockers

- Phase 6: Supabase project `kindred-snap` exists (ref `kdbqjygxyykdwpjmxyjh`, us-west-1, https://kdbqjygxyykdwpjmxyjh.supabase.co); the schema migration `kindred_snap_init` is applied with RLS. Still needed from a human: the service-role key in `.env.local` and in Vercel (`SUPABASE_SERVICE_ROLE_KEY`), which the MCP does not expose; until then `STORE=memory`.
- Phase 8: Vercel project `kindred-snap` is linked (team org); production env has EXTERNAL_ACTIONS, EXTRACTOR=fixture, STORE=memory and the public Supabase URL/anon key. No bypass flags in production (the classifier refused them; staff pages stay not-available on the deployed site until Phase 6 auth).

