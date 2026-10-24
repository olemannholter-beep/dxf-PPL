/**
 * Explode Geometry Tool
 * Decomposes polylines, rectangles, and circles into individual lines and arcs.
 */
import { Geo } from '../core.js';
import { state, pushState, selectedIds, getCallbacks } from '../state.js';
import { showToast } from '../ui/toast.js';
import { render } from '../viewport.js';

export function explodeSelection() {
  const selected = state.ents.filter(e => selectedIds.has(e.id));
  if (!selected.length) {
    return showToast('Select a part, square, or polyline to explode');
  }

  const hasExplodable = selected.some(e => e.type === 'poly' || e.type === 'circle');
  if (!hasExplodable) {
    return showToast('Selected geometry is already individual lines/arcs');
  }

  pushState();

  let explodedCount = 0;
  const newSelection = new Set();
  const nextEnts = [];

  state.ents.forEach(e => {
    if (selectedIds.has(e.id)) {
      const parts = Geo.explodeEntity(e);
      if (parts && parts.length > 0) {
        explodedCount++;
        parts.forEach(p => {
          p.id = state.nextId++;
          p.layer = e.layer || state.curLayer || '0';
          nextEnts.push(p);
          newSelection.add(p.id);
        });
      } else {
        nextEnts.push(e);
        newSelection.add(e.id);
      }
    } else {
      nextEnts.push(e);
    }
  });

  state.ents = nextEnts;
  selectedIds.clear();
  newSelection.forEach(id => selectedIds.add(id));

  showToast(`Exploded into ${newSelection.size} individual lines and arcs`);

  getCallbacks().updateUI();
  getCallbacks().render();
  render();
}
