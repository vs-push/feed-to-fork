// Live stock adapters. Only a few retailers expose stock through a public API, so each adapter
// is optional and switched on by its credentials. An adapter answers for the stores it owns:
//   canHandle(store) -> boolean
//   check(store, items) -> Map(item -> { inStock: boolean|null, price?, aisle? })
//
// Kroger (US) publishes a Products API with per-location fulfilment and stock level.
// Field names below follow Kroger's public docs (developer.kroger.com); verify them against
// the current version before relying on this in production.

const kroger = {
  name: "kroger",
  enabled: () => Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET),
  token: null,
  tokenExpires: 0,

  canHandle(store) {
    return /kroger|ralphs|fred meyer|king soopers|smith's|fry's|harris teeter|dillons|qfc|mariano/i.test(`${store.brand || ""} ${store.name}`);
  },

  async auth() {
    if (this.token && Date.now() < this.tokenExpires) return this.token;
    const basic = Buffer.from(`${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`).toString("base64");
    const res = await fetch("https://api.kroger.com/v1/connect/oauth2/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=product.compact",
    });
    if (!res.ok) throw new Error(`Kroger auth ${res.status}`);
    const json = await res.json();
    this.token = json.access_token;
    this.tokenExpires = Date.now() + (json.expires_in - 60) * 1000;
    return this.token;
  },

  async locationId(store) {
    const token = await this.auth();
    const url = `https://api.kroger.com/v1/locations?filter.latLong.near=${store.lat},${store.lon}&filter.radiusInMiles=1&filter.limit=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    return json.data?.[0]?.locationId || null;
  },

  async check(store, items) {
    const token = await this.auth();
    const locationId = await this.locationId(store);
    const out = new Map();
    if (!locationId) return out;
    for (const item of items) {
      const url = `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(item)}&filter.locationId=${locationId}&filter.limit=5`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
      const products = (await res.json()).data || [];
      const stocked = products.find((p) => p.items?.some((i) => i.fulfillment?.inStore && i.inventory?.stockLevel !== "TEMPORARILY_OUT_OF_STOCK"));
      const first = stocked?.items?.[0];
      out.set(item, {
        inStock: products.length ? Boolean(stocked) : null,
        price: first?.price?.regular ?? null,
        aisle: stocked?.aisleLocations?.[0]?.description ?? null,
      });
    }
    return out;
  },
};

export const ADAPTERS = [kroger];

export function adapterFor(store) {
  return ADAPTERS.find((a) => a.enabled() && a.canHandle(store)) || null;
}
