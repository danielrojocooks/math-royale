// src/gates.js — Cannon gate (Epic E3; reward reworked after the 6/12 playtest).
//
// THE GATE: a card floats over the action showing a direct addition fact:
// "3 + 3 = ?". The kid answers by TAPPING THE CARD THAT MANY TIMES (counting
// with his finger). A short idle beat after the last tap submits. Overshooting
// past the answer is an instant gentle miss (so tap-spam can't brute-force it
// — only counting works). Battle DOES NOT pause.
//
// REWARD: solving fires your king's catapult, which kills the enemy nearest your
// tower (a big on-field explosion). Playtest finding: an abstract +power/heal
// reward lost to the battle; an explosion the kid CAUSED does not. The cannon
// shot is the SOLE reward (the old +3 power deploy bonus also made the game too
// easy, so it was dropped).
//
// FACT-ID SCHEME: "A+B" (e.g. "3+4"), direct addition within 10.
// TODO (E4): replace FACT_POOL with arena pools from arenas.js.
//
// The old charge gate was cut (design feedback: interruptive, didn't fit).
// Build-exact-N lives on in catapult-puzzle.html -> Training Grounds (E8).

import { S, cannonPickTarget, cannonResolve } from './battle.js';
import { worldToScreen, fireCannon, fireDragon } from './render3d.js';
import { pickGateFact, scaffoldTier, recordAttempt } from './mastery.js';
import { loadProfile, saveProfile, getActiveProfileId } from './store.js';

// ─── fact pools (E4 swaps these per arena via setFactPools) ──────────────────
let FACT_POOL = [];
for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) FACT_POOL.push(a + '+' + b);
let EARLIER_POOLS = [];

/** setFactPools — arena system (E4) injects the current arena's pool and
 *  earlier arenas' pools (for the 20% spaced-review stream). */
export function setFactPools(pool, earlier) {
  FACT_POOL = pool;
  EARLIER_POOLS = earlier || [];
}

const IDLE_SUBMIT_MS = 1000;   // pause after last tap = submit
const COOLDOWN_MS = 8000;      // per-board cooldown between math cards

let cardEl = null;             // the single floating card (one at a time)
let cardState = null;          // { tower, factId, a, b, sum, count, firstTapAt, idleTimer, tier, missed }
let cooldownUntil = 0;

// ─── styles ──────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('gates-style')) return;
  const s = document.createElement('style');
  s.id = 'gates-style';
  s.textContent = `
#gate-card {
  position: fixed; z-index: 60;
  left: 50%; top: 26%;               /* center, below the enemy castle, above the river */
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(255,244,214,.55), rgba(255,217,138,.55));
  backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
  border: 4px solid rgba(255,207,77,.85);
  border-radius: 16px;
  padding: 8px 16px 10px;
  min-width: 150px; max-width: 200px;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.45);
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none; -webkit-user-select: none;
  animation: gate-drop-in .3s cubic-bezier(.2,1.4,.6,1),
             gate-breathe 1.6s ease-in-out .4s infinite;  /* gentle pulse — draws the eye */
}
@keyframes gate-breathe {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50%      { transform: translateX(-50%) scale(1.06); }
}
@keyframes gate-drop-in { from { transform: translateX(-50%) translateY(-40px) scale(.6); opacity: 0; }
                          to   { transform: translateX(-50%) translateY(0) scale(1);  opacity: 1; } }
#gate-card .eq {
  font-size: clamp(26px, 5vw, 36px);
  font-weight: 900; color: #5a3a10;
  letter-spacing: 1px; line-height: 1.1;
}
#gate-card .dots { min-height: 18px; padding: 4px 0 2px;
  display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
#gate-card .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
#gate-card .dot.a { background: #2b7de0; }
#gate-card .dot.b { background: #c026a8; }
#gate-card .count {
  font-size: clamp(30px, 6vw, 46px);
  font-weight: 900; color: #2b7de0;
  line-height: 1; min-height: 1em;
  text-shadow: 0 1px 0 #fff;
}
#gate-card .pips { min-height: 14px; display: flex; flex-wrap: wrap; gap: 3px;
  justify-content: center; max-width: 200px; margin: 2px auto 0; }
#gate-card .pip { width: 11px; height: 11px; border-radius: 50%; background: #22c24a;
  animation: gate-pip .15s cubic-bezier(.2,1.6,.6,1); }
@keyframes gate-pip { from { transform: scale(0); } to { transform: scale(1); } }
#gate-card .hint { font-size: 13px; font-weight: 700; color: #a4671b; min-height: 1.1em; }
#gate-card .reward { font-size: 11px; font-weight: 900; color: #a4671b; }
#gate-card .ans {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px;
}
#gate-card .ans button {
  background: #3a1a6e; border: 4px solid #5b3fa0; border-radius: 14px;
  color: #fff; font-family: inherit;
  font-size: clamp(22px, 5vw, 34px); font-weight: 900;
  padding: 10px 6px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: transform .1s;
}
#gate-card .ans button:active { transform: scale(.93); }
#gate-card .ans button.wrong { border-color: #e23b3b; background: #4a1025; }
#gate-card .ans button.right { border-color: #22c24a; background: #143d1a; }
#gate-card.wobble { animation: gate-wobble .4s ease; }
@keyframes gate-wobble {
  0%,100% { transform: translateX(-50%) rotate(0); }
  25% { transform: translateX(calc(-50% - 7px)) rotate(-4deg); }
  75% { transform: translateX(calc(-50% + 7px)) rotate(4deg); }
}
#gate-card.solved { animation: gate-solved .5s ease forwards; pointer-events: none; }
@keyframes gate-solved {
  30% { transform: translateX(-50%) scale(1.15); }
  100% { transform: translateX(-50%) translateY(-60px) scale(.4); opacity: 0; }
}
.gate-confetti { position: fixed; width: 9px; height: 9px; z-index: 61;
  pointer-events: none; border-radius: 2px; animation: gate-conf .7s ease-out forwards; }
@keyframes gate-conf { to { transform: translate(var(--dx), var(--dy)) rotate(540deg); opacity: 0; } }
`;
  document.head.appendChild(s);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function getProfile() {
  const id = getActiveProfileId();
  return id ? loadProfile(id) : null;
}
function parseFact(factId) {
  const m = factId.match(/^(\d+)\+(\d+)$/);
  return m ? { a: +m[1], b: +m[2], sum: +m[1] + +m[2] } : null;
}
function renderDots(el, a, b) {
  el.innerHTML = '';
  for (let i = 0; i < a; i++) { const d = document.createElement('span'); d.className = 'dot a'; el.appendChild(d); }
  for (let i = 0; i < b; i++) { const d = document.createElement('span'); d.className = 'dot b'; el.appendChild(d); }
}
function confettiAt(x, y) {
  const colors = ['#ffcf4d', '#c026a8', '#2b7de0', '#22c24a', '#fff'];
  for (let i = 0; i < 14; i++) {
    const c = document.createElement('span');
    c.className = 'gate-confetti';
    c.style.left = x + 'px'; c.style.top = y + 'px';
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    c.style.setProperty('--dy', (-40 - Math.random() * 110) + 'px');
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 750);
  }
}

