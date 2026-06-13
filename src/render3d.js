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

// unit sprite id -> 3D model + attack clip + weapons for the handslot sockets
const MODEL3D = {
  unit_02: { glb: 'Knight',    atk: 'Melee_1H_Attack_Chop', r: 'sword_A', l: 'shield_A' }, // Knight (4)
  unit_03: { glb: 'Ranger',    atk: 'Melee_1H_Attack_Stab', l: 'bow_A_withString' },       // Archer (3)
  unit_05: { glb: 'Barbarian', atk: 'Melee_2H_Attack_Chop', r: 'axe_A' },                  // Spear (5)
  unit_01: { glb: 'Mage',      atk: 'Melee_2H_Attack_Spin', r: 'staff_A' },                // Wizard (7)
  unit_20: { glb: 'Skeleton_Minion',  atk: 'Melee_Unarmed_Attack_Punch_A', r: 'dagger_B' },              // 2
  unit_15: { glb: 'Skeleton_Rogue',   atk: 'Melee_Dualwield_Attack_Stab', r: 'dagger_A', l: 'dagger_B' },// 3
  unit_18: { glb: 'Skeleton_Warrior', atk: 'Melee_1H_Attack_Chop', r: 'sword_B', l: 'shield_B' },        // 4
  unit_17: { glb: 'Skeleton_Mage',    atk: 'Melee_2H_Attack_Spin', r: 'staff_B' },                       // 5
  unit_16: { glb: 'Skeleton_Rogue',   atk: 'Melee_Dualwield_Attack_Slice', r: 'dagger_A', l: 'dagger_A' },// 6
  unit_13: { glb: 'Skeleton_Mage',    atk: 'Melee_2H_Attack_Spin', r: 'staff_A' },                       // 7
  unit_14:    { glb: 'Skeleton_Warrior', atk: 'Melee_2H_Attack_Chop', r: 'sword_B', l: 'shield_B' },        // 8
  unit_rogue: { glb: 'Rogue', atk: 'Melee_Dualwield_Attack_Stab', r: 'dagger_A', l: 'dagger_B' },
  unit_04:    { glb: 'Mage',  atk: 'Melee_2H_Attack_Spin', r: 'staff_B' },
};
const WEAPONS = ['sword_A', 'sword_B', 'shield_A', 'shield_B', 'bow_A_withString',
  'axe_A', 'staff_A', 'staff_B', 'dagger_A', 'dagger_B'];

let scene, cam, ren, raycaster, groundPlane, clock;
let assets = { chars: {}, clips: {} }, ready = false;
let readyResolve; const readyPromise = new Promise(r => { readyResolve = r; });

// ---- arena themes: sky/light/ground/flora per arena (applyTheme from main.js) ----
const DEFAULT_THEME = {
  sky: 0x8fd0ff, fog: 0x8fd0ff, ground: 0x6db33a, lane: 0x86c457, river: 0x3aa5e0,
  hemi: 1.15, sun: 2.0, sunColor: 0xffffff, flora: 'green',
  riverShape: 'straight', bridges: true,   // per-arena scene layout
};
let theme = { ...DEFAULT_THEME };
let themeGroup = null, groundMat, laneMats = [], hemiLight, sunLight, riverObj = null;
const RIVER_AMP = 3.0, RIVER_FREQ = 0.5;   // snake-river wave (depth swing / frequency)

export function applyTheme(t) {
  theme = { ...DEFAULT_THEME, ...(t || {}) };
  if (ready) rebuildTheme();
}
function rebuildTheme() {
  scene.background.set(theme.sky);
  scene.fog.color.set(theme.fog);
  groundMat.color.set(theme.ground);
  for (const m of laneMats) m.color.set(theme.lane);
  // river: rebuild per arena (straight band / snake / none)
  if (riverObj) { scene.remove(riverObj); riverObj.geometry?.dispose(); riverObj.material?.dispose(); riverObj = null; }
  riverObj = buildRiver(theme);
  if (riverObj) scene.add(riverObj);
  hemiLight.intensity = theme.hemi;
  sunLight.intensity = theme.sun;
  sunLight.color.set(theme.sunColor);
  if (themeGroup) scene.remove(themeGroup);
  themeGroup = new THREE.Group();
  scene.add(themeGroup);
  decorate();
}
let towersBuilt = false, towerVis = new Map(), troopVis = new Map();
let partVis = new Map(), matCache = {};
let cannonObj = null, cannonProjectiles = [];   // cannon on your king + in-flight shots
let dragons = [];                                // active fly-in dragons (fire-breath on solve)
let currentWeapon = 'cannon';                    // per-arena: 'cannon' or 'dragon' (set by main.js)
let tentVis = new Map();                          // river tentacle hazard visuals

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

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x668844, 1.15);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
  sunLight.position.set(9, 16, 7); sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -16; sunLight.shadow.camera.right = 16;
  sunLight.shadow.camera.top = 16; sunLight.shadow.camera.bottom = -16;
  scene.add(sunLight);

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
  const portrait = cam.aspect < 1;
  // Portrait (the tablet, primary view) zooms in: a tighter half-width target
  // pulls the camera closer so the lanes/castles fill the screen instead of
  // sitting in green side margins. Landscape stays depth-bound (target unused).
  const halfW = portrait ? 7.4 : 9.5;
  const fitW = halfW / (vF * cam.aspect) * 0.66;
  const fitD = 10.8 / vF * 0.66;                   // full depth incl BOTH castles
  const dist = Math.max(9.0, fitW, fitD);
  // slightly oblique CR tilt, centered so both castles are on screen
  // (landscape HUD docks right, so the bottom of the screen is usable field).
  // Portrait sits a touch higher and aims further downrange so YOUR near castle
  // shrinks a bit and the enemy castle reads bigger (more balanced framing).
  const camY = portrait ? dist * 0.98 : dist * 0.9;
  const lookZ = portrait ? -2.4 : -1.0;
  cam.position.set(0.9, camY, dist * 0.98);
  cam.lookAt(0, 0, lookZ);
  cam.updateProjectionMatrix();
}

