/**
 * Centralized Application State Management
 * Entities, layers, active selection, tools, and Undo/Redo stack.
 */
import { showToast } from './ui/toast.js';

export const state = {
  ents: [],
  dimensions: [], // Persistent SolidWorks-style Smart Dimensions on canvas
  layers: [
    { name: '0', aci: 7, visible: true },
    { name: 'PARTS', aci: 3, visible: true },
    { name: 'HOLES', aci: 4, visible: true },
    { name: 'BEND_UP', aci: 6, visible: true },
    { name: 'BEND_DOWN', aci: 2, visible: true }
  ],
  curLayer: '0',
  units: 'mm',
  nextId: 1,
  sheetMetal: {
    material: 'mild_steel',
    thickness: 2.0,
    kFactor: 0.44,
    autoKFactor: true,
    kMethod: 'air', // 'air' | 'din6935' | 'bottoming'
    defaultAngle: 90,
    defaultRadius: 2.0,
    defaultDir: 'UP',
    viewMode: 'formed' // 'formed' or 'flat'
  }
};

// Global reference for debug / automation hooks
if (typeof window !== 'undefined') {
  window.state = state;
}

export const history = {
  undoStack: [],
  redoStack: []
};

export const options = {
  osnap: true,
  gsnap: true, // Grid snap strictly 1x1mm
  grid: true,  // Grid display strictly 1x1mm
  ortho: false,
  openEnds: []
};

export const selectedIds = new Set();
if (typeof window !== 'undefined') {
  window.selectedIds = selectedIds;
}

export let activePoints = [];
export function setActivePoints(pts) {
  activePoints = (pts || []).map(p => ({ x: p.x, y: p.y }));
}

export let activeTool = 'select';
export function getActiveTool() {
  return activeTool;
}

export const mouseScreen = { x: 0, y: 0 };
export const mouseWorld = { x: 0, y: 0 };
export const snapState = { activeSnap: null };
export const dragActionState = { dragAction: null };
export const spaceState = { isSpacePressed: false };

// Callback registry for decoupled updates
let callbacks = {
  render: () => {},
  updateUI: () => {},
  updatePrompt: () => {},
  hideHUDs: () => {}
};

export function registerCallbacks(fns) {
  callbacks = { ...callbacks, ...fns };
}

export function getCallbacks() {
  return callbacks;
}

export function pushState() {
  history.undoStack.push(JSON.stringify(state));
  if (history.undoStack.length > 100) history.undoStack.shift();
  history.redoStack.length = 0;
}

export function undo() {
  if (!history.undoStack.length) return showToast('Nothing to undo');
  history.redoStack.push(JSON.stringify(state));
  const prev = JSON.parse(history.undoStack.pop());
  Object.assign(state, prev);
  if (!state.dimensions) state.dimensions = [];
  const remaining = new Set([...selectedIds].filter(id => state.ents.some(e => e.id === id)));
  selectedIds.clear();
  remaining.forEach(id => selectedIds.add(id));
  activePoints = [];
  callbacks.hideHUDs();
  callbacks.updatePrompt();
  callbacks.render();
  callbacks.updateUI();
}

export function redo() {
  if (!history.redoStack.length) return showToast('Nothing to redo');
  history.undoStack.push(JSON.stringify(state));
  const next = JSON.parse(history.redoStack.pop());
  Object.assign(state, next);
  if (!state.dimensions) state.dimensions = [];
  const remaining = new Set([...selectedIds].filter(id => state.ents.some(e => e.id === id)));
  selectedIds.clear();
  remaining.forEach(id => selectedIds.add(id));
  activePoints = [];
  callbacks.hideHUDs();
  callbacks.updatePrompt();
  callbacks.render();
  callbacks.updateUI();
}

export function addEntity(e) {
  e.id = state.nextId++;
  e.layer = e.layer || state.curLayer || '0';
  state.ents.push(e);
  return e;
}

export function setTool(toolName) {
  activeTool = toolName;
  activePoints = [];
  callbacks.hideHUDs();
  document.querySelectorAll('.ribbon-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });
  callbacks.updatePrompt();
  callbacks.render();
}

export function deleteSelected() {
  if (selectedIds.size > 0) {
    pushState();
    state.ents = state.ents.filter(e => !selectedIds.has(e.id));
    selectedIds.clear();
    showToast('Deleted selected entities');
    callbacks.hideHUDs();
    callbacks.updateUI();
    callbacks.render();
  }
}
