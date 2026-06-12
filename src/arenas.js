// src/arenas.js — Arena progression logic + arena select screen.
//
// Flow driven by showArenaSelect(profile, onPlay, onBoss):
//   • Renders a vertical ladder of arena cards.
//   • Cleared arenas: bright + checkmark.
//   • Current arena: PLAY button + BOSS button (greyed until fluency ≥ 80%).
//   • Locked arenas: dark silhouette + padlock.
//   • onPlay(arenaId)  — called when the PLAY button is tapped.
//   • onBoss(arenaId)  — called when the lit BOSS button is tapped.
//
// Profile extension (defaults gracefully on profiles missing the field):
//   profile.progress = { cleared: number[], current: number }
//
// Boss win → advanceArena(profile): adds arena to cleared, bumps current.
// Call saveProfile(profile) after advanceArena before returning to arena select.

import { ARENAS, getArena } from '../data/arenas.js';
import { arenaFluentPct } from './mastery.js';
import { saveProfile } from './store.js';

// ─── progress helpers ─────────────────────────────────────────────────────────

/** Return progress, defaulting missing field. Does NOT mutate profile. */
export function getProgress(profile) {
  return profile.progress ?? { cleared: [], current: 1 };
}

/** Ensure profile.progress exists (mutates profile if needed). */
export function ensureProgress(profile) {
  if (!profile.progress) {
    profile.progress = { cleared: [], current: 1 };
  }
}

/**
 * Mark arena cleared and advance current to arenaId+1 (capped at last arena).
 * Mutates profile.progress in place. Call saveProfile() after this.
 */
export function advanceArena(profile, arenaId) {
  ensureProgress(profile);
  const p = profile.progress;
  if (!p.cleared.includes(arenaId)) p.cleared.push(arenaId);
  const maxId = ARENAS[ARENAS.length - 1].id;
  p.current = Math.min(arenaId + 1, maxId);
}

/**
 * Build pool arrays for a given arena, for use with gates.setFactPools.
 *   currentPool  : arenaId's factPool()
 *   earlierPools : factPool() for each arena with id < arenaId
 */
export function buildPools(arenaId) {
  const current = [];
  const earlier = [];
  for (const a of ARENAS) {
    if (a.id === arenaId) current.push(...a.factPool());
    else if (a.id < arenaId) earlier.push(a.factPool());
  }
  return { currentPool: current, earlierPools: earlier };
}