// ---- static field ----
function buildField() {
  groundMat = new THREE.MeshLambertMaterial({ color: 0x6db33a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // lanes (lighter strips)
  for (const lx of LANE) {
    const m = new THREE.MeshLambertMaterial({ color: 0x86c457 });
    laneMats.push(m);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 16), m);
    lane.rotation.x = -Math.PI / 2; lane.position.set(bx(lx), 0.01, bz(560));
    lane.receiveShadow = true; scene.add(lane);
  }
  // river is built per-arena in rebuildTheme (shape varies: straight / snake / none)
}

// ---- river geometry (per-arena shape) ----
function buildRiver(t) {
  if (t.riverShape === 'none') return null;
  const color = t.river ?? 0x3aa5e0;
  if (t.riverShape === 'snake') {
    const Wd = 44, half = 1.9, segs = 64, pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const x = -Wd / 2 + (i / segs) * Wd;
      const z = Math.sin(x * RIVER_FREQ) * RIVER_AMP;
      const dz = Math.cos(x * RIVER_FREQ) * RIVER_AMP * RIVER_FREQ;
      const len = Math.hypot(1, dz), nx = -dz / len, nz = 1 / len;     // path normal in XZ
      pos.push(x + nx * half, 0.02, z + nz * half, x - nx * half, 0.02, z - nz * half);
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  }
  // straight (default): a wide flat band across the middle
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, (RIVER_B - RIVER_T) / UZ + 0.4),
    new THREE.MeshLambertMaterial({ color }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.02, bz((RIVER_T + RIVER_B) / 2));
  return m;
}

// ---- assets ----
function loadGlb(loader, url) { return new Promise((res, rej) => loader.load(url, res, undefined, rej)); }

async function loadAssets() {
  const loader = new GLTFLoader();
  const names = [...new Set(Object.values(MODEL3D).map(m => m.glb))];
  const FOREST = ['Tree_1_A_Color1', 'Tree_2_A_Color1', 'Tree_3_A_Color1', 'Tree_4_A_Color1',
    'Bush_1_A_Color1', 'Bush_2_A_Color1', 'Rock_1_A_Color1', 'Rock_3_A_Color1',
    'Grass_1_A_Color1', 'Grass_2_A_Color1', 'Tree_Bare_1_A_Color1', 'Tree_Bare_2_A_Color1'];
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
    Promise.allSettled(WEAPONS.map(n => loadGlb(loader, 'assets/game/weapons/' + n + '.gltf')))
      .then(rs => { assets.weapons = {}; rs.forEach((r, i) => { if (r.status === 'fulfilled') assets.weapons[WEAPONS[i]] = r.value.scene; }); }),
    // Dragon (MattBas, CC BY-SA 4.0; optional — game runs fine if it fails to load)
    Promise.allSettled([loadGlb(loader, 'assets/game/dragon.glb')])
      .then(rs => {
        if (rs[0].status === 'fulfilled') { assets.dragon = rs[0].value.scene; assets.dragonClips = rs[0].value.animations || []; }
        else { assets.dragon = null; assets.dragonClips = []; }
      }),
    // KayKit CC0 catapult for the tower cannon (optional; primitive fallback)
    Promise.allSettled([loadGlb(loader, 'assets/game/env/catapult.gltf')])
      .then(rs => { assets.catapult = rs[0].status === 'fulfilled' ? rs[0].value.scene : null; }),
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
  rebuildTheme();           // applies whatever theme the arena requested pre-load
  ready = true;
  readyResolve();
}

