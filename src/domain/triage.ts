import type { Decision, Factor, FocusState, HomeEvent, NaturalBreak, Person, Route, Scenario } from "./types.js";

/**
 * The interruption policy. Deterministic on purpose: a household assistant has
 * to be auditable before it is clever. Every number below is surfaced by the
 * explain_decision MCP tool and rendered in the demo ledger.
 */
export const policy = {
  weights: { urgency: 0.45, relevance: 0.2, actionability: 0.15 },
  freshnessBonusMax: 15,
  freshnessDecayPerMinute: 1.5,
  focusCost: {
    free: 0,
    focused: 24,
    do_not_disturb: 38,
    asleep: 55
  } satisfies Record<FocusState, number>,
  /** A display-only card is cheaper than speech, and only lands if someone free can read it. */
  whisperSceneFactor: 0.55,
  whisperFocusFactor: 0.45,
  thresholds: {
    speak: 24,
    whisper: 10,
    worthMentioning: 30,
    digestTolerance: 55
  },
  escalationRepeats: 2,
  /**
   * What "the household has already been kept from this twice" is worth on the score. It is a
   * floor, not the whole ladder: a signal buried under a focused household needs more than a flat
   * bonus to be worth interrupting anyone for, so the credit tops the score up to the threshold it
   * must clear. Whatever the factors list shows is the number the verdict was actually made on,
   * which is what keeps the safety valve arithmetic instead of magic.
   */
  escalationCredit: 30,
  /**
   * The ceiling on that ladder, as a multiple of the attention the signal earned on its own
   * merits. Being ignored is news, but it is not a substitute for the signal mattering: a
   * dishwasher worth 9.7 must not escalate into a 98-point alarm.
   */
  escalationMaxLift: 2
};

export function toMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function ageInMinutes(clock: string, occurredAt: string): number {
  return Math.max(0, toMinutes(clock) - toMinutes(occurredAt));
}

export function attentionScore(event: HomeEvent, clock: string): { total: number; factors: Factor[] } {
  const age = ageInMinutes(clock, event.occurredAt);
  const freshness = Math.max(0, policy.freshnessBonusMax - age * policy.freshnessDecayPerMinute);
  const factors: Factor[] = [
    {
      key: "urgency",
      label: "Signal urgency",
      points: round(event.urgency * policy.weights.urgency),
      note: `${event.source} rates this ${event.urgency}/100 on its own`
    },
    {
      key: "relevance",
      label: "Household relevance",
      points: round(event.relevance * policy.weights.relevance),
      note: event.audience.length ? `about ${event.audience.join(", ")}` : "nobody in particular"
    },
    {
      key: "freshness",
      label: "Freshness",
      points: round(freshness),
      note: age === 0 ? "happening right now" : `${age} min old`
    },
    {
      key: "actionability",
      label: "Can we act now",
      points: round(event.actionability * policy.weights.actionability),
      note: `${event.actionability}/100 actionable at this moment`
    }
  ];
  return { total: round(factors.reduce((sum, factor) => sum + factor.points, 0)), factors };
}

function pickRecipient(event: HomeEvent, people: Person[]): Person | undefined {
  const roster = people.filter((person) => event.audience.includes(person.id));
  const pool = roster.length ? roster : people;
  return [...pool].sort((a, b) => policy.focusCost[a.focus] - policy.focusCost[b.focus])[0];
}

/** The first break strictly after the clock, regardless of tolerance. */
export function firstUpcoming(scenario: Scenario, clock: string): NaturalBreak | undefined {
  const now = toMinutes(clock);
  return scenario.scene.breaks
    .filter((candidate) => toMinutes(candidate.at) > now)
    .sort((a, b) => toMinutes(a.at) - toMinutes(b.at))[0];
}

export function nextBreak(scenario: Scenario, clock: string): NaturalBreak | undefined {
  const now = toMinutes(clock);
  const upcoming = scenario.scene.breaks
    .filter((break_) => toMinutes(break_.at) > now)
    .sort((a, b) => toMinutes(a.at) - toMinutes(b.at));
  return (
    upcoming.find((break_) => break_.tolerance >= policy.thresholds.digestTolerance) ??
    upcoming[0] ??
    scenario.scene.breaks[0]
  );
}

