import type { Scenario } from "./types.js";

export const scenarios: Scenario[] = [
  {
    id: "weeknight_chaos",
    label: "Weeknight, 18:47",
    tagline: "Documentary paused, Lina mid-homework, Mathieu on a hackathon call, Ana cooking.",
    clock: "18:47",
    scene: {
      id: "weeknight",
      label: "homework + documentary",
      interruptCost: 34,
      quiet: false,
      surfaces: ["Living Room Echo", "Hallway Echo Spot", "Kitchen Echo Dot"],
      breaks: [
        { at: "18:52", label: "documentary segment ends", tolerance: 40 },
        { at: "19:15", label: "homework checkpoint", tolerance: 60 },
        { at: "21:05", label: "dishes done", tolerance: 88 }
      ]
    },
    people: [
      { id: "mathieu", name: "Mathieu", role: "parent", focus: "do_not_disturb", location: "office", surface: "Office Echo Dot" },
      { id: "lina", name: "Lina", role: "student, 12", focus: "focused", location: "bedroom", surface: "Bedroom Echo Dot" },
      { id: "ana", name: "Ana", role: "parent", focus: "free", location: "kitchen", surface: "Kitchen Echo Dot" }
    ],
    events: [
      {
        id: "evt-dishwasher",
        kind: "appliance",
        source: "Dishwasher",
        label: "Dishwasher cycle finished",
        detail: "Cycle ended, nobody nearby to unload it.",
        occurredAt: "18:46",
        urgency: 8,
        relevance: 15,
        audience: ["ana"],
        actionability: 30
      },
      {
        id: "evt-school",
        kind: "message",
        source: "School portal",
        label: "Swimming kit due Friday",
        detail: "Admin note for Lina, no action needed before tomorrow.",
        occurredAt: "18:41",
        urgency: 22,
        relevance: 75,
        audience: ["lina"],
        actionability: 55
      },
      {
        id: "evt-courier",
        kind: "delivery",
        source: "Front door camera",
        label: "Courier scanned a parcel, no signature needed",
        detail: "Camera confidence 0.88, label readable, drop-off allowed.",
        occurredAt: "18:44",
        urgency: 34,
        relevance: 55,
        audience: ["mathieu"],
        actionability: 80,
        deviceAction: "Confirm the no-signature drop-off and log the parcel behind the door"
      },
      {
        id: "evt-doorbell",
        kind: "door",
        source: "Doorbell",
        label: "Someone is at the front door",
        detail: "Motion plus a package shape; visitor is not in the household roster.",
        speech: "someone is at the front door and it is not on the household list.",
        occurredAt: "18:47",
        urgency: 58,
        relevance: 70,
        audience: ["ana"],
        actionability: 85
      },
      {
        id: "evt-oven",
        kind: "appliance",
        source: "Oven",
        label: "Oven timer done, food still inside",
        detail: "Ana left the timer running while answering the door.",
        speech: "your oven timer finished and the food is still in.",
        occurredAt: "18:47",
        urgency: 66,
        relevance: 60,
        audience: ["ana"],
        actionability: 92,
        deviceAction: "Pulse the kitchen light and hold the extractor fan for 3 minutes"
      },
      {
        id: "evt-screentime",
        kind: "family",
        source: "Amazon Kids+ report",
        label: "Lina is 6 minutes over screen time",
        detail: "Soft limit reached during a homework break.",
        occurredAt: "18:39",
        urgency: 26,
        relevance: 65,
        audience: ["lina", "mathieu"],
        actionability: 45
      },
      {
        id: "evt-grandma",
        kind: "door",
        source: "Gate intercom",
        label: "Nanou is at the gate and cannot find the buzzer",
        detail: "Voice match confirmed against the household roster.",
        speech: "Nanou is at the gate and cannot find the buzzer.",
        occurredAt: "18:47",
        urgency: 72,
        relevance: 92,
        audience: ["mathieu", "ana", "lina"],
        actionability: 90,
        deviceAction: "Open the gate and announce her arrival in the kitchen"
      },
      {
        id: "evt-smoke",
        kind: "safety",
        source: "Kitchen smoke detector",
        label: "Smoke detector tripped while searing",
        detail: "Short burst, cleared in 11 seconds, no smoke remaining.",
        speech: "the kitchen smoke detector just tripped.",
        occurredAt: "18:48",
        urgency: 96,
        relevance: 80,
        audience: ["ana", "mathieu"],
        actionability: 100,
        safetyOverride: true,
        deviceAction: "Pause the TV, raise kitchen lighting, run the extractor fan"
      }
    ]
  },
  {
    id: "movie_night",
    label: "Movie night, 20:30",
    tagline: "The whole family on the couch, one scene from the ending.",
    clock: "20:30",
    scene: {
      id: "movie",
      label: "family movie night",
      interruptCost: 52,
      quiet: false,
      surfaces: ["Living Room Echo", "Hallway Echo Spot"],
      breaks: [
        { at: "20:55", label: "credits bumper / ad break", tolerance: 55 },
        { at: "21:44", label: "movie ends", tolerance: 92 }
      ]
    },
    people: [
      { id: "mathieu", name: "Mathieu", role: "parent", focus: "focused", location: "living room", surface: "Living Room Echo" },
      { id: "ana", name: "Ana", role: "parent", focus: "focused", location: "living room", surface: "Living Room Echo" },
      { id: "lina", name: "Lina", role: "student, 12", focus: "free", location: "living room", surface: "Living Room Echo" }
    ],
    events: [
      {
        id: "evt-pizza",
        kind: "delivery",
        source: "Food delivery app",
        label: "Pizza courier is 2 minutes away",
        detail: "Order was placed by Lina and paid in advance.",
        occurredAt: "20:28",
        urgency: 48,
        relevance: 70,
        audience: ["lina"],
        actionability: 88,
        deviceAction: "Arm the doorbell to whisper-only and pre-unlock the hallway light"
      },
      {
        id: "evt-petitioner",
        kind: "door",
        source: "Front door camera",
        label: "Two people knocking with clipboards",
        detail: "Unknown visitors, no appointment, motion leaving after 8 seconds.",
        occurredAt: "20:29",
        urgency: 30,
        relevance: 35,
        audience: ["mathieu"],
        actionability: 40
      },
      {
        id: "evt-permission",
        kind: "message",
        source: "School portal",
        label: "Field-trip permission form closes at midnight",
        detail: "One signature needed; Ana has the school account.",
        occurredAt: "19:50",
        urgency: 40,
        relevance: 85,
        audience: ["ana", "lina"],
        actionability: 70
      },
      {
        id: "evt-charger",
        kind: "device",
        source: "Office Echo Dot",
        label: "Mathieu's laptop at 6% battery",
        detail: "Reminder about a device that is not in use right now.",
        occurredAt: "20:25",
        urgency: 14,
        relevance: 40,
        audience: ["mathieu"],
        actionability: 35
      },
      {
        id: "evt-bike",
        kind: "family",
        source: "Geo alert",
        label: "Lina's bike light battery low",
        detail: "Alert fires for tomorrow's ride to school.",
        occurredAt: "20:20",
        urgency: 12,
        relevance: 50,
        audience: ["lina"],
        actionability: 25
      }
    ]
  },
  {
    id: "bedtime",
    label: "Bedtime, 21:25",
    tagline: "Lina is asleep, hallway dark, one parent still reading.",
    clock: "21:25",
    scene: {
      id: "bedtime",
      label: "house asleep",
      interruptCost: 74,
      quiet: true,
      surfaces: ["Hallway Echo Spot", "Master Bedroom Echo Dot"],
      breaks: [{ at: "06:55", label: "morning wake-up", tolerance: 96 }]
    },
    people: [
      { id: "lina", name: "Lina", role: "student, 12", focus: "asleep", location: "bedroom", surface: "Bedroom Echo Dot" },
      { id: "ana", name: "Ana", role: "parent", focus: "free", location: "master bedroom", surface: "Master Bedroom Echo Dot" },
      { id: "mathieu", name: "Mathieu", role: "parent", focus: "do_not_disturb", location: "office", surface: "Office Echo Dot" }
    ],
    events: [
      {
        id: "evt-drip",
        kind: "sensor",
        source: "Under-sink water sensor",
        label: "Slow leak detected under the kitchen sink",
        detail: "Reading rising over 6 minutes; shut-off valve available.",
        occurredAt: "21:24",
        urgency: 78,
        relevance: 70,
        audience: ["ana"],
        actionability: 95,
        deviceAction: "Close the water shut-off valve and set the hallway to 8% brightness"
      },
      {
        id: "evt-motion",
        kind: "door",
        source: "Front door camera",
        label: "Motion at the front door, no knock",
        detail: "30 second loiter, no interaction with the doorbell.",
        occurredAt: "21:22",
        urgency: 52,
        relevance: 45,
        audience: ["ana", "mathieu"],
        actionability: 60,
        deviceAction: "Start a 10 minute camera clip and keep the hallway silent"
      },
      {
        id: "evt-dishes",
        kind: "appliance",
        source: "Dishwasher",
        label: "Dishwasher cycle finished",
        detail: "Cycle ended during the quiet window.",
        occurredAt: "21:10",
        urgency: 6,
        relevance: 20,
        audience: ["ana"],
        actionability: 20
      },
      {
        id: "evt-nanou-call",
        kind: "message",
        source: "Landline",
        label: "Nanou called the landline twice",
        detail: "No voicemail; she usually calls before 20:00.",
        speech: "Nanou rang the landline twice, no message.",
        occurredAt: "21:18",
        urgency: 62,
        relevance: 88,
        audience: ["mathieu", "ana"],
        actionability: 75
      }
    ]
  },
  {
    id: "guest_arrival",
    label: "Guest arrival, 16:10",
    tagline: "Nanou is expected for dinner; the kitchen is mid-recipe.",
    clock: "16:10",
    scene: {
      id: "guests",
      label: "cooking, guest expected",
      interruptCost: 10,
      quiet: false,
      surfaces: ["Kitchen Echo Dot", "Living Room Echo", "Hallway Echo Spot"],
      breaks: [{ at: "16:25", label: "start of the meal prep window", tolerance: 70 }]
    },
    people: [
      { id: "ana", name: "Ana", role: "parent", focus: "focused", location: "kitchen", surface: "Kitchen Echo Dot" },
      { id: "mathieu", name: "Mathieu", role: "parent", focus: "free", location: "hallway", surface: "Hallway Echo Spot" },
      { id: "lina", name: "Lina", role: "student, 12", focus: "free", location: "living room", surface: "Living Room Echo" }
    ],
    events: [
      {
        id: "evt-ride",
        kind: "calendar",
        source: "Calendar",
        label: "Nanou's ride is 6 minutes away",
        detail: "Pre-notification from the shared family calendar.",
        speech: "Nanou's ride is six minutes out.",
        occurredAt: "16:04",
        urgency: 45,
        relevance: 90,
        audience: ["ana", "mathieu"],
        actionability: 65
      },
      {
        id: "evt-buzzer",
        kind: "door",
        source: "Gate intercom",
        label: "Intercom buzz, voice unclear",
        detail: "Background noise; the household expects a guest right now.",
        speech: "the gate intercom is buzzing and the voice is unclear.",
        occurredAt: "16:10",
        urgency: 70,
        relevance: 92,
        audience: ["mathieu", "ana"],
        actionability: 90,
        deviceAction: "Open the gate once Ana confirms on the hallway screen"
      },
      {
        id: "evt-oven-preheat",
        kind: "appliance",
        source: "Oven",
        label: "Oven reached 180°C",
        detail: "Ready state; the dish needs to go in within 5 minutes.",
        occurredAt: "16:09",
        urgency: 58,
        relevance: 70,
        audience: ["ana"],
        actionability: 85
      },
      {
        id: "evt-luggage",
        kind: "family",
        source: "Hallway camera",
        label: "Spare room light left on since 14:20",
        detail: "Prepared for the guest; not time-critical.",
        occurredAt: "16:00",
        urgency: 10,
        relevance: 35,
        audience: ["mathieu"],
        actionability: 30
      },
      {
        id: "evt-building",
        kind: "message",
        source: "Building noticeboard",
        label: "Bin room closed for cleaning at 17:00",
        detail: "Notice for the whole building, no action needed now.",
        occurredAt: "15:40",
        urgency: 18,
        relevance: 30,
        audience: ["mathieu"],
        actionability: 25
      }
    ]
  }
];

export function findScenario(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
