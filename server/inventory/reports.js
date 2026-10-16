// Crowd reports: shoppers tap "Found it" or "Not there" in the app.
// Each report fades with time (half-life), so a "sold out" from last week stops mattering.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = new URL("../data/reports.json", import.meta.url);
const HALF_LIFE_HOURS = { herb: 12, common_fresh: 24, staple: 72, specialty: 72, unknown: 48 };

let reports = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];

const key = (item) => String(item).toLowerCase().replace(/^own-brand\s+/, "").trim();

export function addReport({ storeId, item, inStock, at = Date.now() }) {
  if (!storeId || !item || typeof inStock !== "boolean") throw new Error("storeId, item and inStock are required");
  reports.push({ storeId: String(storeId), item: key(item), inStock, at });
  // Keep the file small: only the last 30 days.
  const cutoff = Date.now() - 30 * 24 * 3600e3;
  reports = reports.filter((r) => r.at >= cutoff);
  writeFileSync(FILE, JSON.stringify(reports));
}

/**
 * Weighted evidence for one store + item. Returns null when nobody reported recently.
 * weight = 0.5 ^ (age / halfLife); score is the weighted share of "in stock" reports.
 */
export function reportEvidence(storeId, item, itemClass = "unknown", now = Date.now()) {
  const halfLife = (HALF_LIFE_HOURS[itemClass] || 48) * 3600e3;
  const relevant = reports.filter((r) => r.storeId === String(storeId) && r.item === key(item));
  if (!relevant.length) return null;
  let yes = 0, total = 0, newest = 0;
  for (const r of relevant) {
    const w = Math.pow(0.5, (now - r.at) / halfLife);
    total += w;
    if (r.inStock) yes += w;
    newest = Math.max(newest, r.at);
  }
  if (total < 0.05) return null; // all too old to count
  return { score: yes / total, weight: total, newestAt: newest, count: relevant.length };
}

// Test hook.
export function _resetReports(list = []) {
  reports = list;
}
