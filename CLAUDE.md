# CLAUDE.md

## Project Overview

Sprout is a browser-based sprinkler layout sandbox using force-directed particle simulation. Users draw a boundary polygon, then sprinklers spawn at the centroid and migrate to the boundary through physics — boundary attraction, corner preference, and inter-particle repulsion. An emergent/agent-based approach to sprinkler placement instead of deterministic spacing math.

## Commands

```bash
bun run dev      # Dev server (serves index.html with TS transpilation)
bun run build    # Bundle to dist/ (browser target)
bun run serve    # Serve the built dist/ folder
```

No test runner or linter configured.

## Architecture

Single-file TypeScript app (`src/main.ts`) rendered on a full-viewport HTML canvas (`index.html`). No framework, no dependencies. All state is module-level variables.

**App flow:**
1. **Boundary drawing** — click to place polygon vertices (labeled A, B, C...), Enter to close
2. **Simulation** — Space to start. Particles spawn at centroid, three forces act per frame: boundary spring, corner attraction, inter-particle repulsion (linear falloff). Euler integration with damping.
3. **Settlement** — particles snap to boundary when slow + close enough. Numbered 1-N in perimeter order.
4. **Add sprinkler** — drops one at centroid, unsettles the receiving edge so neighbors redistribute.

**UI panels** (fixed overlays): simulation params, force coefficients, stats (perimeter, suggested/actual count).

**Debug:** `window.getState()` returns full state — vertices with labels, sprinklers numbered in perimeter order with edge assignments. Works anytime regardless of who started the sim.

## Tech Stack

- **Runtime/bundler:** Bun
- **Language:** TypeScript (vanilla, no framework)
- **Rendering:** HTML5 Canvas 2D API
