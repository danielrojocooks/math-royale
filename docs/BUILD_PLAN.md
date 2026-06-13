# Math Royale — Build Plan (agent execution guide)
*Companion to CURRICULUM.md. Each epic below is sized for one focused session on a cheaper model (Sonnet for logic epics, Haiku acceptable for pure data-authoring epics). Do epics in order unless marked independent.*

> **STATUS 2026-06-12 (see docs/HANDOFF.md for full state): E0 ✅ E1 ✅ E2 ✅ E3 ✅ (heavily redesigned in playtest: floating tap-to-count card, no pause, no charge modal) E4 ✅ E5 ✅ E10 ✅ (3D shipped EARLY — it is the renderer now; "renderer-agnostic" notes below are historical).**
> **Remaining: the P0 math-reward redesign (HANDOFF.md), deploy+E9, E7, E8, E6 leftovers. The file maps in the original epic specs below are STALE for completed epics — trust CLAUDE.md's architecture section instead.**

## How to run an epic (instructions to the agent)
1. Read `CLAUDE.md`, `docs/CURRICULUM.md`, and this file's epic section FIRST. The design rules in CURRICULUM.md override anything you'd rather do.
2. Touch only the files listed in your epic. If you believe another file must change, stop and say so instead of changing it.
3. Verify by serving locally (`python -m http.server 8765` from repo root, NOT from a subfolder) and loading the page. Every epic's acceptance criteria must pass before you report done.
4. No new dependencies, no build step, no network calls at runtime. Plain ES modules only.
5. Keep functions small; the next agent has to read your code on a cheap context budget.

## Current state (2026-06-11)
- `prototype.html` — 2D canvas CR-style battle (lanes, elixir, auto-combat, juice/kablooie FX). Single file, working.
- `catapult-puzzle.html` — build-the-number catapult mode (becomes Training Grounds). Working.
- `3d-demo.html` — three.js proof: KayKit skeletal animations + Kenney GLB scenery. Proof only.
- `assets/` — fantasy_t/clean (2D unit PNGs), kenney (sci-fi TD kit, has 3D GLBs), kaykit (animation pack + mannequin).
- No module structure, no persistence, no curriculum engine yet.

---

### E0. Refactor to module structure  *(Sonnet)*
Create `index.html` + `src/` split WITHOUT changing behavior:
- `src/render2d.js` (canvas drawing), `src/battle.js` (game state/update), `src/input.js`, `src/main.js` (loop/glue).
- `data/units.js` (DECK/FOES arrays moved out).
**Accept:** `http://localhost:8765/index.html` plays identically to old prototype.html. prototype.html left untouched as reference.

### E1. Profile system  *(Sonnet, independent after E0)*
- `src/store.js`: localStorage namespace `mathroyale.v1.<profileId>`. Profiles: name, avatar (pick a hero sprite), settings (fluency threshold ms), per-fact stats map.
- Profile picker screen before battle (two big buttons + "new profile").
**Accept:** two profiles persist separately across reloads; deleting one doesn't touch the other.

### E2. Mastery engine  *(Sonnet — the most important epic; write unit tests)*
- `src/mastery.js`, pure functions, no DOM: `recordAttempt(stats, factId, correct, ms)`, `isFluent(stats, factId, profile)`, `scaffoldTier(stats, factId)`, `pickGateFact(stats, arenaPool, earlierPools)` (implements 80/20 review mix + oldest-last-seen weighting), `arenaFluentPct(stats, pool)`.
- Implement fluency, fast-pass, tier movement, and 14-day decay EXACTLY as specified in CURRICULUM.md "Mastery engine".
- `tests/mastery.test.html`: self-running assertions page, all green.
**Accept:** tests page passes; engine has zero rendering imports.

### E3. Gate UIs  *(Sonnet)*
- `src/gates.js`: Repair gate (`7 = ? + 4` — answer by tapping a number card) and Charge gate (combine tiles to exact N — port the proven loop from catapult-puzzle.html).
- Scaffold rendering per tier: T0 dots+numerals, T1 dots-on-miss, T2 numerals only. Wrong answer: gentle shake, scaffold appears, retry. NEVER a blocking fail state.
- Wire into battle: damaged tower shows repair button; gates call `mastery.recordAttempt` with elapsed ms.
**Accept:** playing one match exercises both gates; misses show scaffolds; stats appear in localStorage.

### E4. Arena system  *(Sonnet + Haiku for data)*
- `data/arenas.js`: encode the full ladder table from CURRICULUM.md (id, name, palette, fact pool generator, unlocks, boss spec, reading tier).
- `src/arenas.js`: lock/unlock logic (boss lights up at ≥80% pool fluency; arena cleared on boss win), arena select screen (locked = silhouette).
- Fact pools are GENERATORS (e.g. all pairs summing ≤5), not hand-typed lists.
**Accept:** fresh profile sees Arena 1 only; manually seeding fluent stats lights Arena 2's boss.

### E5. Deck / collection screen  *(Haiku-capable)*
- Equip screen: shelf of unlocked characters (picture-first, tap to add to 4 slots). Locked characters show as silhouettes with arena number.
**Accept:** deck choice persists per profile and is what battle deals.

### E6. Squads & skip counting (Arenas 8–9 mechanics)  *(Sonnet)*
- Squad cards (deploy N units of value V), power badge shows `N×V=P` at deploy, cost/power split per CURRICULUM.md rule 4. Skip-count confirm gate ("5, 10, 15 — how many?").
**Accept:** A8 match playable end-to-end with squad deploys feeding mastery stats for skip-count facts.

### E7. Reading spells  *(Haiku-capable)*
- `data/dolch.js` (tiered word lists), spell cards (word-only face), effects: STOP freeze, RUN haste, JUMP river-leap. Win screen sentence builder from seen-words only.
**Accept:** spells castable in battle; win sentence uses only words the profile has seen.

### E8. Placement trial (Arena 0)  *(Sonnet)*
- 12-question catapult session sampling A1→A10 pools; stops early after 3 consecutive misses; seeds fluency + starting arena.
**Accept:** an all-correct fast run places at A8+; an early-miss run places at A1.

### E9. PWA packaging for the Lenovo M9  *(Sonnet)*
- `manifest.json`, service worker (cache-all, offline-first), icon. Test instructions for Chrome → Add to Home Screen.
**Accept:** airplane-mode reload works after first visit.

### E10. 3D renderer (OPTIONAL — only when Daniel says go)
- Swap render2d for three.js scene per 3d-demo.html patterns; KayKit characters (Adventurers/Skeletons packs, same rig) + Kenney GLB environment; battle.js/mastery.js unchanged.
- Gate: requires Daniel to download KayKit Adventurers + Skeletons packs first. 2D PNGs become card art.

## Suggested model assignment
- E2, E3, E4 logic, E6, E8: **Sonnet** (correctness-sensitive).
- E4 data, E5, E7: **Haiku** (data authoring / simple UI against existing patterns).
- E10: do on Opus/Fable with Daniel in the loop (architecture).
