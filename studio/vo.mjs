// Voice generation for the studio: one mp3 per beat + sentence-split caption cues.
// Backends, in priority order:
//   1. edge-tts (Microsoft neural voices) — best quality; needs the WSS synth endpoint.
//   2. gttts (Google Translate read-aloud) — plain HTTPS; used when edge-tts is banned.
// Durations are always measured with ffprobe so the montage math is exact.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BEATS } from "./beats.mjs";

const OUT = "studio/out/vo";
const EDGE_PY = ".venv-studio/bin/edge-tts";
export const EDGE_VOICE = "fr-FR-HenriNeural";
export const EDGE_RATE = "+8%";
export const GT_LANG = "fr";
let chosen = null; // resolved once

export function ensureDirs() {
  // Every directory the pipeline writes to (capture's keyframes + probe.txt included), so a
  // fresh clone needs no manual mkdir before npm run studio:video.
  for (const d of [OUT, "studio/out", "studio/out/key", "studio/out/seg", "studio/out/tmp"]) mkdirSync(d, { recursive: true });
}

export function ffprobeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat(out.trim());
}

// Split French narration into caption fragments (<= ~52 chars) on punctuation + breath marks.
export function splitSentences(text) {
  return text
    .split(/(?<=[.;:!?…])\s+|(?<= - )/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function which() {
  if (chosen) return chosen;
  try {
    execFileSync(EDGE_PY, ["--voice", EDGE_VOICE, "--text", "ping", "--write-media", "/tmp/hush-edge-probe.mp3"], { stdio: "pipe", timeout: 25000 });
    const sz = existsSync("/tmp/hush-edge-probe.mp3") ? readFileSync("/tmp/hush-edge-probe.mp3").length : 0;
    chosen = sz > 500 ? "edge" : "gtts";
  } catch {
    chosen = "gtts";
  }
  return chosen;
}

function synthEdge(text, file) {
  execFileSync(EDGE_PY, ["--voice", EDGE_VOICE, "--rate", EDGE_RATE, "--text", text, "--write-media", file], { stdio: "pipe", timeout: 60000 });
}

function synthGtts(text, file) {
  // Google read-aloud caps request length; chunk and concatenate via ffmpeg concat.
  const chunks = chunkText(text, 95);
  const parts = [];
  const tmp = `${file}.parts`;
  mkdirSync(tmp, { recursive: true });
  const abs = (p) => join(process.cwd(), p);
  chunks.forEach((c, i) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${GT_LANG}&client=tw-ob&total=${chunks.length}&idx=${i}&textlen=${c.length}&q=${encodeURIComponent(c)}`;
    const pf = abs(join(tmp, `p${String(i).padStart(3, "0")}.mp3`));
    execFileSync("curl", ["-s", "--fail", "--max-time", "30", "-A", "Mozilla/5.0", "-o", pf, url], { stdio: "pipe" });
    parts.push(pf);
  });
  const list = join(tmp, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-q:a", "4", file], { stdio: "pipe" });
}

function chunkText(text, max) {
  const words = text.split(/\s+/);
  const out = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) { out.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}

export async function generateVoice({ force = false, log = console.log } = {}) {
  ensureDirs();
  const backend = which();
  log(`voice backend: ${backend}${backend === "edge" ? ` (${EDGE_VOICE})` : ` (Google ${GT_LANG} read-aloud)`}`);
  const results = [];
  for (const beat of BEATS) {
    const mp3 = join(OUT, `${beat.id}.mp3`);
    if (!force && existsSync(mp3) && readFileSync(mp3).length > 500) {
      log(`vo cached ${beat.id}`);
    } else {
      (backend === "edge" ? synthEdge : synthGtts)(beat.vo, mp3);
      log(`vo wrote   ${beat.id} ${ffprobeDuration(mp3).toFixed(2)}s`);
    }
    results.push({ id: beat.id, file: mp3, backend, seconds: ffprobeDuration(mp3), cues: splitSentences(beat.vo) });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes("--force");
  const data = await generateVoice({ force });
  writeFileSync("studio/out/vo.json", JSON.stringify(data, null, 2));
  console.log("total audio:", data.reduce((a, b) => a + b.seconds, 0).toFixed(1), "s across", data.length, "beats");
}
