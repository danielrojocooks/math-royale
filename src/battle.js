// Battle simulation: all game state and rules. NO rendering, NO DOM, NO canvas.
// render2d.js reads S to draw; input.js calls the exported actions.
import { LANE, RIVER_T, RIVER_B, DEPLOY_MIN, DEPLOY_MAX, SPEED, DECK as DEFAULT_DECK, FOES } from '../data/units.js';

// ---- active deck (set by setDeck; defaults to data/units.js DECK) ----
let _activeDeck = DEFAULT_DECK;

/**
 * setDeck — set the cards used in the next (and current) battle.
 * Pass an array of roster entries (each with .name/.spr/.cost/.count/.val).
 * @param {Array} cards
 */
export function setDeck(cards) {
  _activeDeck = Array.isArray(cards) && cards.length ? cards : DEFAULT_DECK;
}

// ---- arena configuration (set by arenas.js via configureBattle before reset()) ----
// foeMaxVal: upper bound on villain val the AI may spawn (default = uncapped).
// bossSpawn: { spr, val } to drop on the foe side 1s after match start, or null.
let _cfg = { foeMaxVal: Infinity, bossSpawn: null, tentacle: null };

/**
 * configureBattle — called by the arena system before reset() to set match parameters.
 * tentacle: { period, reach } river hazard intensity, or null to disable.
 * @param {{ foeMaxVal?: number, bossSpawn?: {spr:string, val:number}|null, tentacle?: {period:number,reach:number}|null }} opts
 */
export function configureBattle({ foeMaxVal, bossSpawn, tentacle, level, foeSpeed, foeTowerHp } = {}) {
  _cfg = {
    foeMaxVal: foeMaxVal ?? Infinity,
    bossSpawn: bossSpawn ?? null,
    tentacle: tentacle ?? null,
    level: level ?? 1,             // arena number; scales king fire rate
    foeSpeed: foeSpeed ?? 1,       // enemy march speed multiplier (gentler early arenas)
    foeTowerHp: foeTowerHp ?? 1,   // enemy tower HP multiplier (easier to break early)
  };
}

// ---- state (read by render, mutated only here) ----
export const S = {
  towers: [], troops: [], parts: [], decals: [], pops: [],
  elixir: 5, foeElixir: 5, foeTimer: 2.5,
  sel: -1, shake: 0, over: null, T: 0,
  paused: false,  // set true while a gate modal is open; update() skips sim
  deck: DEFAULT_DECK,  // mirrors _activeDeck; renderers/HUD read this
  tentacles: [], tentTimer: 0,  // river hazard (configureBattle.tentacle)
  arrows: [],  // per-frame tower-shot events {x,y,tx,ty}; render draws + clears them
};

// Tentacle hazard phase timings (seconds)
const TENT_WARN = 0.8;     // telegraph ripple before it strikes
const TENT_STRIKE = 0.6;   // erupt + pull the grabbed unit in
const TENT_RETRACT = 0.5;  // sink back under
const TENT_EMERGE = 0.22;  // how fast it rises during the strike

function tower(side, kind, x, y, lane, hp) {
  return { side, kind, x, y, lane, hp, maxhp: hp, flash: 0, dead: false, atkcd: Math.random() * 0.6 };
}

export function reset() {
  // Sync the public deck snapshot so renderers always see the current deck.
  S.deck = _activeDeck;

  // Castles spread further apart -> longer marches, more board to play.
  // Enemy pushed back toward the top edge + player front nudged back to lengthen
  // the contested middle (longer matches). Enemy tower HP scales down on early
  // arenas (foeTowerHp); player towers stay full strength.
  const fp = Math.round(14 * _cfg.foeTowerHp), fk = Math.round(40 * _cfg.foeTowerHp);
  S.towers = [
    tower('foe', 'prin', LANE[0], 150, 0, fp), tower('foe', 'prin', LANE[1], 150, 1, fp), tower('foe', 'king', 380, 40, -1, fk),
    tower('you', 'prin', LANE[0], 785, 0, 14), tower('you', 'prin', LANE[1], 785, 1, 14), tower('you', 'king', 380, 915, -1, 40),
  ];
  S.troops = []; S.parts = []; S.decals = []; S.pops = [];
  S.elixir = 5; S.foeElixir = 5; S.foeTimer = 2.5;
  S.sel = -1; S.shake = 0; S.over = null; S.T = 0; S.paused = false;
  S.tentacles = []; S.tentTimer = _cfg.tentacle ? 2.5 + Math.random() * 2 : 1e9;
  S.arrows = [];

  // ── Boss spawn: drop the boss unit on the foe side ~1s after match start.
  if (_cfg.bossSpawn) {
    const { spr, val } = _cfg.bossSpawn;
    setTimeout(() => {
      if (S.over) return; // match may have already ended (edge case)
      mkTroop('foe', Math.floor(Math.random() * 2), 190, val, spr);
    }, 1000);
  }
}

