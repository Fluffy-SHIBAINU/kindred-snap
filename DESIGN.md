# Kindred Snap — Design System (locked)

This file is the design source of truth for Kindred Snap. Hallmark, Impeccable, UI/UX Pro Max and the mock restyle pass all read it. Change it deliberately; do not deviate in code without updating it.

## 1. The world

**Kitchen table, morning paper.** A hospital bill is paper that lands on a kitchen table, and a caregiver reads it in window light with a highlighter. The interface is that scene: warm, fibre-grained paper; green-black ink; one pharmacy green that marks the primary action, what is settled and what is checked; pale translucent "plastic" trays for the steps the app is working through. It is trustworthy because it is exact and unhurried. It is not a clinical blue portal, not a wellness pastel, not an alarm.

Theme lineage: Hallmark deal `Dose` (1/3, seed `kindred-snap-phone-app-deb4·6ae2ed86·2026-11-09·r0`), genre modern-minimal, posture committed, ground **white**. The theme lends palette, radii and surfaces, never layout.

**Signature — the clipping.** Every material finding shows the exact line it rests on: a strip of the actual document (bill line or Medicare Summary Notice line) set as a paper clipping, the amount marked with a mint highlighter stroke, and a one-line source caption ("Bill, page 1, line 3"). Two clippings side by side are the discrepancy. The clipping is the Kindred standard made visible: every value carries its quote.

## 2. Surfaces and modes

| Surface | Mode | Lead skill | What it is |
|---|---|---|---|
| Landing `/` | Persuade | taste (hero), frontend-design (editorial), algorithmic-art (field), theme-factory (ground card) | One screen hero: the real phone UI in an app frame, headline naming category and buyer, one hard fact, two actions. Below: an editorial "how a case moves" section built on clippings; an interactive card whose press cycles the three Dose grounds (white, green, night); the particle field drifts behind the hero like dust in window light. |
| Caregiver app `/case/*` | Operate | hallmark (floor), ui-ux-pro-max (a11y rules) | One primary action per screen, a progress feed of auto steps, clippings for evidence, 56px controls. Minimal, simple, clear. |
| Staff workspace `/staff/*` | Operate | impeccable (operate.md), ui-ux-pro-max (palette + charts) | Top bar + tabs, tables before cards, four states per region, two charts (cases by state; estimated vs confirmed savings). |
| Poster | Experience | canvas-design | One printable key visual: the clipping at monumental scale. Used as the video's opening and closing card. |
| Demo video | — | huashu-motion | 90 seconds, the real UI rebuilt in code, Gemini TTS voice-over, ends on the brand. |

The app is in English. Minimal always wins: when a flourish and clarity conflict, clarity stays.

## 3. Tokens

All colour and type go through tokens. No literal colour or `font-family` outside the token block (`src/app/tokens.css` for the app, `docs/design/kit.css` for the mocks).

| Token | oklch | hex | Use |
|---|---|---|---|
| `--color-paper` | oklch(97.6% 0.011 88) | `#FAF7EF` | page ground |
| `--color-paper-2` | oklch(96.5% 0.02 160) | `#E9F8EF` | second neutral: bars, panels, waiting steps |
| `--color-paper-3` | oklch(93% 0.036 160) | `#D4F0E0` | sunken trays, table head |
| `--color-ink` | oklch(21% 0.025 170) | `#0C1C16` | text, icons |
| `--color-ink-2` | oklch(31% 0.02 170) | `#26342F` | secondary text |
| `--color-muted` | oklch(49% 0.024 165) | `#54655D` | captions, helper text (5.8:1 on paper) |
| `--color-rule` | oklch(86.5% 0.022 140) | `#CBD6C9` | hairlines, control rims |
| `--color-accent` | oklch(50% 0.13 160) | `#007948` | primary action, selection, confirmed |
| `--color-accent-deep` | oklch(42% 0.11 162) | `#005F3A` | pressed, rims under the primary |
| `--color-accent-soft` | oklch(88% 0.08 160) | `#A9E8C6` | mint: checked, done, highlighter |
| `--color-accent-ink` | oklch(99% 0.006 160) | `#F8FDFA` | text on accent (5.3:1) |
| `--color-focus` | oklch(45% 0.14 160) | `#006B38` | focus ring, 3px, offset 2px |
| `--color-night` | oklch(13% 0.01 170) | `#040807` | night ground (landing card only) |
| `--color-green-ground` | oklch(46% 0.12 160) | `#006B40` | green ground (landing card only) |

Contrast (computed): ink/paper 16.4, ink-2/paper 12.2, muted/paper 5.8, accent/paper 5.1, accent-ink/accent 5.3, ink/accent-soft 12.6, ink/paper-3 14.5, muted/paper-3 5.1. Every pair used for text passes WCAG AA; body text passes AAA.

Status is never colour alone: done = mint fill + check icon + the word; active = accent ring + "Working"; waiting = paper-2 + "Next"; needs you = the primary button. Late or missed is grey ink, never red. The only red is none: destructive actions (delete the case) are ink outline buttons behind a confirmation.

## 4. Type

One family: **Atkinson Hyperlegible Next** (Google Fonts, weights 400/500/700/800) for everything, chosen for low-vision legibility. **Atkinson Hyperlegible Mono** 400/500 for amounts, codes, dates and account numbers, with tabular figures. No display face; no tracked capitals; no eyebrows; labels are the body face a step smaller, sentence case.

