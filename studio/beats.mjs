// Studio beat table for the Hush demo video.
// One entry = one voice-over beat + the DOM state the page must reach before we freeze a
// keyframe. Narration is French (voice fr-FR-HenriNeural); the four route names stay verbatim
// English so they are always both shown and said, as submission/checklist.md requires.
//
// The UI "Play the scene" button drives the WHOLE weeknight arc on its own in ~8 seconds:
// 8 signals, then the escalation of the first held row, then the clock jump, then the digest.
// Frozen beats cannot share that timeline - every scene would freeze on the digest - so the
// studio driver (window.__studio) replays the arc in beat order over the same MCP endpoint and
// logs its own calls to the console panel. window.__hush keeps the observed evidence: DOM
// peaks the ledger column would otherwise rebuild away, the smoke line, queue depth, and the
// digest count the narration is not allowed to contradict.
//
// Order the engine actually supports (same semantics scripts/smoke-test.sh asserts):
// school first (hold) -> dishwasher/courier/doorbell/oven/screentime -> NANOU (speak) ->
// SMOKE (safety override; 3 rows still held: school/courier/screen-time) -> escalate SCHOOL
// (verdict flip; queue drops to 2) -> digest delivers exactly those 2. Beat 12 then plays the
// WHOLE arc through the page's own button so the MCP console shows a complete, fresh scene and
// ends on the same 8-signal routing the probe prints; the bedtime beat restores the weeknight
// scene so the closing shot resets to a real 8-row ledger.

export const VOICE = "fr-FR-HenriNeural";
export const RATE = "+8%";

