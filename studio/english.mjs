// Generate an English demo using macOS speech, in an isolated workspace.
import { mkdtempSync, cpSync, copyFileSync, mkdirSync, symlinkSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const run = (cmd, args, cwd = root, env = {}) => execFileSync(cmd, args, { cwd, env: {...process.env,...env}, stdio:'inherit' });
const beats = [
['01-open','HUSH',['Eight household signals','Which ones deserve an interruption?'],'Eight signals arrive in this home. Which ones deserve an interruption? Meet Hush, an interruption brain for Alexa Plus.'],
['02-what','FOUR ACTIONS',['speak_now · whisper_display','hold_for_digest · silent_log'],'For every signal, Hush chooses one of four actions. Speak now: say it aloud. Whisper display: show a card on one screen. Hold for digest: wait for a natural break. Silent log: handle it without disturbing anyone.'],
['03-play','PLAY THE SCENE',['18:47 · homework, cooking, a call','Play the scene'],'It is six forty-seven. Lina is doing homework, Mathieu is on a call, and Ana is cooking. Let us play the scene.'],
['04-hold','QUIET BY DEFAULT',['Dishwasher → silent_log','School + courier → hold_for_digest'],'The dishwasher finishes: silent log. A school reminder arrives while Lina is focused: hold for digest. A courier confirms a delivery without a signature. That can wait too.'],
['05-speak','DOORBELL + OVEN',['Unknown visitor → speak_now','Oven timer → speak_now'],'Someone unknown rings the doorbell. Ana is available, so Hush chooses speak now. The oven timer also deserves a spoken interruption. Each decision weighs attention against interruption cost.'],
['06-nanou','GRANDMA AT THE GATE',['Screen time +6 minutes → hold_for_digest','Grandma at the gate → speak_now'],'Six extra minutes of screen time? Hold for digest. But Grandma is waiting at the gate and cannot find the buzzer. Speak now.'],
['07-smoke','SAFETY OVERRIDE',['Smoke detector → speak_now','Safety bypasses soft rules'],'Then the smoke detector triggers. A safety override bypasses the usual interruption rules. Quiet by default must never mean quiet during an emergency.'],
['08-escalation','ESCALATION',['Same signal · updated verdict','attention 82 − cost 58 = net +24'],'Being considerate must not become being useless. The school reminder arrives again, then again. After two quiet deferrals, attention rises to eighty-two against a cost of fifty-eight. The third sighting speaks. The ledger keeps the audit identifier, strikes through the old verdict, and shows verdict updated, with a net score of twenty-four.'],
['09-digest','ONE DIGEST',['Two held signals','One digest at a natural break'],'Two signals remain queued. At the next natural break, they arrive in one digest instead of two separate interruptions.'],
['10-audit','AUDITABLE DECISIONS',['Real explain_decision tool call','Scored factors, readable reasons'],'Every decision is auditable through a real tool call. Factors include urgency, relevance, freshness, scene cost, and recipient focus. Change someone’s focus, and the next decision reflects it.'],
['11-bedtime','BEDTIME 21:25',['Zero speak_now','Water leak → whisper_display'],'At bedtime, the same engine chooses no spoken interruptions. A water leak still prompts action, with whisper display instead of a shout.'],
['12-mcp','REAL MCP TRAFFIC',['13 tools · resources · prompts','The browser is a real MCP client'],'This prototype runs on a real, self-hosted MCP server: thirteen tools, resources, prompts, and stateful sessions. The browser is an MCP client. Its console shows actual traffic.'],
['12b-terminal','TERMINAL PROBE',['Same endpoint · independent client','Real JSON-RPC sessions'],'The terminal probe calls the same endpoint and verifies its behavior independently. Alexa Plus and the household devices are simulated. The MCP integration is real.'],
['13-close','HUSH · MIT LICENSED',['Speak when it matters','Stay quiet when it does not · explain every choice'],'Hush is MIT licensed. It gives connected homes a clear rule: speak when it matters, stay quiet when it does not, and explain every choice.']
];
run('npm',['run','build']);
const work = mkdtempSync(join(tmpdir(),'hush-english-'));
for (const d of ['studio','dist','scripts','public']) cpSync(join(root,d),join(work,d),{recursive:true,filter:p=>!p.includes('/studio/out')});
copyFileSync(join(root,'package.json'),join(work,'package.json'));
symlinkSync(join(root,'node_modules'),join(work,'node_modules'),'dir');
appendFileSync(join(work,'studio/beats.mjs'),`\nconst english = ${JSON.stringify(beats)};\nfor (const [id,title,captions,vo] of english) Object.assign(BEATS.find(b=>b.id===id),{title,captions,vo});\n`);
mkdirSync(join(work,'submissions'),{recursive:true});
const env={VOICE_BACKEND:'mac',MAC_VOICE:'Daniel',MAC_RATE:'155',PORT:'19133',SPEED:'1'};
run('node',['studio/vo.mjs','--force'],work,env);
run('node',['studio/capture.mjs'],work,env);
run('node',['studio/assemble.mjs'],work,env);
const out=resolve(root,'submissions/hush-alexa-plus-demo-en.mp4');
copyFileSync(join(work,'submissions/hush-alexa-plus-demo.mp4'),out);
cpSync(join(work,'studio/out'),join(root,'studio/out-en'),{recursive:true});
writeFileSync(join(root,'studio/out-en/english-storyboard.json'),JSON.stringify(beats,null,2));
console.log('ENGLISH VIDEO:',out);