// ─── styles ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('arena-style')) return;
  const s = document.createElement('style');
  s.id = 'arena-style';
  s.textContent = `
/* ── Arena select overlay ── */
#arena-overlay {
  position: fixed; inset: 0; z-index: 90;
  background: #120828;
  display: flex; flex-direction: column;
  align-items: center;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  color: #fff;
  overflow-y: auto;
  padding: 20px 16px 40px;
  box-sizing: border-box;
}
#arena-overlay h1 {
  font-size: clamp(26px, 6vw, 44px);
  color: #ffcf4d; margin: 0 0 6px;
  text-shadow: 0 2px 8px #000;
  text-align: center;
}
#arena-overlay .arena-subtitle {
  font-size: clamp(13px, 3vw, 18px);
  color: #c026a8; margin: 0 0 24px;
  text-align: center;
}

/* ── Arena card ── */
.arena-card {
  width: 100%; max-width: 480px;
  border-radius: 22px;
  padding: 16px 20px 18px;
  margin-bottom: 14px;
  box-sizing: border-box;
  display: flex; flex-direction: column;
  gap: 8px;
  position: relative;
}
.arena-card.cleared {
  background: linear-gradient(160deg, #1a4a1a, #2a7a2a);
  border: 4px solid #44cc44;
}
.arena-card.current {
  background: linear-gradient(160deg, #2a1a5e, #4a2a9e);
  border: 4px solid #ffcf4d;
  box-shadow: 0 0 24px rgba(255,207,77,.35);
}
.arena-card.locked {
  background: #1a1a2e;
  border: 4px solid #3a3a5e;
  opacity: 0.6;
  filter: grayscale(60%);
}

/* card header row: emoji + name + status badge */
.arena-card-header {
  display: flex; align-items: center; gap: 10px;
}
.arena-emoji {
  font-size: clamp(28px, 7vw, 44px);
  line-height: 1;
}
.arena-name {
  font-size: clamp(18px, 4.5vw, 28px);
  font-weight: 900;
  flex: 1;
}
.arena-check {
  font-size: clamp(20px, 5vw, 32px);
}
.arena-lock {
  font-size: clamp(20px, 5vw, 32px);
  opacity: .7;
}

/* progress bar (current arena only) */
.arena-progress-wrap {
  display: flex; align-items: center; gap: 8px;
}
.arena-progress-bar {
  flex: 1; height: 12px;
  background: #2a1a5e;
  border-radius: 6px; border: 2px solid #5b3fa0;
  overflow: hidden;
}
.arena-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #c026a8, #ffcf4d);
  border-radius: 4px;
  transition: width .5s ease;
}
.arena-progress-label {
  font-size: 13px; color: #c8b8f0;
  white-space: nowrap; min-width: 40px;
  text-align: right;
}

/* button row */
.arena-btn-row {
  display: flex; gap: 10px; flex-wrap: wrap;
}
.arena-btn {
  flex: 1; min-width: 100px;
  padding: 14px 10px;
  font-size: clamp(17px, 4vw, 24px);
  font-weight: 900;
  border-radius: 14px; border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s, opacity .1s;
}
.arena-btn:active { transform: scale(.94); }
.arena-btn-play {
  background: #ffcf4d; color: #241043;
}
.arena-btn-play:hover { background: #ffe080; }
.arena-btn-boss {
  background: #c026a8; color: #fff;
  border: 3px solid #ff60d0;
}
.arena-btn-boss:hover { background: #e03ac0; }
.arena-btn-boss:disabled, .arena-btn-boss.locked-boss {
  background: #3a1a5e; color: #7a5a9a;
  border-color: #5a3a7e; cursor: not-allowed;
  opacity: .65;
}
.arena-btn-boss:disabled:active { transform: none; }

/* ── Unlock celebration overlay ── */
#unlock-overlay {
  position: fixed; inset: 0; z-index: 110;
  background: rgba(10, 2, 30, .92);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  color: #fff;
  padding: 20px;
  box-sizing: border-box;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
#unlock-overlay .unlock-label {
  font-size: clamp(20px, 5vw, 32px);
  color: #c026a8; font-weight: 900;
  margin-bottom: 8px;
  text-align: center;
}
#unlock-overlay .unlock-name {
  font-size: clamp(30px, 8vw, 56px);
  color: #ffcf4d; font-weight: 900;
  text-shadow: 0 0 24px #ffcf4d, 0 2px 8px #000;
  text-align: center;
  margin-bottom: 20px;
}
#unlock-overlay .unlock-sprite {
  width: min(200px, 42vw); height: min(200px, 42vw);
  object-fit: contain;
  filter: drop-shadow(0 0 28px #ffcf4d);
  animation: unlock-bounce .7s cubic-bezier(.2,1.5,.5,1);
}
@keyframes unlock-bounce {
  0%  { transform: scale(.1) rotate(-20deg); opacity: 0; }
  70% { transform: scale(1.12) rotate(4deg); opacity: 1; }
  100%{ transform: scale(1)    rotate(0deg); opacity: 1; }
}
#unlock-overlay .unlock-tap {
  margin-top: 28px;
  font-size: clamp(14px, 3.5vw, 20px);
  color: #9a88c0; font-weight: 700;
  animation: unlock-blink 1.2s ease-in-out infinite;
}
@keyframes unlock-blink { 0%,100%{opacity:1} 50%{opacity:.3} }

/* confetti (re-used from gate-confetti pattern) */
.arena-confetti {
  position: fixed; width: 10px; height: 10px; z-index: 112;
  pointer-events: none; border-radius: 2px;
  animation: arena-conf .8s ease-out forwards;
}
@keyframes arena-conf { to { transform: translate(var(--dx), var(--dy)) rotate(540deg); opacity: 0; } }
`;
  document.head.appendChild(s);
}

// ─── confetti helper ──────────────────────────────────────────────────────────
function launchConfetti() {
  const colors = ['#ffcf4d', '#c026a8', '#2b7de0', '#22c24a', '#fff', '#ff6b35'];
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('span');
    el.className = 'arena-confetti';
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.style.background = colors[i % colors.length];
    const angle = (i / 40) * Math.PI * 2 + Math.random() * .5;
    const dist = 140 + Math.random() * 220;
    el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    el.style.setProperty('--dy', Math.sin(angle) * dist - 60 + 'px');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }
}

// ─── unlock celebration ───────────────────────────────────────────────────────
/**
 * showUnlockCelebration — display the "new character unlocked" screen.
 * @param {Array<{name,spr}>} unlocks  characters unlocked
 * @param {Function} onDone            called after the player taps
 */
function showUnlockCelebration(unlocks, onDone) {
  if (!unlocks || unlocks.length === 0) { onDone(); return; }

  // Show one unlock at a time; chain through them if multiple
  let idx = 0;
  function showOne() {
    const u = unlocks[idx];
    launchConfetti();

    const ov = document.createElement('div');
    ov.id = 'unlock-overlay';

    const lbl = document.createElement('div');
    lbl.className = 'unlock-label';
    lbl.textContent = 'New character!';
    ov.appendChild(lbl);

    const nm = document.createElement('div');
    nm.className = 'unlock-name';
    nm.textContent = u.name;
    ov.appendChild(nm);

    const img = document.createElement('img');
    img.className = 'unlock-sprite';
    img.src = 'assets/fantasy_t/clean/' + u.spr + '.png';
    img.alt = u.name;
    ov.appendChild(img);

    const tap = document.createElement('div');
    tap.className = 'unlock-tap';
    tap.textContent = 'Tap anywhere to continue';
    ov.appendChild(tap);

    document.body.appendChild(ov);

    ov.addEventListener('pointerdown', () => {
      ov.remove();
      idx++;
      if (idx < unlocks.length) {
        showOne();
      } else {
        onDone();
      }
    }, { once: true });
  }
  showOne();
}

