// Sprout — Sprinkler Layout Sandbox
// Force-directed particle simulation: sprinklers migrate from center to boundary

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

interface Point { x: number; y: number; }

interface Particle {
  pos: Point;
  vel: Point;
  radius: number;
  settled: boolean;
  target: Point;
  edgeIndex: number;
}

// --- Vector math ---

function sub(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a: Point, b: Point): Point { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(v: Point, s: number): Point { return { x: v.x * s, y: v.y * s }; }
function magnitude(v: Point): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function normalize(v: Point): Point {
  const m = magnitude(v);
  return m < 1e-8 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
}
function clampMag(v: Point, max: number): Point {
  const m = magnitude(v);
  return m > max ? scale(normalize(v), max) : v;
}

// --- Geometry helpers ---

function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  if (lenSq < 1e-8) return a;
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / lenSq));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function nearestPointOnBoundary(p: Point, boundary: Point[]): { point: Point; dist: number; edgeIndex: number } {
  let best = { point: boundary[0], dist: Infinity, edgeIndex: 0 };
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const np = nearestPointOnSegment(p, a, b);
    const d = magnitude(sub(p, np));
    if (d < best.dist) {
      best = { point: np, dist: d, edgeIndex: i };
    }
  }
  return best;
}

function polygonCentroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  return { x: cx / points.length, y: cy / points.length };
}

function polygonPerimeter(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    len += magnitude(sub(b, a));
  }
  return len;
}

function edgeLengths(points: Point[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < points.length; i++) {
    lengths.push(magnitude(sub(points[(i + 1) % points.length], points[i])));
  }
  return lengths;
}

// Optimal count: each edge needs ceil(length/radius) intervals.
// Corner sprinklers are shared between adjacent edges.
// Total = sum(ceil(edge_length / radius)) across all edges.
function optimalSprinklerCount(points: Point[], radius: number): number {
  return edgeLengths(points).reduce((sum, len) => sum + Math.ceil(len / radius), 0);
}

// --- Deterministic target positions ---

interface TargetInfo { pos: Point; edgeIndex: number; }

function computeTargetPositions(boundary: Point[], radius: number): TargetInfo[] {
  const targets: TargetInfo[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const edge = sub(b, a);
    const len = magnitude(edge);
    const intervals = Math.ceil(len / radius);
    if (intervals <= 0) continue;
    const spacing = len / intervals;
    for (let j = 0; j < intervals; j++) {
      const t = j * spacing / len;
      targets.push({ pos: { x: a.x + edge.x * t, y: a.y + edge.y * t }, edgeIndex: i });
    }
  }
  return targets;
}

// --- Labeling helpers ---

// Walk the perimeter and compute cumulative distance for each settled particle
// so we can number them in order starting from the top-left-most vertex
function perimeterPosition(pt: Point, boundary: Point[]): number {
  const nearest = nearestPointOnBoundary(pt, boundary);
  let cumulative = 0;
  for (let i = 0; i < nearest.edgeIndex; i++) {
    cumulative += magnitude(sub(boundary[(i + 1) % boundary.length], boundary[i]));
  }
  cumulative += magnitude(sub(pt, boundary[nearest.edgeIndex]));
  return cumulative;
}

function getSortedParticleIndices(): number[] {
  if (particles.length === 0 || boundaryPoints.length === 0) return [];
  const withPos = particles.map((p, i) => ({
    index: i,
    perimPos: perimeterPosition(p.pos, boundaryPoints),
  }));
  withPos.sort((a, b) => a.perimPos - b.perimPos);
  return withPos.map(w => w.index);
}

function vertexLabel(i: number): string {
  return String.fromCharCode(65 + i); // A, B, C...
}

// --- UI panel ---

function getInput(id: string): number { return parseFloat((document.getElementById(id) as HTMLInputElement).value); }
function setInput(id: string, v: number) { (document.getElementById(id) as HTMLInputElement).value = String(v); }

