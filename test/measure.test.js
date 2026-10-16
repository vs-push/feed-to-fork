import { test } from "node:test";
import assert from "node:assert/strict";
import { mlInText, kitchenUnits } from "../public/js/lib/measure.js";
import { measure } from "../server/mock.js";

test("finds the amount a recipe step asks for", () => {
  assert.equal(mlInText("Add 200 ml of stock and stir"), 200);
  assert.equal(mlInText("Pour in 150ml cream"), 150);
  assert.equal(mlInText("Add 1.5 litres of water"), 1500);
  assert.equal(mlInText("Save a mug of pasta water"), 0);
});

test("kitchen units", () => {
  assert.equal(kitchenUnits(240), "1 cup · 16 tbsp");
  assert.equal(kitchenUnits(300), "1¼ cups · 20 tbsp");
  assert.equal(kitchenUnits(15), "1 tbsp");
});

test("demo measure answer has a usable box and fill line", () => {
  const r = measure({ targetMl: 200, hasImage: true });
  assert.ok(r.found);
  assert.ok(r.box.x + r.box.width <= 1 && r.box.y + r.box.height <= 1);
  assert.equal(r.targetFillPercent, 67);
  assert.equal(measure({ hasImage: false }).found, false);
});
