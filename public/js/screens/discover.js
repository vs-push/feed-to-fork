import { api } from "../lib/api.js";
import { state, startJourney } from "../lib/state.js";
import { icon, $, toast, busy, fileToDataUrl, demoBanner } from "../lib/ui.js";

export function render(root, ctx) {
  root.innerHTML = `
    <div class="brand">${icon("sprout")} Feed to Fork</div>
    ${demoBanner(ctx.demo)}
    <p class="eyebrow">From your feed. To your table.</p>
    <h1>Less scrolling.<br/>More cooking.</h1>
    <p class="lede">Make sense of a food post, make it local, then cook with a little guidance.</p>

    <button class="btn btn-primary" id="open-url">Share video URL ${icon("pencil")}</button>
    <label class="btn btn-soft" for="shot">Upload a photo ${icon("image")}</label>
    <input id="shot" type="file" accept="image/*" hidden />

    <form id="post-form" class="card" hidden>
      <p class="eyebrow">Tell us about the post</p>
      <div class="field"><input id="url" type="url" placeholder="https://www.tiktok.com/@…" inputmode="url" /></div>
      <p class="small muted">We can't open the video itself, so describe what happens (or add a screenshot): ingredients, steps, anything that looks too good to be true.</p>
      <textarea id="desc" class="box" placeholder="A block of feta goes into a dish of cherry tomatoes and oil…"></textarea>
      <img id="preview" class="preview-img" hidden alt="Screenshot preview" />
      <button class="btn btn-primary" id="check" type="submit" style="margin-top:14px">Check this post ${icon("arrow")}</button>
    </form>

    <a class="card dish" href="#/verify?sample=1" id="sample">
      <img src="img/feta-pasta.svg" alt="Baked feta pasta in an oval dish with burst cherry tomatoes" />
      <div class="body">
        <h2>Baked feta pasta</h2>
        <div class="meta">35 min · 2 servings · Vegetarian</div>
        <div class="linkrow">Try the sample journey ${icon("out")}</div>
      </div>
    </a>`;

  let image = null;
  const form = $("#post-form", root);
  $("#open-url", root).onclick = () => {
    form.hidden = false;
    $("#url", root).focus();
  };
  $("#shot", root).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    image = await fileToDataUrl(file);
    form.hidden = false;
    const img = $("#preview", root);
    img.src = image;
    img.hidden = false;
  };

  $("#sample", root).onclick = async (e) => {
    e.preventDefault();
    const sample = await api.sample();
    startJourney(sample.verify.recipe, { ...sample.verify, sample: true });
    location.hash = "#/verify";
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const url = $("#url", root).value.trim();
    const description = [url && `Link: ${url}`, $("#desc", root).value.trim()].filter(Boolean).join("\n");
    if (!description && !image) return toast("Add a description or a screenshot first.");
    const btn = $("#check", root);
    busy(btn, true, "Checking the post…");
    try {
      const result = await api.verify({ description, image, trustedSources: state.trustedSources });
      startJourney(result.recipe, { ...result, hadImage: Boolean(image) });
      location.hash = "#/verify";
    } catch (err) {
      toast(err.message);
    } finally {
      busy(btn, false);
    }
  };
}
