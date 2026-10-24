/**
 * Fillet Tool
 * Rounds corners on polylines and joined contours.
 */
import { Geo } from '../core.js';
import { pushState } from '../state.js';
import { pickEntity } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export function handleFilletPoint(p, sx, sy) {
  const clicked = pickEntity(sx, sy);
  if (clicked && clicked.type === 'poly') {
    const radEl = document.getElementById('cam-lead-rad');
    const rad = (radEl && parseFloat(radEl.value)) || 2.0;
    const res = Geo.roundCorners(clicked, rad, false);
    if (res && res.count > 0) {
      pushState();
      Object.assign(clicked, res.ent);
      showToast(`Filleted ${res.count} corners (R=${rad})`);
    }
  }
}
