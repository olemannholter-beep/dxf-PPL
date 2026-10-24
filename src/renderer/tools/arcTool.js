/**
 * 3-Point Arc Tool
 * Creates circular arcs from three points on the circumference.
 */
import { Geo } from '../core.js';
import { pushState, addEntity, activePoints, setActivePoints } from '../state.js';
import { showToast } from '../ui/toast.js';

export function createArc3(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a1 = Math.atan2(ay - uy, ax - ux);
  const am = Math.atan2(by - uy, bx - ux);
  const a3 = Math.atan2(cy - uy, cx - ux);
  return Geo.norm(am - a1) <= Geo.norm(a3 - a1)
    ? { type: 'arc', cx: ux, cy: uy, r, a1, a2: a3 }
    : { type: 'arc', cx: ux, cy: uy, r, a1: a3, a2: a1 };
}

export function handleArcPoint(p) {
  activePoints.push({ x: p.x, y: p.y });
  if (activePoints.length === 3) {
    const a = createArc3(activePoints[0], activePoints[1], activePoints[2]);
    if (a) {
      pushState();
      addEntity(a);
    } else {
      showToast('Points are collinear - could not create arc');
    }
    setActivePoints([]);
  }
}