// ─── answer-choice distractors (recall mode) ─────────────────────────────────
function makeChoices(sum) {
  const set = new Set([sum]);
  for (const d of [sum - 1, sum + 1, sum - 2, sum + 2, sum + 3]) {
    if (set.size >= 4) break;
    if (d >= 1) set.add(d);
  }
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── card lifecycle ──────────────────────────────────────────────────────────
// reward: { tower } — tower is the anchor (your king); solving fires its cannon
function openCard(reward) {
  const profile = getProfile();
  if (!profile) return;

  const factId = pickGateFact(profile.facts, FACT_POOL, EARLIER_POOLS, {});
  const f = parseFact(factId);
  if (!f) return;
  const tier = scaffoldTier(profile.facts, factId);
  // INPUT GRADUATES WITH MASTERY: T0/T1 = tap-to-count (production/counting stage),
  // T2 = pick the answer (recall stage). The engine demotes on misses, so a
  // guessed-wrong fact slides back to counting mode automatically.
  const mode = tier >= 2 ? 'choose' : 'count';

  cardState = { reward, profile, factId, ...f, mode, count: 0,
    firstTapAt: mode === 'choose' ? Date.now() : 0, idleTimer: null, tier, missed: false };

  cardEl = document.createElement('div');
  cardEl.id = 'gate-card';
  const rewardLabel = '💥 FIRE THE CANNON!';
  if (mode === 'count') {
    cardEl.innerHTML = `
      <div class="reward">${rewardLabel}</div>
      <div class="eq">${f.a} + ${f.b} = ?</div>
      <div class="dots"></div>
      <div class="count">tap!</div>
      <div class="pips"></div>
      <div class="hint"></div>`;
    // T0: dots from the start; T1: after a miss; T2: never (CURRICULUM.md scaffold tiers)
    if (tier === 0) renderDots(cardEl.querySelector('.dots'), f.a, f.b);
    cardEl.addEventListener('pointerdown', onTap);
  } else {
    cardEl.innerHTML = `
      <div class="reward">${rewardLabel}</div>
      <div class="eq">${f.a} + ${f.b} = ?</div>
      <div class="ans"></div>
      <div class="hint"></div>`;
    const grid = cardEl.querySelector('.ans');
    for (const choice of makeChoices(f.sum)) {
      const b = document.createElement('button');
      b.textContent = choice;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!cardState) return;
        if (choice === f.sum) { b.classList.add('right'); resolve(true); }
        else {
          b.classList.add('wrong');
          recordMissKeepCard();
          setTimeout(() => b.classList.remove('wrong'), 600);
        }
      });
      grid.appendChild(b);
    }
  }

  document.body.appendChild(cardEl);
  positionCard();
}

