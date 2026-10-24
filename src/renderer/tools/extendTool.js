/**
 * Extend Tool
 * Extends lines and arcs to bounding geometry intersections.
 */
import { Geo } from '../core.js';
import { state, pushState } from '../state.js';
import { pickEntity } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export function handleExtendPoint(p, sx, sy) {
  const clicked = pickEntity(sx, sy);
  if (clicked) {
    const allOtherSegs = [];
    state.ents.filter(e => e.id !== clicked.id).forEach(e => allOtherSegs.push(...Geo.segsOf(e)));
    const res = Geo.extendEntity(clicked, p, allOtherSegs);
    if (res) {
      pushState();
      Object.assign(clicked, res);
      showToast('Entity extended');
    } else {
      showToast('No boundary found to extend to');
    }
  }
}
