// Entry point: wires modules together and runs the frame loop.
import { initRender, render } from './render2d.js';
import { initInput } from './input.js';
import * as battle from './battle.js';
import { showProfilePicker } from './profiles-ui.js';
import { initGates, updateGates } from './gates.js';

const canvas = document.getElementById('c');
initRender(canvas);
initInput(canvas);

showProfilePicker((profile) => {
  // Profile selected — start the battle.
  battle.reset();
  initGates();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    battle.update(dt);
    render(battle.S);
    // Spawn/anchor/retire the floating repair card.
    updateGates();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
