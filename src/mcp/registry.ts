import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { homeStore } from "../domain/state.js";
import { policy } from "../domain/triage.js";
import type { Decision } from "../domain/types.js";

const routeSchema = z.enum(["speak_now", "whisper_display", "hold_for_digest", "silent_log"]);

const decisionOutput = z.object({
  id: z.string(),
  eventId: z.string(),
  label: z.string(),
  source: z.string(),
  route: routeSchema,
  attention: z.number(),
  interruptionCost: z.number(),
  displayCost: z.number(),
  freeWitnesses: z.array(z.string()),
  net: z.number(),
  audience: z.array(z.string()),
  surfaces: z.array(z.string()),
  spoken: z.string().nullable(),
  display: z.string().nullable(),
  heldUntil: z.object({ at: z.string(), label: z.string(), tolerance: z.number() }).nullable(),
  deviceAction: z.string().nullable(),
  overrideReason: z.string().nullable(),
  deferrals: z.number(),
  factors: z.array(z.object({ key: z.string(), label: z.string(), points: z.number(), note: z.string() })),
  decidedAt: z.string()
});

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return {
    content: [{ type: "text" as const, text: `Hush could not do that: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true
  };
}

export function routeSentence(decision: Decision): string {
  const headline = `${decision.route.replace(/_/g, " ").toUpperCase()} - ${decision.label}`;
  const score = `attention ${decision.attention} - interruption cost ${decision.interruptionCost} = ${decision.net}`;
  const where = decision.surfaces.length ? `on ${decision.surfaces.join(", ")}` : "no surface";
  const why = decision.overrideReason ? `Reason: ${decision.overrideReason}.` : `Top factor: ${topFactor(decision)}.`;
  const witness = decision.freeWitnesses.length ? `Free to interrupt: ${decision.freeWitnesses.join(", ")}.` : "Nobody at home is free to interrupt.";
  const waiting = decision.heldUntil ? `Waiting for: ${decision.heldUntil.at} ${decision.heldUntil.label} (tolerance ${decision.heldUntil.tolerance}).` : null;
  const said = decision.spoken ? `Alexa would say: "${decision.spoken}"` : decision.display ?? "";
  return [headline, score, where, witness, waiting, why, said].filter(Boolean).join("\n");
}

/**
 * When a repeated signal still does not speak, say why in the same arithmetic the row uses.
 * Without this, "I replayed it three times and nothing happened" looks like a bug rather than
 * a policy that decided the signal was never worth a wake-up.
 */
function escalationNote(decision: Decision): string {
  // Only a repeated signal that is still staying quiet owes the caller an explanation.
  if (decision.route !== "silent_log" && decision.route !== "hold_for_digest") return "";
  if (decision.deferrals < policy.escalationRepeats) {
    return `Still quiet by design. ${policy.escalationRepeats - decision.deferrals} more deferral(s) before the escalation valve is considered.`;
  }
  const lift = decision.factors.find((factor) => factor.key === "escalation");
  return lift
    ? `Escalation was scored in and still did not clear the bar of ${policy.thresholds.speak}; the digest is the right answer for this one.`
    : `The house has been kept from this ${decision.deferrals} times, and the valve is capped at ${policy.escalationMaxLift}x the ${decision.attention} this signal was ever worth. Some things stay quiet on purpose.`;
}

function topFactor(decision: Decision): string {
  const sorted = [...decision.factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return sorted.slice(0, 2).map((factor) => `${factor.label} (${factor.points}: ${factor.note})`).join("; ");
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "hush-alexa-plus",
    version: "0.2.0"
  });

  server.registerTool(
    "get_home_context",
    {
      title: "Get home context",
      description:
        "Snapshot of the simulated household: scene, clock, who is home, what each person is doing, the next natural break, and how many signals are still untriaged. Call this before deciding whether to speak.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => asText(homeStore.context())
  );

  server.registerTool(
    "list_scenarios",
    {
      title: "List demo scenarios",
      description: "List the household scenarios that can be loaded for a demo take.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => asText(homeStore.listScenarios())
  );

  server.registerTool(
    "load_scenario",
    {
      title: "Load scenario",
      description:
        "Load one scenario (weeknight_chaos, movie_night, bedtime, guest_arrival). Resets the clock, the pending event queue, and the decision ledger so a demo take is repeatable.",
      inputSchema: {
        scenario_id: z.enum(["weeknight_chaos", "movie_night", "bedtime", "guest_arrival"]).describe("Scenario id from list_scenarios")
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    async ({ scenario_id }) => asText({ loaded: scenario_id, ...homeStore.loadScenario(scenario_id) })
  );

  server.registerTool(
    "get_pending_events",
    {
      title: "Get pending household signals",
      description: "List the signals that have arrived but have not been triaged yet.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => asText({ clock: homeStore.now, pending: homeStore.pending() })
  );

  server.registerTool(
    "evaluate_interruption",
    {
      title: "Triage one signal",
      description:
        "The core Hush decision. Takes one household signal id and returns exactly what Alexa+ should do: speak_now, whisper_display (screen only, no voice), hold_for_digest (say it at the next natural break), or silent_log (act without announcing). Includes the scored factors so the decision is auditable.",
      inputSchema: {
        event_id: z
          .string()
          .describe("Signal id from get_pending_events, e.g. evt-grandma. Idempotent: re-calling it returns the stored verdict; use replay_signal to model the device firing again.")
      },
      outputSchema: { decision: decisionOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ event_id }) => {
      try {
        const decision = homeStore.evaluate(event_id);
        return {
          content: [{ type: "text", text: routeSentence(decision) }],
          structuredContent: { decision }
        };
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "route_pending_events",
    {
      title: "Triage every pending signal",
      description:
        "Run the interruption policy over every pending signal at once and return the full routing table. This is the fast path for the demo and for batch briefings.",
      inputSchema: {},
      outputSchema: { decisions: z.array(decisionOutput) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async () => {
      const decisions = homeStore.evaluateAll();
      return {
        content: [{ type: "text", text: decisions.map(routeSentence).join("\n\n") || "Nothing pending." }],
        structuredContent: { decisions }
      };
    }
  );

  server.registerTool(
    "replay_signal",
    {
      title: "Replay a signal",
      description:
        "Simulate the same device firing again (a second doorbell ring, a repeated email). Hush counts how often it has already hidden this signal, and speaks it once being ignored is itself the news - but only for a signal worth interrupting anyone for.",
      inputSchema: { event_id: z.string().describe("Signal id that was already triaged") },
      outputSchema: { decision: decisionOutput },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ event_id }) => {
      try {
        const alreadyTriaged = homeStore.ledgerEntries().some((entry) => entry.eventId === event_id);
        const decision = homeStore.replay(event_id);
        if (!alreadyTriaged) {
          return {
            content: [{ type: "text", text: `${routeSentence(decision)}\nFirst sighting of this signal; a signal needs two quiet deferrals before the escalation valve is even considered.` }],
            structuredContent: { decision }
          };
        }
        return {
          content: [{ type: "text", text: `${routeSentence(decision)}\n${escalationNote(decision)}` }],
          structuredContent: { decision }
        };
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "get_quiet_queue",
    {
      title: "Read the quiet queue",
      description: "Show the signals Hush is holding back, and the break each one is waiting for.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => asText({ clock: homeStore.now, holding: homeStore.quietQueue() })
  );

  server.registerTool(
    "deliver_digest",
    {
      title: "Deliver the held-news digest",
      description:
        "Speak everything that was deferred once the household reaches a natural break. Pair with advance_home_clock to reach the break.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async () => asText(homeStore.deliverDigest())
  );

  server.registerTool(
    "explain_decision",
    {
      title: "Explain a past decision",
      description:
        "Replay the scoring for one decision id so a family member (or a judge) can see why Alexa+ stayed quiet or interrupted.",
      inputSchema: { decision_id: z.string().describe("Decision id such as dec-3") },
      outputSchema: { decision: decisionOutput },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ decision_id }) => {
      try {
        return {
          content: [{ type: "text", text: routeSentence(homeStore.explain(decision_id)) }],
          structuredContent: { decision: homeStore.explain(decision_id) }
        };
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "set_person_focus",
    {
      title: "Update a person's focus state",
      description:
        "Household-side policy control: mark someone as free, focused, do_not_disturb, or asleep. Later triage decisions react immediately.",
      inputSchema: {
        person_id: z.string().describe("Person id from get_home_context, e.g. mathieu"),
        focus: z.enum(["free", "focused", "do_not_disturb", "asleep"])
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ person_id, focus }) => {
      try {
        return asText({ updated: homeStore.setFocus(person_id, focus), context: homeStore.context() });
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "advance_home_clock",
    {
      title: "Advance the simulated clock",
      description: "Move the simulated household clock forward in minutes so deferred news becomes due.",
      inputSchema: { minutes: z.number().int().min(0).max(600).default(15) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ minutes }) => asText(homeStore.advanceClock(minutes))
  );

  server.registerTool(
    "reset_home_state",
    {
      title: "Reset the household",
      description: "Reset the current scenario to its starting state. Useful between video takes.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    async () => asText({ reset: homeStore.scenarioId, ...homeStore.reset() })
  );

  server.registerResource(
    "home-context",
    "hush://home/context",
    {
      title: "Live household context",
      description: "Machine-readable household state, for clients that prefer resources over tools.",
      mimeType: "application/json"
    },
    async () => ({ contents: [{ uri: "hush://home/context", mimeType: "application/json", text: JSON.stringify(homeStore.snapshot(), null, 2) }] })
  );

  server.registerResource(
    "quiet-queue",
    "hush://quiet-queue",
    {
      title: "Quiet queue",
      description: "Everything Hush is currently holding back from the household.",
      mimeType: "application/json"
    },
    async () => ({ contents: [{ uri: "hush://quiet-queue", mimeType: "application/json", text: JSON.stringify(homeStore.quietQueue(), null, 2) }] })
  );

  server.registerResource(
    "decision-audit",
    new ResourceTemplate("hush://decisions/{id}", {
      list: () => ({
        resources: homeStore.ledgerEntries().map((decision) => ({
          uri: `hush://decisions/${decision.id}`,
          name: `${decision.id} - ${decision.route}`,
          description: decision.label,
          mimeType: "application/json"
        }))
      })
    }),
    {
      title: "Decision audit record",
      description: "Full scoring breakdown for one routing decision, addressable by id.",
      mimeType: "application/json"
    },
    async (_uri, { id }) => {
      try {
        return { contents: [{ uri: `hush://decisions/${id}`, mimeType: "application/json", text: JSON.stringify(homeStore.explain(String(id)), null, 2) }] };
      } catch (error) {
        return { isError: true, contents: [{ uri: `hush://decisions/${id}`, mimeType: "text/plain", text: String(error) }] };
      }
    }
  );

  server.registerPrompt(
    "triage_this_signal",
    {
      title: "Triage this signal",
      description: "Ask an MCP client to route one household signal through the Hush policy and announce only what clears the bar.",
      argsSchema: { event_id: z.string() }
    },
    ({ event_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Call the evaluate_interruption tool with event_id "${event_id}".`,
              "If the route is speak_now, say the spoken line out loud in one short sentence.",
              "If the route is whisper_display, do not speak: send the display line to the nearest screen.",
              "If the route is hold_for_digest, stay silent and confirm the hold time in the app transcript only.",
              "If the route is silent_log, perform the device action with no announcement.",
              "Never invent an interruption that the policy did not approve."
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "three_minute_demo",
    {
      title: "Run the 3 minute demo",
      description:
        "Turn-by-turn script for an MCP client to reproduce the hackathon demo without a human clicking around. Every step is asserted by npm run smoke, so the narration cannot drift from the engine."
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Run this sequence and narrate each step in one sentence:",
              "1. load_scenario(weeknight_chaos).",
              "2. get_home_context and state who is doing what at 18:47.",
              "3. get_pending_events: eight signals arrived in two minutes.",
              "4. For each signal call evaluate_interruption and read the route aloud.",
              "5. get_quiet_queue: show what Alexa+ refused to say.",
              "6. Pick a held item that is worth interrupting for and replay_signal it twice.",
              "   The third sighting speaks out loud with an escalation factor on its own row.",
              "   If it stays quiet, replay_signal has already told you why: the valve is capped at",
              `   ${policy.escalationMaxLift}x the attention that signal was ever worth.`,
              "7. advance_home_clock(140) then deliver_digest: one batched announcement, not three pings.",
              "8. explain_decision on the loudest disagreement and read the two biggest factors.",
              "9. load_scenario(bedtime) and route_pending_events: no row is spoken out loud; a water",
              "   leak still gets acted on, as a card and a device action instead of a shout.",
              "10. load_scenario(movie_night) and route_pending_events: two signals take the",
              "    whisper_display card route while the household watches a film.",
              "11. reset_home_state so the next take starts clean.",
              `Policy in force: speak when the score is >= ${policy.thresholds.speak}, whisper >= ${policy.thresholds.whisper}, mention >= ${policy.thresholds.worthMentioning}.`
            ].join("\n")
          }
        }
      ]
    })
  );

  return server;
}
