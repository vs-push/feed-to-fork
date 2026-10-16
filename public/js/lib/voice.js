// Voice in and out, hands-free.
//  - speak(): text-to-speech with a queue. While it talks, the microphone ignores what it hears,
//    so the coach never answers itself.
//  - Listener: continuous speech recognition. Short commands ("next", "repeat", "pause timer")
//    work on their own; questions start with the wake word ("Chef, is this done?").

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = Boolean(Recognition);
export const canSpeak = "speechSynthesis" in window;

let speaking = false;
const speakListeners = new Set();
export const isSpeaking = () => speaking;
export const onSpeakingChange = (fn) => (speakListeners.add(fn), () => speakListeners.delete(fn));
const setSpeaking = (v) => {
  speaking = v;
  speakListeners.forEach((fn) => fn(v));
};

export function speak(text, { interrupt = false, rate = 1 } = {}) {
  if (!canSpeak || !text) return Promise.resolve();
  if (interrupt) speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = navigator.language?.startsWith("en") ? navigator.language : "en-GB";
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => {
      if (!speechSynthesis.speaking) setSpeaking(false);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
  setSpeaking(false);
}

// Spoken commands. Order matters: first match wins.
const COMMANDS = [
  ["next", /\b(next( step)?|done|finished|go on)\b/],
  ["back", /\b(back|previous( step)?|go back)\b/],
  ["repeat", /\b(repeat|say (that|it) again|what was that)\b/],
  ["pauseTimer", /\b(pause|stop) (the )?timer\b/],
  ["startTimer", /\b(start|resume) (the )?timer\b/],
  ["timeLeft", /\bhow (long|much time)( is)? left\b/],
  ["look", /\b(look|check|show me|see) (at )?(the |my )?(pan|pot|dish|tray|this|it)\b/],
  ["quiet", /\b(be quiet|stop talking|mute)\b/],
];

export function parseUtterance(transcript, wakeWord = "chef") {
  const t = transcript.toLowerCase().trim();
  const woke = new RegExp(`^(hey |ok |okay )?${wakeWord}\\b[,.]?\\s*`).exec(t);
  const body = woke ? t.slice(woke[0].length) : t;
  for (const [name, re] of COMMANDS) if (re.test(body) && body.split(" ").length <= 6) return { type: "command", name };
  if (woke && body.length > 2) return { type: "question", text: transcript.trim().slice(woke[0].length) };
  return { type: "ignored" };
}

export class Listener {
  constructor({ onCommand, onQuestion, onHeard, wakeWord = "chef" }) {
    this.handlers = { onCommand, onQuestion, onHeard };
    this.wakeWord = wakeWord;
    this.active = false;
    this.rec = null;
  }

  start() {
    if (!canListen || this.active) return false;
    this.active = true;
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-GB";
    rec.onresult = (event) => {
      if (speaking) return; // ignore our own voice
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const transcript = result[0].transcript;
      this.handlers.onHeard?.(transcript);
      const parsed = parseUtterance(transcript, this.wakeWord);
      if (parsed.type === "command") this.handlers.onCommand?.(parsed.name);
      if (parsed.type === "question") this.handlers.onQuestion?.(parsed.text);
    };
    // Browsers end recognition after silence; restart while we're still active.
    rec.onend = () => this.active && setTimeout(() => this.active && rec.start(), 250);
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this.active = false;
    };
    rec.start();
    this.rec = rec;
    return true;
  }

  stop() {
    this.active = false;
    try {
      this.rec?.stop();
    } catch {
      /* already stopped */
    }
  }
}

/** A short two-tone chime for timers (no audio files needed). */
export function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
  } catch {
    /* audio not available */
  }
}
