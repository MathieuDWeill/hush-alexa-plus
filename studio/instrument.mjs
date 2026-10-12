// Studio instrumentation, injected via addInitScript (so window.fetch is wrapped before
// the page's own connect()) and idempotent so a re-inject after navigation is safe.
// Two jobs:
//   __hush  = passive DOM observers (speak steps, escalation rewrite, digest)
//   __studio = MCP driver that mirrors public/app.js + a self-contained renderer
(function () {
  if (window.__hush && window.__hush.ready) return;

  const H = window.__hush = {
    playSeen: false, sigSeen: 0, speakPeak: 0, speakNow: 0, spoken: [],
    rewrittenEvent: null, digestSeen: false, bedtimeDone: false, ready: false,
    smoke: null, smokeSpoken: 0, queuePeak: 0, queueNow: 0, digestCount: -1,
    calls: [], rpcErrors: 0
  };

  // ---- fetch wrapper: capture the app's MCP session id (runs before app connect) ----
  (function () {
    const orig = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const res = await orig(input, init);
      try {
        if (typeof input === "string" && input.endsWith("/mcp")) {
          const hs = res.headers && res.headers.get && res.headers.get("mcp-session-id");
          if (hs) window.__hushSessionId = hs;
        }
      } catch {}
      return res;
    };
  })();

  // ---- periodic DOM probe (robust regardless of when this script attaches) ----
  // HUSH_AUTOLOAD gates it: the page's own "Play the scene" arc would otherwise keep pushing
  // counters (speakPeak, digestCount, queuePeak) toward the FINAL scene state while the studio
  // is still freezing MIDDLE beats. capture.mjs runs the page with it off and uses
  // __studio.playScene() when it wants the page to drive.
  window.__hush.__ticks = 0;
  setInterval(() => {
    window.__hush.__ticks++;
    if (window.HUSH_AUTOLOAD === "0") return;
    if (document.getElementById("play") && document.getElementById("play").disabled) H.playSeen = true;
    const lis = [...document.querySelectorAll("#ledger li")];
    H.sigSeen = Math.max(H.sigSeen, lis.length);
    const rw = lis.find((li) => li.classList.contains("rewritten"));
    if (rw) {
      H.rewrittenEvent = rw.dataset.event || H.rewrittenEvent;
      const lab = rw.querySelector(".label");
      if (lab) H.rewrittenLabel = lab.textContent;
    }
    const tr = document.getElementById("transcript");
    if (tr) {
      const speaks = [...tr.querySelectorAll(".msg.speak_now")].length;
      if (speaks > H.speakNow) { H.speakNow = speaks; H.speakPeak = Math.max(H.speakPeak, speaks); }
      // The smoke shot must be provably on screen: only the engine's own spoken sentence
      // counts, never a studio echo. So scan transcript bodies, not __studio.narrate().
      if (/smoke detector just tripped/i.test([...tr.querySelectorAll(".msg.speak_now .body")].map((x) => x.textContent).join(" "))) H.smokeSpoken = 1;
      const bodies = [...tr.querySelectorAll(".body")].map((x) => x.textContent).join(" \u0001 ");
      if (/kept quiet|Here is what I kept|natural break|arrive[sd]? as one|one digest|batch/i.test(bodies)) H.digestSeen = true;
    }
    // Queue depth is the only number the digest narration is allowed to repeat.
    const qc = parseInt(document.getElementById("queue-count")?.textContent ?? "", 10);
    if (Number.isFinite(qc)) {
      H.queueNow = qc;
      if (qc > H.queuePeak) H.queuePeak = qc;
      const m = [...document.querySelectorAll("#transcript .body")].map((x) => x.textContent).join(" ").match(/I held (\d+) thing/);
      if (m) H.digestCount = parseInt(m[1], 10);
    }
  }, 110);

  // ---- MCP driver ----
  let sessionId = null, nextId = 1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function rpc(method, params, notify) {
    const sid = sessionId || window.__hushSessionId || null;
    const msg = { jsonrpc: "2.0", method };
    if (!notify) msg.id = nextId++;
    if (params !== undefined) msg.params = params;
    // Log it the way app.js does: the console panel is the "this is a real MCP client" shot,
    // so calls the studio driver makes itself must be on it too.
    const started = performance.now();
    const line = `[${new Date().toLocaleTimeString()}] ${method} ${params && Object.keys(params).length ? JSON.stringify(params).slice(0, 88) : ""} \u2026`;
    const entry = document.createElement("div");
    entry.textContent = line;
    H.calls.push(method);
    const logEl = document.getElementById("console-log");
    if (logEl) {
      logEl.prepend(entry);
      
    }
    try {
      const res = await fetch("/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(sid ? { "Mcp-Session-Id": sid } : {}) },
        body: JSON.stringify(msg)
      });
      const hs = res.headers.get("mcp-session-id"); if (hs) { sessionId = hs; window.__hushSessionId = hs; }
      const raw = await res.text();
      let payload = null;
      if (raw.trim()) { try { payload = JSON.parse(raw); } catch { throw new Error("unreadable MCP response"); } }
      if (payload && payload.error) throw new Error(payload.error.message);
      entry.textContent = line.replace("\u2026", `(${Math.round(performance.now() - started)}ms)`);
      return payload && payload.result;
    } catch (error) {
      H.rpcErrors += 1;
      if (entry.isConnected) entry.className = "err";
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${method} \u2014 ERROR ${error.message}`;
      throw error;
    }
  }
  const unwrap = (r) => (r && r.structuredContent) || (r && r.content && r.content[0] && r.content[0].text ? JSON.parse(r.content[0].text) : r);
  async function tool(name, args) { return unwrap(await rpc("tools/call", { name, arguments: args || {} })); }
  async function ensureSession() {
    if (window.__hushSessionId) { sessionId = window.__hushSessionId; return sessionId; }
    await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "hush-studio", version: "0.2.0" } });
    await rpc("notifications/initialized", {}, true);
    return sessionId;
  }
  const snapshot = async () => JSON.parse((await rpc("resources/read", { uri: "hush://home/context" })).contents[0].text);

  // ---- renderers (mirror app.js) ----
  const ROUTE = {
    speak_now: { ring: "speaking", label: "speaking", state: "voice on the household surfaces" },
    whisper_display: { ring: "whispering", label: "screen only", state: "no voice - a card on one surface" },
    hold_for_digest: { ring: "holding", label: "held", state: "silent - waiting for a natural break" },
    silent_log: { ring: "", label: "quiet", state: "handled by the home, nobody interrupted" }
  };
  function setDevice(route) {
    const c = ROUTE[route] || ROUTE.silent_log;
    const ring = document.getElementById("ring"); if (!ring) return;
    ring.className = "ring " + c.ring; ring.dataset.label = c.label; ring.textContent = c.label;
    const ds = document.getElementById("device-state"); if (ds) ds.textContent = c.state;
  }
  function narrate(kind, head, body) {
    const t = document.getElementById("transcript"); if (!t) return;
    const empty = document.getElementById("transcript-empty"); if (empty) empty.remove();
    const m = document.createElement("div"); m.className = "msg " + kind;
    m.innerHTML = '<div class="head"></div><div class="body"></div>';
    m.querySelector(".head").textContent = head; m.querySelector(".body").textContent = body || "";
    t.appendChild(m); t.scrollTop = t.scrollHeight; return m.querySelector(".body");
  }
  function paintDecision(d) {
    setDevice(d.route);
    const head = d.decidedAt + " \u00b7 " + d.source + " \u00b7 " + d.route.replace(/_/g, " ") + " (net " + d.net + ")";
    if (d.route === "speak_now") {
      const body = narrate("speak_now", head, "");
      // Type it out like app.js does: a beat must never freeze before its last spoken
      // line exists.
      return (async () => {
        const text = d.spoken + (d.overrideReason ? " [" + d.overrideReason + "]" : "");
        for (let i = 0; i <= text.length; i += 2) {
          body.textContent = text.slice(0, i);
          const t = document.getElementById("transcript"); if (t) t.scrollTop = t.scrollHeight;
          await sleep(12);
        }
        if (/safety override/i.test(d.overrideReason || "") || /smoke detector just tripped/i.test(text)) window.__hush.smoke = d.overrideReason || "safety override";
      })();
    }
    const b = narrate(d.route, head, d.display || "no announcement"); b.classList.add("dim");
    return Promise.resolve();
  }
  function renderPeople(people) {
    const ul = document.getElementById("people"); if (!ul) return; ul.innerHTML = "";
    (people || []).forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="who"><b></b><span></span></span>';
      li.querySelector("b").textContent = p.name; li.querySelectorAll("span>span")[0] || (li.querySelector(".who span:last-child").textContent = p.role + " \u00b7 " + p.location);
      const chip = document.createElement("button"); chip.className = "focus focus-" + p.focus; chip.textContent = p.focus.replace(/_/g, " ");
      li.querySelector(".who span:last-child") || li.querySelector(".who").appendChild(Object.assign(document.createElement("span"), { textContent: p.role + " \u00b7 " + p.location }));
      li.appendChild(chip); ul.appendChild(li);
    });
  }
  function renderLedger(entries) {
    const ul = document.getElementById("ledger"); if (!ul) return; ul.innerHTML = "";
    const was = window.__firstVerdict || (window.__firstVerdict = new Map());
    (entries || []).forEach((e) => {
      const li = document.createElement("li"); li.dataset.event = e.eventId;
      const row = document.createElement("div"); row.className = "ledger-row";
      const score = e.id + " \u00b7 attention " + e.attention + " \u00b7 net " + e.net;
      row.innerHTML = '<span class="label"></span><span class="badge ' + e.route + '">' + e.route.replace(/_/g, " ") + '</span><span class="meta"><i class="score" data-score="' + score + '"></i></span>';
      row.querySelector(".label").textContent = e.label;
      if (!was.has(e.eventId)) was.set(e.eventId, e.route);
      if (was.get(e.eventId) !== e.route) {
        li.classList.add("rewritten");
        row.querySelector(".meta").insertAdjacentHTML("beforeend", "<s>" + was.get(e.eventId).replace(/_/g, " ") + "</s>");
      }
      li.appendChild(row); ul.appendChild(li);
    });
  }
  function renderQueue(q) {
    const ul = document.getElementById("queue"); if (!ul) return; ul.innerHTML = "";
    const c = document.getElementById("queue-count"); if (c) c.textContent = (q || []).length;
    (q || []).forEach((i) => { const li = document.createElement("li"); li.textContent = i.label + " \u2014 " + (i.heldUntil ? "waiting " + i.heldUntil.at + " " + i.heldUntil.label : "next break"); ul.appendChild(li); });
  }
  function renderAll(s) {
    const el = (id) => document.getElementById(id);
    if (!s || !s.scenario) return s;
    if (el("clock")) el("clock").textContent = s.clock;
    if (el("scene-line")) el("scene-line").textContent = s.scenario.label + " \u2014 " + s.scenario.tagline + " \u2014 " + s.pending.length + " signal(s) still untriaged";
    if (el("next-break")) el("next-break").textContent = s.nextBreak ? s.nextBreak.at + " \u00b7 " + s.nextBreak.label + " (tolerance " + s.nextBreak.tolerance + ")" : "no break scheduled";
    renderPeople(s.people); renderLedger(s.ledger); renderQueue(s.quietQueue);
    return s;
  }

  // ---- beat actions ----
  // One synchronous snapshot of everything a beat's `ready` is allowed to check. capture.mjs
  // re-calls this on every poll, so an evidence state that existed after an action can never
  // "disappear" between two polls because a 110ms interval recounted the DOM. The interval
  // probe stays ACTIVE (it is how the app-driven scene proves itself) but no longer feeds
  // beat gates.
  function evidence() {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => [...document.querySelectorAll(sel)];
    const meta = q("#ledger li.rewritten .meta");
    const bodies = qa("#transcript .body").map((x) => x.textContent).join(" ");
    const smokeMsg = qa("#transcript .msg.speak_now").filter((m) => /smoke detector just tripped/.test(m.querySelector(".body")?.textContent || "")).at(-1);
    return {
      ring: q("#ring")?.dataset.label ?? "",
      playDisabled: q("#play")?.disabled ?? null,
      playSeen: !!H.playSeen,
      msgs: qa("#transcript .msg").length,
      speakLast: qa("#transcript .msg.speak_now").at(-1)?.querySelector(".body")?.textContent?.length ?? 0,
      smoke: !!H.smoke,
      smokeSpoken: smokeMsg ? (/.+/.test(smokeMsg.querySelector(".body").textContent) ? 1 : 0) : 0,
      queue: parseInt(q("#queue-count")?.textContent ?? "", 10),
      ledgerRows: qa("#ledger li").length,
      rewritten: q("#ledger li.rewritten")?.dataset.event ?? null,
      rewrittenBadge: q("#ledger li.rewritten .badge")?.textContent?.trim() ?? "",
      rewrittenStruck: q("#ledger li.rewritten s")?.textContent ?? "",
      verdictPill: meta ? (getComputedStyle(meta, "::after").content || "") : "",
      rewrittenScore: q("#ledger li.rewritten .score")?.dataset.score ?? "",
      digestN: (bodies.match(/I held (\d+) thing/) ?? [])[1] ?? null,
      heldLine: /signals still held back/i.test(bodies) || /What the family never heard/i.test(qa("#transcript .head").map((x) => x.textContent).join(" ")),
      auditRows: qa('#ledger li[data-open="1"] ul.factors li').length,
      auditTxt: qa('#ledger li[data-open="1"] ul.factors li').map((i) => i.textContent).join(" | "),
      badges: qa("#ledger .badge").map((b) => b.className),
      scenario: q("#scene-line")?.textContent?.startsWith("Bedtime") ? "bedtime" : (q("#scene-line")?.textContent?.startsWith("Weeknight") ? "weeknight" : "other"),
      chips: qa(".hush-chip span").map((s) => s.textContent),
      consoleLines: qa("#console-log div").length,
      rpcErrors: H.rpcErrors,
      bedtimeRows: 0
    };
  }
  function resetCounters() {
    H.sigSeen = 0; H.speakPeak = 0; H.speakNow = 0; H.rewrittenEvent = null; H.digestSeen = false;
    H.bedtimeDone = false; H.smoke = null; H.smokeSpoken = 0; H.queuePeak = 0; H.queueNow = 0;
    H.digestCount = -1; H.calls = []; H.rpcErrors = 0;
  }
  async function evaluate(id) {
    try {
      const r = await tool("evaluate_interruption", { event_id: id });
      if (r && r.decision) await paintDecision(r.decision);
      renderAll(await snapshot());
      return (r && r.decision) || r;
    } catch (error) {
      H.lastError = `evaluate ${id}: ${error.message}`;
      throw error;
    }
  }
  async function replay(id) { const r = await tool("replay_signal", { event_id: id }); if (r && r.decision) await paintDecision(r.decision); renderAll(await snapshot()); return (r && r.decision) || r; }
  async function loadWeeknight() { window.__firstVerdict = new Map(); await tool("load_scenario", { scenario_id: "weeknight_chaos" }); resetCounters(); document.getElementById("transcript") && (document.getElementById("transcript").innerHTML = ""); renderAll(await snapshot()); }
  // The DOM probe only sets playSeen between its 110ms ticks; a busy flag set by the click
  // itself is synchronous, so the later waitPlayDone() can never race past an arc that has
  // not started yet.
  async function clickPlay() { resetCounters(); H.playSeen = true; document.getElementById("play") && document.getElementById("play").click(); }
  // Wait for the page's own unattended arc to finish (play disables the buttons while running).
  async function waitPlayDone(timeout = 45000) {
    if (!H.playSeen) return true;
    const play = document.getElementById("play");
    const t0 = Date.now();
    while (play && play.disabled && Date.now() - t0 < timeout) await sleep(200);
    // The app re-enables its buttons a tick BEFORE the last digest line is typed into the
    // transcript; give the typing time to land, then swallow this scene's evidence.
    await sleep(700);
    H.playSeen = false;
    return !play || !play.disabled;
  }
  // A 1fps video freezes one frame per beat, so "hold on the row" means scroll it into the
  // visible panel before the screenshot. The columns scroll under the fixed caption bar.
  function scrollTranscript() {
    const t = document.getElementById("transcript");
    if (t) { t.scrollTop = t.scrollHeight; return true; }
    return false;
  }
  function scrollLedger() {
    const col = document.querySelector(".col.ledger");
    const li = col && document.querySelector("#ledger li.rewritten");
    if (col && li) {
      const cr = col.getBoundingClientRect(), lr = li.getBoundingClientRect();
      if (lr.bottom > cr.bottom - 8 || lr.top < cr.top) col.scrollTop += (lr.bottom - cr.bottom) + 40;
    }
    if (col) { const last = document.querySelector("#ledger li:last-child"); if (last) { const cr = col.getBoundingClientRect(), lr = last.getBoundingClientRect(); if (lr.bottom > cr.bottom) col.scrollTop += (lr.bottom - cr.bottom) + 8; } }
    return true;
  }
  async function stopScene() { document.getElementById("stop") && document.getElementById("stop").click(); }
  async function escalateSchool() {
    // evaluate_interruption is idempotent, so the first sighting of evt-school must be a real,
    // awaited evaluate: swallowing its error used to leave the ledger with no Swimming kit row
    // to strike through, and the verdict flip invisible.
    await evaluate("evt-school");
    await sleep(260);
    await replay("evt-school");
    await sleep(260);
    await replay("evt-school");
  }
  async function openFactors(label) {
    const lis = [...document.querySelectorAll("#ledger li")];
    const li = lis.find((x) => x.querySelector(".label") && x.querySelector(".label").textContent.indexOf(label) >= 0) || lis[lis.length - 1];
    if (!li) return false;
    if (li.dataset.open) return !!li.querySelector("ul.factors li");
    const list = document.createElement("ul"); list.className = "factors"; li.appendChild(list); li.dataset.open = "1";
    const score = (li.querySelector(".score") || {}).getAttribute && li.querySelector(".score").getAttribute("data-score") || "";
    const m = score.match(/dec-[A-Za-z0-9_.-]+/); const decisionId = m ? m[0] : score.split(/\s+/)[0].replace(/[^A-Za-z0-9_.-]/g, "");
    try {
      const res = await tool("explain_decision", { decision_id: decisionId });
      const d = res && res.decision ? res.decision : res;
      if (!d || !d.factors) { li.removeAttribute("data-open"); return false; }
      list.innerHTML = "";
      d.factors.forEach((f) => { const it = document.createElement("li"); it.innerHTML = "<b></b><span class='pts " + (f.points >= 0 ? "pos" : "neg") + "'></span><span class='why'></span>"; it.querySelector("b").textContent = f.label; it.querySelector(".pts").textContent = (f.points > 0 ? "+" : "") + f.points; it.querySelector(".why").textContent = f.note; list.appendChild(it); });
      if (d.overrideReason) { const it = document.createElement("li"); it.innerHTML = "<b>Override</b><span class='why'></span>"; it.querySelector(".why").textContent = d.overrideReason; list.appendChild(it); }
      return true;
    } catch { li.removeAttribute("data-open"); return false; }
  }
  async function digest() {
    const q = await tool("get_quiet_queue");
    const n = (q && q.holding && q.holding.length) || 0;
    narrate("system", "What the family never heard", n + " signals still held back: " + (q && q.holding ? q.holding.map((x) => x.label).join("; ") : "none"));
    await tool("advance_home_clock", { minutes: 140 });
    const d = await tool("deliver_digest");
    narrate("system", "Digest at the natural break", (d && d.spoken) || "");
    H.digestSeen = true; renderAll(await snapshot());
  }
  async function playScene() {
    await loadWeeknight();
    await clickPlay();
    const done = await waitPlayDone();
    // The transcript column scrolls; the last message ("EXPLAINABILITY") sits
    // behind the caption band at scrollTop=0. Park the scroll at the END so every painted
    // sentence is fully visible in the shot.
    scrollTranscript();
    await sleep(400);
    H.playDone = done;
    return done;
  }
  function captureBedtimeEvidence() {
    const e = evidence();
    H.bedtimeEvidence = e;
    return { rows: e.badges.length, scenario: e.scenario, spoken: e.badges.filter((b) => b.includes("speak_now")).length };
  }
  async function restoreWeeknight() {
    await loadWeeknight();
    setDevice("silent_log");
    H.sigSeen = 8; // the pending weeknight ledger is what the closing shot stands on
  }
  // Closing shot: the page's own Reset take button on the FINISHED weeknight scene. The app
  // restores the scenario and paints "Household restored to its starting state" into the
  // transcript — the ledger column itself goes empty, because nothing has been triaged yet.
  // The eight verdicts the family just watched stay on screen as the ring goes quiet.
  async function closingShot() {
    await loadWeeknight();
    await clickPlay();
    const done = await waitPlayDone();
    if (!done) return false;
    // Keep the eight verdicts on screen (this is the last chance to see them) while the ring
    // goes quiet: render the FINAL table first, then reset only the server-side take.
    renderAll(await snapshot());
    setDevice("silent_log");
    await tool("reset_home_state");
    narrate("system", "Reset", "Household restored to its starting state - the take is repeatable.");
    scrollTranscript();
    const rows = document.querySelectorAll("#ledger li").length;
    return rows === 8 && document.getElementById("ring")?.dataset.label === "quiet";
  }
  async function bedtime() {
    resetCounters(); window.__firstVerdict = new Map();
    const tr = document.getElementById("transcript"); if (tr) tr.innerHTML = "";
    await tool("load_scenario", { scenario_id: "bedtime" });
    const pend = await tool("get_pending_events");
    for (const ev of (pend.pending || [])) await evaluate(ev.id);
    const routes = [...document.querySelectorAll("#ledger .badge")].map((b) => b.className);
    H.bedtimeDone = routes.length > 0 && routes.every((r) => !r.includes("speak_now"));
    // Freeze the evidence NOW: the interval probe otherwise recounts rows from the scene the
    // next action restores.
    H.bedtimeRows = routes.length;
    return routes;
  }
  async function resetQuiet() {
    // The app's own #reset-btn handler is async (reset_home_state -> setDevice -> refresh ->
    // narrate) and the button is disabled while a scene runs — a studio click can never
    // complete inside a beat. Replay its exact sequence synchronously instead.
    await tool("reset_home_state");
    H.rewrittenEvent = null; H.digestSeen = false; H.digestCount = -1; H.queueNow = 0;
    window.__firstVerdict = new Map();
    const tr = document.getElementById("transcript"); if (tr) tr.innerHTML = "";
    setDevice("silent_log");
    renderAll(await snapshot());
    narrate("system", "Reset", "Household restored to its starting state - the take is repeatable.");
    return document.getElementById("ring")?.dataset.label === "quiet";
  }

  // Terminal plan: `npm run probe` captured by capture.mjs and pasted into a terminal plate.
  // dataset.ok only turns 1 when the SHIPPED text actually contains the claims the narration
  // makes, so a stale or truncated probe can never pass silently.
  function renderProbePlate(raw) {
    document.getElementById("hush-probe")?.remove();
    const lines = String(raw ?? "").replace(/\r/g, "").split("\n");
    // The most valuable on-screen claims: session id, tools, resources/prompts, the weeknight
    // routing table, and the 3-signal digest. Show through the digest, then the bedtime block.
    const digest = lines.findIndex((l) => l.includes("I held 3 things"));
    const bedtime = lines.findIndex((l) => l.trim() === "== bedtime: the same engine, nothing spoken ==");
    const end = digest !== -1 ? digest + 1 : (bedtime !== -1 ? lines.length : Math.min(lines.length, 44));
    const shown = lines.slice(0, end);
    while (shown.length && !shown[0].trim()) shown.shift();
    const box = document.createElement("div");
    box.id = "hush-probe";
    box.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:1240px;max-height:840px;overflow:hidden;background:rgba(3,6,12,.96);border:1px solid rgba(120,150,255,.4);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.7);z-index:9998;font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(255,255,255,.06);border-bottom:1px solid rgba(120,150,255,.25)";
    ["#ff5f57","#febc2e","#28c840"].forEach((c) => { const d = document.createElement("i"); d.style.cssText = "width:12px;height:12px;border-radius:50%;background:" + c; bar.appendChild(d); });
    const t = document.createElement("span"); t.textContent = "hush — npm run probe"; t.style.cssText = "margin-left:8px;color:#cdd8ff;font-size:14px"; bar.appendChild(t);
    const pre = document.createElement("pre");
    pre.style.cssText = "margin:0;padding:14px 16px;color:#d7e4ff;font-size:13px;line-height:1.42;white-space:pre;overflow:hidden";
    pre.textContent = shown.join("\n");
    box.appendChild(bar); box.appendChild(pre);
    document.body.appendChild(box);
    // Auto-fit: shrink the font until the whole block fits the plate, so the shot never cuts
    // a line mid-sentence (the "avoid truncated sentences" rule).
    let f = 13;
    while (pre.scrollHeight > 778 && f > 8) { f -= 0.5; pre.style.fontSize = f + "px"; }
    return shown.length;
  }
  async function probePlate() {
    if (!document.getElementById("hush-probe") && window.__probeText) renderProbePlate(window.__probeText);
    const el = document.getElementById("hush-probe");
    if (!el) return false;
    const txt = el.textContent;
    const ok = /13 tools/.test(txt) && /hush:\/\/quiet-queue/.test(txt) && /three_minute_demo/.test(txt) &&
      /Lina is 6 minutes over screen time/.test(txt) && /I held 3 things/.test(txt) &&
      /"hold_for_digest":3/.test(txt) && /session: [0-9a-f-][0-9a-f-][0-9a-f-][0-9a-f-]/.test(txt);
    el.dataset.ok = ok ? "1" : "0";
    window.__plateOk = ok; window.__plateProbeLen = (window.__probeText||"").length;
    el.dataset.okMessage = ok ? "" : "probe plate missing expected claims (13 tools / quiet-queue / three_minute_demo / the 3 held weeknight rows / the bedtime table / hold_for_digest:3 / session id)";
    return ok;
  }

  window.__studio = { tool, rpc, ensureSession, snapshot, renderAll, setDevice, evaluate, replay, loadWeeknight, clickPlay, playScene, waitPlayDone, stopScene, escalateSchool, openFactors, digest, bedtime, resetQuiet, resetCounters, evidence, narrate, paintDecision, scrollTranscript, scrollLedger, restoreWeeknight, closingShot, captureBedtimeEvidence, probePlate, sleep, get session() { return sessionId || window.__hushSessionId; } };
  H.ready = true;
})();