// ---- character assembly (battlefield + portraits share this) ----
function buildCharacter(def) {
  const obj = SkeletonUtils.clone(assets.chars[def.glb]);
  obj.traverse(n => { if (n.isMesh) n.castShadow = true; });
  for (const [slot, key] of [['handslot.r', def.r], ['handslot.l', def.l]]) {
    if (!key || !assets.weapons?.[key]) continue;
    let socket = null;
    obj.traverse(n => { if (n.name === slot) socket = n; });
    if (socket) {
      const w = SkeletonUtils.clone(assets.weapons[key]);
      w.traverse(n => { if (n.isMesh) n.castShadow = true; });
      socket.add(w);
    }
  }
  return obj;
}

// ---- card portraits: photograph the real 3D characters once at load ----
let portraitCache = null;
export async function getPortraits() {
  if (portraitCache) return portraitCache;
  await readyPromise;
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(160, 160);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x668844, 1.5));
  const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  const pc = new THREE.PerspectiveCamera(38, 1, .1, 20);
  pc.position.set(0, 1.5, 3.3); pc.lookAt(0, 1.0, 0);
  portraitCache = {};
  for (const [spr, def] of Object.entries(MODEL3D)) {
    try {                                                // one bad render must not poison the batch
      const obj = buildCharacter(def);
      obj.rotation.y = 0.5;                              // 3/4 face view
      const mx = new THREE.AnimationMixer(obj);          // pose out of T-pose
      if (assets.clips['Idle_A']) { mx.clipAction(assets.clips['Idle_A']).play(); mx.update(0.4); }
      sc.add(obj);
      r.render(sc, pc);
      portraitCache[spr] = r.domElement.toDataURL('image/png');
      sc.remove(obj);
    } catch (e) { console.warn('portrait failed for', spr, e); }
  }
  r.dispose();
  return portraitCache;
}

function place(model, x, z, s, ry) {
  const o = SkeletonUtils.clone(model);
  // Clone materials per instance — otherwise one tower's hit-flash emissive
  // tints every copy of the model on the field.
  o.traverse(n => {
    if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.material = n.material.clone(); }
  });
  o.scale.setScalar(s); o.position.set(x, 0, z); o.rotation.y = ry || 0;
  (themeGroup || scene).add(o); return o;
}

function decorate() {
  const e = assets.env, P = assets.props;
  const rng = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5; return s - Math.floor(s); };
  // bridges over the river at each lane (skip on open-field arenas; follow the snake)
  if (theme.bridges !== false && theme.riverShape !== 'none') {
    const snake = theme.riverShape === 'snake';
    for (const lx of LANE) {
      const wx = bx(lx);
      const wz = snake ? Math.sin(wx * RIVER_FREQ) * RIVER_AMP : bz(530);
      place(e.bridge, wx, wz, 1.5, Math.PI / 2);
    }
  }
  // builder-pack landmarks in the side meadows (kept well clear of the lanes —
  // perspective lets near-lane trees occlude units)
  place(e.forest, -9.0, 3.5, 1.3); place(e.hill, 8.8, -6.5, 1.3);
  place(e.rocks, -8.4, -7.5, 1.2); place(e.forest, 9.2, 2.5, 1.2);
  // theme-aware scatter: which models populate the world depends on the arena
  // F indexes: 0-3 trees, 4-5 bushes, 6-7 rocks, 8-9 grass, 10-11 bare trees
  const F = assets.forest;
  const FLORA = {
    green: { models: [0, 1, 2, 3, 4, 5, 6, 7], n: 78, grass: true },
    dense: { models: [0, 1, 2, 3, 4, 5], n: 112, grass: true },     // deep forest
    rocky: { models: [6, 7, 6, 7, 4], n: 92, grass: false },        // mines/canyon
    frost: { models: [10, 11, 6, 7], n: 72, grass: false },         // bare + rocks
    night: { models: [0, 1, 2, 3, 10, 11], n: 80, grass: false },   // woods + dead trees
  };
  const fl = FLORA[theme.flora] || FLORA.green;
  for (let i = 0; i < fl.n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    let x, z;
    const bandCut = Math.floor(fl.n * 0.66);
    if (i < bandCut) { x = side * (7.8 + rng(i, 1) * 6.5); z = -12 + (i / bandCut) * 24 + rng(i, 2) * 1.6; }
    else { x = -13 + rng(i, 3) * 26; z = (i % 2 ? -12.5 : 11.6) + rng(i, 4) * 1.6; }
    const model = F[fl.models[Math.floor(rng(i, 5) * fl.models.length)]];
    // forest-pack models are authored much larger than builder-pack buildings
    const s = 0.34 + rng(i, 6) * 0.22;
    place(model, x, z, s, rng(i, 7) * 6.28);
  }
  // grass tufts inside the field (green arenas only)
  if (fl.grass) for (let i = 0; i < 20; i++) {
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
  // dress the empty strip between the lanes (skip the river crossing)
  for (let i = 0; i < 8; i++) {
    const z = -7 + i * 2.0 + rng(i, 12) * 0.8;
    if (Math.abs(z + 0.2) < 1.6) continue;                 // river zone
    const m = F[Math.floor(rng(i, 13) * 8)];               // trees/bushes/rocks only
    place(m, (rng(i, 14) - 0.5) * 1.6, z, 0.26 + rng(i, 15) * 0.14, rng(i, 16) * 6.28);
  }
}

