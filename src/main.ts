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
    kBoundary: getInput("kBoundary"),
    kCorner: getInput("kCorner"),
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
  const suggested = Math.max(boundaryPoints.length, Math.round(perim / (radius * 2)));
  const settled = particles.filter(p => p.settled).length;
  const status = simulating ? `simulating (${settled}/${particles.length})` : particles.length > 0 ? "settled" : "ready";

  document.getElementById("statPerimeter")!.textContent = `${Math.round(perim)}px`;
  document.getElementById("statSuggested")!.textContent = `${suggested} (perim/${radius*2})`;
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

// --- Simulation ---

function simulate() {
  simFrame++;
  const p = readParams();
  const cornerThreshold = p.radius * 1.5;
  const repulsionRange = p.radius * 4;

  for (const pt of particles) {
    if (pt.settled) continue;

    let force: Point = { x: 0, y: 0 };

    // Boundary attraction
    const nearest = nearestPointOnBoundary(pt.pos, boundaryPoints);
    const toBoundary = sub(nearest.point, pt.pos);
    force = add(force, scale(toBoundary, p.kBoundary));

    // Corner preference
    for (const vertex of boundaryPoints) {
      const toVertex = sub(vertex, pt.pos);
      const d = magnitude(toVertex);
      if (d < cornerThreshold && d > 1e-4) {
        force = add(force, scale(normalize(toVertex), p.kCorner * (1 - d / cornerThreshold)));
      }
    }

    // Inter-particle repulsion — linear falloff for even spreading
    for (const other of particles) {
      if (other === pt) continue;
      const away = sub(pt.pos, other.pos);
      const d = magnitude(away);
      if (d < repulsionRange && d > 1e-4) {
        const strength = p.kRepulsion * (1 - d / repulsionRange);
        force = add(force, scale(normalize(away), strength));
      }
    }

    force = clampMag(force, p.maxForce);
    pt.vel = scale(add(pt.vel, force), p.damping);
    pt.pos = add(pt.pos, pt.vel);

    const closeEnough = nearest.dist < 3.0;
    const slowEnough = magnitude(pt.vel) < 0.08;
    if ((slowEnough && closeEnough) || simFrame > MAX_SIM_FRAMES) {
      pt.settled = true;
      pt.vel = { x: 0, y: 0 };
      pt.pos = nearest.point;
    }
  }

  if (particles.every(pt => pt.settled)) {
    simulating = false;
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
  const perimeter = polygonPerimeter(boundaryPoints);
  const n = params.count > 0
    ? params.count
    : Math.max(boundaryPoints.length, Math.round(perimeter / (params.radius * 2)));

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
    // No existing particles — just start a sim with 1
    setInput("count", 1);
    startSimulation();
    return;
  }

  const centroid = polygonCentroid(boundaryPoints);
  const params = readParams();

  // Add new particle at centroid
  const newParticle: Particle = {
    pos: { x: centroid.x, y: centroid.y },
    vel: { x: 0, y: 0 },
    radius: params.radius,
    settled: false,
  };
  particles.push(newParticle);

  // Figure out which edge the new particle will land on (nearest to centroid)
  const nearest = nearestPointOnBoundary(centroid, boundaryPoints);
  const targetEdge = nearest.edgeIndex;

  // Unsettle all particles on that edge so they redistribute
  for (const pt of particles) {
    if (!pt.settled) continue;
    const ptEdge = nearestPointOnBoundary(pt.pos, boundaryPoints).edgeIndex;
    if (ptEdge === targetEdge) {
      pt.settled = false;
      // Give a tiny nudge so they're not frozen
      pt.vel = { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 };
    }
  }

  setInput("count", particles.length);
  simulating = true;
  simFrame = 0;
  frameId = requestAnimationFrame(simulate);
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

      // Label
      if (boundaryClosed) {
        ctx.fillStyle = "#4ecdc4";
        ctx.font = "bold 18px system-ui";
        ctx.fillText(vertexLabel(i), bp.x - 20, bp.y - 12);
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

    // Number label (only when settled or enough particles exist)
    if (pt.settled && numberMap.has(i)) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px system-ui";
      const num = String(numberMap.get(i)!);
      ctx.fillText(num, pt.pos.x + 9, pt.pos.y - 10);
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

canvas.addEventListener("click", (e) => {
  if (boundaryClosed || simulating) return;
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
  }
});

// Panel buttons
document.getElementById("btnSimulate")!.addEventListener("click", () => startSimulation());
document.getElementById("btnAdd")!.addEventListener("click", () => addSprinkler());
document.getElementById("btnReset")!.addEventListener("click", () => reset());

// Debug: expose state for inspection — always works regardless of who started the sim
(window as any).getState = () => {
  const sorted = getSortedParticleIndices();
  const perim = boundaryClosed ? Math.round(polygonPerimeter(boundaryPoints)) : 0;
  return {
    perimeter: perim,
    suggestedCount: boundaryClosed ? Math.max(boundaryPoints.length, Math.round(perim / (getInput("radius") * 2))) : 0,
    simulating,
    vertices: boundaryPoints.map((p, i) => ({
      label: vertexLabel(i),
      x: Math.round(p.x),
      y: Math.round(p.y),
    })),
    sprinklers: sorted.map((pIdx, displayIdx) => {
      const pt = particles[pIdx];
      const edge = nearestPointOnBoundary(pt.pos, boundaryPoints);
      return {
        num: displayIdx + 1,
        x: Math.round(pt.pos.x),
        y: Math.round(pt.pos.y),
        settled: pt.settled,
        edge: `${vertexLabel(edge.edgeIndex)}-${vertexLabel((edge.edgeIndex + 1) % boundaryPoints.length)}`,
      };
    }),
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
