import "./env.js";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO, MODEL, askJSON, imageBlock, text, ClaudeRefusal } from "./claude.js";
import * as schemas from "./schemas.js";
import * as prompts from "./prompts.js";
import * as mock from "./mock.js";
import { localSubstitutes } from "./substitutions.js";
import { findNearbyStores } from "./inventory/stores.js";
import { checkStores } from "./inventory/index.js";
import { addReport } from "./inventory/reports.js";
import { scaleRecipe } from "../public/js/lib/scale.js";

const app = express();
app.use(express.json({ limit: "12mb" })); // photos arrive as base64 data URLs
// fileURLToPath (not URL.pathname) so the path is valid on Windows too.
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

const sample = JSON.parse(readFileSync(new URL("./data/sample-recipe.json", import.meta.url), "utf8"));

// Wrap a handler: demo stand-in when there's no key, friendly errors otherwise.
const route = (demoFn, liveFn) => async (req, res) => {
  try {
    const result = DEMO ? demoFn(req.body || {}) : await liveFn(req.body || {});
    res.json({ ...result, _demo: DEMO });
  } catch (err) {
    const status = err instanceof ClaudeRefusal ? 422 : err.status || 500;
    res.status(status).json({ error: err.message });
  }
};

app.get("/api/config", (_req, res) => res.json({ demo: DEMO, model: DEMO ? null : MODEL }));
app.get("/api/sample", (_req, res) => res.json(sample));

// 1) VERIFY: is the post real, staged, AI-made? What does it skip?
app.post(
  "/api/verify",
  route(mock.verify, async ({ description = "", image, trustedSources = [] }) => {
    const content = [];
    if (image) content.push(imageBlock(image));
    content.push(text(`Post description from the user:\n${description || "(none - judge from the screenshot)"}\n\nTrusted sources the user likes: ${trustedSources.join(", ") || "none given"}`));
    return askJSON({ system: prompts.VERIFY, content, schema: schemas.verify, effort: "medium" });
  })
);

// 2) ADAPT: make it work where the user lives.
app.post(
  "/api/adapt",
  route(mock.adapt, async ({ recipe, servings, location, spice, sweetness, budget }) => {
    // Scale on the server too, so the quantities Claude starts from are already right.
    const scaled = servings ? scaleRecipe(recipe, servings) : recipe;
    const brief = { cookingIn: location, servings: scaled.servings, spice, sweetness, budgetForAllServings: budget, recipe: scaled };
    return askJSON({ system: prompts.ADAPT, content: [text(JSON.stringify(brief))], schema: schemas.adapt, effort: "medium" });
  })
);

// 3) GATHER: what's in the fridge vs what the recipe needs.
app.post(
  "/api/fridge",
  route(mock.fridge, async ({ recipe, image, text: typed = "", keepsBasics = true }) => {
    const content = [];
    if (image) content.push(imageBlock(image));
    content.push(text(`Recipe ingredients:\n${recipe.ingredients.map((i) => `- ${i.name} (${i.quantity})`).join("\n")}\n\nCook's typed list: ${typed || "(none)"}\nKeeps basics (salt, pepper, oil): ${keepsBasics}`));
    return askJSON({ system: prompts.FRIDGE, content, schema: schemas.fridge, effort: "low" });
  })
);

// Substitutes: the offline table first, Claude only if the table has nothing.
app.post(
  "/api/substitute",
  route(mock.substitute, async ({ ingredient, recipeTitle, location }) => {
    const local = localSubstitutes(ingredient);
    if (local.length) return { options: local, source: "table" };
    const content = [text(`Recipe: ${recipeTitle}\nMissing ingredient: ${ingredient}\nCooking in: ${location?.label || "unknown"}`)];
    return { ...(await askJSON({ system: prompts.SUBSTITUTE, content, schema: schemas.substitute, effort: "low", maxTokens: 4000 })), source: "claude" };
  })
);

// Nearby stores + per-item availability (see docs/SOLUTIONS.md, question 1).
app.post("/api/stores", async (req, res) => {
  const { lat, lon, items = [] } = req.body || {};
  if (typeof lat !== "number" || typeof lon !== "number") return res.status(400).json({ error: "lat and lon are required" });
  const found = await findNearbyStores({ lat, lon });
  const checked = await checkStores(found.stores, items);
  res.json({ ...checked, source: found.source, warning: found.warning || null });
});