// archers standing on a tower (the visible defenders that fire the arrows)
function buildArchers(t) {
  const def = MODEL3D.unit_03;                  // Ranger w/ bow for everyone (tower archers)
  const n = t.kind === 'king' ? 2 : 1;
  const out = [];
  for (let k = 0; k < n; k++) {
    const obj = buildCharacter(def);
    obj.scale.setScalar(0.55);
    const ax = bx(t.x) + (n === 1 ? 0 : (k === 0 ? -0.55 : 0.55));
    const ay = t.kind === 'king' ? 2.4 : 1.85;
    obj.position.set(ax, ay, bz(t.y) + 0.15);
    obj.rotation.y = t.side === 'you' ? Math.PI : 0;   // face downrange
    const mixer = new THREE.AnimationMixer(obj);
    if (assets.clips['Idle_A']) mixer.clipAction(assets.clips['Idle_A']).play();
    scene.add(obj); out.push({ obj, mixer });
  }
  return out;
}

// ---- towers (built lazily once assets are ready; rebuilt when battle resets) ----
function syncTowers(S, dt) {
  if (!ready) return;
  // detect reset: any tower object not in our map -> rebuild all
  let stale = towerVis.size !== S.towers.length;
  if (!stale) for (const t of S.towers) if (!towerVis.has(t)) { stale = true; break; }
  if (stale) {
    for (const [, v] of towerVis) {
      scene.remove(v.obj); if (v.hpBadge) scene.remove(v.hpBadge);
      v.archers?.forEach(a => scene.remove(a.obj));
    }
    towerVis.clear();
    if (cannonObj) { scene.remove(cannonObj); cannonObj = null; }
    for (const t of S.towers) {
      const model = t.kind === 'king' ? assets.env.castle : assets.env.watchtower;
      const s = t.kind === 'king' ? 1.5 : 1.15;
      const obj = place(model, bx(t.x), bz(t.y), s, t.side === 'foe' ? Math.PI : 0);
      // HP number floating above the tower
      const hpBadge = makeBadge(Math.max(0, Math.ceil(t.hp)), t.side === 'you' ? '#22c24a' : '#e23b3b');
      hpBadge.scale.setScalar(1.0);
      hpBadge.position.set(bx(t.x), t.kind === 'king' ? (t.side === 'you' ? 5.6 : 3.6) : 2.9, bz(t.y));
      scene.add(hpBadge);
      towerVis.set(t, { obj, hpBadge, hpShown: Math.ceil(t.hp), dead: false, archers: buildArchers(t) });
      // mount the cannon on YOUR king tower — only on cannon stages (dragon
      // stages have no cannon; the dragon flies in instead)
      if (t.side === 'you' && t.kind === 'king' && currentWeapon === 'cannon') {
        cannonObj = buildCannon();
        cannonObj.position.set(bx(t.x), 2.9, bz(t.y) + 0.7);   // on the roofline, toward camera
        scene.add(cannonObj);
      }
    }
  }
  for (const [t, v] of towerVis) {
    // keep the HP number current
    const hpNow = Math.max(0, Math.ceil(t.hp));
    if (!t.dead && v.hpShown !== hpNow) {
      scene.remove(v.hpBadge);
      v.hpBadge = makeBadge(hpNow, t.side === 'you' ? '#22c24a' : '#e23b3b');
      v.hpBadge.scale.setScalar(1.0);
      v.hpBadge.position.set(bx(t.x), t.kind === 'king' ? (t.side === 'you' ? 5.6 : 3.6) : 2.9, bz(t.y));
      scene.add(v.hpBadge);
      v.hpShown = hpNow;
    }
    if (t.dead && !v.dead) {
      scene.remove(v.hpBadge);
      v.dead = true;
      v.archers?.forEach(a => scene.remove(a.obj)); v.archers = [];   // defenders fall with the tower
      v.obj.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiplyScalar(0.35); } });
      v.obj.scale.multiplyScalar(0.8); v.obj.rotation.z = 0.12;
    }
    if (!t.dead && v.archers) for (const a of v.archers) a.mixer.update(dt || 0);
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
  x.beginPath(); x.arc(64, 64, 56, 0, 6.28); x.fillStyle = color; x.fill();
  x.lineWidth = 11; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff'; x.font = '900 72px Trebuchet MS';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 69);
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
      const obj = buildCharacter(def);
      const scale = 0.42 + t.maxval * 0.062;            // size = magnitude
      obj.scale.setScalar(scale);
      scene.add(obj);
      const mixer = new THREE.AnimationMixer(obj);
      const badge = makeBadge(t.val, t.side === 'you' ? '#2b7de0' : '#e23b3b');
      badge.scale.setScalar(0.92);
      badge.position.y = 2.45; obj.add(badge);
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
    // Honest facing while moving/attacking (no angled moonwalk); 3/4 turn toward
    // the camera when standing still so faces get their moments.
    const busy = t.moving || t.atk > 0 || t.dueling;
    v.obj.rotation.y = t.side === 'you' ? (busy ? Math.PI : Math.PI * 0.45)
                                        : (busy ? 0 : -0.4);
    if (v.badgeVal !== t.val) {                          // number changed after combat
      v.obj.remove(v.badge);
      v.badge = makeBadge(t.val, t.side === 'you' ? '#2b7de0' : '#e23b3b');
      v.badge.scale.setScalar(0.92); v.badge.position.y = 2.45; v.obj.add(v.badge);
      v.badgeVal = t.val;
      // size tracks the CURRENT number, not the spawn number — a 7 that fought
      // down to a 3 shrinks to 3-size (size = magnitude, kept honest)
      v.obj.scale.setScalar(0.42 + t.val * 0.062);
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
// Soft round glow texture (radial gradient) so explosion puffs aren't hard
// squares. Additive blending makes overlapping puffs read as fire.
let softTex = null;
function getSoftTex() {
  if (softTex) return softTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
// own per-sprite material (its own opacity for independent fade); dispose on death
function softSprite(color) {
  const m = new THREE.SpriteMaterial({ map: getSoftTex(), color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  return new THREE.Sprite(m);
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
    if (q.life <= 0) { scene.remove(q.sp); if (q.own) q.sp.material.dispose(); localParts.splice(i, 1); continue; }
    if (q.grow) q.sp.scale.addScalar(q.grow * dt);     // expanding flash core
    q.vy -= (q.grow ? 0 : 9) * dt;                      // flash doesn't fall
    q.sp.position.x += q.vx * dt; q.sp.position.y += q.vy * dt; q.sp.position.z += q.vz * dt;
    if (q.sp.position.y < 0.05) q.sp.position.y = 0.05;
    q.sp.material.opacity = Math.min(1, q.life * (q.maxlife ? 1 / q.maxlife : 2));
  }
}

// ---- tower cannon: a catapult on your king that fires on a solved math card ----
// Prefer the KayKit CC0 catapult (turret + throwing arm, lifted off its tower
// base so it reads as an emplacement on the castle). Falls back to a built
// primitive cannon if the model isn't available. Tunable:
const CANNON_SCALE = 1.9;     // catapult size on the castle roof
const CANNON_YAW = Math.PI;   // face the enemy (-Z); flip if it points the wrong way

function buildCannon() {
  return buildPrimitiveCannon();   // primitive barrel (the KayKit catapult arm read weak)
}

function buildCatapult() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  const src = SkeletonUtils.clone(assets.catapult);
  let turret = null, arm = null;
  src.traverse(n => {
    if (/catapult_turret/i.test(n.name)) turret = n;
    if (/catapult_arm/i.test(n.name)) arm = n;
  });
  if (turret) { turret.position.set(0, 0, 0); inner.add(turret); }  // drop the tower base
  else inner.add(src);                                              // safety: whole model
  inner.traverse(n => { if (n.isMesh) { n.castShadow = true; n.material = n.material.clone(); } });
  inner.rotation.y = CANNON_YAW;
  g.add(inner);
  g.scale.setScalar(CANNON_SCALE);
  g.userData = { pivot: inner, arm, armBase: arm ? arm.rotation.x : 0, recoil: 0 };
  return g;
}

function buildPrimitiveCannon() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4420 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x33373d });
  // carriage
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.5), wood);
  base.castShadow = true; g.add(base);
  // wheels
  for (const sx of [-0.34, 0.34]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 16), iron);
    w.rotation.z = Math.PI / 2; w.position.set(sx, -0.05, 0.05); g.add(w);
  }
  // barrel pivot (recoils/aims downrange = -Z, toward the enemy castle)
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.16, 0.05);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.78, 20), iron);
  barrel.rotation.x = -Math.PI / 2;        // length now along -Z
  barrel.position.z = -0.24; barrel.castShadow = true;
  pivot.add(barrel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 18), wood);
  rim.position.z = -0.62; pivot.add(rim);
  pivot.rotation.x = 0.32;                  // tilt the muzzle up
  g.add(pivot);
  g.scale.setScalar(2.15);
  g.userData = { pivot, recoil: 0, primitive: true };
  return g;
}

