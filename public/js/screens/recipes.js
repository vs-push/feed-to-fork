import { state, save, startJourney } from "../lib/state.js";
import { esc, icon, $ } from "../lib/ui.js";

export function render(root) {
  root.innerHTML = `
    <div class="brand">${icon("bookmark")} My recipes</div>
    ${state.recipe ? `
      <a class="card sage" href="#/${state.cook.stepIndex ? "cook" : "adapt"}" style="display:block;text-decoration:none">
        <p class="eyebrow" style="color:var(--green-ink)">In progress</p>
        <div class="linkrow"><h3>${esc((state.adapt?.recipe || state.recipe).title)}</h3>${icon("arrow")}</div>
        <p class="small muted">${state.cook.stepIndex ? `Cooking · step ${state.cook.stepIndex + 1}` : state.adapt ? "Adapted · gather ingredients next" : "Verified · make it local next"}</p>
      </a>` : ""}
    ${state.saved.length ? state.saved.map((r) => `
      <div class="card row">
        <div><h3>${esc(r.title)}</h3><p class="small muted" style="margin:4px 0 0">${r.recipe.totalMinutes} min · ${r.recipe.servings} servings · saved ${new Date(r.savedAt).toLocaleDateString()}</p></div>
        <div style="display:flex;gap:6px"><button class="mini" data-open="${esc(r.id)}">Cook</button><button class="mini ghost" data-del="${esc(r.id)}" aria-label="Remove">✕</button></div>
      </div>`).join("") : `<p class="empty">Recipes you check are saved here.</p>`}`;

  root.onclick = (e) => {
    const open = e.target.closest("[data-open]");
    const del = e.target.closest("[data-del]");
    if (open) {
      const r = state.saved.find((x) => x.id === open.dataset.open);
      startJourney(r.recipe, { verdict: "real_recipe", confidence: 100, headline: r.title, reasoning: "Saved recipe.", skips: [], sourcesToCheck: [], recipe: r.recipe });
      location.hash = "#/adapt";
    }
    if (del) {
      state.saved = state.saved.filter((x) => x.id !== del.dataset.del);
      save();
      render(root);
    }
  };
}
