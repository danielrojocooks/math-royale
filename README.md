# Math Royale

**A Clash Royale–style game where the troops are numbers and combat is arithmetic.** A tower-defense battler that secretly teaches K–3 math facts — no ads, no in-app purchases, no accounts, no dark patterns. Built as a dad project, for a 6-year-old who loves Clash Royale and a parent who doesn't love what Clash Royale does to a 6-year-old.

### ▶ Play it: **https://danielrojocooks.github.io/math-royale/**
*(Works in any modern browser; designed for tablet/touch, plays on desktop too.)*

![Math Royale gameplay](docs/screenshot.png)

---

## The idea

Most "educational games" bolt a math quiz onto a game loop, and kids learn to speed-tap past the math to get back to the fun. Math Royale's bet is the opposite: **make the math the mechanic.**

- **Troops are number compositions.** Your "Archers" card is `3 = 1 + 1 + 1` (three units of 1); "Knights" is `4 = 2 + 2`. Deploying *is* building a number, and watching three 1-archers whittle an enemy 4 down to 0 is subtraction as physical objects.
- **A unit's size is its value.** A 7 towers over a 2, and a unit *shrinks* as it loses a fight, so "bigger means more" is trained every second without a word of explanation.
- **Combat resolves by arithmetic.** When numbers meet they duel, then subtract; equal numbers annihilate.
- **You unlock new arenas by mastering facts, not by paying.** A boss only appears once you're fluent in that arena's number facts.

## The part that's actually hard: a real mastery model

Behind the cartoon is a small, pure, **unit-tested mastery engine** (`src/mastery.js`) implementing the things learning science actually says work:

- **Fluency tracking** per individual fact (last-3-correct *and* fast), with a **fast-pass** so a kid never grinds facts he already owns.
- **Adaptive scaffolding** — facts start with counting dots; the input *graduates* from tap-to-count to instant recall as a fact is mastered, and demotes itself on misses.
- **Spaced repetition** — ~20% of prompts pull from earlier arenas, weighted toward the least-recently-seen fact, with a 14-day decay.

The arena ladder maps to actual Common Core progressions (number bonds → make-ten → teen numbers as ten-plus-ones → doubles), documented in [`docs/CURRICULUM.md`](docs/CURRICULUM.md).

## What playtesting changed

The first build rewarded a correct answer with abstract resource ("power"). The 6-year-old tester ignored the math entirely and just played the battle — which is the exact failure mode this project exists to avoid. The fix was a product decision, not a code one: **solving a problem now fires a visible on-field attack** (a cannon mounted on your castle, or a dragon that swoops in and breathes fire), so the math is the most powerful and most fun thing you can do, not a tax on the fun.

## Tech

- **Vanilla JavaScript, ES modules, zero build step, zero npm dependencies.** No toolchain — serve the folder and it runs.
- **three.js** for the 3D battlefield, vendored locally (no CDN); **localStorage** for all save data. No backend, no network calls at runtime, nothing leaves the device.
- **Installable, fully-offline PWA.** A service worker precaches the engine and every asset, so after the first load it runs with the network completely off — "Add to Home Screen" on a tablet and it behaves like a native app.
- **CC0 art** from [KayKit](https://kaylousberg.itch.io/) and [Kenney](https://kenney.nl) — skeletally-animated characters, weapons socketed into the rig's hands, modular environments themed per arena.
- ~4,000 lines across a deliberately layered architecture.

### Architecture

The game logic never touches the renderer or the DOM, which is why it survived a full **2D-canvas → 3D-three.js rewrite by swapping a single module:**

```
data/         arenas, roster, units        (pure config)
src/battle.js the simulation + rules        (no DOM, no canvas — the "model")
src/render3d.js three.js view of S          (read-only; swappable — render2d.js was the old view)
src/gates.js  the math card / learning gates
src/mastery.js fluency engine               (pure functions, unit-tested)
src/*-ui.js   profiles, deck builder, HUD   (DOM overlays)
```

`tests/smoke.node.mjs` covers the mastery engine (run: `node tests/smoke.node.mjs`); `tests/mastery.test.html` is the in-browser suite.

## Run locally

```
python -m http.server 8765
```
then open `http://localhost:8765/index.html`. (A static server is needed so ES modules load.) [`previews.html`](previews.html) renders every arena's look from its theme data.

## What's next / known limits

- A reading track (Dolch sight-word spell cards) is designed but not built.
- Multi-lane arenas and arenas 7–10 (subtraction, multiplication, division gates) are scoped but not implemented.

## Credits & license

- **Code:** MIT — see [`LICENSE`](LICENSE).
- **Art:** see [`CREDITS.md`](CREDITS.md). KayKit & Kenney are CC0; the dragon model is CC BY-SA 4.0 (MattBas) and retains that license.
- Built by directing AI coding agents (Claude) over about a week of evenings, with design, playtesting, and direction by a human parent.
