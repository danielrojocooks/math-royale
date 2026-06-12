// Entry point: wires modules together and runs the frame loop.
import { initRender, render } from './render2d.js';
import { initInput } from './input.js';
import * as battle from './battle.js';

const canvas = document.getElementById('c');
initRender(canvas);
initInput(canvas);
battle.reset();

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  battle.update(dt);
  render(battle.S);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
