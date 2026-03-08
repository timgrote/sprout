# Real-World Coordinate System, Distance Feedback, Pan & Zoom

## Context

Sprout currently operates in raw canvas pixels — distances and radius have no real-world meaning. Tim works in feet and wants to see actual measurements while designing layouts, like a lightweight CAD tool. This means:

1. A coordinate system where 1 unit = 1 foot, with a configurable zoom (pixels per foot)
2. Live distance feedback while drawing the polygon (distance to last point and to closing point)
3. Scroll wheel zoom (toward cursor, standard CAD behavior)
4. Middle mouse button pan

## Approach: Viewport Transform

Store all geometry in **world coordinates (feet)**. Maintain a viewport with pan offset and zoom level. Use `ctx.setTransform()` for rendering — all world-space drawing happens automatically, and only text/fixed-size elements need counter-scaling.

```
World-to-Screen: screenX = (worldX - panX) * zoom
Screen-to-World: worldX = screenX / zoom + panX
```

**Default zoom: 10 px/ft** — shows ~192 x 108 ft on a 1920x1080 screen. Comfortable for residential yards.

**Default radius: 15 ft** (was 50 px) — realistic sprinkler throw radius.

## Files to Create

### `src/viewport.ts` (~40 lines)
New module — coordinate conversion and zoom logic:
- `screenToWorld(sx, sy, vp)` / `worldToScreen(wx, wy, vp)`
- `applyTransform(ctx, vp)` — sets `ctx.setTransform()` for world-space drawing
- `resetTransform(ctx)` — back to screen space for HUD elements
- `zoomAt(vp, screenX, screenY, factor)` — zoom toward cursor (adjusts pan so world point under cursor stays fixed)

## Files to Modify

### `src/state.ts`
Add to state object:
- `viewport: { panX: 0, panY: 0, zoom: 10 }` — camera state
- `panning: false` + `panStart*` — middle-mouse drag state
- `mouseWorld: {x:0, y:0}` — current mouse position in world coords (for distance feedback)

### `src/events.ts` (heaviest change)
Every mouse handler currently does `e.clientX - rect.left` and uses raw pixels. Change to:
- Convert to screen coords (as before), then `screenToWorld()` before storing/comparing
- Hit-testing (vertex drag, hover) compares screen-pixel distances (convert boundary points to screen first)
- **New: `wheel` event** — `zoomAt()` toward cursor, redraw
- **New: middle-mouse pan** — `mousedown` button===1 starts pan, `mousemove` updates `viewport.panX/Y`, `mouseup` ends
- **Track `state.mouseWorld`** on every mousemove — triggers redraw during drawing phase for distance lines
- Prevent middle-click context menu via `auxclick`

### `src/renderer.ts` (second heaviest)
Restructure `draw()`:
1. Clear canvas in screen space
2. `applyTransform()` — switch to world space
3. Draw boundary, particles, labels — same geometry, but:
   - Line widths: `desiredScreenPx / zoom` (e.g., `2 / zoom` for boundary)
   - Vertex dots, sprinkler heads: radius in `px / zoom`
   - Text labels: `ctx.save(); ctx.translate(worldX, worldY); ctx.scale(1/zoom, 1/zoom); fillText(); ctx.restore()`
4. `resetTransform()` — switch to screen space for HUD
5. **New: distance feedback** — while drawing (boundary not closed):
   - Dashed line from last vertex to mouse, labeled with distance in feet
   - Dashed line from mouse to first vertex (closing distance), labeled
6. **New: scale bar** — bottom-right corner, shows a reference length in feet
7. Status text stays in screen space, units change from `px` to `ft`

### `src/simulation.ts`
Adjust constants that were calibrated for pixels (now feet):
- Settlement: `distToTarget < 8` → `distToTarget < 0.5` (ft), `speed < 1.5` → `speed < 0.1`
- Spawn jitter: `1 + Math.random()` → `0.1 + Math.random() * 0.1`
- Velocity nudge in addSprinkler: `0.3` → `0.03`
- Log messages: `"px"` → `"ft"`
- Repulsion range (`radius * 4`) stays — same relative scale

### `index.html`
- Radius input: `value="15" min="1" max="50" step="0.5"` (was 50/10/200/5)
- Add zoom stat: `<div class="stat"><span class="stat-label">Zoom</span> <span class="val" id="statZoom">10 px/ft</span></div>`
- Update help text: add `<kbd>Scroll</kbd> zoom` and `<kbd>Middle drag</kbd> pan`

### `src/ui.ts`
- `updateStats()`: change `"px"` → `"ft"` in perimeter display
- Add zoom level update to stats (`statZoom`)

### `src/debug.ts`
- Add `viewport` and `zoom` to `getState()` output

## Implementation Order

1. `src/viewport.ts` — new file, no deps
2. `src/state.ts` — add viewport + pan state
3. `src/events.ts` — coordinate conversion, wheel, pan, mouse tracking
4. `src/renderer.ts` — viewport transform, counter-scaling, distance feedback, scale bar
5. `index.html` — radius defaults, zoom stat, help text
6. `src/ui.ts` — feet labels, zoom display
7. `src/simulation.ts` — threshold/jitter tuning, log text
8. `src/debug.ts` — viewport in debug output

## Gotchas

- **Context menu position** (`ctxMenu.style.left/top`) uses `e.clientX/clientY` — stays as-is (DOM element, screen space). But `state.ctxPoint` must store world coords.
- **`click` only fires for button 0**, so middle-click pan won't accidentally place vertices.
- **Text at high zoom** will be enormous without counter-scaling — every `fillText` call in world space needs the save/translate/scale/restore pattern.
- **Line widths** in world space: a `lineWidth` of 2 at zoom=10 renders as 20 screen pixels. Always divide by zoom.

## Verification

1. `bun run build` succeeds
2. Draw polygon — distances shown in feet between cursor and last/first vertex
3. Enter closes, simulates, fills — sprinklers placed correctly with radius in feet
4. Scroll wheel zooms in/out toward cursor — geometry stays stable
5. Middle mouse drag pans the view
6. Vertex drag still works with live preview
7. Right-click context menu works (positioned correctly in screen space)
8. Stats show feet, zoom level displayed
9. `getState()` includes viewport info
10. Scale bar renders correctly at different zoom levels
