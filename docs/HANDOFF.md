# HANDOFF — state as of 2026-06-12 ~3:30 AM (commit ed5f59c)

*Written by the Fable instance that built v1 with Daniel in one ~7-hour session. The next instance (Opus directing, Sonnet agents coding) picks up here.*

## What exists
A complete, playable v1: profile picker → 6-arena themed ladder → 3D animated battles (KayKit characters with weapons, duel system, kablooie deaths) → floating tap-to-count math card feeding a real mastery engine → boss unlocks → MY TEAM deck building (equip 3 of 8 composition cards). Runs on desktop (landscape, right-rail HUD) and the Lenovo M9 (portrait, bottom HUD) off a local python server. 25+ commits, all green (node --check + 17-assert smoke suite).

## THE open design problem — handle this first
**Live playtest result: the 6yo ignores the math card.** Position (side → top-center), a breathing pulse, and a ~30% enlargement did NOT fix it. He sees it; he prefers the battle. The reward (+3 power / tower repair) is not competing with explosions.

**Proposed fix, sketched but NOT yet approved by Daniel ("lever 2 — the Wizard sleeps"):**
- The player's best/most expensive equipped card starts each match ASLEEP (greyed, 💤 on its card slot).
- Solving the math card WAKES it (one solve = unlocked for the match). Subsequent solves could discount or charge the next-biggest card.
- Rationale: math becomes the gate to the thing he most wants (units), not an abstract resource. No kid ignores the thing standing between him and the Wizard.
- Implementation sketch: battle.js — per-match `lockedCardIdx` (highest-cost equipped card); trySelectCard refuses it with a wobble until `wakeCard()` is called; gates.js resolve() calls wakeCard() instead of/alongside addElixir on power-card solves; hud3d shows 💤 overlay + wake animation. ~30 min of work.
- **Propose it to Daniel before building.** If he approves, this is P0. If the kid had since started using the card (ask!), deprioritize.

Secondary playtest observations: drag-to-deploy shipped mid-session (untested by the kid as of handoff); duel length 1.7s is a tuning knob if pushes gridlock.

## Priority queue (after the design question)
1. **Deploy** — `gh repo create math-royale --public --source . --push`, enable Pages (master). Repo is already curated (.gitignore keeps raw packs out; assets/game/ = 6MB ships).
2. **E9 PWA** — manifest + service worker (cache-all, offline-first) + vendor three.js locally (removes the CDN exception, fixes the M9 stale-cache pain via versioned SW updates). Then "Add to Home Screen" on the M9.
3. **E7 reading spells** — Dolch word spell cards (STOP freeze, RUN haste, JUMP river-leap), win-screen sentences. See CURRICULUM.md reading track; new words debut on even arenas only.
4. **E8 placement trial** — 12-question catapult-style session seeding fluency + starting arena (for the 11yo). catapult-puzzle.html holds the proven loop to port.
5. **E6 leftovers** — skip-count gates + cost/power split for arenas 7-10 (subtraction + multiplication gate formats; CURRICULUM ladder rungs 7-10 are NOT in data/arenas.js yet).
6. Niceties parked: arena-colored castles (hexagon pack has 4 team colors), mimic chest enemy (dungeon pack), Kenney weapon-catapult.glb for a siege unit, parent dashboard (per-fact heatmap from profile.facts).

## Process that worked (keep it)
- Sonnet agents build one epic per session from BUILD_PLAN specs; the directing model reviews line-by-line, fixes nits itself, runs checks, commits with a "Built by Sonnet agent (EN); reviewed..." trailer. Agents often lack shell — they report, reviewer verifies.
- Daniel iterates via screenshots with arrows. Small commits, fast turnaround, tell him to (hard-)refresh.
- Every commit: node --check touched files + node tests/smoke.node.mjs.

## Known debt (don't trip on it)
- render2d.js (2D fallback) drifts from the 3D feature set — towers HP badges, duels render fine logically but it's unmaintained. Either delete it in a cleanup epic or stop pretending it's a fallback.
- input.js has a dead DECK.length loop (harmless — render3d.cardRect returns offscreen rects).
- Internal naming still "elixir" (S.elixir, addElixir) while all UI says POWER — rename only with care, gates/hud touch it.
- Old "charge:N" factIds may linger in early profiles' mastery stats — harmless noise.
- profiles created pre-deck default to archers/knights/spearman via fallback in main.js — fine.

## Asset inventory (local, gitignored except assets/game/)
KayKit: adventurers, skeletons, animations, builder, hexagon (4-color buildings!), dungeon remastered, dungeon 1.0 (props incl. mimic chests), forest nature, weapons, resources. Kenney: tower-defense kit (3D GLBs incl. catapult/ballista/cannon + snow tiles), toon characters. 2D: assets/fantasy_t/clean (now placeholder-only; all live art = getPortraits()). Missing from everything: a dragon (Quaternius CC0 when arenas 9-10 need one).
