import { state, simLog } from './state';
import { sub, add, scale, magnitude, normalize, clampMag, polygonCentroid, polygonPerimeter, edgeLengths, computeTargetPositions, computeInteriorTargets, vertexLabel } from './geometry';
import { readParams, setInput, getInput, updateStats } from './ui';
import { draw } from './renderer';

function simulate() {
  state.simFrame++;
  const p = readParams();
  const repulsionRange = p.radius * 4;

  for (const pt of state.particles) {
    if (pt.settled) continue;

    let force = { x: 0, y: 0 };

    // Target attraction — spring force toward pre-computed destination
    const toTarget = sub(pt.target, pt.pos);
    const distToTarget = magnitude(toTarget);
    force = add(force, scale(toTarget, p.kTarget));

    // Inter-particle repulsion — fades out as particle approaches target
    const repulsionFade = Math.min(1, distToTarget / (p.radius * 0.8));
    for (const other of state.particles) {
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
    if ((distToTarget < 8 && speed < 1.5) || (distToTarget < 2) || state.simFrame > state.MAX_SIM_FRAMES) {
      pt.settled = true;
      pt.vel = { x: 0, y: 0 };
      pt.pos = { x: pt.target.x, y: pt.target.y };
      const settled = state.particles.filter(p => p.settled).length;
      if (pt.type === 'interior') {
        simLog(`SETTLED ${settled}/${state.particles.length} — interior @ (${Math.round(pt.pos.x)},${Math.round(pt.pos.y)}) dist=${distToTarget.toFixed(1)} spd=${speed.toFixed(2)}`);
      } else {
        const edgeLabel = `${vertexLabel(pt.edgeIndex)}-${vertexLabel((pt.edgeIndex + 1) % state.boundaryPoints.length)}`;
        simLog(`SETTLED ${settled}/${state.particles.length} — edge ${edgeLabel} @ (${Math.round(pt.pos.x)},${Math.round(pt.pos.y)}) dist=${distToTarget.toFixed(1)} spd=${speed.toFixed(2)}`);
      }
    }
  }

  if (state.particles.every(pt => pt.settled)) {
    state.simulating = false;
    const perimCount = state.particles.filter(p => p.type === 'perimeter').length;
    const intCount = state.particles.filter(p => p.type === 'interior').length;
    simLog(`COMPLETE — ${state.particles.length} sprinklers (${perimCount} perim + ${intCount} interior) settled in ${state.simFrame} frames`);
    const edgeCounts: number[] = new Array(state.boundaryPoints.length).fill(0);
    for (const pt of state.particles) {
      if (pt.type === 'perimeter') edgeCounts[pt.edgeIndex]++;
    }
    const lengths = edgeLengths(state.boundaryPoints);
    for (let i = 0; i < state.boundaryPoints.length; i++) {
      const optimal = Math.floor(lengths[i] / state.particles[0].radius);
      const label = `${vertexLabel(i)}-${vertexLabel((i + 1) % state.boundaryPoints.length)}`;
      simLog(`  ${label}: ${edgeCounts[i]} actual / ${optimal} optimal ${edgeCounts[i] === optimal ? "✓" : "✗"}`);
    }
    if (intCount > 0) simLog(`  interior: ${intCount} sprinklers`);
    draw();
    updateStats();
    if (state.pendingInteriorRefill && intCount === 0) {
      state.pendingInteriorRefill = false;
      fillInterior();
    }
    return;
  }

  draw();
  updateStats();
  state.frameId = requestAnimationFrame(simulate);
}

export function startSimulation() {
  if (!state.boundaryClosed) return;
  cancelAnimationFrame(state.frameId);

  const params = readParams();
  const centroid = polygonCentroid(state.boundaryPoints);
  const targets = computeTargetPositions(state.boundaryPoints, params.radius);
  const n = params.count > 0 ? Math.min(params.count, targets.length) : targets.length;

  state.simLogs.length = 0;
  state.simFrame = 0;
  const perim = Math.round(polygonPerimeter(state.boundaryPoints));
  const lengths = edgeLengths(state.boundaryPoints);
  simLog(`START — ${state.boundaryPoints.length} vertices, perimeter ${perim}px, radius ${params.radius}`);
  for (let i = 0; i < state.boundaryPoints.length; i++) {
    const intervals = Math.floor(lengths[i] / params.radius);
    simLog(`  edge ${vertexLabel(i)}-${vertexLabel((i + 1) % state.boundaryPoints.length)}: ${Math.round(lengths[i])}px → ${intervals} sprinklers (spacing ${(lengths[i] / intervals).toFixed(1)}px)`);
  }
  simLog(`  total targets: ${targets.length}, spawning: ${n}`);

  setInput("count", n);

  state.interiorPlaced = false;
  state.particles = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const jitter = 1 + Math.random();
    state.particles.push({
      pos: { x: centroid.x + Math.cos(angle) * jitter, y: centroid.y + Math.sin(angle) * jitter },
      vel: { x: 0, y: 0 },
      radius: params.radius,
      settled: false,
      target: targets[i].pos,
      edgeIndex: targets[i].edgeIndex,
      type: 'perimeter',
    });
  }

  state.simulating = true;
  state.simFrame = 0;
  state.frameId = requestAnimationFrame(simulate);
}

