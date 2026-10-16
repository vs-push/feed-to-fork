// Scale a recipe to a different number of people.
// Works on quantity strings like "400 g", "2 cloves", "½ tsp", "1 1/2 cups"; leaves "A pinch" alone.
// Pure functions: used by the browser and by the server's demo mode.

const UNICODE = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
const NUM = String.raw`(\d+(?:[.,]\d+)?)?\s*(?:(\d+)\/(\d+)|([¼½¾⅓⅔⅛]))?`;
const METRIC = /^(g|gram|grams|kg|ml|l|litre|litres|liter|liters|oz|lb)\b/i;
const PLURAL = { bunch: "bunches", clove: "cloves", tin: "tins", can: "cans", sprig: "sprigs", slice: "slices", egg: "eggs", handful: "handfuls", pinch: "pinches", cup: "cups", leaf: "leaves", piece: "pieces" };
const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([one, many]) => [many, one]));

export function parseAmount(text) {
  const m = new RegExp(`^\\s*${NUM}`).exec(text);
  if (!m || (!m[1] && !m[2] && !m[4])) return null;
  let value = m[1] ? parseFloat(m[1].replace(",", ".")) : 0;
  if (m[2]) value += Number(m[2]) / Number(m[3]);
  if (m[4]) value += UNICODE[m[4]];
  return { value, rest: text.slice(m[0].length).trim() };
}

function nice(value, metric, unit) {
  if (metric) {
    if (/^(kg|l|litre|litres|liter|liters)$/i.test(unit)) return String(Math.round(value * 100) / 100);
    if (value >= 100) return String(Math.round(value / 10) * 10); // 400 g -> 600 g, not 603 g
    if (value >= 20) return String(Math.round(value / 5) * 5);
    return String(Math.max(1, Math.round(value)));
  }
  // Spoons, cups, cloves, bunches: nearest quarter, written as a fraction.
  const q = Math.max(0.25, Math.round(value * 4) / 4);
  const whole = Math.floor(q);
  const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[q - whole] || "";
  return `${whole || ""}${frac}` || "¼";
}

export function scaleQuantity(quantity, factor) {
  const text = String(quantity ?? "");
  if (!factor || factor === 1) return text;
  const parsed = parseAmount(text);
  if (!parsed) return text; // "A pinch", "to taste"
  const unit = (parsed.rest.split(/\s+/)[0] || "").toLowerCase();
  const scaled = parsed.value * factor;
  let rest = parsed.rest;
  // "1 small bunch" x2 -> "2 small bunches"; "2 cloves" x0.5 -> "1 clove"
  const words = rest.split(" ");
  const last = words[words.length - 1].toLowerCase();
  if (scaled > 1 && PLURAL[last]) words[words.length - 1] = PLURAL[last];
  if (scaled <= 1 && SINGULAR[last]) words[words.length - 1] = SINGULAR[last];
  rest = words.join(" ");
  return `${nice(scaled, METRIC.test(unit), unit)}${rest ? ` ${rest}` : ""}`;
}

export function scaleRecipe(recipe, servings) {
  const target = Math.max(1, Math.round(Number(servings) || recipe.servings));
  const factor = target / (recipe.servings || target);
  if (factor === 1) return structuredClone(recipe);
  return {
    ...structuredClone(recipe),
    servings: target,
    ingredients: recipe.ingredients.map((i) => ({ ...i, quantity: scaleQuantity(i.quantity, factor) })),
  };
}
