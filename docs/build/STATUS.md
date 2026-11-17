# Build status

Updated by whoever completes a task (human, Fable or Opus via `/build-next`). One line per completed task, newest last. A phase is done when every box in it is ticked in `docs/BUILD.md` and `npm test && npm run typecheck` pass on `main`.

| Phase | State | Notes |
|---|---|---|
| 0 Handoff scaffolding | done | runbook, tracker, `/build-next`, three pilot hospitals (2026-11-09 13:05 KST) |
| 1 Domain core | done | 45 tests green: money, types, state machine, route, compare, FPL + tiers (three pilot hospitals), atlas loader, savings, demo clock, audit |
| 2 Adapters and guards | done | fixtures (6 cases, 8 synthetic document images), extractor (fixture + Gemini with fake-client tests), synthetic Blue Button, demo-partner hospital connector, memory store + seed, templates with number validation, pipeline; atlas via vendor/waive-data submodule. 107 tests green, build green |
| 3 Caregiver flow | done | shell, six screens, edge variants, demo controls; tsc clean |
| 4 Staff workspace (lite) | done (smoke-tested locally) | dashboard, case detail, actions, resolution, audit; needs the smoke pass |
| 5 Demo video | done (2026-11-10) | video/film (huashu-motion): 92 s, 1920×1080, Gemini 3.8 Flash TTS narration, real UI rebuilt, one camera; render in video/film/out (ignored), regenerate with `om render video/film --blur` |
| 6 Persistence and auth | store live | production runs STORE=supabase (service-role key set by the founder via the Supabase CLI); seed is idempotent and race-safe; sign-in scaffold exists, routes not yet gated by Supabase sessions |
| 7 Landing and polish | landing built | axe spec and design-floor pass pending |
| 8 Deploy | live | https://snap.kindred-ai.dev (alias) and https://kindred-snap.vercel.app — production env: EXTERNAL_ACTIONS=simulated, EXTRACTOR=fixture, STORE=supabase; staff pages show not-available without a staff session |
| 9 Docs and honest report | skipped (founder, 15:25 KST) | README still the Phase 0 stub plus links |
| 10 Snap Incognito | planned | replanned 2026-11-16: drop-files flow, no typing; I1 needs no new key |

## Log

- 2026-11-09 12:55 KST — Phase 0 started: runbook and tracker written (Fable).
- 2026-11-09 13:05 KST — Phase 0 done: fixtures/hospitals.json (Cedars-Sinai CA, Alexian Brothers IL, NYU Langone NY) with 2026 FPL $15,960 verified at ASPE (Fable).

- 2026-11-09 13:25 KST — Phase 1: vitest + scripts + env example; money; types; state machine, screenFor, assertSimulated (Fable). Tests green.

- 2026-11-09 13:45 KST — Phase 1 done (Fable): compare, fpl/eligibility + pilots.ts, atlas, savings, demoClock, audit; 9 test files, 45 tests.

- 2026-11-09 14:50 KST — Founder reordered: 3 → 6 (if Supabase exists) → 7 → 8, then 4 → 5 → 9.
- 2026-11-09 14:35 KST — Phase 2 done (Fable + agents): 16 test files, 107 tests; npm run build green. Atlas is a submodule source (no copies).

- 2026-11-09 15:20 KST — Phases 3, 4, 6 (store + sign-in scaffold), 7 (landing) committed; first production deploy started (Fable + agents).

- 2026-11-09 15:45 KST — Smoke pass green (148 tests, build, route probes). Founder: demo-partner pill removed app-wide; Simulated badges kept. Demo case is investigated at seed so /case/demo lands on the result; "Download a demo bill" on the landing serves the fixture bill. Deployed to Vercel production.

- 2026-11-09 16:50 KST — Demo-walk fix: the demo bill flow re-materialises on any serverless instance. Production switched to the Supabase store after the founder stored the service-role key; two cold-start races fixed (idempotent seed, locked preparation). Verified live: /case/demo/result renders the 75% result from Postgres (Fable).

- 2026-11-10 — Production demo flow verified end to end on Supabase (income → working → result → done → resolved). Root causes fixed: Next.js request memoisation made supabase-js re-read a just-written row as missing (custom fetch with no-store + fresh AbortController signal); concurrent cold starts on one database (idempotent seed, meta locks for the demo and walk preparation); approval reads consent from the consents table when the case row lost it. Video: Gemini 3.8 Flash TTS over REST, beats fitted to slots; huashu-motion film in progress under video/film.

