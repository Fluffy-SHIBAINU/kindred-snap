"use client";

import type { ReactNode } from "react";
import { ActionBar } from "@/components/snap/ActionBar";
import { Clipping, Highlight } from "@/components/snap/Clipping";
import { DueAlert } from "@/components/snap/DueAlert";
import { MoneyBlock } from "@/components/snap/MoneyBlock";
import { PRIMARY_CLASS } from "@/components/snap/PrimaryAction";
import { TalkToPerson } from "@/components/snap/TalkToPerson";
import { TEXT_CLASS } from "@/components/snap/TextAction";
import { DEFAULT_GUIDELINE_YEAR, guidelineCents } from "@/lib/fpl";
import { formatUsd } from "@/lib/money";
import { ACTIONS, CHIPS, DISCOUNT, GUESS_KEYS, H1, H1_LINE, H2, LEFT_OUT, NOTICE_NAME, PROMISES, RESULT, TABLES, fill, peopleWords } from "@/lib/private/copy";
import type { AssumptionKey, PrivatePolicy, PrivateResult } from "@/lib/private/types";
import { formatDate } from "@/lib/templates/facts";
import { Disclosure } from "./Disclosure";

type Household = NonNullable<PrivateResult["households"]>[number];
type TierRow = { a: Household["size"]; b: Household["size"]; h: Household };
type Sourced = { sourceUrl: string | null; checkedOn: string | null };

// a figure never breaks across two lines
export const MONO = "whitespace-nowrap font-mono [font-variant-numeric:tabular-nums]";
const DATE = /[A-Z][a-z]{2} \d{1,2}, \d{4}/;
const FIGURE = new RegExp(`(\\$[\\d,]+\\.\\d{2}|${DATE.source})`);
const TABLE = "w-full border-collapse text-left text-sm";
const TH = "bg-paper-3 px-2 py-2 font-medium";
const TD = "border-b border-rule px-2 py-2";
const CHIP = {
  plain: "bg-white text-ink-2 ring-1 ring-inset ring-rule",
  assumed: "border border-dashed border-ink text-ink",
  quoted: "bg-paper-3 text-ink",
};
// the assumption keys that say a value was missing from the files: with none of them, nothing we needed was covered
const NOT_SHOWN: AssumptionKey[] = ["hospital", "service_date", "line_code", "line_charge", "line_patient", "statement_date", "due_date", "no_notice", "notice_lines_sum", "no_income", "income_period"];

/** Text with its amounts and dates set in the mono face (DESIGN.md §4). */
export function withMono(text: string): ReactNode[] {
  return text.split(FIGURE).map((part, i) => (i % 2 ? <span key={i} className={MONO}>{part}</span> : part));
}

/** kit.css `.chip-src`: one per block, naming where the block comes from. */
function Chip({ kind = "plain", children }: { kind?: keyof typeof CHIP; children: ReactNode }) {
  return <span className={"inline-flex min-h-7 w-max items-center rounded-pill px-2.5 text-sm font-medium " + CHIP[kind]}>{children}</span>;
}

/** "the notice" reads by the statement that was used; Medicare is named only for a Medicare notice. */
const named = (text: string, kind: PrivateResult["noticeKind"]) => (kind ? text.replace(/\bthe notice\b/g, NOTICE_NAME[kind]) : text);

const tierText = (h: Household, words: typeof DISCOUNT) =>
  h.status === "free" ? words.free : h.status === "discount" ? fill(words.discount, { percent: h.discountPercent ?? "" }) : words.none;

/** Consecutive household sizes with the same tier share a row ("1", "2 to 4"). */
function tierRows(households: Household[]): TierRow[] {
  const rows: TierRow[] = [];
  for (const h of households) {
    const last = rows[rows.length - 1];
    if (last && last.h.status === h.status && last.h.discountPercent === h.discountPercent) last.b = h.size;
    else rows.push({ a: h.size, b: h.size, h });
  }
  return rows;
}

const list = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : (words[0] ?? ""));

/**
 * A line paired on code and date, shortened as mock PM3a shows it: the caption under the clipping carries the date, and
 * the notice line needs neither its number nor its code. The lines are composed in `run.ts` (`documentsOf`) as
 * "Bill line 3, Q9967, Sep 14, 2026" and "Medicare notice line 3, Q9967, Sep 14, 2026, you may be billed".
 */
const shortened = (text: string) => text.replace(new RegExp(`, ${DATE.source}`), "").replace(/^(\D+?) line \d+, [^,]+(?=, you may be billed)/, "$1");

