# Claims connector (synthetic Blue Button)

This directory holds the interface a Medicare claims connector must satisfy (`types.ts`) and the one implementation that exists in this build, `SyntheticBlueButton` (`synthetic.ts`). It never contacts CMS. It serves the Medicare Summary Notice from `fixtures/cases/<fixtureKey>.json` and reports an honest `unavailable` state when `CLAIMS_FORCE_DOWN=1` is set, when constructed with `forceDown: true`, or for the `edge-connector-down` fixture. The `edge-missing-notice` fixture returns `null`, which the pipeline turns into the `needs_notice` state.

## What CMS Blue Button 2.0 provides

- Original Medicare Part A, Part B and Part D claims for one beneficiary, after that beneficiary signs in at Medicare.gov and authorizes the application (OAuth 2.0 with PKCE).
- Claims arrive as FHIR R4 `ExplanationOfBenefit` resources, with `Patient` and `Coverage` resources. Fields include dates of service, procedure and diagnosis codes, the amount the provider billed, the Medicare-approved amount, what Medicare paid and the beneficiary's coinsurance and deductible, which is the same information the paper Medicare Summary Notice summarises.
- Data is refreshed as claims are adjudicated, typically weeks after the date of service, so a very recent visit may have no claim yet.

## What it does not provide

- The hospital's own statement, its itemized charges, contractual adjustments or the balance it is asking the patient to pay. Those come from the bill the caregiver photographs.
- Medicare Advantage medical claims (Part C). Beneficiaries on an Advantage plan have no Part A/B claims in Blue Button; only their Part D drug events may appear.
- Any statement about whether a charge is correct. Blue Button is a data feed, not an adjudication of the hospital's bill; every finding in Kindred Snap is a comparison the app makes, labelled with its evidence and confidence.
- Real-time status of a claim under appeal or correction.

## What production would require

- A registered application in the CMS Blue Button 2.0 developer portal, a production-access review by CMS, and the per-beneficiary authorization flow on Medicare.gov. The sandbox issues synthetic beneficiaries only.
- Handling the beneficiary's refresh tokens and revocation, retention limits on the retrieved claims, and the privacy and security obligations that come with real Medicare data.
- A mapping from `ExplanationOfBenefit` items to the `MsnLine` shape in `src/lib/types.ts`.

None of that exists here. This build ships only the synthetic connector, and `CLAUDE.md` rule 2 forbids writing a live one during the hackathon. Everything the connector returns is synthetic and is labelled "Demo partner · synthetic data" wherever it shows.
