// Word cues aligned per narration beat. `om voice` without Whisper guesses sentence edges from silence
// across the whole 92 s track and drifts by seconds; here each beat is aligned alone: phrases (split at
// . , : ;) are spread over the beat's speech by length, each phrase edge snapped to the nearest real
// pause, words spread inside a phrase by length, then shifted by where build-narration.sh placed the beat.
// shortcut: length-weighted, not ASR; good to ~0.2 s at phrase edges. Upgrade: om voice --asr on (490 MB model).
// usage: node video/film/tools/cues.mjs   (after sh video/film/tools/build-narration.sh)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const film = path.join(here, '..');
const vo = path.join(film, '..', 'vo');

const probe = (wav) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString());

function align(wav, text) {
  const dur = probe(wav);
  const log = spawnSync('ffmpeg', ['-v', 'info', '-i', wav, '-af', 'silencedetect=n=-38dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const gaps = [];
  const re = /silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g;
  let m;
  while ((m = re.exec(log))) gaps.push([+m[1], +m[2]]);
  let s0 = 0, s1 = dur;
  if (gaps.length && gaps[0][0] < 0.05) s0 = gaps.shift()[1];
  if (gaps.length && gaps[gaps.length - 1][1] > dur - 0.05) s1 = gaps.pop()[0];
  const phrases = text.split(/(?<=[.,:;!?])\s+/).map((p) => p.trim()).filter(Boolean);
  const weight = (p) => p.replace(/[^A-Za-z0-9]/g, '').length + 2;
  const total = phrases.reduce((a, p) => a + weight(p), 0);
  const bounds = []; // [end of phrase k, start of phrase k+1]
  let cum = 0, used = -1;
  for (let k = 0; k < phrases.length - 1; k++) {
    cum += weight(phrases[k]);
    const floor = (bounds.length ? bounds[bounds.length - 1][1] : s0) + 0.25;
    const t = Math.max(floor, s0 + (cum / total) * (s1 - s0));
    let best = -1;
    for (let g = used + 1; g < gaps.length; g++) {
      const mid = (gaps[g][0] + gaps[g][1]) / 2;
      if (gaps[g][0] >= floor && Math.abs(mid - t) < 1.2 && (best < 0 || Math.abs(mid - t) < Math.abs((gaps[best][0] + gaps[best][1]) / 2 - t))) best = g;
    }
    if (best >= 0) { bounds.push([gaps[best][0], gaps[best][1]]); used = best; } else bounds.push([t, t]);
  }
  const words = [];
  phrases.forEach((p, k) => {
    const a = k === 0 ? s0 : bounds[k - 1][1];
    const b = k === phrases.length - 1 ? s1 : bounds[k][0];
    const ws = p.split(/\s+/);
    const wl = ws.map((w) => w.replace(/[^A-Za-z0-9]/g, '').length + 1);
    const tw = wl.reduce((x, y) => x + y, 0);
    let c = 0;
    ws.forEach((w, j) => {
      const st = a + (c / tw) * (b - a);
      c += wl[j];
      words.push({ word: w.replace(/[.,:;!?]+$/, ''), start: st, end: a + (c / tw) * (b - a) });
    });
  });
  return words;
}

const place = fs.readFileSync(path.join(here, 'placement.txt'), 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
const words = [];
for (const [i, at, tempo] of place) {
  const text = fs.readFileSync(path.join(vo, 'beat-' + i + '.txt'), 'utf8').split('\n').slice(1).join(' ').trim();
  for (const w of align(path.join(vo, 'beat-' + i + '.wav'), text)) {
    words.push({ word: w.word, start: +(at + w.start / tempo).toFixed(3), end: +(at + w.end / tempo).toFixed(3) });
  }
}
for (let k = 1; k < words.length; k++) console.assert(words[k].start >= words[k - 1].start, 'cues out of order at ' + words[k].word);

const json = JSON.stringify({ source: 'recording:narration.wav', precision: 'phrase-per-beat', offset: 0, duration: 92, words });
const html = path.join(film, 'index.html');
const src = fs.readFileSync(html, 'utf8');
const block = /<script type="application\/json" id="om-cues">[\s\S]*?<\/script>/;
if (!block.test(src)) throw new Error('no om-cues block in index.html');
fs.writeFileSync(html, src.replace(block, () => '<script type="application/json" id="om-cues">' + json + '</script>'));
fs.writeFileSync(path.join(film, 'assets', 'voice.words.json'), JSON.stringify({ words }, null, 1));
console.log(words.map((w) => w.word + '@' + w.start.toFixed(2)).join(' '));
