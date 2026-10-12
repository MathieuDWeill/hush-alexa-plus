# Demo video script - Hush (target length 2:55, hard cap 3:00)

One continuous screen recording at 1920x1080 (or 2x retina), browser at `http://localhost:8787`,
terminal visible in a second window only for the last 15 seconds. Zoom to 125% so the ledger
text is readable on a phone.

## Before you press record

```bash
npm run build && node dist/src/index.js   # or: npm run dev
open http://localhost:8787                # wait for the green "MCP session" pill
```

- Scenario = **Weeknight, 18:47** (the default).
- For take A, load `http://localhost:8787/?autoplay=1`: the scene starts itself, which removes
  the mouse from the recording. For takes B-C keep the plain URL so you can drive the clicks.
- Click **Reset take** so the ledger is empty and the clock reads 18:47. **Stop scene** appears
  while the scene runs and interrupts it cleanly (a bad take costs 5 seconds: Stop, Reset,
  record again). Both are part of the story - say so in shot 13 if you have room.
- Hide bookmarks, set the OS theme to dark, mute notifications.
- The scene itself runs about 15 seconds of wall-clock. The timings below are the *edited*
  video: pause on the ledger after each speak row and let the voice-over breathe. If you record
  one continuous take with no pauses, you will land near 1:00 and have to talk slowly.
- Record in three takes: A = the self-playing scene (0:00-2:00), B = the audit clicks and the
  bedtime switch (2:00-2:35), C = the terminal and the closing line (2:33-2:55).
- `submission/checklist.md` is the gate to run after the edit and before you submit.

## Shot list

| # | Time | On screen | Voice |
| --- | --- | --- | --- |
| 1 | 0:00-0:12 | Freeze on the header + household panel (Ana free, Lina focused, Mathieu do-not-disturb) | "Eight things happened in this house in two minutes. A smart home would interrupt this family six times - and miss the one that matters." |
| 2 | 0:12-0:28 | Point at the ring, then at the four route words in the footer | "This is Hush: an interruption brain for Alexa+. For every household signal it picks one of four moves - say it out loud, whisper it to a single screen, hold it for the next natural break, or handle it without a word." |
| 3 | 0:28-0:36 | Click **Play the scene** | "It is 18:47. Homework, a paused documentary, a call in the office. Hit play." |
| 4 | 0:36-0:52 | Signals 1-3: dishwasher `silent_log`, school email `hold`, courier `hold` | "Dishwasher done - logged, nobody is interrupted. A school admin email - Lina is mid-homework and nobody free can read a card, so it waits. A no-signature courier: the home confirms the drop-off itself." |
| 5 | 0:52-1:10 | Signals 4-5: doorbell `speak_now`, oven `speak_now` - let the typed lines finish | "Now the doorbell, with someone unknown at the door: Ana is free in the kitchen, so Alexa+ speaks. The oven timer: same, plus a light pulse in the kitchen. Notice the score - attention minus interruption cost." |
| 6 | 1:10-1:22 | Signal 6 `hold`, signal 7 `speak_now` (Nanou) | "Screen time six minutes over? Not worth breaking a call for. But Nanou standing at the gate, unable to find the buzzer - that speaks, even with the office door shut." |
| 7 | 1:22-1:32 | Signal 8 `speak_now`, badge `safety override` | "And the smoke detector: a safety override no policy can suppress. That is the design rule - the assistant is quiet by default and loud only on purpose." |
| 8 | 1:32-1:47 | The "Same signal, twice more" block, ending in `speak_now`; hold on the `Swimming kit` ledger row - it keeps `hold for digest` struck through, a `VERDICT UPDATED` pill and `net 24` | "Being considerate must not become being useless. The school email fires again - same signal, same audit id, a new event on the wire - and again. Being hidden twice is itself the news: it lifts attention to eighty-two against a cost of fifty-eight, clears the bar, and the third sighting speaks. Look at the ledger row: it holds the old verdict struck through, says verdict updated, and prints plus twenty-four. The arithmetic and the verdict agree." |
| 9 | 1:47-2:00 | **What the family never heard** line, then clock jumps, then the digest message | "Three signals were held back. When the household reaches a natural break, they arrive as one digest instead of three interruptions." |
| 10 | 2:00-2:22 | Click a `hold_for_digest` row in the **Decision ledger**; factor list expands | "And every one of those choices is auditable. This is a tool call, not a screenshot: urgency, relevance, freshness, the scene cost, and the cost of interrupting a focused twelve-year-old. Change the focus chip on the left and the next decision changes with it." |
| 11 | 2:22-2:35 | Click the **Bedtime, 21:25** scenario, then **Triage every signal** | "Same engine, different house. At bedtime, nothing is worth a voice - the routing table has no speak row at all. A water leak still gets acted on: the valve closes and the hallway gets a card instead of a shout." |
| 12 | 2:35-2:50 | Terminal: `npm run probe` output (13 tools, resources, prompts) + the JSON-RPC console at the bottom of the page | "All of it is one self-hosted Streamable HTTP MCP server: thirteen tools, resources, prompts, real sessions. The browser surface is itself an MCP client - that console is the actual traffic. Point any MCP client at it: `claude mcp add --transport http hush http://localhost:8787/mcp`." |
| 13 | 2:48-2:55 | Back to the ring going quiet | "Connected devices stopped getting an opinion about when to talk to us. Hush gives Alexa+ the missing judgement layer - and it is MIT licensed, ready for your household's rules." |

## Hard rules

- Total under 3:00. Cut take 11 first if you run long (it is the least essential).
- Say the four route names out loud at least twice; they are the vocabulary of the product.
- Never show a terminal without also showing that the browser made the same call.
- No music above the voice. Burned-in captions on the four route names.

## Post-production

- Export `.mp4` H.264, 1080p, under 200 MB.
- Thumbnail: the ring mid-`speak_now` with the ledger showing 4 routes side by side, caption
  "What should Alexa+ say out loud?".
- Filename: `hush-alexa-plus-demo.mp4` (keep it out of git; `submissions/` is ignored).

## If a take goes wrong

`Reset take` restores the scenario deterministically, so a bad take costs 5 seconds, not a
re-record. If the ring animation ever desyncs, click **Triage every signal** instead of
**Play the scene** and narrate the ledger yourself.
