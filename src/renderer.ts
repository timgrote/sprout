import type { Point } from './types';
import { state } from './state';
import { magnitude, sub, getSortedParticleIndices, vertexLabel, vertexOutwardBisector, edgeInwardNormal } from './geometry';
import { readParams } from './ui';
import { applyTransform } from './viewport';

function drawWorldText(ctx: CanvasRenderingContext2D, text: string, wx: number, wy: number, zoom: number) {
  ctx.save();
  ctx.translate(wx, wy);
  ctx.scale(1 / zoom, 1 / zoom);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function draw() {
  const params = readParams();
  const { ctx, canvas, viewport } = state;
  const zoom = viewport.zoom;

  // Clear in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Switch to world space
  applyTransform(ctx, viewport);

  // Boundary
  if (state.boundaryPoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(state.boundaryPoints[0].x, state.boundaryPoints[0].y);
    for (let i = 1; i < state.boundaryPoints.length; i++) {
      ctx.lineTo(state.boundaryPoints[i].x, state.boundaryPoints[i].y);
    }
    if (state.boundaryClosed) {
      ctx.closePath();
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fill();
    }
    ctx.strokeStyle = "#d8ecea";
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // Vertex dots and labels
    for (let i = 0; i < state.boundaryPoints.length; i++) {
      const bp = state.boundaryPoints[i];
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = "#4ecdc4";
      ctx.fill();

      if (state.boundaryClosed) {
        const bisector = vertexOutwardBisector(state.boundaryPoints, i);
        const labelDist = 18 / zoom;
        const lx = bp.x + bisector.x * labelDist;
        const ly = bp.y + bisector.y * labelDist;
        ctx.fillStyle = "#4ecdc4";
        ctx.font = "bold 18px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawWorldText(ctx, vertexLabel(i), lx, ly, zoom);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }
  }

  // Distance feedback while drawing
  if (!state.boundaryClosed && state.boundaryPoints.length > 0) {
    const last = state.boundaryPoints[state.boundaryPoints.length - 1];
    const mouse = state.mouseWorld;

    ctx.setLineDash([6 / zoom, 4 / zoom]);

    // Line from last vertex to mouse
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.strokeStyle = "rgba(78, 205, 196, 0.6)";
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    // Distance label — last to mouse
    const distToLast = magnitude(sub(mouse, last));
    const midLast = { x: (last.x + mouse.x) / 2, y: (last.y + mouse.y) / 2 };
    ctx.fillStyle = "#4ecdc4";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    drawWorldText(ctx, `${distToLast.toFixed(1)} ft`, midLast.x, midLast.y - 4 / zoom, zoom);

    // Closing line (mouse to first vertex) — only if 2+ points
    if (state.boundaryPoints.length >= 2) {
      const first = state.boundaryPoints[0];
      ctx.beginPath();
      ctx.moveTo(mouse.x, mouse.y);
      ctx.lineTo(first.x, first.y);
      ctx.strokeStyle = "rgba(78, 205, 196, 0.3)";
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      const distToFirst = magnitude(sub(mouse, first));
      const midFirst = { x: (first.x + mouse.x) / 2, y: (first.y + mouse.y) / 2 };
      ctx.fillStyle = "rgba(78, 205, 196, 0.5)";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      drawWorldText(ctx, `${distToFirst.toFixed(1)} ft`, midFirst.x, midFirst.y - 4 / zoom, zoom);
    }

    ctx.setLineDash([]);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Particle coverage circles
  for (const pt of state.particles) {
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, pt.radius, 0, Math.PI * 2);
    if (pt.type === 'interior') {
      ctx.fillStyle = pt.settled ? "rgba(69, 183, 209, 0.3)" : "rgba(212, 164, 90, 0.04)";
      ctx.fill();
      ctx.strokeStyle = pt.settled ? "rgb(212, 163, 90)" : "rgb(212, 163, 90)";
    } else {
      ctx.fillStyle = pt.settled ? "rgba(69, 183, 209, 0.3)" : "rgba(69, 183, 209, 0.04)";
      ctx.fill();
      ctx.strokeStyle = pt.settled ? "rgb(69, 183, 209)" : "rgb(69, 183, 209)";
    }
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();
  }

  // Particle heads and numbers
  const sortedIndices = getSortedParticleIndices(state.particles, state.boundaryPoints);
  const numberMap = new Map<number, number>();
  sortedIndices.forEach((pIdx, displayIdx) => numberMap.set(pIdx, displayIdx + 1));

  for (let i = 0; i < state.particles.length; i++) {
    const pt = state.particles[i];
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, 5 / zoom, 0, Math.PI * 2);
    if (pt.type === 'interior') {
      ctx.fillStyle = pt.settled ? "#d4a45a" : "rgba(212, 164, 90, 0.5)";
    } else {
      ctx.fillStyle = pt.settled ? "#45b7d1" : "rgba(69, 183, 209, 0.5)";
    }
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();

    // Number label
    if (pt.settled && numberMap.has(i) && state.boundaryClosed) {
      if (pt.type === 'interior') {
        const ly = pt.pos.y - 16 / zoom;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawWorldText(ctx, String(numberMap.get(i)!), pt.pos.x, ly, zoom);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      } else {
        const vtx = state.boundaryPoints[pt.edgeIndex];
        const atVertex = Math.abs(pt.pos.x - vtx.x) < 0.1 && Math.abs(pt.pos.y - vtx.y) < 0.1;
        let offset: Point;
        if (atVertex) {
          const outward = vertexOutwardBisector(state.boundaryPoints, pt.edgeIndex);
          offset = { x: -outward.x, y: -outward.y };
        } else {
          offset = edgeInwardNormal(state.boundaryPoints, pt.edgeIndex);
        }
        const labelDist = 16 / zoom;
        const lx = pt.pos.x + offset.x * labelDist;
        const ly = pt.pos.y + offset.y * labelDist;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawWorldText(ctx, String(numberMap.get(i)!), lx, ly, zoom);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }
  }

  // --- HUD in screen space ---
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Status text
  ctx.fillStyle = "#888";
  ctx.font = "18px system-ui";
  if (!state.boundaryClosed) {
    ctx.fillText(`${state.boundaryPoints.length} points — click to add, Enter to close`, 16, canvas.height - 16);
  } else if (!state.simulating && state.particles.length === 0) {
    ctx.fillText("Boundary closed — press Space to simulate", 16, canvas.height - 16);
  } else {
    const settled = state.particles.filter(pt => pt.settled).length;
    const statusText = state.simulating ? `simulating (${settled}/${state.particles.length} settled)` : "settled";
    ctx.fillText(`${state.particles.length} sprinklers — radius: ${params.radius} ft — ${statusText}`, 16, canvas.height - 16);
  }

  // Scale bar (bottom-right)
  drawScaleBar(ctx, canvas.width, canvas.height, zoom);
}

function drawScaleBar(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, zoom: number) {
  // Pick a nice round distance that's 80-200 screen pixels
  const niceDistances = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  let barFeet = 10;
  for (const d of niceDistances) {
    if (d * zoom >= 60 && d * zoom <= 200) { barFeet = d; break; }
  }
  const barPx = barFeet * zoom;

  const x = canvasW - barPx - 20;
  const y = canvasH - 50;
  const tickH = 6;

  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1.5;

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + barPx, y);
  ctx.stroke();

  // End ticks
  ctx.beginPath();
  ctx.moveTo(x, y - tickH);
  ctx.lineTo(x, y + tickH);
  ctx.moveTo(x + barPx, y - tickH);
  ctx.lineTo(x + barPx, y + tickH);
  ctx.stroke();

  // Label
  ctx.fillStyle = "#888";
  ctx.font = "13px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${barFeet} ft`, x + barPx / 2, y - 8);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
