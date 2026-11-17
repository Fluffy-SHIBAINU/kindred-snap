import { connection } from "next/server";
import { PrivateFlow } from "@/components/private/PrivateFlow";
import { DEMO_SET, demoHashes } from "@/lib/adapters/extract/privateRead";
import { READER_TERMS } from "@/lib/private/readerTerms";
import { privateReader } from "@/lib/server/flags";

/** PRIVATE_READER is read per request. */
export const instant = false;
/** `runPrivate` reads every dropped page inside the one request. */
export const maxDuration = 60;

/**
 * Snap in private mode (docs/features/snap-incognito.md §2): the four screens live in the client component's step
 * state, so nothing is in the URL. No demo badge: with the demo reader the first sentence on the screen says it.
 */
export default async function PrivatePage() {
  await connection();
  return <PrivateFlow reader={privateReader()} demoHashes={demoHashes()} demoSet={DEMO_SET} terms={READER_TERMS} />;
}
