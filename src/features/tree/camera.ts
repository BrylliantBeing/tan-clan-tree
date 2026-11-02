export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;

// The tree point (px, py) appears on screen at (px * scale + x, py * scale + y)
export type Camera = { x: number; y: number; scale: number };

export function clampScale(scale: number) {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// Changes the zoom while keeping whatever is under the screen point (focalX, focalY) in place
export function zoomAround(camera: Camera, focalX: number, focalY: number, nextScale: number): Camera {
  'worklet';
  const scale = clampScale(nextScale);
  const ratio = scale / camera.scale;
  return {
    x: focalX - (focalX - camera.x) * ratio,
    y: focalY - (focalY - camera.y) * ratio,
    scale,
  };
}

// The camera that puts the tree point (treeX, treeY) at the screen point (screenX, screenY)
export function cameraShowing(treeX: number, treeY: number, screenX: number, screenY: number, scale: number): Camera {
  'worklet';
  return { x: screenX - treeX * scale, y: screenY - treeY * scale, scale };
}

export function toTreePoint(camera: Camera, screenX: number, screenY: number) {
  return { x: (screenX - camera.x) / camera.scale, y: (screenY - camera.y) / camera.scale };
}
