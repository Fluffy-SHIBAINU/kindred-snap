"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ActionBar } from "@/components/snap/ActionBar";
import { PRIMARY_CLASS } from "@/components/snap/PrimaryAction";
import { TEXT_CLASS } from "@/components/snap/TextAction";
import { SECONDARY_CLASS } from "@/components/snap/UploadForm";
import { ACTIONS, COVER_SHEET, ERASE, H1, LETTERS, LETTER_TITLES, PRINT_FOOTER, PROMISES, RESULT, SCREEN, fill } from "@/lib/private/copy";
import type { PrivateResult } from "@/lib/private/types";
import { Disclosure } from "./Disclosure";
import { Assumed, MONO, withMono } from "./PrivateResultView";

// kit.css `.blank`: a rule to write on
const LINE = "border-b-[1.5px] border-ink ";
const RULE = "inline-block h-[1.15em] max-w-full " + LINE;
const PLACEHOLDER = /\[[A-Za-z][A-Za-z ]*\]/;
const BLANKS = new RegExp(`(${PLACEHOLDER.source}|____)`);
const BULLETS = "flex list-disc flex-col gap-0.5 pl-5";

/** A closed row prints nothing, so every document is opened before the page goes to paper. */
const openRows = (within: HTMLElement | null) =>
  within?.querySelectorAll("details").forEach((row) => {
    row.open = true;
  });

/** A stretch of letter text for the eye: figures in the mono face, `____` a ruled blank, a `[placeholder]` a ruled blank with its label under it. */
const drawn = (text: string) =>
  text.split(BLANKS).map((part, i) =>
    part === "____" ? (
      <span key={i} aria-hidden="true" className={RULE + "min-w-[150px] align-baseline"} />
    ) : i % 2 ? (
      <span key={i} className="inline-flex max-w-full flex-col align-top">
        <span aria-hidden="true" className={RULE + (/name/i.test(part) ? "w-[230px]" : "w-[150px]")} />
        <span className="text-muted">{part[1].toUpperCase() + part.slice(2, -1)}</span>
      </span>
    ) : (
      <Fragment key={i}>{withMono(part)}</Fragment>
    ),
  );

/**
 * One line of a letter, drawn for the eye (mock PM4a). The draft is plain text for a pen: `[ ]` becomes a square to
 * tick, and a blank is drawn by `drawn`. `signing` marks the signature block, where a blank is a full-width rule with
 * its label under it. `Share` and `Copy the text` use the text itself.
 */
function DraftLine({ line, signing }: { line: string; signing: boolean }) {
  if (line.includes("[ ]")) {
    const labels = line.split("[ ]").map((label) => label.trim()).filter(Boolean);
    return (
      <div className="flex flex-col gap-2 print:flex-row print:flex-wrap print:gap-x-10">
        {labels.map((label) => (
          <span key={label} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-[0.15em] size-[18px] shrink-0 rounded-[3px] border-[1.5px] border-ink bg-white" />
            {label}
          </span>
        ))}
      </div>
    );
  }
  const text = line.trim();
  const signed = signing && text.match(/^(.+): ____$/);
  if (signed) {
    return (
      <div className="flex flex-col pt-1.5">
        <span aria-hidden="true" className={"h-8 w-full " + LINE} />
        <span className="text-muted">{signed[1]}</span>
      </div>
    );
  }
  // a heading line with a blank ("Re: account number ____, statement dated ..., patient ____") keeps each part between
  // commas whole, so no label lands inside a phrase; a sentence flows on. A date's own comma is not a break.
  const parts = PLACEHOLDER.test(text) && !text.endsWith(".") ? text.split(/, (?!\d{4})/) : [text];
  return (
    <p className={line.startsWith("  ") ? "pl-3" : undefined}>
      {parts.length === 1
        ? drawn(text)
        : parts.map((part, i) => (
            <Fragment key={i}>
              <span className="inline-block max-w-full">{drawn(i < parts.length - 1 ? part + "," : part)}</span>{" "}
            </Fragment>
          ))}
    </p>
  );
}

/** "Before You Send": what is still blank, what to attach, where it goes. */
function Cover({ result: r }: { result: PrivateResult }) {
  const applying = r.letters.some((l) => l.kind === "assistance_application");
  const p = r.policy;
  const phone = p?.policy.phone.value;
  const form = p?.policy.formUrl.value;
  return (
    <>
      <p className="font-bold">{COVER_SHEET.blankTitle}</p>
      <ul className={BULLETS}>
        <li>{COVER_SHEET.blankLetters}</li>
        {applying && <li>{COVER_SHEET.blankApplication}</li>}
        <li>{COVER_SHEET.blankSigning}</li>
      </ul>
      <p className="font-bold">{COVER_SHEET.attachTitle}</p>
      <ul className={BULLETS}>
        <li>{COVER_SHEET.attachBill}</li>
        <li>{r.noticeKind ? COVER_SHEET.attachNotice : COVER_SHEET.attachNoticeIfAny}</li>
        {applying && <li>{COVER_SHEET.attachIncome}</li>}
      </ul>
      <p className="font-bold">{COVER_SHEET.whereTitle}</p>
      <p>
        {[COVER_SHEET.where, p && fill(RESULT.matched, { hospital: p.name, city: p.city, state: p.state }), p && r.demo && COVER_SHEET.demoContact].filter(Boolean).join(" ")}
      </p>
      {!r.demo && phone && (
        <p>
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={MONO}>
            {phone}
          </a>
        </p>
      )}
      {!r.demo && form && /^https?:\/\//.test(form) && (
        <p>
          <a href={form} target="_blank" rel="noreferrer" className="break-all">
            {form}
          </a>
        </p>
      )}
      <p>{LETTERS.permission}</p>
    </>
  );
}