// ---- FX spawners (state only; render draws them) ----
function burst(x, y, c, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = (spd || 110) * (.4 + Math.random());
    S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .4, color: c, r: 4 });
  }
}
function dust(x, y) {
  for (let i = 0; i < 2; i++) S.parts.push({ x: x + (Math.random() - .5) * 14, y, vx: (Math.random() - .5) * 30, vy: -20 - Math.random() * 20, life: .35, color: '#cdbb95', r: 3 });
}
function ring(x, y, c) { S.parts.push({ ring: true, x, y, r: 8, life: .42, color: c }); }
function chunks(x, y, cols, n) {
  for (let i = 0; i < (n || 16); i++) {
    const a = Math.random() * 6.28, s = 120 + Math.random() * 240;
    S.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 70, life: .55 + Math.random() * .55, color: cols[i % cols.length], r: 3 + Math.random() * 6, chunk: true, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 22 });
  }
}
function splat(x, y, c) { S.decals.push({ x, y, r: 24 + Math.random() * 20, life: 1.7, maxlife: 1.7, color: c, rot: Math.random() * 6.28 }); }
function popup(x, y, t, c, big) { S.pops.push({ x, y, text: t, color: c, life: 1, vy: -46, big: !!big }); }

// Deaths are pure explosion — no comic text (playtest feedback); the only
// floating text in battle is numbers (damage, remaining values).
function deathFx(t) {
  const side = t.side === 'you' ? '#2b7de0' : '#e23b3b';
  ring(t.x, t.y, '#fff'); chunks(t.x, t.y, ['#8b1a1a', '#c0392b', side, '#ffcf4d', '#fff'], 18); splat(t.x, t.y + 12, '#7a1414');
  S.shake = Math.max(S.shake, .28);
}
function towerFx(tw) {
  ring(tw.x, tw.y, '#fff'); chunks(tw.x, tw.y, ['#9aa3ad', '#6b7480', '#4a525c', '#ffcf4d'], 26);
  splat(tw.x, tw.y + 18, '#5a5246'); S.shake = Math.max(S.shake, .5);
}

// ---- troops ----
function mkTroop(side, lane, y, val, spr, xoff) {
  S.troops.push({
    side, lane, x: LANE[lane] + (xoff || 0), y, val, maxval: val, spr,
    pop: 0, flash: 0, hit: 0, atk: 0, atkcd: .3, struck: false,
    walk: Math.random() * 6.28, dust: 0, moving: false, dead: false, dying: 0,
    duelWith: null, duelT: 0, dueling: false, grabbed: false,
  });
  burst(LANE[lane], y, side === 'you' ? '#7ec8ff' : '#ff9a9a', 12, 150);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.28;
    S.parts.push({ x: LANE[lane], y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, life: .4, color: '#fff', r: 3 });
  }
}
function kill(t) { if (t.dead) return; t.dead = true; t.dying = .16; t.flash = 0; deathFx(t); }
function oppTower(side, lane) {
  const o = side === 'you' ? 'foe' : 'you';
  return S.towers.find(t => !t.dead && t.side === o && t.kind === 'prin' && t.lane === lane)
      || S.towers.find(t => !t.dead && t.side === o && t.kind === 'king') || null;
}

