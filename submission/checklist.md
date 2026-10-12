# Submission checklist - Hush (Alexa+ track)

Gate this before you press Submit on Devpost. Everything marked [cmd] is automated.

## Automated gates [cmd]

```bash
npm ci            # from a clean clone, no hand-edited lockfile (plain "npm install" also works)
npm run typecheck
npm test          # 36 tests: policy engine + MCP over the real transport
npm run build
node dist/src/index.js &      # or: npm run dev
npm run smoke     # HTTP + MCP session + the whole weeknight scene + the digest
npm run probe     # prints the routing table, the quiet queue, and the bedtime scene
```

Expected: `Smoke test passed ... routes: hold_for_digest silent_log speak_now ...
ledger=8 queue=0`, and `routing: {"silent_log":1,"hold_for_digest":3,"speak_now":4}`.

## Repo contents

- [ ] `README.md` opens with the pitch, the 18:47 story table, and the run commands.
- [ ] `assets/architecture.svg` renders in the README preview (it is the Devpost image).
- [ ] `LICENSE` present (MIT) - required for the Open Source mini challenge.
- [ ] `AGENTS.md` still accurate; update it if the direction changes.
- [ ] No secrets. The repo-wide keyword scan hits exactly two prose lines and nothing else,
      so treat the output as a review, not as a pass/fail:
      `git grep -nI -E "(sk-[a-zA-Z0-9]|password|BEGIN [A-Z]+ PRIVATE KEY)" -- . ':!package-lock.json'`
      then separately confirm `git grep -n "api.key\|apikey\|Bearer " || true` is empty.
- [ ] No fabricated URLs: `git grep -n "github.com\|http://localhost" -- src/` should only
      match the local demo port, never a repo link invented by an assistant.
- [ ] `git status` clean; `dist/`, `.env`, and video files are ignored.

## Demo video (hard cap 3:00)

- [x] Length under 3:00 (target 2:58). The studio hits 2:55 at `SPEED=1.46`.
- [ ] Product idea stated in the first 15 seconds.
- [ ] All four route names shown and said out loud at least twice.
- [ ] Shows the weeknight arc: 8 signals in, 4 interruptions out.
- [ ] Shows the escalation beat (a signal re-fired twice stops being hidden). Note for the
      voice-over: `evaluate_interruption` is deliberately idempotent - the escalation comes from
      `replay_signal`, which is what models the device firing again.
- [ ] On screen, the escalated row still shows the `verdict updated` pill and the struck-through
      `hold for digest` at the END of the scene, not just for one frame. The ledger column is
      rebuilt after every signal, so if the pill ever disappears the flip memory in
      `firstVerdict` (public/app.js) is being cleared too early.
- [ ] Shows the digest at the natural break (one batch instead of 3-4 pings).
- [ ] Shows one ledger row expanded into its scored factors (explainability). The escalated row
      re-reads as attention 82 (9.9 + 15 + 6 + 8.3 + 42.8 escalation) minus cost 58 = net +24,
      and its Override line opens with "Rewritten from hold for digest", so the spoken line is
      arithmetic on screen - say the numbers, do not wave at them.
- [ ] Know the honest boundary before a judge pokes it: the valve is capped at 2x what a signal
      was ever worth, so a repeatedly-firing bedtime dishwasher stays a silent log and
      `replay_signal` prints why. That is the product answer (repetition forgives a middling
      signal, it does not rescue a trivial one) - do not apologise for it.
- [ ] Shows the MCP console proving the UI is a real MCP client.
- [ ] Ends on the honest-limits line (simulated surface, real protocol).

## MCP requirements (Alexa+ track)

- [ ] `/mcp` answers `initialize` with a `Mcp-Session-Id` header.
- [ ] `tools/list` returns 13 tools, each with a description.
- [ ] `resources/list` + `resources/read` work (`hush://home/context`, `hush://quiet-queue`).
- [ ] `prompts/get three_minute_demo` returns the full demo sequence.
- [ ] A non-Hush MCP client can drive it (tested: official TS SDK client, `curl`, browser `fetch`).
- [ ] A real client config snippet is in `configs/mcp-clients.json` and is copy-pasteable.

## Devpost fields - copy from

| Devpost field | Source |
| --- | --- |
| Project name | `submission/devpost-draft.md` - "Hush - the interruption brain for Alexa+" |
| One-liner / tagline | same file |
| Description | same file, "The problem" + "What we built" |
| How it works | same file, "Technical features" |
| Built during the hackathon | same file |
| What's next | same file |
| Mini challenge | Open Source (MIT license in repo) |
| Track | Alexa+ |
| Friction log | `submission/friction-log.md` |
| Tool feedback | `submission/feedback.md` |
| Demo video | `submissions/hush-alexa-plus-demo.mp4` (upload, keep out of git) |

## Human-only (cannot be automated)

- [ ] Set the real GitHub URL in the README badge line and in Devpost.
- [ ] Watch the last frame of take A and confirm the escalated `Swimming kit` ledger row still
      shows `VERDICT UPDATED` and the struck-through `hold for digest`. It is a sticky class
      (`firstVerdict`) rather than an animation, so if it survived to the end of the recording it
      survived the take - but this is the shot the whole pitch rests on, so check the pixels.
- [ ] If you record the optional bedtime beat, remember the repeated dishwasher stays a silent
      log on purpose. Narrate it as the policy working, not as a row that failed to escalate.
- [x] Render the video from the studio (done: `submissions/hush-alexa-plus-demo.mp4`,
      2:55, 10 MB). `npm run studio:video` rebuilds it from `studio/beats.mjs`.
      The studio is Playwright + ffmpeg + a TTS fallback; edge-tts may be IP-banned for the
      synth websocket (403) — see `submission/feedback.md`.
- [ ] Add the team name, members, and roles on Devpost.
- [ ] Confirm the hackathon rules in front of you (deadline, video length, allowed assets);
      the brief in this repo's `AGENTS.md` is reference material, not a spec to execute.
- [ ] Upload the video to YouTube/Drive and paste the link into Devpost.
- [ ] Zip the repo per the rules if the form asks for an archive.
- [ ] Optional: run `npm run probe` on a second machine to prove the "no secrets, no
      install pain" claim before you say it out loud in the video.
