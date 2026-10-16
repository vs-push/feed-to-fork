// My kitchen: things you always have, sources you trust, and voice-coach settings.
import { state, save } from "../lib/state.js";
import { esc, icon, $, toast, fileToDataUrl } from "../lib/ui.js";
import { openMeasure } from "../lib/measure.js";
import { canListen, canSpeak, speak } from "../lib/voice.js";

export function render(root) {
  const s = state.settings;
  root.innerHTML = `
    <div class="brand">${icon("pot")} My kitchen</div>

    <button class="btn btn-primary" id="measure">${icon("cup")} <span style="flex:1;margin-left:4px">Measure a cup</span>${icon("camera")}</button>
    <input id="measure-file" type="file" accept="image/*" capture="environment" hidden />
    <p class="small muted" style="margin-top:8px">No measuring jug? Photograph a cup or glass and get an estimate of how many ml it holds, plus where to fill it for the amount you need.</p>

    <p class="section-title">Always in my kitchen</p>
    <p class="small muted">These start as “Have” on every grocery list.</p>
    <textarea id="pantry" class="box">${esc(state.pantry.join(", "))}</textarea>

    <p class="section-title">Sources I trust</p>
    <p class="small muted">Given to Claude when it checks a post, and shown as links so you can check the dish yourself.</p>
    <textarea id="sources" class="box" style="min-height:80px">${esc(state.trustedSources.join(", "))}</textarea>

    <p class="section-title">Live coach</p>
    <div class="card bordered">
      <label class="row"><span>Wake word</span><input id="wake" value="${esc(s.wakeWord)}" style="width:120px;border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg)"/></label>
      <label class="row" style="margin-top:12px"><span>Look at the pan every</span><select id="every" style="border:1px solid var(--line);border-radius:10px;padding:8px;background:var(--bg)">${[6, 10, 15, 30].map((n) => `<option value="${n}" ${n === s.coachEverySeconds ? "selected" : ""}>${n} s</option>`).join("")}</select></label>
      <label class="row" style="margin-top:12px"><span>Voice speed</span><input id="rate" type="range" min="0.7" max="1.3" step="0.1" value="${s.voiceRate}"/></label>
      <p class="small muted" style="margin-top:14px">Voice in: ${canListen ? "available" : "not supported in this browser (Chrome on Android and desktop work best)"} · Voice out: ${canSpeak ? "available" : "not supported"}</p>
      <button class="btn btn-soft compact" id="test">Test the voice</button>
    </div>

    <button class="btn btn-primary" id="save" style="margin-top:22px">Save ${icon("check")}</button>`;

  $("#measure", root).onclick = () => $("#measure-file", root).click();
  $("#measure-file", root).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) openMeasure({ image: await fileToDataUrl(file, 1024, 0.8), onRetake: () => $("#measure-file", root).click() });
  };

  const list = (v) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  $("#test", root).onclick = () => speak(`Hi. Say ${$("#wake", root).value || "chef"}, then your question, and I'll answer while you cook.`, { rate: Number($("#rate", root).value) });
  $("#save", root).onclick = () => {
    state.pantry = list($("#pantry", root).value);
    state.trustedSources = list($("#sources", root).value);
    state.settings = { wakeWord: ($("#wake", root).value || "chef").toLowerCase().trim(), coachEverySeconds: Number($("#every", root).value), voiceRate: Number($("#rate", root).value) };
    save();
    toast("Saved.");
  };
}
