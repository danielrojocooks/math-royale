// Node smoke test for the mastery engine — run: node tests/smoke.node.mjs
// Covers the critical CURRICULUM.md rules without a browser.
// (tests/mastery.test.html is the full suite; this is the CI-ish quick check.)
import { recordAttempt, isFluent, scaffoldTier, pickGateFact, arenaFluentPct } from '../src/mastery.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL: ' + name); }
}

const T = 1_000_000_000_000; // fixed base timestamp
const o = (ms) => ({ now: T, thresholdMs: 8000 });

// 1. Fluency: 3 correct fast answers
{
  const f = {};
  recordAttempt(f, '3+4', true, 9000, { now: T });    // slow — blocks fast-pass
  recordAttempt(f, '3+4', true, 3000, { now: T });
  recordAttempt(f, '3+4', true, 3000, { now: T });
  ok(isFluent(f, '3+4', { now: T }), 'fluent after 3 correct with fast median');
}
// 2. Not fluent when too slow
{
  const f = {};
  for (let i = 0; i < 3; i++) recordAttempt(f, '5+5', true, 9000, { now: T });
  ok(!isFluent(f, '5+5', { now: T }), 'not fluent when median >= threshold');
}
// 3. Fast-pass: two quick correct answers
{
  const f = {};
  recordAttempt(f, '2+2', true, 2000, { now: T });
  recordAttempt(f, '2+2', true, 2500, { now: T });
  ok(isFluent(f, '2+2', { now: T }), 'fast-pass after 2 quick correct');
}
// 3b. No fast-pass if second is slow
{
  const f = {};
  recordAttempt(f, '2+3', true, 2000, { now: T });
  recordAttempt(f, '2+3', true, 7000, { now: T });
  ok(!isFluent(f, '2+3', { now: T }), 'no fast-pass when 2nd answer slow');
}
// 4. Miss clears fluency
{
  const f = {};
  recordAttempt(f, '4+4', true, 2000, { now: T });
  recordAttempt(f, '4+4', true, 2000, { now: T });
  recordAttempt(f, '4+4', false, 2000, { now: T });
  ok(!isFluent(f, '4+4', { now: T }), 'miss un-confirms fluency');
}
// 5. Tier movement: starts at startTier, drops after 2 correct, rises after 2 misses, clamps
{
  const f = {};
  recordAttempt(f, '6+1', false, 5000, { now: T, startTier: 2 });
  ok(scaffoldTier(f, '6+1') === 2, 'tier clamps at 2 on first miss');
  recordAttempt(f, '6+1', false, 5000, { now: T });
  ok(scaffoldTier(f, '6+1') === 2, 'tier stays clamped at 2');
  recordAttempt(f, '6+1', true, 5000, { now: T });
  recordAttempt(f, '6+1', true, 5000, { now: T });
  ok(scaffoldTier(f, '6+1') === 1, 'tier drops 2->1 after 2 consecutive correct');
  recordAttempt(f, '6+1', true, 5000, { now: T });
  ok(scaffoldTier(f, '6+1') === 1, 'streak reset: 3rd correct alone does not move tier');
  recordAttempt(f, '6+1', true, 5000, { now: T });
  ok(scaffoldTier(f, '6+1') === 0, 'tier drops 1->0 after 2 more correct');
}
// 6. 14-day decay + re-confirm
{
  const f = {};
  recordAttempt(f, '7+2', true, 2000, { now: T });
  recordAttempt(f, '7+2', true, 2000, { now: T });
  ok(isFluent(f, '7+2', { now: T }), 'fluent before decay');
  const later = T + 15 * 86_400_000;
  ok(!isFluent(f, '7+2', { now: later }), 'decayed after 15 days');
  recordAttempt(f, '7+2', true, 6000, { now: later });
  ok(isFluent(f, '7+2', { now: later }), 'one correct re-confirms after decay');
}
// 7. pickGateFact: 80/20 split with stubbed rand
{
  const f = {};
  recordAttempt(f, '1+1', true, 2000, { now: T - 5000 });
  const arena = ['8+3', '9+2'], earlier = [['1+1', '1+2']];
  ok(pickGateFact(f, arena, earlier, { rand: () => 0.1, now: T }) === '1+2',
     'review pick (rand<0.2) prefers oldest/unseen earlier fact');
  const p = pickGateFact(f, arena, earlier, { rand: () => 0.9, now: T });
  ok(arena.includes(p), 'arena pick (rand>=0.2) stays in arena pool');
}
// 8. arenaFluentPct
{
  const f = {};
  recordAttempt(f, 'a', true, 2000, { now: T });
  recordAttempt(f, 'a', true, 2000, { now: T });
  ok(arenaFluentPct(f, ['a', 'b'], { now: T }) === 50, 'fluent pct = 50 for 1 of 2');
  ok(arenaFluentPct(f, [], { now: T }) === 0, 'empty pool = 0');
}

console.log(`mastery smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
