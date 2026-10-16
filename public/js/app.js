import { api } from "./lib/api.js";
import { $, $$ } from "./lib/ui.js";
import * as discover from "./screens/discover.js";
import * as verify from "./screens/verify.js";
import * as adapt from "./screens/adapt.js";
import * as gather from "./screens/gather.js";
import * as cook from "./screens/cook.js";
import * as recipes from "./screens/recipes.js";
import * as kitchen from "./screens/kitchen.js";

const routes = {
  "": { screen: discover, tab: "discover" },
  verify: { screen: verify, flow: true },
  adapt: { screen: adapt, flow: true },
  gather: { screen: gather, flow: true },
  cook: { screen: cook, cooking: true },
  recipes: { screen: recipes, tab: "recipes" },
  kitchen: { screen: kitchen, tab: "kitchen" },
};

const ctx = { demo: false };
let current = null;

async function render() {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  const route = routes[name] || routes[""];
  current?.leave?.(); // stop camera, mic, timers from the screen we're leaving
  current = route.screen;

  const app = $("#app");
  app.classList.toggle("cooking", Boolean(route.cooking));
  app.classList.toggle("flow", Boolean(route.flow));
  $$("#tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === route.tab));

  const root = $("#screen");
  root.innerHTML = "";
  window.scrollTo(0, 0);
  await route.screen.render(root, ctx);
}

api
  .config()
  .then((cfg) => (ctx.demo = cfg.demo))
  .catch(() => {})
  .finally(() => {
    window.addEventListener("hashchange", render);
    render();
  });
