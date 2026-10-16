// Tiny helpers for rendering HTML strings safely.
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const icon = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, ms = 2600) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

const STEPS = ["Verify", "Adapt", "Gather", "Cook"];
export function stepper(active) {
  return `<div class="stepper" aria-label="Progress">${STEPS.map((s, i) => `<div class="${i < active ? "done" : i === active ? "on" : ""}" ${i === active ? 'aria-current="step"' : ""}>${s}</div>`).join("")}</div>`;
}

export function topbar(title, back = "#/") {
  return `<div class="topbar"><a class="iconbtn" href="${back}" aria-label="Back">${icon("back")}</a><h1>${esc(title)}</h1></div>`;
}

export function recipeLine(recipe) {
  return `<div class="recipe-line">${icon("fork")} ${esc(recipe.title)} · ${recipe.servings} servings</div>`;
}

export function demoBanner(isDemo) {
  return isDemo ? `<div class="banner">Demo mode: answers are hand-written samples. Add an API key on the server for real Claude answers.</div>` : "";
}

/** Read an image file, shrink it (long side <= maxSide) and return a JPEG data URL. */
export function fileToDataUrl(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function busy(button, on, label) {
  if (on) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>${esc(label || "Working…")}</span><span class="spinner"></span>`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}
