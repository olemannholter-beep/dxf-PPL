/**
 * IGEMS DXF Studio - Desktop Application Entry Point
 * Orchestrates modular CAD/CAM engine, snapping, UI controllers, and view transforms.
 */
'use strict';

import { SheetMetal, Geo } from './core.js';
import {
  state,
  options,
  selectedIds,
  activePoints,
  setActivePoints,
  activeTool,
  setTool,
  getActiveTool,
  mouseScreen,
  mouseWorld,
  snapState,
  dragActionState,
  spaceState,
  undo,
  redo,
  registerCallbacks,
  deleteSelected
} from './state.js';
import {
  initViewport,
  resizeCanvas,
  zoomFit,
  render,
  view,
  toWorld,
  pickEntity,
  pickDimension,
  getCanvas
} from './viewport.js';
import { resolvePoint } from './snap.js';
import {
  handlePointInput,
  handleRightClickInput,
  updatePrompt,
  finishPolyline,
  explodeSelection,
  joinSelection,
  applySmartDimension,
  resolveSmartDim,
  smartDimState,
  showSmartDimHUD,
  handleSmartDimRightClick,
  handleSmartDimLeftClick,
  showSmartDimModeMenu,
  hideSmartDimModeMenu,
  setSmartDimMode,
  deleteCurrentSmartDim
} from './tools/index.js';
import {
  initUI,
  updateUI,
  hideAllHUDs,
  exportDXF,
  openDXF,
  syncSheetMetalUI,
  initSheetMetalUI,
  recalcAllBends
} from './ui/index.js';

// Register callback handlers for decoupled state notifications
registerCallbacks({
  render,
  updateUI,
  updatePrompt,
  hideHUDs: hideAllHUDs
});

