// data/arenas.js — Arena ladder definitions for Math Royale (Arenas 1–6).
// Pure data + generators. No DOM, no imports.
//
// Each arena:
//   id          {number}   1-based arena number
//   name        {string}   kid-friendly name
//   emoji       {string}   placeholder art
//   factPool    {()=>string[]}  generates all factIds for this arena (addition "A+B" format)
//   unlocks     {Array<{name,spr}>}  characters revealed on boss win
//   boss        {{name,spr,val}}  boss unit; spr from FOES villains in data/units.js
//   foeMaxVal   {number}   cap on villain val in normal matches
//
// CONSTRAINT: the current gate UI (src/gates.js) only handles "A+B" addition facts.
// Subtraction/multiplication gate support arrives in later epics.
// Arenas 7-10 require gate types that don't exist yet — they are NOT encoded here.
// TODO (E6/E7): encode A7 (unknown addend), A8-A10 (squads, ×, ÷) once gate types land.
//
// Fact-range design (per BUILD_PLAN.md E4):
//   A1: sums ≤ 4  (tiny starter — K.CC count & compare 1–5)
//   A2: sums ≤ 5  (number bonds to 5 — K.OA.5)
//   A3: make-ten  (bonds to exactly 10 — K.OA.4)
//   A4: add within 10, full range (1.OA.6 first half)
//   A5: teen = 10+n, n=1..9  (K.NBT.1 teen numbers)
//   A6: doubles & near-doubles (a+a and a+(a+1), sums ≤ 18) (1.OA.6)

// ─── helpers ──────────────────────────────────────────────────────────────────

/** All pairs (a, b) with a >= 1, b >= 1, a+b === target. */
function pairsEq(target) {
  const out = [];
  for (let a = 1; a < target; a++) out.push(a + '+' + (target - a));
  return out;
}

/** All pairs (a, b) with a >= 1, b >= 1, a+b <= maxSum. */
function pairsUpTo(maxSum) {
  const seen = new Set();
  const out = [];
  for (let s = 2; s <= maxSum; s++) {
    for (let a = 1; a < s; a++) {
      const id = a + '+' + (s - a);
      if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
  }
  return out;
}

// ─── arena definitions ────────────────────────────────────────────────────────

export const ARENAS = [
  {
    id: 1,
    name: 'Meadow',
    emoji: '🌿',
    // A1: sums ≤ 4 — tiny, just a handful of facts so new players get fluent fast
    factPool() { return pairsUpTo(4); },
    unlocks: [
      { name: 'Knight', spr: 'unit_02' },
      { name: 'Archer', spr: 'unit_03' },
    ],
    // Weakest villain as boss (val 2); enemy spawns capped at 2 so matches stay easy
    boss: { name: 'Poisoner', spr: 'unit_20', val: 2 },
    foeMaxVal: 2,
    // bright sunny meadow — OPEN FIELD: no river, no bridges
    theme: { flora: 'green', riverShape: 'none', bridges: false },
  },
  {
    id: 2,
    name: 'Bridge',
    emoji: '🌉',
    // A2: sums ≤ 5 — number bonds to 5; builds on A1 facts
    factPool() { return pairsUpTo(5); },
    unlocks: [
      { name: 'Spearman', spr: 'unit_05' },
    ],
    boss: { name: 'Shadow Rogue', spr: 'unit_15', val: 3 },
    foeMaxVal: 3,
    // watery: brighter sky, teal grass, vivid wide river
    theme: { sky: 0x9fdcff, fog: 0x9fdcff, ground: 0x4faa72, lane: 0x6cc488, river: 0x1f8fe0, flora: 'green' },
  },
  {
    id: 3,
    name: 'Forest',
    emoji: '🌲',
    // A3: bonds to exactly 10 (make-ten facts) — K.OA.4
    // Includes all pairs summing to 10: 1+9, 2+8, 3+7, 4+6, 5+5
    factPool() { return pairsEq(10); },
    unlocks: [
      { name: 'Cleric', spr: 'unit_04' },  // real hero art (white-robed cleric)
    ],
    boss: { name: 'Chain Brute', spr: 'unit_18', val: 4 },
    foeMaxVal: 4,
    // deep dark forest: dense trees, dim golden light — SNAKE RIVER winds through
    theme: { sky: 0x6f9e7a, fog: 0x6f9e7a, ground: 0x3f7a2c, lane: 0x559440, river: 0x2f7fae, hemi: 0.8, sun: 1.5, sunColor: 0xffe9b0, flora: 'dense', riverShape: 'snake' },
  },
  {
    id: 4,
    name: 'Old Mines',
    emoji: '⛏️',
    // A4: full add-within-10 range (1.OA.6); all pairs with sum 2–10
    factPool() { return pairsUpTo(10); },
    unlocks: [
      { name: 'Wizard', spr: 'unit_01' },
    ],
    boss: { name: 'Imp Lord', spr: 'unit_17', val: 5 },
    foeMaxVal: 5,
    // rocky dusk mines: brown earth, rock fields, amber light
    theme: { sky: 0xc99c72, fog: 0xc99c72, ground: 0x8d7a58, lane: 0xa3906a, river: 0x5f7884, hemi: 0.8, sun: 1.5, sunColor: 0xffb870, flora: 'rocky' },
  },
  {
    id: 5,
    name: 'Frost Peak',
    emoji: '❄️',
    // A5: teen numbers as 10+n, n = 1..9 (K.NBT.1)
    // These are 10+1 through 10+9 — "ten-block + ones"
    factPool() {
      const out = [];
      for (let n = 1; n <= 9; n++) out.push('10+' + n);
      return out;
    },
    // "Beaten villains join you" — the Dark Warlock defects to the player's side
    unlocks: [
      { name: 'Dark Warlock', spr: 'unit_13' },
    ],
    boss: { name: 'Necromancer', spr: 'unit_16', val: 6 },
    foeMaxVal: 6,
    // frost peak: white world, ice river, bare trees
    theme: { sky: 0xddeeff, fog: 0xddeeff, ground: 0xe9f2f5, lane: 0xcfe2ea, river: 0x8fd0ff, hemi: 1.35, sun: 2.2, sunColor: 0xeaf4ff, flora: 'frost' },
  },
  {
    id: 6,
    name: 'River Fort',
    emoji: '🏰',
    // A6: doubles (a+a) and near-doubles (a+(a+1)), sums ≤ 18 — 1.OA.6
    // Doubles: 1+1, 2+2, 3+3, 4+4, 5+5, 6+6, 7+7, 8+8, 9+9
    // Near-doubles: 1+2, 2+3, 3+4, 4+5, 5+6, 6+7, 7+8, 8+9
    factPool() {
      const out = [];
      for (let a = 1; a <= 9; a++) {
        out.push(a + '+' + a);        // doubles
        if (a < 9) out.push(a + '+' + (a + 1)); // near-doubles
      }
      return out;
    },
    // The A5 boss, beaten, joins the player's army
    unlocks: [
      { name: 'Necromancer', spr: 'unit_16' },
    ],
    // Strongest villain in current sprite set as final boss of this block
    boss: { name: 'Death Knight', spr: 'unit_14', val: 8 },
    foeMaxVal: 7,
    // NIGHT: navy sky, moonlight, dark woods with dead trees
    theme: { sky: 0x1c2752, fog: 0x1c2752, ground: 0x2c4a2e, lane: 0x3a613c, river: 0x25497a, hemi: 0.5, sun: 1.0, sunColor: 0xa9c2ff, flora: 'night' },
  },
];

// Quick lookup by id
export function getArena(id) {
  return ARENAS.find(a => a.id === id) || null;
}
