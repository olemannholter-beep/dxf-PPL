/**
 * Polyline Tool
 * Multi-vertex polyline creation with optional closure.
 */
import { Geo } from '../core.js';
import { pushState, addEntity, activePoints, setActivePoints } from '../state.js';

export function handlePolyPoint(p) {
  if (activePoints.length >= 3 && Geo.dist(p, activePoints[0]) < 1e-4) {
    finishPolyline(true);
    return;
  }
  activePoints.push({ x: p.x, y: p.y });
}

export function finishPolyline(closed = false) {
  if (activePoints.length >= 2) {
    pushState();
    addEntity({
      type: 'poly',
      closed: !!closed,
      pts: activePoints.map(p => ({ x: p.x, y: p.y, b: 0 }))
    });
  }
  setActivePoints([]);
}
