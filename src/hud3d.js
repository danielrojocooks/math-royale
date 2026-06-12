// src/hud3d.js — DOM HUD for the 3D renderer: card hand, elixir bar, damage
// popups, win/lose banner. The 2D unit portraits become the card art.
// Reads battle state S each frame; player actions go through battle exports.
import { DECK, PANEL_Y } from '../data/units.js';
import * as battle from './battle.js';
import { worldToScreen } from './render3d.js';

let root, elixCells, elixNum, cardEls = [], banner, bannerText;
const popEls = new Map();

function injectStyles() {
  if (document.getElementById('hud3d-style')) return;
  const s = document.createElement('style');
  s.id = 'hud3d-style';
  s.textContent = `
#hud { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  background: rgba(36, 16, 67, .58);
  backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  border-top: 3px solid rgba(255, 207, 77, .8);
  padding: 5px 8px calc(env(safe-area-inset-bottom, 0px) + 5px);
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  -webkit-user-select: none; user-select: none; }
#hud .elix-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
#hud .elix-num { width: 28px; height: 28px; border-radius: 50%; background: #c026a8;
  border: 2px solid #fff; color: #fff; font-weight: 900; font-size: 15px;
  display: flex; align-items: center; justify-content: center; flex: none; }
#hud .elix-label { color: #ffcf4d; font-size: 11px; font-weight: 900; letter-spacing: 1px; flex: none; }
#hud .elix-bar { flex: 1; display: flex; gap: 2px; }
#hud .elix-cell { flex: 1; height: 11px; border-radius: 4px; background: rgba(42,26,77,.7);
  border: 1px solid #5b3fa0; }
#hud .elix-cell.on { background: linear-gradient(180deg, #ff5fae, #c026a8); border-color: #ff9bd8; }
#hud .cards { display: flex; gap: 6px; justify-content: center; }
#hud .card { flex: 1; max-width: 86px; aspect-ratio: 1/1; position: relative;
  background: linear-gradient(180deg, rgba(255,244,214,.94), rgba(255,217,138,.94));
  border: 3px solid #ffcf4d; border-radius: 12px;
  display: flex; align-items: flex-end; justify-content: center;
  cursor: pointer; transition: transform .12s, opacity .12s, border-color .12s;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; overflow: visible; }
#hud .card img { height: 90%; object-fit: contain; pointer-events: none;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.3)); }
#hud .card .cost { position: absolute; top: -7px; left: -7px; width: 24px; height: 24px;
  border-radius: 50%; background: #c026a8; border: 2px solid #fff; color: #fff;
  font-size: 13px; font-weight: 900; display: flex; align-items: center; justify-content: center; }
#hud .card.dim { opacity: .4; }
#hud .card.sel { transform: translateY(-8px); border-color: #2b7de0;
  box-shadow: 0 0 14px rgba(43,125,224,.7); }
.hud-pop { position: fixed; z-index: 45; pointer-events: none;
  font-family: "Trebuchet MS","Segoe UI",sans-serif; font-weight: 900;
  text-shadow: 0 2px 4px rgba(0,0,0,.8); transform: translate(-50%, -50%); }
#hud-banner { position: fixed; inset: 0; z-index: 48; display: none;
  align-items: center; justify-content: center; flex-direction: column;
  background: rgba(10,6,28,.72); pointer-events: none;
  font-family: "Trebuchet MS","Segoe UI",sans-serif; }
#hud-banner .big { font-size: clamp(44px, 12vw, 84px); font-weight: 900; }
#hud-banner .small { color: #fff; font-size: clamp(16px, 4vw, 26px); font-weight: 900; margin-top: 14px; }
`;
  document.head.appendChild(s);
}

export function initHud() {
  injectStyles();
  document.getElementById('hud')?.remove();
  document.getElementById('hud-banner')?.remove();

  root = document.createElement('div');
  root.id = 'hud';

  const row = document.createElement('div'); row.className = 'elix-row';
  elixNum = document.createElement('div'); elixNum.className = 'elix-num'; row.appendChild(elixNum);
  const lbl = document.createElement('div'); lbl.className = 'elix-label';
  lbl.textContent = '⚡ POWER'; row.appendChild(lbl);
  const bar = document.createElement('div'); bar.className = 'elix-bar';
  elixCells = [];
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('div'); c.className = 'elix-cell';
    bar.appendChild(c); elixCells.push(c);
  }
  row.appendChild(bar); root.appendChild(row);

  const cards = document.createElement('div'); cards.className = 'cards';
  cardEls = [];
  DECK.forEach((d, i) => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<span class="cost">${d.val}</span><img src="assets/fantasy_t/clean/${d.spr}.png" alt="${d.name}">`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (battle.S.over) return;
      battle.trySelectCard(i);
    });
    cards.appendChild(el); cardEls.push(el);
  });
  root.appendChild(cards);
  document.body.appendChild(root);

  banner = document.createElement('div'); banner.id = 'hud-banner';
  bannerText = document.createElement('div'); bannerText.className = 'big';
  const sub = document.createElement('div'); sub.className = 'small';
  sub.textContent = 'tap anywhere to continue';
  banner.appendChild(bannerText); banner.appendChild(sub);
  document.body.appendChild(banner);
}

export function updateHud(S) {
  if (!root) return;
  const e = Math.floor(S.elixir);
  elixNum.textContent = e;
  elixCells.forEach((c, i) => c.classList.toggle('on', i < e));
  cardEls.forEach((el, i) => {
    el.classList.toggle('dim', DECK[i].val > S.elixir);
    el.classList.toggle('sel', S.sel === i);
  });

  // damage popups follow battle's S.pops
  const seen = new Set();
  for (const q of S.pops) {
    seen.add(q);
    let el = popEls.get(q);
    if (!el) {
      el = document.createElement('div'); el.className = 'hud-pop';
      el.textContent = q.text; el.style.color = q.color;
      el.style.fontSize = (q.big ? 34 : 22) + 'px';
      document.body.appendChild(el); popEls.set(q, el);
    }
    const p = worldToScreen(q.x, q.y);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.opacity = Math.max(0, q.life);
  }
  for (const [q, el] of popEls) if (!seen.has(q)) { el.remove(); popEls.delete(q); }

  // banner
  if (S.over) {
    banner.style.display = 'flex';
    bannerText.textContent = S.over === 'WIN' ? 'YOU WIN! 🎉' : 'TRY AGAIN';
    bannerText.style.color = S.over === 'WIN' ? '#7dff8a' : '#ff8a8a';
  } else banner.style.display = 'none';
}
