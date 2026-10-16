// Cook mode: one step at a time in big type, read aloud, a timer per step,
// an optional live coach that watches through the camera and listens for questions,
// and a "measure a cup" tool. The main actions live in a dock at the bottom, within thumb reach.
import { api } from "../lib/api.js";
import { state, save } from "../lib/state.js";
import { esc, icon, $, toast, fileToDataUrl } from "../lib/ui.js";
import { speak, stopSpeaking, isSpeaking, onSpeakingChange, Listener, canListen, canSpeak, chime } from "../lib/voice.js";
import { LiveCamera } from "../lib/camera.js";
import { openMeasure, mlInText } from "../lib/measure.js";

let s = null; // per-visit session, rebuilt on every render

const STATUS_TEXT = { on_track: "On track", fix_now: "Fix now", step_done: "Step looks done", cant_see: "Can't see", answer: "Answer" };

export function render(root, ctx) {
  const recipe = state.adapt?.recipe || state.recipe;
  if (!recipe) return (location.hash = "#/");
  leave();

  s = {
    root,
    ctx,
    recipe: withSwaps(recipe),
    step: Math.min(state.cook.stepIndex || 0, recipe.steps.length - 1),
    timers: {}, // stepIndex -> { total, left, running }
    live: false,
    muted: false,
    camera: null,
    listener: null,
    notes: [], // what the coach already said, so it doesn't repeat itself
    lastSaid: "",
    lastOnTrackAt: 0,
    asking: false,
    tick: 0,
    intervals: [],
  };

  const wake = esc(state.settings.wakeWord);
  root.innerHTML = `
    <div class="cook-top">
      <a class="iconbtn" href="#/gather" aria-label="Back to groceries">${icon("back")}</a>
      <h1>Cook mode</h1>
      <button class="iconbtn" id="mute" aria-label="Mute narration" title="Mute narration">${icon("speaker")}</button>
      <a class="iconbtn" href="#/" aria-label="Close cook mode">${icon("close")}</a>
    </div>

    <div class="cook-grid">
      <section class="cook-stage" aria-label="Live coaching">
        <div class="stage" id="stage">
          <video id="video" playsinline muted></video>
          <div class="stage-idle" id="stage-idle">
            <div class="phone" aria-hidden="true"></div>
            <h3>Hands-free live coaching</h3>
            <p>Prop your phone on a stand with the pan in view. The coach watches, talks you through each step, and answers when you say “${wake}, …”.</p>
            <button class="btn btn-cook" id="live-btn">${icon("camera")}<span>Start live coaching</span></button>
            <p class="tiny">Optional · Only changed frames are sent, nothing is stored</p>
          </div>
          <div class="stage-hud" id="hud" hidden>
            <span class="badge-live">LIVE</span>
            <span class="badge-mic" id="mic-badge" hidden>${icon("mic")} Listening</span>
            <button class="hud-stop" id="stop-live" aria-label="Stop live coaching">${icon("close")}</button>
            <div class="hud-timer" id="hud-timer" hidden>${icon("timer")}<b></b></div>
            <div class="bubble" id="bubble"><span class="bubble-status" id="bubble-status">Watching</span><span id="bubble-text">Starting the camera…</span></div>
          </div>
        </div>
        <div class="voice-hints" ${canListen ? "" : "hidden"}>
          <span>Try saying</span><em>“next”</em><em>“repeat”</em><em>“pause timer”</em><em>“${wake}, is this done?”</em>
        </div>
      </section>

      <section class="cook-step">
        <div class="recipe-line">${icon("fork")} ${esc(s.recipe.title)} · ${s.recipe.servings} servings ${ctx.demo ? '<span class="pill" style="margin-left:auto">Sample session</span>' : ""}</div>
        <p class="eyebrow" id="step-label"></p>
        <div class="progress" id="progress" style="grid-template-columns:repeat(${s.recipe.steps.length},1fr)">${s.recipe.steps.map(() => "<span></span>").join("")}</div>
        <p class="step-text" id="step-text"></p>
        <p class="look-for" id="look-for"></p>

        <div class="timer-row" id="timer-card" hidden>
          <div><p class="eyebrow" id="timer-label" style="margin:0"></p><b id="timer">00:00</b></div>
          <button class="round" id="timer-btn" aria-label="Start timer">${icon("play")}</button>
        </div>

        <div class="narration" id="narration-card">
          <div class="wave" aria-hidden="true">${"<i></i>".repeat(5)}</div>
          <span id="narr-text">Say “next” or tap Next when you're ready.</span>
        </div>

        <form class="ask" id="ask">
          ${icon("chat")}<input id="question" placeholder="Ask anything about this step" autocomplete="off" enterkeyhint="send" aria-label="Ask the coach" />
          <button class="iconbtn" type="submit" aria-label="Send question">${icon("up")}</button>
        </form>

        <details class="convo">
          <summary>Conversation <span id="log-count"></span></summary>
          <ul class="coach-log" id="log"></ul>
        </details>
        ${!canListen ? `<p class="small muted">This browser can't listen for voice. Type questions above; the coach still talks and watches.</p>` : ""}
      </section>
    </div>

    <nav class="dock" aria-label="Cooking controls">
      <button id="prev" aria-label="Previous step">${icon("back")}<span>Back</span></button>
      <button id="look-btn">${icon("eye")}<span>Check pan</span></button>
      <button id="measure-btn">${icon("cup")}<span>Measure</span></button>
      <button id="next" class="dock-primary"><span>Next step</span>${icon("arrow")}</button>
    </nav>
    <input id="look-file" type="file" accept="image/*" capture="environment" hidden />
    <input id="measure-file" type="file" accept="image/*" capture="environment" hidden />`;

  // Controls
  $("#next", root).onclick = () => go(1);
  $("#prev", root).onclick = () => go(-1);
  $("#mute", root).onclick = toggleMute;
  $("#timer-btn", root).onclick = () => toggleTimer();
  $("#live-btn", root).onclick = startLive;
  $("#stop-live", root).onclick = stopLive;
  $("#look-btn", root).onclick = () => (s.live ? lookNow(true) : $("#look-file", root).click());
  $("#measure-btn", root).onclick = measure;
  $("#look-file", root).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) coach({ image: await fileToDataUrl(file, 768, 0.7) });
  };
  $("#measure-file", root).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) showMeasure(await fileToDataUrl(file, 1024, 0.8));
  };
  $("#ask", root).onsubmit = (e) => {
    e.preventDefault();
    const q = $("#question", root).value.trim();
    if (!q) return;
    $("#question", root).value = "";
    ask(q);
  };

  const off = onSpeakingChange((on) => $("#narration-card", root)?.classList.toggle("speaking", on));
  s.cleanup = [off];

  // One clock for timers and the coach loop.
  s.intervals.push(setInterval(tickTimers, 1000));
  s.intervals.push(setInterval(coachLoop, Math.max(4, state.settings.coachEverySeconds) * 1000));

  showStep(true);
}

// Accepted swaps from the Gather step show up in the recipe you cook.
function withSwaps(recipe) {
  const r = structuredClone(recipe);
  for (const [from, to] of Object.entries(state.swaps)) {
    r.ingredients = r.ingredients.map((i) => (i.name === from ? { ...i, name: to.name } : i));
    r.steps = r.steps.map((st) => ({ ...st, instruction: st.instruction.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to.name.toLowerCase()) }));
  }
  return r;
}

function showStep(announce) {
  const { root, recipe } = s;
  const st = recipe.steps[s.step];
  state.cook.stepIndex = s.step;
  save();
  $("#step-label", root).textContent = `Step ${s.step + 1} of ${recipe.steps.length} · ${st.title}`;
  $("#step-text", root).textContent = st.instruction;
  $("#look-for", root).innerHTML = st.lookFor ? `${icon("eye")}<span><b>Done when:</b> ${esc(st.lookFor)}</span>` : "";
  [...$("#progress", root).children].forEach((el, i) => el.classList.toggle("on", i <= s.step));
  $("#next", root).querySelector("span").textContent = s.step === recipe.steps.length - 1 ? "Finish" : "Next step";
  $("#prev", root).disabled = s.step === 0;
  s.tick = 0;

  const card = $("#timer-card", root);
  card.hidden = !st.timerMinutes;
  if (st.timerMinutes) {
    s.timers[s.step] ||= { total: st.timerMinutes * 60, left: st.timerMinutes * 60, running: false };
    $("#timer-label", root).textContent = `${st.title} timer · ${st.timerMinutes} min`;
  }
  drawTimer();
  if (announce) say(`Step ${s.step + 1}. ${st.instruction}${st.timerMinutes ? " Say start timer when it's in." : ""}`, { interrupt: true, log: false });
}

function go(delta) {
  const next = s.step + delta;
  if (next < 0) return;
  if (next >= s.recipe.steps.length) {
    say("That's it. Enjoy your meal!", { interrupt: true });
    state.cook.stepIndex = 0;
    save();
    setTimeout(() => (location.hash = "#/recipes"), 2500);
    return;
  }
  s.step = next;
  showStep(true);
}

// ---------- Voice out ----------
function say(text, { interrupt = false, log = true } = {}) {
  s.lastSaid = text;
  $("#narr-text", s.root).textContent = text;
  if (log) addLog("Coach", text);
  if (!s.muted && canSpeak) speak(text, { interrupt, rate: state.settings.voiceRate });
}

function toggleMute() {
  s.muted = !s.muted;
  if (s.muted) stopSpeaking();
  const btn = $("#mute", s.root);
  btn.classList.toggle("muted", s.muted);
  btn.setAttribute("aria-label", s.muted ? "Unmute narration" : "Mute narration");
  toast(s.muted ? "Narration muted. The coach still shows its answers." : "Narration on.");
}

function addLog(who, text) {
  const log = $("#log", s.root);
  if (!log) return;
  log.insertAdjacentHTML("afterbegin", `<li><b>${esc(who)}:</b> ${esc(text)}</li>`);
  while (log.children.length > 20) log.lastChild.remove();
  $("#log-count", s.root).textContent = `(${log.children.length})`;
}

// ---------- Timers ----------
function toggleTimer(force) {
  const t = s.timers[s.step];
  if (!t) return;
  t.running = force ?? !t.running;
  if (t.left <= 0) t.left = t.total;
  drawTimer();
}

function tickTimers() {
  for (const [idx, t] of Object.entries(s.timers)) {
    if (!t.running) continue;
    t.left -= 1;
    if (t.left <= 0) {
      t.left = 0;
      t.running = false;
      chime();
      const st = s.recipe.steps[idx];
      say(`${st.title} timer is done. Check for: ${st.lookFor}`, { interrupt: true });
      if (s.live) setTimeout(() => lookNow(true), 4000); // take a look as soon as the announcement ends
    }
  }
  drawTimer();
}

const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

function drawTimer() {
  if (!s?.root.isConnected) return;
  const t = s.timers[s.step];
  const hud = $("#hud-timer", s.root);
  hud.hidden = !t;
  if (!t) return;
  $("#timer", s.root).textContent = mmss(t.left);
  hud.querySelector("b").textContent = mmss(t.left);
  hud.classList.toggle("running", t.running);
  $("#timer-btn", s.root).innerHTML = icon(t.running ? "pause" : "play");
  $("#timer-btn", s.root).setAttribute("aria-label", t.running ? "Pause timer" : "Start timer");
}

// ---------- Live coaching ----------
async function startLive() {
  if (s.live) return;
  s.camera = new LiveCamera($("#video", s.root));
  try {
    await s.camera.start();
  } catch (err) {
    toast(err.name === "NotAllowedError" ? "Camera permission was denied." : err.message, 4000);
    s.camera = null;
    return;
  }
  s.live = true;
  const { root } = s;
  $("#stage", root).classList.add("is-live");
  $("#stage-idle", root).hidden = true;
  $("#hud", root).hidden = false;

  s.listener = new Listener({ wakeWord: state.settings.wakeWord, onCommand: command, onQuestion: ask, onHeard: (t) => flashHeard(t) });
  $("#mic-badge", root).hidden = !s.listener.start();
  say(`I'm watching. ${canListen ? `Say ${state.settings.wakeWord}, then your question, any time.` : "Type a question whenever you need me."}`, { interrupt: true });
  setTimeout(() => lookNow(true), 3000);
}