function readParams() {
  return {
    count: getInput("count"),
    radius: getInput("radius"),
    kTarget: getInput("kTarget"),
    kRepulsion: getInput("kRepulsion"),
    damping: getInput("damping"),
    maxForce: getInput("maxForce"),
  };
}

function updateStats() {
  if (!boundaryClosed) {
    document.getElementById("statPerimeter")!.textContent = "—";
    document.getElementById("statSuggested")!.textContent = "—";
    document.getElementById("statCount")!.textContent = "—";
    document.getElementById("statStatus")!.textContent = "—";
    return;
  }
  const perim = polygonPerimeter(boundaryPoints);
  const radius = getInput("radius");
  const suggested = optimalSprinklerCount(boundaryPoints, radius);
  const settled = particles.filter(p => p.settled).length;
  const status = simulating ? `simulating (${settled}/${particles.length})` : particles.length > 0 ? "settled" : "ready";

  document.getElementById("statPerimeter")!.textContent = `${Math.round(perim)}px`;
  document.getElementById("statSuggested")!.textContent = `${suggested} (overlap @ r=${radius})`;
  document.getElementById("statCount")!.textContent = `${particles.length}`;
  document.getElementById("statStatus")!.textContent = status;
}

// --- State ---

let boundaryPoints: Point[] = [];
let boundaryClosed = false;
let particles: Particle[] = [];
let simulating = false;
let frameId = 0;
let simFrame = 0;
const MAX_SIM_FRAMES = 600;

// --- Simulation logging ---

const simLogs: string[] = [];

function simLog(msg: string) {
  const entry = `[frame ${simFrame}] ${msg}`;
  simLogs.push(entry);
  console.log(`%c[sprout]%c ${entry}`, "color:#4ecdc4;font-weight:bold", "color:inherit");
}

// --- Simulation ---

function simulate() {
  simFrame++;
  const p = readParams();
  const repulsionRange = p.radius * 4;

  for (const pt of particles) {
    if (pt.settled) continue;

    let force: Point = { x: 0, y: 0 };

    // Target attraction — spring force toward pre-computed destination
    const toTarget = sub(pt.target, pt.pos);
    const distToTarget = magnitude(toTarget);
    force = add(force, scale(toTarget, p.kTarget));

    // Inter-particle repulsion — fades out as particle approaches target
    // This lets the target spring win cleanly near the destination
    const repulsionFade = Math.min(1, distToTarget / (p.radius * 0.8));
    for (const other of particles) {
      if (other === pt) continue;
      const away = sub(pt.pos, other.pos);
      const d = magnitude(away);
      if (d < repulsionRange && d > 1e-4) {
        const strength = p.kRepulsion * repulsionFade * (1 - d / repulsionRange);
        force = add(force, scale(normalize(away), strength));
      }
    }

    force = clampMag(force, p.maxForce);
    pt.vel = scale(add(pt.vel, force), p.damping);
    pt.pos = add(pt.pos, pt.vel);

    const speed = magnitude(pt.vel);
    if ((distToTarget < 8 && speed < 1.5) || (distToTarget < 2) || simFrame > MAX_SIM_FRAMES) {
      pt.settled = true;
      pt.vel = { x: 0, y: 0 };
      pt.pos = { x: pt.target.x, y: pt.target.y };
      const settled = particles.filter(p => p.settled).length;
      const edgeLabel = `${vertexLabel(pt.edgeIndex)}-${vertexLabel((pt.edgeIndex + 1) % boundaryPoints.length)}`;
      simLog(`SETTLED ${settled}/${particles.length} — edge ${edgeLabel} @ (${Math.round(pt.pos.x)},${Math.round(pt.pos.y)}) dist=${distToTarget.toFixed(1)} spd=${speed.toFixed(2)}`);
    }
  }

  if (particles.every(pt => pt.settled)) {
    simulating = false;
    simLog(`COMPLETE — ${particles.length} sprinklers settled in ${simFrame} frames`);
    // Log per-edge summary
    const edgeCounts: number[] = new Array(boundaryPoints.length).fill(0);
    for (const pt of particles) edgeCounts[pt.edgeIndex]++;
    const lengths = edgeLengths(boundaryPoints);
    for (let i = 0; i < boundaryPoints.length; i++) {
      const optimal = Math.floor(lengths[i] / particles[0].radius);
      const label = `${vertexLabel(i)}-${vertexLabel((i + 1) % boundaryPoints.length)}`;
      simLog(`  ${label}: ${edgeCounts[i]} actual / ${optimal} optimal ${edgeCounts[i] === optimal ? "✓" : "✗"}`);
    }
    draw();
    updateStats();
    return;
  }

  draw();
  updateStats();
  frameId = requestAnimationFrame(simulate);
}

