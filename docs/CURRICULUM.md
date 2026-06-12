# Math Royale — Curriculum & Progression Design
*Authored 2026-06-11 (Fable planning session). This is the pedagogical source of truth. Game code serves this document, not the other way around.*

## The two players
- **P1 (age 6, "starting level")**: solid at counting, adding/subtracting with 10s and 100s informally. Entering K→1st content. Starts Arena 1; mastery fast-pass will skip what he already owns.
- **P2 (age 11)**: needs multiplication/division fact fluency, not introduction. Takes a placement trial (Arena 0 "Training Grounds"), expected to land at Arena 8–10 and live in Endless mode.

## Non-negotiable design rules (agents: read twice)
1. **The child produces the number at every learning gate.** Auto-resolving combat is the fun layer; it never counts as learning. Never add a mechanic where the computer does the arithmetic and calls it teaching.
2. **Play is never blocked by failure.** A wrong answer gets a scaffold (dots appear, hint fades in) and a retry. No lives lost, no nagging, no "wrong!" sounds. The only cost of being wrong is time.
3. **Difficulty dials are: number range, scaffold visibility, time pressure.** Never raise two dials at once. Reading load is its own track and never spikes alongside a math jump.
4. **Cost = power through Arena 7** (both ≤10; the elixir bar is the number line). From Arena 8 the two split: elixir cost balances gameplay; **POWER is the math object** and shows the computation (`2×5=10`).
5. **No ads, no IAP, no dark-pattern retention.** Rewards are arenas, characters, and cosmetics earned by mastery. Sessions should end cleanly at match boundaries.

## The unlock economy (what replaces Clash Royale's paywall)
New **arena** = new biome + new boss. Each arena **unlocks 1–2 characters** for the deck. Advancement requires:
- **Fun gate:** beat the arena's boss match (always available to attempt once fluency gate is met).
- **Mastery gate (invisible):** ≥80% of the arena's fact pool is "fluent" (definition below). The boss button simply lights up when ready; the kid never sees a test.

## Mastery engine (spec for implementation)
Per profile, per fact (e.g. `3+4`), store: `attempts, correct, last3 (bools), ewmaMs`.
- **Fluent** = last 3 attempts correct AND median response time < threshold (P1: 8s, P2: 4s; tunable per profile).
- **Scaffold tiers** per fact: T0 = dots + numerals shown; T1 = numerals, dot hint appears on a miss; T2 = numerals only. Start new facts at T0 (P1) / T2 (P2). Drop a tier after 2 consecutive correct; rise a tier after 2 consecutive misses.
- **Fast-pass:** first 2 exposures of a fact answered correct in < ½ threshold ⇒ mark fluent immediately (this is how P1 skips what he knows).
- **Spaced review:** in any arena, ~20% of gates sample from *earlier* arenas' pools, weighted toward facts with the oldest last-seen time.
- **Decay:** a fact unseen for 14 days loses fluent status until re-confirmed once.

## Where the math gates live (mechanics inventory)
- **Repair gate** (towers): tower shows `7 = ? + 4`; pick the right number card from hand to repair. The workhorse gate, present from Arena 2 onward.
- **Charge gate** (catapult/cannon special): "charge to exactly N" by combining tiles. Reuses the proven catapult-puzzle loop (`catapult-puzzle.html`) as each arena's **Training Ground** practice mode.
- **Deploy economics** (ambient): elixir gap counting; watching the bar fill toward an unaffordable card.
- **Squad math** (A8+): squad cards deploy groups; power displays as multiplication (`3×5=15`). Split spell does division (`12 ÷ 3 lanes = 4`).
- **Reading spells** (orthogonal track): Dolch sight-word cards (`RUN`, `STOP`, `JUMP`); the word IS the card art. Win screens are one readable sentence built from words already seen.

## THE ARENA LADDER

| # | Arena | Math focus (≈standard) | Gate examples | New mechanics | Unlocks | Reading tier |
|---|-------|------------------------|---------------|---------------|---------|--------------|
| 0 | Training Grounds | Placement trial (12 Qs spanning ladder, disguised as target practice) | — | catapult mode | profile placement | — |
| 1 | Meadow | Count & compare 1–5 (K.CC) | "send MORE than the bat" | deploy, elixir, size=magnitude; values shown as dots+numerals | Knight (2), Archer (3) | — |
| 2 | Bridge | Number bonds to 5; fluency within 5 (K.OA.5) | repair `5 = ? + 2` | repair gate debuts | Spearman (5) | pre-primer: GO, UP, RUN |
| 3 | Forest | Bonds to 10; make-ten (K.OA.4) | repair `10 = ? + 6`; charge to exactly 10 | charge gate; Goblin Duo (counts by 2s) | Goblin Duo, Cleric (4) | pre-primer: STOP, BIG |
| 4 | Old Mines | Add/subtract within 10 (1.OA.6 first half) | charge `8 − 3`; repair `9 = ? + 5` | mixed +/− gates | Wizard (7) | primer: HELP, OUT |
| 5 | Frost Peak | Teen numbers = ten + ones (K.NBT.1) | repair `13 = 10 + ?` | "10-block + ones" card visuals | Giant (power 13) | primer: COME, DOWN |
| 6 | River Fort | Add within 20; doubles & doubles±1 (1.OA.6) | charge `6+6`, `6+7` | Twin cards (literal doubles: two knights) | Twin Knights (4+4) | primer: TWO, AWAY |
| 7 | Canyon | Unknown addend; subtraction as missing part (1.OA.4, 1.OA.8) | repair `8 + ? = 11` | Healer heals BY the missing addend | Healer | grade 1: FLY, OPEN |
| 8 | Goblin City | Skip counting 2s/5s/10s (2.OA.3-ish) | "how many goblins? 5, 10, 15…" confirm count | squads of 5; castle HP 100 counted by 10s; **cost/power split begins** | Goblin Gang (5×1) | grade 1: STOP+compound frames |
| 9 | Dragon Spire | ×2, ×5, ×10 as groups-of (3.OA.1) | deploy `3 squads of 5 → 3×5=?` | power shown as multiplication | Baby Dragon | sentence frames |
| 10 | Volcano Keep | Full tables ×3,×4,×6–×9; division as sharing (3.OA.7) | Split spell `12 ÷ 3 = ?` per lane | division spell; speed pressure on | Dragon, Death Knight (playable!) | — |
| ∞ | Endless / Legend | Mixed ×/÷ fluency under pressure | rapid gates, self-best ladder | leaderboard vs self only | cosmetics | — |

**Boss matches** use the villain roster, each boss gimmick exercising the arena skill: A3 boss Poisoner heals himself to 10 unless your make-ten repair lands; A7 boss Necromancer revives minions with the missing addend; A10 boss Dark Warlock splits his horde and you must Split back. (Agents: boss gimmicks are flavor on top of the same gate code.)

## Reading track (parallel, never co-gated with new math)
- Spell card pool per tier: pre-primer → primer → grade 1 Dolch lists. Card = the word, big, no picture. Effect teaches meaning (STOP freezes, JUMP leaps the river, RUN hastes).
- Win screens: one 4–6 word sentence from seen words ("You stopped the dragon!"). Tap to continue = read to progress.
- New spell words debut in arenas where math is consolidating (even arenas), not where new math debuts (odd arenas). One dial at a time.

## Session shape
Target session: 2 matches (~8 min). After 2nd match, the castle "rests" (gentle wind-down screen, progress recap read-aloud-able). No streaks, no daily-login bait. Parent dashboard (later): per-fact fluency heatmap.