function stopLive() {
  s.live = false;
  s.camera?.stop();
  s.listener?.stop();
  s.camera = s.listener = null;
  const { root } = s;
  if (!root.isConnected) return;
  $("#stage", root).classList.remove("is-live");
  $("#stage-idle", root).hidden = false;
  $("#hud", root).hidden = true;
}

function setBubble(text, status = "") {
  const bubble = $("#bubble", s.root);
  if (!bubble) return;
  bubble.className = `bubble ${status ? `bubble-${status}` : ""}`;
  $("#bubble-status", s.root).textContent = STATUS_TEXT[status] || (status === "busy" ? "Looking" : "Watching");
  $("#bubble-text", s.root).textContent = text;
}

function flashHeard(t) {
  const badge = $("#mic-badge", s.root);
  if (!badge) return;
  badge.lastChild.textContent = ` “${t.slice(0, 28)}${t.length > 28 ? "…" : ""}”`;
  clearTimeout(flashHeard.t);
  flashHeard.t = setTimeout(() => s && (badge.lastChild.textContent = " Listening"), 3000);
}

// Every few seconds: if the scene changed (or a heartbeat is due) and nobody is talking, look.
function coachLoop() {
  if (!s.live || s.asking || isSpeaking()) return;
  if (s.camera.shouldSend()) lookNow();
}