export function addSprinkler() {
  if (!state.boundaryClosed || state.simulating) return;
  if (state.particles.length === 0) {
    setInput("count", 1);
    startSimulation();
    return;
  }

  const params = readParams();
  const centroid = polygonCentroid(state.boundaryPoints);

  const edgeParticles: { particle: typeof state.particles[0]; edgeIndex: number }[] = [];
  for (const pt of state.particles) {
    edgeParticles.push({ particle: pt, edgeIndex: pt.edgeIndex });
  }

  let bestEdge = 0;
  let bestGap = 0;
  for (let i = 0; i < state.boundaryPoints.length; i++) {
    const onEdge = edgeParticles.filter(ep => ep.edgeIndex === i);
    const a = state.boundaryPoints[i];
    const b = state.boundaryPoints[(i + 1) % state.boundaryPoints.length];
    const edgeLen = magnitude(sub(b, a));

    if (onEdge.length === 0) {
      if (edgeLen > bestGap) { bestGap = edgeLen; bestEdge = i; }
      continue;
    }

    const dir = normalize(sub(b, a));
    const dists = onEdge.map(ep => {
      const fromA = sub(ep.particle.pos, a);
      return fromA.x * dir.x + fromA.y * dir.y;
    }).sort((x, y) => x - y);

    if (dists[0] > bestGap) { bestGap = dists[0]; bestEdge = i; }
    for (let j = 1; j < dists.length; j++) {
      const gap = dists[j] - dists[j - 1];
      if (gap > bestGap) { bestGap = gap; bestEdge = i; }
    }
    const tailGap = edgeLen - dists[dists.length - 1];
    if (tailGap > bestGap) { bestGap = tailGap; bestEdge = i; }
  }

  const edgeA = state.boundaryPoints[bestEdge];
  const edgeB = state.boundaryPoints[(bestEdge + 1) % state.boundaryPoints.length];
  const edgeVec = sub(edgeB, edgeA);
  const edgeLen = magnitude(edgeVec);

  const currentOnEdge = edgeParticles.filter(ep => ep.edgeIndex === bestEdge);
  const newCount = currentOnEdge.length + 1;
  const newSpacing = edgeLen / newCount;

  const newTargets: { x: number; y: number }[] = [];
  for (let j = 0; j < newCount; j++) {
    const t = j * newSpacing / edgeLen;
    newTargets.push({ x: edgeA.x + edgeVec.x * t, y: edgeA.y + edgeVec.y * t });
  }

  const dir = normalize(edgeVec);
  currentOnEdge.sort((a, b) => {
    const da = sub(a.particle.pos, edgeA);
    const db = sub(b.particle.pos, edgeA);
    return (da.x * dir.x + da.y * dir.y) - (db.x * dir.x + db.y * dir.y);
  });

  for (let j = 0; j < currentOnEdge.length; j++) {
    const pt = currentOnEdge[j].particle;
    pt.target = newTargets[j];
    pt.settled = false;
    pt.vel = { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3 };
  }

  state.particles.push({
    pos: { x: centroid.x, y: centroid.y },
    vel: { x: 0, y: 0 },
    radius: params.radius,
    settled: false,
    target: newTargets[newTargets.length - 1],
    edgeIndex: bestEdge,
    type: 'perimeter',
  });

  setInput("count", state.particles.length);
  state.simulating = true;
  state.simFrame = 0;
  state.frameId = requestAnimationFrame(simulate);
}

export function fillInterior() {
  if (!state.boundaryClosed || state.simulating) return;
  if (state.particles.length === 0 || !state.particles.every(p => p.settled)) return;
  if (state.interiorPlaced) return;

  const params = readParams();
  const coverageFactor = getInput("coverageFactor");
  const centroid = polygonCentroid(state.boundaryPoints);
  const targets = computeInteriorTargets(state.boundaryPoints, params.radius, coverageFactor);

  if (targets.length === 0) {
    simLog(`FILL — no interior targets needed (perimeter covers everything)`);
    state.interiorPlaced = true;
    return;
  }

  simLog(`FILL — spawning ${targets.length} interior sprinklers (coverage factor ${coverageFactor})`);

  for (let i = 0; i < targets.length; i++) {
    const angle = (i / targets.length) * Math.PI * 2;
    const jitter = 1 + Math.random();
    state.particles.push({
      pos: { x: centroid.x + Math.cos(angle) * jitter, y: centroid.y + Math.sin(angle) * jitter },
      vel: { x: 0, y: 0 },
      radius: params.radius,
      settled: false,
      target: targets[i],
      edgeIndex: -1,
      type: 'interior',
    });
  }

  state.interiorPlaced = true;
  state.simulating = true;
  state.simFrame = 0;
  state.frameId = requestAnimationFrame(simulate);
}

export function reset() {
  cancelAnimationFrame(state.frameId);
  state.boundaryPoints = [];
  state.boundaryClosed = false;
  state.particles = [];
  state.simulating = false;
  state.interiorPlaced = false;
  state.pendingInteriorRefill = false;
  draw();
  updateStats();
}
