# Product feedback

Hackathon requirement: what we used, what worked, what did not. Written as the build
progressed, not reconstructed afterwards.

## Tools / APIs / SDKs used

| Item | Version | Used for |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` (TypeScript) | 1.32.1 | `McpServer`, `registerTool` / `registerResource` / `registerPrompt`, `ResourceTemplate`, `StreamableHTTPServerTransport` (server), `StreamableHTTPClientTransport` + `Client` (tests) |
| Model Context Protocol, Streamable HTTP | protocol `2025-06-18` | the `/mcp` endpoint: stateful sessions via `Mcp-Session-Id`, `tools/call`, `resources/read`, `prompts/get` |
| Zod | 3.25 | tool `inputSchema` and `outputSchema`, incl. `.default()`, `.describe()`, `z.enum` |
| Express | 4.19 | static demo surface + mounting the MCP transport on one route |
| Node 22 (`node --test`, `structuredClone`, `fetch`) | 22.22.3 | 36 tests (24 policy, 12 MCP) with no extra test framework; browser-style `fetch` round-trip test |
| Amazon Developer Hackathon brief + Alexa+ track rules | - | scoped the submission to "real MCP endpoint **or** Agent Skill **or** simulation source" |

**No Amazon SDK, API, or simulator was used.** There is currently no self-serve way for a
hackathon entrant to attach a self-hosted MCP server to a real Alexa+ experience, and we had
no device or account credentials in the demo environment. Rather than fake it, the repo
ships the two things the track explicitly accepts: a working MCP endpoint and the full
simulation source for an Alexa+-style surface. See the friction log entry "Connecting a
self-hosted MCP server to Alexa+".

## What worked well

- `McpServer.registerTool` is genuinely good: one call gives you a Zod-validated input
  schema, a title, a description, and annotations. The MCP inspector and the SDK client both
  read it without extra glue.
- `outputSchema` + `structuredContent` was the highest-value API in the SDK for this project.
  The demo UI consumes typed `Decision` objects, so the browser does not parse prose; the SDK
  also validates our own output on every call, which caught a shape drift immediately.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) let the demo UI
  label "this call changes the household" without inventing our own metadata.
- Resources and prompts are cheap to add and paid off: the UI reads household state through
  `hush://home/context`, and the `three_minute_demo` prompt lets any MCP client reproduce the
  hackathon demo without a human clicking.
- Stateful Streamable HTTP (`sessionIdGenerator: () => randomUUID()` + a session map) works
  with the official client, `curl`, and `fetch` in a browser once CORS exposes the header.
- `StreamableHTTPClientTransport` in tests made the MCP surface testable end-to-end in ~10
  lines, on a random port, no server spawn needed.
- `outputSchema` caught a real product bug during development: our own `Decision` shape had
  drifted from what the demo UI rendered, and the SDK's response validation surfaced it in
  the test run instead of in the recorded video.
- `outputSchema` is also the cheapest place to make a policy promise machine-checkable. Adding
  `deferrals` to the `Decision` schema forced every tool that returns a verdict to carry the
  count with it, so "how many times has Hush hidden this?" is answerable by any MCP client
  rather than only by our own UI.
- `tools/list` descriptions are load-bearing product copy, not docs. The escalation valve is
  capped at 2x a signal's own attention, which means a client that spams `replay_signal` gets
  silence - so the tool description and its result text have to explain the decline in the same
  arithmetic the ledger uses. The schema made that a per-tool decision, which is the right place.

## What needs work

- The two transport modes are a trap. The stateless example (`sessionIdGenerator: undefined`)
  creates a fresh `McpServer` per request, which silently breaks any client that expects a
  session across `initialize` -> `notifications/initialized` -> `tools/call`. Our first
  scaffold used it and the browser client could not work against it.
- Browsers are second-class MCP clients. The spec requires `Accept: application/json,
  text/event-stream`, and the default response is an SSE stream; `fetch`-based UIs need
  `enableJsonResponse: true`, which is a transport option rather than a documented "browser
  mode". See the friction log.
- `notifications/initialized` answers `202` with an empty body. Correct per spec, but easy to
  mishandle in a client that assumes JSON.
- `McpServer` has no hook for "this session's household is X", so per-tenant state has to be
  managed outside the server instance. For a multi-household deployment we would key our own
  store by session or by auth subject; the SDK gives no assist.
- No schema generation helper for resources: the templated `hush://decisions/{id}` list
  callback had to be written against the type error rather than an example.
- Nothing in the SDK helps you test the *rendered* result of an MCP call. Our protocol layer
  was green for hours while the demo's key visual beat was invisible, because the browser
  rebuilds the ledger column after every `resources/read` and the flip flag was comparing a row
  against its own future. We ended up driving the page over CDP with a `MutationObserver` to
  prove the class survives to the final frame; `npm test` still cannot express that.

## Would we build with it again?

Yes, and it is the right substrate for this idea. MCP is exactly the seam an Alexa+ style
assistant needs for third-party judgement layers, and the SDK is stable enough that we spent
no time fighting it. The gap is not the protocol or the SDK - it is the missing path from
"hackathon MCP server" to "registered on a real Alexa+ surface". Ask us again next year and
we expect to demo against a device instead of a simulation.


## The video studio (Playwright + ffmpeg + TTS)

The demo film is generated by the repo's own studio, not an external recorder, so it counts
as tool feedback too:

- **Playwright** headless Chromium drives the page beat-by-beat via the same MCP session the
  UI already opened. Because `npm test` cannot see the browser, the studio is how we verify
  the key visual beat (the escalation `VERDICT UPDATED` row) actually reaches the final frame,
  with the mouse hidden and captions painted in the page.
- **edge-tts** works great *when reachable*: neural voices, word-boundary timing, tiny API.
  But the read-aloud **synthesis websocket** is gated by Microsoft (a `Sec-MS-GEC` DRM token
  plus a server-side ban that is not DNS/IP-blocked for the plain voice-list HTTP call). From
  a few datacenter IPs you get `403` on the WSS handshake while `--list-voices` still returns
  200, so we could not rely on it for a reproducible render and added a fallback.
- **A cold-start gotcha worth knowing:** the studio probes its own server before it renders
  beat 12b's terminal plate. Spawning `dist/src/index.js` (Express + static `studio/out/`),
  then writing `probe.txt` from a child process and re-reading it from the parent produced
  a corrupted read (`[object Object]`) on macOS — the child held directory state the parent
  re-read raced against. The fix was structural: `ensureServer()` first, probe via
  `execFileSync` and keep its stdout **in memory only**, and the studio closes every process
  it started in a `finally`, including on failure (a `npm run dev` server you did not start
  is never touched; `PORT=9123` runs the whole studio on an isolated port).
- **ffmpeg** (Homebrew 8.x) ships without `drawtext`/`libfreetype`/`rubberband*filter`, so we
  burned captions into the DOM and used the **`rubberband` CLI** for clean time-compression of
  the voice to fit the 3:00 cap. Looping a still image over its own audio (`-loop 1` +
  `-t`) and concat-copy beats any complex `filter_complex` graph on this build.

## English narration with local macOS speech

The English demo uses the installed macOS Daniel voice via `say`, at 155 words per minute.
This avoids the unavailable Edge synthesis endpoint and requires no paid service or API key.
The English storyboard is shorter and assembled at 1x speed; captions and titles are English.
`studio/english.mjs` renders in isolation and preserves the existing French media.