// ---- river tentacle hazard ----
// A tentacle telegraphs (ripple), erupts, and drags the nearest unit under.
// Neutral: grabs whoever is closest (yours OR the foe's). Intensity scales by arena.
function spawnTentacle() {
  const x = 130 + Math.random() * 500;                   // within the field width
  const y = RIVER_T + Math.random() * (RIVER_B - RIVER_T);
  S.tentacles.push({ x, y, phase: 'warn', t: 0, rise: 0, curl: 0, grabbed: null, done: false });
}
function dragUnder(tr) {
  if (tr.dead) return;
  tr.dead = true; tr.dying = .16; tr.flash = 0; tr.grabbed = false;
  // blue water splash (not the red death gore)
  burst(tr.x, tr.y, '#7ec8ff', 16, 170); ring(tr.x, tr.y, '#bfe8ff'); splat(tr.x, tr.y, '#2f6fae');
  S.shake = Math.max(S.shake, .26);
}
function updateTentacles(dt) {
  const cfg = _cfg.tentacle;
  S.tentTimer -= dt;
  if (S.tentTimer <= 0) { spawnTentacle(); S.tentTimer = cfg.period * (0.7 + Math.random() * 0.6); }
  for (const te of S.tentacles) {
    te.t += dt;
    if (te.phase === 'warn') {
      te.rise = 0; te.curl = 0;
      if (te.t >= TENT_WARN) {
        te.phase = 'strike'; te.t = 0;
        // grab the nearest living, ungrabbed unit within reach
        let best = null, bd = cfg.reach;
        for (const tr of S.troops) {
          if (tr.dead || tr.grabbed) continue;
          const d = Math.hypot(tr.x - te.x, tr.y - te.y);
          if (d < bd) { bd = d; best = tr; }
        }
        if (best) {
          te.grabbed = best; best.grabbed = true;
          if (best.duelWith) { best.duelWith.duelWith = null; best.duelWith.dueling = false; }
          best.duelWith = null; best.dueling = false;
        }
      }
    } else if (te.phase === 'strike') {
      te.rise = Math.min(1, te.t / TENT_EMERGE);
      te.curl = Math.min(1, te.t / TENT_STRIKE);          // curls in to grab
      if (te.grabbed && !te.grabbed.dead) {
        const tr = te.grabbed, k = Math.min(1, dt * 5);
        tr.x += (te.x - tr.x) * k; tr.y += (te.y - tr.y) * k;     // pull toward the tentacle
      }
      if (te.t >= TENT_STRIKE) {
        if (te.grabbed && !te.grabbed.dead) dragUnder(te.grabbed);
        te.phase = 'retract'; te.t = 0;
      }
    } else {                                                       // retract
      te.rise = Math.max(0, 1 - te.t / TENT_RETRACT);
      te.curl = 1;                                                 // stays curled as it sinks
      if (te.t >= TENT_RETRACT) te.done = true;
    }
  }
  S.tentacles = S.tentacles.filter(te => !te.done);
}

