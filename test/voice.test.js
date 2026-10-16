import { test } from "node:test";
import assert from "node:assert/strict";

// voice.js reads window at import time; give it a minimal stand-in.
globalThis.window = {};
const { parseUtterance } = await import("../public/js/lib/voice.js");

test("short commands work without the wake word", () => {
  assert.deepEqual(parseUtterance("next step"), { type: "command", name: "next" });
  assert.deepEqual(parseUtterance("pause the timer"), { type: "command", name: "pauseTimer" });
  assert.deepEqual(parseUtterance("how long is left"), { type: "command", name: "timeLeft" });
});

test("questions need the wake word", () => {
  assert.deepEqual(parseUtterance("Chef, is the feta soft enough?"), { type: "question", text: "is the feta soft enough?" });
  assert.deepEqual(parseUtterance("hey chef can I use parsley instead"), { type: "question", text: "can I use parsley instead" });
  assert.equal(parseUtterance("I was telling my sister about the weekend").type, "ignored");
});

test("custom wake word", () => {
  assert.equal(parseUtterance("Basil, should I add more oil?", "basil").type, "question");
});
