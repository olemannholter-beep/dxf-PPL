/**
 * Circle Tool
 * Interactively creates center-radius circles and opens dimension input popup.
 */
import { Geo } from '../core.js';
import { pushState, addEntity, activePoints, setActivePoints } from '../state.js';
import { showManualInputHUD, hideManualInputHUD } from '../ui/manualInputHud.js';

export function handleCirclePoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const r = Geo.dist(activePoints[0], p);
    if (r > 1e-6) {
      pushState();
      addEntity({ type: 'circle', cx: activePoints[0].x, cy: activePoints[0].y, r });
      setActivePoints([]);
      hideManualInputHUD();
      showToast(`Created circle (R: ${r.toFixed(1)} mm, Ø: ${(r * 2).toFixed(1)} mm)`);
    }
  }
}
