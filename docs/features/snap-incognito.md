# Snap Incognito (Private Mode) — Feature Plan

Final plan after red-team review, 2026-11-15. Nothing here is built. The runbook form is `docs/BUILD.md` Phase 10 (tasks I1 to I4). Items marked **unverified** were not checked by anyone and are tasks, not facts. "Incognito" is the feature's working name; the word on screen is "Private mode" (Open Decision 1).

## 1. What Users Asked For and the Promise

Feedback: some users will not share a whole bill. They want to upload a file they already redacted, or have us help redact it, in one flow, and still get a best-shot result that carries no sensitive details. The founder asked for one more button on Snap.

The plan answers with one route, `/private`, and two ways through it that meet at the same screen. **Numbers path:** the user types four or five figures from the bill and the notice; every calculation runs in the browser; no picture exists and nothing typed is sent. **Photo path:** the user crops a photo down to the list of charges and covers what is personal, on the phone; only the flattened, re-encoded result is sent, and it is read into numbers that come back to the phone for the user to check. An already-redacted upload is the photo path with nothing left to cover: two taps.

**The promise.** "Never" is used only where the code guarantees it and a test proves it: the original file is never uploaded, and on the numbers path nothing typed leaves the device. Everything else is worded as a choice the user makes and its consequence. The sentences below are the complete set of promise sentences shown to users. They live in one file, `src/lib/private/copy.ts`, and a test asserts each one appears verbatim in this document.

| Id | Where | Sentence |
|---|---|---|
| C1 | `/snap` helper, numbers path only | Type the numbers from the bill. They stay on this phone, and no picture is sent. |
| C2 | `/snap` helper, photo path on | Type the numbers and send no picture, or crop and cover a photo first. We receive whatever a picture still shows. |
| C3 | P01, first line | This is not anonymous. A hospital, a date and an amount can still point to one visit. |
| C4 | P01 | You choose what Kindred sees. We don't ask for the name, address, date of birth, account number or Medicare number. |
| C5 | P01, numbers tile | The numbers stay on this phone. Kindred learns only which state the hospital is in. |
| C6 | P01, photo tile | You crop and cover it on this phone first. Kindred and Google's reading service receive whatever is left showing. |
| C7 | P01, "What We Don't Ask For" | Name, address, date of birth. Account, claim and Medicare numbers. The original photo: it is never sent. |
| C8 | P01, photo tile selected | If one of these is left showing in a picture you send, we and the reading service receive it. Check the picture before you send it. |
| C9 | P01 | Our web host records that this phone connected: internet address, time and page. |
| C10 | P01 | We count that a private check happened, by month. Nothing else is stored. |
| C11 | P01, live reader only | A covered picture is read by Google's Gemini service. Google's terms for the paid service say it does not use the picture to train its models and may keep it for up to 55 days to check for abuse. We cannot check that ourselves or shorten it. |
| C12 | P02 | Kindred has not received this picture. |
| C13 | P02 status, before detection exists | We have not checked this picture. Cover anything that names the patient yourself before you send it. |
| C14 | P02 status, detection ran | Our check found nothing else to cover. It can miss things. Look over the picture yourself before you send it. |
| C15 | P02b | We never send the original. This page lets go of it when you leave. If it is in your photos, it stays there until you delete it. |
| C16 | P02b, above the button | Tapping Send this picture sends it to Kindred and on to Google's reading service. Kindred keeps no copy. Google may keep its copy for up to 55 days. |
| C17 | P02c, weak match | If you send it, Kindred and Google's reading service will receive this part of the picture. |
| C18 | P02d | Too much may be covered, or the photo is blurry. Kindred kept nothing. The covered picture did go to Google's reading service, which may keep it for up to 55 days. |
| C19 | P03, numbers path | We can't check typed numbers against the bill. Copy them carefully. The letters use them as written. |
| C20 | P05, above the button | Tapping Check this bill works everything out on this phone. Nothing you typed is sent. |
| C21 | P06 and P07 | Your numbers and letters stay in this browser tab until you close it or tap Erase from this phone. Anyone who uses this phone before then can see them. |
| C22 | Erase, confirmation | Erased from this phone. Kindred kept no copy. |
| C23 | Erase, photo path adds | The covered picture you sent went to Google's reading service, which may keep it for up to 55 days. We cannot erase that copy. |
| C24 | P07 | What you type here stays on this page and is gone when you close it. |
| C25 | `/snap` unreadable screen | Kindred did not keep the photo. |
| C26 | P04 and P06, unless the user ticked the keep box | This check is gone when you close this page. |
| C27 | Demo reader variant of C6 and C16 | Demo: the covered picture goes to Kindred and is dropped. Nothing is read from it; the demo numbers are used. |
| C28 | P03, when the phone read the page itself (I4) | We read the numbers on this phone. No picture was sent. |

The 55-day and no-training statements in C11, C16, C18 and C23 come from the research notes and were not re-read against Google's current terms. They are rendered from `src/lib/private/readerTerms.ts` (`retentionDays`, `url`, `readOn`), which a person fills in after reading the terms; the live reader cannot be switched on while `readOn` is empty, and P01 shows the link and "Terms read on <date>".

**What the mode does not claim.** It is not anonymous and not "de-identified" (hospital, service date, codes and amounts can identify a visit). It makes no HIPAA statement. It does not say the covers catch everything; the check is described as "we checked again", never as a guarantee. It does not send anything to a hospital: the user completes and sends the letters, and nothing is marked sent.

## 2. The Flow, Screen by Screen

One route, `/private`, client-side steps, nothing in the URL. Titles are Title Case; buttons, labels and body are sentence case; one primary action per screen. Entry and exit are full page loads (plain `<a href>`, `location.replace` after erase) so the response headers in §8 always apply and no memory is shared with regular-mode pages.

**P00, on `/snap`.** A full-width secondary button `Private mode`, placed directly above the camera guide so it is visible without scrolling at 390 by 844 (the guide shrinks if needed; a viewport test asserts it). Helper under it: C1 until the photo path is on, then C2. The same button and helper appear on the "We Couldn't Read That Photo" screen. On that screen "The photo stays on this phone." (false today: the bytes are posted and dropped) becomes C25. While regular mode is demo-only (`EXTRACTOR` is not `gemini`), the demo walk's income field becomes read-only at the demo value with the note "Demo income. It can't be changed in the demo.", and the action ignores a posted figure, so no typed income can reach a URL.

**P01, "What Private Mode Hides and What It Doesn't".** In order: C3; C4; two radio tiles with the numbers tile preselected; then the detail lines. Tile one: "Type the numbers. Send no picture." with C5 and "Use this way if you can't check a picture by sight." Tile two (absent while the reader is off): "Cover a photo, then send it" with C6 (or C27 with the demo reader) and, once detection exists, "Downloads about 6 MB once." Then "What We Don't Ask For": C7, followed by C8 when tile two is selected. Then C9, C10 and, for the live reader, C11 with its link and date. In demo mode: "Demo only: use the demo numbers; do not enter a real bill." Primary: `Continue`. Text: `Back to regular mode`.

