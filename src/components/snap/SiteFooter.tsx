// Spec F footer, shared by the home page and the caregiver layout. Privacy and Terms join LINKS once the legal pages are approved (D11).
const LINKS = [
  { href: "https://kindred-ai.dev/", label: "Kindred AI" },
  { href: "https://kindred-ai.dev/#contact", label: "Talk to us" },
];

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-rule py-4 text-sm ${className}`}>
      <nav aria-label="Kindred AI" className="flex flex-wrap items-center gap-x-4">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="inline-flex min-h-12 items-center font-medium underline hover:text-accent focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-focus">
            {l.label}
          </a>
        ))}
      </nav>
      <p className="text-muted">Not legal or medical advice. The hospital or the program decides.</p>
      <p className="text-muted">Policy data: Waive atlas, CC BY 4.0.</p>
    </footer>
  );
}
