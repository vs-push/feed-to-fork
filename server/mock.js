// Stand-in answers for DEMO mode (no API key). They let the whole flow run offline and are
// clearly labelled as samples in the UI.
import { readFileSync } from "node:fs";
import { localSubstitutes } from "./substitutions.js";
import { scaleRecipe } from "../public/js/lib/scale.js";

const sample = JSON.parse(readFileSync(new URL("./data/sample-recipe.json", import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);

export function verify() {
  return clone(sample.verify);
}

const CURRENCY_BY_COUNTRY = { GB: "GBP", US: "USD", IE: "EUR", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR", LV: "EUR", CA: "CAD", AU: "AUD", IN: "INR", JP: "JPY" };

export function adapt({ recipe, servings, location, spice, sweetness, budget }) {
  const out = servings ? scaleRecipe(recipe, servings) : clone(recipe);
  const swaps = [];
  const country = location?.countryCode || "GB";
  const feta = out.ingredients.find((i) => /feta/i.test(i.name));
  if (feta && country === "GB") {
    feta.name = "Own-brand feta";
    swaps.push({ from: "Feta", to: "Own-brand feta", reason: "Supermarket own-brand feta is in nearly every UK store and costs about half as much." });
  }
  if (spice && spice !== "mild") {
    out.ingredients.push({ name: "Chilli flakes", quantity: spice === "hot" ? "1 tsp" : "½ tsp", category: "spice" });
    swaps.push({ from: "—", to: "Chilli flakes", reason: `Added for a ${spice} kick.` });
  }
  if (sweetness && sweetness !== "none") {
    out.ingredients.push({ name: "Honey", quantity: sweetness === "sweeter" ? "2 tsp" : "1 tsp", category: "pantry" });
    swaps.push({ from: "—", to: "Honey", reason: "A little honey drizzled over the feta before baking rounds out sharp tomatoes." });
  }
  return {
    recipe: out,
    swaps,
    estimatedCost: { amount: Math.min(budget || 6, 3 * out.servings), currency: CURRENCY_BY_COUNTRY[country] || "EUR", note: "Illustrative grocery estimate (demo)." },
    localTips: ["Fan ovens run hotter: use the lower temperature.", "Cherry tomatoes on the vine are often cheaper per kilo in the loose aisle."],
  };
}

export function fridge({ recipe, text = "" }) {
  const said = text.toLowerCase();
  const usual = ["tomato", "pasta", "penne", "garlic", "oil", "pepper", "salt"];
  const items = recipe.ingredients.map((ing) => {
    const name = ing.name.toLowerCase();
    const have = said ? said.split(/[,\n]/).some((w) => w.trim() && name.includes(w.trim().replace(/s$/, ""))) : usual.some((u) => name.includes(u));
    return { ingredient: ing.name, status: have ? "have" : "buy", note: said ? "" : "Demo guess: no photo analysed." };
  });
  return { seen: said ? said.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : ["(demo) tomatoes", "pasta", "garlic", "olive oil"], items };
}

export function substitute({ ingredient }) {
  const options = localSubstitutes(ingredient);
  return { options: options.length ? options : [{ name: "Ask in store", ratio: "—", note: "No offline substitute for this one; with an API key Claude suggests one." }] };
}

// The demo coach walks through believable states so the voice loop can be tested.
export function coach({ recipe, stepIndex = 0, question, hasImage, tick = 0 }) {
  const step = recipe.steps[stepIndex] || recipe.steps[0];
  if (question) {
    const q = question.toLowerCase();
    let say = `Good question. For this step, look for: ${step.lookFor}`;
    if (/salt/.test(q)) say = "Hold the salt until the end. Feta is salty, so taste first.";
    else if (/fan|temperature|oven|hot/.test(q)) say = "Use 200 degrees, or 180 if your oven has a fan.";
    else if (/(sub|instead|replace|don.t have)/.test(q)) say = "No basil? Flat-leaf parsley or a handful of spinach works fine.";
    else if (/how long|time|done/.test(q)) say = step.timerMinutes ? `About ${step.timerMinutes} minutes in total for this step. I'll tell you when it looks ready.` : "This step is done when it looks right, not by the clock.";
    return { status: "answer", say, minutesLeft: 0, advanceStep: false };
  }
  if (!hasImage) return { status: "cant_see", say: "I can't see the pan. Tilt the phone down a little.", minutesLeft: 0, advanceStep: false };
  const script = [
    { status: "on_track", say: "Looks good. Keep going." },
    { status: "on_track", say: `Nearly there. Look for ${step.lookFor.charAt(0).toLowerCase() + step.lookFor.slice(1)}` },
    { status: "fix_now", say: "Some tomatoes at the edge are catching. Give the dish a little shake." },
    { status: "step_done", say: "That looks ready. Say next when you want the next step." },
  ];
  const pick = script[Math.min(tick, script.length - 1)];
  return { ...pick, minutesLeft: Math.max(0, (step.timerMinutes || 0) - tick * 3), advanceStep: pick.status === "step_done" };
}

// Demo: pretend the camera sees an ordinary mug in the middle of the frame.
export function measure({ targetMl = 0, hasImage }) {
  if (!hasImage) return { found: false, container: "", capacityMl: 0, rangeLowMl: 0, rangeHighMl: 0, currentContentsMl: 0, confidence: "low", scaleReference: "", box: { x: 0, y: 0, width: 0, height: 0 }, targetFillPercent: 0, say: "I need a photo to measure.", tip: "Hold the cup in front of the camera." };
  const capacity = 300;
  const target = Math.max(0, Number(targetMl) || 0);
  return {
    found: true,
    container: "Straight-sided mug (demo)",
    capacityMl: capacity,
    rangeLowMl: 260,
    rangeHighMl: 340,
    currentContentsMl: 0,
    confidence: "medium",
    scaleReference: "Demo answer: no image was analysed",
    box: { x: 0.32, y: 0.24, width: 0.36, height: 0.52 },
    targetFillPercent: target ? Math.min(100, Math.round((target / capacity) * 100)) : 0,
    say: target ? `That mug holds about ${capacity} millilitres. Fill it ${target >= capacity ? "to the top" : `about ${Math.round((target / capacity) * 100)} percent of the way`} for ${target}.` : `That mug holds about ${capacity} millilitres.`,
    tip: "Put a can or your hand next to the cup for a better estimate.",
  };
}