**P02, "Keep the Charges, Hide the Rest"** (photo path). Body: C12; "Already covered? Check the preview and send."; "1. Move the box so it holds only the list of charges and the totals. Everything outside the box is cut away."; "2. Cover anything personal that is still inside the box."; "If you covered parts with a marker or a highlighter, cover them again here. Marker ink can be seen through." The page sits in a scroll box with 48 px `Zoom in` and `Zoom out` buttons (100% to 300%). The keep box starts as the whole page. Tapping a line drops a full-width cover band there; `Add a cover` places one at the centre. Under the picture is the list that is also the control surface: one row for the keep box and one per cover, each with real buttons (`Up`, `Down`, `Left`, `Right`, `Wider`, `Narrower`, `Taller`, `Shorter`, `Remove`; the cover's name is in each accessible name) and one `role="status"` line per change ("Cover 3 moved up"). The same buttons serve touch, keyboard, switch and screen readers; there are no key chords. Four reminder rows without ticks: "Name and address", "Any ID number: account, Medicare, claim", "Birth date, phone, email", "Barcodes and the payment slip". Status: C13 before detection exists; with detection, found rows read "Covered: Medicare number, top right", unfound rows read "We didn't spot one. Check the picture.", and C14 shows when nothing was found. Primary: `Cover and preview`. Text: `Type the numbers instead`. After a reload with no photo in memory: "The photo was cleared when the page reloaded. Take it again, or type the numbers."

**P02b, "This Is the Picture We Send".** The cropped, flattened, re-encoded image in the same zoomable box, then one enlarged crop per cover ("Cover 1 of 4"). Body: C15. Above the button: C16 (or C27). While the second check runs the primary is disabled and reads "Checking the covered picture". Primary: `Send this picture`. Text: `Go back and change the covers`.

**P02c, "Something Personal May Still Show"** (from I3). "We see what looks like a Medicare number near the top right. Nothing has been sent." For a Medicare-number pattern, a Social Security pattern, or a barcode or QR code there is no way to send anyway: primary `Cover it`, text `Type the numbers instead`. For weak matches (a phone number, a long digit run, a cue word) the body adds C17 and the text action is `Send it anyway`.

**P02d, "We Couldn't Read the Covered Picture".** C18. Primary: `Type the numbers instead`. Text: `Go back and move the covers` (the covers and the original are still in memory), `Try another photo`.

**P03, "The Bill"** (photo path h1: "Check What We Read"). First, tiles "Who is the bill for?": "Me" / "Someone I help", no preselection, one must be picked. Then "Amount the bill says you owe" (helper: "Look for 'Amount due' or 'You owe'."). Then the hospital: pick a state, then the whole state list (never more than 73 rows) grouped by city, with an optional filter that matches any word in name or city; the last row is `My hospital isn't listed` with "We can still check the bill against the notice. We can't check this hospital's help program." and an optional "Hospital name, for the letter" field. "Statement date" and "Due date" are optional native date inputs (helper: "Leave it blank and you can write it on the letter."). A checkbox, off by default: "Keep my numbers on this phone until tomorrow" (helper: "Don't tick this on a shared computer."). Numbers path: C19. Photo path: each prefilled value carries "Read from your page" and changes to "You typed this" when edited; a value the reader could not find is left empty with "This was under a cover. Type it from the bill."; a disclosure `Show the lines we read` lists them read-only. Primary: `Continue`.

**P04, "The Medicare Notice".** Body: "Find the Medicare Summary Notice that lists this hospital and this date of service. It comes by mail or at Medicare.gov. In private mode we don't ask Medicare for it: that would need the patient's Medicare sign-in." and "A Medicare Advantage plan sends an Explanation of Benefits instead. If that is what you have, choose I don't have the notice." Two questions: "Is this notice for the same hospital and the same date as the bill?" (Yes / Not sure) and "Does the patient have Original Medicare, the red, white and blue card, and not a Medicare Advantage plan?" (Yes / No / Not sure). Anything but two Yes answers means no comparison and no correction letter, with "We can only compare a bill with Original Medicare's notice for the same visit." Field "Maximum you may be billed for this visit", helper: "Inside the notice, find the claim for this hospital and this date of service. Use the amount under 'Maximum You May Be Billed' on that claim's total line. Do not use the total on the first page: it adds up every claim in the notice." with a small picture of a notice table, that cell highlighted. This wording is **unverified** against a current CMS sample notice; checking it is a blocking human task before real bills are allowed. When the amount owed minus the maximum is above zero (a subtraction in the browser) one guided question appears: "The bill asks $240.00 more than the notice figure. Is there one charge on the bill for exactly $240.00?" Yes shows "What the bill calls it, and its code if printed", "Date of service" and "What the notice shows under You May Be Billed for it". From I3, a secondary `Cover and send a photo of the notice` runs P02 with the keep box mandatory: "The notice lists every visit in three months. Keep only the one on this bill." and "Photograph only the page that lists this hospital." C26 shows here and on P06 unless the P03 checkbox is ticked. Primary: `Continue`. Text: `I don't have the notice`.

**P05, "Household Income".** Skipped when no hospital was picked, the hospital is in Alaska or Hawaii, or its policy has no thresholds or does not cover insured patients, because the income would not be used. Body: "The hospital's help program goes by income. Give it and we work out which tier the policy lists. Skip it and we show every tier." Label from the P03 tiles: "The patient's yearly household income, before taxes" or "Your yearly household income, before taxes" (helper: "Social Security plus pension. A close guess is fine."). "People in the home" is required when income is given and has no default (helper: "Count everyone who lives in the home. We need this to work out the tier."; error: "Enter how many people live in the home, from 1 to 20."). C20 above the button. Primary: `Check this bill`. Text: `Skip income`.

**P06, the result.** One h1, chosen in this order:

| Case | h1 | Then |
|---|---|---|
| Notice missing | We Need the Medicare Notice to Check the Charges | "Until you have the notice, we won't say whether $466.00 is right. Get it before you pay." |
| Notice not comparable | We Can't Compare This Bill With the Notice | "We can only compare a bill with Original Medicare's notice for the same visit." |
| Gap, no line to pin it on | The Two Amounts Differ by $240.00 | "The bill asks $240.00 more than the notice figure you gave. That can be correct, for example when the bill covers more than one visit. We can't tell which line without the lines, so we wrote no correction letter." and "Ask the hospital's billing office to go through the bill with you, or call 1-800-MEDICARE (1-800-633-4227)." |
| Policy does not cover insured patients | This Hospital's Policy May Not Cover Patients Who Have Medicare | The policy's own sentence, quoted, with its link and date. No percent anywhere. |
| Tier found | The Hospital's Policy Lists 75% Off at This Income | h2 "And $240.00 of It May Not Be Owed" when one line explains the gap |
| One line explains the gap, no tier | We Found $240.00 You May Not Owe | |
| Nothing | We Found Nothing to Ask For | |

When a tier exists in the first three cases it is an h2 with the same wording. When the policy does not say whether insured patients are covered: "The policy we read does not say whether it covers patients who have Medicare. The hospital decides." When the policy has an asset test or a residency rule, its quote appears under "Other Conditions in the Policy". On a no-notice run the money note reads "Estimated on the full $466.00. We have not checked the charges, so this may change." C21 closes the content, followed by `Erase from this phone`. The sticky bar holds only the primary, `Open the letters`, and the help disclosure described below.

**P07, "Your Letters".** Three fields at the top ("Patient name", "Account number", "Your name") fill the letters on the page only; they are never stored and never sent (C24). Alert: "Fill in before you send: patient name, account number, signature." Then the cover sheet and the letters. "On a shared computer, tap Erase from this phone and close this tab." Primary: `Print or save as PDF`. Text: `Share`, `Copy the text`, `Erase from this phone`.

**Erase** (inline disclosure, not a modal). "Erase this check from this phone? You can't get it back." Button `Erase it`. It clears both browser stores, overwrites the clipboard with an empty string if `Copy the text` was used, and reloads `/private` showing C22, plus C23 if a picture was sent.

**Help in private mode.** The placeholder Kindred phone line is not shown. The disclosure "Who can help" lists the hospital's financial-assistance phone from the atlas as a `tel:` link with its source, and "For the notice, call 1-800-MEDICARE (1-800-633-4227)." A Kindred line appears only when `PRIVATE_SUPPORT_PHONE` is set, with "Private mode has no case code. Tell them the hospital and the amounts yourself." There is no "Switch to regular mode" on P06 or P07 while regular mode accepts the demo bill only.

## 3. Data Classes

| Datum | Class | Detail |
|---|---|---|
| Original photo or PDF, file name, EXIF and GPS | Stays on the device | Held in a ref, never in a form, never in storage; released when the read returns, at `Type the numbers instead`, and on `pagehide` |
| Everything outside the keep box (letterhead, address block, payment slip, barcodes, background, other mail) | Stays on the device | Cropped away before encoding, not painted over |
| Name, address, date of birth, phone, email, account, claim, guarantor, record and Medicare numbers | Never asked for | Covered inside the keep box, or never typed; blanks in the letters; the P07 fields exist in page memory only |
| Covered, cropped picture | Leaves on the photo path | Kindred's server (memory, one request), then the reading service; not stored by Kindred. Whatever the user left showing goes with it |
| Lines read from the picture: number 1 to 99, service code, date of service, charge | Returns to the device | No description, service name or note is requested from the reader (free text is the carrier a pattern cannot close) |
| Amount owed, notice maximum, the one typed charge, statement and due dates | Stays on the device | Typed, or read then confirmed |
| Hospital | Stays on the device | The server learns the state: it returns the whole state's hospitals and their public policies in one response |
| Yearly income, household size, who signs | Stays on the device | Never defaulted; household size is required when income is given |
| Private input (JSON) | Stays on the device | sessionStorage, purged after 30 idle minutes; localStorage for at most 24 hours only when the user ticks the box. The result is recomputed, never stored |
| Case id, case code, owner, consent record, audit events, staff queue row | Never created | No `Case` and no `Store` object in this mode |
| IP address, user agent, time, path `/private` | Leaves (host request log) | Unavoidable; disclosed by C9. Whether the host records anything else is **unverified** (§8) |
| Count of private checks | Stored | Month and event name only (§5) |

## 4. On-Device Redaction Pipeline (I2 and I3)

**Intake.** The camera and file inputs are rendered by client code after mount, outside any `<form>`, so a page without JavaScript has no file input and nothing can post the raw file (today's `UploadForm` auto-submits on pick and is not reused). Accepted: JPEG, PNG, PDF. A HEIC the browser cannot decode gets "This phone saved the photo in a format we can't open here. Take a screenshot of it, or type the numbers."; the screenshot's phone chrome is outside the keep box and is cropped away. No HEIC library.

**One coordinate space.** The working canvas is the only coordinate space: `createImageBitmap(file, { imageOrientation: "from-image", resizeWidth or resizeHeight })` draws the page with its long edge at 2000 px (a 48 MP photo is never held at full size; Safari support for the resize options is **unverified** and falls back to a scaled `drawImage`). OCR, barcode detection, box storage and burning all use working-canvas pixels. Pointer positions are converted through `getBoundingClientRect` at event time, so CSS zoom and scroll cannot shift a box. A PDF is rasterised with pdf.js, pages 1 to 3, each page to the same canvas size; the PDF file itself is never uploaded (drawn rectangles, incremental saves, metadata and text layers all leak).

**Keep, then cover.** The keep box is the main gesture: one rectangle around the list of charges and totals. Everything outside it is removed by cropping. Cover boxes handle what is personal inside it. This inverts the draft's "paint over a list of things" design, which missed whatever nobody listed (handwriting, a sticky note, a pill bottle beside the page, show-through from the next page). It also makes an already-redacted upload safe by default and is easy to do with buttons.

**Burning and encoding.** On `Cover and preview`: a new canvas the size of the keep box receives the cropped pixels; each cover is padded by a fixed 8 px (the padded outline is what P02 draws, so the preview equals the burn) and filled with opaque ink; then `toBlob("image/jpeg", 0.85)`. Pixels are replaced before the encoder sees them, and canvas output carries no EXIF (a test asserts no APP1 segment). If the blob is over 1.5 MB, quality steps down to 0.6 and then the already-burned canvas is scaled to 1600 px; the source is never redrawn. The upload part is always named `page.jpg`.

**Detection (I3).** tesseract.js runs on the working canvas and on a contrast-stretched copy (so see-through marker ink and highlighter are read), and the pure function `suggestBoxes` turns words into suggestions. `suggestKeepBox` proposes the keep box from the rows that look like charges.

| Class | Pattern or cue | Strength |
|---|---|---|
| Medicare number | The 11-character MBI shape after stripping dashes and spaces, over one to three adjacent words; cue "Medicare number", "MBI" | Strong |
| Social Security number | `\d{3}-\d{2}-\d{4}` | Strong |
| Barcode, QR code | `BarcodeDetector` where the browser has it (no wasm fallback: the keep box and the payment-slip reminder cover the rest) | Strong |
| Account, guarantor, statement, claim, record, member numbers | Cue words; or a digit run of 6 or more that is not money, a date or a service code | Weak |
| Name and address block | Cue "patient", "guarantor", "bill to"; or a state-and-ZIP shape | Weak |
| Date of birth | Cue `DOB|date of birth|birth` with a date on the same line. No other date is ever suggested | Weak |
| Phone, email | Their usual shapes | Weak |
| Notice header | On a notice page, the name and number block only, not a full-width band | Weak |

**The gate before sending.** The gate is a set difference, not a second opinion: every first-pass detection must lie fully inside a burned cover or outside the keep box, otherwise P02c opens. A suggested cover the user deleted therefore still blocks. As an extra, the encoded blob is decoded and read again on a contrast-stretched copy; a new hit also opens P02c. Strong classes cannot be overridden. Nothing uploads until the gate passes or the user overrides a weak match.

**Loading and failure.** The OCR files (about 5.6 MB, served from `/ocr/` on our own origin with `workerPath`, `corePath` and `langPath` set) start downloading when the photo tile is chosen on P01. Download and recognition are timed separately and shown as rows in the step feed with `role="status"`; the user can cover by hand meanwhile, and late suggestions are added to the list without moving a box under a finger. Time limits are set from a measurement on two real phones (a human task), not guessed. If the files fail to load: "We couldn't check this picture on this phone. Cover it yourself, or type the numbers." with C13. There is never an upload as a fallback.

**What is on in each phase.** I2 ships the redactor with the demo reader only (the picture is posted and dropped; demo numbers come back), so no real picture reaches a reading service before the gate exists. The live reader is switched on in I3, after detection, the gate and the phone measurement.

## 5. Server Side

Most of the feature has no server side. `compare.ts`, `eligibility.ts`, `fpl.ts`, `savings.ts`, `money.ts` and the templates import no file system, store or secret, so the investigation is bundled into the client and runs in the browser. Only the atlas needs the server.

**Actions** in `src/app/(caregiver)/private/actions.ts`. Each has one outer try/catch that returns a fixed status with no message text, because Next logs uncaught action errors and `toCents` puts the offending input in its message.
- `hospitalsInState(state: string): Promise<PrivatePolicy[]>` returns every atlas hospital in the state with its public policy. In demo mode it returns the synthetic demo partner only.
- `countPrivate(event: "run_numbers" | "run_photo" | "read_ok" | "read_failed"): Promise<void>` increments `meta` key `private_count:<YYYY-MM>:<event>` through `getStore().meta` directly. It never calls `getServerStore()` (which seeds and investigates the demo case on a cold instance) and swallows every failure without logging. The parameter type is the whole payload. Read-then-write can lose a count under concurrency; acceptable for a usage signal.
- `readPrivatePage(form: FormData): Promise<PrivateRead>` (I2) takes `image` (JPEG, at most 1.5 MB) and `kind` (`"bill" | "msn"`), calls the configured reader, bounds the answer and returns it. The image is not kept.

**Types** (`src/lib/private/types.ts`; `src/lib/types.ts` is untouched):
```ts
type Origin = "typed" | "read" | "demo";
type PrivateBillLine = { n: number; code: string; serviceDate: string; chargeCents: number };
type PrivateNoticeLine = { n: number; code: string; serviceDate: string; youMayBeBilledCents: number };
type PrivateInput = {
  signer: "patient" | "helper";
  bill: { patientOwesCents: number; statementDate?: string; dueDate?: string; lines: PrivateBillLine[]; origin: Origin };
  notice: { maxYouMayBeBilledCents: number; lines: PrivateNoticeLine[]; sameVisit: "yes" | "not_sure";
            originalMedicare: "yes" | "no" | "not_sure"; origin: Origin } | null;
  typedCharge: { label: string; serviceDate?: string; noticeMayBeBilledCents: number } | null;   // its charge is the gap
  hospitalCcn: string | null; hospitalTypedName?: string;
  income: { annualCents: number } | null; householdSize: number | null;
};
type Coverage = "covered" | "not_covered" | "not_stated" | "no_policy";
type PrivatePolicy = { ccn: string | null; name: string; city: string; state: string; policy: Policy; insuredCovered: PolicyField<boolean | null>;
  otherConditions: Array<{ label: "Assets" | "Where the patient lives"; quote: string; sourceUrl: string | null; checkedOn: string | null }> };
type PrivateRead =
  | { status: "ok" | "insufficient"; kind: "bill" | "msn"; lines: PrivateBillLine[] | PrivateNoticeLine[]; patientOwesCents?: number;
      maxYouMayBeBilledCents?: number; statementDate?: string; dueDate?: string; missing: Array<"patient_owes" | "notice_max" | "lines"> }
  | { status: "unreadable" };
type PrivateResult = {
  outcome: "ready" | "amounts_differ" | "needs_notice" | "nothing_to_ask"; noticeReason?: "missing" | "not_comparable";
  findings: Finding[]; eligibility: Eligibility; coverage: Coverage;
  estimate: { cents: number; parts: Array<{ label: string; cents: number }>; basis: "corrected_balance" | "full_balance_unchecked" } | null;
  tierTable: Array<{ upToFplPercent: number; incomeUpToCents: number; discountPercent: number }> | null;
  letters: Array<{ kind: ActionKind; title: string; draft: string }>; blanks: string[]; policy: PrivatePolicy | null; assumptions: Assumption[];
};
```

**The wrapper** (`src/lib/private/investigate.ts`), pure and synchronous, runs in the browser: `investigatePrivately(input: PrivateInput, deps: { policy: PrivatePolicy | null; today: string }): PrivateResult`. In order:
1. The notice counts only when `sameVisit` and `originalMedicare` are both `"yes"`; otherwise it is treated as absent with `noticeReason: "not_comparable"`.
2. `findDiscrepancies` with the new `codeDateOnly: true` option, so a line pairs only on equal code and date and never falls through to the description match. A typed charge becomes one bill line and one notice line with the same code and date by construction.
3. Coverage from the policy: `insuredCovered.value === false` gives `not_covered`, absent gives `not_stated`. Eligibility is `unknown` when income or household size is missing, there is no policy, the state is AK or HI, or coverage is `not_covered`. Otherwise `fplPercent` and `tierFor`.
4. `estimateOpportunity`; on a no-notice run the basis is `full_balance_unchecked`; with `not_covered` there is no tier part at all.
5. Letters from `src/lib/private/letters.ts`, each checked with the existing `validateDraft`; a failing draft is dropped and named.
It never touches `runInvestigation`, any store, `SyntheticBlueButton`, `defaultPolicyFor`, `approveAndSend` or `audit`.

**Letter choice.** One line explains the gap: correction letter plus assistance on the corrected balance. Gap with no line: no correction letter; the itemized-bill request; assistance on the full balance; outcome `amounts_differ`. No comparable notice: the itemized-bill request plus assistance, which adds "I am still waiting for Medicare's notice for this visit and may ask you to review the charges when it arrives." No discrepancy: assistance only. Eligibility `none` drops the assistance letter.

**Two small fixes in shared code.** `matchLines` treats an empty description as matching every line (`"x".includes("")` is true); it gets an empty-string guard, which also protects regular mode, and the `codeDateOnly` option. `formatDate` returns its input unchanged when it is not `YYYY-MM-DD`, so a blank date prints as its placeholder instead of "undefined NaN,".

**The reader** (`src/lib/adapters/extract/privateRead.ts`). `PrivateReader { read(input: { bytes: Uint8Array; kind: "bill" | "msn" }): Promise<unknown> }`. The demo reader returns the main fixture's numbers for any bytes. The live reader (I3) uses `@google/genai` on Vertex AI (`vertexai: true`, project, location), which has no free tier and so fails closed if billing stops. Its `responseJsonSchema` has no free-text property: bill `{ lines: [{ n, code, serviceDate, charge }], totals: { patientOwes, statementDate?, dueDate? } }`, notice `{ lines: [{ n, code, serviceDate, youMayBeBilled }], maxYouMayBeBilled }`. The image goes only as inline data (rule 5). Any SDK error becomes `{ status: "unreadable" }`.

**Bounds** (`src/lib/private/bound.ts`): `boundRead(raw: unknown, kind: "bill" | "msn", today: string): PrivateRead` rebuilds the object key by key from an allow-list. `n` must be an integer 1 to 99; `code` must match `^(\d{4,5}|[A-Z]\d{4}|\d{4}[A-Z])(-[A-Z0-9]{2})?$`; amounts are integers from 0 to $1,000,000; service and statement dates must fall in the three years before today and a due date no more than one year after it (which rejects a date of birth). A line that fails is dropped. This replaces the draft's pattern scrubber: with no free-text field there is nothing left to scrub.

## 6. Assumptions Model

The founder asked for a best shot on stated assumptions. The red team showed that three of the draft's assumptions decided the outcome and were then printed as fact in a letter the user signs: a household of one (at $70,000 that is 438.6% of the guideline for one person and 212% for four, so a family of four was told there was nothing to ask for), "same visit", and "Original Medicare". The plan keeps the best-shot idea and changes how a gap in knowledge is handled, by kind:

| What is missing | Handling | Why |
|---|---|---|
| Household size | Asked; required when income is given; no default | It decides the tier |
| Same visit, Original Medicare | Asked on P04; anything but Yes gives no comparison | They decide whether a correction letter exists |
| Who signs | Asked on P03; no preselection | It changes the signature block |
| Income | Optional; withheld shows the published tiers | Never assumed |
| Hospital | Optional; not picked means no assistance check | Never defaulted, never read off the page |
| Name, account number, dates | Blanks the user fills on P07 or by pen | Only the user knows them |
| Guideline region | **Assumed:** the 2026 guideline for the 48 states and DC | The only table in `fpl.ts`; hospitals in AK and HI get no percent |

```ts
type Assumption = { key: "guideline_48_states"; statement: string; why: string; ifWrong: string };
```
`assumptions` holds only what applied to this run and renders under "What We Assumed" with the chip **Assumed**. The rule for the packet, with a test: no value that carries the Assumed chip, and no value derived from one, appears in any letter. The percent of the poverty guideline is therefore shown on the result only; the letters state income and household size and leave the percent to the hospital. An unknown prints "to be provided".

**Label set**, one chip per value: **Quoted** (the hospital's published policy words, with link and checked-on date; in live mode the policy block is headed "Real hospital policy, checked <date>", never the demo badge), **Read from your page**, **You typed this**, **Demo numbers**, **We worked this out** (gap, percent of guideline, tier, estimate parts), **Assumed**. Money keeps exactly one money label, **Estimated**; confirmed and actual cannot exist here.

**The tier table** (income withheld, household size given): one row per published tier, "Income up to $X for a household of N: the policy lists Y% off." No dollar estimate per row.

**Evidence** (rule 3). Each finding's `SourceRef` names `typed-bill`, `read-bill`, `typed-notice` or `read-notice`, the line number where one was read, and a quote composed from the allow-listed values ("Line 3, Q9967, $240.00"). This is weaker than regular mode's verbatim clipping, and the caption says which it is. I4 adds a crop of the covered picture, cut on the device.

## 7. Outputs

**Result blocks, in order:** h1 and its line (§2) · the evidence pair as clippings with chips · the money block with the Estimated badge and its basis note · the policy block with its quote, the coverage sentence and "Other Conditions in the Policy" · "What We Assumed" · the tier table when income was withheld · the due-date alert, or "No due date given. Write it on the letter." · "Who can help" · C21 and `Erase from this phone`.

**The packet** is built on the device by `src/lib/private/packet.ts`; no request is made.
1. Cover sheet "Before You Send": what is still blank; what to attach (a copy of the bill, a copy of the Medicare notice, proof of income if applying); where it goes (Patient Financial Services at the address printed on the bill; the atlas phone as a `tel:` link and the form link, each with its source); and "If you send this for someone else, the hospital may ask for the patient's written permission before it talks to you about the account. Have the patient sign too, or attach their permission."
2. The correction letter or the itemized-bill request, when there is one.
3. The assistance application, when there is one.
4. "What We Assumed", marked "Keep this page. Do not send it."

**Private letter wording** (`src/lib/private/letters.ts`; the regular templates are not edited):
- Reference line: "Re: account number [account number], statement dated [statement date], patient [Patient name]".
- Signature for a helper: "[Your name], helping [Patient name] with this bill", then a ruled line "Patient's signature, or attach the patient's written permission". "Authorized representative" is not printed: the app cannot know that status.
- Correction, line read from the page: "Bill line 3: Q9967 $240.00" and "Medicare's notice, same code and date: nothing the patient may be billed." (in words, because `validateDraft` rejects a "$0.00" that is not a case figure). Line typed by the user: no line number, the user's own words in quotes.
- Itemized-bill request: "We have not been able to compare each line of the statement with Medicare's notice. Please send an itemized bill for this account and the claim adjustment reason codes Medicare returned for each line." The regular template's "It appears the statement is a summary only" is not used.
- Assistance: with coverage `covered`, the regular tier sentence; with `not_stated`, "Your published financial assistance policy appears to list a 75% discount at this income. Please tell us whether it applies to this account."; otherwise "Please tell us which tier of your published financial assistance policy, if any, applies to this household."

**Placeholders:** `[Patient name]`, `[Your name]`, `[account number]`, `[Hospital name]`, `[statement date]`, `[due date]`, printed as a ruled blank with the label under it. None is figure-shaped, so `validateDraft` passes them; a unit test pins the list.

**Getting it off the phone.** `Print or save as PDF` calls `window.print()`; the print stylesheet sets the shell height to auto and the main region's overflow to visible (the caregiver shell is `h-dvh` with an inner scroller and would otherwise print one screenful), hides the header and action bar, and breaks one letter per page. `Share` uses `navigator.share` with the letter text where the browser has it. `Copy the text` uses the clipboard. No PDF library. Nothing is ever marked sent: there is no approval gate, no simulated send and no done screen in this mode.

## 8. Third Parties and Configuration

| Party | Receives | Depends on |
|---|---|---|
| Vercel (host) | Every request in memory; its log holds path, status, IP and user agent | No values in URLs; no logging in our code; no analytics or tracing. Whether Next tracing records request bodies is **unverified** and is checked before the live reader is on |
| Supabase | The monthly counters | The existing `meta` table |
| Google (photo path, live reader only) | The covered picture and a fixed prompt | Vertex AI; terms read and recorded by a person |
| Anyone else | Nothing | The Content-Security-Policy below; self-hosted fonts, OCR and PDF worker |

**Headers** (`next.config.ts`, `headers()`). One policy on every route, so it holds however a page was reached: `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'` (development adds `'unsafe-eval'`). No browser code calls Supabase today (checked: no `createBrowserClient` under `src/`), so `connect-src 'self'` breaks nothing. `/private` also gets `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

**Environment.**
- `PRIVATE_MODE=demo|on`, default `demo`. Demo: P03 offers "Use the demo numbers", the picker holds the demo partner only, the demo badge shows. On: real numbers allowed, the badge reads "Private mode", the synthetic partner is not offered. `on` throws at startup without `PRIVATE_SUPPORT_PHONE`.
- `PRIVATE_READER=off|fixture|gemini`, default `off`. `fixture` is allowed only with `PRIVATE_MODE=demo`. `gemini` throws at startup unless `PRIVATE_READER_PROJECT` and `PRIVATE_READER_LOCATION` are set and `readerTerms.readOn` is filled in. The reader never uses `GOOGLE_API_KEY`.

**Disabled in this mode:** the Medicare connector, the Riverbend fallbacks outside demo, every store collection, audit, case code and resume, the staff queue, approval and send, the simulated reply, walk hints, the poller.

## 9. Threat Model

**Assets:** identity; account access (account and Medicare numbers, a payment QR code); health detail (codes and dates); financial detail (amounts, income). **Adversaries:** Kindred staff or a database breach; host and provider operators and their logs; a network observer; another person holding the phone; an injected script; whoever later receives the packet.

| Leak path | Mitigation |
|---|---|
| Typed numbers reach Kindred | The investigation runs in the browser; the e2e asserts that no request body after P01 contains an amount, a date or the income |
| Raw file uploaded on pick | Inputs created after mount, outside any form; a JS-disabled e2e asserts `/private` has no `input[type=file]`; the only upload is the flattened blob from P02b |
| Something personal outside the charges | The keep box crops it away, whatever it is |
| Something personal inside the keep box | Covers; from I3 the set-difference gate and the re-read; strong classes cannot be overridden; the live reader is off until the gate exists |
| A cover in the wrong place | One coordinate space; a fixture with EXIF orientation 6 asserts that the pixels where the name and the Medicare number were are fill colour in the uploaded bytes |
| See-through redaction made elsewhere | The copy asks the user to cover again; detection and the re-read run on a contrast-stretched copy |
| Identifier returned by the reader | No free-text field in the schema; allow-list rebuild; bounds on line number, code, amount and date |
| Stored or logged by Kindred | No store in the code path; the counter bypasses the seeding store; fixed-status errors; a test feeds garbage with `console.error` spied |
| Provider retention and training | Vertex AI only; terms recorded with a date; disclosed at P01 and again at the send button |
| Someone else uses the device | Input only in storage, 30-minute idle purge checked on load, on `pageshow` (including a back-forward cache restore) and by a timer; erase also clears the clipboard; the opt-in keep carries a shared-computer warning |
| Script exfiltration | The site-wide policy; full page loads into and out of `/private`; no third-party script; a WebKit e2e enters through the P00 button and asserts zero cross-origin requests and a violation on a probe fetch |
| A bill that carries instructions for the model | Inline data only; schema-bound output; every letter figure passes `validateDraft` |
| Demo data attached to a real bill | The mode never constructs `SyntheticBlueButton` or `defaultPolicyFor`; in live mode the demo partner is not offered |

## 10. Changes by File

**New**
- `src/app/(caregiver)/private/page.tsx`, `actions.ts`.
- `src/components/private/`: `PrivateFlow.tsx`, `ModeChoice.tsx` (P01), `BillStep.tsx`, `HospitalPicker.tsx`, `NoticeStep.tsx`, `IncomeStep.tsx`, `PrivateResultView.tsx`, `Packet.tsx`, `EraseControl.tsx`; from I2 `Redactor.tsx`, `CoverList.tsx`, `SendPreview.tsx`; from I3 `MayStillShow.tsx`.
- `src/lib/private/`: `types.ts`, `copy.ts`, `readerTerms.ts`, `investigate.ts`, `letters.ts`, `packet.ts`, `session.ts`, `bound.ts`; `redact/geometry.ts`, `intake.ts`, `flatten.ts`, `pdf.ts` (I2); `redact/ocr.ts`, `detect.ts`, `gate.ts` (I3); `redact/readLocal.ts` (I4).
- `src/lib/adapters/extract/privateRead.ts`; `src/lib/csp.ts` (the policy string, imported by `next.config.ts`).
- `public/ocr/*` and `public/pdf/*`, copied from `node_modules` by `scripts/copy-private-assets.mjs`.
- `playwright.config.ts`, `tests/e2e/*`, `tests/private/*`.

**Edits**
- `src/app/(caregiver)/snap/page.tsx`: the P00 button on both screens; C25.
- `src/app/(caregiver)/case/[id]/income/page.tsx` and `actions.ts`: read-only demo income on the walk.
- `src/lib/compare.ts`: the empty-description guard and `codeDateOnly`. `src/lib/templates/facts.ts`: the `formatDate` guard.
- `src/lib/atlas.ts`: `AtlasSheet.eligibility` gains `insured_patients_covered`, `asset_test`, `residency`; new `privatePolicyOf(sheet)`.
- `src/lib/server/flags.ts`, `.env.example`, `next.config.ts`, `src/app/base.css` (print rules).
- `CLAUDE.md` (rule 1 if approved, rule 9, a gotcha: nothing may log, trace or measure `/private`), `DESIGN.md` §6 (chips, cover, keep box, ruled blank, "Private mode" badge).

**Type changes:** none in `src/lib/types.ts`. **Database changes:** none.

**Not in this plan, but blocking before a live reader is ever switched on in regular mode:** `SyntheticBlueButton`'s default to the main fixture's notice, the Riverbend name and policy fallbacks, and `reLine` printing an unmasked account in full.

## 11. Tests

**Unit (vitest)**
- `tests/private/investigate.test.ts`: on the main fixture stripped of identifiers, the same finding kinds, eligibility 75% and estimate 40950 as `runInvestigation`; no notice; notice with "Not sure" (no comparison, no correction letter); gap with no line (`amounts_differ`); a typed charge with $0.00 on the notice (likely, correction letter without a line number); hospital null; income null (tier table, no dollar column); income without household size is rejected; $70,000 with household 4 is not `none`; a policy with `insured_patients_covered` false yields no percent anywhere in the serialised result; AK and HI give no percent; the serialised result contains none of Dorothy, Hale, Jenna, 4821, SNAP-, Riverbend (outside demo).
- `tests/private/letters.test.ts`: every letter passes `validateDraft`; none contains "summary only", "account ending [", "authorized representative", "NaN" or "undefined"; no letter contains the percent of the guideline; placeholders are not figure-shaped.
- `tests/private/bound.test.ts`: `n` of 4821033 is dropped; a 1941 date is dropped; a code of "DOROTHY" is dropped; extra keys do not survive.
- `tests/private/copy.test.ts`: every exported promise string appears verbatim in this document.
- `tests/private/session.test.ts`: purge after 30 minutes; 24-hour expiry of the opt-in; `forget()` clears both.
- `tests/private/geometry.test.ts`, `detect.test.ts`, `gate.test.ts`: coordinate conversion under zoom; each class over synthetic word lists; money, dates other than a birth date, and service codes are never suggested; a deleted suggestion still fails the gate.
- `tests/private/privateRead.test.ts` (fake client): the schema has no string property other than `code` and the dates; the injection fixture stays in the inline-data part; an SDK error returns `unreadable`.
- `tests/compare.test.ts`, `tests/templates.test.ts`, `tests/atlas.test.ts`, `tests/flags.test.ts`: the guard, `codeDateOnly`, the `formatDate` guard, `privatePolicyOf`, the new flags.
- `tests/private/actions.test.ts`: `countPrivate` touches only `meta`, never seeds, and logs nothing when the store throws; garbage input to each action returns a fixed status with `console.error` never called.

**End to end (Playwright, Chromium and WebKit at 390 by 844)**
- `tests/e2e/csp.spec.ts`: `/`, `/snap`, `/case/demo/result` and `/staff` load with zero policy violations; entering `/private` through the P00 button makes zero cross-origin requests; a probe fetch to another origin is blocked.
- `tests/e2e/private-numbers.spec.ts`: the full numbers path; no request is multipart, none has a query string, no body contains an entered amount, date or income; the P00 button is in the first viewport; print produces one letter per page (`page.pdf()` page count); erase empties both stores and reload shows P01; the 30-minute purge with a mocked clock; with JavaScript disabled there is no file input.
- `tests/e2e/private-photo.spec.ts`: from file pick to `Send this picture` no request body exceeds 2 kB; then exactly one upload, named `page.jpg`, with no APP1 segment, whose bytes differ from the original; with the orientation-6 fixture the pixels at the known name and Medicare-number positions are fill colour; the keep box and a cover can be added, moved, resized and removed with the buttons only.
- Axe on every private screen; a keyboard-only run of the numbers path.

The EXIF and GPS fixture is generated by `scripts/make-fixture-images.mjs` with invented coordinates; it is never a real phone photo, because the repository is public.

## 12. Phases

**I1, the numbers path on the device.** No new key. Accept when: the `Private mode` button opens `/private` with a full page load; P01 and P03 to P07 work with typed numbers; no file input exists on the route; every outcome in the §2 table renders; the packet prints one letter per page; erase, the idle purge and the opt-in keep work; the count increments; the site-wide policy is in place; `PRIVATE_MODE=demo` is the default; all I1 tests pass. I1 closes with a human task: the go-live gate for `PRIVATE_MODE=on` (§13).

**I2, the on-device redactor with the demo reader.** No new key. Accept when: P02, P02b and P02d work on images and on PDFs (pages 1 to 3); an already-covered file goes through in two taps; the photo e2e passes; with `PRIVATE_READER=fixture` demo numbers arrive at P03 tagged "Demo numbers"; with the reader off the photo tile is absent.

**I3, the check before sending and the live reader.** Accept when: suggestions and a suggested keep box appear on the synthetic bill and notice; the gate blocks an uncovered Medicare number with no override; download and recognition times are measured on two real phones and the limits set from them; a person with a real phone has completed the photo path unaided; the notice photo works with a mandatory keep box; then, with a human's Vertex project and recorded terms, `PRIVATE_READER=gemini` returns numbers into P03.

**I4, reading on the device, and the mocks.** Accept when: where on-device reading finds the amount owed and the lines, the picture is not sent at all and the screen says so; the result shows a crop of the covered picture as evidence; the P-series mocks are on the design canvas.

## 13. Decisions Made and Open Decisions

**Made**
1. The numbers path computes in the browser. The server learns the hospital's state and nothing else.
2. A keep box that crops, with covers inside it, instead of covers alone.
3. The live reader waits for the gate (I3) and runs on Vertex AI; a demo reader makes I2 demonstrable without a key.
4. The reader returns no free text. Descriptions exist only if the user types them.
5. Private mode has its own letter wording; the regular templates are untouched.
6. Whatever decides eligibility or coverage is asked, never assumed. One assumption remains (guideline region) and it never enters a letter.
7. Lines pair on code and date only in private mode.
8. Input only in browser storage, with a 30-minute idle purge; an opt-in 24-hour keep in I1.
9. One Content-Security-Policy for the whole site; full page loads into and out of private mode.
10. Private mode offers no route to a Kindred person and no exit to regular mode while neither exists for a real bill.
11. PDFs are rasterised on the device from I2. No HEIC library, no wasm barcode reader, no PDF writer.
12. Browser print, share and copy for the packet; three in-page fields fill the blanks.

**Open, for the founder** (five; each with a recommendation and what the alternative costs)
1. **The word on the button.** Recommend "Private mode" on screen and "Snap Incognito" as the internal name. If "Incognito (private mode)" goes on the button instead, it is a one-constant change and the P01 title and C3 already carry the limit; the cost is the expectation the word sets (that nobody sees or keeps anything, which is what the Chrome Incognito litigation turned on) and a trademark check nobody has done (**unverified**).
2. **Real bills (`PRIVATE_MODE=on`).** Recommend shipping I1 in demo mode now and switching on only after one blocking list is done: counsel has read the §1 sentences and answered the FTC Health Breach Notification Rule question; CLAUDE.md rule 1 is amended to "Private mode may receive a covered picture for one request on the photo path and returns amounts, dates and service codes to the device. It asks for no identifier and writes none of this to the store; the only stored value is a monthly count."; the P04 wording is checked against a current CMS notice; a staffed phone number is configured; the hosting plan permits the use (Vercel Hobby is non-commercial). Switching on without the list puts unreviewed privacy claims in front of real patients; never switching on leaves the feedback answered by a demo only.
3. **Who reads the covered picture.** Recommend Vertex AI: it has no free tier, so it cannot silently fall back to terms that allow training, and it is the route to zero retention. The paid Gemini Developer API is quicker to set up, but nothing in code can tell which terms a key is under, so it needs a named owner and a monthly billing check. Waiting for on-device reading (I4) avoids the provider entirely and delays the photo path for real bills by a phase with **unverified** accuracy.
4. **Questions instead of assumptions.** The request was to fill in everything on assumptions. Recommend the plan as written: four short questions (who the bill is for, household size, same visit, Original Medicare) and blanks. Assuming them instead removes about four taps and puts statements nobody made into a signed letter; with a household of one assumed, a family of four at $70,000 is told there is nothing to ask for.
5. **When the amounts differ and no line explains it.** Recommend what is written: no correction letter, the itemized-bill request, the hospital's billing office and 1-800-MEDICARE. A consented "share these numbers with a Kindred specialist" would give the user a person, but it means storing a case, a staffed queue and a different promise; revisit after real usage.

## 14. Mocks to Add to the Design Canvas

`docs/mocks/`, same kit and phone frame as M01 to M06 (I4): `P00-snap-private-button`, `P01-private-mode` (both tiles), `P02-keep-and-hide` (with suggestions; and an already-covered upload), `P02b-picture-we-send`, `P02c-may-still-show` (strong and weak), `P02d-could-not-read`, `P03-the-bill` (typed and read variants), `P04-medicare-notice` (with the guided question open), `P05-household-income`, `P06-result` (tier with a line; amounts differ; no notice with the tier table; policy does not cover insured patients), `P07-your-letters` (fields, cover sheet, one letter, print layout), `PE1-erase`. Kit additions: the chips, the keep box and cover with their button rows, the ruled blank, the "Private mode" badge.

## 15. Red-Team Changes

Three reviews (leaks, claims, usability) returned 5 critical, 20 high and 17 medium or low findings. What changed, and why:

- **The promise was false on the photo path.** "Kindred never receives the name" held only if every cover was complete. It is now a per-path set of sentences (§1); "never" is kept for the original file and for typed numbers, where tests prove it.
- **The override that sent a suspected Medicare number is gone.** Strong matches can only be covered, or the user types the numbers.
- **Typed numbers no longer go to the server.** The draft posted amounts, dates, codes, hospital and income to an action although the computation was pure. It now runs in the browser.
- **Covers alone became keep-then-cover.** A list of things to hide misses what nobody listed. Cropping to the charges removes all of it, including the rest of a three-month Medicare notice.
- **No real picture is sent before a check exists.** The draft switched on the provider with hand-drawn boxes only. The live reader now follows the gate, and the gate is a set difference rather than a second run of the same OCR.
- **Real hospital policies are read fully.** The tier was computed without reading whether the policy covers insured patients (false on 13 atlas sheets, absent on 641) or has an asset test (165). Coverage now decides whether a percent may appear at all.
- **Assumptions that decided the result became questions** (§6), and the helper is no longer called an "authorized representative".
- **Headlines stopped asserting.** "This Bill May Get 75% Off" and "The Bill Asks $240.00 More Than the Notice Allows" became statements of what the policy lists and that two amounts differ. No-notice runs lead with the missing notice.
- **Erase tells the truth.** "Forget this now" and "Kindred saved nothing" became "Erase from this phone" plus what cannot be erased.
- **Dead ends removed.** The exit to regular mode (demo-only, and it put typed income in a URL), the placeholder phone line and the "specialist" sentence are gone from private mode.
- **The redaction screen became usable.** Zoom buttons, tap-to-cover bands, button rows instead of key chords (Alt and arrow keys navigate Back on Windows and are swallowed by screen readers), enlarged crops in the preview, fixed padding that the preview shows.
- **The reader lost its free-text fields** and gained bounds; lines pair on code and date only.
- **Smaller fixes:** site-wide CSP with full page loads; self-hosted OCR paths; input-only storage with an idle purge; whole-state hospital list; guided single-charge question; in-page fields, share and print CSS for the packet; opt-in keep and PDF rasterising moved earlier; the P04 instruction rewritten; the counter no longer seeds the demo store; `scrub_hit` telemetry dropped.

Two findings conflicted and were settled as follows. Prefilling household size with 1 (usability) lost to requiring it with no default (claims), because a prefilled value is an invisible assumption in a signed letter. Releasing the original at `Send this picture` (leaks) was relaxed to releasing it when the read returns, so "Go back and move the covers" (usability) works; the original stays in a ref in page memory either way and is never in state or storage.

## 16. Residual Risks

1. **A picture can still show something personal.** Cropping and covering are done by a person; the check is OCR and misses handwriting, a name inside the charges table and anything it cannot read. What is left showing reaches Kindred's server and Google. Accepted because the screen says so at the point of sending, and the numbers path is always offered.
2. **Google keeps the covered picture under its own terms.** We disclose it and cannot verify or shorten it. Accepted for the photo path only; the retention figure is **unverified** until a person records the terms.
3. **The host logs that a device opened `/private`,** with IP address and time, and learns the hospital's state from the timing of one request. Unavoidable on any host; disclosed.
4. **The result is as good as the typed numbers.** Nothing checks them against a document, and a wrong notice figure gives a wrong gap. Accepted with C19 and the "You typed this" chip; the P04 wording still needs the CMS sample check.
5. **The device keeps the input** until erase, tab close or the idle purge, for up to 24 hours when the user opted in, and browsers can restore closed tabs. The printed or shared packet lives wherever the user puts it.
6. **A person who cannot see the picture cannot verify it.** The numbers path is the stated route; the photo path is not equivalent for them.
7. **A number can still come back in the wrong field.** The bounds admit any five-digit service code, so a ZIP code read as a code would pass, and an amount under the cap is not checked against anything. Accepted: the user reviews every read value on P03 before it is used.
8. **`'unsafe-inline'` remains in `script-src`** because Next emits inline scripts; a nonce-based policy is a later hardening. An injected inline script could still read the page, though it cannot send data to another origin by fetch, form or frame.
9. **The legal position is not settled by design.** Whether a tool that stores nothing is a vendor of personal health records under the FTC Health Breach Notification Rule needs counsel; FTC Act Section 5 applies to every sentence in §1 regardless. This is why `PRIVATE_MODE=on` is gated.
10. **The atlas can be wrong or stale** on coverage of insured patients. Every policy statement is shown with its quote and checked-on date, and the letters ask rather than assert when coverage is not stated.
