import assert from "node:assert/strict";
import test from "node:test";
import { HomeStore } from "../src/domain/state.js";
import { policy } from "../src/domain/triage.js";
import { scenarios } from "../src/domain/scenarios.js";

test("weeknight: the dishwasher is not worth interrupting anyone for", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-dishwasher");
  assert.equal(decision.route, "silent_log");
  assert.equal(decision.spoken, null);
});

test("weeknight: school admin is held for the homework checkpoint, not spoken", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-school");
  assert.equal(decision.route, "hold_for_digest");
  assert.ok(decision.heldUntil);
  assert.equal(Number.isNaN(Number(decision.heldUntil!.at.split(":")[0])), false);
});

test("weeknight: a package at the door reaches Ana out loud", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-doorbell");
  assert.equal(decision.route, "speak_now");
  assert.match(decision.spoken ?? "", /Ana/);
});

test("weeknight: grandma at the gate outranks the do-not-disturb office", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-grandma");
  assert.equal(decision.route, "speak_now");
  assert.ok(decision.net > 30);
});

test("weeknight: the smoke detector ignores every soft rule", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-smoke");
  assert.equal(decision.route, "speak_now");
  assert.match(decision.overrideReason ?? "", /safety override/);
});

test("weeknight: every deferral is explainable with scored factors", () => {
  const store = new HomeStore("weeknight_chaos");
  const decision = store.evaluate("evt-school");
  const keys = decision.factors.map((factor) => factor.key);
  assert.deepEqual(keys, ["urgency", "relevance", "freshness", "actionability", "scene_cost", "focus_cost", "quiet_window"]);
  assert.ok(decision.factors.some((factor) => factor.points < 0));
});

test("movie night: the courier gets a hallway card instead of a spoken interruption", () => {
  const store = new HomeStore("movie_night");
  const decision = store.evaluate("evt-pizza");
  assert.equal(decision.route, "whisper_display");
  assert.equal(decision.spoken, null);
  assert.match(decision.display ?? "", /movie night/);
});

test("movie night: a low-urgency battery reminder never reaches a human", () => {
  const store = new HomeStore("movie_night");
  assert.equal(store.evaluate("evt-charger").route, "silent_log");
});

test("bedtime: a water leak closes the valve and only whispers", () => {
  const store = new HomeStore("bedtime");
  const decision = store.evaluate("evt-drip");
  assert.equal(decision.route, "whisper_display");
  assert.match(decision.deviceAction ?? "", /shut-off valve/);
});

test("bedtime: everything routes below speak except a genuine emergency", () => {
  const store = new HomeStore("bedtime");
  const routes = store.evaluateAll().map((decision) => decision.route);
  assert.equal(routes.includes("speak_now"), false);
});

test("focus changes are reflected immediately by the next decision", () => {
  const store = new HomeStore("movie_night");
  assert.equal(store.evaluate("evt-permission").route, "whisper_display");
  const quiet = new HomeStore("movie_night");
  quiet.setFocus("lina", "asleep");
  quiet.setFocus("ana", "asleep");
  quiet.setFocus("mathieu", "asleep");
  assert.equal(quiet.evaluate("evt-permission").route, "hold_for_digest");
});

test("repeat deferrals escalate instead of staying invisible forever", () => {
  const store = new HomeStore("weeknight_chaos");
  assert.equal(store.evaluate("evt-school").route, "hold_for_digest");
  assert.equal(store.replay("evt-school").route, "hold_for_digest");
  const third = store.replay("evt-school");
  assert.equal(third.route, "speak_now");
  assert.match(third.overrideReason ?? "", /escalated after 2 quiet deferrals/);
  assert.ok(third.factors.some((factor) => factor.key === "escalation"));
});

test("deferred news is delivered at the break, not before", () => {
  const store = new HomeStore("weeknight_chaos");
  store.evaluate("evt-school");
  store.evaluate("evt-screentime");
  const held = store.quietQueue();
  assert.ok(held.length >= 1);
  const before = store.deliverDigest();
  assert.deepEqual(before.items, []);
  store.advanceClock(140);
  const digest = store.deliverDigest();
  assert.ok(digest.items.length >= 1);
  assert.match(digest.spoken, /kept quiet earlier/);
});

test("reset restores the starting state for repeatable takes", () => {
  const store = new HomeStore("bedtime");
  store.evaluateAll();
  const before = store.snapshot();
  const totalSignals = before.pending.length + before.ledger.length;
  store.reset();
  const after = store.snapshot();
  assert.equal(after.pending.length, totalSignals);
  assert.equal(after.ledger.length, 0);
  assert.equal(after.clock, "21:25");
});

test("a deferred signal claims no surface, a whispered one names exactly one", () => {
  const store = new HomeStore("bedtime");
  const held = store.evaluate("evt-motion");
  assert.equal(held.route, "hold_for_digest");
  assert.deepEqual(held.surfaces, []);
  const whispered = store.evaluate("evt-drip");
  assert.equal(whispered.route, "whisper_display");
  assert.equal(whispered.surfaces.length, 1);
});

test("deferred decisions still report what the display route would have cost", () => {
  const store = new HomeStore("bedtime");
  const held = store.evaluate("evt-motion");
  assert.ok(held.displayCost < held.interruptionCost);
  assert.equal(held.freeWitnesses.length, 1);
  assert.equal(held.freeWitnesses[0], "Ana");
});

test("digest wording names the break that is actually being reached", () => {
  const store = new HomeStore("weeknight_chaos");
  store.evaluate("evt-school");
  store.advanceClock(140);
  const digest = store.deliverDigest();
  assert.match(digest.spoken, /At the (\d{2}:\d{2} )?(\w[\w ]*)/);
  assert.ok(Number.parseInt(digest.spoken.match(/At the (\d{2}:\d{2})/)?.[1] ?? "21:05", 10) <= 21 * 60 + 7);
});

