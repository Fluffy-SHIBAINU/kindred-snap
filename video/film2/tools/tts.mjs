#!/usr/bin/env node
// Founder narration for film v2: the whole script (tools/narration.txt, verbatim) as ONE Gemini TTS request per
// voice, so the pacing is continuous. Writes assets/vo-<voice>.wav (24 kHz mono) and prints each duration.
// Usage: node video/film2/tools/tts.mjs [Charon Puck Fenrir]   (GOOGLE_API_KEY or GEMINI_API_KEY in the env)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL(".", import.meta.url).pathname;
const FILM = join(HERE, "..");
const MODEL = "gemini-3.8-flash-tts";
const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GOOGLE_API_KEY or GEMINI_API_KEY is not set");

const voices = process.argv.slice(2).length ? process.argv.slice(2) : ["Charon", "Puck", "Fenrir"];
const script = readFileSync(join(HERE, "narration.txt"), "utf8").trim();
const STYLE = "Speak as a founder talking plainly and warmly to a friend, at a natural, unhurried pace, with a short pause between paragraphs:\n\n";

function wavFrom(bytes, mime) {
  if (mime.startsWith("audio/wav")) return bytes;
  const rate = mime.includes("rate=") ? Number(mime.split("rate=")[1].split(";")[0]) : 24000;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + bytes.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([h, bytes]);
}

async function speak(voice, file) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: STYLE + script }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 300));
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("no audio in the response: " + JSON.stringify(data).slice(0, 300));
  writeFileSync(file, wavFrom(Buffer.from(part.inlineData.data, "base64"), part.inlineData.mimeType || ""));
}

mkdirSync(join(FILM, "assets"), { recursive: true });
for (const voice of voices) {
  const file = join(FILM, "assets", "vo-" + voice + ".wav");
  try {
    await speak(voice, file);
    const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
    console.log(voice + ": " + Number(dur).toFixed(1) + " s -> " + file);
  } catch (e) {
    console.error(voice + ": failed (" + e.message + ")");
  }
}
