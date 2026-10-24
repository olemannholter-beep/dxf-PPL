/**
 * UI Orchestrator
 * Integrates ribbon navigation, panels, modal dialogs, and HUD controllers.
 */
import { state, options, pushState, selectedIds, setActivePoints, setTool, deleteSelected, undo, redo, mouseWorld } from '../state.js';
import { zoomFit, render } from '../viewport.js';
import { renderLayers, initLayerUI } from './layerPanel.js';
import { renderProperties } from './propertiesPanel.js';
import { syncSheetMetalUI, initSheetMetalUI } from './sheetMetalPanel.js';
import { initPartLibraryUI } from './partLibraryModal.js';
import { initKFactorModalUI, openKFactorModal } from './kFactorModal.js';
import { initManualInputHUD, showManualInputHUD, hideManualInputHUD } from './manualInputHud.js';
import { initSmartDimensionsUI, hideSmartDimHUD, hideSmartDimModeMenu } from '../tools/smartDimTool.js';
import {
  checkOpenEnds,
  cleanupGeometry,
  exportDXF,
  openDXF,
  registerCamUpdateUI
} from './camActions.js';
import { explodeSelection } from '../tools/explodeTool.js';
import { joinSelection } from '../tools/joinTool.js';

export * from './toast.js';
export * from './manualInputHud.js';
export * from './partLibraryModal.js';
export * from './kFactorModal.js';
export * from './sheetMetalPanel.js';
export * from './layerPanel.js';
export * from './propertiesPanel.js';
export * from './camActions.js';

export function updateUI() {
  renderLayers(updateUI);
  renderProperties(updateUI);
  syncSheetMetalUI();
}

export function hideAllHUDs() {
  hideManualInputHUD();
  hideSmartDimHUD();
  hideSmartDimModeMenu();
}

export function initUI() {
  registerCamUpdateUI(updateUI);

  // Ribbon Tab Switching
  document.querySelectorAll('.ribbon-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ribbon-group-container').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.style.display = 'flex';
    };
  });

  // Ribbon Tool Buttons
  document.querySelectorAll('.ribbon-btn[data-tool]').forEach(btn => {
    btn.onclick = () => setTool(btn.dataset.tool);
  });

  // Action Buttons
  const btnNew = document.getElementById('btn-new');
  if (btnNew) {
    btnNew.onclick = () => {
      if (confirm('Create new drawing?')) {
        pushState();
        state.ents = [];
        state.dimensions = [];
        selectedIds.clear();
        setActivePoints([]);
        options.openEnds = [];
        render();
        updateUI();
      }
    };
  }

  const btnOpen = document.getElementById('btn-open');
  if (btnOpen) btnOpen.onclick = openDXF;

  const btnSaveDxf = document.getElementById('btn-save-dxf');
  if (btnSaveDxf) btnSaveDxf.onclick = () => exportDXF();

  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.onclick = undo;

  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) btnRedo.onclick = redo;

  const btnZoomFit = document.getElementById('btn-zoom-fit');
  if (btnZoomFit) btnZoomFit.onclick = zoomFit;

  const btnJoin = document.getElementById('btn-join');
  if (btnJoin) btnJoin.onclick = () => { joinSelection(); updateUI(); };

  const btnJoinDraw = document.getElementById('btn-join-draw');
  if (btnJoinDraw) btnJoinDraw.onclick = () => { joinSelection(); updateUI(); };

  const btnExplode = document.getElementById('btn-explode');
  if (btnExplode) btnExplode.onclick = () => { explodeSelection(); updateUI(); };

  const btnExplodeMod = document.getElementById('btn-explode-mod');
  if (btnExplodeMod) btnExplodeMod.onclick = () => { explodeSelection(); updateUI(); };

  const btnCheckOpen = document.getElementById('btn-check-open');
  if (btnCheckOpen) btnCheckOpen.onclick = checkOpenEnds;

  const btnCleanup = document.getElementById('btn-cleanup');
  if (btnCleanup) btnCleanup.onclick = cleanupGeometry;

  const btnDelete = document.getElementById('btn-delete');
  if (btnDelete) btnDelete.onclick = deleteSelected;

  const btnManualInput = document.getElementById('btn-manual-input');
  if (btnManualInput) {
    btnManualInput.onclick = () => {
      showManualInputHUD('rect', mouseWorld);
    };
  }

  // Initialize modular UI components
  initLayerUI(updateUI);
  initSheetMetalUI(updateUI);
  initPartLibraryUI();
  initKFactorModalUI();
  initSmartDimensionsUI();
  initManualInputHUD();
}
