import { notFound, redirect } from "next/navigation";
import { ActionBar } from "@/components/snap/ActionBar";
import { Field } from "@/components/snap/Field";
import { DocumentIcon } from "@/components/snap/icons";
import { PrimaryAction } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TILE_CLASS, UploadForm } from "@/components/snap/UploadForm";
import { firstName, getCase, hrefFor } from "@/lib/server/cases";
import { addIncomeDocument, setIncomeAndStart } from "./actions";

/** The server action runs the whole investigation (four 400ms pauses plus work) inside the request. */
export const maxDuration = 60;
/** Reads the store per request; nothing here can be prerendered. */
export const instant = false;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

const ERRORS: Record<string, string> = {
  income: "Enter the yearly income as a number, like 37,560.",
  household: "Enter how many people live in the home, from 1 to 20.",
  document: "We couldn't read an income figure from that document. Type the amount instead.",
};

/** Mock M02: income once, household size, the consent sentence, "Start the case". */
export default async function IncomePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;
  const { c } = await getCase(id);
  if (!c) notFound();
  if (c.state !== "created") redirect(hrefFor(c));

  const first = firstName(c.patientName);
  // the demo fixture arrives prefilled so the video never types a number; a document fills it too
  const income = c.income ? (c.income.annualCents / 100).toLocaleString("en-US") : c.fixtureKey === "main" ? "37,560" : "";
  const household = String(c.income?.householdSize ?? 1);

  return (
    <>
      <div className="flex flex-col gap-5 px-6 pb-4">
        <h1>Your Income</h1>
        <p role="status" className={"text-sm" + (error ? "" : " hidden")}>
          {error ? (ERRORS[error] ?? "Something was missing. Check the fields and try again.") : ""}
        </p>
        <Field
          id="income"
          name="income"
          form="income-form"
          label={`${first}'s yearly household income, about`}
          help="Social Security plus pension. A close guess is fine."
          type="text"
          inputMode="numeric"
          defaultValue={income}
          autoComplete="off"
          required
        />
        <UploadForm action={addIncomeDocument} hidden={{ caseId: id }} className={TILE_CLASS} pendingText="Reading the document…">
          <DocumentIcon />
          <span className="flex flex-col">
            <span className="font-medium">Snap a document instead</span>
            <span className="text-sm text-muted">A tax form or benefit letter</span>
          </span>
        </UploadForm>
        <Field id="household" name="household" form="income-form" label={`People in ${first}'s home`} type="number" inputMode="numeric" min={1} max={20} step={1} defaultValue={household} required />
        <p className="text-sm text-muted">
          By continuing you let Kindred handle this bill for {first} and prepare the letters. Nothing is sent until you tap Send.
        </p>
        <form id="income-form" action={setIncomeAndStart}>
          <input type="hidden" name="caseId" value={id} />
        </form>
      </div>
      <ActionBar>
        <PrimaryAction form="income-form">Start the case</PrimaryAction>
        <TalkToPerson code={c.code} />
      </ActionBar>
    </>
  );
}
