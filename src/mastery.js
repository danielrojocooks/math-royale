// src/mastery.js — Mastery engine for Math Royale.
// Pure functions, zero imports, no DOM, no localStorage.
// The caller owns persistence; pass `facts` (profile.facts) in and save it back.
//
// ─── STATS SHAPE (per fact) ────────────────────────────────────────────────
// {
//   attempts  : number   — total lifetime attempts
//   correct   : number   — total lifetime correct
//   last3     : bool[]   — last ≤3 results, most-recent LAST (fluency window)
//   times     : number[] — last ≤5 response times ms (for median speed check)
//   lastSeen  : number   — timestamp ms of most recent attempt
//   fluent    : bool     — cached fluency flag (decay can clear this)
//   tier      : 0|1|2   — scaffold tier; 0=most support, 2=none
//   streak    : number   — +N = N consecutive correct, -N = N consecutive misses
//                          resets after tier movement; drives tier up/down logic
// }
// ──────────────────────────────────────────────────────────────────────────
//
// CURRICULUM.md rules implemented here (referenced in comments by rule name):
//   "Fluent" rule      → last3 all true AND median(times) < thresholdMs
//   "Fast-pass"        → first 2 exposures both correct in < thresholdMs/2
//   Scaffold tiers     → T0 most support (P1 default), T2 none (P2 default)
//   Tier movement      → −tier after 2 consecutive correct; +tier after 2 consecutive misses
//   Spaced review      → 20% of picks from earlier pools, oldest lastSeen first
//   14-day decay       → fluent cleared if lastSeen > 14 days ago

const DAY_MS = 86_400_000;
const DECAY_DAYS = 14;
const FAST_PASS_DIVISOR = 2; // threshold / 2 for fast-pass speed check
const TIER_MOVE_STREAK = 2;  // consecutive hits/misses before tier moves
const DEFAULT_THRESHOLD_MS = 8000;
const REVIEW_PCT = 0.2;      // 20% of picks come from earlier arenas

// ─── helpers ─────────────────────────────────────────────────────────────

// Return or create the per-fact stats object. Mutates facts in place.
function getOrCreate(facts, factId, startTier) {
  if (!facts[factId]) {
    facts[factId] = {
      attempts: 0,
      correct: 0,
      last3: [],
      times: [],
      lastSeen: 0,
      fluent: false,
      tier: startTier,
      streak: 0,
    };
  }
  return facts[factId];
}

