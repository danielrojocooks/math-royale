// src/gates.js — Gate UIs for Math Royale (Epic E3).
//
// Owns two gate types:
//   REPAIR GATE  — "7 = ? + 4" missing-addend; heals a damaged tower.
//   CHARGE GATE  — "build exactly N" tile-accumulator; grants bonus elixir.
//
// DOM overlays injected over the canvas, matching profiles-ui.js style.
// Battle is paused (S.paused = true) while any gate is open.
//
// ─── FACT-ID SCHEME ──────────────────────────────────────────────────────────
//   Repair gate:  "repair:T=?+K"   e.g. "repair:7=?+4"
//                  T = target sum, K = known addend, ? = missing addend (T-K).
//   Charge gate:  "charge:N"       e.g. "charge:6"
//                  N = the exact number the player must build.
//
// TODO (E4): replace REPAIR_POOL and CHARGE_POOL with arena-specific pools
//            passed in from arenas.js. The pickGateFact / recordAttempt API
//            is already correct; only the pool arrays change.
// ─────────────────────────────────────────────────────────────────────────────

import { S, repairTower, addElixir } from './battle.js';
import { worldToScreen } from './render2d.js';
import { pickGateFact, scaffoldTier, recordAttempt } from './mastery.js';
import { loadProfile, saveProfile, getActiveProfileId } from './store.js';

// ─── Starter fact pools (Arena 2-3: number bonds within 10) ──────────────────
// Repair pool: "repair:T=?+K" — T ranges 5-10, K ranges 1 to T-1.
const REPAIR_POOL = (function buildRepairPool() {
  const pool = [];
  for (let T = 5; T <= 10; T++) {
    for (let K = 1; K < T; K++) {
      pool.push('repair:' + T + '=?+' + K);
    }
  }
  return pool;
})();

// Charge pool: "charge:N" for N = 3..10
const CHARGE_POOL = [];
for (let n = 3; n <= 10; n++) CHARGE_POOL.push('charge:' + n);

// ─── Tiles for Charge gate (matches catapult-puzzle.html exactly) ─────────────
const CHARGE_TILES = [
  { text: '1',   val: 1 },
  { text: '1+1', val: 2 },
  { text: '2+1', val: 3 },
  { text: '2+2', val: 4 },
];

// ─── Per-tower cooldown tracking ─────────────────────────────────────────────
// Maps tower object reference → cooldown expiry timestamp (ms)
const repairCooldowns = new WeakMap();
const REPAIR_COOLDOWN_MS = 10_000;

// Single charge-gate cooldown (shared, not per-tower)
let chargeCooldownExpiry = 0;
const CHARGE_COOLDOWN_MS = 20_000;

// DOM element references
let wrenchContainer = null;  // div holding all wrench buttons
let chargeBtn = null;        // the ⚡ CHARGE button in the panel area

