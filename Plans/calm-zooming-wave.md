# Emergent Sprinkler Placement — Force-Directed Particle Simulation

## Context

Current Sprout app places sprinklers deterministically along the boundary at fixed spacing. Tim wants to explore an emergent/agent-based approach: drop sprinklers in the center and let them migrate to the boundary through a physics simulation. The goal is to study whether force-based placement can achieve even distribution without manual spacing math — especially around corners, where sprinklers should naturally settle because they maximize boundary contact.

## Concept

Each sprinkler is a particle with three forces acting on it:
- **Boundary attraction** — spring force pulling toward nearest point on polygon edge
- **Corner preference** — extra attraction near polygon vertices (two edges = more boundary contact)
- **Inter-particle repulsion** — inverse-square push between all pairs (even spacing)

Particles start clustered at polygon centroid, animate outward, jostle along edges, snap into corners, and settle into equilibrium. Like gas molecules finding resting positions in a container.

## Files to Modify

- `src/main.ts` — all simulation logic (single file, ~180 → ~400 lines)
- `index.html` — update control hints for new keybindings

## Implementation Plan

### 1. Add vector math helpers
`sub`, `add`, `scale`, `magnitude`, `normalize`, `clampMag` — small pure functions operating on `Point`.

### 2. Add geometry helpers
- `nearestPointOnSegment(p, a, b)` — point-to-line-segment projection, clamped to [0,1]
- `nearestPointOnBoundary(p, boundary)` — iterate all edges, return closest point + distance + edge index
- `polygonCentroid(points)` — average of vertices
- `polygonPerimeter(points)` — sum of edge lengths

### 3. Replace Sprinkler interface with Particle
```typescript
interface Particle {
  pos: Point;
  vel: Point;
  radius: number;
  settled: boolean;
}
```

### 4. New state variables
```typescript
let particles: Particle[] = [];
let simulating = false;
let sprinklerRadius = 50;  // mutable via [ and ] keys
let frameId = 0;
```
Remove: `placementPoints`, `animationStep`, `SPRINKLER_SPACING`, `ANIMATION_DELAY`.

### 5. Force model constants
| Constant | Value | Purpose |
|----------|-------|---------|
| K_BOUNDARY | 0.08 | Boundary spring strength |
| K_CORNER | 0.15 | Corner snap strength |
| K_REPULSION | 0.5 | Inter-particle push |
| DAMPING | 0.92 | Velocity decay/frame |
| MAX_FORCE | 5.0 | Force cap |
| CORNER_THRESHOLD | radius * 1.5 | Corner attraction range |
| REPULSION_RANGE | radius * 4 | Repulsion cutoff |
| SETTLE_SPEED | 0.05 | Settled velocity threshold |
| SETTLE_DIST | 2.0 | Settled boundary distance threshold |

These are starting guesses — will need tuning.

### 6. Simulation loop (`simulate()`)
- `requestAnimationFrame` based (not setTimeout)
- Per particle per frame: compute boundary force + corner force + repulsion force, clamp, Euler integrate velocity + position
- Per-particle settled detection: speed < 0.05 AND distance from boundary < 2px
- Global termination: all particles settled → stop
- Calls `draw()` each frame

### 7. Start simulation (`startSimulation()`)
- Calculate N = `max(corners, round(perimeter / (radius * 2)))`
- Create N particles at centroid with small random offsets (+-10px)
- Set `simulating = true`, kick off `requestAnimationFrame`

### 8. Radius control
- `[` key: decrease radius by 5 (min 10)
- `]` key: increase radius by 5 (max 200)
- On change: if simulating, cancel and restart

### 9. Update draw()
- Render from `particles[]` instead of `sprinklers[]`
- Settled particles: solid fill. Moving particles: slightly translucent
- Status text shows: radius, particle count, sim state

### 10. Update index.html
- Add `[`/`]` to control hints for radius
- Remove spacing reference

### 11. Fix package.json build entry
- Change `src/index.ts` → `src/main.ts` in the build script

## Known Tradeoffs

- **Euler integration** — simple, good enough for visual exploration. Not physically accurate.
- **Centroid may be outside concave polygons** — particles still migrate correctly, just looks slightly odd at start.
- **N^2 repulsion** — fine for < 100 particles. No spatial partitioning needed.
- **No hard containment** — particles could theoretically overshoot boundary. Damping prevents this in practice. Can add boundary reflection later if needed.

## Verification

1. `bun build src/main.ts --outdir dist --target browser` succeeds
2. Open in browser, draw a polygon, press Space — particles appear at center
3. Particles animate toward boundary edges
4. Particles snap into corners and settle
5. `[` / `]` keys change radius, simulation restarts with new count
6. `R` resets everything
7. Status text shows current radius and particle count
