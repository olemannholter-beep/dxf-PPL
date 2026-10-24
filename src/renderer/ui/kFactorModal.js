/**
 * Automatic K-Factor Calculator & Test Bend Calibration Controller
 * Interactive modal dialog for:
 * 1. Automatic R/T neutral axis formula (Air Bending / DIN 6935)
 * 2. Reverse engineering K-factor from physical test bend coupons
 * 3. Standard Press Brake V-Die and tooling recommendations
 */
import { SheetMetal } from '../core.js';
import { state, pushState, getCallbacks } from '../state.js';
import { render } from '../viewport.js';
import { showToast } from './toast.js';
import { syncSheetMetalUI, recalcAllBends } from './sheetMetalPanel.js';

let modal, btnClose, btnCancel, btnApply;
let activeTab = 'auto'; // 'auto' | 'test' | 'tooling'

export function initKFactorModalUI() {
  modal = document.getElementById('modal-kfactor-calc');
  btnClose = document.getElementById('btn-close-kcalc-modal');
  btnCancel = document.getElementById('btn-cancel-kcalc');
  btnApply = document.getElementById('btn-apply-kcalc');

  if (!modal) return;

  if (btnClose) btnClose.onclick = closeKFactorModal;
  if (btnCancel) btnCancel.onclick = closeKFactorModal;

  // Tab switching inside modal
  document.querySelectorAll('.kcalc-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.kcalc-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.kcalc-panel').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.style.display = 'flex';
      activeTab = targetId.replace('kcalc-tab-', '');
      updateKCalcResults();
    };
  });

  // Tab 1 Inputs
  const autoInputs = ['kcalc-mat', 'kcalc-t', 'kcalc-r', 'kcalc-method', 'kcalc-ang'];
  autoInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = updateKCalcResults;
      el.onchange = updateKCalcResults;
    }
  });

  // Tab 2 Inputs (Test Bend)
  const testInputs = ['kcalc-test-flat', 'kcalc-test-f1', 'kcalc-test-f2', 'kcalc-test-ang', 'kcalc-test-r', 'kcalc-test-t'];
  testInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = () => { el.dataset.userEdited = 'true'; updateKCalcResults(); };
      el.onchange = () => { el.dataset.userEdited = 'true'; updateKCalcResults(); };
    }
  });

  // Tab 3 Inputs (Tooling)
  const toolInputs = ['kcalc-tool-t', 'kcalc-tool-mat'];
  toolInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = updateKCalcResults;
      el.onchange = updateKCalcResults;
    }
  });

  // Apply Button
  if (btnApply) {
    btnApply.onclick = applyKFactorFromModal;
  }

  // Keyboard shortcut (Escape to close)
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      closeKFactorModal();
    }
  });

  // Backdrop click to close
  modal.addEventListener('click', e => {
    if (e.target === modal) closeKFactorModal();
  });
}

export function openKFactorModal(initialTab = 'auto') {
  if (!modal) initKFactorModalUI();
  if (!modal || !SheetMetal) return;

  const sm = state.sheetMetal;

  // Sync current drawing values into inputs
  const matEl = document.getElementById('kcalc-mat');
  if (matEl) matEl.value = sm.material || 'mild_steel';
  const tEl = document.getElementById('kcalc-t');
  if (tEl) tEl.value = sm.thickness || 2.0;
  const rEl = document.getElementById('kcalc-r');
  if (rEl) rEl.value = sm.defaultRadius != null ? sm.defaultRadius : 2.0;
  const methodEl = document.getElementById('kcalc-method');
  if (methodEl) methodEl.value = sm.kMethod || 'air';

  // Tooling tab defaults
  const toolT = document.getElementById('kcalc-tool-t');
  if (toolT) toolT.value = sm.thickness || 2.0;
  const toolMat = document.getElementById('kcalc-tool-mat');
  if (toolMat) toolMat.value = sm.material || 'mild_steel';

  // Test bend defaults
  const curT = sm.thickness || 2.0;
  const curR = sm.defaultRadius != null ? sm.defaultRadius : 2.0;
  const testT = document.getElementById('kcalc-test-t');
  if (testT) testT.value = curT;
  const testR = document.getElementById('kcalc-test-r');
  if (testR) testR.value = curR;
  const testFlat = document.getElementById('kcalc-test-flat');
  if (testFlat && (!testFlat.value || testFlat.dataset.userEdited !== 'true')) {
    const sampleBend = SheetMetal.computeBend({ angle: 90, thickness: curT, radius: curR, kFactor: sm.kFactor });
    testFlat.value = +(100 - sampleBend.BD).toFixed(3);
  }

  // Switch to selected tab
  const tabBtn = document.querySelector(`.kcalc-tab[data-tab="kcalc-tab-${initialTab}"]`);
  if (tabBtn) tabBtn.click();

  updateKCalcResults();
  modal.style.display = 'flex';
}

