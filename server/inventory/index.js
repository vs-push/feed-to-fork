// Decides, for each nearby store and each missing ingredient, how sure we are that it's on the shelf.
// Three layers, strongest first:
//   1. live     - a retailer API says so right now
//   2. reported - other shoppers reported it recently (time-decayed)
//   3. likely   - a prior from store type x ingredient type
// The UI shows which layer an answer came from, so a guess is never presented as a fact.
import { adapterFor } from "./retailers.js";
import { reportEvidence } from "./reports.js";
import { priorProbability, ingredientClass } from "./categories.js";
import { localSubstitutes } from "../substitutions.js";

const label = (p) => (p >= 0.75 ? "likely" : p >= 0.4 ? "maybe" : "unlikely");

export function combine({ prior, report, live }) {
  if (live && live.inStock !== null && live.inStock !== undefined) {
    return { probability: live.inStock ? 0.97 : 0.03, basis: "live", label: live.inStock ? "in_stock" : "out_of_stock", price: live.price ?? null, aisle: live.aisle ?? null };
  }
  if (report) {
    // Treat the prior as 2 pseudo-reports; real reports outweigh it quickly.
    const priorWeight = 2;
    const p = (prior * priorWeight + report.score * report.weight) / (priorWeight + report.weight);
    return { probability: round(p), basis: "reported", label: label(p), reportedAt: report.newestAt, reports: report.count };
  }
  return { probability: round(prior), basis: "prior", label: label(prior) };
}

const round = (p) => Math.round(p * 100) / 100;

export async function checkStores(stores, items) {
  const results = await Promise.all(
    stores.map(async (store) => {
      let live = new Map();
      const adapter = adapterFor(store);
      if (adapter) {
        try {
          live = await adapter.check(store, items);
        } catch {
          live = new Map(); // fall through to reports / prior
        }
      }
      const availability = items.map((item) => ({
        item,
        ...combine({
          prior: priorProbability(store.type, item),
          report: reportEvidence(store.id, item, ingredientClass(item)),
          live: live.get(item),
        }),
      }));
      const coverage = availability.reduce((sum, a) => sum + a.probability, 0) / Math.max(1, items.length);
      return { ...store, liveSource: adapter?.name || null, availability, coverage: round(coverage) };
    })
  );

  // Rank: chance of getting everything, nudged by distance (a 10-min walk costs ~0.1).
  results.sort((a, b) => b.coverage - b.walkMinutes / 100 - (a.coverage - a.walkMinutes / 100));

  // If an item is unlikely everywhere, suggest substitutes up front.
  const hardToFind = items.filter((item) => results.every((s) => s.availability.find((a) => a.item === item).probability < 0.4));
  const substitutes = Object.fromEntries(hardToFind.map((item) => [item, localSubstitutes(item)]));

  return { stores: results, hardToFind, substitutes };
}