function initApp() {
  initViewport();
  initUI();

  const canvas = getCanvas();
  const coordDisplay = document.getElementById('coord-display');

  // Prevent default context menu on canvas
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Mouse Input Handling
  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    mouseScreen.x = e.clientX - rect.left;
    mouseScreen.y = e.clientY - rect.top;
    const res = resolvePoint(mouseScreen.x, mouseScreen.y);
    mouseWorld.x = res.p.x;
    mouseWorld.y = res.p.y;
    snapState.activeSnap = res.snap;

    // Middle-click or Space+Left-click: Pan
    if (e.button === 1 || (e.button === 0 && spaceState.isSpacePressed)) {
      dragActionState.dragAction = { type: 'pan', x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
      return;
    }

    // Check if user clicked (left or right) on an existing placed dimension on canvas
    const hitDim = pickDimension(mouseScreen.x, mouseScreen.y);
    if (hitDim && (e.button === 2 || (e.button === 0 && (activeTool === 'smart-dim' || activeTool === 'select')))) {
      e.preventDefault();
      hideSmartDimModeMenu();
      showSmartDimHUD(hitDim);
      render();
      return;
    }

    // Right-Click (Button 2):
    if (e.button === 2) {
      e.preventDefault();

      if (activeTool === 'smart-dim') {
        handleSmartDimRightClick({ x: mouseWorld.x, y: mouseWorld.y }, mouseScreen.x, mouseScreen.y, e.clientX, e.clientY);
        render();
        return;
      }

      hideSmartDimModeMenu();
      const handled = handleRightClickInput({ x: mouseWorld.x, y: mouseWorld.y });
      if (handled) {
        render();
        return;
      }
      if (activePoints.length > 0) {
        setActivePoints([]);
        hideAllHUDs();
        updatePrompt();
        render();
        return;
      }
    }

    if (e.button === 0) {
      if (activeTool === 'smart-dim') {
        handleSmartDimLeftClick({ x: mouseWorld.x, y: mouseWorld.y }, mouseScreen.x, mouseScreen.y, e.clientX, e.clientY);
        return;
      }
      if (activeTool === 'select') {
        const hit = pickEntity(mouseScreen.x, mouseScreen.y);
        if (hit) {
          if (e.shiftKey) {
            if (selectedIds.has(hit.id)) selectedIds.delete(hit.id); else selectedIds.add(hit.id);
          } else {
            selectedIds.clear();
            selectedIds.add(hit.id);
          }
          updateUI();
          render();
        } else {
          dragActionState.dragAction = { type: 'box', x0: mouseScreen.x, y0: mouseScreen.y, shift: e.shiftKey };
        }
      } else {
        handlePointInput({ x: mouseWorld.x, y: mouseWorld.y }, mouseScreen.x, mouseScreen.y);
        updatePrompt();
        updateUI();
        render();
      }
    }
  });

  window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseScreen.x = e.clientX - rect.left;
    mouseScreen.y = e.clientY - rect.top;
    const res = resolvePoint(mouseScreen.x, mouseScreen.y);
    mouseWorld.x = res.p.x;
    mouseWorld.y = res.p.y;
    snapState.activeSnap = res.snap;

    if (coordDisplay) {
      coordDisplay.textContent = `X: ${mouseWorld.x.toFixed(3)}  Y: ${mouseWorld.y.toFixed(3)}`;
    }

    if (activeTool === 'smart-dim') {
      const hit = pickEntity(mouseScreen.x, mouseScreen.y);
      smartDimState.hoverTarget = hit ? resolveSmartDim(hit, mouseWorld.x, mouseWorld.y) : null;
    }

    const drag = dragActionState.dragAction;
    if (drag && drag.type === 'pan') {
      view.panX = drag.panX + (e.clientX - drag.x);
      view.panY = drag.panY + (e.clientY - drag.y);
      render();
    } else {
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    const drag = dragActionState.dragAction;
    if (drag) {
      if (drag.type === 'box') {
        const [x0, y0] = toWorld(drag.x0, drag.y0);
        const [x1, y1] = toWorld(mouseScreen.x, mouseScreen.y);
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const isWindow = mouseScreen.x > drag.x0;

        if (!drag.shift) selectedIds.clear();
        const isFlatView = state.sheetMetal && state.sheetMetal.viewMode === 'flat' && state.ents.some(ent => ent.type === 'bend');
        const entsToSelect = isFlatView ? SheetMetal.unfoldContour(state.ents, state.sheetMetal) : state.ents;
        entsToSelect.forEach((ent, idx) => {
          const bb = Geo.bbox(ent);
          const inside = bb[0] >= minX && bb[2] <= maxX && bb[1] >= minY && bb[3] <= maxY;
          const touch = !(bb[2] < minX || bb[0] > maxX || bb[3] < minY || bb[1] > maxY);
          if (isWindow ? inside : touch) {
            const orig = isFlatView ? (ent.id != null ? state.ents.find(o => o.id === ent.id) : state.ents[idx]) : ent;
            if (orig && orig.id != null) selectedIds.add(orig.id);
          }
        });
        updateUI();
      }
      dragActionState.dragAction = null;
      render();
    }
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = toWorld(sx, sy);

    const zoomFactor = Math.exp(-e.deltaY * 0.0015);
    view.scale = Math.min(1000, Math.max(0.01, view.scale * zoomFactor));
    view.panX = sx - wx * view.scale;
    view.panY = sy + wy * view.scale;
    render();
  }, { passive: false });

  // Keyboard Shortcuts
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === ' ') spaceState.isSpacePressed = true;
    if (e.key === 'Escape') {
      setActivePoints([]);
      selectedIds.clear();
      smartDimState.point1 = null;
      smartDimState.angleLine1 = null;
      hideSmartDimModeMenu();
      hideAllHUDs();
      setTool('select');
      updateUI();
    }
    if (e.key === 'Enter') {
      if (activeTool === 'poly') {
        finishPolyline(false);
        updatePrompt();
        updateUI();
        render();
      }
    }
    if (e.key.toLowerCase() === 'c' && !ctrl && !e.shiftKey && !e.altKey) {
      if (activeTool === 'poly' && activePoints.length >= 2) {
        e.preventDefault();
        finishPolyline(true);
        updatePrompt();
        updateUI();
        render();
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    }
    if (e.key.toLowerCase() === 'b' && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setTool('bend');
    }
    if (e.key.toLowerCase() === 'd' && !ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setTool('smart-dim');
      smartDimState.mode = 'points';
      smartDimState.point1 = null;
      smartDimState.angleLine1 = null;
      showToast('Smart Dimension: Left-click point 1, then point 2. Right-click for mode menu.');
      updatePrompt();
    }
    if (e.key.toLowerCase() === 'x' && !ctrl) {
      e.preventDefault();
      explodeSelection();
      updateUI();
    }
    if (e.key.toLowerCase() === 'j' && !ctrl) {
      e.preventDefault();
      joinSelection();
      updateUI();
    }
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); exportDXF(false); }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openDXF(); }
    if (ctrl && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const btnNew = document.getElementById('btn-new');
      if (btnNew) btnNew.click();
    }
    if (e.key === 'Home') zoomFit();
    if (e.key === 'F3') {
      options.osnap = !options.osnap;
      const btn = document.getElementById('toggle-osnap');
      if (btn) btn.classList.toggle('active', options.osnap);
    }
    if (e.key === 'F4') {
      options.gsnap = !options.gsnap;
      const btn = document.getElementById('toggle-gsnap');
      if (btn) btn.classList.toggle('active', options.gsnap);
    }
    if (e.key === 'F7') {
      options.grid = !options.grid;
      const btn = document.getElementById('toggle-grid');
      if (btn) btn.classList.toggle('active', options.grid);
      render();
    }
    if (e.key === 'F8') {
      options.ortho = !options.ortho;
      const btn = document.getElementById('toggle-ortho');
      if (btn) btn.classList.toggle('active', options.ortho);
    }
  });

  window.addEventListener('keyup', e => {
    if (e.key === ' ') spaceState.isSpacePressed = false;
  });

  // Bottom Status Toggles
  const btnOsnap = document.getElementById('toggle-osnap');
  if (btnOsnap) {
    btnOsnap.onclick = e => {
      options.osnap = !options.osnap;
      e.target.classList.toggle('active', options.osnap);
    };
  }
  const btnGsnap = document.getElementById('toggle-gsnap');
  if (btnGsnap) {
    btnGsnap.onclick = e => {
      options.gsnap = !options.gsnap;
      e.target.classList.toggle('active', options.gsnap);
    };
  }
  const btnGrid = document.getElementById('toggle-grid');
  if (btnGrid) {
    btnGrid.onclick = e => {
      options.grid = !options.grid;
      e.target.classList.toggle('active', options.grid);
      render();
    };
  }
  const btnOrtho = document.getElementById('toggle-ortho');
  if (btnOrtho) {
    btnOrtho.onclick = e => {
      options.ortho = !options.ortho;
      e.target.classList.toggle('active', options.ortho);
    };
  }

  // Automation / debug / test hooks
  window.explodeSelection = explodeSelection;
  window.joinSelection = joinSelection;
  window.applySmartDimension = applySmartDimension;
  window.smartDimState = smartDimState;
  window.showSmartDimHUD = showSmartDimHUD;
  window.resolveSmartDim = resolveSmartDim;
  window.pickDimension = pickDimension;
  window.handleSmartDimRightClick = handleSmartDimRightClick;
  window.handleSmartDimLeftClick = handleSmartDimLeftClick;
  window.showSmartDimModeMenu = showSmartDimModeMenu;
  window.hideSmartDimModeMenu = hideSmartDimModeMenu;
  window.setSmartDimMode = setSmartDimMode;
  window.deleteCurrentSmartDim = deleteCurrentSmartDim;
  window.getActiveTool = getActiveTool;
  window.setTool = setTool;
  window.initSheetMetalUI = initSheetMetalUI;
  window.syncSheetMetalUI = syncSheetMetalUI;
  window.recalcAllBends = recalcAllBends;

  // Window Resize
  window.addEventListener('resize', resizeCanvas);

  // Initial draw and status sync
  updateUI();
  updatePrompt();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
