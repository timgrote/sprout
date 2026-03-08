// Sprout — Sprinkler Layout Sandbox

import { state } from './state';
import { setupEvents } from './events';
import { setupDebug } from './debug';
import { draw } from './renderer';

state.canvas = document.getElementById("canvas") as HTMLCanvasElement;
state.ctx = state.canvas.getContext("2d")!;

function resizeCanvas() {
  state.canvas.width = window.innerWidth;
  state.canvas.height = window.innerHeight;
  draw();
}
window.addEventListener("resize", resizeCanvas);

setupEvents();
setupDebug();
resizeCanvas();
