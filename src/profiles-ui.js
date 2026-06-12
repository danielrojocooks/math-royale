// Profile picker overlay — plain HTML/CSS injected over the canvas.
// Call showProfilePicker(onSelect) to display it; it calls onSelect() when done.
import { listProfiles, createProfile, deleteProfile, setActiveProfileId } from './store.js';
import { getPortraits } from './render3d.js';

// Swap any <img data-spr> under root to the live 3D portraits once they exist.
function upgradeImgs(root) {
  getPortraits().then(p => {
    root.querySelectorAll('img[data-spr]').forEach(im => {
      const u = p[im.dataset.spr];
      if (u) im.src = u;
    });
  }).catch(() => {});
}

// The 4 hero sprites that can be chosen as avatars
const HEROES = [
  { spr: 'unit_02', label: 'Knight' },
  { spr: 'unit_03', label: 'Archer' },
  { spr: 'unit_05', label: 'Spear' },
  { spr: 'unit_01', label: 'Wizard' },
];

function sprUrl(spr) { return 'assets/fantasy_t/clean/' + spr + '.png'; }

// ---- styles injected once ----
function injectStyles() {
  if (document.getElementById('pui-style')) return;
  const s = document.createElement('style');
  s.id = 'pui-style';
  s.textContent = `
#pui-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: #241043;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  font-family: "Trebuchet MS","Segoe UI",sans-serif;
  color: #fff; overflow-y: auto; padding: 20px;
  box-sizing: border-box;
}
#pui-overlay h1 {
  font-size: clamp(28px, 6vw, 48px);
  color: #ffcf4d; margin: 0 0 8px;
  text-shadow: 0 2px 8px #000;
  text-align: center;
}
#pui-overlay .subtitle {
  font-size: clamp(14px, 3vw, 20px);
  color: #c026a8; margin: 0 0 28px;
  text-align: center;
}
.pui-grid {
  display: flex; flex-wrap: wrap;
  gap: 16px; justify-content: center;
  width: 100%; max-width: 600px;
}
.pui-card {
  background: #3a1a6e;
  border: 4px solid #ffcf4d;
  border-radius: 20px;
  padding: 18px 20px 14px;
  min-width: 130px; max-width: 180px;
  flex: 1 1 130px;
  display: flex; flex-direction: column;
  align-items: center; cursor: pointer;
  transition: transform .12s, border-color .12s;
  position: relative;
  -webkit-tap-highlight-color: transparent;
}
.pui-card:active { transform: scale(.95); }
.pui-card:hover { border-color: #fff; }
.pui-card img {
  width: 80px; height: 80px;
  object-fit: contain;
}
.pui-card .pui-name {
  font-size: clamp(16px, 3.5vw, 22px);
  font-weight: 900; margin-top: 8px;
  text-align: center; word-break: break-word;
}
.pui-card .pui-del {
  position: absolute; top: 6px; right: 8px;
  background: #c026a8; color: #fff;
  border: none; border-radius: 50%;
  width: 28px; height: 28px; font-size: 16px;
  cursor: pointer; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  -webkit-tap-highlight-color: transparent;
}
.pui-card .pui-del:active { background: #ff3a9a; }
.pui-new {
  background: #1a0d36;
  border: 4px dashed #c026a8;
  color: #c026a8;
  font-size: clamp(32px, 7vw, 48px);
  font-weight: 900;
}
.pui-new:hover { border-color: #ffcf4d; color: #ffcf4d; }

/* new-profile form */
#pui-form {
  display: flex; flex-direction: column;
  align-items: center; gap: 18px;
  width: 100%; max-width: 420px;
}
#pui-form h2 {
  color: #ffcf4d; font-size: clamp(22px, 5vw, 36px);
  margin: 0; text-align: center;
}
#pui-form input[type=text] {
  width: 100%; padding: 14px 18px;
  font-size: clamp(18px, 4vw, 26px);
  border-radius: 14px; border: 3px solid #c026a8;
  background: #1a0d36; color: #fff;
  text-align: center; box-sizing: border-box;
  outline: none;
}
#pui-form input[type=text]:focus { border-color: #ffcf4d; }
.pui-hero-row {
  display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;
}
.pui-hero-pick {
  background: #3a1a6e; border: 4px solid #5b3fa0;
  border-radius: 16px; padding: 10px 12px 6px;
  cursor: pointer; display: flex; flex-direction: column;
  align-items: center; transition: border-color .1s, transform .1s;
  -webkit-tap-highlight-color: transparent;
  min-width: 80px;
}
.pui-hero-pick img {
  width: 60px; height: 60px;
  object-fit: contain;
}
.pui-hero-pick span {
  font-size: 13px; margin-top: 4px; color: #ccc;
}
.pui-hero-pick.selected { border-color: #ffcf4d; transform: scale(1.08); }
.pui-hero-pick:active { transform: scale(.95); }
.pui-btn {
  padding: 16px 36px; font-size: clamp(18px, 4vw, 26px);
  font-weight: 900; border-radius: 16px; border: none;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: transform .1s;
}
.pui-btn:active { transform: scale(.95); }
.pui-btn-go { background: #ffcf4d; color: #241043; }
.pui-btn-go:hover { background: #ffe080; }
.pui-btn-back { background: #3a1a6e; color: #ccc;
  border: 3px solid #5b3fa0; }
.pui-btn-back:hover { border-color: #c026a8; color: #fff; }
.pui-err { color: #ff8a8a; font-size: 15px; min-height: 18px; }
`;
  document.head.appendChild(s);
}

