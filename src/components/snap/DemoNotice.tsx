/** The one demo notice; `children` overrides the text where a page needs its own wording. */
export function DemoNotice({ children = "Demo only: use the demo bill; do not upload a real bill." }: { children?: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}
