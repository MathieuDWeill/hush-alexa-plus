const ENDPOINT = "/mcp";
const ROUTE_COPY = {
  speak_now: { ring: "speaking", ringLabel: "speaking", state: "voice on the household surfaces" },
  whisper_display: { ring: "whispering", ringLabel: "screen only", state: "no voice - a card on one surface" },
  hold_for_digest: { ring: "holding", ringLabel: "held", state: "silent - waiting for a natural break" },
  silent_log: { ring: "", ringLabel: "quiet", state: "handled by the home, nobody interrupted" }
};

const els = {
  sessionPill: document.querySelector("#session-pill"),
  sessionText: document.querySelector("#session-text"),
  clock: document.querySelector("#clock"),
  scenarios: document.querySelector("#scenarios"),
  sceneLine: document.querySelector("#scene-line"),
  people: document.querySelector("#people"),
  nextBreak: document.querySelector("#next-break"),
  device: document.querySelector("#device"),
  ring: document.querySelector("#ring"),
  deviceState: document.querySelector("#device-state"),
  transcript: document.querySelector("#transcript"),
  ledger: document.querySelector("#ledger"),
  queue: document.querySelector("#queue"),
  queueCount: document.querySelector("#queue-count"),
  console: document.querySelector("#console-log"),
  triageAll: document.querySelector("#triage-all"),
  play: document.querySelector("#play"),
  clockBtn: document.querySelector("#clock-btn"),
  digestBtn: document.querySelector("#digest-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  stop: document.querySelector("#stop"),
  beat: document.querySelector("#beat"),
  empty: document.querySelector("#transcript-empty")
};

let nextId = 1;
let sessionId = null;
let snapshot = null;
let scenarioId = "weeknight_chaos";

async function rpc(method, params, options = {}) {
  const started = performance.now();
  const message = { jsonrpc: "2.0", method };
  if (options.notify !== true) message.id = nextId++;
  if (params !== undefined) message.params = params;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
    },
    body: JSON.stringify(message)
  });
  const header = response.headers.get("mcp-session-id");
  if (header) sessionId = header;
  const raw = await response.text();
  let payload = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { error: { message: `unreadable MCP response (HTTP ${response.status})` } };
    }
  }
  const ms = Math.round(performance.now() - started);
  logLine(`${method} ${params && Object.keys(params).length ? JSON.stringify(shorten(params)) : ""} - ${response.status} ${ms}ms`, payload?.error);
  if (payload?.result?.isError) {
    throw new Error(payload.result.content?.[0]?.text ?? "the tool reported an error");
  }
  if (payload?.error) throw new Error(payload.error.message ?? "MCP error");
  if (!response.ok && !payload) throw new Error(`MCP request failed with HTTP ${response.status}`);
  return payload?.result;
}

function shorten(params) {
  const text = JSON.stringify(params);
  return text.length > 90 ? `${text.slice(0, 88)}...` : text;
}

function logLine(line, isError) {
  const entry = document.createElement("div");
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  if (isError) entry.className = "err";
  els.console.prepend(entry);
  while (els.console.childNodes.length > 60) els.console.lastChild.remove();
}

function unwrap(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(name, args = {}) {
  return unwrap(await rpc("tools/call", { name, arguments: args }));
}

async function connect() {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "hush-demo-surface", version: "0.2.0" }
  });
  await rpc("notifications/initialized", {}, { notify: true });
  const tools = await rpc("tools/list", {});
  const resources = await rpc("resources/list", {});
  const prompts = await rpc("prompts/list", {});
  els.sessionPill.classList.add("live");
  els.sessionText.textContent = `MCP session ${init.serverInfo?.name ?? "ok"} - ${tools.tools.length} tools, ${resources.resources.length} resources, ${prompts.prompts.length} prompts`;
  logLine(`session ${sessionId?.slice(0, 8)} ready - server ${init.serverInfo?.name} v${init.serverInfo?.version}`);
}

async function refresh() {
  snapshot = await readSnapshot();
  els.clock.textContent = snapshot.clock;
  els.sceneLine.textContent = `${snapshot.scenario.label} - ${snapshot.scenario.tagline} - ${snapshot.pending.length} signal(s) still untriaged`;
  renderPeople(snapshot.people);
  els.nextBreak.textContent = snapshot.nextBreak ? `${snapshot.nextBreak.at} - ${snapshot.nextBreak.label} (tolerance ${snapshot.nextBreak.tolerance})` : "no break scheduled";
  renderLedger(snapshot.ledger);
  renderQueue(snapshot.quietQueue);
}

