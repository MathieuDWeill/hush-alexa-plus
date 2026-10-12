export type SceneId = "weeknight_chaos" | "movie_night" | "bedtime" | "guest_arrival";

export type FocusState = "free" | "focused" | "do_not_disturb" | "asleep";

/**
 * How the household is told about an event. Device actuation is handled
 * separately (see deviceAction) so "what we say" stays decoupled from
 * "what the home does".
 */
export type Route = "speak_now" | "whisper_display" | "hold_for_digest" | "silent_log";

export type NaturalBreak = {
  at: string;
  label: string;
  /** 0-100: how willing the household is to hear a batch of news here. */
  tolerance: number;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  focus: FocusState;
  location: string;
  surface: string;
};

export type HomeEvent = {
  id: string;
  kind: string;
  source: string;
  label: string;
  detail: string;
  occurredAt: string;
  /** The sentence Alexa+ says out loud when the route is speak_now. */
  speech?: string;
  /** 0-100 prior: how time-critical this signal is on its own. */
  urgency: number;
  /** 0-100: how much this signal concerns a specific person at home. */
  relevance: number;
  /** Person ids that the signal is about. */
  audience: string[];
  /** 0-100: can the household actually act on it right now? */
  actionability: number;
  /** Bypasses scoring: the household must hear this immediately. */
  safetyOverride?: boolean;
  /** What the connected home can do without anyone being asked. */
  deviceAction?: string;
};

export type Scenario = {
  id: SceneId;
  label: string;
  tagline: string;
  clock: string;
  scene: {
    id: string;
    label: string;
    /** 0-100: how expensive an interruption is in this scene. */
    interruptCost: number;
    quiet: boolean;
    surfaces: string[];
    breaks: NaturalBreak[];
  };
  people: Person[];
  events: HomeEvent[];
};

export type Factor = {
  key: string;
  label: string;
  points: number;
  note: string;
};

export type Decision = {
  id: string;
  eventId: string;
  label: string;
  source: string;
  route: Route;
  attention: number;
  interruptionCost: number;
  /** Cost a display-only card would have had, kept for deferred routes. */
  displayCost: number;
  /** Household members who were free enough to read a card at decision time. */
  freeWitnesses: string[];
  net: number;
  audience: string[];
  surfaces: string[];
  spoken: string | null;
  display: string | null;
  heldUntil: NaturalBreak | null;
  deviceAction: string | null;
  overrideReason: string | null;
  /** How many times Hush had already hidden this signal when the verdict was made. */
  deferrals: number;
  factors: Factor[];
  decidedAt: string;
};
