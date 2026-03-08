import { state, simLog } from './state';
import { nearestPointOnBoundary, computeTargetPositions, vertexLabel } from './geometry';
import { startSimulation, addSprinkler, fillInterior, reset } from './simulation';
import { draw } from './renderer';
import { readParams, setInput, updateStats } from './ui';

export function setupEvents() {
  const { canvas } = state;

  // --- Vertex dragging ---

  canvas.addEventListener("mousedown", (e) => {
    if (!state.boundaryClosed || state.simulating) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (let i = 0; i < state.boundaryPoints.length; i++) {
      const dx = mx - state.boundaryPoints[i].x;
      const dy = my - state.boundaryPoints[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < state.DRAG_HIT_RADIUS) {
        state.draggingVertex = i;
        state.didDrag = false;
        canvas.style.cursor = "grabbing";
        e.preventDefault();
        return;
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (state.draggingVertex >= 0) {
      state.boundaryPoints[state.draggingVertex] = { x: mx, y: my };
      state.didDrag = true;
      if (state.particles.length > 0) {
        if (state.interiorPlaced) {
          state.particles = state.particles.filter(p => p.type === 'perimeter');
          state.pendingInteriorRefill = true;
          state.interiorPlaced = false;
        }
        const params = readParams();
        const targets = computeTargetPositions(state.boundaryPoints, params.radius);
        if (targets.length === state.particles.length) {
          for (let i = 0; i < state.particles.length; i++) {
            state.particles[i].target = targets[i].pos;
            state.particles[i].edgeIndex = targets[i].edgeIndex;
            if (state.particles[i].settled) {
              state.particles[i].pos = targets[i].pos;
            }
          }
        }
      }
      draw();
      updateStats();
      return;
    }

    // Hover cursor hint
    if (state.boundaryClosed && !state.simulating) {
      let overVertex = false;
      for (const bp of state.boundaryPoints) {
        if (Math.sqrt((mx - bp.x) ** 2 + (my - bp.y) ** 2) < state.DRAG_HIT_RADIUS) {
          overVertex = true;
          break;
        }
      }
      canvas.style.cursor = overVertex ? "grab" : "crosshair";
    }
  });

  canvas.addEventListener("mouseup", () => {
    if (state.draggingVertex >= 0 && state.didDrag) {
      state.draggingVertex = -1;
      canvas.style.cursor = "crosshair";
      state.interiorPlaced = false;
      setInput("count", 0);
      startSimulation();
      return;
    }
    state.draggingVertex = -1;
    canvas.style.cursor = "crosshair";
  });

  canvas.addEventListener("click", (e) => {
    if (state.boundaryClosed || state.simulating || state.didDrag) { state.didDrag = false; return; }
    const rect = canvas.getBoundingClientRect();
    state.boundaryPoints.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    draw();
  });

  // --- Keyboard ---

  document.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    if (e.key === "Enter" && state.boundaryPoints.length >= 3 && !state.boundaryClosed) {
      state.boundaryClosed = true;
      state.pendingInteriorRefill = true;
      startSimulation();
    } else if (e.key === " " && state.boundaryClosed) {
      e.preventDefault();
      startSimulation();
    } else if (e.key === "r" || e.key === "R") {
      reset();
    } else if (e.key === "+" || e.key === "=") {
      addSprinkler();
    } else if (e.key === "f" || e.key === "F") {
      fillInterior();
    } else if (e.key === "Tab") {
      e.preventDefault();
      document.getElementById("bottomBar")!.classList.toggle("collapsed");
    }
  });

  // --- Context menu (right-click) ---

  const ctxMenu = document.getElementById("ctxMenu")!;
  const ctxAddBtn = document.getElementById("ctxAddVertex")!;
  const ctxDelBtn = document.getElementById("ctxDeleteVertex")!;

  function hideCtxMenu() { ctxMenu.style.display = "none"; }

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!state.boundaryClosed || state.simulating) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    state.ctxPoint = { x: mx, y: my };

    state.ctxVertexIndex = -1;
    for (let i = 0; i < state.boundaryPoints.length; i++) {
      const dx = mx - state.boundaryPoints[i].x;
      const dy = my - state.boundaryPoints[i].y;
      if (Math.sqrt(dx * dx + dy * dy) < state.DRAG_HIT_RADIUS) {
        state.ctxVertexIndex = i;
        break;
      }
    }

    const nearest = nearestPointOnBoundary(state.ctxPoint, state.boundaryPoints);
    state.ctxEdgeIndex = nearest.edgeIndex;

    if (state.ctxVertexIndex >= 0) {
      ctxAddBtn.textContent = `Add vertex after ${vertexLabel(state.ctxVertexIndex)}`;
      ctxDelBtn.textContent = `Delete vertex ${vertexLabel(state.ctxVertexIndex)}`;
      ctxDelBtn.classList.toggle("disabled", state.boundaryPoints.length <= 3);
    } else {
      const edgeLabel = `${vertexLabel(state.ctxEdgeIndex)}-${vertexLabel((state.ctxEdgeIndex + 1) % state.boundaryPoints.length)}`;
      ctxAddBtn.textContent = `Add vertex on ${edgeLabel}`;
      ctxDelBtn.textContent = "Delete vertex";
      ctxDelBtn.classList.add("disabled");
    }

    ctxMenu.style.left = `${e.clientX}px`;
    ctxMenu.style.top = `${e.clientY}px`;
    ctxMenu.style.display = "block";
  });

  ctxAddBtn.addEventListener("click", () => {
    hideCtxMenu();
    if (state.ctxVertexIndex >= 0) {
      const a = state.boundaryPoints[state.ctxVertexIndex];
      const b = state.boundaryPoints[(state.ctxVertexIndex + 1) % state.boundaryPoints.length];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      simLog(`ADD VERTEX after ${vertexLabel(state.ctxVertexIndex)} at midpoint (${Math.round(mid.x)},${Math.round(mid.y)})`);
      state.boundaryPoints.splice(state.ctxVertexIndex + 1, 0, mid);
    } else {
      const nearest = nearestPointOnBoundary(state.ctxPoint, state.boundaryPoints);
      state.boundaryPoints.splice(state.ctxEdgeIndex + 1, 0, nearest.point);
    }
    if (state.interiorPlaced) state.pendingInteriorRefill = true;
    state.interiorPlaced = false;
    setInput("count", 0);
    if (state.particles.length > 0) {
      startSimulation();
    } else {
      draw();
      updateStats();
    }
  });

  ctxDelBtn.addEventListener("click", () => {
    hideCtxMenu();
    if (state.ctxVertexIndex < 0 || state.boundaryPoints.length <= 3) return;
    simLog(`DELETE VERTEX ${vertexLabel(state.ctxVertexIndex)} at (${Math.round(state.boundaryPoints[state.ctxVertexIndex].x)},${Math.round(state.boundaryPoints[state.ctxVertexIndex].y)})`);
    state.boundaryPoints.splice(state.ctxVertexIndex, 1);
    if (state.interiorPlaced) state.pendingInteriorRefill = true;
    state.interiorPlaced = false;
    setInput("count", 0);
    if (state.particles.length > 0) {
      startSimulation();
    } else {
      draw();
      updateStats();
    }
  });

  document.addEventListener("click", hideCtxMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtxMenu(); });

  // --- Panel buttons ---

  document.getElementById("btnSimulate")!.addEventListener("click", () => startSimulation());
  document.getElementById("btnAdd")!.addEventListener("click", () => addSprinkler());
  document.getElementById("btnFill")!.addEventListener("click", () => fillInterior());
  document.getElementById("btnReset")!.addEventListener("click", () => reset());

  // Panel toggle
  document.getElementById("panelToggle")!.addEventListener("click", () => {
    document.getElementById("bottomBar")!.classList.toggle("collapsed");
  });
}
