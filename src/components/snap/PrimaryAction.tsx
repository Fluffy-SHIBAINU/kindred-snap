import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Exported so a file-upload label (UploadForm) can be the screen's primary control. */
export const PRIMARY_CLASS =
  "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-input bg-accent px-5 font-medium text-accent-ink no-underline " +
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_0_1px_var(--color-accent-deep),0_3px_0_var(--color-accent-deep)] " +
  "transition-transform duration-[120ms] ease-out hover:bg-accent-deep active:translate-y-[3px] " +
  "active:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_0_1px_var(--color-accent-deep)] disabled:opacity-60";

type Props = { href?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className">;

/** The one primary action of a caregiver screen (DESIGN.md §6): an <a> when `href` is given, else a submit button. */
export function PrimaryAction({ href, children, ...rest }: Props) {
  if (href) return <Link href={href} className={PRIMARY_CLASS}>{children}</Link>;
  return <button type="submit" className={PRIMARY_CLASS} {...rest}>{children}</button>;
}
