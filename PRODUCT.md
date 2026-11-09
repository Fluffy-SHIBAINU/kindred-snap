# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js 16 App Router + Tailwind v4 + shadcn/ui, Supabase free tier (email one-time-code auth, Postgres, private storage), Gemini API for document extraction and request drafting, Vercel Hobby. Chosen for a four-hour hackathon build with zero hosting cost; the Google key is the only paid dependency.

## Users

Primary: an adult child (caregiver) helping a parent who is on Original Medicare and has received a hospital bill. They act from a phone between other things and want the bill handled, not explained. Secondary: the patient themselves (older adult, possibly limited vision, hearing or confidence), who may use the app directly or grant the caregiver permission. Kindred staff review cases in a separate desktop workspace. (Inferred from the hackathon brief and the founder's stated vision; not yet validated with users.)

## Product Purpose

Kindred Snap lowers a hospital bill by doing the work: it reads the bill and the Medicare Summary Notice, checks the hospital's own published financial-assistance policy against household income, finds evidence-backed discrepancies, prepares the correction request or assistance application, asks for one approval, and tracks the case to a documented resolution. Success is a provider-confirmed balance change the patient can see, with the evidence it rested on.

## Positioning

Every finding shows the exact line it rests on (the clipping), the app decides and prepares while the caregiver approves once, and estimated, confirmed and actual savings are never confused. Competing products explain bills or hand the caregiver a to-do list.

## Operating Context

Hospital bills (paper or PDF), Medicare Summary Notices, household income (typed or photographed from a tax or benefits letter), the hospital's financial-assistance policy (Waive atlas, CC BY 4.0, `fixtures/atlas/`), Patient Financial Services correspondence (simulated in this build), payment due dates. Staff work on a desktop with documents and extracted fields side by side.

## Capabilities and Constraints

Synthetic patient data only. The hospital is a demo partner: its published policy figures are real public record; its billing connection and every response from it are simulated and labelled. CMS Blue Button 2.0 and hospital adapters are synthetic with honest connection states. No external message, appeal, payment or contact is ever sent; `EXTERNAL_ACTIONS=simulated`. Confirmed savings require a basis document recorded by staff; an AI estimate alone cannot create them. Undecided: whether the pilot's first real partner is in Massachusetts (where the atlas is deepest) or elsewhere.

## Brand Commitments

Name: Kindred Snap, the fifth Kindred AI agent. The Kindred standard: primary sources only; every value carries its quote or is labelled Observed or Derived; people decide; collect as little as possible. Voice: plain, exact, unhurried, in the words a daughter or son uses. The app is in English.

## Evidence on Hand

Synthetic case fixtures (bill, Medicare Summary Notice, income, policy) under `fixtures/`; the Massachusetts financial-assistance atlas under `fixtures/atlas/ma.json`. No users, testimonials, metrics, partnerships or savings exist yet, and none may be implied.

## Product Principles

1. One clear next action at a time; everything else is automatic and summarised.
2. Evidence before conclusions: no finding without its clipping, "insufficient information" is a valid answer.
3. Consent is structural: nothing leaves without the patient's or helper's approval, and the approval screen shows exactly what leaves.
4. Honest money: estimated, confirmed and actual are three different things on screen.
5. Real and simulated are never confusable.

## Accessibility & Inclusion

Older adults with limited vision, hearing or technical confidence are primary users. Body text 18px minimum, 56px primary controls, WCAG AA on every text pair (AAA on body), full keyboard and screen-reader path, no autoplay audio, no mandatory voice, zoom never locked.
