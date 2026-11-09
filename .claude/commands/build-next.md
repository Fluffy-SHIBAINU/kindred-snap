---
description: Execute the next unchecked task from docs/BUILD.md, verify it, commit it, update docs/build/STATUS.md, then stop.
---

You are continuing the Kindred Snap build. Work one task per invocation so a `/loop` can drive you safely.

1. Read `CLAUDE.md`, then `docs/build/STATUS.md`, then the first phase in `docs/BUILD.md` whose state is not `done`. Inside it, take the first unchecked `- [ ]` task. First check idempotence: `git status --porcelain` must be clean except files you are about to touch; if the last commit is a task commit with no matching `status:` commit after it, finish step 5 for that task instead of starting a new one. If `node_modules` is missing, run `npm install`. If the phase header says **[needs human]** and its secret or account is not configured, write the BLOCKED entry (step 7) and stop.
2. Before writing code, read the files the task names and the mock it points to (`docs/mocks/<file>`). For any route or server-action task, first read the relevant page under `node_modules/next/dist/docs/` (as `AGENTS.md` says). Follow `DESIGN.md` for anything visual.
3. Do the task completely: no TODOs, no stubs. Add or update the tests the task lists. Run `npm test && npm run typecheck`; fix until green, at most three attempts. If the task touches routes, also run `npm run build` (10-minute timeout). After three failed attempts: restore only the files you changed to their committed content and remove the new files you created, write the BLOCKED entry (step 7), and stop.
4. Commit only the files you changed, staged by explicit path, with the message the task gives (prefix it with the phase, e.g. `p1: ...`). No `git add -A`, no history rewriting, no cleaning of untracked files, no force-push and no push at all (a human pushes). Never commit `.env*` other than `.env.example`. Install only packages the task names.
5. Tick the task's box in `docs/BUILD.md`, append one log line to `docs/build/STATUS.md` (time, phase, task, who), and set the phase state to `done` when its last box is ticked. Commit that as `status: <phase> <task short name>`.
6. Stop. Report in three lines: what was done, what was verified, what is next. If nothing is left, say "BUILD COMPLETE".

7. Hard stops: if a task needs a secret, a Supabase project, a Vercel login, a tool that is not installed, or any decision the runbook does not settle, do not guess. Write a `BLOCKED` entry under "Blockers" in `docs/build/STATUS.md` (what you were doing, the blocker, what you need, what you will do when unblocked), commit it, and stop. Never perform or simulate an external send outside the adapter layer. Never copy code from other Kindred repositories.

Argument (optional): a phase number or task name to jump to, e.g. `/build-next 3` works on Phase 3's first unchecked task.