async function readSnapshot() {
  const result = await rpc("resources/read", { uri: "hush://home/context" });
  return JSON.parse(result.contents[0].text);
}

function renderPeople(people) {
  els.people.innerHTML = "";
  people.forEach((person) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="who"><b>${person.name}</b><span>${person.role} - ${person.location}</span></span>`;
    const chip = document.createElement("button");
    chip.className = `focus focus-${person.focus}`;
    chip.textContent = person.focus.replace(/_/g, " ");
    chip.title = "click to change focus; the next triage reacts immediately";
    chip.addEventListener("click", async () => {
      const order = ["free", "focused", "do_not_disturb", "asleep"];
      const focus = order[(order.indexOf(person.focus) + 1) % order.length];
      await callTool("set_person_focus", { person_id: person.id, focus });
      narrate("system", "Household policy", `${person.name} is now ${focus.replace(/_/g, " ")}. Re-triage the pending signals to see the routing change.`);
      await refresh();
    });
    li.appendChild(chip);
    els.people.appendChild(li);
  });
}

function renderLedger(entries) {
  els.ledger.innerHTML = "";
  // Chronological, like the transcript: reading down the column follows the scene. Rows are
  // keyed by signal id, so when an escalating signal rewrites its own verdict the badge, the
  // decision id, the score and the "verdict updated" flag all move together.
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.dataset.event = entry.eventId;
    const row = document.createElement("div");
    row.className = "ledger-row";
    const score = `${entry.id} - attention ${entry.attention} - net ${entry.net}`;
    row.innerHTML = `<span class="label">${entry.label}</span><span class="badge ${entry.route}">${entry.route.replace(/_/g, " ")}</span><span class="meta"><i class="score" data-score="${score}"></i></span>`;
    li.appendChild(row);
    // refresh() throws this whole column away and rebuilds it after every signal, so the flip
    // cannot live on the element - the next paint would erase it mid-shot. The memory that
    // matters is the route this signal was *first* triaged under, which outlives any re-render.
    if (!firstVerdict.has(entry.eventId)) firstVerdict.set(entry.eventId, entry.route);
    const was = firstVerdict.get(entry.eventId);
    if (was !== entry.route) {
      li.classList.add("rewritten");
      li.title = `first triaged as ${was.replace(/_/g, " ")}`;
      row.querySelector(".meta").insertAdjacentHTML("beforeend", `<s>${was.replace(/_/g, " ")}</s>`);
    }
    row.addEventListener("click", () => {
      if (li.dataset.open) {
        li.innerHTML = "";
        li.appendChild(row);
        li.dataset.open = "";
        return;
      }
      const list = document.createElement("ul");
      list.className = "factors";
      li.appendChild(list);
      li.dataset.open = "1";
      void loadFactors(list, entry.id, previousRouteLabel(entry));
    });
    els.ledger.appendChild(li);
  });
}

/** What a flipped row used to say, in the same words the badge uses. */
function previousRouteLabel(entry) {
  const was = firstVerdict.get(entry.eventId);
  return was && was !== entry.route ? `Rewritten from ${was.replace(/_/g, " ")}. ` : "";
}

/**
 * Re-read one decision's scoring over MCP and paint it under its ledger row. This is the
 * explainability shot: the factor list is a tool call, not a tooltip baked into the page.
 */
async function loadFactors(list, decisionId, overrideNote) {
  try {
    const { decision } = await callTool("explain_decision", { decision_id: decisionId });
    list.innerHTML = "";
    decision.factors.forEach((factor) => {
      const item = document.createElement("li");
      item.innerHTML = `<b>${factor.label}</b><span class="pts ${factor.points >= 0 ? "pos" : "neg"}">${factor.points > 0 ? "+" : ""}${factor.points}</span><span class="why">${factor.note}</span>`;
      list.appendChild(item);
    });
    if (decision.heldUntil) {
      const item = document.createElement("li");
      item.innerHTML = `<b>Held until</b><span class="pts">${decision.heldUntil.at}</span><span class="why">${decision.heldUntil.label}</span>`;
      list.appendChild(item);
    }
    if (decision.overrideReason) {
      const item = document.createElement("li");
      item.innerHTML = `<b>Override</b><span class="why">${overrideNote}${decision.overrideReason}</span>`;
      list.appendChild(item);
    }
  } catch (error) {
    const item = document.createElement("li");
    item.innerHTML = `<b>Audit failed</b><span class="why">${error.message}</span>`;
    list.appendChild(item);
  }
}

/**
 * The route each signal was first triaged under this scene. The ledger column is rebuilt from
 * scratch after every tool call, so "what did I draw last time" can never survive to flag a
 * verdict that flipped mid-scene - only the original verdict can. Read back through
 * explain_decision, it is also what lets an audited row name what it used to say.
 */
const firstVerdict = new Map();

function renderQueue(queue) {
  els.queue.innerHTML = "";
  els.queueCount.textContent = queue.length;
  queue.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.label} - waiting for ${item.heldUntil ? `${item.heldUntil.at} ${item.heldUntil.label}` : "the next break"}`;
    els.queue.appendChild(li);
  });
}

