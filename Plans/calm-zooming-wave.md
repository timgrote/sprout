# Uniform Sprinkler Placement — Sequential Edge-Aware Algorithm

## Context

The current force-directed simulation (all particles spawned at centroid simultaneously) produces uneven distribution:
- **Corner stacking** — corner attraction locks two sprinklers on top of each other at vertices (e.g. sprinklers 12+13 both at vertex B)
- **Corner gaps** — repulsion pushes edge sprinklers away from corner sprinklers, creating dry spots near vertices
- **Unbalanced edges** — chaotic all-at-once spawn means some edges get too many, others too few (A-B got 12 vs optimal 10, D-A got 5 vs optimal 7)

The force sim is fun to watch but unreliable for uniform coverage. Tim wants a placement algorithm that guarantees even spacing — particularly around corners.

## The Problem Mathematically

Given a polygon with vertices V0..Vn and radius r, place N sprinklers on the boundary such that:
1. Every point on the boundary is within r of at least one sprinkler
2. Spacing between adjacent sprinklers is as uniform as possible
3. Corner vertices get exactly one sprinkler (shared between both edges)
4. The animation still looks cool (particles travel from center to their target)

## Algorithm: Sequential Deterministic Placement with Animated Migration

### Phase 1 — Compute target positions (deterministic, before animation)

**Step 1: Assign sprinklers per edge**

For each edge i with length L_i:
```
intervals_i = floor(L_i / r)
```

Total sprinklers N = sum of all intervals_i. Corner sprinklers are shared — each vertex gets one sprinkler that "belongs to" the edge starting at that vertex.

**Step 2: Compute exact positions along each edge**

For edge i from vertex V_i to V_{i+1} with length L_i and intervals_i sprinklers:
```
spacing_i = L_i / intervals_i
```

Sprinkler positions on edge i:
```
P_{i,0} = V_i                              (the corner sprinkler)
P_{i,j} = V_i + (j * spacing_i / L_i) * (V_{i+1} - V_i)   for j = 1..intervals_i - 1
```

Note: the last position P_{i, intervals_i} would be V_{i+1}, but that's the corner sprinkler of the NEXT edge, so we don't place it here. This is how corners are shared.

**Example — 500x350 rectangle, r=50:**

| Edge | Length | Intervals | Spacing | Positions |
|------|--------|-----------|---------|-----------|
| A-B | 500 | 10 | 50.0 | A, A+50, A+100, ..., A+450 |
| B-C | 350 | 7 | 50.0 | B, B+50, B+100, ..., B+300 |
| C-D | 500 | 10 | 50.0 | C, C+50, C+100, ..., C+450 |
| D-A | 350 | 7 | 50.0 | D, D+50, D+100, ..., D+300 |

Total: 34 sprinklers. Every sprinkler is exactly 50px from its neighbors. Corners get exactly one sprinkler each.

**Edge case — non-exact division:**

If L_i = 520 and r = 50: intervals = floor(520/50) = 10, spacing = 520/10 = 52px. Slightly wider than r but the best uniform distribution for this edge. The per-edge spacing adapts to the actual edge length.

### Phase 2 — Animate (the fun part)

All N target positions are pre-computed. Now we animate:

1. Spawn all particles at centroid (same as current)
2. Each particle has a `target: Point` property — its computed destination
3. Force model changes:
   - **Remove** corner attraction force entirely (no more corner stacking)
   - **Replace** boundary attraction with **target attraction**: spring force toward the particle's assigned target position
   - **Keep** inter-particle repulsion (makes the migration visually interesting as they jostle)
4. Settlement: when a particle is within 2px of its target and moving slowly, snap to exact target position

This gives us the best of both worlds: deterministic final positions (guaranteed uniform) with the animated migration from center (still looks emergent and cool).

### Phase 3 — Add Sprinkler (incremental)

When adding a sprinkler to an existing settled layout:
1. Find the edge with the largest gap (max spacing between adjacent sprinklers)
2. Compute new target: midpoint of the largest gap on that edge
3. Recompute targets for other sprinklers on that edge to redistribute evenly
4. Unsettle that edge's sprinklers, animate redistribution

## Files to Modify

- `src/main.ts` — replace simulation logic (~485 lines, substantial rewrite of `startSimulation()`, `simulate()`, `addSprinkler()`)

## Implementation Plan

### 1. Add `target` to Particle interface
```typescript
interface Particle {
  pos: Point;
  vel: Point;
  radius: number;
  settled: boolean;
  target: Point;     // <-- new: pre-computed destination
}
```

### 2. New function: `computeTargetPositions(boundary, radius) → Point[]`
- Walk each edge, compute intervals = floor(len/r), spacing = len/intervals
- Place corner sprinkler at vertex, then evenly spaced along edge
- Return flat array of all target positions in perimeter order

### 3. Rewrite `startSimulation()`
- Compute targets via `computeTargetPositions()`
- Spawn N particles at centroid with jitter (same visual as before)
- Assign each particle its target (in perimeter order)

### 4. Modify `simulate()` force model
- Replace boundary attraction with: `targetForce = K_TARGET * (target - pos)`
- Remove corner attraction force entirely
- Keep inter-particle repulsion (visual interest during migration)
- Settlement: `dist(pos, target) < 2 AND speed < 0.08` → snap to target

### 5. Rewrite `addSprinkler()`
- Find edge with largest max gap between adjacent settled sprinklers
- Recompute even spacing for that edge with +1 sprinkler
- Assign new targets to all sprinklers on that edge
- Unsettle them, animate redistribution

### 6. Update `optimalSprinklerCount()` — already correct
The existing `sum(floor(L_i / r))` formula matches this algorithm exactly.

## Verification

1. `bun build src/main.ts --outdir dist --target browser` succeeds
2. Draw rectangle, press Space — particles migrate from center to targets
3. Final positions: each edge has `floor(L/r)` sprinklers at `L/floor(L/r)` spacing
4. Corners have exactly ONE sprinkler each (no stacking)
5. No gap between corner sprinkler and nearest edge sprinkler larger than the per-edge spacing
6. `getState().edges` shows actual == optimal for every edge
7. Add Sprinkler inserts into the edge with the most space, redistributes evenly
8. Animation still looks emergent/fun (repulsion during migration)
