import type { Point } from './types';
import { state } from './state';
import { getSortedParticleIndices, vertexLabel, vertexOutwardBisector, edgeInwardNormal } from './geometry';
import { readParams } from './ui';

export function draw() {
  const params = readParams();
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

  // Boundary
  if (state.boundaryPoints.length > 0) {
    state.ctx.beginPath();
    state.ctx.moveTo(state.boundaryPoints[0].x, state.boundaryPoints[0].y);
    for (let i = 1; i < state.boundaryPoints.length; i++) {
      state.ctx.lineTo(state.boundaryPoints[i].x, state.boundaryPoints[i].y);
    }
    if (state.boundaryClosed) {
      state.ctx.closePath();
      state.ctx.fillStyle = "rgb(0, 0, 0)";
      state.ctx.fill();
    }
    state.ctx.strokeStyle = "#d8ecea";
    state.ctx.lineWidth = 2;
    state.ctx.stroke();

    // Vertex dots and labels
    for (let i = 0; i < state.boundaryPoints.length; i++) {
      const bp = state.boundaryPoints[i];
      state.ctx.beginPath();
      state.ctx.arc(bp.x, bp.y, 4, 0, Math.PI * 2);
      state.ctx.fillStyle = "#4ecdc4";
      state.ctx.fill();

      // Label — offset outward along vertex bisector
      if (state.boundaryClosed) {
        const bisector = vertexOutwardBisector(state.boundaryPoints, i);
        const labelDist = 18;
        const lx = bp.x + bisector.x * labelDist;
        const ly = bp.y + bisector.y * labelDist;
        state.ctx.fillStyle = "#4ecdc4";
        state.ctx.font = "bold 18px system-ui";
        state.ctx.textAlign = "center";
        state.ctx.textBaseline = "middle";
        state.ctx.fillText(vertexLabel(i), lx, ly);
        state.ctx.textAlign = "start";
        state.ctx.textBaseline = "alphabetic";
      }
    }
  }

  // Particle coverage circles
  for (const pt of state.particles) {
    state.ctx.beginPath();
    state.ctx.arc(pt.pos.x, pt.pos.y, pt.radius, 0, Math.PI * 2);
    if (pt.type === 'interior') {
      state.ctx.fillStyle = pt.settled ? "rgba(69, 183, 209, 0.3)" : "rgba(212, 164, 90, 0.04)";
      state.ctx.fill();
      state.ctx.strokeStyle = pt.settled ? "rgb(212, 163, 90)" : "rgb(212, 163, 90)";
    } else {
      state.ctx.fillStyle = pt.settled ? "rgba(69, 183, 209, 0.3)" : "rgba(69, 183, 209, 0.04)";
      state.ctx.fill();
      state.ctx.strokeStyle = pt.settled ? "rgb(69, 183, 209)" : "rgb(69, 183, 209)";
    }
    state.ctx.lineWidth = 1;
    state.ctx.stroke();
  }

  // Particle heads and numbers
  const sortedIndices = getSortedParticleIndices(state.particles, state.boundaryPoints);
  const numberMap = new Map<number, number>();
  sortedIndices.forEach((pIdx, displayIdx) => numberMap.set(pIdx, displayIdx + 1));

  for (let i = 0; i < state.particles.length; i++) {
    const pt = state.particles[i];
    state.ctx.beginPath();
    state.ctx.arc(pt.pos.x, pt.pos.y, 5, 0, Math.PI * 2);
    if (pt.type === 'interior') {
      state.ctx.fillStyle = pt.settled ? "#d4a45a" : "rgba(212, 164, 90, 0.5)";
    } else {
      state.ctx.fillStyle = pt.settled ? "#45b7d1" : "rgba(69, 183, 209, 0.5)";
    }
    state.ctx.fill();
    state.ctx.strokeStyle = "#fff";
    state.ctx.lineWidth = 1;
    state.ctx.stroke();

    // Number label
    if (pt.settled && numberMap.has(i) && state.boundaryClosed) {
      if (pt.type === 'interior') {
        const lx = pt.pos.x;
        const ly = pt.pos.y - 16;
        state.ctx.fillStyle = "#fff";
        state.ctx.font = "bold 13px system-ui";
        state.ctx.textAlign = "center";
        state.ctx.textBaseline = "middle";
        state.ctx.fillText(String(numberMap.get(i)!), lx, ly);
        state.ctx.textAlign = "start";
        state.ctx.textBaseline = "alphabetic";
      } else {
        const vtx = state.boundaryPoints[pt.edgeIndex];
        const atVertex = Math.abs(pt.pos.x - vtx.x) < 1 && Math.abs(pt.pos.y - vtx.y) < 1;
        let offset: Point;
        if (atVertex) {
          const outward = vertexOutwardBisector(state.boundaryPoints, pt.edgeIndex);
          offset = { x: -outward.x, y: -outward.y };
        } else {
          offset = edgeInwardNormal(state.boundaryPoints, pt.edgeIndex);
        }
        const labelDist = 16;
        const lx = pt.pos.x + offset.x * labelDist;
        const ly = pt.pos.y + offset.y * labelDist;
        state.ctx.fillStyle = "#fff";
        state.ctx.font = "bold 13px system-ui";
        state.ctx.textAlign = "center";
        state.ctx.textBaseline = "middle";
        state.ctx.fillText(String(numberMap.get(i)!), lx, ly);
        state.ctx.textAlign = "start";
        state.ctx.textBaseline = "alphabetic";
      }
    }
  }

  // Status text
  state.ctx.fillStyle = "#888";
  state.ctx.font = "18px system-ui";
  if (!state.boundaryClosed) {
    state.ctx.fillText(`${state.boundaryPoints.length} points — click to add, Enter to close`, 16, state.canvas.height - 16);
  } else if (!state.simulating && state.particles.length === 0) {
    state.ctx.fillText("Boundary closed — press Space to simulate", 16, state.canvas.height - 16);
  } else {
    const settled = state.particles.filter(pt => pt.settled).length;
    const statusText = state.simulating ? `simulating (${settled}/${state.particles.length} settled)` : "settled";
    state.ctx.fillText(`${state.particles.length} sprinklers — radius: ${params.radius}px — ${statusText}`, 16, state.canvas.height - 16);
  }
}
