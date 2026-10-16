// Offline substitution table. Claude is asked only when nothing here fits,
// so common swaps are instant, free and work without a network.

const TABLE = [
  { match: /basil/, options: [
    { name: "Flat-leaf parsley", ratio: "1:1", note: "Fresher and milder; add a little lemon zest to lift it." },
    { name: "Baby spinach", ratio: "a handful", note: "Adds green and softness, not the basil aroma." },
    { name: "Dried basil", ratio: "1 tsp per small bunch", note: "Stir it into the sauce rather than scattering on top." } ] },
  { match: /feta/, options: [
    { name: "Goat's cheese", ratio: "1:1", note: "Creamier and tangier; melts faster, so bake 5 minutes less." },
    { name: "Ricotta + pinch of salt", ratio: "1:1", note: "Milder; season well." },
    { name: "Halloumi", ratio: "1:1", note: "Stays in chunks instead of melting into a sauce." } ] },
  { match: /cherry tomato|tomatoes?$/, options: [
    { name: "Tinned whole tomatoes", ratio: "1 tin per 400 g", note: "Drain half the juice; the sauce will be looser." },
    { name: "Large tomatoes, chopped", ratio: "1:1 by weight", note: "Cut into 2 cm chunks; bake a few minutes longer." } ] },
  { match: /penne|rigatoni|fusilli|pasta/, options: [
    { name: "Any short pasta", ratio: "1:1", note: "Rigatoni, fusilli or macaroni all hold the sauce." } ] },
  { match: /olive oil/, options: [
    { name: "Rapeseed or sunflower oil", ratio: "1:1", note: "Neutral taste; finish with a drizzle of something tastier if you have it." } ] },
  { match: /garlic/, options: [
    { name: "Garlic granules", ratio: "¼ tsp per clove", note: "Sprinkle on before baking." } ] },
  { match: /butter/, options: [
    { name: "Olive oil", ratio: "¾ of the butter weight", note: "Works for frying and roasting, not for baking cakes." } ] },
  { match: /cream/, options: [
    { name: "Greek yoghurt", ratio: "1:1", note: "Stir in off the heat so it doesn't split." },
    { name: "Crème fraîche", ratio: "1:1", note: "Can be boiled without splitting." } ] },
  { match: /lemon/, options: [
    { name: "White wine vinegar", ratio: "½ the amount", note: "Sharper; add a little at a time." } ] },
  { match: /egg/, options: [
    { name: "1 tbsp ground flax + 3 tbsp water", ratio: "per egg", note: "For binding in bakes, not for omelettes." } ] },
  { match: /parmesan|parmigiano/, options: [
    { name: "Grana Padano or any hard Italian-style cheese", ratio: "1:1", note: "Very close; often cheaper." } ] },
  { match: /chilli flakes|red pepper flakes/, options: [
    { name: "Fresh chilli, finely chopped", ratio: "½ chilli per tsp", note: "Heat varies; taste first." } ] },
];

export function localSubstitutes(ingredient) {
  const name = String(ingredient || "").toLowerCase();
  const row = TABLE.find((entry) => entry.match.test(name));
  return row ? row.options.map((o) => ({ ...o })) : [];
}
