// JSON schemas for structured outputs. Every object lists all of its keys in `required`
// and sets additionalProperties: false, which structured outputs expects.

const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const int = { type: "integer" };
const strList = { type: "array", items: str };

export const ingredient = obj({ name: str, quantity: str, category: { type: "string", enum: ["produce", "herb", "dairy", "protein", "pantry", "spice", "bakery", "frozen", "other"] } });

export const step = obj({
  title: str,
  instruction: str,
  timerMinutes: int, // 0 when the step has no timer
  lookFor: str, // what "done" looks like, used by the camera coach
});

export const recipe = obj({
  title: str,
  servings: int,
  totalMinutes: int,
  diet: str,
  ingredients: { type: "array", items: ingredient },
  steps: { type: "array", items: step },
});

export const verify = obj({
  verdict: { type: "string", enum: ["real_recipe", "staged_hack", "ai_generated", "cant_tell"] },
  confidence: int, // 0-100
  headline: str,
  reasoning: str,
  skips: strList, // what the post leaves out
  sourcesToCheck: { type: "array", items: obj({ name: str, why: str, url: str }) },
  recipe,
});

export const adapt = obj({
  recipe,
  swaps: { type: "array", items: obj({ from: str, to: str, reason: str }) },
  estimatedCost: obj({ amount: { type: "number" }, currency: str, note: str }),
  localTips: strList,
});

export const fridge = obj({
  seen: strList,
  items: { type: "array", items: obj({ ingredient: str, status: { type: "string", enum: ["have", "buy"] }, note: str }) },
});

export const substitute = obj({
  options: { type: "array", items: obj({ name: str, ratio: str, note: str }) },
});

export const coach = obj({
  status: { type: "string", enum: ["on_track", "fix_now", "step_done", "cant_see", "answer"] },
  say: str, // one or two short sentences, spoken aloud
  minutesLeft: int, // estimate for this step; 0 if done or unknown
  advanceStep: { type: "boolean" },
});

// "How much does this cup hold?" Box coordinates are fractions (0-1) of the image size,
// so the browser can draw the outline over the photo at any screen size.
export const measure = obj({
  found: { type: "boolean" },
  container: str, // "straight-sided mug", "wine glass", "measuring jug"…
  capacityMl: int, // best estimate, filled to the brim
  rangeLowMl: int,
  rangeHighMl: int,
  currentContentsMl: int, // liquid already inside; 0 if empty
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  scaleReference: str, // what was used to judge size
  box: obj({ x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }),
  targetFillPercent: int, // how high (0-100 % of inside height) to fill for the requested amount; 0 if none
  say: str, // one short spoken sentence
  tip: str, // how to get a better estimate
});
