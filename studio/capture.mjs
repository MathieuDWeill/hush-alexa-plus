// Beat-by-beat studio capture -> one burned-in (DOM) keyframe PNG per beat + timeline.json.
// No drawtext: this ffmpeg lacks libfreetype, so captions are painted in the page and the
// page is screenshotted (crisp, always-in-sync text).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BEATS } from "./beats.mjs";
import { generateVoice } from "./vo.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const W = 1920, H = 1080, URL = process.env.STUDIO_URL ?? `http://localhost:${PORT}`;
const KEY = "studio/out/key";
const OUT = "studio/out";
const TIMELINE = join(OUT, "timeline.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isServed = async () => { try { return (await (await fetch(URL + "/health")).json()).ok; } catch { return false; }; };

// Servers this run started get closed by this run, on success AND on failure (see main()).
async function ensureServer() {
  if (await isServed()) return null;
  if (!existsSync("dist/src/index.js")) throw new Error("dist/src/index.js missing — run `npm run build` first");
  // Non-detached on purpose: the child lands in its OWN process group only via the kill
  // below; a detached -pgid kill here once nuked the whole studio pipeline.
  const child = spawn("node", ["dist/src/index.js"], { stdio: "ignore", env: { ...process.env, PORT: String(PORT) } });
  for (let i = 0; i < 50; i++) { if (await isServed()) return child; await sleep(200); }
  child.kill();
  throw new Error("server never came up on " + URL);
}

// Hard gate: an essential DOM state that never arrives fails the render. It used to warn and
// screenshot anyway, which is how a QUIET ring shipped under a "safety override" line.
async function waitUntil(page, pred, { timeout = 25000, label = "" } = {}) {
  const t0 = Date.now();
  let dbgN = 0;
  while (Date.now() - t0 < timeout) {
    let ok = false;
    let err = "";
    try { ok = await page.evaluate(`(()=>{try{return (${pred});}catch(e){return false;}})()`); } catch (e) { err = String(e.message ?? e); }
    if (ok) return;
    if (process.env.HUSH_DEBUG_WAIT && (dbgN < 6 || dbgN % 40 === 0)) console.log(`    wait[${label}] poll#${dbgN} t=${Date.now() - t0}ms ok=${JSON.stringify(ok)} err=${err}`);
    dbgN++;
    await sleep(120);
  }
  const diag = await page
    .evaluate(() => ({
      url: location.href,
      playSeen: window.__hush?.playSeen,
      playDisabled: document.getElementById("play")?.disabled,
      ready: !!window.__hush?.ready,
      transcript: document.querySelectorAll("#transcript .msg").length,
      ledger: document.querySelectorAll("#ledger li").length,
      errors: (window.__hush?.rpcErrors ?? 0) + (window.__hush?.calls?.length ?? 0) + " calls",
      lastError: window.__hush?.lastError || null,
      ticks: window.__hush?.__ticks,
      visibility: document.visibilityState
    }))
    .catch((e) => ({ diagError: e.message }));
  await page.screenshot({ path: join(KEY, `${label.replace(/[^a-z0-9-]+/gi, "_")}.TIMEOUT.png`), clip: { x: 0, y: 0, width: W, height: H } }).catch(() => {});
  throw new Error(`${label || "state"} never reached within ${timeout}ms: ${pred.slice(0, 140)}\n  page at timeout: ${JSON.stringify(diag)}`);
}

const CAPTION_CSS = "#hush-cap{position:fixed;left:0;right:0;bottom:22px;display:flex;flex-direction:column;gap:8px;align-items:center;z-index:9999;pointer-events:none;font-family:-apple-system,'SF Pro Text',system-ui,sans-serif}#hush-cap div{max-width:1500px;text-align:center;font-weight:700;font-size:30px;line-height:1.28;color:#f4f7ff;background:rgba(6,9,18,.82);border:1px solid rgba(120,150,255,.32);padding:10px 18px;border-radius:14px;text-shadow:0 2px 10px rgba(0,0,0,.6)}#hush-top{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;font-family:-apple-system,system-ui,sans-serif;font-weight:800;font-size:22px;letter-spacing:.4px;color:#e9eeff;background:rgba(6,9,18,.7);border:1px solid rgba(120,150,255,.28);padding:7px 16px;border-radius:999px;pointer-events:none}";
async function captions(page, list, title) {
  await page.evaluate(({ css, cap, title }) => {
    let st = document.getElementById("hush-studio-css");
    if (!st) { st = document.createElement("style"); st.id = "hush-studio-css"; document.head.appendChild(st); }
    st.textContent = css + (title ? "" : "#hush-top{display:none}");
    let bar = document.getElementById("hush-cap");
    if (!bar) { bar = document.createElement("div"); bar.id = "hush-cap"; document.body.appendChild(bar); }
    bar.innerHTML = "";
    cap.forEach((c) => { const d = document.createElement("div"); d.textContent = c; bar.appendChild(d); });
    let t = document.getElementById("hush-top");
    if (title) { if (!t) { t = document.createElement("div"); t.id = "hush-top"; document.body.appendChild(t); } t.textContent = title; }
  }, { css: CAPTION_CSS, cap: list, title: title || "" });
}

async function runBeat(page, b) {
  const a = async (fn, ...args) => page.evaluate(fn, ...args);
  for (const act of b.actions) {
    if (process.env.HUSH_DEBUG_WAIT) console.log(`    beat ${b.id} action ${act}`);
    if (act === "initWeeknight" || act === "loadWeeknight") { await a(() => window.__studio.loadWeeknight()); continue; }
    if (act === "#play") { await a(() => window.__studio.clickPlay()); if (process.env.HUSH_DEBUG_WAIT) console.log("      clickPlay done, state", JSON.stringify(await page.evaluate(() => ({ seen: window.__hush.playSeen, dis: document.getElementById("play").disabled })))); continue; }
    if (act === "playScene") { await a(() => window.__studio.playScene()); continue; }
    if (act === "stopScene") { await a(() => window.__studio.stopScene()); continue; }
    if (act === "captureBedtimeEvidence") { const r = await a(() => window.__studio.captureBedtimeEvidence()); console.log(`    bedtime evidence: ${JSON.stringify(r)}`); continue; }
    if (act === "escalateSchool") { await a(() => window.__studio.escalateSchool()); continue; }
    if (act.startsWith("evaluate:")) { await a((id) => window.__studio.evaluate(id), act.slice(9)); continue; }
    if (act.startsWith("replay:")) { await a((id) => window.__studio.replay(id), act.slice(7)); continue; }
    if (act === "scrollTranscript") { await a(() => window.__studio.scrollTranscript()); continue; }
    if (act === "scrollLedger") { await a(() => window.__studio.scrollLedger()); continue; }
    if (act === "restoreWeeknight") { await a(() => window.__studio.restoreWeeknight()); continue; }
    if (act === "closingShot") { const ok = await a(() => window.__studio.closingShot()); if (!ok) throw new Error("closing shot (play the scene, then Reset take) did not complete"); continue; }
    if (act === "probePlate") { await a(() => window.__studio.probePlate()); continue; }
    if (act === "awaitSchool") { await waitUntil(page, "window.__hush?.rewrittenEvent === 'evt-school' || document.querySelector('#ledger li[data-event=\"evt-school\"]') !== null", { timeout: 9000, label: "school row" }); continue; }
    if (act.startsWith("clickLedgerRow:")) {
      const t = act.split(":")[1];
      const lab = t === "swim" ? "Swimming kit" : t;
      const opened = await a((l) => window.__studio.openFactors(l), lab);
      if (!opened) throw new Error(`ledger row "${lab}" did not open its factors`);
      continue;
    }
    if (act.startsWith("selectScenario:")) {
      const r = await a(() => Promise.race([
        window.__studio.bedtime().then((routes) => "routes:" + routes.join(",")).catch((e) => "THREW: " + e.message),
        new Promise((res) => setTimeout(() => res("HUNG >15s"), 15000))
      ]));
      console.log(`    bedtime() -> ${r} | state ${JSON.stringify(await page.evaluate(() => ({ bd: window.__hush.bedtimeDone, sig: window.__hush.sigSeen, ledger: document.querySelectorAll("#ledger li").length, err: window.__hush.lastError })))}`);
      continue;
    }
    if (act === "digestSelf") { await a(() => window.__studio.digest()); continue; }
    if (act === "resetQuiet") { await a(() => window.__studio.resetQuiet()); continue; }
    throw new Error(`unknown studio action "${act}" in beat ${b.id}`);
  }
}

// Beat 12b is a plate of the REAL `npm run probe` output, captured fresh for this run. If the
// shipped probe stops containing what the narration claims (13 tools, the 3-signal weeknight
// digest, the bedtime route table), the render fails instead of airbrushing a stale terminal.
async function captureProbe() {
  mkdirSync(OUT, { recursive: true });
  let txt = await execFileSync("bash", ["scripts/mcp-probe.sh"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: { ...process.env, BASE_URL: URL } });
  if (typeof txt !== "string") txt = String(txt);
  writeFileSync(join(OUT, "probe.txt"), txt);
  const checks = [/13 tools/, /hush:\/\/quiet-queue/, /three_minute_demo/, /I held 3 things/, /"hold_for_digest":3/, /== bedtime/];
  for (const re of checks) if (!re.test(txt)) throw new Error(`npm run probe output missing /${re.source}/ — not capturing a plate that would lie`);
  if (/No Mcp-Session-Id header/.test(txt)) throw new Error("probe did not reach a live MCP endpoint — refusing to plate it");
  return txt;
}

// The checklist gate: countable claims from beats.mjs must be TRUE in the rendered DOM before
// the screenshot, not just promised in the caption. Thrown strings are collected into one
// failure so a single run reports every broken beat.
const VERIFY = {
  "02-what": `(document.querySelectorAll('.hush-chip span').length === 4 && ['speak_now','whisper_display','hold_for_digest','silent_log'].every(w => [...document.querySelectorAll('.hush-chip span')].some(s => s.textContent === w))) || 'four route chips must be painted large'`,
  "07-smoke": `(() => { const t = document.getElementById('transcript'); const msgs = [...t.querySelectorAll('.msg.speak_now')]; const last = msgs.at(-1); const ring = document.getElementById('ring'); return (ring.dataset.label === 'speaking' && last && /smoke detector just tripped/.test(last.querySelector('.body').textContent) && /safety override/.test(last.querySelector('.body').textContent) && parseInt(document.getElementById('queue-count').textContent, 10) === 3) || 'smoke speak_now line must be LAST with ring=speaking and queue=3'; })()`,
  // The pill is CSS-generated (::after) and the score is an attribute mirror — computed style
  // and dataset are the ONLY truth a judge's pixels can be checked against.
  "08-escalation": `(() => { const lis = [...document.querySelectorAll('#ledger li')]; const li = lis.find(x => x.querySelector('.label')?.textContent === 'Swimming kit due Friday'); if (!li) return 'no Swimming kit row in the ledger'; const badge = li.querySelector('.badge'); const s = li.querySelector('s'); const score = li.querySelector('.score')?.dataset.score || ''; const pill = getComputedStyle(li.querySelector('.meta'), '::after').content || ''; return (li.classList.contains('rewritten') && badge?.textContent.trim() === 'speak now' && s?.textContent.includes('hold for digest') && /verdict updated/i.test(pill) && /net 24$/.test(score) && parseInt(document.getElementById('queue-count').textContent, 10) === 2) || 'Swimming kit row must show speak now badge + struck hold for digest + verdict updated pill + net 24 + queue 2'; })()`,
  "09-digest": `(() => { const bodies = [...document.querySelectorAll('#transcript .body')].map(x => x.textContent).join(' '); const m = bodies.match(/I held (\\d+) thing/); const n = parseInt(document.getElementById('queue-count').textContent, 10); return (m && m[1] === '2' && n === 0) || 'digest must say it held 2 things and the queue must read 0'; })()`,
  "10-audit": `(() => { const items = [...document.querySelectorAll('#ledger li[data-open="1"] ul.factors li')]; const txt = items.map(i => i.textContent).join(' | '); return (items.length >= 5 && /urgency/i.test(txt) && /relevance/i.test(txt) && /freshness/i.test(txt) && /scene/i.test(txt) && /focus/i.test(txt)) || 'audit factors (urgency/relevance/freshness/scene/focus) must be rendered'; })()`,
  "11-bedtime": `(() => { const badges = [...document.querySelectorAll('#ledger .badge')]; return (badges.length >= 4 && badges.every(b => !b.className.includes('speak_now'))) || 'bedtime table must have >=4 routes and zero speak_now'; })()`,
  "12-mcp": `(() => { const e = window.__studio.evidence(); return (e.consoleLines > 20 && e.msgs >= 8 && e.rpcErrors === 0 && e.digestN !== null) || 'console must show the fresh scene traffic (>20 lines, digest typed, zero MCP errors)'; })()`,
  "12b-terminal": `document.getElementById('hush-probe')?.dataset.ok === '1' || (document.getElementById('hush-probe')?.dataset.okMessage || 'probe plate missing')`,
  "13-close": `(() => { const r = document.getElementById('ring'); const rows = document.querySelectorAll('#ledger li').length; return (r.dataset.label === 'quiet' && rows === 8) || 'closing ring must be quiet over a full 8-row weeknight ledger'; })()`
};

async function main() {
  // Server first: scripts/mcp-probe.sh talks to a LIVE endpoint, so ensureServer() must run
  // BEFORE captureProbe(). The probe's stdout stays in memory (execFileSync) and is the only
  // text ever plated — a file written after the server was serving the out/ directory was
  // never re-read here, which is what once turned the terminal plate into "[object Object]".
  // --skip-probe keeps that contract for quick re-shoots by reusing the last probe.txt.
  const server = await ensureServer();
  let failed = null;
  let browser = null;
  const timeline = [];
  try {
    const probeText = process.argv.slice(2).includes("--skip-probe")
      ? (existsSync(join(OUT, "probe.txt")) ? readFileSync(join(OUT, "probe.txt"), "utf8") : null)
      : await captureProbe();
    if (!probeText) throw new Error("studio/out/probe.txt missing — drop --skip-probe or run npm run probe > studio/out/probe.txt");
    if (typeof probeText !== "string") throw new Error("probe text is " + Object.prototype.toString.call(probeText) + ", not a string — refusing to plate it");
    mkdirSync(KEY, { recursive: true });
    const vo = await generateVoice({ log: () => {} });
    const dur = Object.fromEntries(vo.map((v) => [v.id, v.seconds]));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.addInitScript({ path: "studio/instrument.mjs" });
    await page.goto(URL, { waitUntil: "networkidle" });
    await waitUntil(page, "window.__hush?.ready===true && document.querySelector('#session-pill')?.classList.contains('live')", { timeout: 15000, label: "page boot" });
    await page.evaluate(() => window.__studio.ensureSession());
    await page.evaluate((text) => { window.__probeText = text; }, probeText);
    await page.evaluate(() => window.__studio.loadWeeknight());
    await sleep(400);

    for (const b of BEATS) {
      await runBeat(page, b);
      // reveal BEFORE waiting: the paint (beat 02's four-route overlay) is what the wait
      // checks for. It stays on screen through the screenshot, so it can run early.
      if (b.reveal) {
        const painted = await page.evaluate(`(()=>{try{return (${b.reveal});}catch(e){return 'reveal threw: ' + e.message;}})()`);
        if (!painted) throw new Error(`beat ${b.id} reveal did not paint its overlay (${painted === false ? "returned falsy" : painted})`);
      }
      await waitUntil(page, b.ready, { timeout: b.timeout || 25000, label: `beat ${b.id} ready` });
      await sleep(260);
      if (b.ready) {
        const settled = await page.evaluate(`(()=>{try{return (${b.ready});}catch(e){return 'threw: ' + e.message;}})()`);
        if (!settled) throw new Error(`beat ${b.id} state regressed before the shot (${settled}) — ready was reached then lost`);
      }
      const problem = VERIFY[b.id] ? await page.evaluate(`(()=>{try{const r=(${VERIFY[b.id]});return r===true?'':'FAILED: '+(typeof r==='string'?r:'predicate falsy');}catch(e){return 'THREW: '+e.message;}})()`) : "";
      if (problem) {
        await captions(page, b.captions || [], b.title || "").catch(() => {});
        await page.screenshot({ path: join(KEY, `${b.id}.FAILED.png`), clip: { x: 0, y: 0, width: W, height: H } }).catch(() => {});
        throw new Error(`beat ${b.id} verification: ${problem}`);
      }
      await page.addStyleTag({ content: "#hush-studio-css{}*{cursor:none !important}" }).catch(() => {});
      await captions(page, b.captions || [], b.title || "");
      const shot = await page.evaluate(() => { const bar = document.getElementById('hush-cap'); const kids = [...(bar?.children ?? [])]; return { overflow: bar ? (bar.scrollHeight - bar.clientHeight) : 0, clipped: kids.some(k => k.scrollWidth > k.clientWidth + 1), wide: kids.map(k => k.scrollWidth).join(',') }; });
      if (shot.overflow > 1 || shot.clipped) throw new Error(`beat ${b.id} captions would be truncated (overflow=${shot.overflow}px, widths=${shot.wide} vs max 1500) — shorten them, the shot must never show a cut sentence`);
      const png = join(KEY, `${b.id}.png`);
      await page.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } });
      const h = await page.evaluate(() => ({ sig: window.__hush.sigSeen, spk: window.__hush.speakPeak, rw: !!window.__hush.rewrittenEvent, dg: window.__hush.digestSeen, bt: window.__hush.bedtimeDone, smk: !!window.__hush.smoke, q: window.__hush.queueNow, qc: window.__hush.digestCount, n: (window.__hush.calls || []).length }));
      console.log(`key ${b.id.padEnd(14)} ${dur[b.id].toFixed(1)}s  sig=${h.sig} spk=${h.spk} rw=${h.rw} dg=${h.dg} bt=${h.bt} smoke=${h.smk} queue=${h.q} digestN=${h.qc} calls=${h.n}`);
      timeline.push({ id: b.id, png, seconds: dur[b.id], captions: b.captions || [], vo: b.vo, audio: join("studio/out/vo", `${b.id}.mp3`) });
    }
  } catch (error) {
    failed = error;
  } finally {
    if (timeline.length) writeFileSync(TIMELINE, JSON.stringify(timeline, null, 2));
    // Close every resource THIS run created, on every path: browser first, then the server.
    // A server that was already up was never ours: ensureServer() returns null and stays open.
    if (browser) await browser.close().catch(() => {});
    if (server) { try { server.kill("SIGKILL"); } catch {} }
  }
  if (failed) throw failed;
  console.log("total:", timeline.reduce((x, y) => x + y.seconds, 0).toFixed(1), "s");
  console.log(`timeline: ${TIMELINE} (${timeline.length} beats) · probe: ${join(OUT, "probe.txt")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
