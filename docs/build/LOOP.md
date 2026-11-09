# Running the build with /loop

Any Claude Code session (Fable, Opus 5.5, Sonnet) can continue this build. The runbook is `docs/BUILD.md`; the tracker is `docs/build/STATUS.md`; the project command `/build-next` does exactly one task per invocation.

Start a session in this repository and run:

```
/loop 12m /build-next
```

Each tick executes the next unchecked task, verifies it (`npm test && npm run typecheck`, plus `npm run build` for route changes), commits it, and updates the tracker. Stop the loop when STATUS.md says `BUILD COMPLETE` or shows a `BLOCKED` entry. To work a specific phase, pass its number: `/loop 12m /build-next 5`.

If `/build-next` is not listed as a command, the file is `.claude/commands/build-next.md`; paste its body as the prompt instead.

Model notes: Phases 1, 2, 6 and 9 are mechanical and suit any model. Phases 3, 4 and 7 are visual; read `DESIGN.md` and the mock files before each task. Phase 5 (the video) needs the huashu-motion skill or the Remotion path described in the phase.
