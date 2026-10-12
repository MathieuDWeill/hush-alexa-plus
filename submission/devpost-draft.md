# Devpost submission copy - Hush

## Project name

**Hush - the interruption brain for Alexa+**

## One-liner

A self-hosted MCP server that gives Alexa+ the judgement to say out loud, whisper to a
screen, hold for a natural break, or silently handle - and to explain every choice.

## Track

Alexa+ (self-hosted MCP server + simulated Alexa+ experience)

## Mini challenge

Open Source - MIT licensed, `src/domain/triage.ts` is the part worth arguing about.

## The problem

Every connected device in a home has a speaker it can borrow, and not one of them knows
whether anyone can hear it right now. The result is an assistant that is either a nuisance
or, after people turn notifications off, absent. Interruption timing is treated as a device
setting instead of a household decision.

## What we built

Hush sits between household signals (doorbell camera, oven, water sensor, school portal,
calendar, smoke detector) and the one conversational surface the family actually shares.
For each signal it returns one of four routes:

- `speak_now` - say it, on the surfaces where the relevant people are.
- `whisper_display` - a card on one screen, no voice.
- `hold_for_digest` - wait for the next natural break and batch it.
- `silent_log` - let the home act, tell nobody.

The decision is arithmetic over four inputs - signal urgency, household relevance,
freshness, actionability - minus the cost of the current scene and the focus state of the
person who would be interrupted. Safety signals bypass everything. A signal that has been
deferred twice escalates, because politeness must not become silence - and the escalation is
capped at twice what the signal was ever worth, because the opposite failure mode is a house
that shouts about a dishwasher. Every decision keeps its scored factors, readable by a tool
call, and a row that changed its own verdict says so.

We built a simulated Alexa+ web surface so the idea is watchable in two minutes. It is not
a mock calling a shortcut endpoint: it opens a real MCP session and renders from
`tools/call` and `resources/read` responses, with the JSON-RPC traffic on screen.

## Technical features

- Streamable HTTP MCP endpoint with **stateful sessions** (`Mcp-Session-Id`), official
  `@modelcontextprotocol/sdk` 1.32.1.
- 13 tools, 2 static resources, 1 templated audit resource, 2 prompts.
- `outputSchema` + `structuredContent` on the triage tools, so a client gets typed decisions
  instead of prose to re-parse.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so a
  client can tell which calls change the household.
- Four scripted "households in time" scenarios (22 signals) with deterministic resets - the
  demo is repeatable take after take.
- 36 tests: 24 over the policy engine, 12 over MCP using the official client transport plus a
  raw browser-style `fetch` path that guards the session-header contract the UI depends on. One
  test sweeps every signal in every scenario through five sightings and asserts that no row the
  UI can print contradicts its own arithmetic. A second one runs the `three_minute_demo` prompt
  against the live engine, so the video narration cannot promise a route the policy no longer
  produces.
- Express 4 + TypeScript ESM, no framework, no build tooling beyond `tsc`.

## What we built during the hackathon

Fresh repo, built for this event: the domain model and policy engine, the scenario set, the
MCP tool/resource/prompt surface, the MCP-client demo UI, the probe and smoke scripts, the
tests, and this submission's copy, script, and friction log.

## What is next

1. Register the server with a real Alexa+ surface once self-serve MCP registration opens up.
2. Learn the weights per household from accepted vs ignored interruptions, keeping the
   factor list human-readable.
3. Multi-household tenancy, auth, and consent (who may declare `do_not_disturb` for a child).
4. A "quiet hour" review screen so families can tune the personality in plain language.

## Built with

TypeScript, Node 22, Express, `@modelcontextprotocol/sdk` (Streamable HTTP), Zod, `node:test`.

## Links

- Repo: `<github url>`
- Run: `npm install && npm run dev` then open `http://localhost:8787`
- Demo video: `<youtube url>`
