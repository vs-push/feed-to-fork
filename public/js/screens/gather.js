import { api } from "../lib/api.js";
import { state, save } from "../lib/state.js";
import { esc, icon, stepper, topbar, recipeLine, $, toast, busy, fileToDataUrl } from "../lib/ui.js";

let tab = "list";
let storeData = null;
let storeKey = "";

const recipe = () => state.adapt?.recipe || state.recipe;
const statusOf = (name) => state.groceries[name] || (state.pantry.some((p) => sameItem(p, name)) ? "have" : "buy");
const sameItem = (a, b) => {
  const n = (s) => s.toLowerCase().replace(/^own-brand\s+/, "").replace(/s$/, "").trim();
  return n(a).includes(n(b)) || n(b).includes(n(a));
};
// What actually goes on the shopping list: missing items, with accepted swaps applied.
const shoppingList = () =>
  recipe().ingredients.filter((i) => statusOf(i.name) === "buy").map((i) => ({ ...i, original: i.name, name: state.swaps[i.name]?.name || i.name }));

export function render(root) {
  if (!state.recipe) return (location.hash = "#/");
  const r = recipe();
  const have = r.ingredients.filter((i) => statusOf(i.name) === "have").length;
  const swapped = Object.keys(state.swaps);

  root.innerHTML = `
    ${topbar("Your kitchen inventory", "#/adapt")}
    ${stepper(2)}
    ${recipeLine(r)}

    <div class="tabs" role="tablist">
      <button role="tab" data-tab="photo" aria-selected="${tab === "photo"}">${icon("camera")} Fridge photo</button>
      <button role="tab" data-tab="list" aria-selected="${tab === "list"}">${icon("list")} My list</button>
    </div>
    <div id="scan" style="margin-top:14px">
      ${tab === "photo"
        ? `<label class="btn btn-soft" for="fridge-photo">Photograph your fridge or shelf ${icon("camera")}</label>
           <input id="fridge-photo" type="file" accept="image/*" capture="environment" hidden />`
        : `<textarea id="typed" class="box" placeholder="What do you have? e.g. tomatoes, pasta, garlic, half a lemon"></textarea>
           <button class="btn btn-soft" id="check-list" style="margin-top:10px">Check against the recipe ${icon("arrow")}</button>`}
    </div>

    <div class="row" style="margin-top:26px"><h3 style="font-family:var(--sans);font-weight:600;font-size:18px">Grocery list</h3><span class="pill">${have} of ${r.ingredients.length} have</span></div>
    <ul class="groc" id="groc">
      ${r.ingredients.map((i) => {
        const s = statusOf(i.name);
        return `<li data-name="${esc(i.name)}">
          <span class="ic-${s}">${icon(s === "have" ? "check" : "plus")}</span>
          <span>${esc(state.swaps[i.name]?.name || i.name)}${state.swaps[i.name] ? ` <span class="small muted">(for ${esc(i.name)})</span>` : ""}</span>
          <span class="qty">${esc(i.quantity)}</span>
          <span class="hb"><button class="have" aria-pressed="${s === "have"}">Have</button><button class="buy" aria-pressed="${s === "buy"}">Buy</button></span>
        </li>`;
      }).join("")}
    </ul>
    <button class="btn btn-ghost compact" id="copy" style="margin-top:14px">Copy shopping list</button>

    <div class="row" style="margin-top:30px"><p class="section-title" style="margin:0">Substitutions for unavailable ingredients</p>${swapped.length ? `<span class="pill">${swapped.length} swap${swapped.length > 1 ? "s" : ""}</span>` : ""}</div>
    <p class="small muted">Can't find something? Pick a swap and it replaces the missing item in your shopping list.</p>
    <div id="subs">${shoppingList().length ? shoppingList().map(subRow).join("") : `<p class="muted">Nothing to buy. Nice.</p>`}</div>

    <p class="section-title" style="margin-top:30px">Nearby stores with missing ingredients</p>
    <div id="stores">${shoppingList().length ? `<p class="muted small">${state.location?.lat ? "Looking for stores near " + esc(state.location.label) + "…" : "Set where you're cooking on the previous step to see stores."}</p>` : ""}</div>

    <div class="sticky-cta"><a class="btn btn-primary" href="#/cook">Start cooking ${icon("chef")}</a></div>`;

  bind(root);
  loadStores(root);
}

