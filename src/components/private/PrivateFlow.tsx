"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { runPrivate } from "@/app/(caregiver)/private/actions";
import { ActionBar } from "@/components/snap/ActionBar";
import { CameraIcon, CheckIcon, InfoIcon } from "@/components/snap/icons";
import { PRIMARY_CLASS } from "@/components/snap/PrimaryAction";
import { StepRow } from "@/components/snap/StepRow";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TEXT_CLASS } from "@/components/snap/TextAction";
import { SECONDARY_CLASS } from "@/components/snap/UploadForm";
import { ACTIONS, BODY, H1, HELD, REFUSED, SCREEN, STEP_SUMMARIES, STEP_TITLES, STOP, fill, promisesFor } from "@/lib/private/copy";
import { prepare, toForm, type Held } from "@/lib/private/hygiene";
import type { ReaderTerms } from "@/lib/private/readerTerms";
import { IDLE_MS, forget, loadResult, saveResult } from "@/lib/private/session";
import type { PrivateOutcome, PrivateResult } from "@/lib/private/types";
import { STEP_KEYS, SUFFIX } from "@/lib/progress";
import type { Step } from "@/lib/types";
import { Disclosure } from "./Disclosure";
import { Erase, PrivateLetters } from "./PrivateLetters";
import { PrivateResultView } from "./PrivateResultView";

type Props = { reader: "fixture" | "stub" | "gemini"; demoHashes: Record<string, string>; demoSet: string[]; terms: ReaderTerms };
type Screen = "drop" | "working" | "result" | "letters";
/** The box above the drop screen: why the check stopped, or that it was erased. */
type Notice = { erased?: boolean; lines: string[] };

const NOTHING: Held = { pages: [], demoIds: [] };
// how long the finished rows stay readable before the result takes their place
const DWELL_MS = 1500;
const FOCUS = " cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

/** A file input whose label is the visible control, as in Snap's UploadForm but with no form: the files go straight to `onFiles`. */
function FilePick({ onFiles, camera, className, children }: { onFiles: (files: File[]) => void; camera?: boolean; className: string; children: ReactNode }) {
  return (
    <label className={className + FOCUS}>
      <input
        type="file"
        className="sr-only"
        accept={camera ? "image/*" : "image/*,application/pdf"}
        capture={camera ? "environment" : undefined}
        multiple={!camera}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // so the same file can be picked again
          e.target.value = "";
          onFiles(files);
        }}
      />
      {children}
    </label>
  );
}

/**
 * Private mode's four screens (mocks PM1a to PM5; docs/features/snap-incognito.md §2) as step state: nothing is in the
 * URL. The pages a user drops are held in a ref, never in storage, and every new file runs the one request again with
 * all of them. The only inputs are file inputs, and there is no form. Nothing here logs.
 */
