// Game configuration: board geometry + unit rosters.
// Pure data. No imports, no DOM, no logic beyond constants.

// Logical board size (render2d scales this to the real screen)
export const W = 760, H = 1180;

// Board geometry
export const LANE = [215, 545];          // x centers of the two lanes
export const RIVER_T = 500, RIVER_B = 560;
export const DEPLOY_MIN = 580, DEPLOY_MAX = 890;  // where the player may drop troops (down to the king)
export const PANEL_Y = 970;              // top of the card/elixir panel
export const SPEED = 52;                 // troop march speed (px/s)

// Player deck. Rule (CURRICULUM.md #4): cost === total power through Arena 7.
// Cards are COMPOSITIONS of their number: count units of val each (count*val = cost).
// 3 = 1+1+1, 4 = 2+2, 5 = 5, 7 = 7 — deploying is literally building the number.
export const DECK = [
  { name: 'Archers', spr: 'unit_03', cost: 3, count: 3, val: 1 },
  { name: 'Knights', spr: 'unit_02', cost: 4, count: 2, val: 2 },
  { name: 'Spearman', spr: 'unit_05', cost: 5, count: 1, val: 5 },
  { name: 'Wizard', spr: 'unit_01', cost: 7, count: 1, val: 7 },
];

// Enemy roster (scarier sprite = bigger number; size = magnitude)
export const FOES = [
  { spr: 'unit_20', val: 2 },
  { spr: 'unit_15', val: 3 },
  { spr: 'unit_18', val: 4 },
  { spr: 'unit_17', val: 5 },
  { spr: 'unit_16', val: 6 },
  { spr: 'unit_13', val: 7 },
  { spr: 'unit_14', val: 8 },
];

// Comic words for death FX
export const WORDS = ['POW!', 'BAM!', 'SPLAT!', 'KABLOOIE!', 'BOOM!', 'WHAM!', 'SPLOOSH!'];
