/**
 * Parametric Part Library Modal (IGEMS Standard Shapes)
 * Parametric interactive dialog with 2D live canvas preview and origin insertion:
 * Flanges, Baseplates, Links, Washers, Lifting Lugs, Gussets, and Polygons.
 */
import { Geo, Parts } from '../core.js';
import { state, pushState, addEntity, selectedIds, mouseWorld, getCallbacks } from '../state.js';
import { zoomFit, render } from '../viewport.js';
import { showToast } from './toast.js';

let activePartId = 'flange';
let currentPartValues = {};

export function initPartLibraryUI() {
  const modal = document.getElementById('part-library-modal');
  const btnOpen = document.getElementById('btn-part-library');
  const btnClose = document.getElementById('btn-close-part-modal');
  const btnCancel = document.getElementById('btn-cancel-part');
  const btnInsert = document.getElementById('btn-insert-part');

  if (!modal || !btnOpen) return;

  btnOpen.onclick = () => {
    openPartLibraryModal();
  };

  if (btnClose) {
    btnClose.onclick = () => {
      modal.style.display = 'none';
    };
  }

  if (btnCancel) {
    btnCancel.onclick = () => {
      modal.style.display = 'none';
    };
  }

  if (btnInsert) {
    btnInsert.onclick = () => {
      insertSelectedPart();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      modal.style.display = 'none';
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
}

export function openPartLibraryModal() {
  const modal = document.getElementById('part-library-modal');
  if (!modal || !Parts) return;
  modal.style.display = 'flex';

  const insX = document.getElementById('part-ins-x');
  const insY = document.getElementById('part-ins-y');
  if (insX && insY) {
    insX.value = Math.round(mouseWorld.x || 0);
    insY.value = Math.round(mouseWorld.y || 0);
  }

  renderPartCatalog();
  selectPart(activePartId || (Parts.CATALOG[0] && Parts.CATALOG[0].id));
}

export function renderPartCatalog() {
  const catalogList = document.getElementById('part-catalog-list');
  if (!catalogList || !Parts) return;

  catalogList.innerHTML = '';
  Parts.CATALOG.forEach(part => {
    const item = document.createElement('div');
    item.className = 'part-cat-item' + (part.id === activePartId ? ' active' : '');
    item.innerHTML = `
      <div class="part-name">${part.name}</div>
      <div class="part-desc">${part.desc}</div>
    `;
    item.onclick = () => {
      selectPart(part.id);
    };
    catalogList.appendChild(item);
  });
}

export function selectPart(partId) {
  activePartId = partId;
  const part = Parts.CATALOG.find(p => p.id === partId);
  if (!part) return;

  const items = document.querySelectorAll('.part-cat-item');
  Parts.CATALOG.forEach((p, idx) => {
    if (items[idx]) {
      items[idx].classList.toggle('active', p.id === partId);
    }
  });

  const titleEl = document.getElementById('part-current-title');
  if (titleEl) titleEl.textContent = `${part.name} Dimensions`;

  currentPartValues = {};
  const container = document.getElementById('part-params-container');
  if (!container) return;
  container.innerHTML = '';

  part.params.forEach(param => {
    currentPartValues[param.key] = param.default;

    const group = document.createElement('div');
    group.className = 'param-input-group';

    const label = document.createElement('label');
    label.textContent = `${param.label} (${param.unit})`;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `part-param-${param.key}`;
    input.value = param.default;
    input.step = (param.key === 'sides' || param.key === 'numHoles') ? '1' : '5';
    if (param.key === 'sides') input.min = '3';
    else if (param.key === 'numHoles') input.min = '0';
    else input.min = '0.1';

    input.oninput = () => {
      const val = parseFloat(input.value);
      currentPartValues[param.key] = isNaN(val) ? param.default : val;
      renderPartPreview();
    };

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });

  renderPartPreview();
}

export function renderPartPreview() {
  const canvas = document.getElementById('part-preview-canvas');
  if (!canvas || !Parts) return;
  const pctx = canvas.getContext('2d');

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round((rect.width || 340) * dpr);
  const ch = Math.round((rect.height || 340) * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const w = canvas.width;
  const h = canvas.height;

  pctx.clearRect(0, 0, w, h);

  // Background
  pctx.fillStyle = '#16181d';
  pctx.fillRect(0, 0, w, h);

  // Subtle grid
  pctx.strokeStyle = '#222630';
  pctx.lineWidth = 1;
  const gridStep = 30 * dpr;
  pctx.beginPath();
  for (let x = 0; x <= w; x += gridStep) {
    pctx.moveTo(x, 0); pctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += gridStep) {
    pctx.moveTo(0, y); pctx.lineTo(w, y);
  }
  pctx.stroke();

  // Center axes
  pctx.strokeStyle = '#2d3545';
  pctx.beginPath();
  pctx.moveTo(w / 2, 0); pctx.lineTo(w / 2, h);
  pctx.moveTo(0, h / 2); pctx.lineTo(w, h / 2);
  pctx.stroke();

  const part = Parts.CATALOG.find(p => p.id === activePartId);
  if (!part) return;

  let ents = [];
  try {
    ents = part.generator(currentPartValues, 0, 0);
  } catch (err) {
    console.error('Error generating part preview:', err);
    return;
  }

  if (!ents || !ents.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ents.forEach(e => {
    const b = Geo.bbox(e);
    if (b[0] < minX) minX = b[0];
    if (b[1] < minY) minY = b[1];
    if (b[2] > maxX) maxX = b[2];
    if (b[3] > maxY) maxY = b[3];
  });

  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const margin = 40 * dpr;
  const scale = Math.min((w - margin * 2) / bw, (h - margin * 2) / bh);

  function ptToPrev(px, py) {
    return [
      w / 2 + (px - cx) * scale,
      h / 2 - (py - cy) * scale
    ];
  }

  ents.forEach(e => {
    const isHole = (e.layer === 'HOLES');
    pctx.strokeStyle = isHole ? '#33e0ff' : '#4dff6a';
    pctx.lineWidth = Math.max(1.5, 2.0 * dpr);
    pctx.beginPath();

    switch (e.type) {
      case 'line':
      case 'bend': {
        const [x1, y1] = ptToPrev(e.x1, e.y1);
        const [x2, y2] = ptToPrev(e.x2, e.y2);
        pctx.moveTo(x1, y1);
        pctx.lineTo(x2, y2);
        break;
      }
      case 'circle': {
        const [sx, sy] = ptToPrev(e.cx, e.cy);
        pctx.arc(sx, sy, e.r * scale, 0, Math.PI * 2);
        break;
      }
      case 'arc': {
        const [sx, sy] = ptToPrev(e.cx, e.cy);
        pctx.arc(sx, sy, e.r * scale, -e.a1, -e.a2, true);
        break;
      }
      case 'poly': {
        const segs = Geo.segsOf(e);
        segs.forEach((s, idx) => {
          if (s.t === 'L') {
            const [sx, sy] = ptToPrev(s.x1, s.y1);
            const [ex, ey] = ptToPrev(s.x2, s.y2);
            if (idx === 0) pctx.moveTo(sx, sy);
            pctx.lineTo(ex, ey);
          } else {
            const [scx, scy] = ptToPrev(s.cx, s.cy);
            pctx.arc(scx, scy, s.r * scale, -s.a0, -s.a1, !s.ccw);
          }
        });
        if (e.closed) pctx.closePath();
        break;
      }
    }
    pctx.stroke();
  });

  pctx.fillStyle = '#9aa5b5';
  pctx.font = `${Math.round(12 * dpr)}px sans-serif`;
  pctx.fillText(`${bw.toFixed(1)} × ${bh.toFixed(1)} mm`, 14 * dpr, h - 14 * dpr);
}

export function insertSelectedPart() {
  const part = Parts.CATALOG.find(p => p.id === activePartId);
  if (!part) return;

  const insX = parseFloat(document.getElementById('part-ins-x').value) || 0;
  const insY = parseFloat(document.getElementById('part-ins-y').value) || 0;

  let newEnts = [];
  try {
    newEnts = part.generator(currentPartValues, insX, insY);
  } catch (err) {
    showToast('Failed to generate part: ' + err.message);
    return;
  }

  if (!newEnts || !newEnts.length) {
    showToast('No entities generated');
    return;
  }

  const wasEmpty = (state.ents.length === 0);

  pushState();

  selectedIds.clear();
  newEnts.forEach(e => {
    addEntity(e);
    selectedIds.add(e.id);
  });

  const modal = document.getElementById('part-library-modal');
  if (modal) modal.style.display = 'none';

  showToast(`Inserted ${part.name} (${newEnts.length} entities)`);

  if (wasEmpty) {
    zoomFit();
  }

  getCallbacks().updateUI();
  getCallbacks().render();
  render();
}
