// How likely an ordinary store is to carry an ingredient, by store type.
// This is the "prior" used when no live stock data or recent shopper report exists.
// Numbers are deliberately coarse; they rank stores, they are never shown as facts.

// Most specific first: "lemongrass" must not match "lemon".
const KEYWORDS = [
  ["specialty", /halloumi|burrata|miso|gochujang|tahini|harissa|saffron|lemongrass|fish sauce|paneer|tofu|tempeh|sumac|za.atar|kimchi/],
  ["herb", /basil|parsley|coriander|cilantro|mint|dill|thyme|rosemary|chive/],
  ["staple", /pasta|penne|spaghetti|rice|flour|sugar|salt|pepper|oil|milk|egg|butter|bread|onion|potato|tomato|garlic|carrot|banana|apple|tinned|canned|stock cube/],
  ["common_fresh", /cheese|cheddar|feta|mozzarella|yoghurt|yogurt|cream|chicken|mince|beef|lemon|lime|cucumber|lettuce|spinach|mushroom|pepper|courgette|zucchini/],
];

// P(store carries it) by store type and ingredient class.
const PRIOR = {
  supermarket: { staple: 0.98, common_fresh: 0.92, herb: 0.8, specialty: 0.55, unknown: 0.6 },
  convenience: { staple: 0.85, common_fresh: 0.55, herb: 0.25, specialty: 0.12, unknown: 0.3 },
  greengrocer: { staple: 0.6, common_fresh: 0.5, herb: 0.85, specialty: 0.2, unknown: 0.3 },
  deli: { staple: 0.4, common_fresh: 0.65, herb: 0.35, specialty: 0.6, unknown: 0.35 },
  butcher: { staple: 0.1, common_fresh: 0.3, herb: 0.05, specialty: 0.05, unknown: 0.1 },
  other: { staple: 0.4, common_fresh: 0.3, herb: 0.2, specialty: 0.15, unknown: 0.2 },
};

export function ingredientClass(name) {
  const lower = String(name).toLowerCase();
  const hit = KEYWORDS.find(([, re]) => re.test(lower));
  return hit ? hit[0] : "unknown";
}

export function priorProbability(storeType, ingredient) {
  const table = PRIOR[storeType] || PRIOR.other;
  return table[ingredientClass(ingredient)];
}
