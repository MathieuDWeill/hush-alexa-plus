#!/usr/bin/env bash
# Talks to the MCP endpoint the same way an MCP client does:
# initialize -> notifications/initialized -> tools/list -> tools/call -> resources/read
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
ENDPOINT="$BASE_URL/mcp"

post() {
  curl -sS -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    ${SESSION_ID:+-H "Mcp-Session-Id: $SESSION_ID"} \
    -d "$1"
}

echo "== initialize =="
HEADERS=$(mktemp)
curl -sS -D "$HEADERS" -o /dev/null -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"hush-probe","version":"0.2.0"}}}'
SESSION_ID=$(grep -i '^mcp-session-id:' "$HEADERS" | tr -d '\r' | awk '{print $2}')
rm -f "$HEADERS"
if [ -z "$SESSION_ID" ]; then
  echo "no Mcp-Session-Id header returned - is the server running? (npm run dev)" >&2
  exit 1
fi
echo "session: $SESSION_ID"

post '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

echo "== tools =="
post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const tools = JSON.parse(raw).result.tools;
    console.log(`${tools.length} tools`);
    tools.forEach((tool) => console.log(`- ${tool.name}: ${tool.description.split(". ")[0]}.`));
  });
'

echo "== resources =="
post '{"jsonrpc":"2.0","id":3,"method":"resources/list"}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    JSON.parse(raw).result.resources.forEach((resource) => console.log(`- ${resource.uri} (${resource.mimeType})`));
  });
'

echo "== prompts =="
post '{"jsonrpc":"2.0","id":4,"method":"prompts/list"}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    JSON.parse(raw).result.prompts.forEach((prompt) => console.log(`- ${prompt.name}`));
  });
'

echo "== triage every signal in the weeknight scene =="
post '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"load_scenario","arguments":{"scenario_id":"weeknight_chaos"}}}' >/dev/null
post '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"route_pending_events","arguments":{}}}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const decisions = JSON.parse(raw).result.structuredContent.decisions;
    decisions.forEach((decision) => {
      console.log(`${decision.route.padEnd(16)} net ${String(decision.net).padStart(6)}  ${decision.label}`);
      if (decision.spoken) console.log(`  Alexa would say: ${decision.spoken}`);
    });
    const counts = decisions.reduce((acc, decision) => ({ ...acc, [decision.route]: (acc[decision.route] ?? 0) + 1 }), {});
    console.log(`routing: ${JSON.stringify(counts)}`);
  });
'

echo "== quiet queue: what the household was not told =="
post '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_quiet_queue","arguments":{}}}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const queue = JSON.parse(JSON.parse(raw).result.content[0].text);
    queue.holding.forEach((decision) => {
      console.log(`${decision.heldUntil.at}  ${decision.label} (held, cost was ${decision.interruptionCost})`);
    });
  });
'

echo "== bedtime: the same engine, nothing spoken =="
post '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"load_scenario","arguments":{"scenario_id":"bedtime"}}}' >/dev/null
post '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"route_pending_events","arguments":{}}}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    JSON.parse(raw).result.structuredContent.decisions.forEach((decision) => {
      console.log(`${decision.route.padEnd(16)} ${decision.label}${decision.surfaces.length ? ` -> ${decision.surfaces.join(", ")}` : " -> no surface"}`);
    });
  });
'

echo "== natural break: one digest instead of a pile of interruptions =="
post '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"load_scenario","arguments":{"scenario_id":"weeknight_chaos"}}}' >/dev/null
post '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"route_pending_events","arguments":{}}}' >/dev/null
post '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"advance_home_clock","arguments":{"minutes":140}}}' >/dev/null
post '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"deliver_digest","arguments":{}}}' | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
    const envelope = JSON.parse(raw).result;
    if (envelope.isError) {
      console.log(`tool error: ${envelope.content[0].text}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.parse(envelope.content[0].text).spoken);
  });
'