export function closeKFactorModal() {
  if (modal) modal.style.display = 'none';
}

export function updateKCalcResults() {
  if (!SheetMetal) return;

  if (activeTab === 'auto') {
    const mat = document.getElementById('kcalc-mat')?.value || 'mild_steel';
    const t = parseFloat(document.getElementById('kcalc-t')?.value) || 2.0;
    const r = parseFloat(document.getElementById('kcalc-r')?.value);
    const rad = !isNaN(r) ? Math.max(0, r) : 2.0;
    const method = document.getElementById('kcalc-method')?.value || 'air';
    const ang = parseFloat(document.getElementById('kcalc-ang')?.value) || 90;

    const res = SheetMetal.calculateKFactor({
      radius: rad,
      thickness: t,
      material: mat,
      method
    });

    const bend = SheetMetal.computeBend({
      angle: ang,
      thickness: t,
      radius: rad,
      kFactor: res.kFactor
    });

    const elK = document.getElementById('kcalc-out-k');
    const elRT = document.getElementById('kcalc-out-rt');
    const elT = document.getElementById('kcalc-out-t');
    const elBD = document.getElementById('kcalc-out-bd');
    const elBA = document.getElementById('kcalc-out-ba');
    const elOSSB = document.getElementById('kcalc-out-ossb');
    const elNote = document.getElementById('kcalc-out-note');

    if (elK) elK.textContent = res.kFactor.toFixed(3);
    if (elRT) elRT.textContent = res.ratio.toFixed(2);
    if (elT) elT.textContent = `${(res.kFactor * t).toFixed(3)} mm`;
    if (elBD) elBD.textContent = `${bend.BD_formatted} mm`;
    if (elBA) elBA.textContent = `${bend.BA_formatted} mm`;
    if (elOSSB) elOSSB.textContent = `${bend.OSSB_formatted} mm`;

    if (elNote) {
      const pct = Math.round(res.kFactor * 100);
      let desc = `Neutral axis is at ${pct}% of thickness (${(res.kFactor * t).toFixed(3)} mm from inside face).`;
      if (res.ratio < 0.65) {
        desc += ' Sharp bend: inner fibers undergo high compression, pulling neutral line inward.';
      } else if (res.ratio > 3.0) {
        desc += ' Wide bend: neutral line approaches sheet center (K ≈ 0.50).';
      }
      elNote.textContent = desc;
    }
  } else if (activeTab === 'test') {
    const flatL = parseFloat(document.getElementById('kcalc-test-flat')?.value) || 0;
    const f1 = parseFloat(document.getElementById('kcalc-test-f1')?.value) || 0;
    const f2 = parseFloat(document.getElementById('kcalc-test-f2')?.value) || 0;
    const ang = parseFloat(document.getElementById('kcalc-test-ang')?.value) || 90;
    const r = parseFloat(document.getElementById('kcalc-test-r')?.value) || 2.0;
    const t = parseFloat(document.getElementById('kcalc-test-t')?.value) || 2.0;

    const res = SheetMetal.reverseCalculateKFactor({
      flatLength: flatL,
      flange1: f1,
      flange2: f2,
      angle: ang,
      radius: r,
      thickness: t
    });

    const elK = document.getElementById('kcalc-test-out-k');
    const elBD = document.getElementById('kcalc-test-out-bd');
    const elBA = document.getElementById('kcalc-test-out-ba');
    const elStatus = document.getElementById('kcalc-test-status');

    if (elK) elK.textContent = res.kFactor.toFixed(3);
    if (elBD) elBD.textContent = `${res.BD.toFixed(3)} mm`;
    if (elBA) elBA.textContent = `${res.BA.toFixed(3)} mm`;

    if (elStatus) {
      if (!flatL || !f1 || !f2) {
        elStatus.textContent = 'Enter test coupon dimensions to calculate calibrated K-Factor.';
        elStatus.style.color = 'var(--text-dim)';
      } else if (res.isValid) {
        elStatus.textContent = `✓ High precision calibration: K=${res.kFactor.toFixed(3)} (BD=${res.BD.toFixed(3)} mm)`;
        elStatus.style.color = '#3fb950';
      } else {
        elStatus.textContent = `⚠️ K=${res.kFactor.toFixed(3)} is outside standard air bending range [0.20 - 0.50]. Check flange measurements.`;
        elStatus.style.color = '#ffa726';
      }
    }
  } else if (activeTab === 'tooling') {
    const t = parseFloat(document.getElementById('kcalc-tool-t')?.value) || 2.0;
    const mat = document.getElementById('kcalc-tool-mat')?.value || 'mild_steel';

    const tool = SheetMetal.recommendVDie(t, mat);

    const elV = document.getElementById('kcalc-tool-out-v');
    const elR = document.getElementById('kcalc-tool-out-r');
    const elMinF = document.getElementById('kcalc-tool-out-minf');
    const elK = document.getElementById('kcalc-tool-out-k');

    if (elV) elV.textContent = `V = ${tool.vDie} mm`;
    if (elR) elR.textContent = `R = ${tool.naturalRadius} mm`;
    if (elMinF) elMinF.textContent = `b_min = ${tool.minFlange} mm`;
    if (elK) elK.textContent = `K = ${tool.recommendedK.toFixed(3)}`;
  }
}

