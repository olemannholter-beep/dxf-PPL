/**
 * Trim Tool
 * Trims geometry segments to intersecting cutting edges.
 */
import { Geo } from '../core.js';
import { state, pushState, addEntity, selectedIds } from '../state.js';
import { pickEntity } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export function handleTrimPoint(p, sx, sy) {
  const clicked = pickEntity(sx, sy);
  if (clicked) {
    const allOtherSegs = [];
    state.ents.filter(e => e.id !== clicked.id).forEach(e => allOtherSegs.push(...Geo.segsOf(e)));
    const res = Geo.trimEntity(clicked, p, allOtherSegs);
    if (res && res.add) {
      pushState();
      state.ents = state.ents.filter(e => e.id !== clicked.id);
      selectedIds.delete(clicked.id);
      res.add.forEach(addEntity);
      showToast('Segment trimmed');
    } else {
      showToast('No intersection cutter found to trim');
    }
  }
}
