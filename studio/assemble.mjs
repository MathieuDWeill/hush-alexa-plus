// Assemble the demo mp4 from per-beat keyframes + voice, with rubberband time-compression.
// Two passes so each segment's video lasts EXACTLY its (compressed) audio:
//   P1 compress audio to a WAV, measure. P2 make segment (PNG looped to audio duration). P3 concat.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { generateVoice } from "./vo.mjs";
import { BEATS } from "./beats.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const KEY = "studio/out/key", SEG = "studio/out/seg", TMP = "studio/out/tmp";
const OUT = "submissions/hush-alexa-plus-demo.mp4";
const PAD = 0.35; // tail silence per beat (breath between lines)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ff(a) { return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "pipe" }); }
function rb(a) {
  try { return execFileSync("rubberband", ["-q", ...a], { stdio: "pipe" }); }
  catch (e) {
    if (e.code === "ENOENT") throw new Error("rubberband binary not found — install it first: `brew install rubberband` (macOS) or `apt-get install rubberband-cli` (Linux). Without it the audio cannot be time-compressed.");
    throw e;
  }
}
function probe(f) { return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim()); }
async function ensureServer() {
  const health = `http://localhost:${PORT}/health`;
  try { if ((await (await fetch(health)).json()).ok) return null; } catch {}
  const p = spawn("node", ["dist/src/index.js"], { stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
  for (let i = 0; i < 50; i++) { try { if ((await (await fetch(health)).json()).ok) return p; } catch {} await sleep(200); }
  return p;
}
// studio/out/ is gitignored, so timeline.json can be deleted (or never created on a fresh
// clone). Its fields are pure metadata over beats.mjs + measured vo, so rebuild them here —
// but ONLY when the keyframe PNGs capture.mjs produced are all on disk. Missing PNGs stay a
// hard error: assemble must never invent frames.
function loadTimeline() {
  const file = "studio/out/timeline.json";
  let timeline = null;
  if (existsSync(file)) {
    try { timeline = JSON.parse(readFileSync(file, "utf8")); } catch { timeline = null; }
  }
  const ids = BEATS.map((b) => b.id);
  const fresh = !timeline || !Array.isArray(timeline) || timeline.length !== ids.length || timeline.some((t, i) => t.id !== ids[i]);
  if (!fresh) {
    for (const t of timeline) if (!existsSync(t.png)) throw new Error(`keyframe missing: ${t.png} — run npm run studio:capture (assemble cannot invent frames)`);
    return timeline;
  }
  console.log("timeline.json missing or stale — rebuilding metadata from beats.mjs + measured vo");
  const rebuilt = [];
  for (const b of BEATS) {
    const png = join("studio/out/key", `${b.id}.png`);
    if (!existsSync(png)) throw new Error(`keyframe missing: ${png} — run npm run studio:capture (assemble cannot invent frames)`);
    const audio = join("studio/out/vo", `${b.id}.mp3`);
    if (!existsSync(audio)) throw new Error(`voice missing: ${audio} — run npm run studio:voice`);
    rebuilt.push({ id: b.id, png, seconds: probe(audio), captions: b.captions || [], vo: b.vo, audio });
  }
  writeFileSync(file, JSON.stringify(rebuilt, null, 2));
  console.log(`timeline.json rebuilt (${rebuilt.length} beats)`);
  return rebuilt;
}
async function main() {
  // Default matches the validated cut: raw narration is ~234s of time-compressed speech, so
  // SPEED=1 would already blow the 3:00 cap (234 + 14 x 0.35s pads = 239s). 1.46 is the speed
  // used for every accepted MP4 and lands the video at ~164s. Override with SPEED=... to
  // re-cut timing alone; the < 180s gate below still fails the run if the result is too long.
  const speed = Math.max(1, parseFloat(process.env.SPEED || "1.46"));
  mkdirSync(SEG, { recursive: true }); mkdirSync(TMP, { recursive: true });
  const timeline = loadTimeline();
  const server = await ensureServer();
  serverRef = server;
  // P1: compress each beat's audio (rubberband only when speed>1), then measure.
  const audioFile = {}, audioDur = {};
  for (const t of timeline) {
    const src = join("studio/out/vo", `${t.id}.mp3`);
    if (speed === 1) { audioFile[t.id] = src; audioDur[t.id] = probe(src); }
    else {
      const w1 = join(TMP, `${t.id}.in.wav`), w2 = join(TMP, `${t.id}.rb.wav`);
      ff(["-i", src, "-ac", "1", "-ar", "48000", w1]);
      rb(["-T", speed.toFixed(3), w1, w2]);
      audioFile[t.id] = w2; audioDur[t.id] = probe(w2);
    }
  }
  // P2: build one clean segment per beat (video = PNG held for audio+PAD).
  const segs = [];
  for (const t of timeline) {
    const png = join(KEY, `${t.id}.png`);
    if (!existsSync(png)) throw new Error("missing keyframe " + png + " — run capture first");
    const clip = audioDur[t.id] + PAD;
    const out = join(SEG, `${t.id}.m4v.mp4`);
    ff(["-framerate", "1", "-loop", "1", "-i", png, "-i", audioFile[t.id],
        "-vf", "scale=1920:1080,format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", "30", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", clip.toFixed(3), out]);
    segs.push({ id: t.id, file: out });
    console.log(`seg ${t.id.padEnd(14)} ${probe(out).toFixed(2)}s`);
  }
  // P3: concat
  const list = join(TMP, "concat.txt");
  writeFileSync(list, segs.map((s) => `file '${join(process.cwd(), s.file)}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", OUT]);
  const total = probe(OUT);
  const m = Math.floor(total / 60), s = Math.round(total % 60);
  const mb = statSync(OUT).size / 1e6;
  console.log(`\nVIDEO ${OUT}  ${total.toFixed(1)}s (${m}:${String(s).padStart(2, "0")})  ${mb.toFixed(1)} MB  speed=${speed}`);
  return total;
}
let serverRef = null;
async function run() {
  try {
    const total = await main();
    if (total >= 180) throw new Error(`video is ${total.toFixed(1)}s — the hackathon cap is 3:00; raise SPEED or shorten narration`);
  } finally {
    // A server assemble() started is always closed, on every path. One that was already up
    // belongs to the developer (npm run dev) and stays open.
    if (serverRef) { try { serverRef.kill(); } catch {} }
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
