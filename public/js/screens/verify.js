import { state, saveRecipe } from "../lib/state.js";
import { esc, icon, stepper, topbar, recipeLine, $ } from "../lib/ui.js";

const VERDICTS = {
  real_recipe: "Real recipe",
  staged_hack: "Staged hack",
  ai_generated: "AI-generated",
  cant_tell: "Can't tell",
};

export function render(root) {
  const v = state.verify;
  if (!v || !state.recipe) {
    location.hash = "#/";
    return;
  }
  const r = state.recipe;
  root.innerHTML = `
    ${topbar("Post assessment")}
    ${stepper(0)}
    ${recipeLine(r)}
    <h1>${esc(v.headline || r.title)}</h1>

    <section class="card sage verdict-${esc(v.verdict)}">
      <div class="verdict-top"><p class="eyebrow" style="color:var(--green-ink)">${v.sample || v._demo ? "Sample assessment" : "Assessment"}</p>${icon("badge")}</div>
      <div class="verdict-row">
        <h2>${VERDICTS[v.verdict] || "Can't tell"}</h2>
        <div class="score"><b>${Number(v.confidence) || 0}%</b><span>${v.sample || v._demo ? "sample confidence" : "confidence"}</span></div>
      </div>
      <p>${esc(v.reasoning)}</p>
      ${v.sample || v._demo ? `<p class="small muted">Authored example, not a verified post. This score illustrates the assessment design.</p>` : `<p class="small muted">Judged from your description${v.hadImage ? " and screenshot" : ""}. Check a trusted source before you trust a viral hack.</p>`}
    </section>

    <h2 style="margin-top:30px">What the post skips</h2>
    <ul class="bullets">${(v.skips || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>

    ${(v.sourcesToCheck || []).length ? `
    <section class="card">
      <h2 style="margin-bottom:8px">For a little more context</h2>
      ${v.sourcesToCheck.map((s) => `
        <a class="source" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">
          <div><b>${esc(s.name)}</b><div class="small muted">${esc(s.why)}</div><div class="small">${esc(host(s.url))}</div></div>${icon("out")}
        </a>`).join("")}
    </section>` : ""}

    <div class="sticky-cta">
      <button class="btn btn-primary" id="next">${v.verdict === "real_recipe" ? "Make it work here" : "Cook a version that works"} ${icon("arrow")}</button>
    </div>`;

  $("#next", root).onclick = () => {
    saveRecipe(r);
    location.hash = "#/adapt";
  };
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "#";
  } catch {
    return "#";
  }
}
function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
