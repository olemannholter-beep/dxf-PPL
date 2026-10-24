/**
 * Line Tool
 * Interactively creates line segments and opens dimension input popup.
 */
import { Geo } from '../core.js';
import { pushState, addEntity, activePoints, setActivePoints } from '../state.js';
import { showManualInputHUD } from '../ui/manualInputHud.js';

export function handleLinePoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    if (Geo.dist(activePoints[0], p) > 1e-6) {
      pushState();
      addEntity({ type: 'line', x1: activePoints[0].x, y1: activePoints[0].y, x2: p.x, y2: p.y });
      setActivePoints([p]);
    }
  }
}