// choose-mode miss: record it, wobble, keep the same card up for retry
function recordMissKeepCard() {
  const cs = cardState;
  if (!cs) return;
  const elapsedMs = Date.now() - cs.firstTapAt;
  recordAttempt(cs.profile.facts, cs.factId, false, elapsedMs,
    { thresholdMs: cs.profile.settings.fluencyMs });
  saveProfile(cs.profile);
  cs.missed = true;
  cardEl.classList.remove('wobble'); void cardEl.offsetWidth; cardEl.classList.add('wobble');
  cardEl.querySelector('.hint').textContent = 'try again!';
  setTimeout(() => { if (cardEl) cardEl.querySelector('.hint').textContent = ''; }, 1200);
}

function onTap(e) {
  e.preventDefault();
  const cs = cardState;
  if (!cs) return;
  if (!cs.firstTapAt) cs.firstTapAt = Date.now();   // timing starts at FIRST tap, not card-appear
  cs.count++;

  cardEl.querySelector('.count').textContent = cs.count;
  const pip = document.createElement('span'); pip.className = 'pip';
  cardEl.querySelector('.pips').appendChild(pip);

  clearTimeout(cs.idleTimer);

  if (cs.count > cs.sum) { resolve(false); return; }  // overshoot = instant gentle miss
  cs.idleTimer = setTimeout(() => resolve(cs.count === cs.sum), IDLE_SUBMIT_MS);
}

function resolve(correct) {
  const cs = cardState;
  if (!cs) return;
  const elapsedMs = Date.now() - (cs.firstTapAt || Date.now());

  recordAttempt(cs.profile.facts, cs.factId, correct, elapsedMs,
    { thresholdMs: cs.profile.settings.fluencyMs });
  saveProfile(cs.profile);

  if (correct) {
    // the reward IS the cannon shot: pick a target, fire, kill on impact.
    // (No +power/heal — the on-field boom is the whole payoff. Playtest: an
    // abstract reward lost to the battle; an explosion the kid caused does not.)
    // EVALUATION: dragon fires on every solve so it can be seen/tuned. Once the
    // model looks right, this becomes per-arena (cannon vs dragon, alternating).
    const target = cannonPickTarget();
    if (target) fireDragon(target.x, target.y, () => cannonResolve(target));
    const r = cardEl.getBoundingClientRect();
    confettiAt(r.left + r.width / 2, r.top + r.height / 2);
    cardEl.classList.add('solved');
    cooldownUntil = Date.now() + COOLDOWN_MS;
    const el = cardEl;                       // close over; cardState may repopulate
    setTimeout(() => el.remove(), 550);
    cardEl = null; cardState = null;
  } else {
    // miss: wobble, reset count, scaffold per tier, SAME fact, try again
    cs.missed = true; cs.count = 0; cs.firstTapAt = 0;
    cardEl.classList.remove('wobble'); void cardEl.offsetWidth; cardEl.classList.add('wobble');
    cardEl.querySelector('.count').textContent = 'tap!';
    cardEl.querySelector('.pips').innerHTML = '';
    cardEl.querySelector('.hint').textContent = 'try again!';
    if (cs.tier <= 1) renderDots(cardEl.querySelector('.dots'), cs.a, cs.b);  // T1 reveals dots on miss
    setTimeout(() => { if (cardEl) cardEl.querySelector('.hint').textContent = ''; }, 1200);
  }
}

function positionCard() {
  // Fixed CSS home (upper-left corner) — fully off the battlefield by design.
}

function dismissCard() {
  clearTimeout(cardState?.idleTimer);
  cardEl?.remove();
  cardEl = null; cardState = null;
}

// ─── public API ──────────────────────────────────────────────────────────────

/** initGates — inject styles, reset gate state. Call after battle.reset(). */
export function initGates() {
  injectStyles();
  dismissCard();
  cooldownUntil = 0;
  // kill leftovers from the old modal design, if any
  document.getElementById('gate-charge-btn')?.remove();
}

/** updateGates — call once per frame. Spawns/positions/retires the repair card. */
export function updateGates() {
  // game over: clear the card
  if (S.over) { if (cardEl) dismissCard(); return; }

  // active card: keep it anchored; retire it if its anchor tower died or got replaced
  if (cardEl) {
    const t = cardState.reward.tower;
    if (t.dead || !S.towers.includes(t)) { dismissCard(); return; }
    positionCard();
    return;
  }

  // no card: spawn one whenever off cooldown — the math should always be on offer.
  // Solving it fires the king's cannon (the sole reward). Anchored to your king.
  if (Date.now() < cooldownUntil) return;
  const king = S.towers.find(t => t.side === 'you' && t.kind === 'king' && !t.dead);
  if (king) openCard({ tower: king });
}
