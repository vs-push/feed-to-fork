// "How much does this cup hold?" sheet.
// Shows the photo with the container outlined, an estimate in ml (and cups / tablespoons),
// and a "fill to here" line for the amount the cook needs.
import { api } from "./api.js";
import { esc, icon, $, toast } from "./ui.js";

const QUICK = [50, 100, 150, 200, 250, 500];

/** First "<number> ml" in a recipe step, so the sheet can suggest the amount you need. */
export function mlInText(textValue = "") {
  const m = /(\d+(?:[.,]\d+)?)\s*(ml|millilit)/i.exec(textValue);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")));
  const l = /(\d+(?:[.,]\d+)?)\s*(l|litre|liter)s?\b/i.exec(textValue);
  return l ? Math.round(parseFloat(l[1].replace(",", ".")) * 1000) : 0;
}

/** Friendly kitchen units: 1 cup = 240 ml, 1 tbsp = 15 ml. */
export function kitchenUnits(ml) {
  if (!ml) return "";
  const cups = Math.round((ml / 240) * 4) / 4; // nearest quarter cup
  const whole = Math.floor(cups);
  const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[cups - whole] || "";
  const cupText = cups < 0.25 ? "" : `${whole || ""}${frac} cup${cups > 1 ? "s" : ""}`;
  const tbsp = Math.round(ml / 15);
  return [cupText, tbsp <= 32 ? `${tbsp} tbsp` : ""].filter(Boolean).join(" · ");
}

/**
 * Open the sheet for one photo.
 * opts: { image (data URL), targetMl, recipeStep, onSay(text), onRetake() }
 */
export function openMeasure({ image, targetMl = 0, recipeStep = "", onSay, onRetake }) {
  document.querySelector(".sheet-backdrop")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "sheet-backdrop";
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="measure-title">
      <div class="sheet-head">
        <h2 id="measure-title">${icon("cup")} Measure a cup</h2>
        <button class="iconbtn" data-close aria-label="Close">${icon("close")}</button>
      </div>
      <div class="measure-photo scanning">
        <img src="${image}" alt="Your photo" />
        <svg class="measure-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="scanline" aria-hidden="true"></div>
      </div>
      <div class="measure-result" aria-live="polite">
        <p class="muted">Looking at the cup…</p>
      </div>
      <div class="measure-target">
        <label for="target-ml"><b>I need</b></label>
        <div class="target-input"><input id="target-ml" type="number" inputmode="numeric" min="0" step="10" value="${targetMl || ""}" placeholder="e.g. 200" /><span>ml</span></div>
        <div class="quick">${QUICK.map((n) => `<button type="button" data-ml="${n}" aria-pressed="${n === targetMl}">${n}</button>`).join("")}</div>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-soft" data-retake>${icon("camera")} Measure again</button>
        <button class="btn btn-primary" data-close>Done</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const sheet = $(".sheet", wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
    if (e.target.closest("[data-retake]")) {
      close();
      onRetake?.();
    }
    const quick = e.target.closest("[data-ml]");
    if (quick) {
      $("#target-ml", sheet).value = quick.dataset.ml;
      run(Number(quick.dataset.ml));
    }
  });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") close(), document.removeEventListener("keydown", onKey);
  });

  let timer;
  $("#target-ml", sheet).addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => run(Number(e.target.value) || 0), 600);
  });

  let latest = 0;
  async function run(target) {
    const ticket = ++latest;
    sheet.querySelectorAll("[data-ml]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.ml) === target)));
    $(".measure-photo", sheet).classList.add("scanning");
    try {
      const r = await api.measure({ image, targetMl: target, recipeStep });
      if (ticket !== latest || !wrap.isConnected) return; // a newer request replaced this one
      draw(r, target);
      onSay?.(r.say);
    } catch (err) {
      if (ticket !== latest) return;
      $(".measure-result", sheet).innerHTML = `<p class="muted">${esc(err.message)}</p>`;
      toast(err.message);
    } finally {
      if (ticket === latest) $(".measure-photo", sheet).classList.remove("scanning");
    }
  }

  function draw(r, target) {
    const svg = $(".measure-overlay", sheet);
    const out = $(".measure-result", sheet);
    if (!r.found) {
      svg.innerHTML = "";
      out.innerHTML = `<p><b>No cup found.</b> ${esc(r.say)}</p><p class="small muted">${esc(r.tip)}</p>`;
      return;
    }
    const b = clampBox(r.box);
    const x = b.x * 100, y = b.y * 100, w = b.width * 100, h = b.height * 100;
    const fill = Math.max(0, Math.min(100, r.targetFillPercent || 0));
    const lineY = y + h * (1 - fill / 100);
    const contents = r.currentContentsMl > 0 && r.capacityMl ? Math.min(1, r.currentContentsMl / r.capacityMl) : 0;
    svg.innerHTML = `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" class="ov-box" vector-effect="non-scaling-stroke"/>
      ${contents ? `<rect x="${x}" y="${y + h * (1 - contents)}" width="${w}" height="${h * contents}" class="ov-contents"/>` : ""}
      ${target && fill ? `<line x1="${x - 3}" x2="${x + w + 3}" y1="${lineY}" y2="${lineY}" class="ov-line" vector-effect="non-scaling-stroke"/>` : ""}`;
    // HTML labels sit on top of the SVG so text isn't stretched.
    $(".measure-photo", sheet).querySelectorAll(".ov-label").forEach((n) => n.remove());
    const label = (cls, top, left, html) => $(".measure-photo", sheet).insertAdjacentHTML("beforeend", `<span class="ov-label ${cls}" style="top:${top}%;left:${left}%">${html}</span>`);
    label("cap", Math.max(0, y - 1), x + w / 2, `≈ ${r.capacityMl} ml`);
    if (target && fill) label("fill", lineY, Math.min(96, x + w + 2), fill >= 100 ? "Too small" : `Fill to here · ${target} ml`);

    out.innerHTML = `
      <div class="measure-big">
        <div><span class="eyebrow">Holds about</span><b>${r.capacityMl} ml</b><span class="muted">${r.rangeLowMl}–${r.rangeHighMl} ml · ${esc(kitchenUnits(r.capacityMl))}</span></div>
        <span class="pill conf-${esc(r.confidence)}">${esc(r.confidence)} confidence</span>
      </div>
      <p>${esc(r.container)}${r.currentContentsMl ? ` · about <b>${r.currentContentsMl} ml</b> in it now` : ""}</p>
      ${target ? `<p class="fill-say">${fill >= 100 ? `It holds less than ${target} ml. Use a bigger container or fill it twice.` : `For <b>${target} ml</b>, fill it about <b>${fractionWords(fill)}</b> of the way up.`}</p>` : ""}
      <p class="small muted">Judged using: ${esc(r.scaleReference)}. ${esc(r.tip)}</p>`;
  }

  run(Number(targetMl) || 0);
  return { close };
}

function clampBox(b = {}) {
  const c = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const x = c(b.x), y = c(b.y);
  return { x, y, width: Math.min(c(b.width), 1 - x), height: Math.min(c(b.height), 1 - y) };
}

function fractionWords(pct) {
  const nice = [[25, "a quarter"], [33, "a third"], [50, "half"], [67, "two thirds"], [75, "three quarters"], [90, "nearly all"]];
  const near = nice.find(([v]) => Math.abs(v - pct) <= 4);
  return near ? `${near[1]} (${pct}%)` : `${pct}%`;
}