function setBeat(text) {
  els.beat.textContent = text;
}

/**
 * Follow the narration, but stop fighting the presenter: if they scrolled up to re-read an
 * older row, the transcript stays where they left it.
 */
function autoscroll(container) {
  const pinnedToBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 160;
  if (pinnedToBottom) container.scrollTop = container.scrollHeight;
}

function narrate(kind, head, text) {
  els.empty?.remove();
  const msg = document.createElement("div");
  msg.className = `msg ${kind}`;
  msg.innerHTML = `<div class="head">${head}</div><div class="body"></div>`;
  els.transcript.appendChild(msg);
  autoscroll(els.transcript);
  const body = msg.querySelector(".body");
  if (text !== undefined) body.textContent = text;
  return body;
}

function typeInto(target, text, speed = 12) {
  return new Promise((resolve) => {
    let index = 0;
    const step = () => {
      if (stopped) return resolve();
      target.textContent = text.slice(0, (index += 2));
      autoscroll(els.transcript);
      if (index < text.length) setTimeout(step, speed);
      else resolve();
    };
    step();
  });
}

function setDevice(route) {
  const copy = ROUTE_COPY[route] ?? ROUTE_COPY.silent_log;
  els.ring.className = `ring ${copy.ring}`;
  els.ring.dataset.label = copy.ringLabel;
  els.ring.textContent = copy.ringLabel;
  els.deviceState.textContent = copy.state;
}

function showDecision(decision) {
  setDevice(decision.route);
  setBeat(`${decision.source}: ${decision.label} -> ${decision.route.replace(/_/g, " ")}`);
  const head = `${decision.decidedAt} - ${decision.source} - ${decision.route.replace(/_/g, " ")} (net ${decision.net})`;
  if (decision.route === "speak_now") {
    const body = narrate("speak_now", head, "");
    return typeInto(body, `${decision.spoken}${decision.overrideReason ? ` [${decision.overrideReason}]` : ""}`);
  }
  const body = narrate(decision.route, head, "");
  body.classList.add("dim");
  body.textContent = decision.display ?? "no announcement";
  return Promise.resolve();
}

async function triageOne(eventId) {
  const { decision } = await callTool("evaluate_interruption", { event_id: eventId });
  await showDecision(decision);
  await refresh();
  return decision;
}

let stopped = false;

async function triageAll() {
  stopped = false;
  firstVerdict.clear();
  setBusy(true);
  els.transcript.innerHTML = "";
  const result = await callTool("route_pending_events");
  if (result?.decisions) {
    setBeat(`triaging ${result.decisions.length} signals in one batch`);
    for (const decision of result.decisions) {
      if (stopped) break;
      await showDecision(decision);
      await nap(260);
    }
  } else {
    narrate("system", "Hush", String(result));
  }
  await refresh();
  setBusy(false);
}

/** Interruptible pause: a bad take should cost seconds, not a re-record. */
function nap(ms) {
  return new Promise((resolve) => {
    const tick = (remaining) => {
      if (stopped || remaining <= 0) return resolve();
      setTimeout(() => tick(remaining - 100), Math.min(100, remaining));
    };
    tick(ms);
  });
}

