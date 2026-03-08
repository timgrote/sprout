import type { Point, Particle, TargetInfo } from './types';

// --- Vector math ---

export function sub(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
export function add(a: Point, b: Point): Point { return { x: a.x + b.x, y: a.y + b.y }; }
export function scale(v: Point, s: number): Point { return { x: v.x * s, y: v.y * s }; }
export function magnitude(v: Point): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function normalize(v: Point): Point {
  const m = magnitude(v);
  return m < 1e-8 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
}
export function clampMag(v: Point, max: number): Point {
  const m = magnitude(v);
  return m > max ? scale(normalize(v), max) : v;
}

// --- Geometry helpers ---

export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  if (lenSq < 1e-8) return a;
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / lenSq));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

export function nearestPointOnBoundary(p: Point, boundary: Point[]): { point: Point; dist: number; edgeIndex: number } {
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

export function polygonCentroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  return { x: cx / points.length, y: cy / points.length };
}

export function polygonPerimeter(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    len += magnitude(sub(b, a));
  }
  return len;
}

export function edgeLengths(points: Point[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < points.length; i++) {
    lengths.push(magnitude(sub(points[(i + 1) % points.length], points[i])));
  }
  return lengths;
}

// Optimal count: each edge needs ceil(length/radius) intervals.
// Corner sprinklers are shared between adjacent edges.
// Total = sum(ceil(edge_length / radius)) across all edges.
export function optimalSprinklerCount(points: Point[], radius: number): number {
  return edgeLengths(points).reduce((sum, len) => sum + Math.ceil(len / radius), 0);
}

// --- Deterministic target positions ---

export function computeTargetPositions(boundary: Point[], radius: number): TargetInfo[] {
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

// --- Point in polygon (ray casting) ---

export function pointInPolygon(p: Point, boundary: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const yi = boundary[i].y, yj = boundary[j].y;
    if ((yi > p.y) !== (yj > p.y) &&
        p.x < (boundary[j].x - boundary[i].x) * (p.y - yi) / (yj - yi) + boundary[i].x)
      inside = !inside;
  }
  return inside;
}

// --- Interior hex grid targets ---

export function computeInteriorTargets(boundary: Point[], radius: number, coverageFactor: number): Point[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of boundary) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const spacing = radius * coverageFactor;
  const rowHeight = spacing * Math.sqrt(3) / 2;
  const insetDistance = radius * 0.7;

  const candidates: Point[] = [];
  let row = 0;
  for (let y = minY; y <= maxY; y += rowHeight) {
    const xOffset = (row % 2 === 1) ? spacing / 2 : 0;
    for (let x = minX; x <= maxX; x += spacing) {
      const pt = { x: x + xOffset, y };
      if (pointInPolygon(pt, boundary)) {
        const nearest = nearestPointOnBoundary(pt, boundary);
        if (nearest.dist >= insetDistance) {
          candidates.push(pt);
        }
      }
    }
    row++;
  }
  return candidates;
}

// --- Labeling helpers ---

export function perimeterPosition(pt: Point, boundary: Point[]): number {
  const nearest = nearestPointOnBoundary(pt, boundary);
  let cumulative = 0;
  for (let i = 0; i < nearest.edgeIndex; i++) {
    cumulative += magnitude(sub(boundary[(i + 1) % boundary.length], boundary[i]));
  }
  cumulative += magnitude(sub(pt, boundary[nearest.edgeIndex]));
  return cumulative;
}

export function getSortedParticleIndices(particles: Particle[], boundaryPoints: Point[]): number[] {
  if (particles.length === 0 || boundaryPoints.length === 0) return [];
  const perimParticles: { index: number; perimPos: number }[] = [];
  const interiorIndices: number[] = [];
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].type === 'interior') {
      interiorIndices.push(i);
    } else {
      perimParticles.push({ index: i, perimPos: perimeterPosition(particles[i].pos, boundaryPoints) });
    }
  }
  perimParticles.sort((a, b) => a.perimPos - b.perimPos);
  return [...perimParticles.map(w => w.index), ...interiorIndices];
}

export function vertexLabel(i: number): string {
  return String.fromCharCode(65 + i);
}

// Inward normal for an edge (points toward polygon interior)
export function edgeInwardNormal(boundary: Point[], edgeIndex: number): Point {
  const a = boundary[edgeIndex];
  const b = boundary[(edgeIndex + 1) % boundary.length];
  const edge = sub(b, a);
  const n1: Point = { x: -edge.y, y: edge.x };
  const centroid = polygonCentroid(boundary);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const toCentroid = sub(centroid, mid);
  const dot = n1.x * toCentroid.x + n1.y * toCentroid.y;
  const n = dot > 0 ? n1 : { x: -n1.x, y: -n1.y };
  return normalize(n);
}

// Outward bisector at a vertex (between the two edges, pointing away from interior)
export function vertexOutwardBisector(boundary: Point[], vertexIndex: number): Point {
  const n = boundary.length;
  const prev = boundary[(vertexIndex - 1 + n) % n];
  const curr = boundary[vertexIndex];
  const next = boundary[(vertexIndex + 1) % n];
  const d1 = normalize(sub(prev, curr));
  const d2 = normalize(sub(next, curr));
  let bisector = normalize(add(d1, d2));
  const centroid = polygonCentroid(boundary);
  const toCenter = sub(centroid, curr);
  const dot = bisector.x * toCenter.x + bisector.y * toCenter.y;
  if (dot > 0) bisector = { x: -bisector.x, y: -bisector.y };
  return bisector;
}