test("a signal that escalated is no longer standing in the digest queue", () => {
  const store = new HomeStore("weeknight_chaos");
  store.evaluate("evt-school");
  store.evaluate("evt-courier");
  store.evaluate("evt-screentime");
  store.replay("evt-school");
  store.replay("evt-school");
  store.advanceClock(140);
  const digest = store.deliverDigest();
  // The escalated signal already got its interruption, so the digest must not repeat it.
  assert.equal((digest.spoken.match(/Swimming kit/g) ?? []).length, 0);
  assert.equal(digest.items.length, 2);
  assert.match(digest.spoken, /I held 2 things/);
  assert.match(digest.spoken, /At the 19:15 homework checkpoint/);
});

test("a re-fired signal replaces its own ledger row instead of duplicating news", () => {
  const store = new HomeStore("weeknight_chaos");
  store.evaluate("evt-school");
  store.replay("evt-school");
  const final = store.replay("evt-school");
  assert.equal(store.ledgerEntries().length, 1);
  assert.equal(final.route, "speak_now");
  assert.match(final.overrideReason ?? "", /escalated after 2 quiet deferrals/);
  assert.ok(store.quietQueue().length === 0);
});

test("an escalated signal keeps the audit id families already read", () => {
  const store = new HomeStore("weeknight_chaos");
  const held = store.evaluate("evt-school");
  store.replay("evt-school");
  const escalated = store.replay("evt-school");
  assert.equal(escalated.id, held.id, "the verdict changed, the audit trail reference must not");
  assert.equal(escalated.route, "speak_now");
  // The ledger stays a contiguous set of ids, so explain_decision(dec-N) works for every row
  // the UI shows and nothing references a decision that was never rendered.
  assert.deepEqual(store.ledgerEntries().map((decision) => decision.id), [held.id]);
  assert.equal(store.explain(held.id).route, "speak_now");
});

test("a re-fired signal is counted once in the quiet queue too", () => {
  const store = new HomeStore("weeknight_chaos");
  store.evaluate("evt-school");
  store.replay("evt-school");
  const queue = store.quietQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].eventId, "evt-school");
  assert.equal(store.snapshot().quietQueue.length, 1);
});

test("evaluate_interruption is idempotent; only replay_signal can escalate", () => {
  const store = new HomeStore("weeknight_chaos");
  const first = store.evaluate("evt-school");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const again = store.evaluate("evt-school");
    assert.equal(again.route, first.route, "re-reading a decision must not change the household");
  }
  assert.equal(store.ledgerEntries().length, 1);
  assert.notEqual(store.replay("evt-school").route, "speak_now");
  assert.equal(store.replay("evt-school").route, "speak_now");
});

test("every row the UI renders is one arithmetic sum", () => {
  // The ledger prints "attention N - net M" and the transcript prints "(net M)", so the numbers
  // on screen have to agree with each other for every route the demo can show - including a
  // whispered card, which pays the cheaper display cost, and an escalated row, whose safety valve
  // is scored rather than waved at.
  const near = (left: number, right: number) => Math.abs(left - right) < 0.05;
  const cases = [
    ["weeknight_chaos", "evt-doorbell"],
    ["weeknight_chaos", "evt-smoke"],
    ["weeknight_chaos", "evt-school"],
    ["weeknight_chaos", "evt-dishwasher"],
    ["movie_night", "evt-pizza"],
    ["bedtime", "evt-drip"],
    ["bedtime", "evt-nanou-call"],
    ["guest_arrival", "evt-luggage"]
  ] as const;
  for (const [scenarioId, eventId] of cases) {
    const store = new HomeStore(scenarioId);
    let decision = store.evaluate(eventId);
    for (const label of ["as first sighted", "after one deferral", "after two deferrals"]) {
      if (label !== "as first sighted") decision = store.replay(eventId);
      const cost = decision.route === "whisper_display" ? decision.displayCost : decision.interruptionCost;
      assert.ok(
        near(decision.attention - cost, decision.net),
        `${scenarioId}/${eventId} ${label}: attention ${decision.attention} - cost ${cost} must be the net ${decision.net}`
      );
      if (decision.route === "speak_now") {
        assert.ok(decision.net >= 0, `${scenarioId}/${eventId} must not say speak now on a negative score`);
      }
    }
  }
});

test("being ignored is news, not a substitute for mattering", () => {
  // The escalation valve is a safety net, not a score inflation engine. A signal that was
  // barely worth logging must not be lifted into an alarm just because nobody heard it twice,
  // and a row that says "speak now" must never print a negative net next to those words.
  const near = (left: number, right: number) => Math.abs(left - right) < 0.05;
  for (const scenario of scenarios) {
    const store = new HomeStore(scenario.id);
    for (const event of store.pending()) {
      let decision = store.evaluate(event.id);
      const earned = decision.attention;
      for (const sighting of ["second", "third", "fourth", "fifth"]) {
        decision = store.replay(event.id);
        const lift = decision.attention - earned;
        assert.ok(
          lift <= earned * policy.escalationMaxLift + 0.05,
          `${scenario.id}/${event.id} ${sighting} sighting: lifted ${lift} on a signal worth ${earned}`
        );
        assert.ok(decision.attention <= 100, `${scenario.id}/${event.id} attention escaped the scale: ${decision.attention}`);
        if (decision.route === "speak_now") {
          assert.ok(near(decision.attention - decision.interruptionCost, decision.net), `${scenario.id}/${event.id} spoken row is not one sum`);
          assert.ok(decision.net >= 0, `${scenario.id}/${event.id} spoke out loud on a negative net ${decision.net}`);
        }
      }
    }
  }
});
