import { api } from "../lib/api.js";
import { state, save, currencyFor } from "../lib/state.js";
import { esc, icon, stepper, topbar, recipeLine, $, $$, toast, busy } from "../lib/ui.js";
import { scaleRecipe } from "../lib/scale.js";

const MAX_SERVINGS = 20;

export function render(root) {
  if (!state.recipe) return (location.hash = "#/");
  if (!state.location) state.location = guessFromTimeZone();
  state.prefs.servings ||= state.recipe.servings;
  const r = state.adapt?.recipe || scaleRecipe(state.recipe, state.prefs.servings);
  const [, symbol] = currencyFor(state.location?.countryCode);

  root.innerHTML = `
    ${topbar("Your local recipe", "#/verify")}
    ${stepper(1)}
    <div id="recipe-line">${recipeLine(r)}</div>

    

    <p class="eyebrow" style="margin-top:20px">Cooking in</p>
    <div class="field">${icon("pin")}<input id="loc" value="${esc(state.location?.label || "")}" placeholder="City, country" autocomplete="off" />${icon("pencil")}</div>
    <ul class="suggestions" id="sugg" hidden></ul>
    <button class="btn btn-primary" id="geo" style="margin-top:14px">Use my location ${icon("arrow")}</button>
    <p class="small muted" id="loc-note">${state.location?.lat ? "Location set. Nearby stores will be searched around it." : "Location is off until you allow access. Use your current location or edit the city above."} English recipes.</p>

    <p class="section-title">Spice</p>
    ${segment("spice", [["mild", "Mild"], ["medium", "Medium"], ["hot", "Hot"]])}
    <p class="section-title">Sweetness</p>
    ${segment("sweetness", [["none", "None added"], ["little", "A little"], ["sweeter", "Sweeter"]])}

    <div class="card bordered row" style="margin-top:6px">
      <div><b>Cooking for</b><div class="small muted" id="serves-note">${servesNote()}</div></div>
      <div class="stepper-num"><button class="iconbtn" id="fewer" aria-label="Fewer people">${icon("minus")}</button><span id="serves" aria-live="polite">${state.prefs.servings}</span><button class="iconbtn" id="more" aria-label="More people">${icon("plus")}</button></div>
    </div>
    
    <div class="card bordered row">
      <div><b>Budget for <span id="budget-for">${state.prefs.servings}</span> ${state.prefs.servings === 1 ? "serving" : "servings"}</b><div class="small muted">Illustrative grocery estimate</div></div>
      <div class="stepper-num"><button class="iconbtn" id="minus" aria-label="Less">${icon("minus")}</button><span id="budget">${symbol}${state.prefs.budget}</span><button class="iconbtn" id="plus" aria-label="More">${icon("plus")}</button></div>
    </div>

    <div id="result">${state.adapt ? result(state.adapt) : ""}</div>

    <div class="sticky-cta">
      <button class="btn btn-primary" id="go">${state.adapt ? "See what's in your fridge" : "Make it local"} ${icon("arrow")}</button>
    </div>`;

  // Preferences
  $$(".segment", root).forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.prefs[seg.dataset.key] = b.dataset.value;
      $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      invalidate();
    })
  );
  const setBudget = (d) => {
    state.prefs.budget = Math.max(1, state.prefs.budget + d);
    $("#budget", root).textContent = `${symbol}${state.prefs.budget}`;
    invalidate();
  };
  $("#minus", root).onclick = () => setBudget(-1);

  // Servings: scale the ingredient list (and the budget) to the number of people.
  const setServings = (d) => {
    const before = state.prefs.servings;
    const next = Math.min(MAX_SERVINGS, Math.max(1, before + d));
    if (next === before) return;
    state.prefs.servings = next;
    state.prefs.budget = Math.max(1, Math.round((state.prefs.budget * next) / before));
    $("#serves", root).textContent = next;
    $("#serves-note", root).textContent = servesNote();
    $("#budget-for", root).parentElement.innerHTML = `Budget for <span id="budget-for">${next}</span> ${next === 1 ? "serving" : "servings"}`;
    $("#budget", root).textContent = `${symbol}${state.prefs.budget}`;
    $("#recipe-line", root).innerHTML = recipeLine(scaleRecipe(state.recipe, next));
    $("#fewer", root).disabled = next <= 1;
    $("#more", root).disabled = next >= MAX_SERVINGS;
    invalidate();
  };
  $("#fewer", root).onclick = () => setServings(-1);
  $("#more", root).onclick = () => setServings(1);
  $("#fewer", root).disabled = state.prefs.servings <= 1;
  $("#plus", root).onclick = () => setBudget(1);

  // Location: device GPS, or type a city
  $("#geo", root).onclick = async (e) => {
    const btn = e.currentTarget;
    if (!navigator.geolocation) return toast("This browser can't share location. Type your city instead.");
    busy(btn, true, "Finding you…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          state.location = await api.reverse(lat, lon);
        } catch {
          state.location = { label: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, countryCode: state.location?.countryCode || "", lat, lon };
        }
        invalidate();
        render(root);
      },
      (err) => {
        busy(btn, false);
        toast(err.code === 1 ? "Location permission was denied. Type your city instead." : "Couldn't get your location.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  let t;
  const input = $("#loc", root);
  const sugg = $("#sugg", root);
  input.oninput = () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (q.length < 3) return (sugg.hidden = true);
    t = setTimeout(async () => {
      try {
        const places = await api.search(q);
        sugg.innerHTML = places.map((p, i) => `<li><button data-i="${i}">${esc(p.label)}</button></li>`).join("");
        sugg.hidden = !places.length;
        sugg.onclick = (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          state.location = places[Number(b.dataset.i)];
          invalidate();
          render(root);
        };
      } catch {
        sugg.hidden = true;
      }
    }, 350);
  };

  $("#go", root).onclick = async (e) => {
    if (state.adapt) return (location.hash = "#/gather");
    const btn = e.currentTarget;
    busy(btn, true, "Adapting your recipe…");
    try {
      const [currency] = currencyFor(state.location?.countryCode);
      state.adapt = await api.adapt({
        recipe: scaleRecipe(state.recipe, state.prefs.servings),
        servings: state.prefs.servings,
        location: { ...state.location, currency },
        spice: state.prefs.spice,
        sweetness: state.prefs.sweetness,
        budget: state.prefs.budget,
      });
      state.groceries = {};
      save();
      render(root);
      $("#result", root).scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      toast(err.message);
      busy(btn, false);
    }
  };

  function invalidate() {
    if (state.adapt) {
      state.adapt = null;
      $("#result", root).innerHTML = "";
      $("#go", root).innerHTML = `Make it local ${icon("arrow")}`;
    }
    save();
  }
}