function lookNow(userAsked = false) {
  if (!s?.live || !s.camera) return;
  const image = s.camera.frame();
  if (!image) return;
  s.camera.markSent();
  coach({ image, userAsked });
}

async function ask(question) {
  addLog("You", question);
  stopSpeaking();
  const image = s.live ? s.camera.frame() : null;
  if (image) s.camera.markSent();
  await coach({ image, question });
}

// ---------- Measure a cup ----------
function measure() {
  if (s.live && s.camera) {
    const image = s.camera.frame(1024, 0.8);
    if (image) return showMeasure(image);
  }
  $("#measure-file", s.root).click();
}

function showMeasure(image) {
  const step = s.recipe.steps[s.step];
  openMeasure({
    image,
    targetMl: mlInText(step.instruction),
    recipeStep: step.instruction,
    onSay: (text) => say(text, { interrupt: true }),
    onRetake: measure,
  });
}

function command(name) {
  const t = s.timers[s.step];
  switch (name) {
    case "next": return go(1);
    case "back": return go(-1);
    case "repeat": return say(s.lastSaid || s.recipe.steps[s.step].instruction, { interrupt: true, log: false });
    case "pauseTimer": return t ? (toggleTimer(false), say("Timer paused.")) : say("There's no timer on this step.");
    case "startTimer": return t ? (toggleTimer(true), say(`Timer started. ${Math.ceil(t.left / 60)} minutes.`)) : say("There's no timer on this step.");
    case "timeLeft": return t ? say(`${Math.floor(t.left / 60)} minutes ${t.left % 60} seconds left.`) : say("No timer on this step; I'll tell you when it looks ready.");
    case "look": return lookNow(true);
    case "quiet": return stopSpeaking();
  }
}

