// src/render3d.js — three.js renderer (Epic E10). Drop-in replacement for render2d.js:
// exports the same API (initRender, render, toWorld, worldToScreen, cardRect) and reads
// the same battle state S. battle.js/gates.js/arenas.js are unchanged.
//
// World mapping: battle sim coords (760x1180, y down) -> 3D ground plane.
//   X3 = (x - 380) / U,  Z3 = (y - 540) / U   (U = 55 world-units per 3D unit)
// Camera is a portrait CR-style tilt: player castle near/bottom, enemy far/top.
//
// Cards/elixir/banner are DOM (src/hud3d.js). Deaths are kablooie particle bursts
// (matches battle's fast 0.16s dying window) rather than slow death clips.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { LANE, RIVER_T, RIVER_B, PANEL_Y } from '../data/units.js';

// Anisotropic mapping: X is stretched more than Z so the lanes spread apart and
// the world uses the screen's width instead of cramming into a center strip.
const UX = 42, UZ = 48;                         // battle px per world unit
const bx = x => (x - 380) / UX;                 // battle -> world X
const bz = y => (y - 540) / UZ;                 // battle -> world Z

// unit sprite id -> 3D model + attack clip
const MODEL3D = {
  unit_02: { glb: 'Knight',    atk: 'Melee_1H_Attack_Chop' },   // Knight (4)
  unit_03: { glb: 'Ranger',    atk: 'Melee_1H_Attack_Stab' },   // Archer (3)
  unit_05: { glb: 'Barbarian', atk: 'Melee_2H_Attack_Chop' },   // Spear (5)
  unit_01: { glb: 'Mage',      atk: 'Melee_2H_Attack_Spin' },   // Wizard (7)
  unit_20: { glb: 'Skeleton_Minion',  atk: 'Melee_Unarmed_Attack_Punch_A' }, // 2
  unit_15: { glb: 'Skeleton_Rogue',   atk: 'Melee_Dualwield_Attack_Stab' },  // 3
  unit_18: { glb: 'Skeleton_Warrior', atk: 'Melee_1H_Attack_Chop' },         // 4
  unit_17: { glb: 'Skeleton_Mage',    atk: 'Melee_2H_Attack_Spin' },         // 5
  unit_16: { glb: 'Skeleton_Rogue',   atk: 'Melee_Dualwield_Attack_Slice' }, // 6
  unit_13: { glb: 'Skeleton_Mage',    atk: 'Melee_2H_Attack_Spin' },         // 7
  unit_14: { glb: 'Skeleton_Warrior', atk: 'Melee_2H_Attack_Chop' },         // 8
};

let scene, cam, ren, raycaster, groundPlane, clock;
let assets = { chars: {}, clips: {} }, ready = false;
let towersBuilt = false, towerVis = new Map(), troopVis = new Map();
let partVis = new Map(), matCache = {};

export function initRender(canvas) {
  ren = new THREE.WebGLRenderer({ canvas, antialias: true });
  ren.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  ren.shadowMap.enabled = true;
  ren.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd0ff);
  scene.fog = new THREE.Fog(0x8fd0ff, 30, 70);

  cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 120);
  raycaster = new THREE.Raycaster();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x668844, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(9, 16, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
  scene.add(sun);

  buildField();
  resize(); addEventListener('resize', resize);
  loadAssets();
}

function resize() {
  ren.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight;
  // Fit by WHICHEVER axis binds: width on portrait (tablet), depth on landscape
  // (desktop). No fat minimum distance — a landscape window gets a close camera
  // instead of a tiny field floating in blank green margins.
  const vF = Math.tan((cam.fov / 2) * Math.PI / 180);
  const fitW = 9.5 / (vF * cam.aspect) * 0.66;     // field half-width ~9.0 + margin
  const fitD = 10.0 / vF * 0.66;                   // field half-depth ~9.3 (tilt-foreshortened)
  const dist = Math.max(9.0, fitW, fitD);
  // slightly oblique CR tilt, field shifted up so the HUD doesn't cover the castle
  cam.position.set(0.9, dist * 0.9, dist * 0.98);
  cam.lookAt(0, 0, -1.6);
  cam.updateProjectionMatrix();
}

// ---- static field ----
function buildField() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80),
    new THREE.MeshLambertMaterial({ color: 0x6db33a }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // lanes (lighter strips)
  for (const lx of LANE) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 16),
      new THREE.MeshLambertMaterial({ color: 0x86c457 }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(bx(lx), 0.01, bz(560));
    lane.receiveShadow = true; scene.add(lane);
  }
  // river spans the whole visible width
  const river = new THREE.Mesh(new THREE.PlaneGeometry(30, (RIVER_B - RIVER_T) / UZ + 0.4),
    new THREE.MeshLambertMaterial({ color: 0x3aa5e0 }));
  river.rotation.x = -Math.PI / 2; river.position.set(0, 0.02, bz((RIVER_T + RIVER_B) / 2));
  scene.add(river);
}

