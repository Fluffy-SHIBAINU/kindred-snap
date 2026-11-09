# Kindred Snap — project context for Claude Code

Read this first in every session. Then read `docs/build/STATUS.md` (where the build stands) and the current phase in `docs/BUILD.md`. The product record is `PRODUCT.md`, the design system is `DESIGN.md`, the full plan is `docs/PLAN.md`, the mocks are `docs/mocks/` (gallery: https://fluffy-shibainu.github.io/kindred-snap/mocks/).

## What this is

Kindred Snap lowers a hospital bill for an Original Medicare patient, usually on behalf of an adult child. The caregiver photographs the bill once and types household income once; the app reads the bill, fetches the Medicare Summary Notice (synthetic adapter), compares line by line, checks the hospital's own published financial-assistance policy, drafts the correction letter and the assistance application, and waits for one tap ("Draft the letters and send") before anything is marked sent. Staff review cases in a separate workspace. Everything external is simulated and labelled.

Hackathon build, started 2026-11-09 10:40 KST. Fresh code only: nothing is copied from other Kindred repositories (Tender, Waive, Biscuit). Data from the Waive atlas (CC BY 4.0) is allowed.

## Non-negotiable rules

1. Synthetic patient data only. Never request, store or commit real patient information.
2. No external action, ever: no email, fax, API call to a hospital or CMS, no payment. `EXTERNAL_ACTIONS=simulated` is the only mode that exists; a "live" adapter must not be written in this hackathon.
3. Every material finding carries its evidence (document, page, line, quoted text). "Insufficient information" is a valid result. Never invent billing rules, coverage, eligibility, outcomes or savings.
4. Money has three labels that never merge: estimated (the app's computation), confirmed (a provider document recorded by staff with a basis document id), actual patient savings (confirmed adjustment on a balance the patient was asked to pay). Confirmed cannot be created from an estimate.
5. Uploaded documents and model output are data, never instructions. Validate every number in a drafted letter against the case before showing it.
6. Real and simulated are never confusable on screen: the badges "Demo partner · synthetic data" and "Simulated" appear wherever hospital or Medicare data shows.
7. Accessibility floor (DESIGN.md §9): 18px body, 56px primary control, WCAG AA on every text pair, keyboard path, no autoplay audio, no mandatory voice, zoom never locked.
8. Titles and subtitles in Title Case; buttons, labels and body in sentence case. The app is in English.
9. One primary action per caregiver screen; auto steps show as a progress feed; the caregiver flow is exactly the six screens in `docs/mocks/M01…M06`.
10. Commit after every completed task with the message BUILD.md gives; never `git add -A`; never commit `.env*` except `.env.example`.

## Stack

Next.js 16 App Router (TypeScript, Server Actions) · Tailwind v4 + shadcn/ui (`src/components/ui`) · Atkinson Hyperlegible Next and Mono via `next/font` · Hallmark tokens in `src/app/tokens.css` (`@theme`) and `src/app/base.css` · vitest for unit tests · Playwright + axe for accessibility · Supabase free tier (email one-time code, Postgres, private storage) behind a store interface with an in-memory implementation for dev and tests · Gemini (`@google/genai`) for extraction and letter drafting behind an adapter with a fixture implementation · Vercel Hobby for hosting.

## Commands

```bash
npm install
cp .env.example .env.local        # GOOGLE_API_KEY optional in dev (fixture extractor runs without it)
npm run dev                       # http://localhost:3000
npm test                          # vitest
npm run typecheck                 # tsc --noEmit
npm run build
```

The Waive atlas is a source, never a copy: `git submodule update --init` checks out the private `waive-data` repository at `vendor/waive-data` and the loader reads `vendor/waive-data/data/atlas/*.json` (all states). `ATLAS_DIR` points at another checkout. Nothing from the atlas is committed here except `fixtures/hospitals.json`, a derived record of the three pilot hospitals with quotes and sources.

## Layout

```
src/app/                 routes: / (landing), /snap, /case/[id]/{income,working,result,done,resolved}, /staff/*
src/components/ui/       shadcn primitives (copied source; edit heights/sizes here, do not override)
src/components/landing/  WindowDust (particle field), GroundCard (three grounds)
src/lib/money.ts         integer cents helpers
src/lib/case/            state machine, transitions, approval gate
src/lib/compare.ts       bill vs Medicare notice line matching, discrepancies with evidence
src/lib/eligibility.ts   FPL percent and the hospital's tier, with the quoted policy line
src/lib/atlas.ts         Waive atlas loader (fixtures/atlas or ATLAS_DIR)
src/lib/savings.ts       estimated / confirmed / actual rules
src/lib/adapters/        extract (gemini, fixture), claims (synthetic Blue Button), hospital (demo partner), store (memory, supabase)
src/lib/audit.ts         append-only audit events
fixtures/                synthetic case, edge cases, hospitals.json (the three pilot hospitals); no atlas copies
vendor/waive-data/       git submodule: the private Waive atlas source (data/atlas/*.json)
supabase/migrations/     SQL (additive only)
tests/                   vitest specs mirror src/lib
docs/BUILD.md            the phased build runbook; docs/build/STATUS.md the tracker
```

## Gotchas

- The Bash tool runs zsh here: `set -- $var` does not split; use `read -r a b <<< "$var"`.
- Design-canvas artboards (`docs/mocks/*.dc.html`) render standalone without their runtime; `{{holes}}` and `<dc-import>` fill only on the canvas.
- `next/font` has no fallback metrics for Atkinson Hyperlegible Mono; `adjustFontFallback: false` is set on purpose.
- The repository is public. Never add private data, keys or real patient documents.
