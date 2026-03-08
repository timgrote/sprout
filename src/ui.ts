import { state } from './state';
import { polygonPerimeter, optimalSprinklerCount } from './geometry';

export function getInput(id: string): number { return parseFloat((document.getElementById(id) as HTMLInputElement).value); }
export function setInput(id: string, v: number) { (document.getElementById(id) as HTMLInputElement).value = String(v); }

export function readParams() {
  return {
    count: getInput("count"),
    radius: getInput("radius"),
    kTarget: getInput("kTarget"),
    kRepulsion: getInput("kRepulsion"),
    damping: getInput("damping"),
    maxForce: getInput("maxForce"),
  };
}

export function updateStats() {
  const zoomEl = document.getElementById("statZoom");
  if (zoomEl) zoomEl.textContent = `${state.viewport.zoom.toFixed(1)} px/ft`;

  if (!state.boundaryClosed) {
    document.getElementById("statPerimeter")!.textContent = "—";
    document.getElementById("statSuggested")!.textContent = "—";
    document.getElementById("statCount")!.textContent = "—";
    document.getElementById("statStatus")!.textContent = "—";
    return;
  }
  const perim = polygonPerimeter(state.boundaryPoints);
  const radius = getInput("radius");
  const suggested = optimalSprinklerCount(state.boundaryPoints, radius);
  const settled = state.particles.filter(p => p.settled).length;
  const status = state.simulating ? `simulating (${settled}/${state.particles.length})` : state.particles.length > 0 ? "settled" : "ready";

  document.getElementById("statPerimeter")!.textContent = `${perim.toFixed(1)} ft`;
  document.getElementById("statSuggested")!.textContent = `${suggested} (overlap @ r=${radius})`;
  const perimN = state.particles.filter(p => p.type === 'perimeter').length;
  const intN = state.particles.filter(p => p.type === 'interior').length;
  document.getElementById("statCount")!.textContent = intN > 0 ? `${perimN} + ${intN} int` : `${perimN}`;
  document.getElementById("statStatus")!.textContent = status;
}
