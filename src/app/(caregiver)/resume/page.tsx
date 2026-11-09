import { ActionBar } from "@/components/snap/ActionBar";
import { Field } from "@/components/snap/Field";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TextAction } from "@/components/snap/TextAction";
import { resumeByCode } from "./actions";

type Props = { searchParams: Promise<{ notfound?: string }> };

/** searchParams are read per request. */
export const instant = false;

/** Pick a case back up by its code (shown on every screen). */
export default async function ResumePage({ searchParams }: Props) {
  const { notfound } = await searchParams;
  return (
    <>
      <form id="resume-form" action={resumeByCode} className="flex flex-col gap-4 px-6 pb-4">
        <h1>Find Your Case</h1>
        <p>Type the code from the top of your case, like SNAP-7K4M2D.</p>
        <Field id="code" name="code" label="Case code" placeholder="SNAP-" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" required />
        <p role="status" className="text-sm">
          {notfound ? "No case has that code. Check the letters and try again." : ""}
        </p>
      </form>
      <ActionBar>
        <PrimaryAction form="resume-form">Open my case</PrimaryAction>
        <TextAction href="/snap">Start a new case instead</TextAction>
        <TalkToPerson />
      </ActionBar>
    </>
  );
}
