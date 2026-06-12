// Entry point: wires modules together and runs the frame loop.
import { initRender, render } from './render2d.js';
import { initInput } from './input.js';
import * as battle from './battle.js';
import { showProfilePicker } from './profiles-ui.js';
import { initGates, repositionWrenches } from './gates.js';

const canvas = document.getElementById('c');
initRender(canvas);
initInput(canvas);

showProfilePicker((profile) => {
  // Profile selected — start the battle.
  battle.reset();
  initGates(profile);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    battle.update(dt);
    render(battle.S);
    // Reposition wrench buttons each frame so they track tower positions exactly.
    repositionWrenches();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