export function applyKFactorFromModal() {
  if (!SheetMetal) return;
  pushState();

  const sm = state.sheetMetal;

  if (activeTab === 'auto') {
    const mat = document.getElementById('kcalc-mat')?.value || sm.material;
    const t = parseFloat(document.getElementById('kcalc-t')?.value) || sm.thickness;
    const r = parseFloat(document.getElementById('kcalc-r')?.value);
    const rad = !isNaN(r) ? Math.max(0, r) : sm.defaultRadius;
    const method = document.getElementById('kcalc-method')?.value || 'air';

    const res = SheetMetal.calculateKFactor({
      radius: rad,
      thickness: t,
      material: mat,
      method
    });

    sm.material = mat;
    sm.thickness = t;
    sm.defaultRadius = rad;
    sm.kFactor = res.kFactor;
    sm.kMethod = method;
    sm.autoKFactor = true;

    showToast(`Applied Auto K-Factor: K=${res.kFactor.toFixed(3)} (R/T=${res.ratio.toFixed(2)}, ${method})`);
  } else if (activeTab === 'test') {
    const flatL = parseFloat(document.getElementById('kcalc-test-flat')?.value) || 0;
    const f1 = parseFloat(document.getElementById('kcalc-test-f1')?.value) || 0;
    const f2 = parseFloat(document.getElementById('kcalc-test-f2')?.value) || 0;
    const ang = parseFloat(document.getElementById('kcalc-test-ang')?.value) || 90;
    const r = parseFloat(document.getElementById('kcalc-test-r')?.value) || sm.defaultRadius;
    const t = parseFloat(document.getElementById('kcalc-test-t')?.value) || sm.thickness;

    const res = SheetMetal.reverseCalculateKFactor({
      flatLength: flatL,
      flange1: f1,
      flange2: f2,
      angle: ang,
      radius: r,
      thickness: t
    });

    sm.thickness = t;
    sm.defaultRadius = r;
    sm.kFactor = res.kFactor;
    sm.material = 'custom';
    sm.autoKFactor = false; // Calibrated fixed test factor

    showToast(`Applied Calibrated K-Factor from Test Bend: K=${res.kFactor.toFixed(3)} (BD=${res.BD.toFixed(3)} mm)`);
  } else if (activeTab === 'tooling') {
    const t = parseFloat(document.getElementById('kcalc-tool-t')?.value) || sm.thickness;
    const mat = document.getElementById('kcalc-tool-mat')?.value || sm.material;

    const tool = SheetMetal.recommendVDie(t, mat);

    sm.thickness = t;
    sm.material = mat;
    sm.defaultRadius = tool.naturalRadius;
    sm.kFactor = tool.recommendedK;
    sm.autoKFactor = true;

    showToast(`Applied Tooling Parameters: V=${tool.vDie}mm, R=${tool.naturalRadius}mm, Auto K=${tool.recommendedK.toFixed(3)}`);
  }

  recalcAllBends();
  syncSheetMetalUI();
  const cb = getCallbacks();
  if (cb && cb.updateUI) cb.updateUI();
  render();

  closeKFactorModal();
}
