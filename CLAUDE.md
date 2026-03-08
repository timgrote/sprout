# CLAUDE.md

## Project Overview

Sprout is a browser-based sprinkler layout sandbox. Users draw a boundary polygon, then sprinklers are placed deterministically along edges with uniform spacing — each edge gets `floor(length/radius)` sprinklers. Particles animate from the centroid to their pre-computed targets using spring physics with inter-particle repulsion for visual interest.

## Commands

```bash
bun run dev      # Dev server on port 5555 (serves index.html with TS transpilation)
bun run build    # Bundle to dist/ (browser target)
bun run serve    # Serve the built dist/ folder
```

**Dev server is always at http://localhost:5555.** Do not use other ports. If the server is already running, reuse it — don't start a second instance.

No test runner or linter configured.

## Architecture

Modular TypeScript app rendered on a full-viewport HTML canvas (`index.html`). No framework, no dependencies. All mutable state lives in a single shared `state` object (`src/state.ts`).

**Module structure:**
```
src/
  types.ts        — Point, Particle, TargetInfo interfaces
  geometry.ts     — Vector math, polygon helpers, target computation, label positioning (pure functions)
  state.ts        — Shared mutable state object + simLog()
  ui.ts           — Panel helpers: getInput, setInput, readParams, updateStats
  simulation.ts   — Physics sim loop, startSimulation, addSprinkler, fillInterior, reset
  renderer.ts     — draw() function (all canvas rendering)
  events.ts       — setupEvents() — mouse, keyboard, context menu, panel buttons
  debug.ts        — setupDebug() — window.getState()
  main.ts         — Entry point: canvas init, resize handler, wires modules together
```

**Dependency flow** (no circular deps):
`types` <- `geometry` <- `state` <- `ui` <- `simulation` <- `renderer` <- `events` <- `main`

**App flow:**
1. **Boundary drawing** — click to place polygon vertices (labeled A, B, C...), Enter to close
2. **Target computation** — `computeTargetPositions()` walks each edge, places `floor(len/radius)` evenly-spaced targets. Corner vertices get exactly one sprinkler (shared between adjacent edges).
3. **Animated migration** — Space to start. Particles spawn at centroid, two forces per frame: target spring attraction (pulls toward assigned target) and inter-particle repulsion (visual interest during migration). Repulsion fades as particles approach targets for clean settlement.
4. **Settlement** — particles snap to exact target when close + slow. ~1.5s total animation.
5. **Add sprinkler** — finds edge with largest gap, recomputes even spacing for that edge +1, animates redistribution.

**Polygon editing (post-settlement):**
- **Drag vertices** — click and drag any vertex to reshape; live preview during drag, full re-simulation on release
- **Right-click context menu** — add vertex (midpoint insertion) or delete vertex (min 3); auto-resimulates

**UI:** Compact bottom bar with controls (count, radius, forces) and stats. Collapsible via Tab key or hamburger button.

**Labels:** Vertex labels (A, B, C...) offset outward along the bisector between adjacent edges. Sprinkler numbers offset inward — perpendicular to edge for mid-edge sprinklers, along inward bisector for corner sprinklers.

**Logging:** Simulation events logged to console (`[sprout]` prefix) and available via `getState().logs`. Logs START config, each SETTLED event with edge/position/speed, and COMPLETE summary with per-edge actual vs optimal counts.

**Debug:** `window.getState()` returns full state — vertices, edges (with actual vs optimal counts), sprinklers in perimeter order with edge assignments, and simulation logs.

## Tech Stack

- **Runtime/bundler:** Bun
- **Language:** TypeScript (vanilla, no framework)
- **Rendering:** HTML5 Canvas 2D API
