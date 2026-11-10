# Kindred Snap — 90-second film: "The Bill Comes Down"

Three Korean references, one film. Leenalchi's "Tiger Is Coming" gives the spine: a hypnotic, repeating beat and a chant that never explains, with figures moving in lockstep on flat colour. North Face Korea's "Never Stop Exploring" gives the single reveal: the floor the customer trusts disappears. LG U+'s lullaby film gives the frame: one true-feeling family story, told quietly, that earns the ending.

Material: the real product, rebuilt in code at true size (video/captures/*.png are the references; the UI is HTML in the composition, same tokens: paper #FAF7EF, mist #E9F8EF, tray #D4F0E0, ink #0C1C16, muted #54655D, rule #CBD6C9, green #007948, deep green #005F3A, mint #A9E8C6). Type: Atkinson Hyperlegible Next (500/700/800) and Atkinson Hyperlegible Mono for every amount. No gradients, no stock footage, no emoji. Captions in Title Case; everything else sentence case. All patient data is synthetic and the last card says so.

## Rhythm sheet (90 s, 16:9, 1920×1080)

Route: hybrid. A slow continuous opening (the lullaby), a montage on the beat (the tiger), one hard stop (the floor), a slow close (the lullaby again). Music: `OM.music({ bpm: 96 })`, a dry, round, percussive loop with a low pulse — the "tiger" groove, not drums-and-bass. Narration beats are in `video/script.md`; audio files `video/vo/beat-1..7.wav` (Gemini 3.8 Flash TTS, voice Kore). Every scene cut lands on a beat (`OM.beat(n)`); every number that lands gets `OM.sfx('thud')`; every screen that snaps in gets `OM.sfx('pop')`.

| Time | Scene (label) | What happens on screen | Motion verb | Sound |
|---|---|---|---|---|
| 0–8 | `scene:table` | Frame 0 is the poster (the bill's ledger lines on warm paper, the $240 figure already there, dim). A single paper bill slides onto a kitchen-table-coloured ground; "$466.00" set huge in mono, "due Nov 30" small beneath. Slow push in. | arrive | music enters low; one `thud` when $466.00 lands |
| 8–18 | `scene:snap` | Beat starts. Three phone screens stand in a row like dancers in lockstep: Snap (01), Income (02), Working (03). Each snaps in on a beat, slightly offset, same height, flat colour bands behind them (mist / tray / paper-2) shifting one step per bar — the Leenalchi floor. A chant caption types in on beats: "Snap the bill." · "One number." · "That's it." | snap in, step | `pop` per screen, `hit` on "That's it" |
| 18–40 | `scene:working` | Camera on the Working screen; the five step rows light up one per two beats: Read the bill → Medicare notice → Compare lines → Help program → Write letters. On "Compare lines" the two clippings (bill line 3 $240.00 / notice line 3 $0.00) slide out of the phone and stand side by side at 1.6×; the mint highlighter stroke draws across $240.00 on the beat. On "Help program" the policy quote card rises with "75%" in mono. | light up, pull out, draw | `pop` per row; `whoosh` on the pull-out; `thud` on "75%" |
| 40–55 | `scene:result` | Result screen (04) fills the frame at 1.2×: "Dorothy May Get 75% Off" / "And $240.00 of This Bill May Not Be Hers to Pay". The single green button pulses once with the beat. A finger-press ring on "Draft the letters and send" — the button sinks 3 px (the real control's press). | present, press | music drops to the pulse only; `hit` on the press |
| 55–62 | `scene:floor` | THE REVEAL (North Face). The whole result screen is standing on a floor made of the number "$466.00" in 300-px mono. The floor disappears: the digits fall away below frame one by one, the screen hangs for a beat on a thin rule like a climber on a hold, then "$56.50" rises from below and locks in as the new floor. Silence for 0.6 s, then one `subdrop`. | fall, hang, lock | silence → `subdrop` → `thud` |
| 62–72 | `scene:answer` | Done (05) and Resolved (06) screens come in as two quiet cards; three money rows count in mono: Estimated $409.50 · Confirmed $409.50 · Actual savings $409.50; "Simulated" badge visible on the letter clipping. Caption: "Estimated. Confirmed. Actual. Three numbers that never blur." | settle, count | soft `pop` ×3 |
| 72–82 | `scene:staff` | Staff dashboard (08) at 0.9×, one slow push; the audit list scrolls two rows; caption "Every edit keeps its original. Nothing leaves without the family's approval." | push, scroll | music thins to pulse |
| 82–90 | `scene:end` | Back to the kitchen-table paper. Wordmark "Kindred Snap" 800 weight; line "Snap the bill once. Kindred does the rest."; small mono footer "Demo partner · synthetic data · nothing was sent" (the only place that pill-text appears). Hold 2.4 s. Signature corner left clear. | land, hold | final `thud`, music resolves |

## Four stills to get right first

1. 3.0 s — the bill on the table with $466.00 huge (poster frame).
2. 30.0 s — the two clippings side by side with the mint stroke across $240.00.
3. 58.0 s — the screen hanging on the rule, digits of $466.00 falling, $56.50 not yet risen.
4. 88.0 s — the end card.

## Continuity chain

Paper ground is constant; the camera is one `OM.camera('#world')` moving across a wide world: table (x 0) → dancers row (x 1920) → working close-up (x 3840) → result (x 5760) → floor drop (same spot, y motion) → answer cards (x 7680) → staff (x 9600) → back to table (x 0). The $240.00 figure is the thread: dim on the poster, highlighted in the clippings, the gap on the result, the first digit to fall from the floor.

## Narration alignment

`OM.cue` words: "Four hundred sixty-six" → $466.00 lands; "Snap" → first phone snaps; "line three" → clipping pull-out; "seventy-five" → 75% card; "one tap" → press; "fifty-six fifty" → $56.50 locks; "never blur" → third money row; "approval" → staff caption; "Nothing was sent" → end footer.
