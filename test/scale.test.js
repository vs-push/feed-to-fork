import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleQuantity, scaleRecipe } from "../public/js/lib/scale.js";

test("metric amounts scale and round sensibly", () => {
  assert.equal(scaleQuantity("400 g", 2), "800 g");
  assert.equal(scaleQuantity("180 g", 1.5), "270 g");
  assert.equal(scaleQuantity("200 g", 3), "600 g");
  assert.equal(scaleQuantity("250 ml", 0.5), "130 ml"); // over 100: nearest 10
});

test("spoons and counts use fractions and plurals", () => {
  assert.equal(scaleQuantity("2 tbsp", 2), "4 tbsp");
  assert.equal(scaleQuantity("½ tsp", 3), "1½ tsp");
  assert.equal(scaleQuantity("1 1/2 cups", 2), "3 cups");
  assert.equal(scaleQuantity("2 cloves", 0.5), "1 clove");
  assert.equal(scaleQuantity("1 small bunch", 2), "2 small bunches");
});

test("words without a number stay as they are", () => {
  assert.equal(scaleQuantity("A pinch", 3), "A pinch");
  assert.equal(scaleQuantity("to taste", 2), "to taste");
});

test("scaleRecipe changes servings and quantities, not the original", () => {
  const recipe = { title: "T", servings: 2, ingredients: [{ name: "Pasta", quantity: "180 g" }], steps: [] };
  const four = scaleRecipe(recipe, 4);
  assert.equal(four.servings, 4);
  assert.equal(four.ingredients[0].quantity, "360 g");
  assert.equal(recipe.ingredients[0].quantity, "180 g");
});
