/**
 * OSNAP & 1x1mm Grid Snapping Engine
 * Provides precision endpoints, midpoints, centers, quadrants, and strictly 1x1mm grid snapping.
 */
import { Geo, SheetMetal } from './core.js';
import { state, options, activePoints } from './state.js';
import { toScreen, toWorld } from './viewport.js';

export function collectSnapPoints() {
  const pts = [];
  const isFlatView = state.sheetMetal && state.sheetMetal.viewMode === 'flat' && state.ents.some(e => e.type === 'bend');
  const entsToSnap = isFlatView ? SheetMetal.unfoldContour(state.ents, state.sheetMetal) : state.ents;

  entsToSnap.forEach(e => {
    switch (e.type) {
      case 'line':
      case 'bend':
        pts.push({ x: e.x1, y: e.y1, type: 'END' }, { x: e.x2, y: e.y2, type: 'END' });
        pts.push({ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, type: 'MID' });
        break;
      case 'circle':
        pts.push({ x: e.cx, y: e.cy, type: 'CEN' });
        pts.push({ x: e.cx + e.r, y: e.cy, type: 'QUA' }, { x: e.cx - e.r, y: e.cy, type: 'QUA' });
        pts.push({ x: e.cx, y: e.cy + e.r, type: 'QUA' }, { x: e.cx, y: e.cy - e.r, type: 'QUA' });
        break;
      case 'arc': {
        const am = e.a1 + Geo.norm(e.a2 - e.a1) / 2;
        pts.push({ x: e.cx, y: e.cy, type: 'CEN' });
        pts.push({ x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1), type: 'END' });
        pts.push({ x: e.cx + e.r * Math.cos(e.a2), y: e.cy + e.r * Math.sin(e.a2), type: 'END' });
        pts.push({ x: e.cx + e.r * Math.cos(am), y: e.cy + e.r * Math.sin(am), type: 'MID' });
        break;
      }
      case 'poly': {
        const n = e.pts.length, m = e.closed ? n : n - 1;
        e.pts.forEach(p => pts.push({ x: p.x, y: p.y, type: 'END' }));
        for (let i = 0; i < m; i++) {
          const p = e.pts[i], q = e.pts[(i + 1) % n];
          pts.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, type: 'MID' });
        }
        break;
      }
    }
  });

  return pts;
}

export function resolvePoint(sx, sy) {
  const w = toWorld(sx, sy);
  let p = { x: w[0], y: w[1] };
  let snapInfo = null;

  if (options.osnap) {
    let closest = null, minDist = 14;
    for (const cand of collectSnapPoints()) {
      const s = toScreen(cand.x, cand.y);
      const d = Math.hypot(s[0] - sx, s[1] - sy);
      if (d < minDist) {
        minDist = d;
        closest = cand;
      }
    }
    if (closest) {
      return { p: { x: closest.x, y: closest.y }, snap: closest.type };
    }
  }

  // Strictly 1x1mm grid snap
  if (options.gsnap) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }

  if (options.ortho && activePoints.length > 0) {
    const base = activePoints[activePoints.length - 1];
    if (Math.abs(p.x - base.x) >= Math.abs(p.y - base.y)) {
      p.y = base.y;
    } else {
      p.x = base.x;
    }
  }

  return { p, snap: snapInfo };
}