async function coach({ image, question, userAsked }) {
  if (s.asking) return;
  s.asking = true;
  if (s.live) setBubble(question ? "Thinking about your question…" : "Looking at the pan…", "busy");
  const t = s.timers[s.step];
  try {
    const reply = await api.coach({
      recipe: s.recipe,
      stepIndex: s.step,
      image,
      question,
      elapsedSeconds: t ? t.total - t.left : 0,
      recentNotes: s.notes,
      tick: s.tick++,
    });
    if (!s?.root.isConnected) return;
    setBubble(reply.say, reply.status);
    s.notes = [...s.notes, reply.say].slice(-5);
    // Don't chatter: "looks fine" at most every 45 s, everything else straight away.
    const quietOk = reply.status === "on_track" && !question && !userAsked && Date.now() - s.lastOnTrackAt < 45000;
    if (quietOk) $("#narr-text", s.root).textContent = reply.say;
    else say(reply.say, { interrupt: reply.status === "fix_now" || Boolean(question) });
    if (reply.status === "on_track") s.lastOnTrackAt = Date.now();
    if (!s.live) toast(reply.say, 5000);
  } catch (err) {
    if (s?.live) setBubble(err.message);
    if (question) say("Sorry, I couldn't reach the coach. Try again in a moment.");
  } finally {
    if (s) s.asking = false;
  }
}

export function leave() {
  if (!s) return;
  s.intervals.forEach(clearInterval);
  s.cleanup?.forEach((fn) => fn());
  s.camera?.stop();
  s.listener?.stop();
  stopSpeaking();
  document.querySelector(".sheet-backdrop")?.remove();
  s = null;
}