Fixed rem scale, ratio 1.2, base 18px: `--text-sm` 16 · `--text-md` 18 · `--text-lg` 22 · `--text-xl` 26 · `--text-2xl` 32 · `--text-3xl` 38 · `--text-display` 46 (landing only). Line-height 1.5 body, 1.15 headings. Phone h1 is 32px. Body measure 60–70ch on desktop. Weights: 400 body, 500 labels and buttons, 700 headings, 800 one number on the poster.

## 5. Space, radius, depth

Spacing scale (spacious, density dial 2): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Phone padding 24px. Groups tight, sections generous; more space above a heading than below it.

Radius: controls 10px, surfaces 14px, tags 999px, phone screen 28px. One radius per nesting level; never a card inside a card.

Depth: `--shadow-card: 0 1px 2px rgb(12 28 22 / 0.08), 0 24px 48px -24px rgb(12 28 22 / 0.35)`. Plastic trays: a tint at 62% alpha with a 1.5px glint line on top and a soft inner shade at the foot. No zero-offset halos, no hard offset shadows, no gradients beyond the glint.

## 6. Components

- **Primary button** `.btn-primary`: 56px tall, 10px radius, accent fill, accent-ink text 18px/500, 1px rim and 3px rim below in accent-deep, sinks 3px on press. Full width on phone. One per screen.
- **Secondary** `.btn-secondary`: same size, paper fill, ink text, rule rim. **Text link** `.btn-text`: 48px hit target, ink, underline on hover in accent.
- **Step row** `.step` with `--done`, `--active`, `--waiting`, `--needs-you`: a tray (paper-2) with a 24px icon, a one-line summary, and an optional "Show evidence" disclosure. Done rows are mint with a check; the active row has an accent ring; the needs-you row carries the primary button beneath it.
- **Clipping** `.clip`: paper white strip, 10px radius, `--shadow-card`, the document line in Mono, the amount marked with `.hl` (mint highlighter: a padded span with accent-soft background), the source caption in muted 16px beneath. Two clippings stacked = `.evidence`.
- **Money block** `.money` with `.badge--estimated` (dashed rule, ink-2 text, "Estimated"), `.badge--confirmed` (accent stamp, "Confirmed by the hospital"), `.money--actual` (ink band, paper text, "Actual savings").
- **Badges**: `.badge--demo` "Demo partner · synthetic data" (paper-3 with ink text), `.badge--synthetic` "Simulated" (rule outline). Both appear wherever hospital or Medicare data is on screen.
- **Alert** `.alert` (paper-2, ink) and `.alert--warn` (paper-3, ink, a calendar or info icon): dates and what happens to them. Never red.
- **Field**: 56px input, 10px radius, 1px muted border, visible label above (18px/500), helper text in muted; errors in ink next to the field with the fix.
- **Choice tiles**: two large tappable tiles (min 96px tall), mint when selected with a check.
- **Tables** (staff): 40px rows, head in paper-3, Mono for amounts, `overflow-x: auto` wrapper.
- **Charts** (staff): ink, accent, accent-soft, paper-3 only; direct labels plus a legend; patterns or labels so meaning never rides on colour alone; tooltips on hover and focus; sequential scales are accent lightness steps.

## 7. Motion

150–250ms, `transform` and `opacity` only, exponential ease-out, `prefers-reduced-motion` shows the end state. One authored moment in the app: when the simulated hospital response arrives, the "Confirmed" stamp lands (scale 1.06 → 1, 220ms) and the balance figure counts down once. Landing only: the particle field (dust in window light) drifts, pauses off screen, is still under reduced motion; the hero enters once on load. No scroll-jacked reveals, no card fade-ins.

## 8. Copy

Plain, grade-6 reading level, active voice, sentence case. Controls name the action and its object ("Approve and send to the hospital", "Take the photo again"). Errors name the problem and the fix. The hospital's and Medicare's own words appear only inside clippings, quoted exactly. Money is always labelled estimated, confirmed or actual. Never "0 users", never invented figures, never a promise about outcomes.

## 9. Accessibility floor

Body 18px minimum on every device; headings one level at a time; controls ≥48px (primary 56px); every control a real `<button>`, `<a href>`, `<input>` + `<label>`; `aria-label` on icon-only controls; decorative SVG `aria-hidden`; `:focus-visible` ring 3px `--color-focus` offset 2px, instant; status announced with `role="status"` once per change; zoom never locked; `overflow-x: clip` on html and body; keyboard path through the whole caregiver journey; skip link first. Checked with axe (Playwright) and a manual walkthrough recorded in `docs/a11y-walkthrough.md`.

## 10. Floor and bans (merged from Hallmark, Impeccable, taste, UI/UX Pro Max)

Never: literal colours outside tokens · `transition: all` · animating width/height/top/left · eyebrows or tracked-caps labels · middle-dot meta strings (the demo badge uses a plain " · " only inside its own fixed label) · purple-to-blue gradients · gradient text · card in card · emoji as icons · fake status bars · decorative status dots · coloured left borders · hard offset shadows · invented metrics, testimonials or logos · a modal where inline disclosure works · red or amber for lateness · placeholder-only labels · colour as the only carrier of meaning · "0 users".

## 11. Stamp (first lines of the app stylesheet)

```
/* Hallmark · shape: app screen · genre: modern-minimal · theme: Dose (deal 1/3, seed kindred-snap-phone-app-deb4·6ae2ed86·2026-11-09·r0)
 * nav: top bar, one wordmark and one action · signature: the clipping · states: loading, empty, error, full · dose: white
 * axes: light/grotesk-sans/chromatic-green · posture: committed · contrast: pass · v2.0.0 */
```
