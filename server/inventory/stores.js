// Finds grocery stores near the cook with OpenStreetMap's Overpass API (free, no key).
// Falls back to a small sample list when the network is unavailable, so the demo still works.

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const SHOP_TYPES = { supermarket: "supermarket", convenience: "convenience", greengrocer: "greengrocer", deli: "deli", butcher: "butcher", grocery: "convenience", farm: "greengrocer" };

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const walkMinutes = (km) => Math.max(1, Math.round((km / 4.8) * 60));

export async function findNearbyStores({ lat, lon, radiusM = 2500, limit = 8 }) {
  const query = `[out:json][timeout:15];
(
  node["shop"~"^(${Object.keys(SHOP_TYPES).join("|")})$"](around:${radiusM},${lat},${lon});
  way["shop"~"^(${Object.keys(SHOP_TYPES).join("|")})$"](around:${radiusM},${lat},${lon});
);
out center tags;`;
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FeedToFork/0.1" },
      body: "data=" + encodeURIComponent(query),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    const here = { lat, lon };
    const stores = data.elements
      .map((el) => {
        const pos = el.type === "node" ? { lat: el.lat, lon: el.lon } : el.center;
        if (!pos) return null;
        const tags = el.tags || {};
        const km = distanceKm(here, pos);
        return {
          id: `osm:${el.type}/${el.id}`,
          name: tags.name || tags.brand || "Unnamed shop",
          brand: tags.brand || null,
          type: SHOP_TYPES[tags.shop] || "other",
          lat: pos.lat,
          lon: pos.lon,
          km: Math.round(km * 10) / 10,
          walkMinutes: walkMinutes(km),
          openingHours: tags.opening_hours || null,
          source: "openstreetmap",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.km - b.km);
    return { stores: dedupe(stores).slice(0, limit), source: "openstreetmap" };
  } catch (err) {
    return { stores: sampleStores({ lat, lon }), source: "sample", warning: `Store search unavailable (${err.message}); showing sample stores.` };
  }
}

function dedupe(stores) {
  const seen = new Set();
  return stores.filter((s) => {
    const k = `${s.name}|${s.lat.toFixed(3)}|${s.lon.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function sampleStores({ lat, lon }) {
  const mk = (id, name, type, dLat, dLon) => {
    const pos = { lat: +(lat + dLat).toFixed(5), lon: +(lon + dLon).toFixed(5) };
    const km = distanceKm({ lat, lon }, pos);
    return { id, name, brand: null, type, ...pos, km: Math.round(km * 10) / 10, walkMinutes: walkMinutes(km), openingHours: null, source: "sample" };
  };
  return [
    mk("sample:market-basket", "Market Basket", "convenience", 0.0036, 0),
    mk("sample:coop", "Co-op Food", "supermarket", 0.0126, 0),
    mk("sample:tesco-express", "Tesco Express", "convenience", 0.0207, 0),
  ];
}