// a fat, fiery burst — the math payoff has to out-spectacle the battle.
// fire=true uses the red/orange dragon-flame palette (matches the breath stream).
function bigBoom(pos, fire) {
  // bright flash core that expands and fades fast
  const flash = softSprite(fire ? 0xffa840 : 0xffe7b0); flash.scale.setScalar(1.4);
  flash.position.copy(pos); flash.position.y += 0.85; scene.add(flash);
  localParts.push({ sp: flash, vx: 0, vy: 0, vz: 0, life: 0.26, maxlife: 0.26, grow: 8, own: true });
  // soft fiery puffs flung outward
  for (let i = 0; i < 40; i++) {
    const col = fire ? FIRE_COLORS[(Math.random() * FIRE_COLORS.length) | 0]
                     : (i % 4 ? (i % 2 ? 0xff8a1e : 0xffcf4d) : 0xffffff);
    const sp = softSprite(col);
    sp.scale.setScalar(0.42 + Math.random() * 0.6);
    sp.position.copy(pos); sp.position.y += 0.8;
    scene.add(sp);
    const a = Math.random() * 6.28, s = 3.6 + Math.random() * 6.3;
    const life = 0.8 + Math.random() * 0.3;
    localParts.push({ sp, vx: Math.cos(a) * s, vy: 3.15 + Math.random() * 4.95, vz: Math.sin(a) * s, life, maxlife: life, own: true });
  }
}

