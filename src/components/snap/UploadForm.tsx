"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

const ACCEPT = "image/*,application/pdf";

/** kit.css `.btn-secondary`: white, rule ring, 3px drop. */
export const SECONDARY_CLASS =
  "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-input bg-white px-5 font-medium text-ink " +
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_0_1px_var(--color-rule),0_3px_0_var(--color-rule)] " +
  "transition-transform duration-[120ms] ease-out active:translate-y-[3px] active:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_0_1px_var(--color-rule)]";

/** kit.css `.tile`: a 96px white tray with an icon on the left. */
export const TILE_CLASS = "flex min-h-24 w-full items-center gap-3.5 rounded-card bg-white p-[18px] text-left text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]";

type Props = {
  action: (formData: FormData) => Promise<void>;
  /** opens the camera directly on phones; without it the picker offers files and the library */
  capture?: boolean;
  /** extra fields the action reads, e.g. { caseId } */
  hidden?: Record<string, string>;
  /** the visible control's look: PRIMARY_CLASS, SECONDARY_CLASS, TEXT_CLASS or TILE_CLASS */
  className: string;
  children: ReactNode;
  /** announced while the action runs, e.g. "Reading the bill…" */
  pendingText: string;
};

/**
 * One file input that submits the moment a file is chosen. The <label> is the visible control (the input itself is
 * screen-reader-only but keyboard focusable: Enter or Space opens the picker); without JavaScript the fallback button submits.
 */
export function UploadForm({ action, capture, hidden = {}, className, children, pendingText }: Props) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="flex w-full flex-col gap-1">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className={className + " cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"}>
        <input
          type="file"
          name="document"
          accept={ACCEPT}
          capture={capture ? "environment" : undefined}
          className="sr-only"
          onChange={() => form.current?.requestSubmit()}
        />
        {children}
      </label>
      <noscript>
        <button type="submit" className={SECONDARY_CLASS}>Upload</button>
      </noscript>
      <Pending text={pendingText} />
    </form>
  );
}

function Pending({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted">
      {pending ? text : ""}
    </p>
  );
}