// ---- assets ----
function loadGlb(loader, url) { return new Promise((res, rej) => loader.load(url, res, undefined, rej)); }

async function loadAssets() {
  const loader = new GLTFLoader();
  const names = [...new Set(Object.values(MODEL3D).map(m => m.glb))];
  const FOREST = ['Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_3_A_Color1', 'Tree_4_A_Color1',
    'Bush_1_A_Color1', 'Bush_2_A_Color1', 'Rock_1_A_Color1', 'Rock_3_A_Color1',
    'Grass_1_A_Color1', 'Grass_2_A_Color1'];
  const PROPS_GLTF = ['barrel', 'crate_A_big', 'flag_blue', 'flag_red', 'fence_wood_straight', 'bucket_water'];
  const PROPS_GLB = ['chest_common', 'barrelDark', 'banner', 'bench'];
  const [libs, chars, env, forest, propsA, propsB] = await Promise.all([
    Promise.all(['Rig_Medium_MovementBasic', 'Rig_Medium_General', 'Rig_Medium_CombatMelee']
      .map(n => loadGlb(loader, 'assets/game/anim/' + n + '.glb'))),
    Promise.all(names.map(n => loadGlb(loader, 'assets/game/chars/' + n + '.glb'))),
    Promise.all(['castle', 'watchtower', 'bridge', 'detail_treeA', 'detail_treeB', 'detail_forestA', 'detail_rocks', 'detail_hill']
      .map(n => loadGlb(loader, 'assets/game/env/' + n + '.gltf.glb'))),
    Promise.all(FOREST.map(n => loadGlb(loader, 'assets/game/env/' + n + '.gltf'))),
    Promise.allSettled(PROPS_GLTF.map(n => loadGlb(loader, 'assets/game/env/' + n + '.gltf'))),
    Promise.allSettled(PROPS_GLB.map(n => loadGlb(loader, 'assets/game/env/' + n + '.gltf.glb'))),
  ]);
  for (const lib of libs) for (const c of lib.animations) assets.clips[c.name] = c;
  names.forEach((n, i) => { assets.chars[n] = chars[i].scene; });
  assets.env = {};
  ['castle', 'watchtower', 'bridge', 'treeA', 'treeB', 'forest', 'rocks', 'hill']
    .forEach((k, i) => { assets.env[k] = env[i].scene; });
  assets.forest = forest.map(g => g.scene);
  assets.props = {};
  [...PROPS_GLTF, ...PROPS_GLB].forEach((k, i) => {
    const r = [...propsA, ...propsB][i];
    if (r.status === 'fulfilled') assets.props[k] = r.value.scene;   // props are optional decor
  });
  decorate();
  ready = true;
}

function place(model, x, z, s, ry) {
  const o = SkeletonUtils.clone(model);
  o.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  o.scale.setScalar(s); o.position.set(x, 0, z); o.rotation.y = ry || 0;
  scene.add(o); return o;
}