/** fireCannon — launch a shot from your king's catapult to a battlefield point
 *  (battle coords). onImpact runs when the ball lands, so the kill lands with the
 *  boom. Called by gates.js on a correct answer. */
export function fireCannon(tx, tz, onImpact) {
  if (!ready || !cannonObj) { if (onImpact) onImpact(); return; }
  cannonObj.userData.recoil = 0.16;
  const muzzle = new THREE.Vector3();
  cannonObj.getWorldPosition(muzzle); muzzle.y += 0.4; muzzle.z -= 0.4;
  const to = new THREE.Vector3(bx(tx), 0.6, bz(tz));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14),
    new THREE.MeshLambertMaterial({ color: 0x222428 }));
  ball.position.copy(muzzle); ball.castShadow = true; scene.add(ball);
  cannonProjectiles.push({ ball, from: muzzle.clone(), to, t: 0, dur: 0.4, onImpact });
  // muzzle flash
  for (let i = 0; i < 8; i++) {
    const sp = softSprite(i % 2 ? 0xffcf4d : 0xffffff);
    sp.scale.setScalar(0.34 + Math.random() * 0.28);
    sp.position.copy(muzzle); scene.add(sp);
    const a = Math.random() * 6.28, s = 1.5 + Math.random() * 2;
    localParts.push({ sp, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2, vz: Math.sin(a) * s, life: 0.3, maxlife: 0.3, own: true });
  }
}

function updateCannon(dt) {
  if (cannonObj) {
    const u = cannonObj.userData;
    if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt);
    const r = u.recoil / 0.16;                                  // 1 at fire -> 0 at rest
    if (u.arm) u.arm.rotation.x = u.armBase - r * 1.0;          // catapult arm throws
    else if (u.pivot) u.pivot.position.z = 0.05 + r * 0.22;     // primitive barrel recoil
  }
  for (let i = cannonProjectiles.length - 1; i >= 0; i--) {
    const p = cannonProjectiles[i];
    p.t += dt;
    const f = Math.min(1, p.t / p.dur);
    p.ball.position.lerpVectors(p.from, p.to, f);
    p.ball.position.y += 3.2 * f * (1 - f);            // parabolic arc
    if (f >= 1) {
      scene.remove(p.ball);
      bigBoom(p.to);
      if (p.onImpact) p.onImpact();
      cannonProjectiles.splice(i, 1);
    }
  }
}

// ---- fly-in dragon: swoops across, breathes fire on the target (solve reward) ----
// Model: MattBas dragon (CC BY-SA 4.0) — ships a real Flying-loop animation, so the
// wings actually flap. Authored at ~12-unit wingspan, feet at origin; we scale and
// lift it. Fire is still a particle jet (model has no breath clip). Tunable:
const DRAGON_SCALE = 0.6;         // ~12.4 model units wide -> ~7.4 world units
const DRAGON_YAW = 0;             // model nose is at local +Z; aligns nose with travel
const DRAGON_ALT = 5.8;           // cruise altitude over the field (lower = stays in frame)
const DRAGON_CENTER = [0, -1.36, 0];  // lift feet-at-origin model so its body centers
const DRAGON_HEAD = 3.2;          // world dist from body center to mouth (fire origin)
const DRAGON_ZSPAN = 2.0;         // diagonal: how far the path swings in depth (SE<->NW)
const DRAGON_SOUTH = 2.0;         // bias path toward the bottom so the north end stays on screen

