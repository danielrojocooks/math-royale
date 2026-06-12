// All canvas drawing. Reads battle state S; never mutates game state.
// Also owns the screen transform (toWorld) and panel layout (cardRect) used by input.js.
import { W, H, LANE, RIVER_T, RIVER_B, PANEL_Y, DECK, FOES } from '../data/units.js';

let cv, ctx, DPR = 1, SC = 1, OX = 0, OY = 0;

// ---- sprites ----
const SPR = {};
for (const u of [...DECK, ...FOES]) {
  if (!SPR[u.spr]) { const im = new Image(); im.src = 'assets/fantasy_t/clean/' + u.spr + '.png'; SPR[u.spr] = im; }
}
function spriteW(name, h) { const im = SPR[name]; return (im && im.naturalWidth) ? h * im.naturalWidth / im.naturalHeight : h * 0.7; }
function drawSpr(name, h) {
  const im = SPR[name];
  if (im && im.complete && im.naturalWidth) { const w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
  else { ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, 0, h * 0.35, 0, 6.28); ctx.fill(); }
}

// ---- screen transform ----
export function initRender(canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  resize(); addEventListener('resize', resize);
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  SC = Math.min(innerWidth / W, innerHeight / H) * DPR;
  OX = (innerWidth * DPR - W * SC) / 2; OY = (innerHeight * DPR - H * SC) / 2;
}
export function toWorld(clientX, clientY) { return { x: (clientX * DPR - OX) / SC, y: (clientY * DPR - OY) / SC }; }
export function cardRect(i) { const w = 160, gap = 14, x0 = (W - (4 * w + 3 * gap)) / 2; return { x: x0 + i * (w + gap), y: PANEL_Y + 58, w, h: 132 }; }

// ---- draw helpers ----
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function badge(x, y, n, col) {
  ctx.beginPath(); ctx.arc(x, y, 18, 0, 6.28); ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 22px Trebuchet MS'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x, y + 1);
}

