// Pointer input: hit-tests the card panel, deploys troops. No game rules here.
import { toWorld, cardRect } from './render2d.js';
import { DECK } from '../data/units.js';
import * as battle from './battle.js';

export function initInput(canvas) {
  function onDown(e) {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    const { x, y } = toWorld(t.clientX, t.clientY);
    if (battle.S.over) { battle.reset(); return; }
    for (let i = 0; i < DECK.length; i++) {
      const r = cardRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { battle.trySelectCard(i); return; }
    }
    battle.tryDeploy(x, y);
  }
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchstart', onDown, { passive: false });
}
