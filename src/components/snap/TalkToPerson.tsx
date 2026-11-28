import { TEXT_CLASS } from "./TextAction";

/** Shown on a case screen when the case is this browser's and nobody is signed in (tests/e2e/case-access.spec.ts reopens it). */
export const GUEST_LINE = "Without signing in, you can come back to this case only in this browser, on this device. Signing in will not move it to your account.";

/** "Talk to a person": a plain <details> sheet with a placeholder phone line and, when known, the case code to read out; then the guest line when `guest`. */
export function TalkToPerson({ code, guest = false }: { code?: string; guest?: boolean }) {
  return (
    <>
      <details className="w-full">
        <summary className={TEXT_CLASS + " cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>Talk to a person</summary>
        <div className="mt-1 flex flex-col gap-1 rounded-card bg-paper-2 px-4 py-3 text-sm text-ink">
          <p>
            Call <a href="tel:+15550100100" className="font-mono">(555) 010-0100</a>, weekdays 9 to 5. Placeholder line for the demo.
          </p>
          {code && (
            <p>
              Give the case code <span className="font-mono">{code}</span>.
            </p>
          )}
        </div>
      </details>
      {guest && <p className="text-sm text-muted">{GUEST_LINE}</p>}
    </>
  );
}
