/**
 * Sheet Metal Panel & HUD Controller
 * Material presets, thickness, K-Factor, bend calculations (BA, OSSB, BD),
 * 2-flange L-Bracket generator, and Formed vs Flat Blank view mode.
 */
import { Geo, SheetMetal } from '../core.js';
import { state, pushState, addEntity, selectedIds, setTool } from '../state.js';
import { zoomFit, toWorld, width, height, render } from '../viewport.js';
import { showToast } from './toast.js';
import { exportDXF } from './camActions.js';
import { openKFactorModal } from './kFactorModal.js';

export function syncSheetMetalUI() {
  if (!state.sheetMetal || !SheetMetal) return;
  const sm = state.sheetMetal;

  const selBend = state.ents.find(e => selectedIds.has(e.id) && e.type === 'bend');
  const activeAng = selBend ? selBend.angle : sm.defaultAngle;
  const activeRad = selBend ? (selBend.radius != null ? selBend.radius : 2.0) : (sm.defaultRadius != null ? sm.defaultRadius : 2.0);
  const activeDir = selBend ? (selBend.direction || 'UP') : (sm.defaultDir || 'UP');

  // Automatic K-Factor calculation if autoKFactor is enabled
  if (sm.autoKFactor && SheetMetal.calculateKFactor) {
    const autoRes = SheetMetal.calculateKFactor({
      radius: activeRad,
      thickness: sm.thickness,
      material: sm.material,
      method: sm.kMethod || 'air'
    });
    sm.kFactor = autoRes.kFactor;
  }

  const smMat = document.getElementById('sm-mat-select');
  if (smMat && smMat.value !== sm.material) smMat.value = sm.material;
  const smSideMat = document.getElementById('sm-side-mat');
  if (smSideMat && smSideMat.value !== sm.material) smSideMat.value = sm.material;

  const smThick = document.getElementById('sm-thickness');
  if (smThick && document.activeElement !== smThick) smThick.value = sm.thickness;
  const smSideT = document.getElementById('sm-side-t');
  if (smSideT && document.activeElement !== smSideT) smSideT.value = sm.thickness;

  const smK = document.getElementById('sm-kfactor');
  if (smK && document.activeElement !== smK) smK.value = sm.kFactor;
  const smSideK = document.getElementById('sm-side-k');
  if (smSideK && document.activeElement !== smSideK) smSideK.value = sm.kFactor;

  // Auto K Checkboxes
  const chkAutoK = document.getElementById('sm-auto-k');
  if (chkAutoK) chkAutoK.checked = !!sm.autoKFactor;
  const chkSideAutoK = document.getElementById('sm-side-auto-k');
  if (chkSideAutoK) chkSideAutoK.checked = !!sm.autoKFactor;

  const elSideRatio = document.getElementById('sm-side-k-ratio');
  if (elSideRatio) {
    const rt = (activeRad / (sm.thickness || 1)).toFixed(2);
    elSideRatio.textContent = sm.autoKFactor
      ? `R/T: ${rt} (Auto K=${sm.kFactor.toFixed(3)})`
      : `Manual K-Factor (${sm.material})`;
  }

  const smAng = document.getElementById('sm-bend-angle');
  if (smAng && document.activeElement !== smAng) smAng.value = activeAng;
  const smSideAng = document.getElementById('sm-side-ang');
  if (smSideAng && document.activeElement !== smSideAng) smSideAng.value = activeAng;

  const smRad = document.getElementById('sm-bend-radius');
  if (smRad && document.activeElement !== smRad) smRad.value = activeRad;
  const smSideRad = document.getElementById('sm-side-rad');
  if (smSideRad && document.activeElement !== smSideRad) smSideRad.value = activeRad;

  const smDir = document.getElementById('sm-bend-dir');
  if (smDir && smDir.value !== activeDir) smDir.value = activeDir;

  const hudAngle = activeAng;
  const hudRad = activeRad;

  const calc = SheetMetal.computeBend({
    angle: hudAngle,
    thickness: sm.thickness,
    radius: hudRad,
    kFactor: sm.kFactor
  });

  const elBA = document.getElementById('sm-hud-ba');
  const elOSSB = document.getElementById('sm-hud-ossb');
  const elBD = document.getElementById('sm-hud-bd');
  const elDelta = document.getElementById('sm-hud-delta');
  if (elBA) elBA.textContent = `${calc.BA_formatted} mm`;
  if (elOSSB) elOSSB.textContent = `${calc.OSSB_formatted} mm`;
  if (elBD) elBD.textContent = `${calc.BD_formatted} mm`;
  if (elDelta) elDelta.textContent = `-${calc.BD_formatted} mm`;

  const badge = document.getElementById('sm-badge-status');
  if (badge) {
    const matObj = SheetMetal.MATERIALS[sm.material] || { name: 'Custom' };
    const autoBadge = sm.autoKFactor ? ' Auto' : '';
    badge.textContent = `${matObj.name} ${sm.thickness}mm (K=${sm.kFactor}${autoBadge})`;
  }

  const lblView = document.getElementById('lbl-sm-view-mode');
  if (lblView) {
    lblView.textContent = sm.viewMode === 'flat' ? 'Flat Blank' : 'Formed View';
  }
}

