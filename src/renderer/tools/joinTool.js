/**
 * Join Geometry Tool
 * Inverse of Explode: merges touching lines and arcs into unified closed/open polylines.
 */
import { Geo } from '../core.js';
import { state, pushState, addEntity, selectedIds, getCallbacks } from '../state.js';
import { showToast } from '../ui/toast.js';
import { render } from '../viewport.js';

export function joinSelection() {
  const isTargeted = (selectedIds.size > 0);
  const candidates = isTargeted
    ? state.ents.filter(e => selectedIds.has(e.id))
    : state.ents;

  if (isTargeted && candidates.length < 2) {
    return showToast('Select at least 2 touching lines or arcs to join into one part');
  }

  // Attempt join with standard 0.15mm tolerance, fallback to 0.35mm if needed
  let joins = Geo.joinEntities(candidates, 0.15);
  if (!joins.length) {
    joins = Geo.joinEntities(candidates, 0.35);
  }

  if (!joins.length) {
    return showToast('No connectable endpoints found within tolerance to join');
  }

  pushState();

  const removeIds = new Set();
  const newSelection = new Set();

  joins.forEach(j => {
    j.srcIds.forEach(id => removeIds.add(id));

    // Inherit layer from first source entity if available
    const firstSrc = candidates.find(c => c.id === j.srcIds[0]);
    if (firstSrc && firstSrc.layer) {
      j.ent.layer = firstSrc.layer;
    }

    const created = addEntity(j.ent);
    newSelection.add(created.id);
  });

  // Remove the exploded/individual source entities that were joined
  state.ents = state.ents.filter(e => !removeIds.has(e.id));

  // Automatically select the newly created joined part(s)
  selectedIds.clear();
  newSelection.forEach(id => selectedIds.add(id));

  const totalJoined = removeIds.size;
  const numParts = joins.length;
  showToast(`Joined ${totalJoined} lines/arcs into ${numParts} unified ${numParts === 1 ? 'part' : 'parts'} (Polyline)`);

  getCallbacks().updateUI();
  getCallbacks().render();
  render();
}