export function PrivateFlow({ reader, demoHashes, demoSet, terms }: Props) {
  const [screen, setScreen] = useState<Screen>("drop");
  const [result, setResult] = useState<PrivateResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [, startTransition] = useTransition();
  const held = useRef<Held>(NOTHING);
  // a check that was erased or timed out while its request ran is dropped when it answers
  const run = useRef(0);
  const copied = useRef(false);
  const mounted = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  /** Forgets the check on this phone: the tab's storage, the held pages and what is on screen. */
  const reset = useCallback((to: Notice | null) => {
    run.current++;
    forget();
    held.current = NOTHING;
    setHeldCount(0);
    setResult(null);
    setNotice(to);
    setScreen("drop");
  }, []);

  // a reload keeps the result (the pages are gone)
  useEffect(() => {
    const saved = loadResult();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tab's storage can only be read after hydration, once
    setResult(saved);
    setScreen("result");
  }, []);

  // 30 minutes without use erases the check
  useEffect(() => {
    let last = Date.now();
    let timer = setTimeout(() => reset(null), IDLE_MS);
    const used = () => {
      last = Date.now();
      clearTimeout(timer);
      timer = setTimeout(() => reset(null), IDLE_MS);
    };
    // a sleeping phone holds its timers back, so the clock is read again when the tab is back in view
    const seen = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= IDLE_MS) reset(null);
    };
    window.addEventListener("pointerdown", used);
    window.addEventListener("keydown", used);
    document.addEventListener("visibilitychange", seen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", used);
      window.removeEventListener("keydown", used);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [reset]);

  // the finished rows stay readable for a moment, then the screen moves on by itself
  useEffect(() => {
    if (screen !== "working" || !result) return;
    const timer = setTimeout(() => setScreen("result"), DWELL_MS);
    return () => clearTimeout(timer);
  }, [screen, result]);

  // each new screen starts at its heading
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    root.current?.closest("main")?.scrollTo(0, 0);
    root.current?.querySelector("h1")?.focus();
  }, [screen]);

  /** Back to the drop screen with the reason. The held pages stay for the next file unless the reason says otherwise. */
  function stop(lines: string[], clear = false) {
    if (clear) {
      held.current = NOTHING;
      setHeldCount(0);
    }
    setNotice({ lines });
    setScreen("drop");
  }

  /** One check: the working rows show at once, the files are prepared on the phone, and the single request follows. */
  function check(pick: () => Promise<Awaited<ReturnType<typeof prepare>>>) {
    const id = ++run.current;
    setNotice(null);
    setResult(null);
    setScreen("working");
    startTransition(async () => {
      const prepared = await pick();
      if (id !== run.current) return;
      if ("refused" in prepared) return stop([REFUSED[prepared.refused]]);
      held.current = prepared.held;
      setHeldCount(prepared.held.pages.length + prepared.held.demoIds.length);
      let outcome: PrivateOutcome;
      try {
        outcome = await runPrivate(toForm(prepared.held));
      } catch {
        outcome = { status: "failed" };
      }
      if (id !== run.current) return;
      if (outcome.status === "ok") {
        saveResult(outcome.result);
        setResult(outcome.result);
      } else if (outcome.status === "failed") stop(promisesFor("failed", reader, terms));
      else if (outcome.reason === "demo_only") stop([REFUSED.demo_only]);
      else stop([STOP[outcome.reason], ...promisesFor("stop", reader, terms)], outcome.reason === "two_bills");
    });
  }

  const onFiles = (files: File[]) => {
    if (files.length) check(() => prepare(files, held.current, { reader, demoHashes }));
  };
  const erase = (
    <Erase
      onErase={() => {
        if (copied.current) void navigator.clipboard?.writeText("").catch(() => {});
        copied.current = false;
        reset({ erased: true, lines: promisesFor("erased", reader, terms) });
      }}
    />
  );

  const demo = reader === "fixture";
  const body = promisesFor("body", reader, terms);
  const rows: Step[] = result?.steps ?? STEP_KEYS.map((key, i) => ({ key, title: STEP_TITLES[i], status: i ? "waiting" : "active", summary: i ? "" : STEP_SUMMARIES.reading }));

  return (
    <div ref={root} className="contents">
      {screen === "drop" && (
        <>
          <div className="flex flex-col gap-3 px-6 pb-4">
            <noscript>
              <p>{SCREEN.noScript}</p>
            </noscript>
            {notice && (
              <div role="status" className="flex flex-col gap-2">
                <div className="flex items-start gap-3 rounded-card bg-white px-4 py-3.5 shadow-[inset_0_0_0_2px_var(--color-ink)]">
                  <span className="shrink-0">{notice.erased ? <CheckIcon size={24} /> : <InfoIcon size={24} />}</span>
                  <div className="flex min-w-0 flex-col gap-1">
                    {notice.lines.map((sentence, i) => (
                      <p key={sentence} className={i || notice.erased ? undefined : "font-bold"}>
                        {sentence}
                      </p>
                    ))}
                  </div>
                </div>
                {heldCount > 0 && <p className="text-sm text-muted">{heldCount === 1 ? HELD.one : fill(HELD.many, { n: heldCount })}</p>}
              </div>
            )}
            <h1 tabIndex={-1} className="outline-none">{H1.drop}</h1>
            <p>{BODY.drop}</p>
            {demo && (
              <div className="flex items-start gap-3 rounded-card bg-paper-2 px-4 py-3.5">
                <span className="shrink-0">
                  <InfoIcon size={24} />
                </span>
                <p>{body[0]}</p>
              </div>
            )}
            <div
              role="img"
              aria-label={SCREEN.guideLabel}
              className="flex min-h-30 flex-col items-center justify-center gap-2 rounded-card bg-paper-3 p-4 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <CameraIcon size={40} />
              <p className="text-sm text-muted">{SCREEN.guide}</p>
            </div>
            {demo ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted">{BODY.whenLive}</p>
                {body.slice(1).map((sentence) => (
                  <p key={sentence}>{sentence}</p>
                ))}
              </div>
            ) : (
              body.map((sentence) => <p key={sentence}>{sentence}</p>)
            )}
            <p>{BODY.pdfsLater}</p>
            <Disclosure summary={BODY.detailsSummary}>
              {promisesFor("details", reader, terms).map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </Disclosure>
          </div>
          <ActionBar>
            <FilePick camera onFiles={onFiles} className={PRIMARY_CLASS}>
              <CameraIcon />
              {ACTIONS.takePhoto}
            </FilePick>
            <FilePick onFiles={onFiles} className={SECONDARY_CLASS}>
              {ACTIONS.pick}
            </FilePick>
            {demo && (
              <button type="button" className={TEXT_CLASS} onClick={() => check(async () => ({ held: { pages: [], demoIds: [...demoSet] } }))}>
                {ACTIONS.demoFiles}
              </button>
            )}
          </ActionBar>
        </>
      )}

      {screen === "working" && (
        <>
          <div className="flex flex-col gap-4 px-6 pb-4">
            <h1 tabIndex={-1} className="outline-none">{H1.working}</h1>
            <p>{BODY.working}</p>
            {/* the list is the live region: a second copy of a row's words would be read twice */}
            <ol aria-label={SCREEN.stepsLabel} aria-live="polite" className="flex flex-col gap-2">
              {rows.map((s) => (
                <StepRow key={s.key} step={{ ...s, title: s.title + SUFFIX[s.status] }} />
              ))}
            </ol>
          </div>
          {reader !== "gemini" && (
            <ActionBar>
              <TalkToPerson />
            </ActionBar>
          )}
        </>
      )}

      {screen === "result" && result && (
        <PrivateResultView
          result={result}
          reader={reader}
          onLetters={() => setScreen("letters")}
          erase={erase}
          more={(className) =>
            heldCount > 0 ? (
              <FilePick onFiles={onFiles} className={className}>
                {ACTIONS.addFile}
              </FilePick>
            ) : (
              <button
                type="button"
                className={className}
                onClick={() => {
                  setNotice(null);
                  setScreen("drop");
                }}
              >
                {ACTIONS.startOver}
              </button>
            )
          }
        />
      )}

      {screen === "letters" && result && (
        <PrivateLetters
          result={result}
          erase={erase}
          onCopied={() => {
            copied.current = true;
          }}
        />
      )}
    </div>
  );
}