export function recalcAllBends() {
  if (!SheetMetal) return;
  const sm = state.sheetMetal;
  state.ents.filter(e => e.type === 'bend').forEach(b => {
    let k = sm.kFactor;
    if (sm.autoKFactor && SheetMetal.calculateKFactor) {
      const bRad = b.radius != null ? b.radius : (sm.defaultRadius != null ? sm.defaultRadius : 2.0);
      const autoRes = SheetMetal.calculateKFactor({
        radius: bRad,
        thickness: sm.thickness,
        material: sm.material,
        method: sm.kMethod || 'air'
      });
      k = autoRes.kFactor;
      b.kFactor = k;
    }
    const c = SheetMetal.computeBend({
      angle: b.angle != null ? b.angle : 90,
      thickness: sm.thickness,
      radius: b.radius != null ? b.radius : 2.0,
      kFactor: k
    });
    b.ba = c.BA_formatted;
    b.bd = c.BD_formatted;
    b.ossb = c.OSSB_formatted;
  });
}

export function initSheetMetalUI(updateUIFn) {
  const smMat = document.getElementById('sm-mat-select');
  const smSideMat = document.getElementById('sm-side-mat');
  const smThick = document.getElementById('sm-thickness');
  const smSideT = document.getElementById('sm-side-t');
  const smK = document.getElementById('sm-kfactor');
  const smSideK = document.getElementById('sm-side-k');
  const chkAutoK = document.getElementById('sm-auto-k');
  const chkSideAutoK = document.getElementById('sm-side-auto-k');
  const btnOpenKCalc = document.getElementById('btn-open-kcalc');
  const btnSideKCalc = document.getElementById('btn-side-kcalc');
  const smAng = document.getElementById('sm-bend-angle');
  const smSideAng = document.getElementById('sm-side-ang');
  const smRad = document.getElementById('sm-bend-radius');
  const smSideRad = document.getElementById('sm-side-rad');
  const smDir = document.getElementById('sm-bend-dir');
  const btnToggleView = document.getElementById('btn-toggle-sm-view');
  const btnQuickBracket = document.getElementById('btn-quick-bracket');
  const btnExportFlat = document.getElementById('btn-export-flat-dxf');
  const btnBendTool = document.getElementById('btn-bend-tool');
  const btnDrawBend = document.getElementById('btn-draw-bend');

  function onAutoKToggle(checked) {
    pushState();
    state.sheetMetal.autoKFactor = checked;
    if (checked && SheetMetal.calculateKFactor) {
      const autoRes = SheetMetal.calculateKFactor({
        radius: state.sheetMetal.defaultRadius,
        thickness: state.sheetMetal.thickness,
        material: state.sheetMetal.material,
        method: state.sheetMetal.kMethod || 'air'
      });
      state.sheetMetal.kFactor = autoRes.kFactor;
      showToast(`Auto K-Factor enabled: K=${autoRes.kFactor.toFixed(3)} (R/T=${autoRes.ratio.toFixed(2)})`);
    } else {
      showToast(`Manual K-Factor mode (K=${state.sheetMetal.kFactor})`);
    }
    recalcAllBends();
    if (updateUIFn) updateUIFn();
    render();
  }

  if (chkAutoK) chkAutoK.onchange = e => onAutoKToggle(e.target.checked);
  if (chkSideAutoK) chkSideAutoK.onchange = e => onAutoKToggle(e.target.checked);

  if (btnOpenKCalc) btnOpenKCalc.onclick = () => openKFactorModal('auto');
  if (btnSideKCalc) btnSideKCalc.onclick = () => openKFactorModal('auto');

  function onMatChange(val) {
    pushState();
    state.sheetMetal.material = val;
    const preset = SheetMetal.MATERIALS[val];
    if (preset) {
      if (preset.defaultThickness) state.sheetMetal.thickness = preset.defaultThickness;
      if (preset.defaultRadius) state.sheetMetal.defaultRadius = preset.defaultRadius;

      if (state.sheetMetal.autoKFactor && SheetMetal.calculateKFactor) {
        const autoRes = SheetMetal.calculateKFactor({
          radius: state.sheetMetal.defaultRadius,
          thickness: state.sheetMetal.thickness,
          material: val,
          method: state.sheetMetal.kMethod || 'air'
        });
        state.sheetMetal.kFactor = autoRes.kFactor;
      } else {
        state.sheetMetal.kFactor = preset.kFactor;
      }

      const selBends = state.ents.filter(e => selectedIds.has(e.id) && e.type === 'bend');
      selBends.forEach(selBend => {
        if (preset.defaultRadius != null) selBend.radius = preset.defaultRadius;
      });
    }
    recalcAllBends();
    if (updateUIFn) updateUIFn();
    render();
  }

  if (smMat) smMat.onchange = e => onMatChange(e.target.value);
  if (smSideMat) smSideMat.onchange = e => onMatChange(e.target.value);

  function onThickChange(val) {
    pushState();
    const t = Math.max(0.1, parseFloat(val) || 2.0);
    state.sheetMetal.thickness = t;

    if (state.sheetMetal.autoKFactor && SheetMetal.calculateKFactor) {
      const autoRes = SheetMetal.calculateKFactor({
        radius: state.sheetMetal.defaultRadius,
        thickness: t,
        material: state.sheetMetal.material,
        method: state.sheetMetal.kMethod || 'air'
      });
      state.sheetMetal.kFactor = autoRes.kFactor;
    }

    recalcAllBends();
    if (updateUIFn) updateUIFn();
    render();
  }
  if (smThick) {
    smThick.onchange = e => onThickChange(e.target.value);
    smThick.oninput = e => onThickChange(e.target.value);
  }
  if (smSideT) {
    smSideT.onchange = e => onThickChange(e.target.value);
    smSideT.oninput = e => onThickChange(e.target.value);
  }

  function onKChange(val) {
    pushState();
    state.sheetMetal.kFactor = Math.max(0.20, Math.min(0.50, parseFloat(val) || 0.44));
    state.sheetMetal.autoKFactor = false; // Manual override disables auto mode
    state.sheetMetal.material = 'custom';
    recalcAllBends();
    if (updateUIFn) updateUIFn();
    render();
  }
  if (smK) {
    smK.onchange = e => onKChange(e.target.value);
    smK.oninput = e => onKChange(e.target.value);
  }
  if (smSideK) {
    smSideK.onchange = e => onKChange(e.target.value);
    smSideK.oninput = e => onKChange(e.target.value);
  }

  function onAngChange(val) {
    const parsed = parseFloat(val);
    const a = !isNaN(parsed) ? Math.max(1, Math.min(179, parsed)) : 90;
    state.sheetMetal.defaultAngle = a;
    const selBends = state.ents.filter(e => selectedIds.has(e.id) && e.type === 'bend');
    if (selBends.length > 0) {
      pushState();
      selBends.forEach(selBend => {
        selBend.angle = a;
        const c = SheetMetal.computeBend({
          angle: a,
          thickness: state.sheetMetal.thickness,
          radius: selBend.radius != null ? selBend.radius : 2.0,
          kFactor: state.sheetMetal.kFactor
        });
        selBend.ba = c.BA_formatted;
        selBend.bd = c.BD_formatted;
        selBend.ossb = c.OSSB_formatted;
      });
      render();
    }
    if (updateUIFn) updateUIFn();
  }
  if (smAng) {
    smAng.onchange = e => onAngChange(e.target.value);
    smAng.oninput = e => onAngChange(e.target.value);
  }
  if (smSideAng) {
    smSideAng.onchange = e => onAngChange(e.target.value);
    smSideAng.oninput = e => onAngChange(e.target.value);
  }

  function onRadChange(val) {
    const parsed = parseFloat(val);
    const r = Math.max(0, !isNaN(parsed) ? parsed : 2.0);
    state.sheetMetal.defaultRadius = r;

    if (state.sheetMetal.autoKFactor && SheetMetal.calculateKFactor) {
      const autoRes = SheetMetal.calculateKFactor({
        radius: r,
        thickness: state.sheetMetal.thickness,
        material: state.sheetMetal.material,
        method: state.sheetMetal.kMethod || 'air'
      });
      state.sheetMetal.kFactor = autoRes.kFactor;
    }

    const selBends = state.ents.filter(e => selectedIds.has(e.id) && e.type === 'bend');
    if (selBends.length > 0) {
      pushState();
      selBends.forEach(selBend => {
        selBend.radius = r;
        let k = state.sheetMetal.kFactor;
        if (state.sheetMetal.autoKFactor && SheetMetal.calculateKFactor) {
          k = SheetMetal.calculateKFactor({
            radius: r,
            thickness: state.sheetMetal.thickness,
            material: state.sheetMetal.material,
            method: state.sheetMetal.kMethod || 'air'
          }).kFactor;
          selBend.kFactor = k;
        }
        const c = SheetMetal.computeBend({
          angle: selBend.angle != null ? selBend.angle : 90,
          thickness: state.sheetMetal.thickness,
          radius: r,
          kFactor: k
        });
        selBend.ba = c.BA_formatted;
        selBend.bd = c.BD_formatted;
        selBend.ossb = c.OSSB_formatted;
      });
      render();
    }
    recalcAllBends();
    if (updateUIFn) updateUIFn();
    render();
  }
  if (smRad) {
    smRad.onchange = e => onRadChange(e.target.value);
    smRad.oninput = e => onRadChange(e.target.value);
  }
  if (smSideRad) {
    smSideRad.onchange = e => onRadChange(e.target.value);
    smSideRad.oninput = e => onRadChange(e.target.value);
  }

  if (smDir) {
    smDir.onchange = e => {
      const d = e.target.value;
      state.sheetMetal.defaultDir = d;
      const selBends = state.ents.filter(ent => selectedIds.has(ent.id) && ent.type === 'bend');
      if (selBends.length > 0) {
        pushState();
        selBends.forEach(selBend => {
          selBend.direction = d;
          selBend.layer = d === 'DOWN' ? 'BEND_DOWN' : 'BEND_UP';
        });
        render();
      }
      if (updateUIFn) updateUIFn();
    };
  }

  document.querySelectorAll('.sm-btn-mini[data-ang]').forEach(btn => {
    btn.onclick = () => {
      const a = parseFloat(btn.dataset.ang);
      if (a) {
        state.sheetMetal.defaultAngle = a;
        if (smAng) smAng.value = a;
        if (smSideAng) smSideAng.value = a;
        const selBends = state.ents.filter(e => selectedIds.has(e.id) && e.type === 'bend');
        if (selBends.length > 0) {
          pushState();
          selBends.forEach(selBend => {
            selBend.angle = a;
            const c = SheetMetal.computeBend({
              angle: a,
              thickness: state.sheetMetal.thickness,
              radius: selBend.radius != null ? selBend.radius : 2.0,
              kFactor: state.sheetMetal.kFactor
            });
            selBend.ba = c.BA_formatted;
            selBend.bd = c.BD_formatted;
            selBend.ossb = c.OSSB_formatted;
          });
        }
        if (updateUIFn) updateUIFn();
        render();
      }
    };
  });

  if (btnToggleView) {
    btnToggleView.onclick = () => {
      state.sheetMetal.viewMode = state.sheetMetal.viewMode === 'flat' ? 'formed' : 'flat';
      const isFlat = state.sheetMetal.viewMode === 'flat';
      btnToggleView.classList.toggle('active', isFlat);
      const lbl = document.getElementById('lbl-sm-view-mode');
      if (lbl) lbl.textContent = isFlat ? 'Flat Blank' : 'Formed View';
      showToast(isFlat ? 'Compensated Flat Blank View (Press Brake Ready)' : 'Formed Dimensions View');
      render();
    };
  }

  if (btnQuickBracket) {
    btnQuickBracket.onclick = () => {
      pushState();
      const bracket = SheetMetal.createFormedBracket(50, 50, 50, {
        angle: state.sheetMetal.defaultAngle || 90,
        radius: state.sheetMetal.defaultRadius != null ? state.sheetMetal.defaultRadius : 2.0,
        direction: state.sheetMetal.defaultDir || 'UP',
        thickness: state.sheetMetal.thickness,
        kFactor: state.sheetMetal.kFactor
      });

      const [cx, cy] = toWorld(width / 2, height / 2);
      Geo.moveEnt(bracket.contour, Math.round(cx - 50), Math.round(cy - 25));
      Geo.moveEnt(bracket.bendLine, Math.round(cx - 50), Math.round(cy - 25));

      const c = SheetMetal.computeBend({
        angle: bracket.bendLine.angle,
        thickness: state.sheetMetal.thickness,
        radius: bracket.bendLine.radius,
        kFactor: state.sheetMetal.kFactor
      });
      bracket.bendLine.ba = c.BA_formatted;
      bracket.bendLine.bd = c.BD_formatted;
      bracket.bendLine.ossb = c.OSSB_formatted;

      addEntity(bracket.contour);
      addEntity(bracket.bendLine);
      selectedIds.clear();
      selectedIds.add(bracket.bendLine.id);
      zoomFit();
      if (updateUIFn) updateUIFn();
      showToast(`Inserted 50x50 formed bracket (Formed: 100mm, BD: ${c.BD_formatted}mm -> Flat Blank: ${(100 - c.BD).toFixed(3)}mm)`);
      render();
    };
  }

  if (btnExportFlat) {
    btnExportFlat.onclick = () => exportDXF(false);
  }

  if (btnBendTool) btnBendTool.onclick = () => setTool('bend');
  if (btnDrawBend) btnDrawBend.onclick = () => setTool('bend');
}