// Each beat: { id, screen, reveal, actions, ready, fail, captions, vo }
//  - reveal:  JS expression (string) executed BEFORE the keyframe is frozen; capture fails if
//             it does not return truthy (this is what paints the four-route overlay)
//  - actions: ordered studio actions to run before waiting (use sparingly)
//  - ready:   JS predicate (string) that must return truthy before we freeze the keyframe;
//             capture.mjs fails the render when it is not reached
//  - captions: short burned-in subtitle fragments (<= ~46 chars each)
//  - vo: French voice-over for this beat
export const BEATS = [
  {
    id: "01-open",
    title: "HUSH",
    screen: "header + household panel",
    reveal: "",
    actions: [],
    ready: "document.querySelector('#session-pill')?.classList.contains('live')",
    captions: ["8 signaux en 2 minutes", "une maison classique : 6 interruptions"],
    vo: "En deux minutes, huit signaux dans cette maison. Une maison connectée classique interromprait cette famille six fois. Et raterait le seul signal qui compte vraiment."
  },
  {
    id: "02-what",
    title: "LES 4 GESTES",
    screen: "ring + four route words in footer",
    reveal: `(()=>{const w=['speak_now','whisper_display','hold_for_digest','silent_log'];
      document.querySelectorAll('.hush-chip').forEach(e=>e.remove());
      const bar=document.createElement('div');bar.className='hush-chip';bar.style.cssText='position:fixed;left:0;right:0;top:52%;transform:translateY(-50%);display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-weight:800;font-size:30px;letter-spacing:.5px;color:#fff;text-shadow:0 2px 14px #000';
      w.forEach(x=>{const s=document.createElement('span');s.textContent=x;s.style.cssText='padding:10px 16px;border-radius:12px;background:rgba(8,12,24,.86);border:1px solid #4a6cff';bar.appendChild(s);});
      document.body.appendChild(bar);return true;})()`,
    actions: [],
    ready: "document.querySelector('.hush-chip') !== null",
    captions: ["Hush · cerveau d'interruption pour Alexa+", "speak_now · whisper_display", "hold_for_digest · silent_log"],
    vo: "Voici Hush, le cerveau d'interruption d'Alexa+. Pour chaque signal, un seul geste. Speak now : le dire à voix haute. Whisper display : le chuchoter sur un écran. Hold for digest : le garder pour la prochaine pause. Silent log : le traiter sans un mot."
  },
  {
    id: "03-play",
    title: "▶ PLAY THE SCENE",
    screen: "click Play the scene",
    reveal: "(document.querySelectorAll('.hush-chip').forEach(e=>e.remove()), true)",
    actions: ["initWeeknight", "playScene"],
    // The page's own Play-the-scene button runs the whole arc; playScene() drains it, so the
    // freeze here sits on the FINISHED scene.
    ready: "(()=>{const e=window.__studio.evidence(); return e.playDisabled === false && e.msgs >= 8 && e.digestN !== null;})()",
    captions: ["18:47 · devoirs, docu, appel de Nanou", "▶ Play the scene"],
    vo: "Il est dix-huit heures quarante-sept. Devoirs, un documentaire en pause, un appel en cours dans le bureau. On lance la scène."
  },
  {
    id: "04-hold",
    title: "18:52 · 19:03 · 19:07",
    screen: "signals 1-3: silent_log + two holds",
    reveal: "",
    actions: ["evaluate:evt-school", "evaluate:evt-dishwasher", "evaluate:evt-courier"],
    ready: "window.__hush?.sigSeen >= 3",
    captions: ["lave-vaisselle → silent_log", "école + coursier → hold_for_digest"],
    vo: "Lave-vaisselle terminé : silent log, personne n'est dérangé. L'e-mail de l'école : Lina est en plein devoir, personne de disponible ne peut lire la carte, donc il attend. Hold for digest. Le livreur sans signature : la maison confirme toute seule, pas besoin de parler."
  },
  {
    id: "05-speak",
    title: "SONNETTE + FOUR",
    screen: "doorbell + oven: speak_now",
    reveal: "",
    actions: ["evaluate:evt-doorbell", "evaluate:evt-oven"],
    ready: "window.__hush?.speakPeak >= 2",
    captions: ["sonnette inconnue → speak_now +34", "minuteur four → speak_now +37"],
    vo: "La sonnette : quelqu'un d'inconnu à la porte. Ana est libre dans la cuisine, alors Alexa+ parle : speak now. Le minuteur du four : même verdict, speak now, plus un flash de la lumière. Le calcul est simple : l'attention moins le coût d'interruption."
  },
  {
    id: "06-nanou",
    title: "NANOU AU PORTAIL",
    screen: "screen time hold + Nanou speak_now",
    reveal: "",
    actions: ["evaluate:evt-screentime", "evaluate:evt-grandma"],
    ready: "window.__hush?.speakPeak >= 3",
    captions: ["temps d'écran +6 min → hold_for_digest", "Nanou au portail → speak_now +45"],
    vo: "Six minutes au-dessus du temps d'écran ? Ça ne vaut pas la peine de casser un appel. Hold for digest. Mais Nanou au portail, qui ne trouve pas l'interphone : là, ça parle. Speak now, même avec la porte du bureau fermée."
  },
  {
    id: "07-smoke",
    title: "SAFETY OVERRIDE",
    screen: "smoke detector: safety override",
    reveal: "",
    // The freeze lands ON the smoke row: ring mid-speaking, its spoken line (with the
    // [safety override ...] tag) last in the transcript, and the three held signals still
    // queued behind it. The studio replays the WHOLE arc signal by signal (school, dishwasher,
    // courier, doorbell, oven, screen time, Nanou) and stops ON the smoke verdict, so the
    // ledger has all 8 rows and the queue shows the three held signals. Beat 03's live scene
    // has fully drained by then (playScene awaited it). Escalation starts only in beat 08.
    actions: ["loadWeeknight", "evaluate:evt-school", "evaluate:evt-dishwasher", "evaluate:evt-courier", "evaluate:evt-doorbell", "evaluate:evt-oven", "evaluate:evt-screentime", "evaluate:evt-grandma", "evaluate:evt-smoke", "scrollTranscript", "scrollLedger"],
    // The freeze sits ON the smoke verdict: ring speaking, the engine's own safety sentence
    // typed out, three signals still held, and a full 8-row ledger.
    ready: "(()=>{const e=window.__studio.evidence(); return e.ring==='speaking' && e.smokeSpoken===1 && e.speakLast>20 && e.queue===3 && e.ledgerRows===8;})()",
    captions: ["détecteur de fumée → speak_now", "safety override : rien ne le coupe"],
    vo: "Et le détecteur de fumée : un safety override qu'aucune politique ne peut couper. C'est la règle du produit : l'assistant est silencieux par défaut, et ne parle que lorsqu'il le faut vraiment."
  },
  {
    id: "08-escalation",
    title: "ESCALADE",
    screen: "Swimming kit escalates, verdict updated + struck hold",
    reveal: "",
    actions: ["escalateSchool", "scrollLedger", "scrollTranscript"],
    ready: "(()=>{const e=window.__studio.evidence(); return e.rewritten==='evt-school' && e.queue===2 && e.ring==='speaking';})()",
    captions: ["utile ≠ inutile", "Swimming kit → speak_now · net +24 · VERDICT UPDATED"],
    vo: "Être prévenant ne veut pas dire devenir inutile. L'e-mail de l'école repart : même signal, même identifiant d'audit, un nouvel événement sur le fil, puis encore un. Avoir été caché deux fois devient l'information : l'attention monte à quatre-vingt-deux contre un coût de cinquante-huit, et la troisième fois parle. Regardez la ligne du ledger : l'ancien verdict barré, un badge verdict updated, le net à plus vingt-quatre."
  },
  {
    id: "09-digest",
    title: "DIGEST",
    screen: "quiet queue + digest spoken",
    reveal: "",
    actions: ["digestSelf"],
    // The escalated Swimming kit no longer stands in the queue: the digest delivers the
    // courier and the screen-time row. Narration must say DEUX, not three.
    ready: "(()=>{const e=window.__studio.evidence(); return e.digestN==='2' && e.heldLine===true && e.queue===0;})()",
    captions: ["le jamais-entendu arrive d'un coup", "2 retenus → 1 digest"],
    vo: "Deux signaux avaient encore été gardés pour plus tard. Quand la maison atteint une pause naturelle, ils arrivent tous ensemble dans un seul digest, au lieu de deux interruptions séparées."
  },
  {
    id: "10-audit",
    title: "AUDIT (tool call)",
    screen: "open a ledger row -> scored factors",
    reveal: "",
    actions: ["clickLedgerRow:swim"],
    // The audit panel must show the ESCALATED row's factors (attention 82 - 58 = net 24).
    ready: "(()=>{const e=window.__studio.evidence(); return e.auditRows >= 5 && e.rewritten==='evt-school';})()",
    captions: ["chaque choix est auditable", "un tool call, pas une capture d'écran"],
    vo: "Et chacun de ces choix est auditable. C'est un appel d'outil, pas une capture d'écran : l'urgence, la pertinence, la fraîcheur, le coût de la scène, et le coût d'interrompre une fille de douze ans concentrée. Changez la pastille de focus à gauche, et la prochaine décision change avec."
  },
  {
    id: "11-bedtime",
    title: "BEDTIME 21:25",
    screen: "Bedtime scenario: no speak row",
    reveal: "",
    // Beat 12 starts by restoring the weeknight scene, so the MCP and closing shots sit on a
    // real 8-row ledger (see its loadWeeknight action).
    actions: ["selectScenario:Bedtime", "captureBedtimeEvidence"],
    // The bedtime scene is proven while it is on screen: 4 rows, zero speak_now badges.
    // restoreWeeknight() then hands the closing shots the weeknight table.
    ready: "(()=>{const e=window.__studio.evidence(); return e.scenario==='bedtime' && e.badges.length >= 4 && e.badges.every(b => !b.includes('speak_now'));})()",
    captions: ["même moteur, autre maison", "au coucher : zéro speak_now"],
    vo: "Même moteur, autre maison. Au coucher : zéro speak now. Une fuite d'eau quand même traitée : vanne fermée, whisper display au couloir, jamais de voix."
  },
  {
    id: "12-mcp",
    title: "MCP TRAFFIC",
    screen: "MCP console (JSON-RPC traffic)",
    reveal: "",
    // Play the WHOLE weeknight arc through the page's own button right before the freeze:
    // the console then shows the exact scene the judges just watched, and the ring is back on
    // the final verdict. The console shot carries the real `npm run probe` output
    // (studio/out/probe.txt, written by capture.mjs) - the terminal plan the script promises.
    actions: ["restoreWeeknight", "playScene"],
    ready: "(()=>{const e=window.__studio.evidence(); return e.consoleLines > 20 && e.playDisabled === false && e.digestN !== null && e.rpcErrors === 0;})()",
    captions: ["un seul serveur MCP Streamable HTTP", "13 tools · 2 resources · 2 prompts", "la console = le trafic réel de la page"],
    vo: "Tout ça tient dans un seul serveur MCP Streamable HTTP, auto-hébergé : treize outils, deux resources, deux prompts, et de vraies sessions. La surface du navigateur est elle-même un client MCP, et cette console est le trafic réel."
  },
  {
    id: "12b-terminal",
    title: "npm run probe",
    screen: "terminal: real npm run probe output (probe.txt plate)",
    reveal: "",
    actions: ["probePlate"],
    ready: "document.getElementById('hush-probe')?.dataset.ok === '1'",
    // The whole point of the beat is the real probe output; a cropped or stale plate fails.
    captions: ["npm run probe : le même endpoint, sans le navigateur", "routing weeknight : silent_log 1 · hold 3 · speak 4"],
    vo: "Et parce que c'est un vrai serveur, npm run probe rejoue la même démo depuis un terminal : mêmes verdicts, mêmes sessions, sans le navigateur."
  },
  {
    id: "13-close",
    title: "HUSH · MIT",
    screen: "ring going quiet after Reset take",
    reveal: "",
    actions: ["closingShot"],
    // The eight verdicts stay on screen while the ring goes quiet; the take itself is reset
    // on the server (the app's own reset semantics, replayed by the studio driver).
    ready: "(()=>{const e=window.__studio.evidence(); return e.ring === 'quiet' && e.ledgerRows === 8 && e.msgs >= 1;})()",
    captions: ["Hush · MIT licensed", "prêt pour les règles de votre maison"],
    vo: "Les appareils connectés ont cessé d'avoir un avis sur le moment où nous parler. Hush donne à Alexa+ le jugement qui manquait, sous licence MIT, prêt pour les règles de votre maison."
  }
];
