# Math Royale — project instructions

A Clash-Royale-style math game Daniel built for his 6-year-old son (11-year-old joins at higher arenas). 3D (three.js + KayKit), web, headed for GitHub Pages + PWA on a Lenovo Tab M9. **v1 is feature-complete and was live-playtested by the 6yo on 2026-06-12.**

## Read before any work
1. `docs/HANDOFF.md` — current state, playtest findings, priority queue. START HERE.
2. `docs/CURRICULUM.md` — pedagogical source of truth; its "Non-negotiable design rules" override everything.
3. `docs/BUILD_PLAN.md` — remaining epics with file scopes and acceptance criteria.

## Hard rules (several were hard-won tonight — do not relitigate)
- **The child produces the number, never the computer.** Auto-combat is fun-layer; learning happens only at gates where the kid produces the answer.
- **No ads, no IAP, no accounts, no runtime network calls** (three.js CDN importmap is the sole exception until E9 vendors it). Progress = localStorage.
- **Failure never blocks play.** Wrong answers scaffold and retry. No fail states, no nagging.
- **Battle never pauses for math.** The card floats over live play. (A pause-modal was built and rejected.)
- **Numbers are the only floating text in battle.** Comic words (POW!) were built and removed.
- **The resource is "POWER" in all UI** (internal var names still say elixir — rename UI-only).
- **Size = magnitude must never lie:** units scale to their CURRENT value and shrink as it drops.
- **Assets: KayKit / Kenney / Quaternius CC0 only** (public repo). Marketplace models rejected for license risk.
- Direct addition only until Arena 7 (missing-addend `7=?+4` was rejected as too advanced for now).

## Working with Daniel
- **Screenshot-driven iteration:** he plays, screenshots (often with an arrow drawn on it), you diagnose and fix in small fast commits. ~20 rounds happened tonight; expect more. Don't batch — fix, commit, tell him to refresh.
- Explain reasoning, one topic at a time; give a recommendation, not an options menu. Don't over-clarify plain instructions. No em-dashes in Daniel-authored copy.
- Commit straight to master. Messages must avoid embedded double quotes (PS 5.1 native-arg quoting breaks `git commit -m`).
- He may say "the kid is playing right now" — that means hotfix pace, minimal prose.

## Architecture (accurate as of commit ed5f59c)
- `index.html` — canvas + three.js CDN importmap → `src/main.js`
- `src/main.js` — flow: profile picker → arena select → match → banner-tap (capture-phase intercept) → arena select. Wires theme/deck/pools per match.
- `src/battle.js` — ALL sim state (`S`) + rules. No DOM. Key exports: reset, update, trySelectCard, tryDeploy (drag or tap; clamps into deploy band; squads fan out), setDeck, configureBattle({foeMaxVal, bossSpawn}), repairTower, addElixir. Combat = **duel system**: meeting troops lock 1:1, trade animated blows ~1.7s (`duelWith/duelT/dueling`), then subtraction resolves (equal annihilates; winner keeps difference). Troops chase nearest lane enemy in EITHER direction (within 260) before tower-marching.
- `src/render3d.js` — three.js renderer. MODEL3D maps spr→KayKit glb+weapons (handslot.r/.l sockets). Anisotropic world map (UX=42, UZ=48). Camera fits by binding axis (portrait=width, landscape=depth). **applyTheme(t)** = per-arena sky/fog/ground/river/lights/flora rebuild. getPortraits() photographs models for ALL card art everywhere. Kablooie particle deaths (no death clips). Tower HP badges. exports toWorld (raycast), worldToScreen, cardRect (dummy).
- `src/hud3d.js` — DOM HUD: power bar + cards (portrait=bottom bar, landscape=right rail @76px — CSS quirks documented inline), **drag-to-deploy** (ghost img; short tap = select for tap-tap), damage pops (numbers only), banner (pointer-events:none).
- `src/gates.js` — the floating math card: fixed center top-26%, breathing pulse; tap-to-count (tiers 0/1) or 4-choice recall (tier 2); reward = repair (damaged tower, heal=answer) else +3 power; spawns whenever power<10, 8s cooldown; pools injected via setFactPools (arena + earlier for the 20% review).
- `src/mastery.js` — pure engine (fluency/fast-pass/tiers/decay/80-20 picker). TESTED (tests/smoke.node.mjs, 17 asserts + tests/mastery.test.html). Don't modify without running both.
- `src/arenas.js` + `data/arenas.js` — 6-arena ladder, themes, fact-pool generators ("A+B" only), boss lights ≥80% fluency, unlock celebration. `src/deck-ui.js` + `data/roster.js` — MY TEAM equip-3 + bench, 8 composition cards. `src/store.js`/`src/profiles-ui.js` — profiles in localStorage.
- `src/render2d.js` — legacy 2D fallback, **drifting out of sync; do not invest in it**. `prototype.html`/`catapult-puzzle.html`/`3d-demo.html` frozen references.

## Run / verify
`python -m http.server 8765` from repo root (often already running). `node --check` every touched JS + `node tests/smoke.node.mjs` before committing. The M9 caches hard — tell Daniel to hard-refresh after pushes. Manual test: full loop profile→arena→battle→math card→boss→unlock.
