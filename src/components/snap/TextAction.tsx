import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Exported so a file-upload label (UploadForm) and a <details> summary can look like a text action. */
export const TEXT_CLASS =
  "inline-flex min-h-12 w-full items-center justify-center px-2 font-medium text-ink underline decoration-1 underline-offset-[0.16em] hover:text-accent";

type Props = { href?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

/** Underlined text link or button with a 48px hit target (DESIGN.md §6 `.btn-text`). */
export function TextAction({ href, children, type = "button", ...rest }: Props) {
  if (href) return <Link href={href} className={TEXT_CLASS}>{children}</Link>;
  return <button type={type} className={TEXT_CLASS} {...rest}>{children}</button>;
}