// ---- main entry point ----
export function showProfilePicker(onSelect) {
  injectStyles();
  const overlay = document.createElement('div');
  overlay.id = 'pui-overlay';
  document.body.appendChild(overlay);

  function done(profile) {
    setActiveProfileId(profile.id);
    overlay.remove();
    onSelect(profile);
  }

  renderPicker();

  function renderPicker() {
    overlay.innerHTML = '';
    const h1 = document.createElement('h1');
    h1.textContent = 'Math Royale';
    overlay.appendChild(h1);

    const sub = document.createElement('p');
    sub.className = 'subtitle';
    sub.textContent = 'Who is playing?';
    overlay.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'pui-grid';
    overlay.appendChild(grid);

    const profiles = listProfiles();
    for (const p of profiles) {
      const card = document.createElement('div');
      card.className = 'pui-card';

      const img = document.createElement('img');
      img.src = sprUrl(p.avatar);
      img.dataset.spr = p.avatar;
      img.alt = p.name;
      card.appendChild(img);

      const nm = document.createElement('div');
      nm.className = 'pui-name';
      nm.textContent = p.name;
      card.appendChild(nm);

      // delete button
      const del = document.createElement('button');
      del.className = 'pui-del';
      del.title = 'Delete profile';
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete "' + p.name + '"?')) {
          deleteProfile(p.id);
          renderPicker();
        }
      });
      card.appendChild(del);

      card.addEventListener('click', () => done(p));
      grid.appendChild(card);
    }

    // "+ New" button
    const newCard = document.createElement('div');
    newCard.className = 'pui-card pui-new';
    newCard.setAttribute('role', 'button');
    newCard.setAttribute('aria-label', 'New profile');
    newCard.innerHTML = '<span>+</span><div class="pui-name" style="font-size:16px;color:#c026a8">New Hero</div>';
    newCard.addEventListener('click', renderNewForm);
    grid.appendChild(newCard);
    upgradeImgs(overlay);
  }

  function renderNewForm() {
    overlay.innerHTML = '';
    let selectedHero = HEROES[0].spr;

    const form = document.createElement('div');
    form.id = 'pui-form';

    const h2 = document.createElement('h2');
    h2.textContent = 'Create Hero';
    form.appendChild(h2);

    // hero picker row
    const heroRow = document.createElement('div');
    heroRow.className = 'pui-hero-row';
    for (const h of HEROES) {
      const btn = document.createElement('div');
      btn.className = 'pui-hero-pick' + (h.spr === selectedHero ? ' selected' : '');
      btn.dataset.spr = h.spr;

      const img = document.createElement('img');
      img.src = sprUrl(h.spr);
      img.dataset.spr = h.spr;
      img.alt = h.label;
      btn.appendChild(img);

      const lbl = document.createElement('span');
      lbl.textContent = h.label;
      btn.appendChild(lbl);

      btn.addEventListener('click', () => {
        selectedHero = h.spr;
        heroRow.querySelectorAll('.pui-hero-pick').forEach(el => {
          el.classList.toggle('selected', el.dataset.spr === selectedHero);
        });
      });
      heroRow.appendChild(btn);
    }
    form.appendChild(heroRow);

    // name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Your name';
    nameInput.maxLength = 16;
    nameInput.autocomplete = 'off';
    form.appendChild(nameInput);

    const err = document.createElement('div');
    err.className = 'pui-err';
    form.appendChild(err);

    // buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;';

    const backBtn = document.createElement('button');
    backBtn.className = 'pui-btn pui-btn-back';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', renderPicker);
    btnRow.appendChild(backBtn);

    const goBtn = document.createElement('button');
    goBtn.className = 'pui-btn pui-btn-go';
    goBtn.textContent = 'Play!';
    goBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { err.textContent = 'Enter a name!'; nameInput.focus(); return; }
      const profile = createProfile(name, selectedHero);
      done(profile);
    });
    btnRow.appendChild(goBtn);
    form.appendChild(btnRow);

    overlay.appendChild(form);
    nameInput.focus();
    upgradeImgs(overlay);
  }
}