function startSimulation() {
  if (!boundaryClosed) return;
  cancelAnimationFrame(frameId);

  const params = readParams();
  const centroid = polygonCentroid(boundaryPoints);
  const targets = computeTargetPositions(boundaryPoints, params.radius);
  const n = params.count > 0 ? Math.min(params.count, targets.length) : targets.length;

  simLogs.length = 0;
  simFrame = 0;
  const perim = Math.round(polygonPerimeter(boundaryPoints));
  const lengths = edgeLengths(boundaryPoints);
  simLog(`START — ${boundaryPoints.length} vertices, perimeter ${perim}px, radius ${params.radius}`);
  for (let i = 0; i < boundaryPoints.length; i++) {
    const intervals = Math.floor(lengths[i] / params.radius);
    simLog(`  edge ${vertexLabel(i)}-${vertexLabel((i + 1) % boundaryPoints.length)}: ${Math.round(lengths[i])}px → ${intervals} sprinklers (spacing ${(lengths[i] / intervals).toFixed(1)}px)`);
  }
  simLog(`  total targets: ${targets.length}, spawning: ${n}`);

  setInput("count", n);

  particles = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const jitter = 1 + Math.random();
    particles.push({
      pos: { x: centroid.x + Math.cos(angle) * jitter, y: centroid.y + Math.sin(angle) * jitter },
      vel: { x: 0, y: 0 },
      radius: params.radius,
      settled: false,
      target: targets[i].pos,
      edgeIndex: targets[i].edgeIndex,
    });
  }

  simulating = true;
  simFrame = 0;
  frameId = requestAnimationFrame(simulate);
}

// --- Add single sprinkler into settled state ---

