import { connection } from "next/server";
import { newCaseOwner } from "@/lib/server/access";
import { sampleCaseHref } from "@/lib/server/walk";

/** "See a case": each visitor gets a private copy of the sample case (a walk case), so one visitor's send changes nothing for the next. */
export async function GET() {
  await connection(); // a fresh id per request: never prerendered or cached
  await newCaseOwner(); // the copy is this browser's: the case pages after this redirect cannot set the cookie
  return new Response(null, { status: 307, headers: { Location: sampleCaseHref(), "Cache-Control": "no-store" } });
}