// Median of an array of numbers. Returns Infinity for empty arrays so a
// speed check against a threshold automatically fails (not yet enough data).
function median(arr) {
  if (!arr.length) return Infinity;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Append v to arr, keeping at most maxLen entries (oldest dropped first).
function pushCapped(arr, v, maxLen) {
  arr.push(v);
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
}

// ─── exported functions ───────────────────────────────────────────────────

/**
 * recordAttempt — record one answer and return the mutated stats object.
 *
 * @param {Object}  facts    — profile.facts map (factId → stats)
 * @param {string}  factId   — e.g. "3+4"
 * @param {boolean} correct  — was the answer correct?
 * @param {number}  ms       — response time in milliseconds
 * @param {Object}  [opts]
 *   opts.now         {number}  timestamp ms (default Date.now())
 *   opts.thresholdMs {number}  fluency speed threshold (default 8000)
 *   opts.startTier   {0|1|2}  tier for unseen facts (default 0)
 */
export function recordAttempt(facts, factId, correct, ms, opts = {}) {
  const now = opts.now ?? Date.now();
  const thresholdMs = opts.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const startTier = opts.startTier ?? 0;

  const s = getOrCreate(facts, factId, startTier);

  // ── FAST-PASS check (CURRICULUM.md: "Fast-pass")
  // Applies only when this is the 1st or 2nd exposure. Both must be correct
  // AND fast. We check before incrementing so attempts reflects pre-update state.
  const wasFastPassCandidate = s.attempts <= 1; // 0=first, 1=second exposure
  const isFastSpeed = ms < thresholdMs / FAST_PASS_DIVISOR;

  // ── update raw counters
  s.attempts += 1;
  if (correct) s.correct += 1;
  pushCapped(s.last3, correct, 3);
  if (correct) pushCapped(s.times, ms, 5); // only track times for correct answers
  s.lastSeen = now;

  // ── FAST-PASS: first 2 both correct and fast → fluent immediately
  // (CURRICULUM.md: "first 2 exposures answered correct in < ½ threshold")
  if (wasFastPassCandidate && correct && isFastSpeed) {
    // after increment attempts is 1 or 2; both must have been fast+correct
    if (s.attempts === 1) {
      // first attempt: flag it tentatively; will confirm on 2nd
      s._fastPassFirst = true;
    } else if (s.attempts === 2 && s._fastPassFirst) {
      s.fluent = true;
      delete s._fastPassFirst;
    }
  } else if (s.attempts === 2) {
    // second attempt but failed fast-pass criteria — clear the flag
    delete s._fastPassFirst;
  }

  // ── TIER MOVEMENT (CURRICULUM.md: scaffold tiers)
  // streak: positive = consecutive correct, negative = consecutive misses
  if (correct) {
    s.streak = s.streak > 0 ? s.streak + 1 : 1;
  } else {
    s.streak = s.streak < 0 ? s.streak - 1 : -1;
  }

  if (s.streak >= TIER_MOVE_STREAK) {
    // 2 consecutive correct → drop tier (less scaffolding)
    s.tier = Math.max(0, s.tier - 1);
    s.streak = 0; // reset so it takes another 2 to move again
  } else if (s.streak <= -TIER_MOVE_STREAK) {
    // 2 consecutive misses → raise tier (more scaffolding)
    s.tier = Math.min(2, s.tier + 1);
    s.streak = 0;
  }

  // ── FLUENCY check (CURRICULUM.md: "Fluent" rule)
  // Only update fluent if not already marked by fast-pass.
  if (!s.fluent) {
    const last3AllCorrect = s.last3.length === 3 && s.last3.every(Boolean);
    const fastEnough = median(s.times) < thresholdMs;
    if (last3AllCorrect && fastEnough) {
      s.fluent = true;
    }
  }

  // A miss can un-confirm fluency so re-confirmation works properly.
  // (14-day decay is handled in isFluent at read time, not here.)
  if (!correct) {
    s.fluent = false;
  }

  return s;
}

/**
 * isFluent — decay-aware fluency query.
 *
 * Returns false if:
 *   • the fact has no stats (never seen)
 *   • stats.fluent is false
 *   • lastSeen is older than 14 days (CURRICULUM.md: "Decay")
 *     — note: does NOT mutate the stored fluent flag; the next recordAttempt
 *       will re-confirm if the answer is correct.
 *
 * @param {Object} facts
 * @param {string} factId
 * @param {Object} [opts]
 *   opts.now {number} timestamp ms (default Date.now())
 */
export function isFluent(facts, factId, opts = {}) {
  const now = opts.now ?? Date.now();
  const s = facts[factId];
  if (!s || !s.fluent) return false;
  // CURRICULUM.md "Decay": unseen for 14 days → not fluent until re-confirmed
  if (now - s.lastSeen > DECAY_DAYS * DAY_MS) return false;
  return true;
}

/**
 * scaffoldTier — returns the current scaffold tier for a fact.
 *
 * Unseen facts return opts.startTier (default 0).
 * Tier 0 = dots + numerals; T1 = numerals + hint-on-miss; T2 = numerals only.
 * (CURRICULUM.md: "Scaffold tiers per fact")
 *
 * @param {Object} facts
 * @param {string} factId
 * @param {Object} [opts]
 *   opts.startTier {0|1|2} (default 0)
 */
export function scaffoldTier(facts, factId, opts = {}) {
  const startTier = opts.startTier ?? 0;
  return facts[factId]?.tier ?? startTier;
}

/**
 * pickGateFact — choose the next fact to gate on.
 *
 * Selection algorithm (CURRICULUM.md: "Spaced review"):
 *   • Roll opts.rand() < REVIEW_PCT (20%) → pick from flattened earlierPools,
 *     preferring the fact with the oldest lastSeen (most stale review fact).
 *     If no earlier-pool facts exist, fall back to arenaPool pick.
 *   • Otherwise (80%) → pick from arenaPool:
 *       1. Non-fluent facts first; among them, least-attempted (builds new mastery).
 *       2. If all arena facts are fluent, pick least-recently-seen (maintenance).
 *
 * @param {Object}   facts
 * @param {string[]} arenaPool     — factIds for the current arena
 * @param {string[][]} earlierPools — array of factId arrays for prior arenas
 * @param {Object}   [opts]
 *   opts.rand    {()=>number} RNG (default Math.random) — injected for tests
 *   opts.now     {number}     timestamp (default Date.now())
 */
export function pickGateFact(facts, arenaPool, earlierPools, opts = {}) {
  const rand = opts.rand ?? Math.random;
  const now = opts.now ?? Date.now();

  // ── REVIEW path (20%)
  const doReview = rand() < REVIEW_PCT;
  const allEarlier = earlierPools.flat();

  if (doReview && allEarlier.length > 0) {
    // Pick the fact with the oldest lastSeen among earlier pools.
    // Unseen facts (lastSeen=0) are treated as oldest possible.
    const pick = allEarlier.reduce((best, id) => {
      const bSeen = facts[best]?.lastSeen ?? 0;
      const cSeen = facts[id]?.lastSeen ?? 0;
      return cSeen < bSeen ? id : best;
    });
    return pick;
  }

  // ── ARENA path (80%, or review fallback if no earlier pools)
  const nonFluent = arenaPool.filter(id => !isFluent(facts, id, { now }));

  if (nonFluent.length > 0) {
    // Prefer least-attempted non-fluent fact (build mastery on weakest facts)
    return nonFluent.reduce((best, id) => {
      const bAttempts = facts[best]?.attempts ?? 0;
      const cAttempts = facts[id]?.attempts ?? 0;
      return cAttempts < bAttempts ? id : best;
    });
  }

  // All arena facts are fluent — pick least-recently-seen for maintenance
  return arenaPool.reduce((best, id) => {
    const bSeen = facts[best]?.lastSeen ?? 0;
    const cSeen = facts[id]?.lastSeen ?? 0;
    return cSeen < bSeen ? id : best;
  });
}

/**
 * arenaFluentPct — percentage (0–100) of pool facts that are currently fluent.
 *
 * Decay-aware: uses isFluent() so a fact unseen for 14+ days counts as not fluent.
 * Returns 0 for an empty pool.
 *
 * @param {Object}   facts
 * @param {string[]} pool    — array of factIds
 * @param {Object}   [opts]
 *   opts.now {number} timestamp ms (default Date.now())
 */
export function arenaFluentPct(facts, pool, opts = {}) {
  if (!pool.length) return 0;
  const now = opts.now ?? Date.now();
  const fluentCount = pool.filter(id => isFluent(facts, id, { now })).length;
  return (fluentCount / pool.length) * 100;
}