function addSprinkler() {
  if (!boundaryClosed || simulating) return;
  if (particles.length === 0) {
    setInput("count", 1);
    startSimulation();
    return;
  }

  const params = readParams();
  const centroid = polygonCentroid(boundaryPoints);

  // Find edge with largest max gap between adjacent settled sprinklers
  // Group particles by edge (using stored edgeIndex)
  const edgeParticles: { particle: Particle; edgeIndex: number }[] = [];
  for (const pt of particles) {
    edgeParticles.push({ particle: pt, edgeIndex: pt.edgeIndex });
  }

  // For each edge, find the max gap
  let bestEdge = 0;
  let bestGap = 0;
  for (let i = 0; i < boundaryPoints.length; i++) {
    const onEdge = edgeParticles.filter(ep => ep.edgeIndex === i);
    const a = boundaryPoints[i];
    const b = boundaryPoints[(i + 1) % boundaryPoints.length];
    const edgeLen = magnitude(sub(b, a));

    if (onEdge.length === 0) {
      // Empty edge — entire edge is a gap
      if (edgeLen > bestGap) { bestGap = edgeLen; bestEdge = i; }
      continue;
    }

    // Sort particles on this edge by distance from edge start
    const dir = normalize(sub(b, a));
    const dists = onEdge.map(ep => {
      const fromA = sub(ep.particle.pos, a);
      return fromA.x * dir.x + fromA.y * dir.y;
    }).sort((x, y) => x - y);

    // Check gap from edge start to first particle
    if (dists[0] > bestGap) { bestGap = dists[0]; bestEdge = i; }
    // Check gaps between adjacent particles
    for (let j = 1; j < dists.length; j++) {
      const gap = dists[j] - dists[j - 1];
      if (gap > bestGap) { bestGap = gap; bestEdge = i; }
    }
    // Check gap from last particle to edge end
    const tailGap = edgeLen - dists[dists.length - 1];
    if (tailGap > bestGap) { bestGap = tailGap; bestEdge = i; }
  }

  // Recompute targets for the chosen edge with +1 sprinkler
  const edgeA = boundaryPoints[bestEdge];
  const edgeB = boundaryPoints[(bestEdge + 1) % boundaryPoints.length];
  const edgeVec = sub(edgeB, edgeA);
  const edgeLen = magnitude(edgeVec);

  // Current count on this edge
  const currentOnEdge = edgeParticles.filter(ep => ep.edgeIndex === bestEdge);
  const newCount = currentOnEdge.length + 1;
  const newSpacing = edgeLen / newCount;

  // Compute new evenly-spaced targets for this edge
  const newTargets: Point[] = [];
  for (let j = 0; j < newCount; j++) {
    const t = j * newSpacing / edgeLen;
    newTargets.push({ x: edgeA.x + edgeVec.x * t, y: edgeA.y + edgeVec.y * t });
  }

  // Sort existing particles on this edge by distance from edge start
  const dir = normalize(edgeVec);
  currentOnEdge.sort((a, b) => {
    const da = sub(a.particle.pos, edgeA);
    const db = sub(b.particle.pos, edgeA);
    return (da.x * dir.x + da.y * dir.y) - (db.x * dir.x + db.y * dir.y);
  });

  // Assign new targets to existing particles and unsettle them
  for (let j = 0; j < currentOnEdge.length; j++) {
    const pt = currentOnEdge[j].particle;
    pt.target = newTargets[j];
    pt.settled = false;
    pt.vel = { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3 };
  }

  // Spawn new particle at centroid targeting the last new position
  particles.push({
    pos: { x: centroid.x, y: centroid.y },
    vel: { x: 0, y: 0 },
    radius: params.radius,
    settled: false,
    target: newTargets[newTargets.length - 1],
    edgeIndex: bestEdge,
  });

  setInput("count", particles.length);
  simulating = true;
  simFrame = 0;
  frameId = requestAnimationFrame(simulate);
}

// --- Label positioning helpers ---

// Inward normal for an edge (points toward polygon interior)
function edgeInwardNormal(boundary: Point[], edgeIndex: number): Point {
  const a = boundary[edgeIndex];
  const b = boundary[(edgeIndex + 1) % boundary.length];
  const edge = sub(b, a);
  // Two possible normals: (-ey, ex) and (ey, -ex)
  const n1: Point = { x: -edge.y, y: edge.x };
  const centroid = polygonCentroid(boundary);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const toCentroid = sub(centroid, mid);
  // Pick the normal pointing toward centroid (inward)
  const dot = n1.x * toCentroid.x + n1.y * toCentroid.y;
  const n = dot > 0 ? n1 : { x: -n1.x, y: -n1.y };
  return normalize(n);
}

// Outward bisector at a vertex (between the two edges, pointing away from interior)
function vertexOutwardBisector(boundary: Point[], vertexIndex: number): Point {
  const n = boundary.length;
  const prev = boundary[(vertexIndex - 1 + n) % n];
  const curr = boundary[vertexIndex];
  const next = boundary[(vertexIndex + 1) % n];
  // Direction away along each edge from the vertex
  const d1 = normalize(sub(prev, curr));
  const d2 = normalize(sub(next, curr));
  // Bisector of the two outgoing edge directions
  let bisector = normalize(add(d1, d2));
  // Make sure it points outward (away from centroid)
  const centroid = polygonCentroid(boundary);
  const toCenter = sub(centroid, curr);
  const dot = bisector.x * toCenter.x + bisector.y * toCenter.y;
  if (dot > 0) bisector = { x: -bisector.x, y: -bisector.y };
  return bisector;
}

// --- Drawing ---