function servesNote() {
  const n = state.prefs.servings, base = state.recipe.servings;
  return n === base ? `People · recipe is written for ${base}` : `People · quantities scaled from ${base} to ${n}`;
}

function segment(key, options) {
  return `<div class="segment" data-key="${key}" role="group">${options
    .map(([value, label]) => `<button type="button" data-value="${value}" aria-pressed="${state.prefs[key] === value}">${label}</button>`)
    .join("")}</div>`;
}

function result(a) {
  const cost = a.estimatedCost;
  return `
    <section class="card sage">
      <p class="eyebrow" style="color:var(--green-ink)">Made for ${esc(state.location?.label || "you")}</p>
      ${a.swaps.length ? `<ul class="bullets">${a.swaps.map((s) => `<li><b>${esc(s.from)} → ${esc(s.to)}</b><br/><span class="muted">${esc(s.reason)}</span></li>`).join("")}</ul>` : "<p>No swaps needed: everything is easy to find here.</p>"}
      ${cost ? `<p class="small muted">About ${esc(cost.currency)} ${Number(cost.amount).toFixed(2)} · ${esc(cost.note)}</p>` : ""}
      ${(a.localTips || []).length ? `<p class="small">${a.localTips.map(esc).join("<br/>")}</p>` : ""}
    </section>`;
}

// Pre-fill a sensible default from the device time zone until the user shares location.
function guessFromTimeZone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const known = {
    "Europe/London": ["London, United Kingdom", "GB", 51.5072, -0.1276],
    "Europe/Riga": ["Riga, Latvia", "LV", 56.9496, 24.1052],
    "Europe/Dublin": ["Dublin, Ireland", "IE", 53.3498, -6.2603],
    "Europe/Berlin": ["Berlin, Germany", "DE", 52.52, 13.405],
    "Europe/Paris": ["Paris, France", "FR", 48.8566, 2.3522],
    "America/New_York": ["New York, United States", "US", 40.7128, -74.006],
    "America/Los_Angeles": ["Los Angeles, United States", "US", 34.0522, -118.2437],
    "America/Chicago": ["Chicago, United States", "US", 41.8781, -87.6298],
  };
  const [label, countryCode, lat, lon] = known[tz] || known["Europe/London"];
  return { label, countryCode, lat, lon, guessed: true };
}
