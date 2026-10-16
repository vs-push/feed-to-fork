// App state, saved to localStorage so a refresh mid-cook doesn't lose your place.
const KEY = "feed-to-fork:v1";

const defaults = {
  recipe: null, // the recipe currently in the journey (after verify, then after adapt)
  verify: null,
  adapt: null,
  location: null, // { label, countryCode, lat, lon }
  prefs: { spice: "mild", sweetness: "none", budget: 6, servings: null }, // servings: null = as the recipe says
  groceries: {}, // ingredient name -> "have" | "buy"
  swaps: {}, // original ingredient -> { name, ratio, note }
  cook: { stepIndex: 0 },
  saved: [], // [{ id, title, recipe, savedAt }]
  pantry: ["Salt", "Black pepper", "Olive oil", "Garlic"],
  trustedSources: ["BBC Good Food", "Serious Eats"],
  settings: { wakeWord: "chef", coachEverySeconds: 10, voiceRate: 1 },
};

function load() {
  try {
    return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return structuredClone(defaults);
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or full storage: keep working in memory */
  }
}

export function startJourney(recipe, verify = null) {
  state.recipe = recipe;
  state.verify = verify;
  state.adapt = null;
  state.prefs.servings = recipe?.servings || null;
  state.groceries = {};
  state.swaps = {};
  state.cook = { stepIndex: 0 };
  save();
}

export function saveRecipe(recipe) {
  const id = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  state.saved = [{ id, title: recipe.title, recipe, savedAt: Date.now() }, ...state.saved.filter((r) => r.id !== id)].slice(0, 50);
  save();
}

const CURRENCY = { GB: ["GBP", "£"], US: ["USD", "$"], CA: ["CAD", "$"], AU: ["AUD", "$"], IN: ["INR", "₹"], JP: ["JPY", "¥"], CH: ["CHF", "CHF "], SE: ["SEK", "kr "], NO: ["NOK", "kr "], DK: ["DKK", "kr "], PL: ["PLN", "zł "] };
export function currencyFor(countryCode) {
  return CURRENCY[countryCode] || ["EUR", "€"];
}