function subRow(item) {
  const swap = state.swaps[item.original];
  if (swap) {
    return `<div class="card bordered">
      <div class="store-head"><span class="store-ic">${icon("swap")}</span><div style="flex:1"><b>${esc(swap.name)}</b><div class="small muted">Instead of ${esc(item.original)} · ${esc(swap.ratio)}</div></div><button class="mini ghost" data-undo="${esc(item.original)}">Undo</button></div>
      <div class="note">${icon("info")}<span>${esc(swap.note)}</span></div>
    </div>`;
  }
  return `<div class="card bordered row"><div><b>${esc(item.original)}</b><div class="small muted">${esc(item.quantity)}</div></div><button class="mini" data-sub="${esc(item.original)}">Find a swap</button></div>`;
}

function bind(root) {
  root.querySelector(".tabs").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) (tab = b.dataset.tab), render(root);
  };

  $("#groc", root).onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const name = b.closest("li").dataset.name;
    state.groceries[name] = b.classList.contains("have") ? "have" : "buy";
    save();
    render(root);
  };

  const photo = $("#fridge-photo", root);
  if (photo) {
    photo.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const label = root.querySelector('label[for="fridge-photo"]');
      label.textContent = "Looking at your fridge…";
      try {
        await scan({ image: await fileToDataUrl(file) });
        render(root);
      } catch (err) {
        toast(err.message);
        render(root);
      }
    };
  }
  const check = $("#check-list", root);
  if (check) {
    check.onclick = async () => {
      const typed = $("#typed", root).value.trim();
      if (!typed) return toast("Type a few things you have first.");
      busy(check, true, "Checking…");
      try {
        await scan({ text: typed });
        render(root);
      } catch (err) {
        toast(err.message);
        busy(check, false);
      }
    };
  }

  $("#copy", root).onclick = async () => {
    const lines = shoppingList().map((i) => `• ${i.name} (${i.quantity})`);
    const text = lines.length ? `${recipe().title} shopping list\n${lines.join("\n")}` : "Nothing to buy.";
    try {
      await navigator.clipboard.writeText(text);
      toast("Shopping list copied.");
    } catch {
      toast(text, 6000);
    }
  };

  $("#subs", root).onclick = async (e) => {
    const undo = e.target.closest("[data-undo]");
    if (undo) {
      delete state.swaps[undo.dataset.undo];
      save();
      return render(root);
    }
    const b = e.target.closest("[data-sub]");
    if (!b) return;
    const ingredient = b.dataset.sub;
    b.textContent = "…";
    try {
      const { options } = await api.substitute({ ingredient, recipeTitle: recipe().title, location: state.location });
      const card = b.closest(".card");
      card.outerHTML = `<div class="card bordered"><b>Swaps for ${esc(ingredient)}</b>${options
        .map((o, i) => `<div class="avail"><span>${esc(o.name)}<br/><span class="small muted">${esc(o.note)}</span></span><span class="qty small">${esc(o.ratio)}</span><button class="mini" data-pick="${i}" data-for="${esc(ingredient)}">Use</button></div>`)
        .join("")}</div>`;
      $("#subs", root).querySelectorAll("[data-pick]").forEach((btn) => {
        btn.onclick = () => {
          state.swaps[btn.dataset.for] = options[Number(btn.dataset.pick)];
          save();
          render(root);
        };
      });
    } catch (err) {
      toast(err.message);
      b.textContent = "Find a swap";
    }
  };
}

