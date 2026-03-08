import type { Point } from './types';

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export function screenToWorld(sx: number, sy: number, vp: Viewport): Point {
  return { x: sx / vp.zoom + vp.panX, y: sy / vp.zoom + vp.panY };
}

export function worldToScreen(wx: number, wy: number, vp: Viewport): Point {
  return { x: (wx - vp.panX) * vp.zoom, y: (wy - vp.panY) * vp.zoom };
}

export function applyTransform(ctx: CanvasRenderingContext2D, vp: Viewport) {
  ctx.setTransform(vp.zoom, 0, 0, vp.zoom, -vp.panX * vp.zoom, -vp.panY * vp.zoom);
}

export function resetTransform(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function zoomAt(vp: Viewport, screenX: number, screenY: number, factor: number) {
  // World point under cursor before zoom
  const wx = screenX / vp.zoom + vp.panX;
  const wy = screenY / vp.zoom + vp.panY;
  vp.zoom *= factor;
  // Adjust pan so same world point stays under cursor
  vp.panX = wx - screenX / vp.zoom;
  vp.panY = wy - screenY / vp.zoom;
}
