import { evaluateEvent, firstUpcoming, formatMinutes, nextBreak, toMinutes } from "./triage.js";
import { findScenario, scenarios } from "./scenarios.js";
import type { Decision, FocusState, HomeEvent, NaturalBreak, Scenario } from "./types.js";

/**
 * Single-process demo state. A production deployment would key this per
 * household and per Alexa+ account; for the hackathon the whole demo shares one
 * household so that MCP calls, the browser surface, and the tests all agree.
 */
export class HomeStore {
  private scenario: Scenario;
  private clock: number;
  private evaluated = new Set<string>();
  private ledger: Decision[] = [];
  /** How often each signal has been deferred or dropped, surviving its own replacement. */
  private deferrals = new Map<string, number>();
  /** The decision id a signal was first triaged under, so the audit trail keeps one id. */
  private decisionIds = new Map<string, string>();
  private sequence = 0;

  constructor(scenarioId = scenarios[0].id) {
    this.scenario = clone(scenarioOrThrow(scenarioId));
    this.clock = toMinutes(this.scenario.clock);
  }

  get scenarioId(): string {
    return this.scenario.id;
  }

  get now(): string {
    return formatMinutes(this.clock);
  }

  listScenarios() {
    return scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      tagline: scenario.tagline,
      events: scenario.events.length
    }));
  }

  loadScenario(scenarioId: string): ReturnType<HomeStore["snapshot"]> {
    this.scenario = clone(scenarioOrThrow(scenarioId));
    this.clock = toMinutes(this.scenario.clock);
    this.evaluated = new Set();
    this.ledger = [];
    this.deferrals = new Map();
    this.decisionIds = new Map();
    this.sequence = 0;
    return this.snapshot();
  }

  reset(): ReturnType<HomeStore["snapshot"]> {
    return this.loadScenario(this.scenario.id);
  }

  context() {
    return {
      householdName: "Maison Roux",
      scenario: { id: this.scenario.id, label: this.scenario.label, tagline: this.scenario.tagline },
      clock: this.now,
      scene: this.scenario.scene,
      people: this.scenario.people,
      surfaces: this.scenario.scene.surfaces,
      nextBreak: nextBreak(this.scenario, this.now) ?? null
    };
  }

  pending(): HomeEvent[] {
    return this.scenario.events.filter((event) => !this.evaluated.has(event.id));
  }

  ledgerEntries(): Decision[] {
    return [...this.ledger];
  }

  quietQueue(): Decision[] {
    return this.ledger.filter(
      (decision) => decision.route === "hold_for_digest" && toMinutes(decision.heldUntil?.at ?? "23:59") >= this.clock
    );
  }

  evaluate(eventId: string): Decision {
    const event = this.scenario.events.find((candidate) => candidate.id === eventId);
    if (!event) {
      throw new Error(`Unknown event "${eventId}". Pending: ${this.pending().map((item) => item.id).join(", ") || "none"}`);
    }
    if (this.evaluated.has(eventId)) {
      const prior = this.ledger.find((decision) => decision.eventId === eventId);
      if (prior) return prior;
    }
    const repeatCount = this.deferrals.get(eventId) ?? 0;
    const decision = evaluateEvent({
      scenario: this.scenario,
      clock: this.now,
      event,
      repeatCount,
      decisionId: this.auditIdFor(eventId)
    });
    this.evaluated.add(eventId);
    // One ledger row per signal: a re-fired signal replaces its earlier verdict, so the
    // audit trail and the digest never report the same news twice.
    const prior = this.ledger.findIndex((candidate) => candidate.eventId === eventId);
    if (prior === -1) this.ledger.push(decision);
    else this.ledger[prior] = decision;
    if (decision.route === "hold_for_digest" || decision.route === "silent_log") {
      this.deferrals.set(eventId, repeatCount + 1);
    } else {
      this.deferrals.delete(eventId);
    }
    return decision;
  }

  /**
   * One audit id per signal. A verdict that is rewritten by an escalation keeps the id families
   * and MCP clients already read, so the ledger never references a number that is not in it.
   */
  private auditIdFor(eventId: string): string {
    const existing = this.decisionIds.get(eventId);
    if (existing) return existing;
    const created = `dec-${++this.sequence}`;
    this.decisionIds.set(eventId, created);
    return created;
  }

  /**
   * A device firing again: the same signal re-enters the queue and gets escalated if we keep
   * hiding it. This is the only path that escalates - evaluate() is deliberately idempotent so
   * a client can re-read a decision without changing the household's memory of it.
   */
  replay(eventId: string): Decision {
    if (!this.scenario.events.some((event) => event.id === eventId)) {
      throw new Error(`Unknown event "${eventId}".`);
    }
    this.evaluated.delete(eventId);
    return this.evaluate(eventId);
  }

  evaluateAll(): Decision[] {
    return this.pending().map((event) => this.evaluate(event.id));
  }

  explain(decisionId: string): Decision {
    const decision = this.ledger.find((candidate) => candidate.id === decisionId);
    if (!decision) {
      throw new Error(`Unknown decision "${decisionId}". Known: ${this.ledger.map((item) => item.id).join(", ") || "none"}`);
    }
    return decision;
  }

  setFocus(personId: string, focus: FocusState) {
    const person = this.scenario.people.find((candidate) => candidate.id === personId);
    if (!person) {
      throw new Error(`Unknown person "${personId}". Known: ${this.scenario.people.map((item) => item.id).join(", ")}`);
    }
    person.focus = focus;
    return person;
  }

  advanceClock(minutes: number): { clock: string; reachedBreak: NaturalBreak | null } {
    this.clock += minutes;
    return { clock: this.now, reachedBreak: nextBreak(this.scenario, this.now) ?? null };
  }

  deliverDigest() {
    const due = this.ledger.filter(
      (decision) => decision.route === "hold_for_digest" && decision.heldUntil && toMinutes(decision.heldUntil.at) <= this.clock
    );
    const reached = due
      .map((decision) => decision.heldUntil)
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => toMinutes(a.at) - toMinutes(b.at))
      .at(-1);
    const break_ = reached ?? firstUpcoming(this.scenario, this.now) ?? nextBreak(this.scenario, this.now);
    if (due.length === 0) {
      return {
        spoken: `Nothing is waiting for you right now.`,
        items: [],
        nextDigestAt: firstUpcoming(this.scenario, this.now)?.at ?? null
      };
    }
    const lines = [...new Map(due.map((decision) => [decision.eventId, decision])).values()];
    const spoken = [
      `Here is what I kept quiet earlier. At the ${break_?.at ?? ""} ${break_?.label ?? "next break"}, I held ${lines.length} thing${lines.length === 1 ? "" : "s"}.`,
      ...lines.map((decision, index) => `${index + 1}. ${decision.label}.`)
    ].join(" ");
    return { spoken, items: due, nextDigestAt: break_?.at ?? null };
  }

  snapshot() {
    return {
      ...this.context(),
      pending: this.pending().map((event) => ({
        id: event.id,
        source: event.source,
        label: event.label,
        occurredAt: event.occurredAt
      })),
      quietQueue: this.quietQueue().map((decision) => ({
        id: decision.id,
        label: decision.label,
        heldUntil: decision.heldUntil
      })),
      ledger: this.ledgerEntries().map((decision) => ({
        id: decision.id,
        eventId: decision.eventId,
        label: decision.label,
        route: decision.route,
        net: decision.net,
        attention: decision.attention
      }))
    };
  }
}

function scenarioOrThrow(id: string): Scenario {
  const scenario = findScenario(id);
  if (!scenario) {
    throw new Error(`Unknown scenario "${id}". Known: ${scenarios.map((item) => item.id).join(", ")}`);
  }
  return scenario;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export const homeStore = new HomeStore();
