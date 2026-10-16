# Feed to Fork

**From your feed to your table.** Check a viral food post, make it work where you live, find what's missing in nearby shops, then cook hands-free with a coach that watches the pan through your phone camera and talks you through it.

The UI follows the design concepts: Discover → Verify → Adapt → Gather → Cook, plus My recipes and My kitchen.

> The answers to the two open questions (how stock in local stores is tracked, and how this differs from Claude/ChatGPT/Siri/Bixby) are in **[docs/SOLUTIONS.md](docs/SOLUTIONS.md)**.

## What it does

| Step | What happens |
|---|---|
| **Verify** | Paste a link and describe the post, or upload a screenshot. Claude returns a verdict (real recipe, staged hack, AI-generated, can't tell), a confidence score, what the post skips, and links to your trusted sources. |
| **Adapt** | Set where you're cooking (GPS or type a city), spice, sweetness and budget. Claude rewrites the recipe with local swaps and a reason for each. |
| **Gather** | Photograph your fridge or type what you have. Each ingredient is marked Have/Buy. Missing items get swaps, a copyable shopping list, and **nearby stores ranked by the chance of having them** (live stock / shopper reports / estimate). |
| **Measure a cup** | In cook mode (or My kitchen), point the camera at a cup, glass or bowl. Claude outlines it on the photo, estimates how many ml it holds (with a range and a confidence level, plus cups and tablespoons), and draws a **“fill to here” line** for the amount you need. If the current step mentions an amount (“add 200 ml stock”), that amount is pre-filled. |
| **Cook** | Full-screen steps, read aloud, with a timer per step. **Live coaching** keeps the camera running, sends a frame to Claude when the scene changes, and speaks the answer. **Voice:** say “next”, “repeat”, “pause timer”, “how long left”, or “Chef, …” plus any question. You can also type questions. |

## Run it

Requires Node.js 20+.

```bash
cd feed-to-fork
npm install
cp .env.example .env     # add your ANTHROPIC_API_KEY to use real Claude answers
npm start                # http://localhost:3000
npm test                 # unit tests (stock model, reports, voice commands)
```

With no API key the app runs in **demo mode**: every Claude call returns a clearly labelled, hand-written stand-in answer, so the whole flow (including camera, voice and store search) can be tried offline.

### Using it on your phone

The camera and microphone only work on `https://` or `localhost`. To try live coaching on a phone, put the server behind HTTPS, for example with a tunnel (`npx localtunnel --port 3000`, `cloudflared tunnel --url http://localhost:3000`), or deploy it to any Node host. Use Chrome on Android for voice commands.

## How it's built

```
feed-to-fork/
├── server/                     Node + Express API (keeps the Claude key off the phone)
│   ├── index.js                Routes: /api/verify, adapt, fridge, substitute, stores, reports, coach, geo/*
│   ├── claude.js               Claude API wrapper: structured JSON outputs, refusal fallback
│   ├── schemas.js              JSON schemas for every Claude answer
│   ├── prompts.js              System prompts (verify, adapt, fridge, substitute, live coach)
│   ├── mock.js                 Demo-mode stand-in answers
│   ├── substitutions.js        Offline substitution table (Claude is the fallback)
│   ├── env.js                  Tiny .env loader
│   ├── data/sample-recipe.json The hand-written baked feta pasta journey
│   └── inventory/
│       ├── stores.js           Nearby shops from OpenStreetMap (Overpass)
│       ├── retailers.js        Live stock adapters (Kroger included as the template)
│       ├── reports.js          Shopper reports with time decay
│       ├── categories.js       Store-type × ingredient-type estimates
│       └── index.js            Merges the three layers and ranks stores
├── public/                     The web app (no build step, plain ES modules)
│   ├── index.html, styles.css, manifest.webmanifest, img/
│   └── js/
│       ├── app.js              Hash router
│       ├── lib/
│       │   ├── camera.js       Live camera, change detection, screen wake lock
│       │   ├── measure.js      “Measure a cup” sheet: outline, ml estimate, fill-to-here line
│       │   ├── voice.js        Text-to-speech, continuous speech recognition, commands, timer chime
│       │   ├── state.js        Journey state saved in localStorage
│       │   ├── api.js, ui.js
│       └── screens/            discover, verify, adapt, gather, cook, recipes, kitchen
├── test/                       node:test unit tests
└── docs/SOLUTIONS.md           Answers to the two open questions
```

### The live coaching loop

1. `camera.js` opens the rear camera with `getUserMedia` and keeps the screen awake.
2. Every few seconds (setting in My kitchen) it compares a 32×24 thumbnail with the last frame it sent. If the scene changed, or 45 s have passed, it sends a 768 px JPEG to `/api/coach`.
3. The server sends Claude the frame, the current step, what "done" looks like, the timer, and the last few things the coach said (so it doesn't repeat itself).
4. Claude replies with structured JSON: `status` (`on_track`, `fix_now`, `step_done`, `cant_see`, `answer`), one or two sentences to `say`, and minutes left.
5. The phone speaks it. "Looks fine" is spoken at most every 45 s; warnings interrupt straight away. The mic ignores everything while the phone is speaking, so the coach never answers itself.

### How accurate is “Measure a cup”?

A single photo has no built-in sense of scale, so the estimate is only as good as the clues in the picture. Claude trusts, in order: printed volumes or jug markings, then objects of known size in the frame (a hand, a bank card, a 330 ml can), then typical sizes for that kind of container. It always shows a range and a confidence level (low, medium or high) and says what it used for scale. For a better estimate, put your hand or a can next to the cup and shoot from the side at the cup's height. Treat it as a stand-in for a measuring jug for soups, pasta water and sauces, not for baking, where exact amounts matter.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables real Claude answers. Empty = demo mode. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for every call. Live coaching uses low effort to keep replies fast. |
| `PORT` | `3000` | Server port. |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | — | Turns on live stock for Kroger-family stores (US). |
| `OVERPASS_URL` | public Overpass instance | Store search endpoint. |

## Notes and limits

- Requests that hit a safety refusal are retried on a fallback model automatically (`fallbacks: "default"` in `server/claude.js`).
- Store search falls back to three sample stores if OpenStreetMap can't be reached.
- Shopper reports are kept in `server/data/reports.json` (last 30 days). Use a real database in production.
- Everything is in English for now.
