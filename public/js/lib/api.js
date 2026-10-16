// Small fetch helpers for the server API.
async function call(path, options = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  config: () => call("/api/config"),
  sample: () => call("/api/sample"),
  verify: (payload) => call("/api/verify", { method: "POST", body: JSON.stringify(payload) }),
  adapt: (payload) => call("/api/adapt", { method: "POST", body: JSON.stringify(payload) }),
  fridge: (payload) => call("/api/fridge", { method: "POST", body: JSON.stringify(payload) }),
  substitute: (payload) => call("/api/substitute", { method: "POST", body: JSON.stringify(payload) }),
  stores: (payload) => call("/api/stores", { method: "POST", body: JSON.stringify(payload) }),
  report: (payload) => call("/api/reports", { method: "POST", body: JSON.stringify(payload) }),
  coach: (payload) => call("/api/coach", { method: "POST", body: JSON.stringify(payload) }),
  measure: (payload) => call("/api/measure", { method: "POST", body: JSON.stringify(payload) }),
  reverse: (lat, lon) => call(`/api/geo/reverse?lat=${lat}&lon=${lon}`),
  search: (q) => call(`/api/geo/search?q=${encodeURIComponent(q)}`),
};
