import { test } from "node:test";
import assert from "node:assert/strict";
import { combine, checkStores } from "../server/inventory/index.js";
import { ingredientClass, priorProbability } from "../server/inventory/categories.js";
import { addReport, reportEvidence, _resetReports } from "../server/inventory/reports.js";
import { distanceKm } from "../server/inventory/stores.js";
import { localSubstitutes } from "../server/substitutions.js";

test("ingredient classes", () => {
  assert.equal(ingredientClass("Penne pasta"), "staple");
  assert.equal(ingredientClass("Basil leaves"), "herb");
  assert.equal(ingredientClass("Halloumi"), "specialty");
  assert.equal(ingredientClass("Dragonfruit"), "unknown");
});

test("supermarkets are more likely than corner shops to stock herbs", () => {
  assert.ok(priorProbability("supermarket", "basil") > priorProbability("convenience", "basil"));
});

test("live data beats everything", () => {
  const r = combine({ prior: 0.9, report: { score: 1, weight: 5, newestAt: 0, count: 5 }, live: { inStock: false } });
  assert.equal(r.basis, "live");
  assert.equal(r.label, "out_of_stock");
});

test("recent shopper reports pull the estimate away from the prior", () => {
  const r = combine({ prior: 0.8, report: { score: 0, weight: 3, newestAt: 0, count: 3 } });
  assert.equal(r.basis, "reported");
  assert.ok(r.probability < 0.4, `expected < 0.4, got ${r.probability}`);
});

test("reports fade with age", () => {
  const now = Date.now();
  _resetReports([{ storeId: "s1", item: "basil leaves", inStock: false, at: now - 1000 }]);
  const fresh = reportEvidence("s1", "Basil leaves", "herb", now);
  const old = reportEvidence("s1", "Basil leaves", "herb", now + 7 * 24 * 3600e3);
  assert.ok(fresh.weight > 0.9);
  assert.equal(old, null);
  _resetReports([]);
});

test("addReport validates input", () => {
  assert.throws(() => addReport({ storeId: "x", item: "feta" }));
});

test("checkStores ranks the store most likely to have everything first and flags hard-to-find items", async () => {
  _resetReports([]);
  const stores = [
    { id: "a", name: "Corner shop", type: "convenience", walkMinutes: 3 },
    { id: "b", name: "Big supermarket", type: "supermarket", walkMinutes: 12 },
  ];
  const out = await checkStores(stores, ["Feta", "Basil leaves", "Lemongrass"]);
  assert.equal(out.stores[0].id, "b");
  assert.deepEqual(out.hardToFind, []);
  const corner = await checkStores([stores[0]], ["Lemongrass"]);
  assert.deepEqual(corner.hardToFind, ["Lemongrass"]);
});

test("haversine distance", () => {
  const km = distanceKm({ lat: 51.5072, lon: -0.1276 }, { lat: 51.5072 + 0.009, lon: -0.1276 });
  assert.ok(Math.abs(km - 1) < 0.05);
});

test("offline substitutes", () => {
  assert.ok(localSubstitutes("Basil leaves").some((o) => /parsley/i.test(o.name)));
  assert.deepEqual(localSubstitutes("Unobtainium"), []);
});
