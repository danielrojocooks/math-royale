// data/roster.js — Full playable card roster for Math Royale.
// Pure data + helpers. No DOM, no imports.
//
// Each entry:
//   id     {string}  unique key
//   name   {string}  display name
//   spr    {string}  sprite id (used by render2d + render3d MODEL3D map)
//   cost   {number}  elixir cost === count * val (the math content)
//   count  {number}  how many units deploy
//   val    {number}  each unit's combat value
//   arena  {number}  arena that unlocks this card (1 = always available)

export const ROSTER = [
  { id: 'archers',  name: 'Archers',      spr: 'unit_03',   cost: 3, count: 3, val: 1, arena: 1 },
  { id: 'knights',  name: 'Knights',      spr: 'unit_02',   cost: 4, count: 2, val: 2, arena: 1 },
  { id: 'spearman', name: 'Spearman',     spr: 'unit_05',   cost: 5, count: 1, val: 5, arena: 1 },
  { id: 'rogues',   name: 'Rogues',       spr: 'unit_rogue',cost: 6, count: 3, val: 2, arena: 2 },
  { id: 'cleric',   name: 'Cleric',       spr: 'unit_04',   cost: 6, count: 2, val: 3, arena: 3 },
  { id: 'wizard',   name: 'Wizard',       spr: 'unit_01',   cost: 7, count: 1, val: 7, arena: 4 },
  { id: 'warlock',  name: 'Dark Warlock', spr: 'unit_13',   cost: 8, count: 2, val: 4, arena: 5 },
  { id: 'necro',    name: 'Necromancer',  spr: 'unit_16',   cost: 9, count: 3, val: 3, arena: 6 },
];

/** Look up a roster entry by id. Returns undefined if not found. */
export function byId(id) {
  return ROSTER.find(e => e.id === id);
}

/**
 * unlockedFor — return all roster entries available to a profile.
 * An entry is unlocked if entry.arena <= progress.current OR the arena
 * containing that entry is in progress.cleared.
 *
 * @param {{ cleared: number[], current: number }} progress
 * @returns {Array} roster entries the profile can equip
 */
export function unlockedFor(progress) {
  const cur  = progress?.current  ?? 1;
  const clrd = progress?.cleared  ?? [];
  return ROSTER.filter(e => e.arena <= cur || clrd.includes(e.arena));
}
