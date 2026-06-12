// src/deck-ui.js — Deck / collection screen overlay.
// Kid-first, picture-first UI (6yo-proof).
//
// showDeckScreen(profile, onDone)
//   • Top: 3 equip slots (big, tappable to select).
//   • Bottom: bench grid — all roster entries; unlocked show portrait, locked show
//     silhouette + 🔒 + "Arena N".
//   • Tap bench card → swap into first empty slot, else into the selected slot.
//   • Each card shows cost badge + composition dots row (count·val math content).
//   • Persists profile.deck = [ids] via store.saveProfile.
//   • DONE button closes and calls onDone().

import { ROSTER, byId, unlockedFor } from '../data/roster.js';
import { saveProfile } from './store.js';
import { getPortraits } from './render3d.js';
import { getProgress } from './arenas.js';

// ─── style ────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('deck-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'deck-ui-style';
  s.textContent = `
#deck-overlay {
  position: fixed; inset: 0; z-index: 95;
  background: #120828;
  display: flex; flex-direction: column;
  align-items: center;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  color: #fff;
  overflow-y: auto;
  padding: 16px 12px 40px;
  box-sizing: border-box;
}
#deck-overlay h1 {
  font-size: clamp(22px, 5vw, 38px);
  color: #ffcf4d; margin: 0 0 4px;
  text-shadow: 0 2px 8px #000;
  text-align: center;
}
#deck-overlay .deck-subtitle {
  font-size: clamp(12px, 2.8vw, 17px);
  color: #c026a8; margin: 0 0 18px;
  text-align: center;
}

/* ── Equip slots row ── */
.deck-slots {
  display: flex; gap: 10px; justify-content: center;
  margin-bottom: 18px;
  width: 100%; max-width: 480px;
}
.deck-slot {
  flex: 1; max-width: 130px;
  aspect-ratio: 1/1.1;
  background: linear-gradient(180deg, rgba(255,244,214,.95), rgba(255,217,138,.95));
  border: 4px solid #ffcf4d;
  border-radius: 16px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end;
  position: relative;
  cursor: pointer;
  transition: transform .12s, border-color .12s, box-shadow .12s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  overflow: hidden;
}
.deck-slot.selected {
  border-color: #2b7de0;
  box-shadow: 0 0 18px rgba(43,125,224,.75);
  transform: translateY(-5px);
}
.deck-slot img {
  max-height: 72%; object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
}
.deck-slot .slot-name {
  font-size: clamp(10px, 2.4vw, 14px);
  font-weight: 900; color: #241043;
  text-align: center;
  padding: 0 4px 4px;
  line-height: 1.2;
}
.deck-slot .slot-dots {
  display: flex; gap: 3px; padding-bottom: 6px;
  justify-content: center; flex-wrap: wrap;
}
.deck-slot .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #c026a8; border: 1.5px solid #fff;
  flex-shrink: 0;
}
.deck-slot .slot-cost {
  position: absolute; top: -6px; left: -6px;
  width: 26px; height: 26px; border-radius: 50%;
  background: #c026a8; border: 2px solid #fff;
  color: #fff; font-size: 13px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  z-index: 2;
}
/* Empty slot */
.deck-slot.empty {
  background: rgba(42,26,77,.5);
  border: 4px dashed #5b3fa0;
}
.deck-slot.empty .slot-empty-label {
  font-size: clamp(11px, 2.6vw, 16px);
  color: #7a5a9a; font-weight: 900;
  text-align: center; padding-bottom: 12px;
}

/* ── Bench grid ── */
.deck-bench-label {
  font-size: clamp(13px, 3vw, 18px);
  color: #ffcf4d; font-weight: 900;
  margin-bottom: 10px;
  align-self: flex-start;
  padding-left: 4px;
}
.deck-bench {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  width: 100%; max-width: 520px;
  margin-bottom: 24px;
}
.bench-card {
  background: linear-gradient(180deg, rgba(255,244,214,.9), rgba(255,217,138,.9));
  border: 3px solid #ffcf4d;
  border-radius: 14px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end;
  aspect-ratio: 1/1.15;
  position: relative;
  cursor: pointer;
  transition: transform .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  overflow: hidden;
  padding-bottom: 4px;
}
.bench-card:active { transform: scale(.93); }
.bench-card.locked {
  background: #1a1a2e;
  border-color: #3a3a5e;
  cursor: default;
}
.bench-card img {
  max-height: 64%; object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
}
.bench-card.locked img {
  filter: brightness(0);
}
.bench-card .bench-name {
  font-size: clamp(9px, 2.2vw, 12px);
  font-weight: 900; color: #241043;
  text-align: center; padding: 0 3px;
  line-height: 1.2;
}
.bench-card.locked .bench-name {
  color: #7a7a9a;
}
.bench-card .bench-dots {
  display: flex; gap: 2px; padding: 2px 0 3px;
  justify-content: center; flex-wrap: wrap;
}
.bench-card .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #c026a8; border: 1.5px solid #fff;
  flex-shrink: 0;
}
.bench-card.locked .dot {
  background: #5a5a7a; border-color: #3a3a5e;
}
.bench-card .bench-cost {
  position: absolute; top: -5px; left: -5px;
  width: 23px; height: 23px; border-radius: 50%;
  background: #c026a8; border: 2px solid #fff;
  color: #fff; font-size: 11px; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  z-index: 2;
}
.bench-card.locked .bench-cost {
  background: #3a3a5e; border-color: #5a5a7a; color: #7a7a9a;
}
.bench-card .bench-lock {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -60%);
  font-size: clamp(20px, 5vw, 32px);
  pointer-events: none;
}
.bench-card .bench-arena {
  font-size: clamp(9px, 2.2vw, 12px);
  color: #7a7a9a; font-weight: 700;
  text-align: center;
  padding-bottom: 4px;
}
/* Cards already in an equip slot show dimmed in the bench */
.bench-card.equipped-bench {
  opacity: 0.45;
  border-color: #a08030;
  cursor: default;
}

/* ── Done button ── */
.deck-done-btn {
  padding: 16px 48px;
  font-size: clamp(18px, 4vw, 26px);
  font-weight: 900;
  border-radius: 16px; border: none;
  background: #ffcf4d; color: #241043;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: transform .1s;
  margin-top: 4px;
}
.deck-done-btn:active { transform: scale(.95); }
.deck-done-btn:hover  { background: #ffe080; }
`;
  document.head.appendChild(s);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeDots(count, isLocked) {
  const row = document.createElement('div');
  row.className = (isLocked ? 'bench-dots' : 'slot-dots');
  for (let i = 0; i < count; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    row.appendChild(d);
  }
  return row;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * showDeckScreen — show the collection/equip overlay.
 * @param {Object}   profile  — full profile object
 * @param {Function} onDone   — called when the player taps DONE
 */
export function showDeckScreen(profile, onDone) {
  injectStyles();
  document.getElementById('deck-overlay')?.remove();

  const progress = getProgress(profile);
  const unlocked = unlockedFor(progress);
  const unlockedIds = new Set(unlocked.map(e => e.id));

  // Ensure profile.deck exists with valid default
  if (!Array.isArray(profile.deck) || profile.deck.length === 0) {
    profile.deck = ['archers', 'knights', 'spearman'];
  }
  // Normalize: keep only ids that exist in roster (drop stale ids)
  profile.deck = profile.deck.filter(id => byId(id));
  // Pad to 3 if somehow shorter (fill from unlocked that aren't already in deck)
  const defaults = ['archers', 'knights', 'spearman'];
  for (const id of defaults) {
    if (profile.deck.length >= 3) break;
    if (!profile.deck.includes(id)) profile.deck.push(id);
  }

  // Equip state: 3 slots, each holds a roster id or null
  const equip = profile.deck.slice(0, 3);
  while (equip.length < 3) equip.push(null);

  let selectedSlot = 0;  // index of the currently-selected equip slot

  // Portrait cache (from 3D render; may be empty before assets load)
  let portraits = {};
  getPortraits().then(p => { portraits = p || {}; refreshAll(); }).catch(() => {});

  // ── Build overlay ──────────────────────────────────────────────────────────

  const ov = document.createElement('div');
  ov.id = 'deck-overlay';

  const h1 = document.createElement('h1');
  h1.textContent = 'My Team';
  ov.appendChild(h1);

  const sub = document.createElement('p');
  sub.className = 'deck-subtitle';
  sub.textContent = 'Tap a character to swap into the glowing slot!';
  ov.appendChild(sub);

  // ── Equip slots ──────────────────────────────────────────────────────────

  const slotsRow = document.createElement('div');
  slotsRow.className = 'deck-slots';

  const slotEls = [];

  function buildSlot(idx) {
    const el = document.createElement('div');
    el.className = 'deck-slot' + (equip[idx] ? '' : ' empty') + (idx === selectedSlot ? ' selected' : '');
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      selectedSlot = idx;
      refreshAll();
    });
    slotEls.push(el);
    slotsRow.appendChild(el);
  }

  for (let i = 0; i < 3; i++) buildSlot(i);
  ov.appendChild(slotsRow);

  // ── Bench label + grid ───────────────────────────────────────────────────

  const benchLbl = document.createElement('div');
  benchLbl.className = 'deck-bench-label';
  benchLbl.textContent = 'Characters';
  ov.appendChild(benchLbl);

  const bench = document.createElement('div');
  bench.className = 'deck-bench';
  ov.appendChild(bench);

  // ── Done button ───────────────────────────────────────────────────────────

  const doneBtn = document.createElement('button');
  doneBtn.className = 'deck-done-btn';
  doneBtn.textContent = 'DONE';
  doneBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // Persist the equipped ids (filter nulls, should be none after defaults)
    profile.deck = equip.filter(Boolean);
    saveProfile(profile);
    ov.remove();
    onDone();
  });
  ov.appendChild(doneBtn);

  document.body.appendChild(ov);

  // ── Render helpers ────────────────────────────────────────────────────────

  function imgEl(spr, cls, alt) {
    const img = document.createElement('img');
    img.className = cls || '';
    img.alt = alt || spr;
    const portraitUrl = portraits[spr];
    if (portraitUrl) {
      img.src = portraitUrl;
    } else {
      img.src = 'assets/fantasy_t/clean/' + spr + '.png';
      img.onerror = () => { img.style.display = 'none'; };
    }
    return img;
  }

  function renderSlot(idx) {
    const el = slotEls[idx];
    el.innerHTML = '';
    el.className = 'deck-slot' + (equip[idx] ? '' : ' empty') + (idx === selectedSlot ? ' selected' : '');
    const id = equip[idx];
    if (id) {
      const entry = byId(id);
      if (entry) {
        const costBadge = document.createElement('div');
        costBadge.className = 'slot-cost';
        costBadge.textContent = entry.cost;
        el.appendChild(costBadge);

        el.appendChild(imgEl(entry.spr, '', entry.name));

        const nm = document.createElement('div');
        nm.className = 'slot-name';
        nm.textContent = entry.name;
        el.appendChild(nm);

        el.appendChild(makeDots(entry.count, false));
      }
    } else {
      const lbl = document.createElement('div');
      lbl.className = 'slot-empty-label';
      lbl.textContent = 'Tap a\ncharacter';
      el.appendChild(lbl);
    }
  }

  function renderBench() {
    bench.innerHTML = '';
    for (const entry of ROSTER) {
      const isLocked = !unlockedIds.has(entry.id);
      const isEquipped = equip.includes(entry.id);

      const card = document.createElement('div');
      // Equipped cards show dimmed in the bench so the player sees what's in use
      card.className = 'bench-card' + (isLocked ? ' locked' : '') + (isEquipped ? ' equipped-bench' : '');

      // Cost badge
      const costBadge = document.createElement('div');
      costBadge.className = 'bench-cost';
      costBadge.textContent = entry.cost;
      card.appendChild(costBadge);

      if (isLocked) {
        // Silhouette + lock
        const silImg = imgEl(entry.spr, '', entry.name);
        card.appendChild(silImg);

        const lockEl = document.createElement('div');
        lockEl.className = 'bench-lock';
        lockEl.textContent = '🔒';
        card.appendChild(lockEl);

        const arenaLbl = document.createElement('div');
        arenaLbl.className = 'bench-arena';
        arenaLbl.textContent = 'Arena ' + entry.arena;
        card.appendChild(arenaLbl);

        card.appendChild(makeDots(entry.count, true));
      } else {
        // Unlocked: portrait + name + dots
        card.appendChild(imgEl(entry.spr, '', entry.name));

        const nm = document.createElement('div');
        nm.className = 'bench-name';
        nm.textContent = entry.name;
        card.appendChild(nm);

        card.appendChild(makeDots(entry.count, false));

        // Tap to equip
        card.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          tapBenchCard(entry.id);
        });
      }

      bench.appendChild(card);
    }
  }

  function tapBenchCard(id) {
    // If already equipped somewhere, do nothing (can't duplicate)
    if (equip.includes(id)) return;

    // Swap into the first empty slot if one exists, else into the selected slot.
    // "Swaps only" rule: equip[target] gets replaced (old card goes back to bench).
    const firstEmpty = equip.indexOf(null);
    const target = firstEmpty !== -1 ? firstEmpty : selectedSlot;

    equip[target] = id;
    // Advance selection to next slot (cycles) so rapid taps fill slots sequentially
    selectedSlot = (target + 1) % 3;
    refreshAll();
  }

  function refreshAll() {
    for (let i = 0; i < 3; i++) renderSlot(i);
    renderBench();
  }

  // Initial render
  refreshAll();
}