// ---- main render ----
export function render(S) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  let sx = 0, sy = 0;
  if (S.shake > 0) { sx = (Math.random() - .5) * S.shake * 46; sy = (Math.random() - .5) * S.shake * 46; }
  ctx.setTransform(SC, 0, 0, SC, OX + sx * SC, OY + sy * SC);

  // field
  let g = ctx.createLinearGradient(0, 0, 0, PANEL_Y); g.addColorStop(0, '#9ad36a'); g.addColorStop(1, '#6db33a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, PANEL_Y);
  ctx.fillStyle = 'rgba(134,196,87,.5)'; ctx.fillRect(LANE[0] - 92, 150, 184, 720); ctx.fillRect(LANE[1] - 92, 150, 184, 720);

  // ground decals (splats) behind everyone
  for (const d of S.decals) {
    ctx.save(); ctx.globalAlpha = Math.min(.6, d.life / d.maxlife * .7); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(1, .5);
    ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(0, 0, d.r, 0, 6.28); ctx.fill();
    for (let k = 0; k < 5; k++) { const a = k * 1.3; ctx.beginPath(); ctx.arc(Math.cos(a) * d.r * 1.1, Math.sin(a) * d.r * 1.1, d.r * 0.28, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // river + shimmer + bridges
  g = ctx.createLinearGradient(0, RIVER_T, 0, RIVER_B); g.addColorStop(0, '#7fd0ff'); g.addColorStop(1, '#2b95d6');
  ctx.fillStyle = g; ctx.fillRect(36, RIVER_T, W - 72, RIVER_B - RIVER_T);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x = 40; x < W - 40; x += 8) { const yy = RIVER_T + 20 + Math.sin(x * 0.05 + S.T * 2) * 5; if (x === 40) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
  ctx.stroke();
  ctx.fillStyle = '#b07b46';
  ctx.fillRect(LANE[0] - 76, RIVER_T - 4, 152, RIVER_B - RIVER_T + 8);
  ctx.fillRect(LANE[1] - 76, RIVER_T - 4, 152, RIVER_B - RIVER_T + 8);

  // towers
  for (const t of S.towers) {
    if (t.dead) { ctx.font = '48px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔥', t.x, t.y); continue; }
    const sz = t.kind === 'king' ? 92 : 64;
    ctx.font = sz + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (t.flash > 0) { ctx.globalAlpha = t.flash * 2; ctx.fillText('🟥', t.x, t.y + sz * 0.34); ctx.globalAlpha = 1; }
    ctx.fillText(t.side === 'foe' ? '🏯' : '🏰', t.x, t.y + sz * 0.34);
    const bw = t.kind === 'king' ? 140 : 96, bh = 11, bx = t.x - bw / 2, by = t.y + sz * 0.4;
    ctx.fillStyle = '#2a0f0f'; rr(bx, by, bw, bh, 6); ctx.fill();
    ctx.fillStyle = t.side === 'foe' ? '#e23b3b' : '#22c24a'; rr(bx, by, bw * Math.max(0, t.hp / t.maxhp), bh, 6); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; rr(bx, by, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 16px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText(Math.max(0, Math.ceil(t.hp)), t.x, by + bh + 15);
  }

  // troops (painter's order, procedural animation)
  S.troops.sort((a, b) => a.y - b.y);
  for (const t of S.troops) {
    const hh = (46 + t.maxval * 10) * (0.6 + 0.4 * t.pop), w = spriteW(t.spr, hh), fdir = t.side === 'you' ? -1 : 1;
    let bob = 0, lean = 0, sqx = 1, sqy = 1, alpha = 1, lung = 0;
    if (t.dead) { const k = 1 - Math.max(0, t.dying) / 0.16; alpha = Math.max(0, 1 - k); sqx = sqy = 1 + k * 0.9; }
    else {
      const m = t.moving ? 1 : 0, s = Math.sin(t.walk);
      bob = -Math.abs(s) * 7 * m; lean = s * 0.07 * m; sqy = 1 - Math.abs(s) * 0.06 * m; sqx = 1 + Math.abs(s) * 0.04 * m;
      if (t.atk > 0) {
        const p = 1 - t.atk / 0.36;
        if (p < 0.4) lung = fdir * (-(p / 0.4) * 12);                    // wind-up (pull back)
        else { const f = Math.sin((p - 0.4) / 0.6 * Math.PI); lung = fdir * f * 42; sqy *= 1 + f * 0.22; sqx *= 1 + f * 0.10; } // overshoot strike
      }
      if (t.hit > 0) { lean += fdir * t.hit * 1.0; lung += -fdir * t.hit * 30; }  // recoil
    }
    ctx.globalAlpha = .22 * alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(t.x, t.y + hh * 0.46, w * 0.22 * sqx, 8, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(t.x, t.y + bob + lung); ctx.rotate(lean); ctx.scale(sqx, sqy); drawSpr(t.spr, hh); ctx.restore(); ctx.globalAlpha = 1;
    if (t.flash > 0 && !t.dead) { ctx.globalAlpha = t.flash * 2.2; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(t.x, t.y + bob, w * 0.5, hh * 0.45, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; }
    if (!t.dead) badge(t.x + w * 0.4, t.y - hh * 0.38 + bob, t.val, t.side === 'you' ? '#2b7de0' : '#e23b3b');
  }

  // particles (dots, chunks, rings)
  for (const p of S.parts) {
    ctx.globalAlpha = Math.max(0, p.life * 1.6);
    if (p.ring) { ctx.strokeStyle = p.color; ctx.lineWidth = 4 * Math.max(.2, p.life * 2); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke(); }
    else if (p.chunk) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r); ctx.restore(); }
    else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 4, 0, 6.28); ctx.fill(); }
  }
  ctx.globalAlpha = 1;

  // floating text
  ctx.textAlign = 'center';
  for (const q of S.pops) {
    ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color; ctx.font = '900 ' + (q.big ? 36 : 24) + 'px Trebuchet MS';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(q.text, q.x, q.y); ctx.fillText(q.text, q.x, q.y);
  }
  ctx.globalAlpha = 1;

  // panel: elixir bar + cards
  ctx.fillStyle = '#241043'; ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
  ctx.fillStyle = '#ffcf4d'; ctx.fillRect(0, PANEL_Y, W, 6);
  const ex = 64, ey = PANEL_Y + 18, ew = W - 104, eh = 24;
  for (let i = 0; i < 10; i++) {
    const cw = (ew - 9 * 4) / 10, cx = ex + i * (cw + 4);
    ctx.fillStyle = i < Math.floor(S.elixir) ? '#d12fb0' : '#2a1a4d'; rr(cx, ey, cw, eh, 6); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#5b3fa0'; rr(cx, ey, cw, eh, 6); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(34, ey + eh / 2, 21, 0, 6.28); ctx.fillStyle = '#c026a8'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 22px Trebuchet MS'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.floor(S.elixir), 34, ey + eh / 2 + 1);
  for (let i = 0; i < DECK.length; i++) {
    const r = cardRect(i), d = DECK[i], aff = d.val <= S.elixir, sel = S.sel === i;
    ctx.save(); if (sel) ctx.translate(0, -12); ctx.globalAlpha = aff ? 1 : .5;
    g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, '#fff4d6'); g.addColorStop(1, '#ffd98a');
    ctx.fillStyle = g; rr(r.x, r.y, r.w, r.h, 16); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = sel ? '#2b7de0' : '#ffcf4d'; rr(r.x, r.y, r.w, r.h, 16); ctx.stroke();
    ctx.save(); ctx.beginPath(); rr(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 12); ctx.clip();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + 10); drawSpr(d.spr, r.h * 0.96); ctx.restore();
    ctx.beginPath(); ctx.arc(r.x + 2, r.y + 2, 18, 0, 6.28); ctx.fillStyle = '#c026a8'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 20px Trebuchet MS'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.val, r.x + 2, r.y + 3);
    ctx.restore();
  }

  // end banner
  if (S.over) {
    ctx.fillStyle = 'rgba(10,6,28,.78)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = S.over === 'WIN' ? '#7dff8a' : '#ff8a8a'; ctx.font = '900 80px Trebuchet MS';
    ctx.fillText(S.over === 'WIN' ? 'YOU WIN! 🎉' : 'TRY AGAIN', W / 2, H / 2 - 30);
    ctx.fillStyle = '#fff'; ctx.font = '900 28px Trebuchet MS'; ctx.fillText('tap anywhere to play again', W / 2, H / 2 + 50);
  }
}