function audienceNames(event: HomeEvent, people: Person[]): string {
  const names = people.filter((person) => event.audience.includes(person.id)).map((person) => person.name);
  if (names.length === 0) return "the household";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function followUp(event: HomeEvent, route: Route): string | null {
  if (route !== "speak_now") return null;
  if (event.safetyOverride) return "Everybody look up for a second.";
  if (event.deviceAction) return `I can ${lower(event.deviceAction)}. Want me to?`;
  if (event.actionability >= 70) return "Do you want me to handle it?";
  if (event.actionability >= 45) return "Nothing needed yet, but it is time-sensitive.";
  return null;
}

function lower(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export function evaluateEvent(args: {
  scenario: Scenario;
  clock: string;
  event: HomeEvent;
  repeatCount: number;
  decisionId: string;
}): Decision {
  const { scenario, clock, event, repeatCount, decisionId } = args;
  const { total: attention, factors } = attentionScore(event, clock);
  const recipient = pickRecipient(event, scenario.people);
  const freeAudience = scenario.people.filter(
    (person) => event.audience.includes(person.id) && person.focus === "free"
  );

  const speakCost = scenario.scene.interruptCost + policy.focusCost[recipient?.focus ?? "free"];
  const whisperCost =
    scenario.scene.interruptCost * policy.whisperSceneFactor +
    policy.focusCost[recipient?.focus ?? "free"] * policy.whisperFocusFactor +
    (scenario.scene.quiet ? 10 : 0);
  const speakScore = round(attention - speakCost);
  const whisperScore = round(attention - whisperCost);

  const allFactors: Factor[] = [
    ...factors,
    {
      key: "scene_cost",
      label: "Scene cost",
      points: -round(scenario.scene.interruptCost),
      note: `scene "${scenario.scene.label}" is rated ${scenario.scene.interruptCost}/100 interrupt-costly`
    },
    {
      key: "focus_cost",
      label: "Recipient focus",
      points: -round(policy.focusCost[recipient?.focus ?? "free"]),
      note: recipient ? `${recipient.name} is ${recipient.focus.replace(/_/g, " ")}` : "nobody at home"
    },
    {
      key: "quiet_window",
      label: "Quiet window",
      points: scenario.scene.quiet ? -10 : 0,
      note: scenario.scene.quiet ? "house is in a quiet window" : "no quiet window active"
    }
  ];
  // Being held quietly twice is itself the news, so it lifts the score by at least the policy
  // floor. That is what makes "why did it suddenly speak" answer with arithmetic: the row is one
  // sum - attention - what this verdict costs = net - and a signal Alexa+ says out loud can never
  // print a negative score next to the words "speak now".
  const valveReady = !event.safetyOverride && repeatCount >= policy.escalationRepeats;
  const escalationCredit = valveReady ? escalationLift(attention, speakScore) : 0;
  const attentionReported = round(attention + escalationCredit);
  const escalated = valveReady && escalationCredit > 0 && round(attentionReported - speakCost) >= policy.thresholds.speak;
  if (escalated) {
    allFactors.push({
      key: "escalation",
      label: "Repeat escalation",
      points: escalationCredit,
      note: `held ${repeatCount} times already; the household is not being told`
    });
  }

  let route: Route;
  let overrideReason: string | null = null;
  if (event.safetyOverride) {
    route = "speak_now";
    overrideReason = "safety override declared by the device";
  } else if (escalated) {
    // escalationLift only returns a credit that clears the bar, so a row that says "speak now"
    // can never print a negative net next to the words that justified it.
    route = "speak_now";
    overrideReason = `escalated after ${repeatCount} quiet deferrals`;
  } else if (speakScore >= policy.thresholds.speak) {
    route = "speak_now";
  } else if (attention >= policy.thresholds.worthMentioning && freeAudience.length > 0 && whisperScore >= policy.thresholds.whisper) {
    route = "whisper_display";
  } else if (attention >= policy.thresholds.worthMentioning) {
    route = "hold_for_digest";
  } else {
    route = "silent_log";
  }

  const surfaces = route === "speak_now"
    ? [...new Set(scenario.people.filter((person) => event.audience.includes(person.id) || person.focus === "free").map((person) => person.surface))]
    : route === "whisper_display"
      ? freeAudience.map((person) => person.surface)
      : [];

  const held = route === "hold_for_digest" ? nextBreak(scenario, clock) ?? null : null;
  const names = audienceNames(event, scenario.people);
  const sentence = event.speech ?? `${lower(event.label)}.`;
  const spoken = route === "speak_now" ? [`${names}, ${sentence}`, followUp(event, route)].filter(Boolean).join(" ") : null;
  const display =
    route === "whisper_display"
      ? `${event.label} - ${event.source}. Tapped to ${freeAudience.map((person) => person.name).join(", ")}; voice kept quiet because the house is in ${scenario.scene.label}.`
      : route === "hold_for_digest"
        ? `Held for the ${held ? `${held.at} ${held.label}` : "next natural break"}: ${event.label}.`
        : route === "silent_log"
          ? `Logged quietly: ${event.label}. ${event.deviceAction ? `Device action taken - ${lower(event.deviceAction)}.` : "No interruption needed."}`
          : null;

  return {
    id: decisionId,
    eventId: event.id,
    label: event.label,
    source: event.source,
    route,
    attention: attentionReported,
    interruptionCost: round(route === "whisper_display" ? whisperCost : speakCost),
    displayCost: round(whisperCost),
    freeWitnesses: freeAudience.map((person) => person.name),
    // A whispered card is the cheaper path, so the row reports the score the family actually
    // paid for that verdict; every other route is the plain attention minus the speak cost.
    net: route === "whisper_display" ? round(attentionReported - whisperCost) : round(attentionReported - speakCost),
    audience: event.audience,
    // A deferred signal has no surface yet; it lands in the digest, not on a screen.
    surfaces: route === "hold_for_digest" || route === "silent_log" ? [] : surfaces,
    spoken,
    display,
    heldUntil: held,
    deviceAction: event.deviceAction ?? null,
    overrideReason,
    deferrals: repeatCount,
    factors: allFactors,
    decidedAt: clock
  };
}

export function digestLines(decisions: Decision[]): string[] {
  return decisions
    .filter((decision) => decision.route === "hold_for_digest" || decision.route === "silent_log")
    .map((decision) => decision.display ?? decision.label)
    .filter((line): line is string => Boolean(line));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * How much a third sighting is allowed to add: at least the policy floor, or exactly as much as
 * it takes to clear the speak bar, and never more than `escalationMaxLift` times the attention
 * the signal was ever worth. If that ceiling cannot clear the bar on its own, the signal stays
 * quiet - repetition forgives a middling signal, it does not rescue a trivial one. The row then
 * prints the credit it actually used, so "why did the dishwasher not speak" stays answerable as
 * arithmetic instead of as a special case.
 */
function escalationLift(attention: number, speakScore: number): number {
  const wanted = Math.max(policy.escalationCredit, policy.thresholds.speak - speakScore);
  const ceiling = round(attention * policy.escalationMaxLift);
  return ceiling >= wanted ? wanted : 0;
}