/** Erase is an inline row, not a modal: opening it asks, and one more tap erases. */
export function Erase({ onErase }: { onErase: () => void }) {
  return (
    <details className="w-full">
      <summary className={TEXT_CLASS + " cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>{ERASE.action}</summary>
      <div className="flex flex-col gap-2 pt-2">
        <p className="text-sm">{ERASE.ask}</p>
        <button type="button" className={SECONDARY_CLASS} onClick={onErase}>
          {ERASE.confirm}
        </button>
      </div>
    </details>
  );
}

type Props = {
  result: PrivateResult;
  /** the letter text went to the clipboard, so an erase overwrites it */
  onCopied: () => void;
  /** the inline erase row */
  erase: ReactNode;
};

/**
 * Screen 4 (mocks PM4a and PM4b; docs/features/snap-incognito.md §2 and §7): the packet as closed rows, one per
 * document, built from the result already in the tab, so opening it makes no request. Printing opens every row and
 * lays out one document a page.
 */
export function PrivateLetters({ result: r, onCopied, erase }: Props) {
  const [copied, setCopied] = useState(false);
  const rows = useRef<HTMLDivElement>(null);

  // the browser's own print command opens the rows too
  useEffect(() => {
    const open = () => openRows(rows.current);
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  const text = r.letters.map((l) => `${l.title}\n\n${l.draft}`).join("\n\n\n");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = () =>
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        onCopied();
      },
      () => {},
    );
  const docs: Array<{ title: string; note?: string; body: ReactNode }> = [
    { title: LETTER_TITLES.cover, body: <Cover result={r} /> },
    ...r.letters.map((l) => {
      const lines = l.draft.split("\n").map((line, i) => ({ line, i }));
      // the signature block is whatever follows the last tick boxes; on paper it takes two columns (mock PM4b), which keeps a letter to one page
      const ticks = lines.map(({ line }) => line.includes("[ ]")).lastIndexOf(true);
      const draw = (part: typeof lines, signing: boolean) => part.map(({ line, i }) => (line.trim() ? <DraftLine key={i} line={line} signing={signing} /> : null));
      return {
        title: l.title,
        body: (
          <>
            {draw(lines.slice(0, ticks + 1), false)}
            <div className="flex flex-col gap-2 print:grid print:auto-cols-fr print:grid-flow-col print:grid-rows-2 print:gap-x-10 print:break-inside-avoid">{draw(lines.slice(ticks + 1), true)}</div>
          </>
        ),
      };
    }),
    { title: LETTER_TITLES.assumed, note: LETTERS.keep, body: <Assumed result={r} /> },
  ];

  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4 print:block print:p-0">
        <h1 tabIndex={-1} className="outline-none print:hidden">{H1.letters}</h1>
        <p className="print:hidden">{PROMISES.S12}</p>
        <div ref={rows} className="flex flex-col gap-2 print:block">
          {docs.map((d, i) => (
            <Disclosure
              key={d.title}
              data-print-page
              summary={
                <span className="flex flex-col">
                  <span>
                    <span className="print:hidden">{i + 1}. </span>
                    {d.title}
                  </span>
                  {d.note && <span className="text-sm font-normal text-muted">{d.note}</span>}
                </span>
              }
            >
              {d.body}
              <p className="hidden pt-6 text-muted print:block print:break-before-avoid">{PRINT_FOOTER}</p>
            </Disclosure>
          ))}
        </div>
        <p className="text-sm print:hidden">{LETTERS.attach}</p>
        <p className="text-sm text-muted print:hidden">{PROMISES.S11}</p>
      </div>
      <ActionBar>
        <button
          type="button"
          className={PRIMARY_CLASS}
          onClick={() => {
            openRows(rows.current);
            window.print();
          }}
        >
          {ACTIONS.print}
        </button>
        <div className="flex gap-2">
          {canShare && (
            <button type="button" className={TEXT_CLASS} onClick={() => void navigator.share({ text }).catch(() => {})}>
              {ACTIONS.share}
            </button>
          )}
          <button type="button" className={TEXT_CLASS} onClick={copy}>
            {ACTIONS.copyText}
          </button>
        </div>
        <p role="status" className={copied ? "text-center text-sm text-muted" : "sr-only"}>
          {copied ? SCREEN.copied : ""}
        </p>
        {erase}
      </ActionBar>
    </>
  );
}