function draw() {
  const params = readParams();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Boundary
  if (boundaryPoints.length > 0) {
    ctx.beginPath();
    ctx.moveTo(boundaryPoints[0].x, boundaryPoints[0].y);
    for (let i = 1; i < boundaryPoints.length; i++) {
      ctx.lineTo(boundaryPoints[i].x, boundaryPoints[i].y);
    }
    if (boundaryClosed) {
      ctx.closePath();
      ctx.fillStyle = "rgba(34, 87, 122, 0.15)";
      ctx.fill();
    }
    ctx.strokeStyle = "#4ecdc4";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vertex dots and labels
    for (let i = 0; i < boundaryPoints.length; i++) {
      const bp = boundaryPoints[i];
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#4ecdc4";
      ctx.fill();

      // Label — offset outward along vertex bisector
      if (boundaryClosed) {
        const bisector = vertexOutwardBisector(boundaryPoints, i);
        const labelDist = 18;
        const lx = bp.x + bisector.x * labelDist;
        const ly = bp.y + bisector.y * labelDist;
        ctx.fillStyle = "#4ecdc4";
        ctx.font = "bold 18px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(vertexLabel(i), lx, ly);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }
  }

  // Particle coverage circles
  for (const pt of particles) {
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, pt.radius, 0, Math.PI * 2);
    ctx.fillStyle = pt.settled ? "rgba(69, 183, 209, 0.08)" : "rgba(69, 183, 209, 0.04)";
    ctx.fill();
    ctx.strokeStyle = pt.settled ? "rgba(69, 183, 209, 0.25)" : "rgba(69, 183, 209, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Particle heads and numbers
  const sortedIndices = getSortedParticleIndices();
  const numberMap = new Map<number, number>(); // particleIndex -> displayNumber
  sortedIndices.forEach((pIdx, displayIdx) => numberMap.set(pIdx, displayIdx + 1));

  for (let i = 0; i < particles.length; i++) {
    const pt = particles[i];
    ctx.beginPath();
    ctx.arc(pt.pos.x, pt.pos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = pt.settled ? "#45b7d1" : "rgba(69, 183, 209, 0.5)";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Number label — offset inward (bisector at vertices, edge normal otherwise)
    if (pt.settled && numberMap.has(i) && boundaryClosed) {
      const vtx = boundaryPoints[pt.edgeIndex];
      const atVertex = Math.abs(pt.pos.x - vtx.x) < 1 && Math.abs(pt.pos.y - vtx.y) < 1;
      let offset: Point;
      if (atVertex) {
        // Inward bisector (opposite of the outward vertex bisector)
        const outward = vertexOutwardBisector(boundaryPoints, pt.edgeIndex);
        offset = { x: -outward.x, y: -outward.y };
      } else {
        offset = edgeInwardNormal(boundaryPoints, pt.edgeIndex);
      }
      const labelDist = 16;
      const lx = pt.pos.x + offset.x * labelDist;
      const ly = pt.pos.y + offset.y * labelDist;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(numberMap.get(i)!), lx, ly);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  // Status text
  ctx.fillStyle = "#888";
  ctx.font = "18px system-ui";
  if (!boundaryClosed) {
    ctx.fillText(`${boundaryPoints.length} points — click to add, Enter to close`, 16, canvas.height - 16);
  } else if (!simulating && particles.length === 0) {
    ctx.fillText("Boundary closed — press Space to simulate", 16, canvas.height - 16);
  } else {
    const settled = particles.filter(pt => pt.settled).length;
    const state = simulating ? `simulating (${settled}/${particles.length} settled)` : "settled";
    ctx.fillText(`${particles.length} sprinklers — radius: ${params.radius}px — ${state}`, 16, canvas.height - 16);
  }
}

// --- Reset ---

function reset() {
  cancelAnimationFrame(frameId);
  boundaryPoints = [];
  boundaryClosed = false;
  particles = [];
  simulating = false;
  draw();
  updateStats();
}

// --- Events ---

// --- Vertex dragging ---

let draggingVertex = -1;
let didDrag = false;
const DRAG_HIT_RADIUS = 20;

canvas.addEventListener("mousedown", (e) => {
  if (!boundaryClosed || simulating) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  for (let i = 0; i < boundaryPoints.length; i++) {
    const dx = mx - boundaryPoints[i].x;
    const dy = my - boundaryPoints[i].y;
    if (Math.sqrt(dx * dx + dy * dy) < DRAG_HIT_RADIUS) {
      draggingVertex = i;
      didDrag = false;
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

  if (draggingVertex >= 0) {
    boundaryPoints[draggingVertex] = { x: mx, y: my };
    didDrag = true;
    // Live update: recompute targets and snap settled particles
    if (particles.length > 0) {
      const params = readParams();
      const targets = computeTargetPositions(boundaryPoints, params.radius);
      // If count changed, just redraw — full resim on release
      if (targets.length === particles.length) {
        for (let i = 0; i < particles.length; i++) {
          particles[i].target = targets[i].pos;
          particles[i].edgeIndex = targets[i].edgeIndex;
          if (particles[i].settled) {
            particles[i].pos = targets[i].pos;
          }
        }
      }
    }
    draw();
    updateStats();
    return;
  }

  // Hover cursor hint
  if (boundaryClosed && !simulating) {
    let overVertex = false;
    for (const bp of boundaryPoints) {
      if (Math.sqrt((mx - bp.x) ** 2 + (my - bp.y) ** 2) < DRAG_HIT_RADIUS) {
        overVertex = true;
        break;
      }
    }
    canvas.style.cursor = overVertex ? "grab" : "crosshair";
  }
});

canvas.addEventListener("mouseup", () => {
  if (draggingVertex >= 0 && didDrag) {
    draggingVertex = -1;
    canvas.style.cursor = "crosshair";
    setInput("count", 0); // Reset to auto for new shape
    startSimulation();
    return;
  }
  draggingVertex = -1;
  canvas.style.cursor = "crosshair";
});

canvas.addEventListener("click", (e) => {
  if (boundaryClosed || simulating || didDrag) { didDrag = false; return; }
  const rect = canvas.getBoundingClientRect();
  boundaryPoints.push({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });
  draw();
});

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;

  if (e.key === "Enter" && boundaryPoints.length >= 3 && !boundaryClosed) {
    boundaryClosed = true;
    draw();
    updateStats();
  } else if (e.key === " " && boundaryClosed) {
    e.preventDefault();
    startSimulation();
  } else if (e.key === "r" || e.key === "R") {
    reset();
  } else if (e.key === "+" || e.key === "=") {
    addSprinkler();
  } else if (e.key === "Tab") {
    e.preventDefault();
    document.getElementById("bottomBar")!.classList.toggle("collapsed");
  }
});

// --- Context menu (right-click) ---

const ctxMenu = document.getElementById("ctxMenu")!;
const ctxAddBtn = document.getElementById("ctxAddVertex")!;
const ctxDelBtn = document.getElementById("ctxDeleteVertex")!;
let ctxVertexIndex = -1;   // which vertex was right-clicked (-1 = none)
let ctxEdgeIndex = -1;     // which edge to insert on
let ctxPoint: Point = { x: 0, y: 0 }; // where the click happened

function hideCtxMenu() { ctxMenu.style.display = "none"; }

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!boundaryClosed || simulating) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  ctxPoint = { x: mx, y: my };

  // Check if near a vertex
  ctxVertexIndex = -1;
  for (let i = 0; i < boundaryPoints.length; i++) {
    const dx = mx - boundaryPoints[i].x;
    const dy = my - boundaryPoints[i].y;
    if (Math.sqrt(dx * dx + dy * dy) < DRAG_HIT_RADIUS) {
      ctxVertexIndex = i;
      break;
    }
  }

  // Find nearest edge for "add vertex here"
  const nearest = nearestPointOnBoundary(ctxPoint, boundaryPoints);
  ctxEdgeIndex = nearest.edgeIndex;

  // Update menu items
  if (ctxVertexIndex >= 0) {
    ctxAddBtn.textContent = `Add vertex after ${vertexLabel(ctxVertexIndex)}`;
    ctxDelBtn.textContent = `Delete vertex ${vertexLabel(ctxVertexIndex)}`;
    ctxDelBtn.classList.toggle("disabled", boundaryPoints.length <= 3);
  } else {
    const edgeLabel = `${vertexLabel(ctxEdgeIndex)}-${vertexLabel((ctxEdgeIndex + 1) % boundaryPoints.length)}`;
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
  if (ctxVertexIndex >= 0) {
    const a = boundaryPoints[ctxVertexIndex];
    const b = boundaryPoints[(ctxVertexIndex + 1) % boundaryPoints.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    simLog(`ADD VERTEX after ${vertexLabel(ctxVertexIndex)} at midpoint (${Math.round(mid.x)},${Math.round(mid.y)})`);
    boundaryPoints.splice(ctxVertexIndex + 1, 0, mid);
  } else {
    const nearest = nearestPointOnBoundary(ctxPoint, boundaryPoints);
    boundaryPoints.splice(ctxEdgeIndex + 1, 0, nearest.point);
  }
  setInput("count", 0); // Reset to auto so new polygon gets correct count
  if (particles.length > 0) {
    startSimulation();
  } else {
    draw();
    updateStats();
  }
});

ctxDelBtn.addEventListener("click", () => {
  hideCtxMenu();
  if (ctxVertexIndex < 0 || boundaryPoints.length <= 3) return;
  simLog(`DELETE VERTEX ${vertexLabel(ctxVertexIndex)} at (${Math.round(boundaryPoints[ctxVertexIndex].x)},${Math.round(boundaryPoints[ctxVertexIndex].y)})`);
  boundaryPoints.splice(ctxVertexIndex, 1);
  setInput("count", 0); // Reset to auto
  if (particles.length > 0) {
    startSimulation();
  } else {
    draw();
    updateStats();
  }
});

// Dismiss menu on any other click
document.addEventListener("click", hideCtxMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCtxMenu(); });

// Panel buttons
document.getElementById("btnSimulate")!.addEventListener("click", () => startSimulation());
document.getElementById("btnAdd")!.addEventListener("click", () => addSprinkler());
document.getElementById("btnReset")!.addEventListener("click", () => reset());

// Panel toggle
document.getElementById("panelToggle")!.addEventListener("click", () => {
  document.getElementById("bottomBar")!.classList.toggle("collapsed");
});

// Debug: expose state for inspection — always works regardless of who started the sim
(window as any).getState = () => {
  const sorted = getSortedParticleIndices();
  const perim = boundaryClosed ? Math.round(polygonPerimeter(boundaryPoints)) : 0;
  const radius = getInput("radius");
  const lengths = boundaryClosed ? edgeLengths(boundaryPoints) : [];

  // Count actual sprinklers per edge (using stored edge assignment, not nearest-point inference)
  const edgeCounts: number[] = new Array(boundaryPoints.length).fill(0);
  for (const pt of particles) {
    edgeCounts[pt.edgeIndex]++;
  }

  return {
    perimeter: perim,
    suggestedCount: boundaryClosed ? optimalSprinklerCount(boundaryPoints, radius) : 0,
    simulating,
    vertices: boundaryPoints.map((p, i) => ({
      label: vertexLabel(i),
      x: Math.round(p.x),
      y: Math.round(p.y),
    })),
    edges: lengths.map((len, i) => ({
      label: `${vertexLabel(i)}-${vertexLabel((i + 1) % boundaryPoints.length)}`,
      length: Math.round(len),
      optimal: Math.ceil(len / radius),
      actual: edgeCounts[i],
    })),
    sprinklers: sorted.map((pIdx, displayIdx) => {
      const pt = particles[pIdx];
      return {
        num: displayIdx + 1,
        x: Math.round(pt.pos.x),
        y: Math.round(pt.pos.y),
        settled: pt.settled,
        edge: `${vertexLabel(pt.edgeIndex)}-${vertexLabel((pt.edgeIndex + 1) % boundaryPoints.length)}`,
      };
    }),
    logs: [...simLogs],
  };
};

// --- Resize canvas to fill window ---

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