function decorate() {
  const e = assets.env, P = assets.props;
  const rng = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5; return s - Math.floor(s); };
  // bridges over the river at each lane
  for (const lx of LANE) place(e.bridge, bx(lx), bz(530), 1.5, Math.PI / 2);
  // builder-pack landmarks in the side meadows
  place(e.forest, -7.6, 3.5, 1.3); place(e.hill, 7.9, -6.5, 1.3);
  place(e.rocks, -7.2, -7.5, 1.2); place(e.forest, 8.1, 2.5, 1.2);
  // dense forest-pack scatter: side meadows + back bands, out to the screen edges
  const F = assets.forest;
  for (let i = 0; i < 78; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    let x, z;
    if (i < 52) { x = side * (6.4 + rng(i, 1) * 7.5); z = -12 + (i / 52) * 2 * 24 + rng(i, 2) * 1.6; }
    else { x = -13 + rng(i, 3) * 26; z = (i % 2 ? -12.5 : 11.6) + rng(i, 4) * 1.6; }
    const model = F[Math.floor(rng(i, 5) * F.length)];
    // forest-pack models are authored much larger than builder-pack buildings
    const s = 0.34 + rng(i, 6) * 0.22;
    place(model, x, z, s, rng(i, 7) * 6.28);
  }
  // grass tufts inside the field (subtle, non-blocking)
  for (let i = 0; i < 20; i++) {
    const g = F[8 + (i % 2)];
    place(g, -7 + rng(i, 8) * 14, -8 + rng(i, 9) * 15, 0.3 + rng(i, 10) * 0.18, rng(i, 11) * 6.28);
  }
  // prop dressing (skips anything that failed to load)
  const put = (key, x, z, s, ry) => { if (P[key]) place(P[key], x, z, s, ry); };
  // your castle yard: crates, barrels, blue flags
  put('crate_A_big', -2.6, 8.6, 0.5); put('barrel', -3.3, 8.9, 0.5); put('barrel', -3.0, 8.2, 0.5);
  put('flag_blue', 2.7, 8.4, 0.6); put('flag_blue', -2.2, 7.6, 0.6); put('bucket_water', 3.2, 8.9, 0.5);
  put('bench', 3.6, 8.0, 1.0, Math.PI / 2);
  // enemy castle yard: dark barrels, red flags, treasure
  put('barrelDark', -2.8, -9.2, 1.0); put('barrelDark', -3.3, -8.7, 1.0);
  put('flag_red', 2.7, -8.9, 0.6); put('flag_red', -2.3, -9.4, 0.6);
  put('chest_common', 3.1, -9.1, 1.0, Math.PI);
  put('banner', 0.0, -10.4, 1.2);
  // fences along the river banks outside the bridges
  for (const fx of [-5.6, -4.2, 4.2, 5.6]) {
    put('fence_wood_straight', fx, bz(RIVER_T) - 0.5, 0.55);
    put('fence_wood_straight', fx, bz(RIVER_B) + 0.5, 0.55);
  }
}

// ---- towers (built lazily once assets are ready; rebuilt when battle resets) ----
function syncTowers(S) {
  if (!ready) return;
  // detect reset: any tower object not in our map -> rebuild all
  let stale = towerVis.size !== S.towers.length;
  if (!stale) for (const t of S.towers) if (!towerVis.has(t)) { stale = true; break; }
  if (stale) {
    for (const [, v] of towerVis) scene.remove(v.obj);
    towerVis.clear();
    for (const t of S.towers) {
      const model = t.kind === 'king' ? assets.env.castle : assets.env.watchtower;
      const s = t.kind === 'king' ? 1.5 : 1.15;
      const obj = place(model, bx(t.x), bz(t.y), s, t.side === 'foe' ? Math.PI : 0);
      towerVis.set(t, { obj, dead: false });
    }
  }
  for (const [t, v] of towerVis) {
    if (t.dead && !v.dead) {
      v.dead = true;
      v.obj.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiplyScalar(0.35); } });
      v.obj.scale.multiplyScalar(0.8); v.obj.rotation.z = 0.12;
    }
    // hit flash
    if (!t.dead && t.flash > 0) {
      v.obj.traverse(n => { if (n.isMesh && n.material.emissive) n.material.emissive.setRGB(t.flash * 1.6, 0, 0); });
    } else if (!t.dead) {
      v.obj.traverse(n => { if (n.isMesh && n.material.emissive) n.material.emissive.setRGB(0, 0, 0); });
    }
  }
}

// ---- number badges (canvas-texture sprites) ----
function makeBadge(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 52, 0, 6.28); x.fillStyle = color; x.fill();
  x.lineWidth = 10; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff'; x.font = '900 60px Trebuchet MS';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.renderOrder = 99; return sp;
}

// ---- troops ----
function setAnim(v, name, loop) {
  if (v.anim === name) return;
  const clip = assets.clips[name]; if (!clip) return;
  const next = v.mixer.clipAction(clip);
  if (v.action) v.action.fadeOut(0.15);
  next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = !loop;
  next.fadeIn(0.15).play();
  v.action = next; v.anim = name;
}

