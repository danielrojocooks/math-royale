// Battle simulation: all game state and rules. NO rendering, NO DOM, NO canvas.
// render2d.js reads S to draw; input.js calls the exported actions.
import { LANE, RIVER_B, DEPLOY_MIN, DEPLOY_MAX, SPEED, DECK, FOES, WORDS } from '../data/units.js';

// ---- arena configuration (set by arenas.js via configureBattle before reset()) ----
// foeMaxVal: upper bound on villain val the AI may spawn (default = uncapped).
// bossSpawn: { spr, val } to drop on the foe side 1s after match start, or null.
let _cfg = { foeMaxVal: Infinity, bossSpawn: null };

/**
 * configureBattle — called by the arena system before reset() to set match parameters.
 * @param {{ foeMaxVal?: number, bossSpawn?: {spr:string, val:number}|null }} opts
 */
export function configureBattle({ foeMaxVal, bossSpawn } = {}) {
  _cfg = {
    foeMaxVal: foeMaxVal ?? Infinity,
    bossSpawn: bossSpawn ?? null,
  };
}

// ---- state (read by render, mutated only here) ----
export const S = {
  towers: [], troops: [], parts: [], decals: [], pops: [],
  elixir: 5, foeElixir: 5, foeTimer: 2.5,
  sel: -1, shake: 0, over: null, T: 0,
  paused: false,  // set true while a gate modal is open; update() skips sim
};

function tower(side, kind, x, y, lane, hp) {
  return { side, kind, x, y, lane, hp, maxhp: hp, flash: 0, dead: false };
}

