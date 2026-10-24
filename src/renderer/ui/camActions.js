/**
 * CAD DXF Import/Export & Geometry Verification Operations
 * AutoCAD R12 DXF import/export, flat blank unfolding, geometry cleanup, and open ends verification.
 */
import { Geo, Dxf, SheetMetal } from '../core.js';
import { state, pushState, addEntity, selectedIds, options } from '../state.js';
import { zoomFit, render } from '../viewport.js';
import { showToast } from './toast.js';

let updateUIFn = () => {};
export function registerCamUpdateUI(fn) {
  updateUIFn = fn;
}
export const registerDxfUpdateUI = registerCamUpdateUI;

export function checkOpenEnds() {
  const ends = Geo.openEnds(state.ents, 0.05);
  options.openEnds = ends;
  if (ends.length > 0) {
    showToast(`Found ${ends.length} open unclosed contour endpoints (shown in red)`);
  } else {
    showToast('All contours are completely closed!');
  }
  render();
}

export function cleanupGeometry() {
  pushState();
  const res = Geo.cleanup(state.ents, 0.01);
  state.ents = res.keep;
  showToast(`Cleanup complete: removed ${res.removed.length} duplicate/zero-length entities`);
  updateUIFn();
  render();
}

export async function exportDXF() {
  if (!state.ents.length) return showToast('Nothing to export');

  let dxfEnts = [...state.ents];
  const hasBends = state.ents.some(e => e.type === 'bend');

  if (hasBends) {
    // Unfold contour to compensate flat blank dimensions for press brake / folding
    dxfEnts = SheetMetal.unfoldContour(state.ents, state.sheetMetal);
  }

  const dxfContent = Dxf.toDXF(dxfEnts, state.layers, state.units);
  const defaultFileName = hasBends ? 'sheetmetal_blank.dxf' : 'drawing.dxf';

  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.saveFileDialog) {
    const filePath = await window.electronAPI.saveFileDialog(defaultFileName);
    if (filePath) {
      const res = await window.electronAPI.saveFileContent(filePath, dxfContent);
      if (res.success) {
        showToast(hasBends ? `Saved Compensated DXF with Bends: ${filePath}` : `Saved DXF: ${filePath}`);
      } else {
        showToast(`Error saving DXF: ${res.error}`);
      }
    }
  } else {
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultFileName;
    a.click();
    showToast(hasBends ? 'Compensated DXF with Bends downloaded' : 'DXF downloaded');
  }
}

export async function openDXF() {
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.openFileDialog) {
    const result = await window.electronAPI.openFileDialog();
    if (result && result.content) {
      loadDxfText(result.content, result.fileName);
    }
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dxf';
    input.onchange = e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => loadDxfText(ev.target.result, file.name);
        reader.readAsText(file);
      }
    };
    input.click();
  }
}

export function loadDxfText(text, name = 'drawing.dxf') {
  const parsed = Dxf.parseDXF(text);
  if (!parsed.ents.length) return showToast('No supported entities found in DXF');

  pushState();
  state.ents = [];
  state.nextId = 1;
  selectedIds.clear();
  options.openEnds = [];

  Object.entries(parsed.layers).forEach(([layName, aci]) => {
    if (!state.layers.some(l => l.name === layName)) {
      state.layers.push({ name: layName, aci: aci || 7, visible: true });
    }
  });

  parsed.ents.forEach(addEntity);
  const bendWithParams = parsed.ents.find(e => e.type === 'bend' && (e.thickness != null || e.kFactor != null));
  if (bendWithParams && state.sheetMetal) {
    if (bendWithParams.thickness != null) state.sheetMetal.thickness = bendWithParams.thickness;
    if (bendWithParams.kFactor != null) state.sheetMetal.kFactor = bendWithParams.kFactor;
    if (SheetMetal && SheetMetal.MATERIALS) {
      const match = Object.values(SheetMetal.MATERIALS).find(m => Math.abs(m.kFactor - state.sheetMetal.kFactor) < 0.005);
      state.sheetMetal.material = match ? match.id : 'custom';
    }
  }

  zoomFit();
  updateUIFn();
  showToast(`Imported ${parsed.ents.length} objects from ${name}`);
}
