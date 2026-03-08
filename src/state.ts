import type { Point, Particle } from './types';

export const state = {
  canvas: null! as HTMLCanvasElement,
  ctx: null! as CanvasRenderingContext2D,
  boundaryPoints: [] as Point[],
  boundaryClosed: false,
  particles: [] as Particle[],
  simulating: false,
  interiorPlaced: false,
  pendingInteriorRefill: false,
  frameId: 0,
  simFrame: 0,
  MAX_SIM_FRAMES: 600,
  simLogs: [] as string[],
  // Viewport (world coords in feet)
  viewport: { panX: 0, panY: 0, zoom: 10 },
  // Pan state (middle mouse)
  panning: false,
  panStartX: 0,
  panStartY: 0,
  panStartPanX: 0,
  panStartPanY: 0,
  // Mouse position in world coords (for distance feedback)
  mouseWorld: { x: 0, y: 0 } as Point,
  // Vertex drag state
  draggingVertex: -1,
  didDrag: false,
  DRAG_HIT_RADIUS: 20,
  // Context menu state
  ctxVertexIndex: -1,
  ctxEdgeIndex: -1,
  ctxPoint: { x: 0, y: 0 } as Point,
};

export function simLog(msg: string) {
  const entry = `[frame ${state.simFrame}] ${msg}`;
  state.simLogs.push(entry);
  console.log(`%c[sprout]%c ${entry}`, "color:#4ecdc4;font-weight:bold", "color:inherit");
}
