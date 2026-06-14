// sw.js — offline support. Bump CACHE_VERSION to force clients to re-cache on deploy.
const CACHE_VERSION = 'math-royale-v1';
const PRECACHE = [
  './',
  './assets/game/anim/Rig_Medium_CombatMelee.glb',
  './assets/game/anim/Rig_Medium_General.glb',
  './assets/game/anim/Rig_Medium_MovementBasic.glb',
  './assets/game/chars/Barbarian.glb',
  './assets/game/chars/Knight.glb',
  './assets/game/chars/Mage.glb',
  './assets/game/chars/Ranger.glb',
  './assets/game/chars/Rogue.glb',
  './assets/game/chars/Skeleton_Mage.glb',
  './assets/game/chars/Skeleton_Minion.glb',
  './assets/game/chars/Skeleton_Rogue.glb',
  './assets/game/chars/Skeleton_Warrior.glb',
  './assets/game/dragon.glb',
  './assets/game/env/Bush_1_A_Color1.bin',
  './assets/game/env/Bush_1_A_Color1.gltf',
  './assets/game/env/Bush_2_A_Color1.bin',
  './assets/game/env/Bush_2_A_Color1.gltf',
  './assets/game/env/Grass_1_A_Color1.bin',
  './assets/game/env/Grass_1_A_Color1.gltf',
  './assets/game/env/Grass_2_A_Color1.bin',
  './assets/game/env/Grass_2_A_Color1.gltf',
  './assets/game/env/Rock_1_A_Color1.bin',
  './assets/game/env/Rock_1_A_Color1.gltf',
  './assets/game/env/Rock_3_A_Color1.bin',
  './assets/game/env/Rock_3_A_Color1.gltf',
  './assets/game/env/Tree_1_A_Color1.bin',
  './assets/game/env/Tree_1_A_Color1.gltf',
  './assets/game/env/Tree_2_A_Color1.bin',
  './assets/game/env/Tree_2_A_Color1.gltf',
  './assets/game/env/Tree_3_A_Color1.bin',
  './assets/game/env/Tree_3_A_Color1.gltf',
  './assets/game/env/Tree_4_A_Color1.bin',
  './assets/game/env/Tree_4_A_Color1.gltf',
  './assets/game/env/Tree_Bare_1_A_Color1.bin',
  './assets/game/env/Tree_Bare_1_A_Color1.gltf',
  './assets/game/env/Tree_Bare_2_A_Color1.bin',
  './assets/game/env/Tree_Bare_2_A_Color1.gltf',
  './assets/game/env/banner.gltf.glb',
  './assets/game/env/barrel.bin',
  './assets/game/env/barrel.gltf',
  './assets/game/env/barrelDark.gltf.glb',
  './assets/game/env/bench.gltf.glb',
  './assets/game/env/bridge.gltf.glb',
  './assets/game/env/bucket_water.bin',
  './assets/game/env/bucket_water.gltf',
  './assets/game/env/building_tower_catapult_red.bin',
  './assets/game/env/castle.gltf.glb',
  './assets/game/env/catapult.gltf',
  './assets/game/env/chest_common.gltf.glb',
  './assets/game/env/crate_A_big.bin',
  './assets/game/env/crate_A_big.gltf',
  './assets/game/env/detail_forestA.gltf.glb',
  './assets/game/env/detail_hill.gltf.glb',
  './assets/game/env/detail_rocks.gltf.glb',
  './assets/game/env/detail_treeA.gltf.glb',
  './assets/game/env/detail_treeB.gltf.glb',
  './assets/game/env/flag_blue.bin',
  './assets/game/env/flag_blue.gltf',
  './assets/game/env/flag_red.bin',
  './assets/game/env/flag_red.gltf',
  './assets/game/env/forest_texture.png',
  './assets/game/env/hexagons_medieval.png',
  './assets/game/env/watchtower.gltf.glb',
  './assets/game/weapons/axe_A.bin',
  './assets/game/weapons/axe_A.gltf',
  './assets/game/weapons/bow_A_withString.bin',
  './assets/game/weapons/bow_A_withString.gltf',
  './assets/game/weapons/dagger_A.bin',
  './assets/game/weapons/dagger_A.gltf',
  './assets/game/weapons/dagger_B.bin',
  './assets/game/weapons/dagger_B.gltf',
  './assets/game/weapons/shield_A.bin',
  './assets/game/weapons/shield_A.gltf',
  './assets/game/weapons/shield_B.bin',
  './assets/game/weapons/shield_B.gltf',
  './assets/game/weapons/staff_A.bin',
  './assets/game/weapons/staff_A.gltf',
  './assets/game/weapons/staff_B.bin',
  './assets/game/weapons/staff_B.gltf',
  './assets/game/weapons/sword_A.bin',
  './assets/game/weapons/sword_A.gltf',
  './assets/game/weapons/sword_B.bin',
  './assets/game/weapons/sword_B.gltf',
  './assets/game/weapons/weapons_bits_texture.png',
  './data/arenas.js',
  './data/roster.js',
  './data/units.js',
  './index.html',
  './manifest.json',
  './src/arenas.js',
  './src/battle.js',
  './src/deck-ui.js',
  './src/gates.js',
  './src/hud3d.js',
  './src/input.js',
  './src/main.js',
  './src/mastery.js',
  './src/profiles-ui.js',
  './src/render2d.js',
  './src/render3d.js',
  './src/store.js',
  './vendor/addons/loaders/GLTFLoader.js',
  './vendor/addons/utils/BufferGeometryUtils.js',
  './vendor/addons/utils/SkeletonUtils.js',
  './vendor/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // let cross-origin (none) pass through
  const isAsset = /\.(glb|gltf|bin|png|jpg|jpeg|webp)$/i.test(url.pathname);
  if (isAsset) {
    // cache-first: big, stable 3D assets
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); return res;
      }))
    );
  } else {
    // network-first: html / js / json — fresh when online, cached when offline
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
    );
  }
});
