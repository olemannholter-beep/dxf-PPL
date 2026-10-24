/**
 * Geometry Modification Tools
 * Move, Copy, Rotate, Scale, Mirror, Set-Start, and Reverse Direction.
 */
import { Geo } from '../core.js';
import { state, pushState, activePoints, setActivePoints, selectedIds, setTool, getCallbacks } from '../state.js';
import { pickEntity, render } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export function handleMoveCopyPoint(p, isCopy) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const dx = p.x - activePoints[0].x;
    const dy = p.y - activePoints[0].y;
    pushState();
    const selected = state.ents.filter(e => selectedIds.has(e.id));
    if (isCopy) {
      selected.forEach(e => {
        const clone = JSON.parse(JSON.stringify(e));
        clone.id = state.nextId++;
        Geo.moveEnt(clone, dx, dy);
        state.ents.push(clone);
      });
    } else {
      selected.forEach(e => Geo.moveEnt(e, dx, dy));
      setTool('select');
    }
    setActivePoints([]);
    getCallbacks().updateUI();
    render();
  }
}

export function handleRotatePoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const ang = Math.atan2(p.y - activePoints[0].y, p.x - activePoints[0].x);
    pushState();
    state.ents.filter(e => selectedIds.has(e.id)).forEach(e => Geo.rotEnt(e, activePoints[0], ang));
    setTool('select');
    setActivePoints([]);
    getCallbacks().updateUI();
    render();
  }
}

export function handleScalePoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const d = Geo.dist(activePoints[0], p);
    const factor = Math.max(0.01, d / 20);
    pushState();
    state.ents.filter(e => selectedIds.has(e.id)).forEach(e => Geo.scaleEnt(e, activePoints[0], factor));
    setTool('select');
    setActivePoints([]);
    getCallbacks().updateUI();
    render();
  }
}

export function handleMirrorPoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const p1 = activePoints[0];
    const p2 = p;
    if (Geo.dist(p1, p2) > 1e-6) {
      pushState();
      state.ents.filter(e => selectedIds.has(e.id)).forEach(e => Geo.mirrorEnt(e, p1, p2));
      setTool('select');
      setActivePoints([]);
      showToast('Entities mirrored');
      getCallbacks().updateUI();
      render();
    }
  }
}

export function reverseDirection() {
  const sel = state.ents.filter(e => selectedIds.has(e.id));
  if (!sel.length) return showToast('Select entity to reverse direction');
  pushState();
  sel.forEach(e => Object.assign(e, Geo.reverseEntity(e)));
  showToast('Entity direction reversed');
  getCallbacks().updateUI();
  render();
}
