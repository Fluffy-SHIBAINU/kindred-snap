import type { InputHTMLAttributes } from "react";

/** kit.css `.input`: 56px, white, muted hairline, accent on focus, 18px text. Add `font-mono` for amounts. */
export const INPUT_CLASS =
  "min-h-14 w-full rounded-input border border-muted bg-white px-4 text-[length:var(--text-md)] text-ink " +
  "focus:border-accent focus:outline-3 focus:outline-offset-2 focus:outline-focus";

type Props = { id: string; label: string; help?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

/** A labelled input with optional helper text (kit.css `.field`). */
export function Field({ id, label, help, ...input }: Props) {
  const helpId = help ? id + "-help" : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input id={id} aria-describedby={helpId} className={INPUT_CLASS + (input.inputMode === "numeric" ? " font-mono" : "")} {...input} />
      {help && (
        <p id={helpId} className="text-sm text-muted">
          {help}
        </p>
      )}
    </div>
  );
}