function syncTroops(S, dt) {
  if (!ready) return;
  const seen = new Set();
  for (const t of S.troops) {
    seen.add(t);
    let v = troopVis.get(t);
    if (!v && !t.dead) {
      const def = MODEL3D[t.spr] || MODEL3D.unit_20;
      const obj = SkeletonUtils.clone(assets.chars[def.glb]);
      obj.traverse(n => { if (n.isMesh) n.castShadow = true; });
      const scale = 0.5 + t.maxval * 0.085;             // size = magnitude
      obj.scale.setScalar(scale);
      scene.add(obj);
      const mixer = new THREE.AnimationMixer(obj);
      const badge = makeBadge(t.val, t.side === 'you' ? '#2b7de0' : '#e23b3b');
      badge.scale.setScalar(0.62);
      badge.position.y = 2.35; obj.add(badge);
      v = { obj, mixer, badge, badgeVal: t.val, action: null, anim: null, atkDef: def };
      troopVis.set(t, v);
      setAnim(v, 'Spawn_Ground', false);
      setTimeout(() => { if (troopVis.has(t)) setAnim(v, 'Walking_A', true); }, 700);
    }
    if (!v) continue;
    if (t.dead) {                                        // kablooie + remove
      kablooie(v.obj.position, t.side === 'you' ? 0x2b7de0 : 0xe23b3b);
      scene.remove(v.obj); troopVis.delete(t); continue;
    }
    v.obj.position.set(bx(t.x), 0, bz(t.y));
    // Quarter-turn so the player's characters show their faces while marching north
    v.obj.rotation.y = t.side === 'you' ? Math.PI * 0.72 : -0.2;
    if (v.badgeVal !== t.val) {                          // number changed after combat
      v.obj.remove(v.badge);
      v.badge = makeBadge(t.val, t.side === 'you' ? '#2b7de0' : '#e23b3b');
      v.badge.scale.setScalar(0.62); v.badge.position.y = 2.35; v.obj.add(v.badge);
      v.badgeVal = t.val;
    }
    // animation state machine (after spawn finishes)
    if (v.anim !== 'Spawn_Ground' || t.atk > 0) {
      if (t.atk > 0) setAnim(v, v.atkDef.atk, false);
      else if (t.moving) setAnim(v, 'Walking_A', true);
      else setAnim(v, 'Idle_A', true);
    }
    v.mixer.update(dt);
  }
  for (const [t, v] of troopVis) {
    if (!seen.has(t)) { scene.remove(v.obj); troopVis.delete(t); }
  }
}

// ---- particles: render battle's S.parts as billboards; extra 3D bursts on death ----
function mat(color) {
  if (!matCache[color]) matCache[color] = new THREE.SpriteMaterial({ color, depthTest: false });
  return matCache[color];
}
const localParts = [];
function kablooie(pos, color) {
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(mat(i % 3 ? color : 0xffcf4d));
    sp.scale.setScalar(0.22 + Math.random() * 0.2);
    sp.position.copy(pos); sp.position.y += 0.8;
    scene.add(sp);
    const a = Math.random() * 6.28, s = 2.5 + Math.random() * 4;
    localParts.push({ sp, vx: Math.cos(a) * s, vy: 2.5 + Math.random() * 3.5, vz: Math.sin(a) * s, life: 0.65 });
  }
}
function syncParts(S, dt) {
  // battle's own 2D particles -> ground-level sparkle billboards
  const seen = new Set();
  for (const p of S.parts) {
    if (p.ring) continue;                                 // rings skipped in 3D (kablooie covers it)
    seen.add(p);
    let sp = partVis.get(p);
    if (!sp) {
      sp = new THREE.Sprite(mat(p.color));
      sp.scale.setScalar(p.chunk ? 0.18 : 0.12);
      scene.add(sp); partVis.set(p, sp);
    }
    sp.position.set(bx(p.x), 0.5, bz(p.y));
    sp.material.opacity = Math.max(0, Math.min(1, p.life * 1.6));
  }
  for (const [p, sp] of partVis) if (!seen.has(p)) { scene.remove(sp); partVis.delete(p); }
  // local 3D bursts
  for (let i = localParts.length - 1; i >= 0; i--) {
    const q = localParts[i];
    q.life -= dt;
    if (q.life <= 0) { scene.remove(q.sp); localParts.splice(i, 1); continue; }
    q.vy -= 9 * dt;
    q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt;
    if (q.sp.position.y < 0.05) q.sp.position.y = 0.05;
    q.sp.material.opacity = Math.min(1, q.life * 2);
  }
}

// ---- public API (matches render2d.js) ----
export function render(S) {
  const dt = Math.min(0.05, clock.getDelta());
  syncTowers(S);
  syncTroops(S, dt);
  syncParts(S, dt);
  // camera shake
  if (S.shake > 0) {
    cam.position.x += (Math.random() - .5) * S.shake * 0.5;
    cam.position.y += (Math.random() - .5) * S.shake * 0.3;
  }
  ren.render(scene, cam);
}

/** toWorld — screen px -> battle coords, by raycasting to the ground plane. */
export function toWorld(clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(groundPlane, hit);
  return { x: hit.x * UX + 380, y: hit.z * UZ + 540 };
}

/** worldToScreen — battle coords -> CSS px (used by gates.js to anchor cards). */
export function worldToScreen(x, y) {
  const v = new THREE.Vector3(bx(x), 1.6, bz(y)).project(cam);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}

/** cardRect — cards are DOM in 3D (hud3d.js); return offscreen rects so
 *  input.js's canvas hit-test never matches. */
export function cardRect() { return { x: -99999, y: -99999, w: 0, h: 0 }; }
