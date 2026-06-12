# Math Royale

A Clash-Royale-style math game for kids — built by a dad, free forever: no ads, no in-app purchases, no accounts. Troops are numbers; combat is arithmetic; arenas unlock by mastering K–3 math facts (and reading sight words) instead of by spending money.

## Run it
```
python -m http.server 8765
```
then open `http://localhost:8765/index.html`.

## Project map
- `index.html` + `src/` + `data/` — the game (2D canvas, ES modules, zero dependencies)
- `docs/CURRICULUM.md` — the learning design (arena ladder, mastery engine)
- `docs/BUILD_PLAN.md` — implementation epics
- `prototype.html` / `catapult-puzzle.html` — frozen earlier prototypes
- `3d-demo.html` — three.js + KayKit skeletal-animation proof (needs local art packs, not in repo)

Art: [KayKit](https://kaylousberg.itch.io/) and [Kenney](https://kenney.nl) (CC0), plus generated 2D sprites.
