#!/usr/bin/env bash
# Verifies the demo is up: static surface, REST health, and a real MCP session that can
# reproduce the whole submission narrative (escalation, deferred routes, digest).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
ENDPOINT="$BASE_URL/mcp"

curl -fsS "$BASE_URL/health" | grep -q '"ok":true'
curl -fsS "$BASE_URL/" | grep -q "interruption brain"
curl -fsS "$BASE_URL/api/state" | grep -q "quietQueue"

INIT_HEADERS=$(curl -fsS -D - -o /dev/null -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}')
SESSION_ID=$(printf '%s' "$INIT_HEADERS" | grep -i '^mcp-session-id:' | tr -d '\r' | awk '{print $2}')
if [ -z "$SESSION_ID" ]; then
  echo "MCP handshake failed: no Mcp-Session-Id header. Is the server running? (npm run dev)" >&2
  exit 1
fi

post() {
  curl -fsS -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "$1"
}

post '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

TOOLS=$(post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
COUNT=$(printf '%s' "$TOOLS" | node -e 'let raw="";process.stdin.on("data",chunk=>raw+=chunk).on("end",()=>console.log(JSON.parse(raw).result.tools.length))')
if [ "$COUNT" -lt 12 ]; then
  echo "expected at least 12 MCP tools, got $COUNT" >&2
  exit 1
fi

post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"load_scenario","arguments":{"scenario_id":"weeknight_chaos"}}}' >/dev/null

# The safety override must punch through every soft rule.
post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"evaluate_interruption","arguments":{"event_id":"evt-smoke"}}}' \
  | grep -q '"route":"speak_now"'
post '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"evaluate_interruption","arguments":{"event_id":"evt-smoke"}}}' \
  | grep -q 'safety override'

# A signal that keeps firing must escalate rather than stay hidden forever.
post '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"evaluate_interruption","arguments":{"event_id":"evt-school"}}}' >/dev/null
post '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"replay_signal","arguments":{"event_id":"evt-school"}}}' >/dev/null
post '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"replay_signal","arguments":{"event_id":"evt-school"}}}' \
  | grep -q '"route":"speak_now"'

# The batch route still produces the verdicts the demo narrative promises, and deferred
# news lands at a break. All three appear in the weeknight scene; the bedtime scene (next
# section, and npm run probe) is what demonstrates whisper_display.
ROUTES=$(post '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"route_pending_events","arguments":{}}}' | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  const decisions = JSON.parse(raw).result.structuredContent.decisions;
  console.log([...new Set(decisions.map((decision) => decision.route))].sort().join(" "));
});
')
printf '%s' "$ROUTES" | grep -q "speak_now"
printf '%s' "$ROUTES" | grep -q "hold_for_digest"
printf '%s' "$ROUTES" | grep -q "silent_log"

post '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"advance_home_clock","arguments":{"minutes":140}}}' >/dev/null
DIGEST=$(post '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"deliver_digest","arguments":{}}}' | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  console.log(JSON.parse(JSON.parse(raw).result.content[0].text).spoken);
});
')
printf '%s' "$DIGEST" | grep -q "kept quiet"

# The context resource is readable and agrees with the ledger the UI renders.
CLOCK=$(post '{"jsonrpc":"2.0","id":12,"method":"resources/read","params":{"uri":"hush://home/context"}}' | node -e '
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
  const payload = JSON.parse(JSON.parse(raw).result.contents[0].text);
  console.log(`${payload.clock} ledger=${payload.ledger.length} queue=${payload.quietQueue.length}`);
});
')
printf '%s' "$CLOCK" | grep -q '^21:07'
printf '%s' "$CLOCK" | grep -q 'ledger=8'

# At 21:05 the digest drained the queue, so the audit resource must be empty.
post '{"jsonrpc":"2.0","id":13,"method":"resources/read","params":{"uri":"hush://quiet-queue"}}' \
  | grep -q '"text":"\[\]"'

echo "Smoke test passed for $BASE_URL ($COUNT MCP tools, routes: $ROUTES, $CLOCK, session ${SESSION_ID:0:8}...)"