export function reset() {
  // Castles spread further apart -> longer marches, more board to play
  S.towers = [
    tower('foe', 'prin', LANE[0], 205, 0, 14), tower('foe', 'prin', LANE[1], 205, 1, 14), tower('foe', 'king', 380, 65, -1, 24),
    tower('you', 'prin', LANE[0], 750, 0, 14), tower('you', 'prin', LANE[1], 750, 1, 14), tower('you', 'king', 380, 915, -1, 24),
  ];
  S.troops = []; S.parts = []; S.decals = []; S.pops = [];
  S.elixir = 5; S.foeElixir = 5; S.foeTimer = 2.5;
  S.sel = -1; S.shake = 0; S.over = null; S.T = 0; S.paused = false;

  // ── Boss spawn: drop the boss unit on the foe side ~1s after match start.
  if (_cfg.bossSpawn) {
    const { spr, val } = _cfg.bossSpawn;
    setTimeout(() => {
      if (S.over) return; // match may have already ended (edge case)
      mkTroop('foe', Math.floor(Math.random() * 2), 250, val, spr);
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

function deathFx(t) {
  const side = t.side === 'you' ? '#2b7de0' : '#e23b3b';
  ring(t.x, t.y, '#fff'); chunks(t.x, t.y, ['#8b1a1a', '#c0392b', side, '#ffcf4d', '#fff'], 18); splat(t.x, t.y + 12, '#7a1414');
  S.shake = Math.max(S.shake, .28); popup(t.x, t.y - 16, WORDS[Math.floor(Math.random() * WORDS.length)], '#ffe14d', true);
}
function towerFx(tw) {
  ring(tw.x, tw.y, '#fff'); chunks(tw.x, tw.y, ['#9aa3ad', '#6b7480', '#4a525c', '#ffcf4d'], 26);
  splat(tw.x, tw.y + 18, '#5a5246'); S.shake = Math.max(S.shake, .5); popup(tw.x, tw.y - 30, 'KABLOOIE!', '#fff', true);
}

// ---- troops ----
function mkTroop(side, lane, y, val, spr, xoff) {
  S.troops.push({
    side, lane, x: LANE[lane] + (xoff || 0), y, val, maxval: val, spr,
    pop: 0, flash: 0, hit: 0, atk: 0, atkcd: .3, struck: false,
    walk: Math.random() * 6.28, dust: 0, moving: false, dead: false, dying: 0,
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

// ---- player actions (called by input.js) ----
export function trySelectCard(i) {
  if ((DECK[i].cost ?? DECK[i].val) <= S.elixir) { S.sel = i; return true; }
  S.shake = .12; return false;
}
export function tryDeploy(x, y) {
  // Anywhere on YOUR half counts (CR rule); the drop point clamps into the deploy band.
  if (S.sel < 0 || y < RIVER_B + 10) return false;
  const d = DECK[S.sel];
  const cost = d.cost ?? d.val;
  if (cost > S.elixir) return false;
  S.elixir -= cost;
  const lane = x < 380 ? 0 : 1;
  const dy = Math.max(DEPLOY_MIN, Math.min(DEPLOY_MAX, y));
  const n = d.count ?? 1;
  // squads fan out in a small formation (offsets are visual; lane combat unchanged)
  for (let i = 0; i < n; i++) {
    const xoff = (i - (n - 1) / 2) * 30;
    const yoff = (i % 2) * 34;
    mkTroop('you', lane, Math.min(DEPLOY_MAX, dy + yoff), d.val, d.spr, xoff);
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

// ---- simulation ----
export function update(dt) {
  S.T += dt;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  if (S.over) { decay(dt); return; }
  if (S.paused) return;  // gate is open — freeze simulation (decay also skipped for clean freeze)
  S.elixir = Math.min(10, S.elixir + dt / 1.6);
  S.foeElixir = Math.min(10, S.foeElixir + dt / 1.6);

  // enemy AI: deploy a random affordable villain every few seconds.
  // foeMaxVal cap (from configureBattle) restricts which villains may spawn.
  S.foeTimer -= dt;
  if (S.foeTimer <= 0) {
    const aff = FOES.filter(f => f.val <= S.foeElixir && f.val <= _cfg.foeMaxVal);
    if (aff.length) {
      const f = aff[Math.floor(Math.random() * aff.length)];
      S.foeElixir -= f.val;
      mkTroop('foe', Math.floor(Math.random() * 2), 250, f.val, f.spr);
      S.foeTimer = 2.6 + Math.random() * 2.4;
    } else S.foeTimer = .6;
  }

  // tower hit-flash decay (was never decremented — towers stayed red forever)
  for (const tw of S.towers) if (tw.flash > 0) tw.flash -= dt;

  // march + tower attacks (wind-up -> strike at 50% through the swing)
  for (const t of S.troops) {
    if (t.flash > 0) t.flash -= dt;
    if (t.hit > 0) t.hit -= dt;
    if (t.dead) { t.dying -= dt; continue; }
    if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 5);
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
      t.y += chaseDir * SPEED * dt; t.moving = true; t.walk += dt * 8; t.atk = 0; t.atkcd = .25;
      t.dust -= dt; if (t.dust <= 0) { dust(t.x, t.y + (46 + t.maxval * 10) * 0.46); t.dust = .3; }
      continue;                                  // combat pass resolves on contact
    }
    const tw = oppTower(t.side, t.lane);
    if (!tw) continue;
    const dir = t.side === 'you' ? -1 : 1, stopY = tw.y - dir * 60;
    const inRange = !((dir < 0 && t.y > stopY) || (dir > 0 && t.y < stopY));
    if (!inRange) {
      t.y += dir * SPEED * dt; t.moving = true; t.walk += dt * 8; t.atk = 0; t.atkcd = .25;
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

  // troop-vs-troop combat: subtraction; equal numbers annihilate
  for (let i = 0; i < S.troops.length; i++) {
    const a = S.troops[i]; if (a.dead || a.side !== 'you') continue;
    for (let j = 0; j < S.troops.length; j++) {
      const b = S.troops[j]; if (b.dead || b.side !== 'foe' || b.lane !== a.lane) continue;
      if (Math.abs(a.y - b.y) < 48) {
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        ring(cx, cy, '#fff'); burst(cx, cy, '#fff', 8, 180);
        if (a.val === b.val) { kill(a); kill(b); popup(cx, cy, '0', '#fff'); }
        else if (a.val > b.val) { a.val -= b.val; a.flash = .25; a.hit = .26; kill(b); popup(a.x, a.y - 40, a.val, '#bff'); }
        else { b.val -= a.val; b.flash = .25; b.hit = .26; kill(a); popup(b.x, b.y - 40, b.val, '#fbb'); }
      }
    }
  }

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
