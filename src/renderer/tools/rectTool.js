/**
 * Rectangle & Square Tool
 * Creates 4-corner closed orthogonal polyline rectangle / square.
 * Actions:
 *  - Left click 1: Pick first corner
 *  - Left click 2: Complete rectangle by dragging opposite corner
 *  - Right click: Open manual numerical input popup
 */
import { pushState, addEntity, activePoints, setActivePoints } from '../state.js';
import { hideManualInputHUD } from '../ui/manualInputHud.js';
import { showToast } from '../ui/toast.js';

export function handleRectPoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const p0 = activePoints[0];
    const w = Math.abs(p.x - p0.x);
    const h = Math.abs(p.y - p0.y);
    if (w > 1e-4 && h > 1e-4) {
      pushState();
      addEntity({
        type: 'poly',
        closed: true,
        pts: [
          { x: p0.x, y: p0.y, b: 0 },
          { x: p.x, y: p0.y, b: 0 },
          { x: p.x, y: p.y, b: 0 },
          { x: p0.x, y: p.y, b: 0 }
        ]
      });
      setActivePoints([]);
      hideManualInputHUD();
      showToast(`Created ${w.toFixed(1)} x ${h.toFixed(1)} mm ${Math.abs(w - h) < 1e-3 ? 'Square' : 'Rectangle'}`);
    }
  }
}