// ─── styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('gates-style')) return;
  const s = document.createElement('style');
  s.id = 'gates-style';
  s.textContent = `
/* ── wrench buttons (floating over canvas) ── */
#gates-wrenches {
  position: fixed; inset: 0; pointer-events: none;
  z-index: 50;
}
.gate-wrench {
  position: absolute;
  pointer-events: auto;
  background: #ffcf4d;
  border: 4px solid #241043;
  border-radius: 50%;
  width: clamp(52px, 10vw, 72px);
  height: clamp(52px, 10vw, 72px);
  font-size: clamp(26px, 5vw, 38px);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transform: translate(-50%, -50%);
  box-shadow: 0 3px 12px rgba(0,0,0,.6);
  transition: transform .1s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.gate-wrench:active { transform: translate(-50%, -50%) scale(.92); }
.gate-wrench.cooldown {
  background: #5b3fa0;
  border-color: #3a1a6e;
  opacity: .5;
  pointer-events: none;
}

/* ── charge button (fixed panel, bottom-left of elixir bar area) ── */
#gate-charge-btn {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
  left: 8px;
  z-index: 50;
  background: #c026a8;
  color: #fff;
  border: 4px solid #ffcf4d;
  border-radius: 18px;
  padding: 10px 16px;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  font-size: clamp(14px, 3vw, 20px);
  font-weight: 900;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  white-space: nowrap;
  box-shadow: 0 3px 12px rgba(0,0,0,.5);
  transition: transform .1s, opacity .1s;
  line-height: 1;
}
#gate-charge-btn:active { transform: scale(.93); }
#gate-charge-btn.cooldown { opacity: .45; pointer-events: none; }

/* ── modal backdrop ── */
.gate-backdrop {
  position: fixed; inset: 0;
  background: rgba(10,6,28,.82);
  z-index: 200;
  display: flex; align-items: center; justify-content: center;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
}

/* ── modal panel ── */
.gate-modal {
  background: #241043;
  border: 5px solid #ffcf4d;
  border-radius: 28px;
  padding: 28px 24px 24px;
  max-width: min(480px, 92vw);
  width: 100%;
  box-sizing: border-box;
  display: flex; flex-direction: column;
  align-items: center; gap: 16px;
  position: relative;
  box-shadow: 0 8px 40px rgba(0,0,0,.8);
}

/* close button */
.gate-close {
  position: absolute; top: 12px; right: 14px;
  background: #3a1a6e; color: #ccc;
  border: 3px solid #5b3fa0;
  border-radius: 50%; width: 38px; height: 38px;
  font-size: 20px; font-weight: 900;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.gate-close:active { background: #c026a8; color: #fff; }

/* equation display */
.gate-equation {
  font-size: clamp(32px, 8vw, 56px);
  font-weight: 900;
  color: #ffcf4d;
  text-shadow: 0 2px 8px #000;
  letter-spacing: 2px;
  text-align: center;
}

/* answer button grid */
.gate-answers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  width: 100%;
}
.gate-ans-btn {
  background: #3a1a6e;
  border: 5px solid #5b3fa0;
  border-radius: 20px;
  color: #fff;
  font-size: clamp(28px, 7vw, 48px);
  font-weight: 900;
  padding: 20px 10px;
  cursor: pointer;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s, border-color .1s;
}
.gate-ans-btn:active { transform: scale(.95); }
.gate-ans-btn.correct { border-color: #22c24a; background: #143d1a; }
.gate-ans-btn.wrong   { border-color: #e23b3b; }

/* shake animation for wrong answer */
@keyframes gate-shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-10px); }
  40%      { transform: translateX(10px); }
  60%      { transform: translateX(-8px); }
  80%      { transform: translateX(8px); }
}
.gate-modal.shake { animation: gate-shake .35s ease; }

/* scaffold dots */
.gate-scaffold {
  display: flex; flex-wrap: wrap; gap: 5px;
  justify-content: center;
  min-height: 28px;
  padding: 4px 0;
}
.gate-dot {
  width: clamp(14px, 3vw, 20px);
  height: clamp(14px, 3vw, 20px);
  border-radius: 50%;
  display: inline-block;
}
.gate-dot.filled  { background: #ffcf4d; }
.gate-dot.unfilled { background: #3a1a6e; border: 2px solid #5b3fa0; }

/* scaffold hint text */
.gate-hint {
  color: #c026a8;
  font-size: clamp(13px, 3vw, 18px);
  font-weight: 700;
  text-align: center;
  min-height: 1em;
}

/* ── charge gate specific ── */
.gate-target-label {
  font-size: clamp(18px, 4vw, 26px);
  color: #c026a8;
  font-weight: 900;
  text-align: center;
}
.gate-total-display {
  font-size: clamp(48px, 12vw, 80px);
  font-weight: 900;
  color: #fff;
  text-shadow: 0 2px 10px #000;
  min-width: 80px; text-align: center;
  line-height: 1;
}
.gate-total-display.over { color: #ff8a8a; }
.gate-total-display.exact { color: #7dff8a; }

.gate-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  width: 100%;
}
.gate-tile-btn {
  background: linear-gradient(180deg, #fff4d6, #ffd98a);
  border: 5px solid #ffcf4d;
  border-radius: 18px;
  color: #5a3a10;
  font-size: clamp(18px, 4vw, 26px);
  font-weight: 900;
  padding: 16px 4px;
  cursor: pointer;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s;
}
.gate-tile-btn:active { transform: scale(.92); }

.gate-charge-actions {
  display: flex; gap: 12px; width: 100%; justify-content: center;
}
.gate-undo-btn {
  background: #5b3fa0; color: #fff;
  border: 4px solid #fff;
  border-radius: 16px;
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 900;
  padding: 14px 20px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s;
  flex: 1;
}
.gate-undo-btn:active { transform: scale(.93); }

.gate-fire-btn {
  background: #e2521b; color: #fff;
  border: 4px solid #fff;
  border-radius: 16px;
  font-size: clamp(20px, 5vw, 30px);
  font-weight: 900;
  padding: 14px 20px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s, background .1s;
  flex: 2;
}
.gate-fire-btn.ready { background: #22c24a; }
.gate-fire-btn:active { transform: scale(.93); }

/* wobble for charge-over */
@keyframes gate-wobble {
  0%,100% { transform: scale(1); }
  25%      { transform: scale(1.18) rotate(-4deg); }
  75%      { transform: scale(1.12) rotate(4deg); }
}
.gate-total-display.wobble { animation: gate-wobble .35s ease; }

/* success flash */
.gate-success-msg {
  font-size: clamp(22px, 5vw, 32px);
  font-weight: 900;
  color: #7dff8a;
  text-shadow: 0 2px 8px #000;
  text-align: center;
  animation: gate-pop-in .3s cubic-bezier(.2,1.4,.6,1);
}
@keyframes gate-pop-in {
  from { transform: scale(.5); opacity: 0; }
  to   { transform: scale(1);  opacity: 1; }
}
`;
  document.head.appendChild(s);
}

