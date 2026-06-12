// Entry point: wires modules together and runs the frame loop.
//
// Flow:
//   1. showProfilePicker → profile selected
//   2. showArenaSelect   → PLAY or BOSS tapped
//   3. startMatch(arenaId, isBoss) → battle runs
//   4. On match end (S.over set) → banner tap → back to showArenaSelect
//
// Banner-tap intercept: input.js listens on the canvas (non-capture) and calls
// battle.reset() when S.over is set. We intercept using a CAPTURE listener on
// the canvas, which fires BEFORE input.js's bubble listener. In the capture
// handler we call e.stopImmediatePropagation() so input.js never sees the tap,
// then we navigate to arena select ourselves.

import { initRender, render, applyTheme } from './render3d.js';
import { initHud, updateHud } from './hud3d.js';
import { initInput } from './input.js';
import * as battle from './battle.js';
import { showProfilePicker } from './profiles-ui.js';
import { initGates, updateGates, setFactPools } from './gates.js';
import { showArenaSelect, handleBossWin, ensureProgress, buildPools } from './arenas.js';
import { getArena } from '../data/arenas.js';
import { loadProfile } from './store.js';

const canvas = document.getElementById('c');
initRender(canvas);
initInput(canvas);  // sets up input.js's non-capture bubble listener

// ── frame-loop handle so we only run one loop at a time ──────────────────────
let _rafId = null;
let _matchEndHandled = false;  // guard: fire onMatchEnd exactly once per match

// ── capture listener handle ──────────────────────────────────────────────────
// Capture fires before bubble, so we intercept before input.js resets the battle.
let _captureListener = null;

function removeCaptureListener() {
  if (_captureListener) {
    canvas.removeEventListener('mousedown',  _captureListener, true);
    canvas.removeEventListener('touchstart', _captureListener, true);
    _captureListener = null;
  }
}

// ── main entry ────────────────────────────────────────────────────────────────

showProfilePicker((profile) => {
  openArenaSelect(profile);
});

// ─── arena select ─────────────────────────────────────────────────────────────

function openArenaSelect(profile) {
  // Always reload profile from storage so progress is fresh after saves.
  const fresh = loadProfile(profile.id) || profile;
  ensureProgress(fresh);
  showArenaSelect(
    fresh,
    (arenaId) => startMatch(fresh, arenaId, false),
    (arenaId) => startMatch(fresh, arenaId, true),
  );
}

// ─── start a match ────────────────────────────────────────────────────────────

function startMatch(profile, arenaId, isBoss) {
  const arena = getArena(arenaId);
  if (!arena) { openArenaSelect(profile); return; }

  // 0. Arena look: sky, light, ground, flora.
  applyTheme(arena.theme);

  // 1. Configure battle: restrict foe spawns + optional boss unit.
  battle.configureBattle({
    foeMaxVal: arena.foeMaxVal,
    bossSpawn: isBoss ? { spr: arena.boss.spr, val: arena.boss.val } : null,
  });

  // 2. Wire fact pools into gates so repair cards draw arena-correct facts.
  const { currentPool, earlierPools } = buildPools(arenaId);
  setFactPools(currentPool, earlierPools);

  // 3. Reset + init.
  battle.reset();
  initGates();
  initHud();

  // 4. Cancel any previous loop; clear stale intercept.
  if (_rafId !== null) cancelAnimationFrame(_rafId);
  removeCaptureListener();
  _matchEndHandled = false;

  // 5. Frame loop.
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    battle.update(dt);
    render(battle.S);
    updateGates();
    updateHud(battle.S);

    // Detect match end; arm the intercept listener exactly once.
    if (battle.S.over && !_matchEndHandled) {
      _matchEndHandled = true;
      armBannerIntercept(profile, arenaId, isBoss, battle.S.over);
    }

    _rafId = requestAnimationFrame(frame);
  }
  _rafId = requestAnimationFrame(frame);
}

// ─── match end ────────────────────────────────────────────────────────────────

function armBannerIntercept(profile, arenaId, isBoss, result) {
  // Small delay so the tap that triggered S.over doesn't immediately fire.
  setTimeout(() => {
    removeCaptureListener();

    _captureListener = function interceptBannerTap(e) {
      if (!battle.S.over) return;   // match already restarted somehow — let it through
      e.stopImmediatePropagation(); // block input.js's battle.reset() call
      e.preventDefault();
      removeCaptureListener();

      if (isBoss && result === 'WIN') {
        // Boss win: update progress, show unlock celebration, then arena select.
        handleBossWin(profile, arenaId, () => {
          const updated = loadProfile(profile.id) || profile;
          openArenaSelect(updated);
        });
      } else {
        // Normal win/loss or boss loss: back to arena select, no progress change.
        openArenaSelect(profile);
      }
    };

    // Use capture (3rd arg = true) so we fire before input.js's bubble listener.
    canvas.addEventListener('mousedown',  _captureListener, true);
    canvas.addEventListener('touchstart', _captureListener, { capture: true, passive: false });
  }, 350);
}