async function scan(payload) {
  const result = await api.fridge({ recipe: recipe(), keepsBasics: true, ...payload });
  for (const item of result.items) {
    const match = recipe().ingredients.find((i) => sameItem(i.name, item.ingredient));
    if (match) state.groceries[match.name] = item.status;
  }
  save();
  toast(`Seen: ${result.seen.slice(0, 6).join(", ") || "nothing recognisable"}`, 4000);
}

async function loadStores(root) {
  const list = shoppingList();
  const box = $("#stores", root);
  if (!list.length || !state.location?.lat) return;
  const items = list.map((i) => i.name);
  const key = `${state.location.lat},${state.location.lon}|${items.join(",")}`;
  try {
    if (key !== storeKey || !storeData) {
      storeData = await api.stores({ lat: state.location.lat, lon: state.location.lon, items });
      storeKey = key;
    }
  } catch (err) {
    box.innerHTML = `<p class="muted small">${esc(err.message)}</p>`;
    return;
  }
  const d = storeData;
  if (!d.stores.length) {
    box.innerHTML = `<p class="muted small">No grocery stores found within 2.5 km.</p>`;
    return;
  }
  box.innerHTML = `
    ${d.warning ? `<p class="small muted">${esc(d.warning)}</p>` : ""}
    ${d.hardToFind.length ? `<div class="note">${icon("info")}<span>${d.hardToFind.map(esc).join(", ")} may be hard to find nearby. Consider a swap above.</span></div>` : ""}
    ${d.stores.slice(0, 5).map(storeCard).join("")}
    <p class="small muted"></p>`;

  box.onclick = async (e) => {
    const b = e.target.closest("[data-report]");
    if (!b) return;
    try {
      await api.report({ storeId: b.dataset.store, item: b.dataset.item, inStock: b.dataset.report === "yes" });
      storeData = null; // refetch with the new evidence
      toast("Thanks, that helps the next shopper.");
      loadStores(root);
    } catch (err) {
      toast(err.message);
    }
  };
}

function storeCard(s) {
  const mapUrl = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}`;
  const overall = s.availability.every((a) => a.basis === "prior") ? "Stock unchecked" : s.liveSource ? "Live stock" : "Shopper reports";
  return `<div class="card bordered">
    <div class="store-head">
      <span class="store-ic">${icon("store")}</span>
      <div style="flex:1"><b>${esc(s.name)}</b><div class="small muted">${s.km} km · ${s.walkMinutes} min walk${s.openingHours ? ` · ${esc(s.openingHours)}` : ""}</div></div>
      <span class="pill">${overall}</span>
    </div>
    ${s.availability.map((a) => `
      <div class="avail">
        <span>${esc(a.item)}${a.price ? ` <span class="small muted">$${Number(a.price).toFixed(2)}</span>` : ""}${a.aisle ? `<br/><span class="small muted">${esc(a.aisle)}</span>` : ""}</span>
        <span class="chance ${esc(a.label)}">${chanceLabel(a)}</span>
        <span><button class="mini ghost" data-report="yes" data-store="${esc(s.id)}" data-item="${esc(a.item)}" title="I found it here" aria-label="Found it here">✓</button> <button class="mini ghost" data-report="no" data-store="${esc(s.id)}" data-item="${esc(a.item)}" title="Not on the shelf" aria-label="Not there">✕</button></span>
      </div>`).join("")}
    <a class="small" style="color:var(--accent);font-weight:600" href="${mapUrl}" target="_blank" rel="noopener">See location ↗</a>
  </div>`;
}

function chanceLabel(a) {
  if (a.basis === "live") return a.label === "in_stock" ? "Live: in stock" : "Live: out";
  const pct = Math.round(a.probability * 100);
  if (a.basis === "reported") return `Reported · ${pct}%`;
  return `${a.label === "likely" ? "Likely" : a.label === "maybe" ? "Maybe" : "Unlikely"} · ${pct}%`;
}

export function leave() {}
