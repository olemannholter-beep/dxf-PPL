/**
 * Offset Tool
 * Generates parallel offset contour on picked side using tool kerf.
 */
import { Geo } from '../core.js';
import { pushState, addEntity } from '../state.js';
import { pickEntity } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export function handleOffsetPoint(p, sx, sy) {
  const clicked = pickEntity(sx, sy);
  if (clicked) {
    const kerfEl = document.getElementById('cam-kerf');
    const kerf = ((kerfEl && parseFloat(kerfEl.value)) || 0.75) / 2;
    const off = Geo.offsetEntity(clicked, kerf, p);
    if (off) {
      pushState();
      addEntity(off);
      showToast(`Offset created (${kerf.toFixed(3)} mm)`);
    }
  }
}
