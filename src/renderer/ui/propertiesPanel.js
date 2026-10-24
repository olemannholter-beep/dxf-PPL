/**
 * Entity Properties Inspector & Live Dimension Editor
 * Inspects and live-modifies lines, polylines, circles, arcs, and bend parameters.
 */
import { Geo, SheetMetal } from '../core.js';
import { state, pushState, selectedIds } from '../state.js';
import { render } from '../viewport.js';
import { explodeSelection } from '../tools/explodeTool.js';
import { joinSelection } from '../tools/joinTool.js';
import { syncSheetMetalUI } from './sheetMetalPanel.js';

export function renderProperties(updateUIFn) {
  const propBox = document.getElementById('selection-properties');
  if (!propBox) return;

  const sel = state.ents.filter(e => selectedIds.has(e.id));
  if (!sel.length) {
    propBox.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No selection</div>';
  } else if (sel.length === 1) {
    const e = sel[0];
    let html = `
      <div class="prop-edit-row">
        <label>Type:</label>
        <span class="prop-value">${e.type.toUpperCase()}</span>
      </div>
      <div class="prop-edit-row">
        <label>Layer:</label>
        <span class="prop-value">${e.layer}</span>
      </div>
    `;

    if (e.type === 'line') {
      const curLen = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const curAng = Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI;
      html += `
        <div class="prop-edit-row">
          <label>Length:</label>
          <div><input type="number" id="prop-edit-len" value="${curLen.toFixed(3)}" step="1"> mm</div>
        </div>
        <div class="prop-edit-row">
          <label>Angle:</label>
          <div><input type="number" id="prop-edit-ang" value="${curAng.toFixed(1)}" step="1"> °</div>
        </div>
      `;
    } else if (e.type === 'poly') {
      const bb = Geo.bbox(e);
      const curW = bb[2] - bb[0];
      const curH = bb[3] - bb[1];
      html += `
        <div class="prop-edit-row">
          <label>Width:</label>
          <div><input type="number" id="prop-edit-w" value="${curW.toFixed(3)}" step="1"> mm</div>
        </div>
        <div class="prop-edit-row">
          <label>Height:</label>
          <div><input type="number" id="prop-edit-h" value="${curH.toFixed(3)}" step="1"> mm</div>
        </div>
        <button id="btn-prop-explode" class="btn-primary prop-action-btn">💥 Explode to Lines & Arcs (X)</button>
      `;
    } else if (e.type === 'circle') {
      html += `
        <div class="prop-edit-row">
          <label>Radius:</label>
          <div><input type="number" id="prop-edit-rad" value="${e.r.toFixed(3)}" step="1"> mm</div>
        </div>
        <div class="prop-edit-row">
          <label>Diameter:</label>
          <div><input type="number" id="prop-edit-dia" value="${(e.r * 2).toFixed(3)}" step="1"> mm</div>
        </div>
        <button id="btn-prop-explode" class="btn-primary prop-action-btn">💥 Explode to 2 Arcs (X)</button>
      `;
    } else if (e.type === 'arc') {
      html += `
        <div class="prop-edit-row">
          <label>Radius:</label>
          <div><input type="number" id="prop-edit-rad" value="${e.r.toFixed(3)}" step="1"> mm</div>
        </div>
      `;
    } else if (e.type === 'bend') {
      const curLen = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const isUp = (e.direction || 'UP').toUpperCase() === 'UP';
      const calc = SheetMetal.computeBend({
        angle: e.angle != null ? e.angle : 90,
        thickness: state.sheetMetal.thickness,
        radius: e.radius != null ? e.radius : 2.0,
        kFactor: state.sheetMetal.kFactor
      });
      e.ba = calc.BA_formatted;
      e.bd = calc.BD_formatted;
      e.ossb = calc.OSSB_formatted;

      html += `
        <div class="prop-edit-row">
          <label>Direction:</label>
          <div class="sm-dir-toggle">
            <button type="button" class="sm-dir-btn ${isUp ? 'active up' : ''}" id="bend-dir-up">▲ UP</button>
            <button type="button" class="sm-dir-btn ${!isUp ? 'active down' : ''}" id="bend-dir-down">▼ DOWN</button>
          </div>
        </div>
        <div class="prop-edit-row">
          <label>Bend Angle (α):</label>
          <div><input type="number" id="prop-bend-ang" value="${(e.angle != null ? e.angle : 90)}" min="1" max="179" step="1"> °</div>
        </div>
        <div class="prop-edit-row">
          <label>Inside Radius (R):</label>
          <div><input type="number" id="prop-bend-rad" value="${(e.radius != null ? e.radius : 2.0).toFixed(2)}" min="0" step="0.5"> mm</div>
        </div>
        <div class="prop-edit-row">
          <label>Bend Line Length:</label>
          <span class="prop-value">${curLen.toFixed(2)} mm</span>
        </div>

        <div class="sm-inspector-calc-box">
          <div style="font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">
            Engineering Calculations (K=${state.sheetMetal.kFactor}, T=${state.sheetMetal.thickness}mm)
          </div>
          <div class="sm-calc-item">
            <span class="sm-calc-title">Neutral Axis (Rn):</span>
            <span class="sm-calc-num" id="prop-calc-rn">${calc.Rn_formatted} mm</span>
          </div>
          <div class="sm-calc-item">
            <span class="sm-calc-title">Bend Allowance (BA):</span>
            <span class="sm-calc-num" id="prop-calc-ba">${calc.BA_formatted} mm</span>
          </div>
          <div class="sm-calc-item">
            <span class="sm-calc-title">Outside Setback (OSSB):</span>
            <span class="sm-calc-num" id="prop-calc-ossb">${calc.OSSB_formatted} mm</span>
          </div>
          <div class="sm-calc-item">
            <span class="sm-calc-title">Bend Deduction (BD):</span>
            <span class="sm-calc-num magenta" id="prop-calc-bd">${calc.BD_formatted} mm</span>
          </div>
          <div class="sm-calc-item">
            <span class="sm-calc-title">Flat Blank Deduction:</span>
            <span class="sm-calc-num magenta" id="prop-calc-fbd">-${calc.BD_formatted} mm</span>
          </div>
        </div>
      `;
    }

    propBox.innerHTML = html;

    const btnUp = document.getElementById('bend-dir-up');
    const btnDn = document.getElementById('bend-dir-down');
    if (btnUp && btnDn) {
      btnUp.onclick = () => {
        pushState();
        e.direction = 'UP';
        e.layer = 'BEND_UP';
        if (updateUIFn) updateUIFn();
        render();
      };
      btnDn.onclick = () => {
        pushState();
        e.direction = 'DOWN';
        e.layer = 'BEND_DOWN';
        if (updateUIFn) updateUIFn();
        render();
      };
    }

    const updateMetricsOnly = (c) => {
      const elRn = document.getElementById('prop-calc-rn');
      if (elRn) elRn.textContent = `${c.Rn_formatted} mm`;
      const elBa = document.getElementById('prop-calc-ba');
      if (elBa) elBa.textContent = `${c.BA_formatted} mm`;
      const elOssb = document.getElementById('prop-calc-ossb');
      if (elOssb) elOssb.textContent = `${c.OSSB_formatted} mm`;
      const elBd = document.getElementById('prop-calc-bd');
      if (elBd) elBd.textContent = `${c.BD_formatted} mm`;
      const elFbd = document.getElementById('prop-calc-fbd');
      if (elFbd) elFbd.textContent = `-${c.BD_formatted} mm`;
    };

    const inBendAng = document.getElementById('prop-bend-ang');
    if (inBendAng) {
      const liveBendAng = (commit) => {
        if (commit) pushState();
        const pAng = parseFloat(inBendAng.value);
        e.angle = !isNaN(pAng) ? Math.max(1, Math.min(179, pAng)) : 90;
        const c = SheetMetal.computeBend({
          angle: e.angle,
          thickness: state.sheetMetal.thickness,
          radius: e.radius != null ? e.radius : 2.0,
          kFactor: state.sheetMetal.kFactor
        });
        e.ba = c.BA_formatted;
        e.bd = c.BD_formatted;
        e.ossb = c.OSSB_formatted;
        updateMetricsOnly(c);
        syncSheetMetalUI();
        render();
        if (commit && updateUIFn) updateUIFn();
      };
      inBendAng.oninput = () => liveBendAng(false);
      inBendAng.onchange = () => liveBendAng(true);
      inBendAng.onkeydown = ev => { if (ev.key === 'Enter') liveBendAng(true); };
    }

    const inBendRad = document.getElementById('prop-bend-rad');
    if (inBendRad) {
      const liveBendRad = (commit) => {
        if (commit) pushState();
        const pRad = parseFloat(inBendRad.value);
        e.radius = Math.max(0, !isNaN(pRad) ? pRad : 2.0);
        const c = SheetMetal.computeBend({
          angle: e.angle != null ? e.angle : 90,
          thickness: state.sheetMetal.thickness,
          radius: e.radius,
          kFactor: state.sheetMetal.kFactor
        });
        e.ba = c.BA_formatted;
        e.bd = c.BD_formatted;
        e.ossb = c.OSSB_formatted;
        updateMetricsOnly(c);
        syncSheetMetalUI();
        render();
        if (commit && updateUIFn) updateUIFn();
      };
      inBendRad.oninput = () => liveBendRad(false);
      inBendRad.onchange = () => liveBendRad(true);
      inBendRad.onkeydown = ev => { if (ev.key === 'Enter') liveBendRad(true); };
    }

    const inLen = document.getElementById('prop-edit-len');
    const inAng = document.getElementById('prop-edit-ang');
    if (inLen && inAng) {
      const updateLine = () => {
        const newLen = parseFloat(inLen.value) || 1;
        const newAng = (parseFloat(inAng.value) || 0) * (Math.PI / 180);
        pushState();
        e.x2 = e.x1 + newLen * Math.cos(newAng);
        e.y2 = e.y1 + newLen * Math.sin(newAng);
        render();
      };
      inLen.onchange = updateLine;
      inAng.onchange = updateLine;
      inLen.onkeydown = ev => { if (ev.key === 'Enter') updateLine(); };
      inAng.onkeydown = ev => { if (ev.key === 'Enter') updateLine(); };
    }

    const inW = document.getElementById('prop-edit-w');
    const inH = document.getElementById('prop-edit-h');
    if (inW && inH) {
      const updatePolySize = () => {
        const targetW = parseFloat(inW.value) || 1;
        const targetH = parseFloat(inH.value) || 1;
        const bb = Geo.bbox(e);
        const curW = Math.max(0.001, bb[2] - bb[0]);
        const curH = Math.max(0.001, bb[3] - bb[1]);
        const scaleX = targetW / curW;
        const scaleY = targetH / curH;
        pushState();
        e.pts.forEach(p => {
          p.x = bb[0] + (p.x - bb[0]) * scaleX;
          p.y = bb[1] + (p.y - bb[1]) * scaleY;
        });
        render();
      };
      inW.onchange = updatePolySize;
      inH.onchange = updatePolySize;
      inW.onkeydown = ev => { if (ev.key === 'Enter') updatePolySize(); };
      inH.onkeydown = ev => { if (ev.key === 'Enter') updatePolySize(); };
    }

    const inRad = document.getElementById('prop-edit-rad');
    const inDia = document.getElementById('prop-edit-dia');
    if (inRad) {
      const updateRad = () => {
        pushState();
        e.r = Math.max(0.1, parseFloat(inRad.value) || 1);
        if (inDia) inDia.value = (e.r * 2).toFixed(3);
        render();
      };
      inRad.onchange = updateRad;
      inRad.onkeydown = ev => { if (ev.key === 'Enter') updateRad(); };
      if (inDia) {
        const updateDia = () => {
          pushState();
          e.r = Math.max(0.05, (parseFloat(inDia.value) || 2) / 2);
          inRad.value = e.r.toFixed(3);
          render();
        };
        inDia.onchange = updateDia;
        inDia.onkeydown = ev => { if (ev.key === 'Enter') updateDia(); };
      }
    }

    const btnExplode = document.getElementById('btn-prop-explode');
    if (btnExplode) {
      btnExplode.onclick = () => {
        explodeSelection();
        if (updateUIFn) updateUIFn();
      };
    }
  } else {
    propBox.innerHTML = `
      <div style="color: var(--accent-blue); font-size: 12px; margin-bottom: 8px;">${sel.length} objects selected</div>
      <button id="btn-prop-join" class="btn-primary prop-action-btn" style="background: #238636; border-color: #2ea043; margin-bottom: 6px;">🔗 Join Chosen into One Part (J)</button>
      <button id="btn-prop-explode" class="btn-secondary prop-action-btn">💥 Explode All Selected (X)</button>
    `;
    const btnPropJoin = document.getElementById('btn-prop-join');
    if (btnPropJoin) {
      btnPropJoin.onclick = () => {
        joinSelection();
        if (updateUIFn) updateUIFn();
      };
    }
    const btnPropExplode = document.getElementById('btn-prop-explode');
    if (btnPropExplode) {
      btnPropExplode.onclick = () => {
        explodeSelection();
        if (updateUIFn) updateUIFn();
      };
    }
  }
}
