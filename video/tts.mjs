#!/usr/bin/env node
// Voice-over for the demo: one audio file per beat from video/script.md.
// Gemini TTS when GOOGLE_API_KEY or GEMINI_API_KEY is set (model id below must be verified before a live run);
// otherwise, or on any error, the macOS `say` voice. Output: video/vo/beat-N.wav (+ .txt with the words).
// Usage: node video/tts.mjs [--say]   (--say forces the fallback)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "video", "vo");
const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts"; // listed by the models endpoint on 2026-11-10
const VOICE = "Kore";
const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

mkdirSync(OUT, { recursive: true });

const script = readFileSync(join(ROOT, "video", "script.md"), "utf8");
// Rows of the beat table: | time | beat | screen | voice-over |
const beats = script
  .split("\n")
  .filter((l) => /^\|\s*\d+[–-]\d+\s*s/.test(l))
  .map((l) => l.split("|").map((c) => c.trim()))
  .map((cells, i) => ({ n: i + 1, time: cells[1], beat: cells[2], text: cells[4] }));

if (beats.length === 0) throw new Error("No beats found in video/script.md");

async function gemini(text, file) {
  // REST call: the SDK's config shape was rejected by the API on 2026-11-09; the raw endpoint accepts generationConfig.speechConfig.
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_TTS_MODEL + ":generateContent?key=" + KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Speak quickly and clearly with energy and no pauses between sentences, like a confident product narrator with warmth: " + text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 200));
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("No audio in the response");
  const bytes = Buffer.from(part.inlineData.data, "base64");
  const mime = part.inlineData.mimeType || "";
  if (mime.startsWith("audio/wav")) { writeFileSync(file, bytes); return; }
  // raw 16-bit PCM: wrap in a WAV header at the stated rate (default 24 kHz)
  const rate = mime.includes("rate=") ? Number(mime.split("rate=")[1].split(";")[0]) : 24000;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + bytes.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(bytes.length, 40);
  writeFileSync(file, Buffer.concat([header, bytes]));
}

function say(text, file) {
  const aiff = file.replace(/\.wav$/, ".aiff");
  execFileSync("say", ["-v", "Samantha", "-r", "165", "-o", aiff, text]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "24000", "-ac", "1", file]);
}

const forceSay = process.argv.includes("--say");
for (const b of beats) {
  const file = join(OUT, "beat-" + b.n + ".wav");
  writeFileSync(join(OUT, "beat-" + b.n + ".txt"), b.time + " " + b.beat + "\n" + b.text + "\n");
  let how = "say";
  if (!forceSay && KEY) {
    try { await gemini(b.text, file); how = "gemini"; } catch (e) { console.error("beat " + b.n + ": Gemini TTS failed (" + e.message + "); using say"); say(b.text, file); }
  } else {
    say(b.text, file);
  }
  let dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  // Fit the read into its slot (the time column, minus half a second of air) by speeding it up at most 1.3x.
  const m = b.time.match(/(\d+)[–-](\d+)/);
  const budget = m ? Number(m[2]) - Number(m[1]) - 0.5 : dur;
  if (dur > budget) {
    const tempo = Math.min(budget < 10 ? 1.45 : 1.3, dur / budget);
    const fitted = file.replace(/\.wav$/, ".fit.wav");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-filter:a", "atempo=" + tempo.toFixed(3), "-ar", "24000", "-ac", "1", fitted]);
    execFileSync("mv", [fitted, file]);
    dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
    how += " x" + tempo.toFixed(2);
  }
  console.log("beat " + b.n + " (" + b.time + ", budget " + budget + "s) " + how + " " + dur.toFixed(1) + "s" + (dur > budget + 0.2 ? " OVER" : ""));
}