function makeDragon() {
  const inner = SkeletonUtils.clone(assets.dragon);
  inner.traverse(n => { if (n.isMesh) n.castShadow = true; });
  inner.position.set(DRAGON_CENTER[0], DRAGON_CENTER[1], DRAGON_CENTER[2]);
  const g = new THREE.Group();
  g.add(inner);
  g.scale.setScalar(DRAGON_SCALE);
  // play the flying-flap animation
  let mixer = null;
  const fly = (assets.dragonClips || []).find(c => /fly/i.test(c.name));
  if (fly) { mixer = new THREE.AnimationMixer(inner); mixer.clipAction(fly).reset().play(); }
  return { g, mixer };
}

// A tight fiery STREAM from the mouth toward the target. Called every frame during
// the breath window (so it stays attached to the moving mouth instead of trailing).
const FIRE_COLORS = [0xd81e00, 0xff3a0a, 0xff5a14, 0xff7a1e];  // deep red -> orange
function breatheFire(from, tx, tz, count) {
  const to = new THREE.Vector3(tx, 0.55, tz);
  const dir = to.clone().sub(from).normalize();
  for (let i = 0; i < count; i++) {
    const sp = softSprite(FIRE_COLORS[(Math.random() * FIRE_COLORS.length) | 0]);
    sp.scale.setScalar(0.45 + Math.random() * 0.65);
    sp.position.copy(from);
    sp.position.x += (Math.random() - 0.5) * 0.3;
    sp.position.z += (Math.random() - 0.5) * 0.3;
    scene.add(sp);
    const s = 9 + Math.random() * 5, spr = 1.0;          // fast + narrow = a jet, not a cloud
    localParts.push({ sp,
      vx: dir.x * s + (Math.random() - 0.5) * spr,
      vy: dir.y * s + (Math.random() - 0.5) * spr,
      vz: dir.z * s + (Math.random() - 0.5) * spr,
      life: 0.32 + Math.random() * 0.22, maxlife: 0.54, own: true });
  }
}

/** fireDragon — a dragon swoops in from a random side, breathes fire on the target
 *  (battle coords) at mid-pass, and flies off. onImpact runs with the fire hit
 *  (same kill as the cannon). Falls back to onImpact if the model is unavailable. */
export function fireDragon(tx, tz, onImpact) {
  if (!ready || !assets.dragon) { if (onImpact) onImpact(); return; }
  const target = { x: bx(tx), z: bz(tz) };
  // Diagonal flight: dir=+1 is SE->NW, dir=-1 is NW->SE. Crosses over the target
  // at mid-pass. Heading is derived from the actual travel vector so the nose
  // (and the fire out the mouth) always lead.
  const dir = Math.random() < 0.5 ? 1 : -1;
  // sweep is CENTERED on the target so mid-pass the dragon is right over it and the
  // fire lands on the target (instead of streaming into empty field beside it)
  const fromX = target.x + dir * 12, toX = target.x - dir * 12;
  const fromZ = target.z + dir * DRAGON_ZSPAN + DRAGON_SOUTH, toZ = target.z - dir * DRAGON_ZSPAN + DRAGON_SOUTH;
  const yaw = Math.atan2(toX - fromX, toZ - fromZ) + DRAGON_YAW;
  const { g: obj, mixer } = makeDragon();
  obj.position.set(fromX, DRAGON_ALT, fromZ);
  obj.rotation.y = yaw;
  scene.add(obj);
  dragons.push({ obj, mixer, t: 0, dur: 2.9, fromX, toX, fromZ, toZ, yaw, target, fired: false, onImpact });
}

function updateDragons(dt) {
  for (let i = dragons.length - 1; i >= 0; i--) {
    const d = dragons[i];
    d.t += dt;
    if (d.mixer) d.mixer.update(dt);
    const f = d.t / d.dur;
    if (f >= 1) { scene.remove(d.obj); dragons.splice(i, 1); continue; }
    d.obj.position.x = d.fromX + (d.toX - d.fromX) * f;
    d.obj.position.z = d.fromZ + (d.toZ - d.fromZ) * f;
    d.obj.position.y = DRAGON_ALT - Math.sin(f * Math.PI) * 1.6;   // dip toward the field mid-pass
    d.obj.rotation.y = d.yaw;
    d.obj.rotation.z = Math.sin(d.t * 7) * 0.07;                   // subtle bank/wingbeat life
    // breath window: stream fire from the mouth each frame as the dragon passes
    // over the target (mouth recomputed per-frame so the jet tracks the head)
    if (f >= 0.42 && f <= 0.66) {
      const fwd = new THREE.Vector3(d.toX - d.fromX, 0, d.toZ - d.fromZ).normalize();
      const mouth = d.obj.position.clone().addScaledVector(fwd, DRAGON_HEAD); mouth.y -= 0.35;
      breatheFire(mouth, d.target.x, d.target.z, 3);
    }
    if (!d.fired && f >= 0.5) {        // the kill + impact boom land once, mid-stream
      d.fired = true;
      bigBoom(new THREE.Vector3(d.target.x, 0.6, d.target.z), true);   // red flame palette
      if (d.onImpact) d.onImpact();
    }
  }
}