// ─── helper: load active profile (safe — returns stub if none) ───────────────
function getProfile() {
  const id = getActiveProfileId();
  if (!id) return null;
  return loadProfile(id);
}

// ─── helper: parse a repair factId ───────────────────────────────────────────
// "repair:7=?+4" => { T: 7, K: 4, missing: 3 }
function parseRepairFact(factId) {
  // factId format: repair:T=?+K
  const m = factId.match(/^repair:(\d+)=\?\+(\d+)$/);
  if (!m) return null;
  const T = parseInt(m[1], 10);
  const K = parseInt(m[2], 10);
  return { T, K, missing: T - K };
}

// ─── helper: parse a charge factId ───────────────────────────────────────────
// "charge:6" => { target: 6 }
function parseChargeFact(factId) {
  const m = factId.match(/^charge:(\d+)$/);
  if (!m) return null;
  return { target: parseInt(m[1], 10) };
}

// ─── helper: generate 3 plausible distractors for the missing addend ──────────
// Keeps all values >= 1 and <= T-1, avoids the correct answer.
function makeDistractors(correct, T) {
  const pool = new Set();
  for (let v = 1; v <= T - 1; v++) {
    if (v !== correct) pool.add(v);
  }
  // prefer neighbours of correct
  const candidates = [...pool].sort((a, b) => Math.abs(a - correct) - Math.abs(b - correct));
  const distractors = [];
  for (const c of candidates) {
    if (distractors.length >= 3) break;
    distractors.push(c);
  }
  // If not enough (small T), fill with whatever is available
  return distractors;
}

// Fisher-Yates shuffle (in place)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── dot scaffold renderer ────────────────────────────────────────────────────
// For repair: show T dots with K filled (known addend), to illustrate T = K + ?
function renderDots(container, T, K) {
  container.innerHTML = '';
  for (let i = 0; i < T; i++) {
    const dot = document.createElement('span');
    dot.className = 'gate-dot ' + (i < K ? 'filled' : 'unfilled');
    container.appendChild(dot);
  }
}

// ─── triggerShake helper ──────────────────────────────────────────────────────
function triggerShake(el) {
  el.classList.remove('shake');
  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('shake');
}

// ─── triggerWobble helper ─────────────────────────────────────────────────────
function triggerWobble(el) {
  el.classList.remove('wobble');
  void el.offsetWidth;
  el.classList.add('wobble');
}

// ─────────────────────────────────────────────────────────────────────────────
//  REPAIR GATE
// ─────────────────────────────────────────────────────────────────────────────