/** Evidence lines, each with its closing amount moved to the right. `clip` is the clipping's look: the amount highlighted. */
function Evidence({ lines, className, clip, short }: { lines: string[]; className: string; clip?: boolean; short?: boolean }) {
  return (
    <span className={"flex flex-col gap-1 font-body " + className}>
      {lines.map((e) => {
        const m = e.match(/^(.*?),?\s(\$[\d,]+\.\d{2})$/);
        const text = m ? m[1] : e;
        const amount = m && <span className={MONO}>{m[2]}</span>;
        return (
          <span key={e} className="flex items-baseline justify-between gap-3">
            <span>{withMono(short ? shortened(text) : text)}</span>
            {clip ? amount && <Highlight>{amount}</Highlight> : amount}
          </span>
        );
      })}
    </span>
  );
}

/** Where a quoted policy sentence comes from: the demo hospital, or the published policy with its link and checked-on date. */
function Source({ p, demo, field }: { p: PrivatePolicy; demo: boolean; field: Sourced }) {
  if (demo) return <span>{fill(RESULT.policySourceDemo, { hospital: p.name, city: p.city, state: p.state })}</span>;
  const text = withMono(field.checkedOn ? fill(RESULT.policySource, { hospital: p.name, date: formatDate(field.checkedOn) }) : p.name);
  return field.sourceUrl && /^https?:\/\//.test(field.sourceUrl) ? (
    <a href={field.sourceUrl} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );
}

/** A sentence of the hospital's own policy as a clipping, with the chip Quoted. */
function Quoted({ quote, p, demo, field }: { quote: string; p: PrivatePolicy; demo: boolean; field: Sourced }) {
  return (
    <Clipping
      line={<span className="font-body">&ldquo;{quote}&rdquo;</span>}
      source={
        <>
          <Source p={p} demo={demo} field={field} />
          <Chip kind="quoted">{CHIPS.quoted}</Chip>
        </>
      }
    />
  );
}

