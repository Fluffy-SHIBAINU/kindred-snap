# Kindred Snap — film v2: "Neither Should Yours"

A founder talking to camera, without a camera. One continuous paper world, the founder's own words
(verbatim, 13 paragraphs, Gemini TTS voice Charon, 84.0 s, not sped up), and every reveal anchored to the
word that names it. Calm, personal, first person. Nothing in it is a beat-driven mashup; v1 at `video/film`
is untouched and stays the energetic version.

Material: the real product rebuilt in HTML with the mock kit (`docs/design/kit.css` classes, same tokens:
paper #FAF7EF, paper-2 #E9F8EF, paper-3 #D4F0E0, ink #0C1C16, muted #54655D, rule #CBD6C9, green #007948,
deep green #005F3A, mint #A9E8C6), traced over `video/captures/01-snap.png`, `02-income.png`, `04-result.png`.
Type: Atkinson Hyperlegible Next 500/700/800 and Atkinson Hyperlegible Mono for every amount. Title Case for
titles and card titles, sentence case for everything else. No gradients, no stock footage, no emoji. The
example numbers are the founder's ($480.00 bill, $180.00 responsibility, $300.00 gap), not the app's
synthetic case; the end card says the example is synthetic and nothing was sent.

How this differs from the house look: no dark ground, no lime, no grotesk; warm paper, green-black ink, one
pharmacy green used twice (the Take photo button, the approve button), a mint highlighter, mono amounts.

## Narration (verbatim, the voice-over)

1. Hi, I'm Shawn Yoon, founder of Kindred AI.
2. Have you ever gotten a surprise medical bill in the mail? In the US, those bills are scarier than the Halloween kids knocking on your door.
3. What's worse? Paying it, then finding out you might've qualified for help.
4. A 2025 survey found that 44% of American adults weren't familiar with hospital charity care. My parents didn't know either.
5. And honestly, the whole process is exhausting. Which program? Which form? Who do you call?
6. We tried AI. It just gave them more questions they didn't understand. They needed help—not more homework.
7. So we're building Kindred Snap. Take a photo of your bill to start.
8. Here's an example. The hospital bill says $480. The insurance statement says your responsibility is $180. That doesn't automatically prove an error—but it tells us what to investigate.
9. Kindred helps check the documents, look for financial assistance, and prepare the paperwork. If something's missing, we ask for that—not twenty decisions about what to do next.
10. You review and approve before anything gets sent.
11. We're starting with hospital bills. Eventually, direct connections could mean you don't even need the photo.
12. My parents shouldn't need to become billing experts to get help. Neither should yours.
13. Kindred Snap. Reduce your medical bill.

Voice: Gemini 3.8 Flash TTS over REST, one request for the whole script (continuous pacing), voice Charon
(166 words a minute, −17.8 LUFS; Puck read at 185 wpm, too quick; Fenrir reads excitable). 0.6 s of lead
before "Hi" so the poster frame breathes. Word cues from `tools/cues.mjs` (paragraph > sentence > clause
silence alignment; whisper is not installed and is not downloaded). Film length = narration + 2.5 s hold ≈ 87 s.

## Rhythm sheet

Route: continuous. One paper ground for 87 s; scenes replace each other only on sentence starts, and each
hand-over carries an object (envelope → bill → receipt → the 44% sheet → the table → forms → chat card →
phone → clippings → cards → phone → paper → wordmark). Narration leads; the music is a felt piano at 84 BPM
(`OM.music({ bpm: 84, style: 'piano' })`), under the voice the whole way, lifting once at the forms collapse
and once at the approve press, ringing out under the end card. Effects only on landings: paper, thud, stamp,
pop, draw, shutter, click.

| stretch | time | energy | events/bar | what moves | sound |
|---|---|---|---|---|---|
| hello | 0–4.9 | 3 | 1 | wordmark already on paper, envelope settles; name plate rises on "Shawn" | piano motif, `paper` |
| mail | 4.9–13.2 | 4→5 | 2 | push to the front door; the envelope opens, the bill peeks; two knocks on "knocking"; the mono jack-o'-lantern on "Halloween" | `thud` ×2 (knocks), `pop` |
| paid | 13.2–18.2 | 5 | 2 | the bill flat; PAID stamp thumps on "Paying"; the policy page rises on "finding out"; the receipt slides over it on "qualified" | `stamp`, `paper` |
| survey | 18.2–25.1 | 6 | 2 | 44% counts up on "44%", label and "2025 survey" attribution | `count` |
| table | 25.1–27.1 | 2 | 1 | the figure dims; a quiet unlabelled table: two cups, one folded sheet | nothing |
| forms | 27.1–34.0 | 7 (burst) | 6 | forms, program names and phone numbers stack on "Which… Which… Who"; the pile collapses on "call" | `pop` per card, `thud` ×3 on the fall |
| ai | 34.0–40.9 | 5→2 | 3 | chat bubbles spring in on "questions"; the wall clears on "needed" | `pop` ×5, `whoosh` |
| snap | 41.0–45.2 | 5 | 2 | the real Take a Photo screen rises on "building"; tap on "photo", shutter | `pop`, `click`, `shutter` |
| example | 45.2–57.9 | 6 | 3 | two clippings land on "$480" and "$180"; "Not proof of an error" on "automatically"; the $300.00 gap and "What to investigate" draw on "investigate" | `thud` ×2, `draw` |
| help | 57.9–67.2 | 5 | 3 | three cards on "check / look / prepare"; one question card on "missing"; a crossed-out stack of twenty on "twenty" | `pop` ×3, `draw` |
| approve | 67.2–70.9 | 6 | 1 | the real result screen; the single green button pressed once on "approve" | `click` |
| connect | 70.9–76.6 | 4 | 2 | the phone steps left; a dotted line draws to Medicare and Insurer cards on "connections"; the camera icon fades on the second "photo" | `draw`, `pop` |
| parents | 76.6–82.0 | 3 | 1 | the two lines set on paper, the table's cups return | `paper` |
| end | 82.0–87.1 | 4 | 1 | "Kindred Snap." on the word, "Reduce your medical bill." on "Reduce", mono footer "Synthetic example · nothing was sent"; hold 2.5 s; bottom-right corner clear for the signature | `chime`, piano rings |

Hook: the poster is the subject (wordmark and envelope); the first motion is the envelope settling and the
name plate at 1.5 s. Burst: the forms pile at 27–34 s (one card per quarter second, then the collapse).
Hero: the two clippings and the $300.00 gap at 45–58 s. Stop: the quiet table at 25–27 s. Resolve: paper,
the parents line, the end card.

## Beat map (word anchors)

| cue word (nth) | ≈ time | what lands |
|---|---|---|
| Shawn | 1.5 | name plate "Shawn Yoon · Founder, Kindred AI" |
| Have | 4.9 | camera to the front door, envelope on the mat |
| mail | 6.9 | the flap opens, the bill peeks out |
| Halloween | 10.5 | the jack-o'-lantern (mono glyphs) pops on the step |
| knocking | 11.2 | two knocks; the door shakes twice |
| What's | 13.2 | the bill lies flat on paper |
| Paying | 14.2 | PAID stamp |
| finding | 15.4 | the policy page rises behind |
| qualified | 16.3 | the receipt slides over the policy page; the mint line peeks |
| 2025 | 18.4 | "2025 survey" attribution |
| 44% | 19.8 | the figure counts 0 → 44% |
| parents (1) | 25.3 | the table scene, no label |
| honestly | 27.1 | first forms land |
| Which (1) · Which (2) · call | 27.9 · 30.2 · 32.9 | the pile grows; collapse at the end of "call" |
| tried | 34.3 | chat card |
| questions | 36.4 | bubbles stack |
| needed | 38.3 | the wall clears |
| building | 41.3 | the Snap phone rises |
| photo (1) | 43.3 | tap, shutter |
| example | 45.2 | the two documents frame |
| $480 | 48.2 | the bill clipping lands |
| $180 | 52.4 | the statement clipping lands |
| automatically | 54.4 | caption "Not proof of an error" |
| investigate | 57.2 | $300.00 gap, "What to investigate" |
| check · look · prepare | 58.5 · 60.4 · 62.6 | three cards |
| missing | 63.5 | one question card |
| twenty | 65.3 | stack of twenty, struck through |
| approve | 68.7 | the green button, pressed once |
| starting | 71.5 | the phone steps left |
| connections | 74.1 | dotted line to Medicare and Insurer |
| photo (2) | 75.7 | the camera icon fades |
| parents (2) | 77.2 | line one on paper |
| Neither | 80.3 | line two |
| Kindred (4) | 82.1 | "Kindred Snap." |
| Reduce | 83.5 | "Reduce your medical bill." and the footer |

## Four stills

1. 0.0 s — the poster: wordmark and the envelope on paper.
2. 20.5 s — 44% set large, "2025 survey".
3. 57.5 s — the two clippings, the $300.00 gap, "Not proof of an error".
4. 86.0 s — the end card.

## Continuity chain

wordmark + envelope → envelope at the door → the bill out of the envelope → the bill stamped PAID → the policy
page under the receipt → the figure 44% on a sheet → the sheet on the table → the forms are sheets → the chat
card is a sheet → the phone (the real screen) → the clippings come from the phone → the cards sit where the
clippings were → the phone again → the phone steps aside for the connection cards → the table returns under
the parents line → the wordmark returns where it started.

## Decisions

- Charon over Puck and Fenrir by measurement (rate, register); no listening judge was available for this key.
- The three questions share one breath in the take; the stock `om voice` silence alignment slid 27–62 s one
  sentence early, so `tools/cues.mjs` aligns paragraph > sentence > clause and pins nothing by hand unless
  a paragraph start misses its pause.
- The example amounts are the founder's; the app's synthetic $240.00 case is not shown.
- Music is the built-in felt piano, not a written score: the voice leads and the brief asked for quiet.
- From the first render's contact sheets: the 44% figure now appears as it starts counting (it sat at "0%" for
  two seconds), and the empty chat card shows a typing indicator for the second before the first question.
- `om qa` reports a flat opening and low mean motion (0.36, no hard cuts). Both are the brief: a calm, continuous,
  narration-led film. Every ≥1 s still it lists is a reading hold under a spoken sentence; no single-frame pops.
- Mix: voice −14.8 LUFS over a bed at −26.8 LUFS, master −18.0 LUFS integrated, LRA 3.7 LU (quieter than the −14
  social target on purpose; the voice stays clear).
