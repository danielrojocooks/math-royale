// Profile persistence. Namespace: mathroyale.v1.<profileId>
// A profile = { id, name, avatar, settings: { fluencyMs }, facts: {} }

const NS = 'mathroyale.v1.';
const ACTIVE_KEY = 'mathroyale.active';

function key(id) { return NS + id; }

export function listProfiles() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NS)) {
      try { out.push(JSON.parse(localStorage.getItem(k))); } catch {}
    }
  }
  return out;
}

export function createProfile(name, avatar) {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const profile = { id, name, avatar, settings: { fluencyMs: 8000 }, facts: {} };
  localStorage.setItem(key(id), JSON.stringify(profile));
  return profile;
}

export function loadProfile(id) {
  const raw = localStorage.getItem(key(id));
  return raw ? JSON.parse(raw) : null;
}

export function saveProfile(profile) {
  localStorage.setItem(key(profile.id), JSON.stringify(profile));
}

export function deleteProfile(id) {
  localStorage.removeItem(key(id));
  if (getActiveProfileId() === id) localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function setActiveProfileId(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}