- 2026-11-15 — Phase 10 planned: Snap Incognito (private mode). Feature plan after red-team review in docs/features/snap-incognito.md; runbook tasks I1–I4 in docs/BUILD.md. Nothing built. I1 (numbers path, computed in the browser) needs no new key; real bills wait on the I1 go-live gate, the live reader on a Vertex project and recorded terms (Fable). Superseded by the 2026-11-16 entry below.

- 2026-11-16 — Phase 10 replanned to the founder's direction: no typing; the user only drops files, as in Snap, and private mode copes with redacted pages (income is read from a dropped document). docs/features/snap-incognito.md rewritten and docs/BUILD.md Phase 10 replaced (20 tasks: I1 the whole drop-files flow with the demo reader, I2 PDFs turned into pictures on the phone, I3 the live reader behind the human go-live gate, I4 automatic on-device covering and the mocks). The typed-numbers path, the questions, the cover tool and the list of hospitals are gone. Nothing built. I1 needs no new key (Fable).

- 2026-11-17 — Phase 10, I1 task 1: Playwright tooling. `@playwright/test` 1.65.1, Chromium and WebKit installed, `playwright.config.ts` (two `next start` servers, 3100 demo reader and 3101 stub reader), `npm run e2e`, `tests/e2e/smoke.spec.ts`. Verified: 155 unit tests, typecheck, `npm run e2e` 2 passed (Chromium, WebKit) (Fable agent).

- 2026-11-17 — Phase 10, I1 task 2: flags, reader terms, copy. `privateReader()` and the private checks in `assertFlagsSafe` (stub refused in production without ALLOW_DEMO=1; gemini refused until I3), `PRIVATE_READER` in `.env.example`, `src/lib/private/readerTerms.ts` (ships empty), `src/lib/private/copy.ts` (S1 to S16, `promisesFor`, every fixed string of the feature document, each test-checked verbatim against it). Open for later tasks: the feature document writes only four step summaries, the left-out sentences only for one file, and no rule for which sentences take the `NOTICE_NAME` reading; strings that exist only in the PM mocks are not in `copy.ts`. Verified: 172 unit tests, typecheck, `npm run e2e` 2 passed (Fable agent).

- 2026-11-17 — Phase 10, I1 task 3: shared fixes, off by default. `matchLines(bill, msn, { tolerant })` with the rungs `code_amount` and `amount_order` (tolerant runs one rung over every line before the next, so a weaker rung never takes a notice line a stronger one would pair; the regular order is unchanged); `findDiscrepancies({ tolerant })` skips the duplicate check for a blank code or date and calls a culprit paired without code and date "possible". Always on: a `code_date` pair needs a non-blank code and date, and an empty description matches nothing (no fixture has either). `CaseFacts.noticeMaxCents` optional, `extraCents`, `formatDate` leaves a non-ISO string alone, `ClaimsConnector.kind` gains `dropped_document`. Verified: 184 unit tests (the existing cases untouched), typecheck (Fable agent).

- 2026-11-17 — Phase 10, I1 task 4: pipeline, off by default. `PipelineOpts.tolerant` (a missing notice goes on to `compareAndFinish(run, bill, null)`, a `requiresReview` finding does not park, the option reaches `findDiscrepancies`; a connector that is down still parks). `compareAndFinish`, `noticeSummary` and `factsFor` take a null notice. `PipelineDeps.drafts` replaces the two templates when given and each letter is checked against the facts it returns. Not settled by the runbook, chosen here: a tolerant or `drafts` run words three step summaries neutrally ("No notice to compare with", "The lines could not all be checked against a notice", "Letters ready: n") so no stored step says the bill agrees with a notice that was never read; private mode discards them anyway. Verified: 189 unit tests (the existing cases untouched), typecheck (Fable agent).

## Blockers

- Phase 6 (resolved 16:50 KST): Supabase project `kindred-snap` exists (ref `kdbqjygxyykdwpjmxyjh`, us-west-1, https://kdbqjygxyykdwpjmxyjh.supabase.co); the schema migration `kindred_snap_init` is applied with RLS. Still needed from a human: the service-role key in `.env.local` and in Vercel (`SUPABASE_SERVICE_ROLE_KEY`), which the MCP does not expose; until then `STORE=memory`.
- Phase 8: Vercel project `kindred-snap` is linked (team org); production env has EXTERNAL_ACTIONS, EXTRACTOR=fixture, STORE=memory and the public Supabase URL/anon key. No bypass flags in production (the classifier refused them; staff pages stay not-available on the deployed site until Phase 6 auth).

