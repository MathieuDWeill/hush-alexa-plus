# Friction Log

Judging-bonus log. Every entry below happened while building this repo; each has a
workaround we shipped and a suggestion we would give Amazon directly.

### 1. Connecting a self-hosted MCP server to Alexa+

**Task Attempted**
Attach our MCP server to a real Alexa+ experience so the demo uses a device.

**Steps Taken**
1. Read the Alexa+ track rules: "a real MCP endpoint, Agent Skill, or simulation source".
2. Looked for self-serve registration of a third-party MCP server, a sandbox account, or a
   hosted Alexa+ simulator that accepts an MCP URL.
3. Checked for a public preview API or an Alexa Skills Kit bridge to MCP.

**Expected Result**
A URL to paste, a preview device, or a documented waitlist to test an MCP-connected
assistant against a real Alexa+ surface.

**Actual Result**
No self-serve path found. The track accepts a real MCP endpoint plus a simulation, which is
what we shipped, but we could not validate against Alexa+ itself.

**Severity** High (it caps how far an entry can go)

**Workaround**
Built a browser surface that behaves like an Alexa+ device **and** is a genuine MCP client,
so the protocol path a real assistant would use is exercised in the demo. Documented it in
the README as simulation, not a device integration.

**Actionable Suggestion**
Ship a hackathon-grade path: a preview registration for an MCP endpoint (even a sandbox that
only speaks `tools/list` / `tools/call`), plus a documented transcript of how Alexa+ renders a
`structuredContent` tool result. Two hours of our time went into guessing the integration
shape instead of building it.

---

### 2. Using the browser as an MCP client

**Task Attempted**
Make `public/app.js` talk to `/mcp` with `fetch`, so the demo UI proves the endpoint is real.

**Steps Taken**
1. `POST initialize`, then `notifications/initialized`, then `tools/call` with `fetch`.
2. Set `Accept: application/json, text/event-stream` as the spec requires.
3. Read the `Mcp-Session-Id` response header and replay it on later requests.

**Expected Result**
A JSON body per request, readable with `response.json()`.

**Actual Result**
Two blockers. The default response is an SSE stream, so a plain `fetch` client has to parse
`event: message` frames. And the session header is invisible to browser JS unless the server
lists it in CORS `Access-Control-Expose-Headers`, which is easy to miss when the transport is
mounted by hand.

**Severity** Medium

**Workaround**
`new StreamableHTTPServerTransport({ enableJsonResponse: true, ... })` plus
`cors({ exposedHeaders: ["Mcp-Session-Id"] })`. A regression test (`the browser-style fetch
flow works without the SDK client`) now pins the header name, the `202` empty-body
notification, and the typed tool result.

**Actionable Suggestion**
Document a "browser client mode" for the HTTP transport (JSON responses, CORS header list,
and an example `fetch` handshake). MCP UIs are increasingly browsers and kiosk screens.

---

### 3. Stateless transport silently breaks multi-call clients

**Task Attempted**
Start from the documented stateless example: one `McpServer` + `StreamableHTTPServerTransport`
per request with `sessionIdGenerator: undefined`.

**Steps Taken**
1. Built the scaffold that way (`app.all("/mcp", ...)` creating a server per request).
2. Connected a browser client that calls `initialize`, then `tools/list`, then `tools/call`.
3. Observed follow-up calls behaving as if they hit a cold server every time, and a client
   that never reached a usable state.

**Expected Result**
Stateless means "no session bookkeeping", not "each JSON-RPC call is its own protocol
conversation".

**Actual Result**
Every request negotiates a fresh protocol handshake, so a real client cannot complete
`initialize` before its calls. Our first scaffold had exactly this bug.

**Severity** Medium

**Workaround**
Switched to stateful sessions: a `Map<sessionId, {server, transport}>`, `onsessioninitialized`
to register, `transport.onclose` to evict. Added a test that a request without a session gets
a helpful `400`.

**Actionable Suggestion**
In the transport docs, label the stateless example "one-shot RPC (no client handshake)" and
make the session map a copy-paste recipe.

---

### 4. Empty 202 body for notifications

**Task Attempted**
Handle the `notifications/initialized` response in the demo client.

**Steps Taken**
1. `await response.json()` on every MCP response, uniformly.

**Expected Result**
A JSON-RPC envelope, or at least a documented empty-body case.

**Actual Result**
`202 Accepted` with no body, which threw in the client and made boot look like a session
failure.

**Severity** Low

**Workaround**
Read `response.text()` first and treat an empty body as success when the status is `2xx`.

**Actionable Suggestion**
A one-line note in the spec/SDK: notifications never carry a body.

---

### 5. Local tooling: `tsx` could not run the dev loop

**Task Attempted**
Use `tsx watch src/server.ts` for a fast reload during the hackathon.

**Steps Taken**
1. Installed `tsx`, ran it on macOS (Apple Silicon).
2. esbuild's platform binary was not present in `node_modules`, so every run died in
   `generateBinPath`.

**Expected Result**
A TypeScript dev loop.

**Actual Result**
`TransformError` from esbuild before our code was even loaded.

**Severity** Medium (environment-specific, not Amazon's fault, but it cost setup time)

**Workaround**
Dropped `tsx` from the scripts: `npm run dev` is `tsc` then `node --watch dist/src/index.js`,
and tests are `tsc -p tsconfig.test.json && node --test dist/tests/*.test.js`. The repo now
needs no non-Node build tooling, which also made the demo easier to trust on another machine.

**Actionable Suggestion**
Not for Amazon, but a hackathon lesson: prefer zero-binary toolchains for demos that will run
on a judge's laptop.

---

### 6. An explainer UI cannot be trusted from a screenshot - it needs a frame-level check

**Task Attempted**
Make the escalation beat readable on video: a ledger row that changed its own verdict had to
show that it had changed, on the last frame of the scene, at recording resolution.

**Steps Taken**
1. Added a "changed since last paint" flag in the browser layer, ran the demo, and read the
   score table from `npm run probe` - all correct.
2. Screenshotted the finished scene headlessly. The flag was not there.
3. Diffed the rendered DOM: the row flipped for one frame and reverted 4 ms later.
4. Root cause: the ledger column is rebuilt from the resource snapshot after every single tool
   call, so "what did I draw last time" always already contains the new verdict. The flag was
   comparing a row against its own future.
5. Re-keyed the flag on the route the signal was *first* triaged under, which outlives any
   re-render, and drove the page over CDP with a MutationObserver to prove the class survives
   to the final paint.

**Expected Result**
"Server returns correct JSON, UI renders correct JSON" to be sufficient evidence for a demo
whose entire pitch is on-screen explainability.

**Actual Result**
The headline shot was invisible for the whole build until we looked at pixels instead of
payloads. Nothing in `npm test` could have caught it: the server was right the entire time.

**Severity** High for a demo-first submission (it would have cost the strongest 15 seconds of
the video, and we only found it by accident four hours before we would have recorded)

**Actionable Suggestion**
For Amazon: if Alexa+ ships any companion/simulator surface for MCP workloads, expose a way to
assert on the *rendered* state (stable element ids, a data-testid contract, or a headless
replay hook). A self-hosted MCP demo can be protocol-perfect and still fail visually, and
today the only way to catch that is to script a browser yourself - which is exactly what this
submission now does to stay honest.
