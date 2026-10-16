# Feed to Fork: the two open questions

## 1. How does the app know what local stores have in stock?

The short answer: **no single source tells you, in real time, what is on every shelf.** Most grocery chains don't publish live stock. So the app doesn't pretend to know. It combines three layers of evidence, strongest first, and **always shows the user which layer an answer came from**.

| Layer | Where it comes from | What the user sees | Code |
|---|---|---|---|
| **1. Live** | A retailer's own product/stock API, for stores that have one | `Live: in stock` / `Live: out`, sometimes the aisle and price | `server/inventory/retailers.js` |
| **2. Reported** | Other shoppers tapping ✓ (found it) or ✕ (not there) after shopping | `Reported · 30%` | `server/inventory/reports.js` |
| **3. Likely** | An estimate from shop type × ingredient type (a supermarket nearly always has pasta; a corner shop rarely has lemongrass) | `Likely · 92%`, `Maybe · 55%`, `Unlikely · 25%` | `server/inventory/categories.js` |

`server/inventory/index.js` merges them for every nearby store and every missing ingredient:

- **Live data wins** whenever a retailer adapter answers.
- **Shopper reports** are blended with the estimate. The estimate counts as two "pretend" reports, so two or three real reports quickly outweigh it.
- **Reports fade with time** (half-life): 12 hours for fresh herbs, 1 day for fresh food, 3 days for pantry staples. A "sold out" from last week stops mattering on its own.
- Stores are **ranked** by the chance of getting *everything* on the list, with a small penalty for walking distance (10 minutes' walk costs about 10 percentage points).
- If an item is **unlikely everywhere nearby**, the app flags it and offers substitutes straight away (`server/substitutions.js`, with Claude as a fallback). An accepted swap replaces the item on the shopping list and in the cook-mode steps.

**Finding the stores themselves** uses OpenStreetMap (Overpass API): free, worldwide, no key. It returns supermarkets, convenience stores, greengrocers, delis and butchers within 2.5 km, with opening hours when they're mapped. Location comes from the phone's GPS (with permission) or a typed city.

### Growing the live layer (roadmap)

Coverage of layer 1 is a business problem as much as a technical one. In order of effort:

1. **Public retailer APIs.** The Kroger adapter is included as the template (US: Kroger, Ralphs, Fred Meyer and others). Each new retailer is one file with `canHandle(store)` and `check(store, items)`.
2. **Shopping-platform partnerships.** Grocery delivery and click-and-collect platforms already hold per-store catalogues. A partner integration could fill layer 1 for many chains at once and also enable "add to basket".
3. **Retailer data partnerships.** UK chains (Tesco, Sainsbury's, Co-op) don't offer public stock APIs; this needs a commercial agreement. The pitch to them: a ready-made shopping list that sends customers to their store.
4. **More crowd signals.** Receipt scanning (an item bought at store X today means it was in stock), and an optional photo of the shelf. These feed the existing "reported" layer.

The important design choice is that **the app never shows a guess as a fact.** "Stock unchecked" is shown on stores with no live or reported data, just as in the original mockup.

---

## 2. How is this different from Claude, ChatGPT, Siri or Bixby?

General assistants can already answer cooking questions, and some now have live camera modes. Feed to Fork isn't trying to be a smarter general assistant. It is a **cooking workflow with an assistant built into every step**. The differences are the parts a general assistant doesn't have:

| | General assistant (Claude app, ChatGPT, Siri, Bixby) | Feed to Fork |
|---|---|---|
| **Starting point** | A blank chat. You have to explain the recipe. | A food post. The app checks it (real, staged hack, AI-generated, can't tell), says what it leaves out, and turns it into a structured recipe. |
| **Knows where you are in the recipe** | No. Every question starts from scratch unless you restate it. | Yes. The coach always gets the current step, what "done" looks like for it, the step timer and what it already told you. |
| **Who starts the conversation** | You do. It answers when asked. | Both. The coach watches the pan and speaks up on its own ("the tomatoes at the edge are catching"), and announces timers. |
| **Voice control** | Wake word for everything. | Recipe commands without a wake word ("next", "repeat", "pause timer", "how long left"). The wake word ("Chef, …") is needed only for open questions, so kitchen chatter doesn't trigger it. |
| **Local shopping** | Can name generic stores. Doesn't know what's nearby or on the shelf. | Finds stores near you and ranks them by the chance of having your missing items (live data, shopper reports, estimates). |
| **Substitutions** | Gives an answer in chat. | The swap updates your shopping list and rewrites the cook-mode steps. |
| **Local adaptation** | Possible if you ask carefully. | Built in: your city, spice, sweetness and budget rewrite the recipe with local brands, units, oven settings and currency, and each swap comes with a reason. |
| **Memory that matters for cooking** | General chat history. | Your pantry staples (pre-marked "Have"), trusted sources, saved recipes, and where you stopped mid-cook. |
| **Cost and privacy of live video** | Streams continuously, or not at all. | Films continuously but **sends a frame only when the scene changes** (or every 45 s as a heartbeat). Frames are sent for analysis and not stored by the app. |

**In one sentence:** a general assistant answers cooking questions; Feed to Fork takes you from a viral post to a finished dish, and knows the recipe, your kitchen and your local shops at every step.

### Honest limits

- Claude analyses **still frames, not video**. The camera runs live on the phone and the app picks which frames to send (`public/js/lib/camera.js`). With the default settings that means a check roughly every 10 seconds while something changes. That's enough for cooking, which is slow, but it won't catch a two-second event.
- Browser speech recognition is best in **Chrome (Android and desktop)**. Safari support varies; Firefox has none. Where it's missing, the coach still talks and watches, and you type questions.
- A **native app** (iOS/Android) would add: background audio, on-device wake word, a lower-latency streaming connection and push notifications for timers. The server API stays the same; only `public/js/lib/voice.js` and `camera.js` would be replaced.
