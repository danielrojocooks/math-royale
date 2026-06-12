# Math Royale — project instructions

A Clash-Royale-style math game Daniel is building for his 6-year-old son (and 11-year-old, later arenas). Web app, eventually a PWA on a Lenovo Tab M9 via GitHub Pages.

## Read these before any work
1. `docs/CURRICULUM.md` — pedagogical source of truth. Its "Non-negotiable design rules" override everything.
2. `docs/BUILD_PLAN.md` — epics with file scopes and acceptance criteria. Work ONE epic per session; touch only that epic's files.

## Hard rules
- **The child does the arithmetic, never the computer.** Auto-combat is the fun layer; learning happens only at gates where the kid produces the number. Never add a mechanic that computes for the kid and calls it teaching.
- **No ads, no IAP, no dark patterns, no accounts, no network calls at runtime.** Progress = localStorage only.
- **No dependencies, no build step.** Plain ES modules. three.js (CDN importmap) is the only allowed external, and only in the 3D epic (E10).
- Failure never blocks play: wrong answers get scaffolds and retries, not fail states.

## Architecture (after E0)
- `index.html` → `src/main.js` (loop/glue)
- `src/battle.js` — ALL game state (`S`) + rules. No DOM, no canvas, no imports from render.
- `src/render2d.js` — all drawing; owns screen transform (`toWorld`) and panel layout (`cardRect`). Reads `S`, never mutates it.
- `src/input.js` — pointer → battle actions (`trySelectCard`, `tryDeploy`). No game rules.
- `data/units.js` — board constants + rosters. Pure data.
- `prototype.html`, `catapult-puzzle.html` — frozen single-file references; do not edit.
- `3d-demo.html` — three.js proof of concept (KayKit chars + animations); local-only (its assets are gitignored).

## Run / verify
From repo root: `python -m http.server 8765` then open `http://localhost:8765/index.html`.
Manual test minimum: deploy a troop in each lane, watch a fight resolve, lose/win a tower, restart from the banner.

## Assets
- `assets/fantasy_t/clean/` — 2D unit sprites (in repo).
- `assets/kaykit/`, `assets/kenney/`, others — raw art packs, gitignored, exist only on Daniel's machine. Curation into `assets/game/` happens in E10.