/** What we assumed, and what the letters do instead: the result's closed row and the packet's last page. */
export function Assumed({ result: r }: { result: PrivateResult }) {
  const rows = r.help === "by_household" || r.help === "same_tier" ? tierRows(r.households ?? []) : [];
  // what the other household sizes get, one sentence per row of the table other than the assumed one
  const others = rows.filter((row) => row.a !== 1).map((row) => fill(RESULT.ifPeople, { people: peopleWords(row.a, row.b), discount: tierText(row.h, DISCOUNT) }));
  const { other, unreadable } = r.leftOut;
  const left = [
    other > 1 ? fill(LEFT_OUT.other.many, { n: other }) : other ? LEFT_OUT.other.one : "",
    unreadable > 1 ? fill(LEFT_OUT.unreadable.many, { n: unreadable }) : unreadable ? LEFT_OUT.unreadable.one : "",
  ].filter(Boolean);
  const nothingCovered = !r.assumptions.some((a) => NOT_SHOWN.includes(a.key));
  return (
    <>
      <p>{PROMISES.S10}</p>
      {r.assumptions.map((a) => (
        <div key={a.key} className="flex flex-col items-start gap-1">
          {GUESS_KEYS.includes(a.key) && <Chip kind="assumed">{CHIPS.assumed}</Chip>}
          <p>{a.statement}</p>
          <p className="text-muted">{[...(a.key === "household_size" ? others : []), a.ifWrong].join(" ")}</p>
        </div>
      ))}
      {left.map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
      <p>{nothingCovered ? `${RESULT.nothingCovered} ${RESULT.neverRead}` : RESULT.neverRead}</p>
    </>
  );
}

type Props = {
  result: PrivateResult;
  reader: "fixture" | "stub" | "gemini";
  /** `Add another file` (the file input) while pages are held, else `Start over`, in the look it is handed */
  more: (className: string) => ReactNode;
  onLetters: () => void;
  /** the inline erase row */
  erase: ReactNode;
};

/**
 * Screen 3 (mocks PM3a to PM3c; docs/features/snap-incognito.md §2 and §7). Every sentence is composed here from
 * `copy.ts`, the outcome, the help case and amounts: nothing the pipeline wrote is printed. Whatever decides whether a
 * figure may show stays outside the two closed rows.
 */
export function PrivateResultView({ result: r, reader, more, onLetters, erase }: Props) {
  const { outcome, help, policy: p } = r;
  const line = r.findings.find((f) => f.kind === "line_not_patient_responsibility");
  const shown = line ?? r.findings.find((f) => f.kind === "patient_owes_exceeds_notice");
  // evidence with no finding to stand under (no notice yet, nothing to ask about) goes in the workings
  const background = shown ? [] : [...new Set(r.findings.flatMap((f) => f.evidence))];
  const amount = formatUsd(outcome === "no_notice" ? r.balanceCents : (shown?.amountCents ?? 0));
  // the result holds the service date nowhere but inside the evidence lines
  const pairedOn = outcome === "line_found" ? shown?.evidence.join(" ").match(DATE)?.[0] : undefined;
  const assumedHeading = outcome === "line_possible" || (outcome === "nothing_found" && r.assumptions.some((a) => a.key === "same_visit"));

  const tabled = help === "ceilings" || help === "by_household" || help === "same_tier";
  const households = tabled ? (r.households ?? []) : [];
  const rows = help === "ceilings" ? [] : tierRows(households);
  const tiers = p?.policy.tiers.value ?? [];
  const quotes = p ? [p.policy.freeCareMaxFpl, p.policy.tiers].filter((f) => f.quote) : [];
  const h2 =
    help === "insured_not_covered" && r.noticeKind === "msn"
      ? H2.insured_not_covered_medicare
      : help === "same_tier" && households[0]?.status !== "discount"
        ? households[0]?.status === "free" ? H2.same_tier_free : H2.same_tier_none
        : fill(H2[help], { percent: households[0]?.discountPercent ?? "" });

  // shortcut: PrivateResult carries no income figure, so it is read back from the help application's own sentence; give the result an income field when its type next changes
  const application = r.letters.find((l) => l.kind === "assistance_application")?.draft ?? "";
  const incomes = [...application.matchAll(/income letter shows (\$[\d,]+\.\d{2}) a (month|year)\./g)].map((m) => fill(RESULT.income[m[2] as "month" | "year"], { amount: m[1] }));
  const under = p && [
    fill(r.demo ? RESULT.matchedDemo : RESULT.matched, { hospital: p.name, city: p.city, state: p.state }),
    ...incomes,
    help === "ceilings" && tiers.length ? fill(RESULT.aboveCeilings, { discounts: list(tiers.map((t) => `${t.discountPercent}%`)) }) : "",
    r.coverage === "not_stated" ? RESULT.coverageNotStated : "",
  ].filter(Boolean).join(" ");

  const parts = r.estimate && r.estimate.parts.length > 1 ? r.estimate.parts : [];
  const guessed = help === "by_household" && !!r.estimate?.parts.some((part) => part.label === RESULT.partHelp);
  const checked = quotes[0]?.checkedOn;
  const worked = parts.length > 0 || background.length > 0 || (tabled && quotes.length > 0);
  const year = { year: DEFAULT_GUIDELINE_YEAR };

  return (
    <>
      <div className="flex flex-col gap-4 px-6 pb-4">
        <h1 tabIndex={-1} className="outline-none">{withMono(fill(H1[outcome], { amount }))}</h1>
        {assumedHeading && <Chip kind="assumed">{CHIPS.assumed}</Chip>}
        {outcome !== "line_found" && <p>{withMono(named(fill(H1_LINE[outcome], { amount }), r.noticeKind))}</p>}
        {shown && (
          <Clipping
            line={<Evidence lines={shown.evidence} className="text-md" clip short={!!pairedOn} />}
            source={<span>{withMono(pairedOn ? fill(RESULT.clippingCaption, { date: pairedOn }) : RESULT.reading)}</span>}
          />
        )}
        {r.estimate && (
          <MoneyBlock
            amountCents={r.estimate.cents}
            kind="estimated"
            beside
            label={<span className="font-normal">{withMono(fill(RESULT.moneyTitle, { amount: formatUsd(r.balanceCents) }))}</span>}
            note={guessed ? `${RESULT.moneyNote} ${RESULT.ifOnePerson}` : RESULT.moneyNote}
          />
        )}

        <h2 className="mt-2">{h2}</h2>
        {help === "no_hospital" && <p>{RESULT.dropHospital}</p>}
        {help === "insured_not_covered" && p && (
          <>
            {p.insuredCovered.quote && <Quoted quote={p.insuredCovered.quote} p={p} demo={r.demo} field={p.insuredCovered} />}
            <p>{line?.billLine != null ? fill(RESULT.excludedWithLetter, { n: line.billLine }) : RESULT.excluded}</p>
          </>
        )}
        {help === "no_thresholds" && p && (
          <>
            {quotes.map((f) => (
              <Quoted key={f.quote} quote={f.quote ?? ""} p={p} demo={r.demo} field={f} />
            ))}
            {p.policy.phone.value && (
              <p>
                <a href={`tel:${p.policy.phone.value.replace(/[^\d+]/g, "")}`} className={MONO}>
                  {p.policy.phone.value}
                </a>
              </p>
            )}
          </>
        )}
        {help === "ceilings" && households.some((h) => h.incomeUpToCents !== null) && (
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH + " w-24"}>{TABLES.people}</th>
                <th scope="col" className={TH}>{TABLES.ceiling}</th>
              </tr>
            </thead>
            <tbody>
              {households.map((h) => (
                <tr key={h.size}>
                  <td className={TD}>{h.size}</td>
                  <td className={TD + " " + MONO}>{h.incomeUpToCents === null ? "" : formatUsd(h.incomeUpToCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>{TABLES.people}</th>
                <th scope="col" className={TH}>{TABLES.lists}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // the guess is marked only where another household size would get something else
                const assumed = help === "by_household" && row.a === 1;
                return (
                  <tr key={row.a} className={assumed ? "bg-accent-soft font-medium" : undefined}>
                    <td className={TD}>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {row.a === row.b ? fill(TABLES.rowOne, { a: row.a }) : fill(TABLES.rowRange, { a: row.a, b: row.b })}
                        {assumed && <Chip kind="assumed">{CHIPS.assumed}</Chip>}
                      </span>
                    </td>
                    <td className={TD}>{tierText(row.h, TABLES.cell)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {under && help !== "insured_not_covered" && <p className="text-sm">{withMono(under)}</p>}
        {p && help !== "insured_not_covered" && p.otherConditions.length > 0 && (
          <>
            <h3 className="text-lg leading-[1.15]">{RESULT.otherConditions}</h3>
            {p.otherConditions.map((c) => (
              <div key={c.label} className="flex flex-col gap-1">
                <p className="font-medium">{c.label}</p>
                <Quoted quote={c.quote} p={p} demo={r.demo} field={c} />
              </div>
            ))}
          </>
        )}

        <div className="flex flex-col gap-2">
          {worked && (
            <Disclosure summary={RESULT.worked}>
              {parts.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {parts.map((part) => (
                    <li key={part.label} className="flex justify-between gap-3">
                      <span>{part.label}</span>
                      <span className={MONO}>{formatUsd(part.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {background.length > 0 && (
                <>
                  <Evidence lines={background} className="text-sm" />
                  <p className="text-muted">{RESULT.reading}</p>
                </>
              )}
              {tabled && p && quotes.length > 0 && (
                <>
                  {!r.demo && checked && <p className="font-medium">{withMono(fill(RESULT.realPolicy, { date: formatDate(checked) }))}</p>}
                  {quotes.map((f) => (
                    <p key={f.quote}>&ldquo;{f.quote}&rdquo;</p>
                  ))}
                  <p className="text-muted">
                    <Source p={p} demo={r.demo} field={quotes[0]} />
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip kind="quoted">{CHIPS.quoted}</Chip>
                    {r.demo && <Chip>{CHIPS.demo}</Chip>}
                  </div>
                </>
              )}
              {rows.length > 0 && (
                <>
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th scope="col" className={TH}>{TABLES.workedPeople}</th>
                        <th scope="col" className={TH}>{TABLES.workedShare}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {households.map((h) => (
                        <tr key={h.size}>
                          <td className={TD}>{h.size}</td>
                          <td className={TD + " " + MONO}>{h.fplPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-muted">{fill(TABLES.sharesNote, year)}</p>
                </>
              )}
              {help === "ceilings" && tiers.length > 0 && (
                <>
                  {/* one table a tier: mock PM3b draws one table with a column a tier, and two columns of figures are wider than a phone */}
                  {tiers.map((t) => (
                    <table key={t.maxFplInclusive} className={TABLE}>
                      <thead>
                        <tr>
                          <th scope="col" className={TH + " w-24"}>{TABLES.workedPeople}</th>
                          <th scope="col" className={TH}>{fill(TABLES.workedUpTo, { percent: t.discountPercent })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {households.map((h) => (
                          <tr key={h.size}>
                            <td className={TD}>{h.size}</td>
                            <td className={TD + " " + MONO}>{formatUsd(Math.round((guidelineCents(h.size) * t.maxFplInclusive) / 100))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
                  <p className="text-muted">{fill(TABLES.ceilingsNote, year)}</p>
                </>
              )}
            </Disclosure>
          )}
          <Disclosure summary={fill(RESULT.assumed, { n: r.assumptions.filter((a) => GUESS_KEYS.includes(a.key)).length })}>
            <Assumed result={r} />
          </Disclosure>
        </div>

        {r.letters.length === 0 && <p>{RESULT.noLetter}</p>}
        {r.dueDate && (
          <DueAlert>
            {withMono(fill(RESULT.due, { date: formatDate(r.dueDate) }))}
            {r.letters.some((l) => l.kind === "correction_request") && ` ${RESULT.dueHold}`}
          </DueAlert>
        )}
        {reader !== "gemini" && <TalkToPerson />}
        <p className="text-sm text-muted">{PROMISES.S11}</p>
      </div>
      <ActionBar>
        {r.letters.length > 0 ? (
          <>
            <button type="button" className={PRIMARY_CLASS} onClick={onLetters}>
              {ACTIONS.letters}
            </button>
            {more(TEXT_CLASS)}
          </>
        ) : (
          more(PRIMARY_CLASS)
        )}
        {erase}
      </ActionBar>
    </>
  );
}