// ---- tower offense: towers shoot the nearest enemy in range (CR-style defense) ----
// Arrows chip a troop's value (size = magnitude shrinks it); king shoots harder.
function towerFire(dt) {
  for (const tw of S.towers) {
    // ONLY KINGS shoot — princess crossfire forced a stalemate (nothing got through).
    if (tw.dead || tw.kind !== 'king') continue;
    tw.atkcd -= dt;
    if (tw.atkcd > 0) continue;
    let best = null, bd = 185;                          // reach: defends the approach, but troops can close in
    for (const t of S.troops) {
      if (t.dead || t.side === tw.side || t.grabbed) continue;
      const d = Math.hypot(t.x - tw.x, t.y - tw.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) { tw.atkcd = 0.3; continue; }            // scan faster when nothing in range
    const levelScale = 1 + (_cfg.level - 1) * 0.1;      // a bit faster each arena
    const matchRamp = 1 + Math.min(0.4, S.T / 180);     // gentle within-match speed-up
    tw.atkcd = 1.3 / (levelScale * matchRamp);          // slow enough that a wave can break through
    S.arrows.push({ x: tw.x, y: tw.y, tx: best.x, ty: best.y });   // render draws the flying arrow
    best.val -= 1; best.flash = .2; best.hit = .2;
    popup(best.x, best.y - 30, '-1', tw.side === 'you' ? '#bff' : '#fbb');
    burst(best.x, best.y, '#fff', 4, 120);
    if (best.val <= 0) kill(best);
  }
}

// ---- player actions (called by input.js) ----
export function trySelectCard(i) {
  if ((_activeDeck[i].cost ?? _activeDeck[i].val) <= S.elixir) { S.sel = i; return true; }
  S.shake = .12; return false;
}
export function tryDeploy(x, y) {
  // Deploy at YOUR tower for the chosen lane — troops always emerge from your
  // side (not anywhere downfield). The release X picks the lane (left/right);
  // the unit spawns just in front of that lane's tower and marches out.
  if (S.sel < 0) return false;
  const d = _activeDeck[S.sel];
  const cost = d.cost ?? d.val;
  if (cost > S.elixir) return false;
  S.elixir -= cost;
  const lane = x < 380 ? 0 : 1;
  const tw = S.towers.find(t => t.side === 'you' && t.kind === 'prin' && t.lane === lane && !t.dead)
          || S.towers.find(t => t.side === 'you' && t.kind === 'king' && !t.dead);
  const dy = tw ? tw.y - 28 : 880;     // just in front of your tower
  const n = d.count ?? 1;
  // squads fan out in a small formation (offsets are visual; lane combat unchanged)
  for (let i = 0; i < n; i++) {
    const xoff = (i - (n - 1) / 2) * 30;
    const yoff = (i % 2) * 28;
    mkTroop('you', lane, dy + yoff, d.val, d.spr, xoff);
  }
  S.sel = -1; return true;
}

// ---- gate exports ----

/** repairTower — heal a friendly tower by amount (capped at maxhp). */
export function repairTower(tower, amount) {
  tower.hp = Math.min(tower.maxhp, tower.hp + amount);
}

/** addElixir — add n elixir to the player, capped at 10. */
export function addElixir(n) {
  S.elixir = Math.min(10, S.elixir + n);
}

// ---- tower cannon (fired by gates.js on a correct answer) ----
// A catapult on your king tower fires whenever the kid solves a math card, so
// the reward for the math is itself an on-field explosion (playtest: an abstract
// +power reward lost to the battle; a kablooie does not).

/** cannonPickTarget — the thing the cannon should hit: the foe troop closest to
 *  your king (largest y = deepest into your half), else the enemy king tower so
 *  a correct answer is never wasted. Returns { x, y, troop?, tower? } or null. */
export function cannonPickTarget() {
  let best = null;
  for (const t of S.troops) {
    if (t.dead || t.side !== 'foe') continue;
    if (!best || t.y > best.y) best = t;
  }
  if (best) return { x: best.x, y: best.y, troop: best };
  const ek = S.towers.find(t => t.side === 'foe' && t.kind === 'king' && !t.dead);
  if (ek) return { x: ek.x, y: ek.y, tower: ek };
  return null;
}

/** cannonResolve — apply the hit (called by render3d at projectile impact, so the
 *  boom lands with the cannonball). Kills the troop, or chips the enemy king. */
export function cannonResolve(target) {
  if (!target) return;
  if (target.troop && !target.troop.dead) {
    kill(target.troop);
    S.shake = Math.max(S.shake, .32);
  } else if (target.tower && !target.tower.dead) {
    target.tower.hp -= 4; target.tower.flash = .3;     // solve chips the enemy king when the lane is clear
    if (target.tower.hp <= 0) { target.tower.dead = true; towerFx(target.tower); }
    S.shake = Math.max(S.shake, .32);
  }
}

// ---- simulation ----
export function update(dt) {
  S.T += dt;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  if (S.over) { decay(dt); return; }
  if (S.paused) return;  // gate is open — freeze simulation (decay also skipped for clean freeze)
  S.elixir = Math.min(10, S.elixir + dt / 1.6);
  S.foeElixir = Math.min(10, S.foeElixir + dt / 1.3);   // enemy banks power faster (difficulty)

  // enemy AI: deploy a random affordable villain every few seconds.
  // foeMaxVal cap (from configureBattle) restricts which villains may spawn.
  S.foeTimer -= dt;
  if (S.foeTimer <= 0) {
    // Only lanes whose foe princess still stands produce troops; once both are
    // down the king is the lone, slower producer. Destroying towers cuts pressure.
    const liveLanes = [0, 1].filter(l =>
      S.towers.some(t => t.side === 'foe' && t.kind === 'prin' && t.lane === l && !t.dead));
    const kingAlive = S.towers.some(t => t.side === 'foe' && t.kind === 'king' && !t.dead);
    const aff = FOES.filter(f => f.val <= S.foeElixir && f.val <= _cfg.foeMaxVal);
    if (aff.length && (liveLanes.length || kingAlive)) {
      const f = aff[Math.floor(Math.random() * aff.length)];
      S.foeElixir -= f.val;
      const lane = liveLanes.length ? liveLanes[Math.floor(Math.random() * liveLanes.length)]
                                    : Math.floor(Math.random() * 2);
      mkTroop('foe', lane, 190, f.val, f.spr);
      S.foeTimer = (liveLanes.length ? 1.8 : 3.6) + Math.random() * 1.8;   // king-only = slower
    } else S.foeTimer = .6;
  }

  // river tentacle hazard (telegraph -> grab -> drag under)
  if (_cfg.tentacle) updateTentacles(dt);

  // tower hit-flash decay (was never decremented — towers stayed red forever)
  for (const tw of S.towers) if (tw.flash > 0) tw.flash -= dt;

  // march + tower attacks (wind-up -> strike at 50% through the swing)
  for (const t of S.troops) {
    if (t.flash > 0) t.flash -= dt;
    if (t.hit > 0) t.hit -= dt;
    if (t.dead) { t.dying -= dt; continue; }
    if (t.grabbed) continue;                   // tentacle controls this unit's position
    if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 5);
    // Dueling: locked with an opponent — stand and trade blows until the timer
    // resolves the math (see combat pass). Partner died elsewhere? Resume.
    if (t.duelWith) {
      if (t.duelWith.dead) { t.duelWith = null; t.dueling = false; }
      else {
        t.dueling = true; t.moving = false;
        if (t.atk > 0) {
          t.atk -= dt;
          if (!t.struck && t.atk <= .18) {          // blow lands: sparks + hit-react
            t.struck = true;
            const mx = (t.x + t.duelWith.x) / 2, my = (t.y + t.duelWith.y) / 2;
            burst(mx, my, '#fff', 4, 160); ring(mx, my, '#ffe14d');
            t.duelWith.hit = .2;
          }
        } else {
          t.atkcd -= dt;
          if (t.atkcd <= 0) { t.atk = .36; t.struck = false; t.atkcd = .55 + Math.random() * .3; }
        }
        continue;
      }
    } else t.dueling = false;
    // Target acquisition: chase the nearest living enemy in this lane (EITHER
    // direction) — so defenders turn around for invaders that slipped past —
    // and only march on towers when no enemy is near.
    let foe = null, fd = 1e9;
    for (const o of S.troops) {
      if (o.dead || o.side === t.side || o.lane !== t.lane) continue;
      const d = Math.abs(o.y - t.y);
      if (d < fd) { fd = d; foe = o; }
    }
    if (foe && fd < 260 && fd > 42) {
      const chaseDir = Math.sign(foe.y - t.y);
      t.y += chaseDir * (t.side === 'foe' ? SPEED * _cfg.foeSpeed : SPEED) * dt; t.moving = true; t.walk += dt * 8; t.atk = 0; t.atkcd = .25;
      t.dust -= dt; if (t.dust <= 0) { dust(t.x, t.y + (46 + t.maxval * 10) * 0.46); t.dust = .3; }
      continue;                                  // combat pass resolves on contact
    }
    const tw = oppTower(t.side, t.lane);
    if (!tw) continue;
    const dir = t.side === 'you' ? -1 : 1, stopY = tw.y - dir * 60;
    const inRange = !((dir < 0 && t.y > stopY) || (dir > 0 && t.y < stopY));
    if (!inRange) {
      t.y += dir * (t.side === 'foe' ? SPEED * _cfg.foeSpeed : SPEED) * dt; t.moving = true; t.walk += dt * 8; t.atk = 0; t.atkcd = .25;
      t.dust -= dt; if (t.dust <= 0) { dust(t.x, t.y + (46 + t.maxval * 10) * 0.46); t.dust = .3; }
    } else {
      t.moving = false;
      if (t.atk > 0) {
        t.atk -= dt;
        if (!t.struck && t.atk <= .18) {
          t.struck = true; tw.hp -= t.val; tw.flash = .3;
          const iy = tw.y - dir * 40;
          popup(tw.x, iy, '-' + t.val, '#fff'); burst(tw.x, iy, '#fff', 9, 200); ring(tw.x, iy, '#ffe14d');
          S.shake = Math.max(S.shake, tw.kind === 'king' ? .3 : .18);
          if (tw.hp <= 0) { tw.dead = true; towerFx(tw); }
        }
      } else {
        t.atkcd -= dt;
        if (t.atkcd <= 0) { t.atk = .36; t.struck = false; t.atkcd = .9; }
      }
    }
  }

  // troop-vs-troop combat: meeting troops LOCK INTO A DUEL (trade animated blows
  // ~1.7s), THEN the math resolves: subtraction; equal numbers annihilate.
  for (let i = 0; i < S.troops.length; i++) {
    const a = S.troops[i]; if (a.dead || a.side !== 'you' || a.grabbed) continue;
    // resolve an expired duel
    if (a.duelWith && !a.duelWith.dead) {
      a.duelT -= dt;
      if (a.duelT <= 0) {
        const b = a.duelWith;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        ring(cx, cy, '#fff'); burst(cx, cy, '#fff', 8, 180);
        if (a.val === b.val) { kill(a); kill(b); popup(cx, cy, '0', '#fff'); }
        else if (a.val > b.val) { a.val -= b.val; a.flash = .25; a.hit = .26; kill(b); popup(a.x, a.y - 40, a.val, '#bff'); a.duelWith = null; a.dueling = false; }
        else { b.val -= a.val; b.flash = .25; b.hit = .26; kill(a); popup(b.x, b.y - 40, b.val, '#fbb'); b.duelWith = null; b.dueling = false; }
      }
      continue;
    }
    // pair up free troops that meet
    for (let j = 0; j < S.troops.length; j++) {
      const b = S.troops[j]; if (b.dead || b.side !== 'foe' || b.lane !== a.lane || b.duelWith || b.grabbed) continue;
      if (Math.abs(a.y - b.y) < 48) {
        a.duelWith = b; b.duelWith = a;
        a.duelT = 1.7;
        a.atk = .36; a.struck = false; a.atkcd = .8;          // strike immediately
        b.atk = 0; b.struck = false; b.atkcd = .3;            // counter-swing offset
        break;
      }
    }
  }

  towerFire(dt);   // towers shoot nearby enemies

  decay(dt);
  S.troops = S.troops.filter(t => !(t.dead && t.dying <= 0));
  const fk = S.towers.find(t => t.kind === 'king' && t.side === 'foe');
  const yk = S.towers.find(t => t.kind === 'king' && t.side === 'you');
  if (fk.dead) S.over = 'WIN'; else if (yk.dead) S.over = 'LOSE';
}

function decay(dt) {
  for (const p of S.parts) {
    if (p.ring) { p.r += dt * 230; p.life -= dt; }
    else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 480 * dt; p.life -= dt; if (p.chunk) p.rot += p.vr * dt; }
  }
  S.parts = S.parts.filter(p => p.life > 0);
  for (const d of S.decals) d.life -= dt;
  S.decals = S.decals.filter(d => d.life > 0);
  for (const q of S.pops) { q.y += q.vy * dt; q.life -= dt; }
  S.pops = S.pops.filter(q => q.life > 0);
}
