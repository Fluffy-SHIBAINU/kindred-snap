import { Disclosure } from "@/components/private/Disclosure";
import { ActionBar } from "@/components/snap/ActionBar";
import { DemoNotice } from "@/components/snap/DemoNotice";
import { CameraIcon } from "@/components/snap/icons";
import { PRIMARY_CLASS } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TextAction, TEXT_CLASS } from "@/components/snap/TextAction";
import { SECONDARY_CLASS, UploadForm } from "@/components/snap/UploadForm";
import { BODY, BUTTON_LABEL, promisesFor } from "@/lib/private/copy";
import { privateReader } from "@/lib/server/flags";
import { createCaseFromUpload } from "./actions";

type Props = { searchParams: Promise<{ unreadable?: string }> };

/** searchParams and EXTRACTOR are read per request. */
export const instant = false;

/** Mock M01: one photo of the bill. With `?unreadable=<reason>` it is the E01 recovery screen. */
export default async function SnapPage({ searchParams }: Props) {
  const { unreadable } = await searchParams;
  const demoOnly = process.env.EXTRACTOR !== "gemini";
  if (unreadable) return <Unreadable reason={unreadable} demoOnly={demoOnly} />;

  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <h1>Take a Photo of the Bill</h1>
        <p>Lay it flat, whole page in the box, good light.</p>
        {demoOnly && <DemoNotice />}
        {/* the guide is kept small, with the camera glyph of mocks M01 and PM0, so the private mode link and the row under it sit inside the first screen of a 390 by 844 phone */}
        <div role="img" aria-label="Camera view with a page guide" className="flex flex-col items-center gap-2 rounded-card bg-paper-3 p-4">
          <CameraIcon size={40} />
          <p className="text-sm text-muted">Fit the whole page inside this box</p>
        </div>
        <UploadForm action={createCaseFromUpload} className={SECONDARY_CLASS} pendingText="Reading the document…">
          Pick a PDF or photo instead
        </UploadForm>
        <a href="/private" className={SECONDARY_CLASS}>
          {BUTTON_LABEL}
        </a>
        <Disclosure summary={BODY.snapSummary}>
          {promisesFor("snap", privateReader()).map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </Disclosure>
        <form action={createCaseFromUpload}>
          <input type="hidden" name="demo" value="main" />
          <TextAction type="submit">Use the demo bill</TextAction>
        </form>
      </div>
      <ActionBar>
        <UploadForm action={createCaseFromUpload} capture className={PRIMARY_CLASS} pendingText="Reading the bill…">
          <CameraIcon />
          Take photo
        </UploadForm>
        <TalkToPerson />
      </ActionBar>
    </>
  );
}

/** Mock E01: the numbers could not be trusted, so none were kept. */
function Unreadable({ reason, demoOnly }: { reason: string; demoOnly: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <h1>We Couldn&rsquo;t Read That Photo.</h1>
        <p>The numbers are too blurry to trust, so we won&rsquo;t use them.</p>
        <div role="status" className="rounded-card bg-paper-3 px-4 py-3">
          {reason}
        </div>
        <p className="text-sm text-muted">The photo stays on this phone.</p>
        <p>Try again with the page flat on a table, in good light. Hold still.</p>
        <p>Nothing you&rsquo;ve done is lost.</p>
        {demoOnly && <DemoNotice />}
      </div>
      <ActionBar>
        <UploadForm action={createCaseFromUpload} capture className={PRIMARY_CLASS} pendingText="Reading the bill…">
          <CameraIcon />
          Take another photo
        </UploadForm>
        <UploadForm action={createCaseFromUpload} className={TEXT_CLASS} pendingText="Reading the document…">
          Upload a PDF instead
        </UploadForm>
        <form action={createCaseFromUpload}>
          <input type="hidden" name="demo" value="main" />
          <TextAction type="submit">Use the demo bill</TextAction>
        </form>
        <TalkToPerson />
      </ActionBar>
    </>
  );
}
