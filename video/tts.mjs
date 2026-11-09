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
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"; // verify against https://ai.google.dev/gemini-api/docs/speech-generation before a live run
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
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: KEY });
  const res = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: "user", parts: [{ text: "Read this calmly and plainly, as a family member would: " + text }] }],
    config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("No audio in the response");
  // Gemini returns 16-bit PCM at 24 kHz, mono; wrap it in a WAV header.
  const pcm = Buffer.from(part.inlineData.data, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(24000 * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([header, pcm]));
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
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
  console.log("beat " + b.n + " (" + b.time + ") " + how + " " + Number(dur).toFixed(1) + "s");
}
