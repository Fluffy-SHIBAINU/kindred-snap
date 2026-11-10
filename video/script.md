# Kindred Snap — 90-second demo, voice-over script

About 170 words at a brisk, natural pace. One idea per beat. Captions in Title Case for titles, sentence case for everything else. Every hospital and Medicare figure on screen is synthetic; the closing line says so.

| Time | Beat | Screen | Voice-over |
|---|---|---|---|
| 0–8 s | Hook | Poster card (P01), then the bill on the kitchen table | A hospital bill. Four hundred sixty-six dollars. Dorothy is seventy-four. |
| 8–18 s | Setup | M01 Take a Photo of the Bill → M02 Your Income | Kindred Snap. One photo of the bill. One number for income. That's the whole setup. |
| 18–40 s | Auto mode | M03 We're On It, steps completing | Kindred reads every line and pulls Medicare's notice for the same visit. Line three, contrast dye, two hundred forty dollars: Medicare says it's included in the CT payment. Then it checks the hospital's own assistance policy. Dorothy lands in the seventy-five percent tier. |
| 40–55 s | One tap | M04 Dorothy May Get 75% Off, two clippings, the send button | One screen. Dorothy may get seventy-five percent off, and two hundred forty dollars may not be hers to pay. Every finding shows the line it rests on. One tap sends both letters. |
| 55–70 s | Answer | M05 Done → M06 Riverbend Fixed the Bill | Done. Jenna hears back in two to four weeks. The hospital's answer here is simulated: four sixty-six becomes fifty-six fifty. Estimated, confirmed, actual. Never blurred. |
| 70–82 s | Staff | S00 dashboard, S03 findings with evidence and audit | Behind it, Kindred staff see the evidence, every edit with its original, and a full audit trail. Nothing leaves without the family's approval. |
| 82–90 s | Close | Poster card with the wordmark | Kindred Snap. Snap the bill once. We do the rest. Nothing was sent. |

## Production notes

- Capture the real app with Playwright at 390×844 (device scale 2) using the demo controls to advance the case; staff pages at 1280×800.
- Voice: Gemini TTS (model id verified in `docs/PLAN.md` §2) or the macOS `say` fallback; one audio file per beat so cuts land on the words.
- Assemble with huashu-motion (`om`) or Remotion; 1920×1080, 90 s ± 3 s, captions burned in, quiet music optional.
- Title cards use the poster PNG (`docs/mocks/png/P01-Poster.png`) and the Dose tokens; no gradients, no stock footage.