// ─── main public API ──────────────────────────────────────────────────────────

/**
 * showArenaSelect — render the arena ladder overlay.
 *
 * @param {Object}   profile   — full profile object (may lack .progress)
 * @param {Function} onPlay    — onPlay(arenaId) → starts a normal match
 * @param {Function} onBoss    — onBoss(arenaId) → starts a boss match
 */
export function showArenaSelect(profile, onPlay, onBoss) {
  injectStyles();
  ensureProgress(profile);
  const p = profile.progress;

  // Remove previous overlay if any (re-entry after a match)
  document.getElementById('arena-overlay')?.remove();

  const ov = document.createElement('div');
  ov.id = 'arena-overlay';

  // Heading
  const h1 = document.createElement('h1');
  h1.textContent = 'Choose Arena';
  ov.appendChild(h1);

  const sub = document.createElement('p');
  sub.className = 'arena-subtitle';
  sub.textContent = 'Beat the boss to unlock the next world!';
  ov.appendChild(sub);

  // Render a card per arena
  for (const arena of ARENAS) {
    const isCleared = p.cleared.includes(arena.id);
    const isCurrent = arena.id === p.current;
    const isLocked  = !isCleared && !isCurrent;

    const card = document.createElement('div');
    card.className = 'arena-card ' + (isCleared ? 'cleared' : isCurrent ? 'current' : 'locked');

    // Header: emoji + name + badge
    const header = document.createElement('div');
    header.className = 'arena-card-header';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'arena-emoji';
    emojiEl.textContent = isLocked ? '🔒' : arena.emoji;
    header.appendChild(emojiEl);

    const nameEl = document.createElement('div');
    nameEl.className = 'arena-name';
    nameEl.textContent = 'Arena ' + arena.id + ' — ' + arena.name;
    header.appendChild(nameEl);

    if (isCleared) {
      const ck = document.createElement('span');
      ck.className = 'arena-check';
      ck.textContent = '✅';
      header.appendChild(ck);
    } else if (isLocked) {
      const lk = document.createElement('span');
      lk.className = 'arena-lock';
      lk.textContent = '🔒';
      header.appendChild(lk);
    }

    card.appendChild(header);

    // Current arena: progress bar + PLAY + BOSS buttons
    if (isCurrent) {
      const pool = arena.factPool();
      const pct  = arenaFluentPct(profile.facts, pool);
      const bossReady = pct >= 80;

      // Progress bar
      const pwrap = document.createElement('div');
      pwrap.className = 'arena-progress-wrap';

      const bar = document.createElement('div');
      bar.className = 'arena-progress-bar';
      const fill = document.createElement('div');
      fill.className = 'arena-progress-fill';
      fill.style.width = Math.round(pct) + '%';
      bar.appendChild(fill);
      pwrap.appendChild(bar);

      const plbl = document.createElement('div');
      plbl.className = 'arena-progress-label';
      plbl.textContent = Math.round(pct) + '%';
      pwrap.appendChild(plbl);

      card.appendChild(pwrap);

      // Button row
      const btnRow = document.createElement('div');
      btnRow.className = 'arena-btn-row';

      const playBtn = document.createElement('button');
      playBtn.className = 'arena-btn arena-btn-play';
      playBtn.textContent = '⚔️ PLAY';
      playBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ov.remove();
        onPlay(arena.id);
      });
      btnRow.appendChild(playBtn);

      const bossBtn = document.createElement('button');
      bossBtn.className = 'arena-btn arena-btn-boss' + (bossReady ? '' : ' locked-boss');
      bossBtn.disabled = !bossReady;
      bossBtn.textContent = bossReady ? '💀 BOSS' : '💀 (practice more)';
      if (bossReady) {
        bossBtn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ov.remove();
          onBoss(arena.id);
        });
      }
      btnRow.appendChild(bossBtn);

      card.appendChild(btnRow);
    }

    // Cleared arena: just a replay button (nice-to-have, always available)
    if (isCleared) {
      const btnRow = document.createElement('div');
      btnRow.className = 'arena-btn-row';

      const replayBtn = document.createElement('button');
      replayBtn.className = 'arena-btn arena-btn-play';
      replayBtn.style.maxWidth = '160px';
      replayBtn.textContent = '🔄 Play again';
      replayBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        ov.remove();
        onPlay(arena.id);
      });
      btnRow.appendChild(replayBtn);

      card.appendChild(btnRow);
    }

    ov.appendChild(card);
  }

  document.body.appendChild(ov);
}

/**
 * handleBossWin — call this after a boss match is won.
 * Updates profile.progress, persists it, shows unlock celebration,
 * then calls onDone (which should re-open arenaSelect).
 *
 * @param {Object}   profile
 * @param {number}   arenaId   — the arena whose boss was just beaten
 * @param {Function} onDone    — called after celebration tap
 */
export function handleBossWin(profile, arenaId, onDone) {
  const arena = getArena(arenaId);
  advanceArena(profile, arenaId);
  saveProfile(profile);

  // Show unlock screen for each new character, then call onDone
  showUnlockCelebration(arena ? arena.unlocks : [], onDone);
}