// ---- river tentacle hazard: ripple telegraph -> rising tapered tentacle that curls ----
// Jointed chain of tapering segments (so it can curl to grab), pink-purple with
// pale suckers down the inner side. Suckers face -Z (the curl direction).
function buildTentacle() {
  const root = new THREE.Group();
  const N = 7, segLen = 0.32, baseR = 0.23, tipR = 0.035;
  const body = new THREE.MeshLambertMaterial({ color: 0xb24ba6 });   // purple-pink
  const suck = new THREE.MeshLambertMaterial({ color: 0xf3b9da });   // pale pink suckers
  const segs = [];
  let parent = root;
  for (let i = 0; i < N; i++) {
    const seg = new THREE.Group();
    if (i > 0) seg.position.y = segLen;
    const r0 = baseR + (tipR - baseR) * (i / N);
    const r1 = baseR + (tipR - baseR) * ((i + 1) / N);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen, 9), body);
    m.position.y = segLen / 2; m.castShadow = true; seg.add(m);
    for (let s = 0; s < 2; s++) {                          // suckers on the inner (-Z) face
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.3, r0 * 0.3, 0.03, 8), suck);
      d.rotation.x = Math.PI / 2;
      d.position.set(0, segLen * (0.26 + 0.46 * s), -(r0 * 0.82));
      seg.add(d);
    }
    parent.add(seg); segs.push(seg); parent = seg;
  }
  root.scale.setScalar(0.68);                              // slightly smaller overall
  root.userData = { segs };
  return root;
}
// Concentric expanding water rings (a disturbance, not a flat halo)
function makeRipple() {
  const g = new THREE.Group();
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
    g.add(m); rings.push(m);
  }
  g.userData = { rings };
  return g;
}
function syncTentacles(S) {
  if (!ready || !S.tentacles) return;
  const seen = new Set();
  for (const te of S.tentacles) {
    seen.add(te);
    let v = tentVis.get(te);
    if (!v) {
      const group = new THREE.Group();
      group.position.set(bx(te.x), 0, bz(te.y));
      group.rotation.y = (Math.sin(te.x * 12.9) * 43758.5) % 6.28;   // varied facing
      const ripple = makeRipple(), tent = buildTentacle();
      group.add(ripple); group.add(tent); scene.add(group);
      v = { group, ripple, tent, riseH: 2.0 }; tentVis.set(te, v);
    }
    // ripple: continuous expanding rings during the warn telegraph, fading as it rises
    const showR = te.phase === 'warn' ? 1 : Math.max(0, 1 - te.rise);
    v.ripple.userData.rings.forEach((r, i) => {
      const p = ((te.t * 1.3) + i / 3) % 1;
      r.scale.setScalar(0.5 + p * 1.7);
      r.material.opacity = (1 - p) * 0.55 * showR;
      r.visible = showR > 0.02;
    });
    // tentacle: rise from below the water (water plane hides the submerged part),
    // curl the joints inward to grab
    v.tent.visible = te.phase !== 'warn';
    v.tent.position.y = -(1 - te.rise) * v.riseH;
    v.tent.userData.segs.forEach((seg, i) => {
      const f = i / v.tent.userData.segs.length;
      // near-straight at rest; curl weighted to the TIP (f^2) so it stands up and
      // hooks over at the top instead of arching into a full hoop
      seg.rotation.x = -0.03 - te.curl * (0.05 + 0.62 * f * f);
      seg.rotation.z = Math.sin(te.t * 5 + i) * 0.04;                    // slight sway
    });
  }
  for (const [te, v] of tentVis) {
    if (!seen.has(te)) {
      v.group.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
      scene.remove(v.group); tentVis.delete(te);
    }
  }
}

/** setWeapon — choose this arena's solve weapon ('cannon' or 'dragon'). Call before
 *  the match resets so syncTowers mounts (or skips) the cannon accordingly. */
export function setWeapon(w) { currentWeapon = w === 'dragon' ? 'dragon' : 'cannon'; }

/** fireWeapon — fire whichever weapon this arena uses (gates.js calls this on a solve). */
export function fireWeapon(tx, tz, onImpact) {
  if (currentWeapon === 'dragon') fireDragon(tx, tz, onImpact);
  else fireCannon(tx, tz, onImpact);
}

// ---- public API (matches render2d.js) ----
export function render(S) {
  const dt = Math.min(0.05, clock.getDelta());
  syncTowers(S, dt);
  syncTroops(S, dt);
  syncParts(S, dt);
  syncTentacles(S);
  updateCannon(dt);
  updateDragons(dt);
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
