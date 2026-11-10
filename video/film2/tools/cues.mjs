// Word cues for the single narration track, without Whisper. The stock silence alignment in `om voice`
// places sentences one pause early where three short questions share one breath (26–62 s on the Charon
// take), so this aligns hierarchically: paragraphs (narration.txt lines) onto the long pauses, sentences
// inside each paragraph onto the medium ones, clauses onto the short ones, words by spoken length inside
// a clause. Each level is a monotonic least-cost assignment of boundaries to distinct pauses, weighted
// towards longer pauses; a boundary with no pause left falls back to its length-weighted estimate.
// shortcut: not ASR; sentence edges are exact where a pause exists, words inside are ~0.2 s. Upgrade: om voice --asr on.
// usage: node video/film2/tools/cues.mjs [--pin 7=41.05 ...]   (pins a paragraph's start, 1-based, seconds)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const film = path.join(here, '..');
const wav = path.join(film, 'assets', 'voice.wav');
const html = path.join(film, 'index.html');

const pins = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--pin') { const [k, v] = process.argv[++i].split('='); pins[Number(k)] = Number(v); }

const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());
const log = spawnSync('ffmpeg', ['-v', 'info', '-i', wav, '-af', 'silencedetect=n=-35dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const gaps = []; // [start, end]
let open = null;
for (const line of log.split('\n')) {
  const s = /silence_start:\s*(-?[\d.]+)/.exec(line), e = /silence_end:\s*([\d.]+)/.exec(line);
  if (s) open = Math.max(0, Number(s[1]));
  if (e && open != null) { gaps.push([open, Number(e[1])]); open = null; }
}
if (open != null) gaps.push([open, dur]);

// spoken length of a token: numbers and symbols as they are said
const SPOKEN = { '$480': 'four hundred eighty dollars', '$180': 'one hundred eighty dollars', '44%': 'forty-four percent', '2025': 'twenty twenty-five', US: 'U S', AI: 'A I' };
const spoken = (w) => SPOKEN[w.replace(/[.,?!]+$/, '')] || w;
const weight = (words) => words.reduce((a, w) => a + spoken(w).replace(/[^A-Za-z0-9]/g, '').length + 1, 0);

// Assign the k boundaries (expected speech positions) to distinct eligible gaps, in order, minimising
// (gap - expected)^2 / (pause + 0.1). Returns a gap index per boundary, -1 when none is left.
function assign(expected, cands) {
  const K = expected.length, G = cands.length;
  if (!K) return [];
  if (G < K) {
    // too few pauses: greedy nearest, unique, in order; the rest estimated
    const out = new Array(K).fill(-1);
    let g = 0;
    for (let k = 0; k < K && g < G; k++) {
      while (g < G - (K - 1 - k) && g + 1 < G && Math.abs(cands[g + 1].t - expected[k]) < Math.abs(cands[g].t - expected[k])) g++;
      if (Math.abs(cands[g].t - expected[k]) < 1.5) out[k] = g++;
    }
    return out;
  }
  const miss = (j, k) => (cands[j].t - expected[k]) ** 2 / (cands[j].len + 0.1);
  const cost = Array.from({ length: K }, () => new Float64Array(G).fill(Infinity));
  const from = Array.from({ length: K }, () => new Int32Array(G).fill(-1));
  for (let j = 0; j < G; j++) cost[0][j] = miss(j, 0);
  for (let k = 1; k < K; k++) {
    let best = Infinity, arg = -1;
    for (let j = 1; j < G; j++) {
      if (cost[k - 1][j - 1] < best) { best = cost[k - 1][j - 1]; arg = j - 1; }
      if (arg >= 0) { cost[k][j] = best + miss(j, k); from[k][j] = arg; }
    }
  }
  let j = 0;
  for (let i = 1; i < G; i++) if (cost[K - 1][i] < cost[K - 1][j]) j = i;
  const picked = [];
  for (let k = K - 1; k >= 0; k--) { picked.unshift(j); j = from[k][j]; }
  return picked;
}

// Place `units` (arrays of words) inside the speech span [a, b]: returns [[start, end], …] per unit.
// Boundaries snap to gaps of at least minPause inside the span; speech time excludes the gaps.
function place(units, a, b, minPause, pinned) {
  const inside = gaps.filter(([s, e]) => s > a + 0.05 && e < b - 0.05);
  const speechBefore = (t) => t - a - inside.reduce((acc, [s, e]) => acc + Math.max(0, Math.min(e, t) - s), 0);
  const total = speechBefore(b);
  const ws = units.map(weight), W = ws.reduce((x, y) => x + y, 0);
  const expected = [];
  let acc = 0;
  for (let k = 0; k < units.length - 1; k++) { acc += ws[k]; expected.push((acc / W) * total); }
  const cands = inside.filter(([s, e]) => e - s >= minPause).map(([s, e]) => ({ t: speechBefore(s), s, e, len: e - s }));
  const pick = assign(expected, cands);
  const cuts = pick.map((j, k) => {
    if (pinned && pinned[k + 2] != null) { const g = inside.find(([s, e]) => Math.abs(e - pinned[k + 2]) < 0.3); return g ? { s: g[0], e: g[1] } : { s: pinned[k + 2], e: pinned[k + 2] }; }
    if (j >= 0) return { s: cands[j].s, e: cands[j].e };
    // estimate in real time: walk speech time back to the clock
    let t = a, left = expected[k];
    for (const [s, e] of [...inside, [b, b]]) { if (left <= s - t) { t += left; left = 0; break; } left -= s - t; t = e; }
    return { s: t, e: t };
  });
  for (let k = 1; k < cuts.length; k++) if (cuts[k].s < cuts[k - 1].e) cuts[k] = { s: cuts[k - 1].e, e: cuts[k - 1].e };
  const spans = [];
  let start = a;
  for (let k = 0; k < units.length; k++) { const end = k < cuts.length ? cuts[k].s : b; spans.push([start, Math.max(start, end)]); if (k < cuts.length) start = cuts[k].e; }
  return spans;
}

const paragraphs = fs.readFileSync(path.join(here, 'narration.txt'), 'utf8').trim().split('\n').map((l) => l.trim()).filter(Boolean);
const sentencesOf = (p) => p.split(/(?<=[.?!])\s+/).filter(Boolean);
const clausesOf = (s) => s.split(/(?<=[,;:])\s+|—/).map((c) => c.trim()).filter(Boolean);
const wordsOf = (c) => c.split(/\s+/).filter(Boolean);

// speech edges of the whole take
const first = gaps.length && gaps[0][0] < 0.05 ? gaps[0][1] : 0;
const last = gaps.length && gaps[gaps.length - 1][1] > dur - 0.05 ? gaps[gaps.length - 1][0] : dur;

const words = [];
const pSpans = place(paragraphs.map((p) => sentencesOf(p).flatMap(clausesOf).flatMap(wordsOf)), first, last, 0.45, pins);
const report = [];
paragraphs.forEach((p, pi) => {
  const [pa, pb] = pSpans[pi];
  report.push(`P${pi + 1} ${pa.toFixed(2)}–${pb.toFixed(2)}  ${p.slice(0, 44)}`);
  const sents = sentencesOf(p);
  const sSpans = place(sents.map((s) => clausesOf(s).flatMap(wordsOf)), pa, pb, 0.22);
  sents.forEach((s, si) => {
    const [sa, sb] = sSpans[si];
    const clauses = clausesOf(s);
    const cSpans = place(clauses.map(wordsOf), sa, sb, 0.12);
    clauses.forEach((c, ci) => {
      const [ca, cb] = cSpans[ci];
      const ws = wordsOf(c), wl = ws.map((w) => weight([w])), tw = wl.reduce((x, y) => x + y, 0);
      let acc = 0;
      ws.forEach((w, j) => {
        const st = ca + (acc / tw) * (cb - ca);
        acc += wl[j];
        words.push({ word: w.replace(/^[^\w$]+|[.,?!;:]+$/g, ''), start: +st.toFixed(3), end: +(ca + (acc / tw) * (cb - ca)).toFixed(3) });
      });
    });
  });
});
for (let k = 1; k < words.length; k++) console.assert(words[k].start >= words[k - 1].start - 1e-6, 'cues out of order at ' + words[k].word);

const json = JSON.stringify({ source: 'recording:vo-Charon.wav', precision: 'silence, paragraph > sentence > clause (tools/cues.mjs)', offset: 0, duration: +dur.toFixed(3), words });
const src = fs.readFileSync(html, 'utf8');
const block = /<script type="application\/json" id="om-cues">[\s\S]*?<\/script>/;
if (!block.test(src)) throw new Error('no om-cues block in index.html');
fs.writeFileSync(html, src.replace(block, () => '<script type="application/json" id="om-cues">' + json + '</script>'));
fs.writeFileSync(path.join(film, 'assets', 'voice.words.json'), JSON.stringify({ source: 'recording:vo-Charon.wav', precision: 'silence-hierarchical', offset: 0, duration: +dur.toFixed(3), words }, null, 1) + '\n');
console.log(report.join('\n'));
console.log(words.map((w) => w.word + '@' + w.start.toFixed(2)).join(' '));