// Shoppers confirm or deny stock; this feeds the "reported" layer.
app.post("/api/reports", (req, res) => {
  try {
    addReport(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4) COOK: the live coach. Gets the current step, an optional camera frame and an optional question.
app.post(
  "/api/coach",
  route(
    ({ recipe, stepIndex, image, question, tick }) => mock.coach({ recipe, stepIndex, question, hasImage: Boolean(image), tick }),
    async ({ recipe, stepIndex = 0, image, question, elapsedSeconds = 0, recentNotes = [] }) => {
      const step = recipe.steps[stepIndex];
      const content = [];
      if (image) content.push(imageBlock(image));
      content.push(
        text(
          [
            `Recipe: ${recipe.title} (${recipe.servings} servings)`,
            `Current step ${stepIndex + 1} of ${recipe.steps.length}: ${step.instruction}`,
            `Done looks like: ${step.lookFor}`,
            step.timerMinutes ? `Step timer: ${step.timerMinutes} min, ${Math.round(elapsedSeconds / 60)} min elapsed.` : "No timer on this step.",
            recentNotes.length ? `What you already told the cook (don't repeat it): ${recentNotes.slice(-3).join(" | ")}` : "",
            question ? `The cook asks: "${question}"` : "No question; this is a routine camera check-in.",
            image ? "" : "No camera frame this time.",
          ].filter(Boolean).join("\n")
        )
      );
      // Low effort keeps the spoken reply fast enough to feel live.
      return askJSON({ system: prompts.COACH, content, schema: schemas.coach, effort: "low", maxTokens: 4000 });
    }
  )
);

// Measure a container: "how many ml does this cup hold?" (and how high to fill it for an amount).
app.post(
  "/api/measure",
  route(
    ({ image, targetMl }) => mock.measure({ targetMl, hasImage: Boolean(image) }),
    async ({ image, targetMl = 0, recipeStep = "" }) => {
      if (!image) throw Object.assign(new Error("A photo is needed to measure."), { status: 400 });
      const ask = [
        targetMl > 0 ? `The cook needs ${Math.round(targetMl)} ml.` : "No specific amount requested.",
        recipeStep ? `Current recipe step: ${recipeStep}` : "",
      ].filter(Boolean).join("\n");
      return askJSON({ system: prompts.MEASURE, content: [imageBlock(image), text(ask)], schema: schemas.measure, effort: "medium", maxTokens: 4000 });
    }
  )
);

// Location helpers (OpenStreetMap Nominatim). Proxied so we can set a proper User-Agent.
async function nominatim(path) {
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
    headers: { "User-Agent": "FeedToFork/0.1 (cooking app demo)", "Accept-Language": "en" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}
const place = (r) => ({
  label: [r.address?.city || r.address?.town || r.address?.village || r.address?.suburb, r.address?.country].filter(Boolean).join(", ") || r.display_name,
  countryCode: (r.address?.country_code || "").toUpperCase(),
  lat: Number(r.lat),
  lon: Number(r.lon),
});

app.get("/api/geo/reverse", async (req, res) => {
  try {
    res.json(place(await nominatim(`reverse?format=jsonv2&addressdetails=1&lat=${Number(req.query.lat)}&lon=${Number(req.query.lon)}`)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/geo/search", async (req, res) => {
  try {
    const results = await nominatim(`search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(req.query.q || "")}`);
    res.json(results.map(place));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const port = Number(process.env.PORT) || 3000;
// Express 5 passes listen errors (e.g. port already in use) to this callback.
app.listen(port, (err) => {
  if (err) {
    console.error(err.code === "EADDRINUSE"
      ? `Port ${port} is already in use - probably an older Feed to Fork server is still running.\nStop it (close that terminal, or on Windows run: taskkill /F /IM node.exe), or start on another port.`
      : `Could not start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Feed to Fork running on http://localhost:${port}`);
  console.log(DEMO ? "DEMO mode: no ANTHROPIC_API_KEY, using stand-in answers." : `Using Claude model ${MODEL}.`);
});