function openRepairGate(tower) {
  const profile = getProfile();
  if (!profile) return;

  S.paused = true;

  const factId = pickGateFact(profile.facts, REPAIR_POOL, [], {});
  const parsed = parseRepairFact(factId);
  if (!parsed) { S.paused = false; return; }
  const { T, K, missing } = parsed;

  const tier = scaffoldTier(profile.facts, factId);
  const openedAt = Date.now();

  // Build modal DOM
  const backdrop = document.createElement('div');
  backdrop.className = 'gate-backdrop';

  const modal = document.createElement('div');
  modal.className = 'gate-modal';
  backdrop.appendChild(modal);

  // Close button (X — closes without recording)
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gate-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';  // ×
  modal.appendChild(closeBtn);

  // Equation label  "7 = ? + 4"
  const eq = document.createElement('div');
  eq.className = 'gate-equation';
  eq.textContent = T + ' = ? + ' + K;
  modal.appendChild(eq);

  // Scaffold area (dots) — shown immediately for T0; hidden for T1/T2
  const scaffoldEl = document.createElement('div');
  scaffoldEl.className = 'gate-scaffold';
  modal.appendChild(scaffoldEl);
  if (tier === 0) {
    renderDots(scaffoldEl, T, K);
  }

  // Hint text area
  const hintEl = document.createElement('div');
  hintEl.className = 'gate-hint';
  hintEl.textContent = '';
  modal.appendChild(hintEl);

  // Answer buttons
  const distractors = makeDistractors(missing, T);
  const choices = shuffle([missing, ...distractors]);

  const answersGrid = document.createElement('div');
  answersGrid.className = 'gate-answers';

  let answered = false;
  let missCount = 0;  // consecutive misses this session (for T1 dot reveal)

  function close() {
    S.paused = false;
    backdrop.remove();
    updateWrenchCooldown(tower);
  }

  closeBtn.addEventListener('click', () => { close(); });

  for (const choice of choices) {
    const btn = document.createElement('button');
    btn.className = 'gate-ans-btn';
    btn.textContent = String(choice);

    btn.addEventListener('click', () => {
      if (answered) return;

      const elapsedMs = Date.now() - openedAt;
      const isCorrect = choice === missing;

      recordAttempt(
        profile.facts, factId, isCorrect, elapsedMs,
        { thresholdMs: profile.settings.fluencyMs }
      );
      saveProfile(profile);

      if (isCorrect) {
        answered = true;
        btn.classList.add('correct');
        hintEl.textContent = '⭐ +' + missing + ' HP!';  // ⭐ +N HP!

        // Heal the tower
        repairTower(tower, missing);

        // Brief success pause then close
        setTimeout(() => {
          close();
          // Start cooldown NOW (after close so updateWrenchCooldown fires correctly)
          repairCooldowns.set(tower, Date.now() + REPAIR_COOLDOWN_MS);
          updateWrenchCooldown(tower);
        }, 700);

      } else {
        // Wrong answer
        btn.classList.add('wrong');
        missCount++;
        triggerShake(modal);

        // T1: show dots after first miss
        if (tier === 1 && missCount >= 1 && scaffoldEl.children.length === 0) {
          renderDots(scaffoldEl, T, K);
        }

        // Gentle hint text
        hintEl.textContent = 'Try again!';

        // Re-enable button feel after animation
        setTimeout(() => {
          btn.classList.remove('wrong');
          hintEl.textContent = tier === 2 ? '' : 'Count the dots → ' + T + ' − ' + K;
        }, 450);
      }
    });

    answersGrid.appendChild(btn);
  }

  modal.appendChild(answersGrid);
  document.body.appendChild(backdrop);
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHARGE GATE
// ─────────────────────────────────────────────────────────────────────────────

function openChargeGate() {
  const profile = getProfile();
  if (!profile) return;

  S.paused = true;

  const factId = pickGateFact(profile.facts, CHARGE_POOL, [], {});
  const parsed = parseChargeFact(factId);
  if (!parsed) { S.paused = false; return; }
  const { target } = parsed;

  const openedAt = Date.now();
  let total = 0;
  const stack = [];  // for undo: array of tile values added
  let fired = false; // guard against double-recording if tile-hit and FIRE both trigger

  // Build modal DOM
  const backdrop = document.createElement('div');
  backdrop.className = 'gate-backdrop';

  const modal = document.createElement('div');
  modal.className = 'gate-modal';
  backdrop.appendChild(modal);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gate-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  modal.appendChild(closeBtn);

  // Target label
  const targetLbl = document.createElement('div');
  targetLbl.className = 'gate-target-label';
  targetLbl.textContent = 'Build exactly ' + target;
  modal.appendChild(targetLbl);

  // Running total display
  const totalDisplay = document.createElement('div');
  totalDisplay.className = 'gate-total-display';
  totalDisplay.textContent = total || '0';
  modal.appendChild(totalDisplay);

  // Tile buttons
  const tilesRow = document.createElement('div');
  tilesRow.className = 'gate-tiles';

  function refreshDisplay() {
    totalDisplay.textContent = String(total);
    totalDisplay.className = 'gate-total-display';
    if (total === target) totalDisplay.classList.add('exact');
    else if (total > target) totalDisplay.classList.add('over');

    fireBtn.className = 'gate-fire-btn' + (total === target ? ' ready' : '');
    fireBtn.textContent = total === target ? '⚡ FIRE!' : 'FIRE!';
  }

  for (const tile of CHARGE_TILES) {
    const btn = document.createElement('button');
    btn.className = 'gate-tile-btn';
    btn.textContent = tile.text;

    btn.addEventListener('click', () => {
      if (total + tile.val > target) {
        // Over — reset with wobble (CURRICULUM.md: no fail state, just reset)
        total = 0;
        stack.length = 0;
        triggerWobble(totalDisplay);
        refreshDisplay();
        return;
      }
      total += tile.val;
      stack.push(tile.val);
      refreshDisplay();

      // Check exact immediately
      if (total === target) {
        if (fired) return;
        fired = true;
        const elapsedMs = Date.now() - openedAt;
        recordAttempt(
          profile.facts, factId, true, elapsedMs,
          { thresholdMs: profile.settings.fluencyMs }
        );
        saveProfile(profile);

        // Grant +3 elixir bonus (cap handled inside addElixir)
        addElixir(3);

        // Show success message; disable all interaction
        tilesRow.style.pointerEvents = 'none';
        undoBtn.style.display = 'none';
        fireBtn.style.display = 'none';

        const successMsg = document.createElement('div');
        successMsg.className = 'gate-success-msg';
        successMsg.textContent = '⚡ +3 Elixir!';
        modal.appendChild(successMsg);

        chargeCooldownExpiry = Date.now() + CHARGE_COOLDOWN_MS;
        updateChargeButton();

        setTimeout(() => {
          S.paused = false;
          backdrop.remove();
        }, 900);
      }
    });

    tilesRow.appendChild(btn);
  }

  modal.appendChild(tilesRow);

  // Undo + Fire row
  const actionsRow = document.createElement('div');
  actionsRow.className = 'gate-charge-actions';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'gate-undo-btn';
  undoBtn.textContent = '↶';  // ↶

  undoBtn.addEventListener('click', () => {
    if (stack.length > 0) {
      total -= stack.pop();
      refreshDisplay();
    }
  });

  const fireBtn = document.createElement('button');
  fireBtn.className = 'gate-fire-btn';
  fireBtn.textContent = 'FIRE!';

  fireBtn.addEventListener('click', () => {
    if (total !== target) {
      // Under — keep building; shake as a "not yet" cue
      triggerShake(modal);
      return;
    }
    if (fired) return;
    fired = true;
    // Tile click may have already resolved if total hit target on the last tile,
    // but FIRE is still clickable as an intentional confirm gesture.
    const elapsedMs = Date.now() - openedAt;
    recordAttempt(
      profile.facts, factId, true, elapsedMs,
      { thresholdMs: profile.settings.fluencyMs }
    );
    saveProfile(profile);
    addElixir(3);
    chargeCooldownExpiry = Date.now() + CHARGE_COOLDOWN_MS;
    updateChargeButton();

    const successMsg = document.createElement('div');
    successMsg.className = 'gate-success-msg';
    successMsg.textContent = '⚡ +3 Elixir!';
    modal.appendChild(successMsg);

    tilesRow.style.pointerEvents = 'none';
    undoBtn.style.display = 'none';
    fireBtn.style.display = 'none';

    setTimeout(() => {
      S.paused = false;
      backdrop.remove();
    }, 900);
  });

  actionsRow.appendChild(undoBtn);
  actionsRow.appendChild(fireBtn);
  modal.appendChild(actionsRow);

  closeBtn.addEventListener('click', () => {
    S.paused = false;
    backdrop.remove();
  });

  refreshDisplay();
  document.body.appendChild(backdrop);
}

// ─────────────────────────────────────────────────────────────────────────────
//  WRENCH BUTTONS (floating, per-tower, repositioned each frame)
// ─────────────────────────────────────────────────────────────────────────────

// Map from tower to its wrench button element.
// Regular Map (not WeakMap) so we can enumerate and remove buttons for towers
// that no longer exist after battle.reset() — otherwise ghost wrenches linger.
const wrenchEls = new Map();

function ensureWrenchContainer() {
  if (!wrenchContainer) {
    wrenchContainer = document.createElement('div');
    wrenchContainer.id = 'gates-wrenches';
    document.body.appendChild(wrenchContainer);
  }
}

function getOrCreateWrench(tower) {
  if (wrenchEls.has(tower)) return wrenchEls.get(tower);

  const btn = document.createElement('button');
  btn.className = 'gate-wrench';
  btn.setAttribute('aria-label', 'Repair tower');
  btn.textContent = '🔧';  // 🔧

  btn.addEventListener('click', () => {
    if (S.paused || S.over) return;
    const now = Date.now();
    const expiry = repairCooldowns.get(tower) || 0;
    if (now < expiry) return;
    openRepairGate(tower);
  });

  wrenchContainer.appendChild(btn);
  wrenchEls.set(tower, btn);
  return btn;
}

function updateWrenchCooldown(tower) {
  const btn = wrenchEls.get(tower);
  if (!btn) return;
  const now = Date.now();
  const expiry = repairCooldowns.get(tower) || 0;
  btn.classList.toggle('cooldown', now < expiry);
}

/** repositionWrenches — call once per frame from main.js.
 * Shows wrench buttons above any damaged friendly ('you') tower.
 * Hides the button when hp is full or tower is dead.
 */
export function repositionWrenches() {
  ensureWrenchContainer();
  // Drop buttons whose towers were replaced by battle.reset() (ghost-wrench fix)
  for (const [tower, btn] of wrenchEls) {
    if (!S.towers.includes(tower)) { btn.remove(); wrenchEls.delete(tower); }
  }
  for (const tower of S.towers) {
    if (tower.side !== 'you' || tower.dead) {
      // Hide wrench if it exists
      const btn = wrenchEls.get(tower);
      if (btn) btn.style.display = 'none';
      continue;
    }

    const damaged = tower.hp < tower.maxhp;
    const btn = damaged ? getOrCreateWrench(tower) : wrenchEls.get(tower);
    if (!btn) continue;

    if (!damaged) {
      btn.style.display = 'none';
      continue;
    }

    btn.style.display = 'flex';

    // Position above the tower sprite — offset -90px in world coords from tower centre
    const screenPos = worldToScreen(tower.x, tower.y - 90);
    btn.style.left = screenPos.x + 'px';
    btn.style.top  = screenPos.y + 'px';

    // Refresh cooldown styling each frame (cheap)
    updateWrenchCooldown(tower);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHARGE BUTTON (fixed panel button; lives outside the canvas)
// ─────────────────────────────────────────────────────────────────────────────

function updateChargeButton() {
  if (!chargeBtn) return;
  const onCooldown = Date.now() < chargeCooldownExpiry;
  chargeBtn.classList.toggle('cooldown', onCooldown);
  if (onCooldown) {
    const remaining = Math.ceil((chargeCooldownExpiry - Date.now()) / 1000);
    chargeBtn.textContent = '⚡ ' + remaining + 's';
  } else {
    chargeBtn.textContent = '⚡ CHARGE';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC INIT — call once from main.js after battle.reset()
// ─────────────────────────────────────────────────────────────────────────────

/** initGates — inject styles and create persistent UI elements.
 * @param {Object} _profile  — the active profile (currently unused here; fetched
 *                             fresh on each gate open so stats are always current)
 */
export function initGates(_profile) {
  injectStyles();
  ensureWrenchContainer();

  // Clear stale wrench buttons from any previous battle
  // (new tower objects mean the WeakMap entries are fresh; old DOM nodes would accumulate)
  if (wrenchContainer) wrenchContainer.innerHTML = '';

  // Remove any stale charge button from a previous battle
  const old = document.getElementById('gate-charge-btn');
  if (old) old.remove();

  chargeCooldownExpiry = 0;

  chargeBtn = document.createElement('button');
  chargeBtn.id = 'gate-charge-btn';
  chargeBtn.textContent = '⚡ CHARGE';

  chargeBtn.addEventListener('click', () => {
    if (S.paused || S.over) return;
    if (Date.now() < chargeCooldownExpiry) return;
    openChargeGate();
  });

  document.body.appendChild(chargeBtn);

  // Refresh cooldown display ~every second (for countdown text)
  const cooldownInterval = setInterval(() => {
    if (!document.body.contains(chargeBtn)) { clearInterval(cooldownInterval); return; }
    updateChargeButton();
  }, 1000);
}