async function play() {
  stopped = false;
  firstVerdict.clear();
  setBusy(true);
  els.transcript.innerHTML = "";
  els.empty?.remove();
  await callTool("load_scenario", { scenario_id: scenarioId });
  await refresh();
  const pending = await callTool("get_pending_events");
  narrate("system", "Scene", `${pending.clock}: ${snapshot.scenario.tagline} ${pending.pending.length} signals arrived. Hush decides what Alexa+ says out loud.`);
  setBeat(`scene loaded - ${pending.pending.length} signals waiting`);
  await nap(900);
  for (const event of pending.pending) {
    if (stopped) break;
    const { decision } = await callTool("evaluate_interruption", { event_id: event.id });
    await showDecision(decision);
    await nap(decision.route === "speak_now" ? 700 : 420);
    await refresh();
  }
  if (!stopped) {
    const queue = await callTool("get_quiet_queue");
    narrate("system", "What the family never heard", `${queue.holding.length} signals were held back: ${queue.holding.map((item) => item.label).join("; ")}.`);
    setBeat(`${queue.holding.length} signals the household never heard`);
    await nap(1200);
    if (queue.holding[0] && !stopped) {
      narrate("system", "Same signal, twice more", `The ${queue.holding[0].label.toLowerCase()} signal fires again. A quiet assistant would hide it forever - Hush counts the deferrals.`);
      setBeat("watch an over-deferred signal escalate");
      await nap(900);
      for (let attempt = 0; attempt < 2 && !stopped; attempt += 1) {
        const { decision } = await callTool("replay_signal", { event_id: queue.holding[0].eventId });
        await showDecision(decision);
        await nap(500);
      }
      await refresh();
    }
    if (!stopped) {
      await callTool("advance_home_clock", { minutes: 140 });
      await refresh();
      const digest = await callTool("deliver_digest");
      setBeat("the natural break arrives - one digest instead of four interruptions");
      const body = narrate("system", "Digest at the natural break");
      await typeInto(body, digest.spoken);
      if (!stopped) {
        narrate("system", "Explainability", "Every ledger row re-reads its scoring over MCP. That is the audit trail families and judges can check.");
        setBeat("scene complete - click any ledger row to audit the scoring");
      }
    }
  }
  setBusy(false);
  setDevice("silent_log");
}

function stopScene() {
  stopped = true;
  setBeat("scene stopped - press Reset take, then play again");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setBusy(busy) {
  [els.play, els.triageAll, els.clockBtn, els.digestBtn, els.resetBtn].forEach((button) => {
    button.disabled = busy;
  });
  els.stop.hidden = !busy;
  els.stop.disabled = !busy;
}

async function loadScenarios() {
  firstVerdict.clear();
  const list = await callTool("list_scenarios");
  els.scenarios.innerHTML = "";
  list.forEach((scenario) => {
    const button = document.createElement("button");
    button.className = "scenario-btn";
    button.textContent = `${scenario.label} (${scenario.events} signals)`;
    button.setAttribute("aria-pressed", String(scenario.id === scenarioId));
    button.addEventListener("click", async () => {
      scenarioId = scenario.id;
      [...els.scenarios.children].forEach((child) => child.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      els.transcript.innerHTML = "";
      await callTool("load_scenario", { scenario_id: scenarioId });
      await refresh();
      narrate("system", "Scenario").textContent = scenario.tagline;
    });
    els.scenarios.appendChild(button);
  });
}

els.triageAll.addEventListener("click", async () => {
  setBusy(true);
  await triageAll();
  setBusy(false);
});

els.play.addEventListener("click", () => play().catch(showError));
els.stop.addEventListener("click", stopScene);

els.clockBtn.addEventListener("click", async () => {
  const result = await callTool("advance_home_clock", { minutes: 15 });
  narrate("system", "Clock", `Simulated clock is now ${result.clock}.`);
  await refresh();
});

els.digestBtn.addEventListener("click", async () => {
  const digest = await callTool("deliver_digest");
  const body = narrate("system", "Digest");
  body.textContent = digest.spoken;
  await refresh();
});

els.resetBtn.addEventListener("click", async () => {
  stopped = true;
  firstVerdict.clear();
  els.transcript.innerHTML = "";
  await callTool("reset_home_state");
  setDevice("silent_log");
  await refresh();
  narrate("system", "Reset", "Household restored to its starting state - the take is repeatable.");
});

function showError(error) {
  els.sessionPill.classList.remove("live");
  els.sessionText.textContent = "MCP session lost";
  const body = narrate("system", "MCP error");
  body.textContent = error.message;
  setBusy(false);
  els.stop.disabled = false;
}

async function boot() {
  try {
    await connect();
    await loadScenarios();
    await refresh();
    narrate("system", "Hush", `${snapshot.scenario.tagline} Say nothing until something is worth hearing - press "Play the scene".`);
    if (new URLSearchParams(location.search).get("autoplay") === "1") {
      narrate("system", "Autoplay", "Recording mode: this scene runs itself.");
      await wait(400);
      await play();
    }
  } catch (error) {
    showError(error);
  }
}

boot();
