/* ==========================================================================
   Desktop CAD/CAM Drawing Controller (Electron + Canvas)
   Supports full IGEMS waterjet/laser features, precision CAD drawing,
   1x1mm fixed grid, Explode geometry into lines/arcs, and Manual Dimension Input.
   ========================================================================== */
'use strict';

const Geo = window.Geo;
const Dxf = window.Dxf;
const Cam = window.Cam;

// Application State
const state = {
  ents: [],
  layers: [
    { name: '0', aci: 7, visible: true },
    { name: 'PARTS', aci: 3, visible: true },
    { name: 'HOLES', aci: 4, visible: true },
    { name: 'LEADS', aci: 2, visible: true }
  ],
  curLayer: '0',
  units: 'mm',
  nextId: 1
};
window.state = state;

// Undo / Redo history
const history = {
  undoStack: [],
  redoStack: []
};

// View Transform
const view = {
  scale: 4, // px per unit (mm)
  panX: 0,
  panY: 0
};

// Interactive State
let activeTool = 'select';
let activePoints = [];
let selectedIds = new Set();
window.selectedIds = selectedIds;
let mouseScreen = { x: 0, y: 0 };
let mouseWorld = { x: 0, y: 0 };
let activeSnap = null;
let dragAction = null;
let isSpacePressed = false;

// Flags & Toggles
const options = {
  osnap: true,
  gsnap: true, // Grid snap strictly 1x1mm
  grid: true,  // Grid display strictly 1x1mm
  ortho: false,
  showCam: true,
  openEnds: []
};

// DOM References
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');
const coordDisplay = document.getElementById('coord-display');
const commandPrompt = document.getElementById('command-prompt');
const commandInput = document.getElementById('command-input');
const toastPopup = document.getElementById('toast-popup');

// Manual Input HUD Elements
const hudBox = document.getElementById('manual-input-box');
const hudTitle = document.getElementById('hud-title');
const hudValW = document.getElementById('hud-val-w');
const hudValH = document.getElementById('hud-val-h');
const hudLabelW = document.getElementById('hud-label-w');
const hudLabelH = document.getElementById('hud-label-h');
const hudSquareRow = document.getElementById('hud-square-row');
const hudLockSquare = document.getElementById('hud-lock-square');
const hudApplyBtn = document.getElementById('hud-apply-btn');
const hudCancelBtn = document.getElementById('hud-cancel-btn');
const hudCloseBtn = document.getElementById('hud-close-btn');

let hudContext = null; // { mode: 'rect'|'line'|'circle', origin: {x, y} }

/* --------------------------------------------------------------------------
   Helpers & Coordinate Transforms
   -------------------------------------------------------------------------- */
const toScreen = (x, y) => [x * view.scale + view.panX, view.panY - y * view.scale];
const toWorld = (sx, sy) => [(sx - view.panX) / view.scale, (view.panY - sy) / view.scale];

const ACI_COLORS = {
  1: '#ff4d4d', 2: '#ffd966', 3: '#4dff6a', 4: '#33e0ff',
  5: '#5b8cff', 6: '#ff4dff', 7: '#ffffff', 8: '#8a8a8a', 9: '#c0c0c0'
};
const getColor = aci => ACI_COLORS[aci] || '#ffffff';

function showToast(msg) {
  toastPopup.textContent = msg;
  toastPopup.classList.add('visible');
  clearTimeout(toastPopup._timer);
  toastPopup._timer = setTimeout(() => toastPopup.classList.remove('visible'), 2800);
}

function pushState() {
  history.undoStack.push(JSON.stringify(state));
  if (history.undoStack.length > 100) history.undoStack.shift();
  history.redoStack.length = 0;
}

function undo() {
  if (!history.undoStack.length) return showToast('Nothing to undo');
  history.redoStack.push(JSON.stringify(state));
  const prev = JSON.parse(history.undoStack.pop());
  Object.assign(state, prev);
  selectedIds = new Set([...selectedIds].filter(id => state.ents.some(e => e.id === id)));
  activePoints = [];
  hideManualInputHUD();
  render();
  updateUI();
}

function redo() {
  if (!history.redoStack.length) return showToast('Nothing to redo');
  history.undoStack.push(JSON.stringify(state));
  const next = JSON.parse(history.redoStack.pop());
  Object.assign(state, next);
  activePoints = [];
  hideManualInputHUD();
  render();
  updateUI();
}

/* --------------------------------------------------------------------------
   Canvas Sizing & Strictly 1x1 mm Grid
   -------------------------------------------------------------------------- */
let width = 0, height = 0, dpr = 1;

function resizeCanvas() {
  const rect = wrapper.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = Math.max(1, width * dpr);
  canvas.height = Math.max(1, height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  render();
}

// Strictly 1x1 millimeter grid interval
function getGridInterval() {
  return 1.0;
}

function zoomFit() {
  const visible = state.ents;
  if (!visible.length) {
    view.scale = 4;
    view.panX = width / 2;
    view.panY = height / 2;
    return render();
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  visible.forEach(e => {
    const bb = Geo.bbox(e);
    minX = Math.min(minX, bb[0]); minY = Math.min(minY, bb[1]);
    maxX = Math.max(maxX, bb[2]); maxY = Math.max(maxY, bb[3]);
  });
  const bw = Math.max(maxX - minX, 10);
  const bh = Math.max(maxY - minY, 10);
  view.scale = Math.min((width - 120) / bw, (height - 120) / bh);
  if (!isFinite(view.scale) || view.scale <= 0) view.scale = 4;
  view.panX = width / 2 - (minX + maxX) / 2 * view.scale;
  view.panY = height / 2 + (minY + maxY) / 2 * view.scale;
  render();
}

/* --------------------------------------------------------------------------
   Snapping Engine (1x1mm Grid Snap & OSNAP)
   -------------------------------------------------------------------------- */
function collectSnapPoints() {
  const pts = [];
  state.ents.forEach(e => {
    switch (e.type) {
      case 'line':
        pts.push({ x: e.x1, y: e.y1, type: 'END' }, { x: e.x2, y: e.y2, type: 'END' });
        pts.push({ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, type: 'MID' });
        break;
      case 'circle':
        pts.push({ x: e.cx, y: e.cy, type: 'CEN' });
        pts.push({ x: e.cx + e.r, y: e.cy, type: 'QUA' }, { x: e.cx - e.r, y: e.cy, type: 'QUA' });
        pts.push({ x: e.cx, y: e.cy + e.r, type: 'QUA' }, { x: e.cx, y: e.cy - e.r, type: 'QUA' });
        break;
      case 'arc': {
        const am = e.a1 + Geo.norm(e.a2 - e.a1) / 2;
        pts.push({ x: e.cx, y: e.cy, type: 'CEN' });
        pts.push({ x: e.cx + e.r * Math.cos(e.a1), y: e.cy + e.r * Math.sin(e.a1), type: 'END' });
        pts.push({ x: e.cx + e.r * Math.cos(e.a2), y: e.cy + e.r * Math.sin(e.a2), type: 'END' });
        pts.push({ x: e.cx + e.r * Math.cos(am), y: e.cy + e.r * Math.sin(am), type: 'MID' });
        break;
      }
      case 'poly': {
        const n = e.pts.length, m = e.closed ? n : n - 1;
        e.pts.forEach(p => pts.push({ x: p.x, y: p.y, type: 'END' }));
        for (let i = 0; i < m; i++) {
          const p = e.pts[i], q = e.pts[(i + 1) % n];
          pts.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, type: 'MID' });
        }
        break;
      }
    }
  });
  return pts;
}

function resolvePoint(sx, sy) {
  const w = toWorld(sx, sy);
  let p = { x: w[0], y: w[1] };
  let snapInfo = null;

  if (options.osnap) {
    let closest = null, minDist = 14;
    for (const cand of collectSnapPoints()) {
      const s = toScreen(cand.x, cand.y);
      const d = Math.hypot(s[0] - sx, s[1] - sy);
      if (d < minDist) {
        minDist = d;
        closest = cand;
      }
    }
    if (closest) {
      return { p: { x: closest.x, y: closest.y }, snap: closest.type };
    }
  }

  // Strictly 1x1mm grid snap
  if (options.gsnap) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }

  if (options.ortho && activePoints.length > 0) {
    const base = activePoints[activePoints.length - 1];
    if (Math.abs(p.x - base.x) >= Math.abs(p.y - base.y)) {
      p.y = base.y;
    } else {
      p.x = base.x;
    }
  }

  return { p, snap: snapInfo };
}

/* --------------------------------------------------------------------------
   Tool Actions & Geometry Creation
   -------------------------------------------------------------------------- */
function addEntity(e) {
  e.id = state.nextId++;
  e.layer = e.layer || state.curLayer || '0';
  state.ents.push(e);
  return e;
}

function setTool(toolName) {
  activeTool = toolName;
  activePoints = [];
  hideManualInputHUD();
  if (typeof hideSmartDimHUD === 'function') hideSmartDimHUD();
  if (typeof smartDimState !== 'undefined') smartDimState.hoverTarget = null;
  document.querySelectorAll('.ribbon-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });
  updatePrompt();
  render();
}

function updatePrompt() {
  let msg = '';
  const n = activePoints.length;
  switch (activeTool) {
    case 'select': msg = 'Click to select. Drag left-to-right (window) or right-to-left (cross). Del deletes, X explodes.'; break;
    case 'smart-dim': msg = 'Smart Dimension: Click line, circle, arc, or polyline to measure & modify keeping joints intact (D)'; break;
    case 'line': msg = n ? 'Line: Pick next point, or type length/angle' : 'Line: Pick start point'; break;
    case 'poly': msg = n ? `Polyline: Pick point ${n + 1} (Enter=finish, C=close)` : 'Polyline: Pick start point'; break;
    case 'rect': msg = n ? 'Rectangle: Enter Width & Height in popup or click opposite corner' : 'Rectangle: Click left mouse button for start corner'; break;
    case 'circle': msg = n ? 'Circle: Specify radius or type radius/diameter' : 'Circle: Pick center point'; break;
    case 'arc': msg = n === 0 ? 'Arc: Start point' : (n === 1 ? 'Arc: Second point on circumference' : 'Arc: End point'); break;
    case 'move': msg = n ? 'Move: Pick destination point' : 'Move: Pick base point'; break;
    case 'copy': msg = n ? 'Copy: Pick destination point' : 'Copy: Pick base point'; break;
    case 'rotate': msg = n ? 'Rotate: Pick reference angle / type degrees' : 'Rotate: Pick center of rotation'; break;
    case 'scale': msg = n ? 'Scale: Pick target point / type factor' : 'Scale: Pick base point'; break;
    case 'mirror': msg = n ? 'Mirror: Pick second axis point' : 'Mirror: Pick first axis point'; break;
    case 'trim': msg = 'Trim: Click geometry segment to cut away'; break;
    case 'extend': msg = 'Extend: Click line or arc to extend'; break;
    case 'fillet': msg = 'Fillet: Click corner or polyline to round'; break;
    case 'offset': msg = n ? 'Offset: Click side to offset towards' : 'Offset: Select entity first'; break;
    case 'set-start': msg = 'Set Start Point: Click contour where lead-in should pierce'; break;
  }
  commandPrompt.textContent = msg;
}

function handlePointInput(p) {
  switch (activeTool) {
    case 'line':
      if (!activePoints.length) {
        activePoints = [p];
        showManualInputHUD('line', p);
      } else {
        if (Geo.dist(activePoints[0], p) > 1e-6) {
          pushState();
          addEntity({ type: 'line', x1: activePoints[0].x, y1: activePoints[0].y, x2: p.x, y2: p.y });
          activePoints = [p];
          showManualInputHUD('line', p);
        }
      }
      break;

    case 'poly':
      if (activePoints.length >= 3 && Geo.dist(p, activePoints[0]) < 1e-4) {
        finishPolyline(true);
        return;
      }
      activePoints.push(p);
      break;

    case 'rect':
      if (!activePoints.length) {
        activePoints = [p];
        // Immediately show manual input dialog when clicking first corner
        showManualInputHUD('rect', p);
      } else {
        const p0 = activePoints[0];
        if (Math.abs(p.x - p0.x) > 1e-6 && Math.abs(p.y - p0.y) > 1e-6) {
          pushState();
          addEntity({
            type: 'poly',
            closed: true,
            pts: [
              { x: p0.x, y: p0.y, b: 0 },
              { x: p.x, y: p0.y, b: 0 },
              { x: p.x, y: p.y, b: 0 },
              { x: p0.x, y: p.y, b: 0 }
            ]
          });
          activePoints = [];
          hideManualInputHUD();
        }
      }
      break;

    case 'circle':
      if (!activePoints.length) {
        activePoints = [p];
        showManualInputHUD('circle', p);
      } else {
        const r = Geo.dist(activePoints[0], p);
        if (r > 1e-6) {
          pushState();
          addEntity({ type: 'circle', cx: activePoints[0].x, cy: activePoints[0].y, r });
          activePoints = [];
          hideManualInputHUD();
        }
      }
      break;

    case 'arc':
      activePoints.push(p);
      if (activePoints.length === 3) {
        const a = createArc3(activePoints[0], activePoints[1], activePoints[2]);
        if (a) {
          pushState();
          addEntity(a);
        } else {
          showToast('Points are collinear - could not create arc');
        }
        activePoints = [];
      }
      break;

    case 'move':
    case 'copy':
      if (!activePoints.length) {
        activePoints = [p];
      } else {
        const dx = p.x - activePoints[0].x;
        const dy = p.y - activePoints[0].y;
        pushState();
        const selected = state.ents.filter(e => selectedIds.has(e.id));
        if (activeTool === 'copy') {
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
        activePoints = [];
      }
      break;

    case 'rotate':
      if (!activePoints.length) {
        activePoints = [p];
      } else {
        const ang = Math.atan2(p.y - activePoints[0].y, p.x - activePoints[0].x);
        pushState();
        state.ents.filter(e => selectedIds.has(e.id)).forEach(e => Geo.rotEnt(e, activePoints[0], ang));
        setTool('select');
        activePoints = [];
      }
      break;

    case 'scale':
      if (!activePoints.length) {
        activePoints = [p];
      } else {
        const d = Geo.dist(activePoints[0], p);
        const factor = Math.max(0.01, d / 20);
        pushState();
        state.ents.filter(e => selectedIds.has(e.id)).forEach(e => Geo.scaleEnt(e, activePoints[0], factor));
        setTool('select');
        activePoints = [];
      }
      break;

    case 'trim': {
      const clicked = pickEntity(mouseScreen.x, mouseScreen.y);
      if (clicked) {
        const allOtherSegs = [];
        state.ents.filter(e => e.id !== clicked.id).forEach(e => allOtherSegs.push(...Geo.segsOf(e)));
        const res = Geo.trimEntity(clicked, p, allOtherSegs);
        if (res && res.add) {
          pushState();
          state.ents = state.ents.filter(e => e.id !== clicked.id);
          res.add.forEach(addEntity);
          showToast('Segment trimmed');
        } else {
          showToast('No intersection cutter found to trim');
        }
      }
      break;
    }

    case 'extend': {
      const clicked = pickEntity(mouseScreen.x, mouseScreen.y);
      if (clicked) {
        const allOtherSegs = [];
        state.ents.filter(e => e.id !== clicked.id).forEach(e => allOtherSegs.push(...Geo.segsOf(e)));
        const res = Geo.extendEntity(clicked, p, allOtherSegs);
        if (res) {
          pushState();
          Object.assign(clicked, res);
          showToast('Entity extended');
        } else {
          showToast('No boundary found to extend to');
        }
      }
      break;
    }

    case 'fillet': {
      const clicked = pickEntity(mouseScreen.x, mouseScreen.y);
      if (clicked && clicked.type === 'poly') {
        const rad = parseFloat(document.getElementById('cam-lead-rad').value) || 2.0;
        const res = Geo.roundCorners(clicked, rad, false);
        if (res && res.count > 0) {
          pushState();
          Object.assign(clicked, res.ent);
          showToast(`Filleted ${res.count} corners (R=${rad})`);
        }
      }
      break;
    }

    case 'offset': {
      const clicked = pickEntity(mouseScreen.x, mouseScreen.y);
      if (clicked) {
        const kerf = (parseFloat(document.getElementById('cam-kerf').value) || 0.75) / 2;
        const off = Geo.offsetEntity(clicked, kerf, p);
        if (off) {
          pushState();
          addEntity(off);
          showToast(`Offset created (${kerf.toFixed(3)} mm)`);
        }
      }
      break;
    }

    case 'set-start': {
      const clicked = pickEntity(mouseScreen.x, mouseScreen.y);
      if (clicked) {
        pushState();
        const updated = Geo.setStartPoint(clicked, p, 2.0);
        Object.assign(clicked, updated);
        showToast('Lead-in start point relocated');
      }
      break;
    }
  }

  updatePrompt();
  updateUI();
  render();
}

function createArc3(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a1 = Math.atan2(ay - uy, ax - ux);
  const am = Math.atan2(by - uy, bx - ux);
  const a3 = Math.atan2(cy - uy, cx - ux);
  return Geo.norm(am - a1) <= Geo.norm(a3 - a1)
    ? { type: 'arc', cx: ux, cy: uy, r, a1, a2: a3 }
    : { type: 'arc', cx: ux, cy: uy, r, a1: a3, a2: a1 };
}

function finishPolyline(closed = false) {
  if (activePoints.length >= 2) {
    pushState();
    addEntity({
      type: 'poly',
      closed: !!closed,
      pts: activePoints.map(p => ({ x: p.x, y: p.y, b: 0 }))
    });
  }
  activePoints = [];
  updatePrompt();
  render();
}

function pickEntity(sx, sy) {
  const w = toWorld(sx, sy);
  const tol = 8 / view.scale;
  let best = null, bd = tol;
  state.ents.forEach(e => {
    const d = Geo.distEnt(e, w[0], w[1]);
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  return best;
}

/* --------------------------------------------------------------------------
   Manual Dimension Input HUD (Square, Rect, Line, Circle)
   -------------------------------------------------------------------------- */
function showManualInputHUD(mode, origin) {
  hudContext = { mode, origin: { ...origin } };
  const [sx, sy] = toScreen(origin.x, origin.y);

  // Position popup box near cursor/corner, keeping inside viewport
  const left = Math.min(Math.max(10, sx + 15), width - 260);
  const top = Math.min(Math.max(10, sy - 40), height - 200);
  hudBox.style.left = left + 'px';
  hudBox.style.top = top + 'px';
  hudBox.style.display = 'flex';

  if (mode === 'rect') {
    hudTitle.textContent = 'Specify Square / Rectangle';
    hudLabelW.textContent = 'Width:';
    hudLabelH.textContent = 'Height:';
    hudSquareRow.style.display = 'flex';
    hudHRow.style.display = 'flex';
    hudLockSquare.checked = true;
    hudValW.value = '50';
    hudValH.value = '50';
    hudApplyBtn.textContent = 'Create Square';
  } else if (mode === 'line') {
    hudTitle.textContent = 'Specify Line Dimensions';
    hudLabelW.textContent = 'Length:';
    hudLabelH.textContent = 'Angle (°):';
    hudSquareRow.style.display = 'none';
    hudHRow.style.display = 'flex';
    hudValW.value = '50';
    hudValH.value = '0';
    hudApplyBtn.textContent = 'Create Line';
  } else if (mode === 'circle') {
    hudTitle.textContent = 'Specify Circle Dimensions';
    hudLabelW.textContent = 'Radius:';
    hudLabelH.textContent = 'Diameter:';
    hudSquareRow.style.display = 'none';
    hudHRow.style.display = 'flex';
    hudValW.value = '25';
    hudValH.value = '50';
    hudApplyBtn.textContent = 'Create Circle';
  }

  hudValW.focus();
  hudValW.select();
}

function hideManualInputHUD() {
  hudBox.style.display = 'none';
  hudContext = null;
}

const hudHRow = document.getElementById('hud-h-row');

// Lock square aspect ratio when typing
hudValW.addEventListener('input', () => {
  if (hudContext && hudContext.mode === 'rect' && hudLockSquare.checked) {
    hudValH.value = hudValW.value;
  } else if (hudContext && hudContext.mode === 'circle') {
    hudValH.value = (parseFloat(hudValW.value) || 0) * 2;
  }
});

hudValH.addEventListener('input', () => {
  if (hudContext && hudContext.mode === 'rect') {
    if (hudValH.value !== hudValW.value) {
      hudLockSquare.checked = false;
    }
  } else if (hudContext && hudContext.mode === 'circle') {
    hudValW.value = (parseFloat(hudValH.value) || 0) / 2;
  }
});

hudLockSquare.addEventListener('change', () => {
  if (hudLockSquare.checked) {
    hudValH.value = hudValW.value;
    hudApplyBtn.textContent = 'Create Square';
  } else {
    hudApplyBtn.textContent = 'Create Rectangle';
  }
});

function applyManualInput() {
  if (!hudContext) return;
  const p0 = hudContext.origin;
  const w = parseFloat(hudValW.value) || 50;
  const h = parseFloat(hudValH.value) || 50;

  pushState();

  if (hudContext.mode === 'rect') {
    // Generate closed square or rectangle polyline
    addEntity({
      type: 'poly',
      closed: true,
      pts: [
        { x: p0.x, y: p0.y, b: 0 },
        { x: p0.x + w, y: p0.y, b: 0 },
        { x: p0.x + w, y: p0.y + h, b: 0 },
        { x: p0.x, y: p0.y + h, b: 0 }
      ]
    });
    showToast(`Created ${w}x${h} mm ${w === h ? 'Square' : 'Rectangle'}`);
  } else if (hudContext.mode === 'line') {
    const angRad = (h || 0) * (Math.PI / 180);
    addEntity({
      type: 'line',
      x1: p0.x,
      y1: p0.y,
      x2: p0.x + w * Math.cos(angRad),
      y2: p0.y + w * Math.sin(angRad)
    });
    showToast(`Created line (Length: ${w} mm, ${h}°)`);
  } else if (hudContext.mode === 'circle') {
    addEntity({
      type: 'circle',
      cx: p0.x,
      cy: p0.y,
      r: w
    });
    showToast(`Created circle (R: ${w} mm, Ø: ${w * 2} mm)`);
  }

  activePoints = [];
  hideManualInputHUD();
  updateUI();
  render();
}

hudApplyBtn.onclick = applyManualInput;
hudCancelBtn.onclick = () => {
  activePoints = [];
  hideManualInputHUD();
  render();
};
hudCloseBtn.onclick = hudCancelBtn.onclick;

[hudValW, hudValH].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyManualInput();
    } else if (e.key === 'Escape') {
      hideManualInputHUD();
    }
  });
});

/* ==========================================================================
   SolidWorks Inspired Smart Dimension Controller
   Features:
     - Real-time hover preview with witness lines & dimension badges
     - Click entity (line, polyline segment, circle, arc) to measure
     - Interactive floating "Modify Dimension" popover HUD
     - Intact joint topology preservation (stretching & moving connected vertices)
     - Orthogonal box / rectangle parallel edge translation
   ========================================================================== */
const smartDimState = {
  activeDim: null,
  activeDir: 'start', // 'start' (grow end), 'end' (grow start), 'center' (symmetric)
  hoverTarget: null,
  placedDims: []
};

// DOM References for Smart Dim Popover
const smartDimHud = document.getElementById('smart-dim-hud');
const dimHudVal = document.getElementById('dim-hud-val');
const dimHudPrefix = document.getElementById('dim-hud-prefix');
const dimHudLabel = document.getElementById('dim-hud-label');
const dimHudCloseBtn = document.getElementById('dim-hud-close-btn');
const dimHudApplyBtn = document.getElementById('dim-hud-apply-btn');
const dimHudCancelBtn = document.getElementById('dim-hud-cancel-btn');
const dimHudJointLock = document.getElementById('dim-hud-joint-lock');
const dimHudOrthoBox = document.getElementById('dim-hud-ortho-box');
const dimHudOrthoBoxRow = document.getElementById('dim-hud-ortho-box-row');
const dimDirBtns = document.querySelectorAll('.dim-dir-btn');

function initSmartDimensionsUI() {
  const btnSmartDim = document.getElementById('btn-smart-dim');
  if (btnSmartDim) {
    btnSmartDim.onclick = () => {
      setTool('smart-dim');
    };
  }

  dimDirBtns.forEach(btn => {
    btn.onclick = () => {
      dimDirBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      smartDimState.activeDir = btn.dataset.dir;
    };
  });

  if (dimHudApplyBtn) dimHudApplyBtn.onclick = applyCurrentSmartDim;
  if (dimHudCancelBtn) dimHudCancelBtn.onclick = hideSmartDimHUD;
  if (dimHudCloseBtn) dimHudCloseBtn.onclick = hideSmartDimHUD;

  if (dimHudVal) {
    dimHudVal.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCurrentSmartDim();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideSmartDimHUD();
      }
    });
  }
}

function showSmartDimHUD(dim) {
  smartDimState.activeDim = dim;
  if (!smartDimHud) return;

  smartDimState.activeDir = 'start';
  dimDirBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.dir === 'start');
  });

  let sx = width / 2, sy = height / 2;
  if (dim.mid) {
    const s = toScreen(dim.mid.x, dim.mid.y);
    sx = s[0]; sy = s[1];
  } else if (dim.p1 && dim.p2) {
    const s1 = toScreen(dim.p1.x, dim.p1.y);
    const s2 = toScreen(dim.p2.x, dim.p2.y);
    sx = (s1[0] + s2[0]) / 2;
    sy = (s1[1] + s2[1]) / 2;
  } else if (dim.cx !== undefined) {
    const s = toScreen(dim.cx, dim.cy);
    sx = s[0]; sy = s[1];
  }

  const left = Math.min(Math.max(15, sx + 25), width - 290);
  const top = Math.min(Math.max(15, sy - 60), height - 230);
  smartDimHud.style.left = left + 'px';
  smartDimHud.style.top = top + 'px';
  smartDimHud.style.display = 'flex';

  if (dim.type === 'circle') {
    dimHudPrefix.textContent = 'Ø';
    dimHudLabel.textContent = 'Modify Diameter';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else if (dim.type === 'arc') {
    dimHudPrefix.textContent = 'R';
    dimHudLabel.textContent = 'Modify Radius';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else {
    dimHudPrefix.textContent = 'D1';
    dimHudLabel.textContent = 'Modify Length';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'flex';
  }

  const formatted = (dim.val % 1 === 0) ? dim.val.toFixed(0) : dim.val.toFixed(2);
  dimHudVal.value = formatted;
  setTimeout(() => {
    dimHudVal.focus();
    dimHudVal.select();
  }, 30);
}

function hideSmartDimHUD() {
  smartDimState.activeDim = null;
  if (smartDimHud) smartDimHud.style.display = 'none';
}

function applyCurrentSmartDim() {
  if (!smartDimState.activeDim) return;
  const newVal = parseFloat(dimHudVal.value);
  if (isNaN(newVal) || newVal <= 0) {
    return showToast('Please enter a valid positive dimension');
  }

  const keepJoints = dimHudJointLock ? dimHudJointLock.checked : true;
  const moveOrtho = dimHudOrthoBox ? dimHudOrthoBox.checked : true;

  applySmartDimension(smartDimState.activeDim, newVal, {
    dir: smartDimState.activeDir,
    keepJoints,
    moveOrtho
  });
}

function applySmartDimension(dim, newVal, opts = {}) {
  const target = state.ents.find(e => e.id === dim.targetId);
  if (!target) {
    hideSmartDimHUD();
    return;
  }

  const oldVal = dim.val;
  if (Math.abs(newVal - oldVal) < 1e-5) {
    hideSmartDimHUD();
    return;
  }

  pushState();

  const keepJoints = (opts.keepJoints !== false);
  const moveOrtho = (opts.moveOrtho !== false);
  const dir = opts.dir || 'start';

  if (target.type === 'line') {
    const p1 = { x: target.x1, y: target.y1 };
    const p2 = { x: target.x2, y: target.y2 };
    const curLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (curLen < 1e-9) return;
    const delta = newVal - curLen;
    const ux = (p2.x - p1.x) / curLen;
    const uy = (p2.y - p1.y) / curLen;

    const isH = Math.abs(uy) < 1e-4;
    const isV = Math.abs(ux) < 1e-4;

    if (moveOrtho && (isH || isV) && keepJoints) {
      const moveEnd = (dir === 'start');
      const movedPt = moveEnd ? p2 : p1;
      const dispX = moveEnd ? delta * ux : -delta * ux;
      const dispY = moveEnd ? delta * uy : -delta * uy;

      // Find perpendicular lines connected at movedPt
      const connectedPerp = state.ents.filter(o => {
        if (o.id === target.id || o.type !== 'line') return false;
        const touches = Math.hypot(o.x1 - movedPt.x, o.y1 - movedPt.y) < 0.05 ||
                        Math.hypot(o.x2 - movedPt.x, o.y2 - movedPt.y) < 0.05;
        if (!touches) return false;
        const oIsH = Math.abs(o.y2 - o.y1) < 1e-4;
        const oIsV = Math.abs(o.x2 - o.x1) < 1e-4;
        return (isH && oIsV) || (isV && oIsH);
      });

      if (connectedPerp.length > 0) {
        connectedPerp.forEach(perp => {
          const ptA = { x: perp.x1, y: perp.y1 };
          const ptB = { x: perp.x2, y: perp.y2 };
          const newA = { x: ptA.x + dispX, y: ptA.y + dispY };
          const newB = { x: ptB.x + dispX, y: ptB.y + dispY };

          perp.x1 = newA.x; perp.y1 = newA.y;
          perp.x2 = newB.x; perp.y2 = newB.y;

          moveJointVertex(ptA, newA, [target.id, perp.id]);
          moveJointVertex(ptB, newB, [target.id, perp.id]);
        });

        if (moveEnd) {
          target.x2 += dispX; target.y2 += dispY;
        } else {
          target.x1 += dispX; target.y1 += dispY;
        }
      } else {
        applyLineJointMove(target, p1, p2, ux, uy, delta, dir, keepJoints);
      }
    } else {
      applyLineJointMove(target, p1, p2, ux, uy, delta, dir, keepJoints);
    }
  } else if (target.type === 'poly') {
    const k = dim.segIndex || 0;
    const n = target.pts.length;
    const p1 = target.pts[k];
    const p2 = target.pts[(k + 1) % n];
    const curLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (curLen < 1e-9) return;
    const delta = newVal - curLen;
    const ux = (p2.x - p1.x) / curLen;
    const uy = (p2.y - p1.y) / curLen;

    const isH = Math.abs(uy) < 1e-4;
    const isV = Math.abs(ux) < 1e-4;

    // Check if 4-point closed orthogonal rectangle
    if (n === 4 && target.closed && (isH || isV) && moveOrtho && keepJoints) {
      const dispX = (dir === 'end' ? -delta : delta) * ux;
      const dispY = (dir === 'end' ? -delta : delta) * uy;

      if (dir === 'center') {
        const hx = (delta / 2) * ux;
        const hy = (delta / 2) * uy;
        const oldP1 = { ...p1 }, oldP4 = { ...target.pts[(k + 3) % 4] };
        const oldP2 = { ...p2 }, oldP3 = { ...target.pts[(k + 2) % 4] };

        p1.x -= hx; p1.y -= hy;
        target.pts[(k + 3) % 4].x -= hx; target.pts[(k + 3) % 4].y -= hy;
        p2.x += hx; p2.y += hy;
        target.pts[(k + 2) % 4].x += hx; target.pts[(k + 2) % 4].y += hy;

        moveJointVertex(oldP1, p1, [target.id]);
        moveJointVertex(oldP4, target.pts[(k + 3) % 4], [target.id]);
        moveJointVertex(oldP2, p2, [target.id]);
        moveJointVertex(oldP3, target.pts[(k + 2) % 4], [target.id]);
      } else if (dir === 'start') {
        const oldP2 = { ...p2 };
        const oldP3 = { ...target.pts[(k + 2) % 4] };

        p2.x += dispX; p2.y += dispY;
        target.pts[(k + 2) % 4].x += dispX; target.pts[(k + 2) % 4].y += dispY;

        moveJointVertex(oldP2, p2, [target.id]);
        moveJointVertex(oldP3, target.pts[(k + 2) % 4], [target.id]);
      } else {
        const oldP1 = { ...p1 };
        const oldP4 = { ...target.pts[(k + 3) % 4] };

        p1.x += dispX; p1.y += dispY;
        target.pts[(k + 3) % 4].x += dispX; target.pts[(k + 3) % 4].y += dispY;

        moveJointVertex(oldP1, p1, [target.id]);
        moveJointVertex(oldP4, target.pts[(k + 3) % 4], [target.id]);
      }
    } else {
      if (dir === 'center') {
        const oldP1 = { ...p1 }, oldP2 = { ...p2 };
        p1.x -= (delta / 2) * ux; p1.y -= (delta / 2) * uy;
        p2.x += (delta / 2) * ux; p2.y += (delta / 2) * uy;
        if (keepJoints) {
          moveJointVertex(oldP1, p1, [target.id]);
          moveJointVertex(oldP2, p2, [target.id]);
        }
      } else if (dir === 'end') {
        const oldP1 = { ...p1 };
        p1.x -= delta * ux; p1.y -= delta * uy;
        if (keepJoints) moveJointVertex(oldP1, p1, [target.id]);
      } else {
        const oldP2 = { ...p2 };
        p2.x += delta * ux; p2.y += delta * uy;
        if (keepJoints) moveJointVertex(oldP2, p2, [target.id]);
      }
    }
  } else if (target.type === 'circle') {
    target.r = Math.max(0.1, newVal / 2);
  } else if (target.type === 'arc') {
    if (keepJoints) {
      const p1 = { x: target.cx + target.r * Math.cos(target.a1), y: target.cy + target.r * Math.sin(target.a1) };
      const p2 = { x: target.cx + target.r * Math.cos(target.a2), y: target.cy + target.r * Math.sin(target.a2) };
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const minR = d / 2 + 1e-4;
      const targetR = Math.max(minR, newVal);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const h = Math.sqrt(Math.max(0, targetR * targetR - (d / 2) * (d / 2)));
      const nx = -(p2.y - p1.y) / d;
      const ny = (p2.x - p1.x) / d;

      const dot = (target.cx - mx) * nx + (target.cy - my) * ny;
      const sign = dot >= 0 ? 1 : -1;

      target.cx = mx + sign * h * nx;
      target.cy = my + sign * h * ny;
      target.r = targetR;
      target.a1 = Math.atan2(p1.y - target.cy, p1.x - target.cx);
      target.a2 = Math.atan2(p2.y - target.cy, p2.x - target.cx);
    } else {
      target.r = Math.max(0.1, newVal);
    }
  }

  dim.val = newVal;
  hideSmartDimHUD();
  showToast(`Dimension changed to ${newVal.toFixed(2)} mm (Joints intact)`);
  updateUI();
  render();
}

function applyLineJointMove(target, p1, p2, ux, uy, delta, dir, keepJoints) {
  if (dir === 'center') {
    const oldP1 = { ...p1 }, oldP2 = { ...p2 };
    const hx = (delta / 2) * ux;
    const hy = (delta / 2) * uy;
    target.x1 -= hx; target.y1 -= hy;
    target.x2 += hx; target.y2 += hy;
    if (keepJoints) {
      moveJointVertex(oldP1, { x: target.x1, y: target.y1 }, [target.id]);
      moveJointVertex(oldP2, { x: target.x2, y: target.y2 }, [target.id]);
    }
  } else if (dir === 'end') {
    const oldP1 = { ...p1 };
    target.x1 -= delta * ux;
    target.y1 -= delta * uy;
    if (keepJoints) {
      moveJointVertex(oldP1, { x: target.x1, y: target.y1 }, [target.id]);
    }
  } else {
    const oldP2 = { ...p2 };
    target.x2 += delta * ux;
    target.y2 += delta * uy;
    if (keepJoints) {
      moveJointVertex(oldP2, { x: target.x2, y: target.y2 }, [target.id]);
    }
  }
}

function moveJointVertex(pOld, pNew, excludeIds = [], tol = 0.05) {
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]);

  state.ents.forEach(other => {
    if (excludeSet.has(other.id)) return;

    if (other.type === 'line') {
      if (Math.hypot(other.x1 - pOld.x, other.y1 - pOld.y) <= tol) {
        other.x1 = pNew.x;
        other.y1 = pNew.y;
      }
      if (Math.hypot(other.x2 - pOld.x, other.y2 - pOld.y) <= tol) {
        other.x2 = pNew.x;
        other.y2 = pNew.y;
      }
    } else if (other.type === 'arc') {
      const pStart = { x: other.cx + other.r * Math.cos(other.a1), y: other.cy + other.r * Math.sin(other.a1) };
      const pEnd = { x: other.cx + other.r * Math.cos(other.a2), y: other.cy + other.r * Math.sin(other.a2) };
      if (Math.hypot(pStart.x - pOld.x, pStart.y - pOld.y) <= tol) {
        other.a1 = Math.atan2(pNew.y - other.cy, pNew.x - other.cx);
        other.r = Math.hypot(pNew.x - other.cx, pNew.y - other.cy);
      }
      if (Math.hypot(pEnd.x - pOld.x, pEnd.y - pOld.y) <= tol) {
        other.a2 = Math.atan2(pNew.y - other.cy, pNew.x - other.cx);
        other.r = Math.hypot(pNew.x - other.cx, pNew.y - other.cy);
      }
    } else if (other.type === 'poly') {
      other.pts.forEach(pt => {
        if (Math.hypot(pt.x - pOld.x, pt.y - pOld.y) <= tol) {
          pt.x = pNew.x;
          pt.y = pNew.y;
        }
      });
    }
  });
}

function findNearestPolySegment(poly, wx, wy) {
  const n = poly.pts.length;
  const m = poly.closed ? n : n - 1;
  let bestIdx = 0;
  let bestDist = Infinity;
  let bestP1 = poly.pts[0], bestP2 = poly.pts[1] || poly.pts[0];
  let bestLen = 0;

  for (let i = 0; i < m; i++) {
    const p1 = poly.pts[i];
    const p2 = poly.pts[(i + 1) % n];
    const s = { t: 'L', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    const near = Geo.nearestOnSeg(s, wx, wy);
    if (near.d < bestDist) {
      bestDist = near.d;
      bestIdx = i;
      bestP1 = p1;
      bestP2 = p2;
      bestLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
  }

  return { index: bestIdx, p1: bestP1, p2: bestP2, len: bestLen };
}

function resolveSmartDim(e, wx, wy) {
  if (!e) return null;
  switch (e.type) {
    case 'line': {
      const p1 = { x: e.x1, y: e.y1 };
      const p2 = { x: e.x2, y: e.y2 };
      const val = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      return { type: 'line', targetId: e.id, p1, p2, mid, val, label: `${val.toFixed(2)} mm` };
    }
    case 'poly': {
      const seg = findNearestPolySegment(e, wx, wy);
      const mid = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };
      return {
        type: 'poly_seg',
        targetId: e.id,
        segIndex: seg.index,
        p1: seg.p1,
        p2: seg.p2,
        mid,
        val: seg.len,
        label: `${seg.len.toFixed(2)} mm`
      };
    }
    case 'circle': {
      const val = e.r * 2;
      return { type: 'circle', targetId: e.id, cx: e.cx, cy: e.cy, r: e.r, val, label: `Ø ${val.toFixed(2)} mm` };
    }
    case 'arc': {
      const val = e.r;
      const am = e.a1 + Geo.norm(e.a2 - e.a1) / 2;
      const mid = { x: e.cx + e.r * Math.cos(am), y: e.cy + e.r * Math.sin(am) };
      return { type: 'arc', targetId: e.id, cx: e.cx, cy: e.cy, r: e.r, mid, val, label: `R ${val.toFixed(2)} mm` };
    }
  }
  return null;
}

function renderDimensions() {
  smartDimState.placedDims.forEach(dim => {
    drawDimensionGraphic(dim, '#388bfd', false);
  });

  if (activeTool === 'smart-dim') {
    if (smartDimState.activeDim) {
      drawDimensionGraphic(smartDimState.activeDim, '#00e5ff', true);
    } else if (smartDimState.hoverTarget) {
      drawDimensionGraphic(smartDimState.hoverTarget, '#00e5ff', false);
    }
  }
}

function drawDimensionGraphic(dim, color, isModifying) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = isModifying ? 2 : 1.5;

  if (dim.type === 'line' || dim.type === 'poly_seg') {
    const [sx1, sy1] = toScreen(dim.p1.x, dim.p1.y);
    const [sx2, sy2] = toScreen(dim.p2.x, dim.p2.y);
    const dx = sx2 - sx1, dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) { ctx.restore(); return; }

    const nx = -dy / len;
    const ny = dx / len;
    const offset = 26;

    const d1x = sx1 + nx * offset;
    const d1y = sy1 + ny * offset;
    const d2x = sx2 + nx * offset;
    const d2y = sy2 + ny * offset;

    // Witness lines
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx1 + nx * 4, sy1 + ny * 4);
    ctx.lineTo(d1x + nx * 5, d1y + ny * 5);
    ctx.moveTo(sx2 + nx * 4, sy2 + ny * 4);
    ctx.lineTo(d2x + nx * 5, d2y + ny * 5);
    ctx.stroke();

    // Dimension line
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(d1x, d1y);
    ctx.lineTo(d2x, d2y);
    ctx.stroke();

    drawArrow(d1x, d1y, dx / len, dy / len, 8);
    drawArrow(d2x, d2y, -dx / len, -dy / len, 8);

    const mx = (d1x + d2x) / 2;
    const my = (d1y + d2y) / 2;
    drawDimBadge(dim.label || `${dim.val.toFixed(2)} mm`, mx, my, color, isModifying);
  } else if (dim.type === 'circle') {
    const [scx, scy] = toScreen(dim.cx, dim.cy);
    const sr = dim.r * view.scale;
    const ang = -Math.PI / 4;
    const p1x = scx - sr * Math.cos(ang);
    const p1y = scy - sr * Math.sin(ang);
    const p2x = scx + sr * Math.cos(ang);
    const p2y = scy + sr * Math.sin(ang);

    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    const ux = Math.cos(ang), uy = Math.sin(ang);
    drawArrow(p1x, p1y, ux, uy, 8);
    drawArrow(p2x, p2y, -ux, -uy, 8);

    drawDimBadge(dim.label || `Ø ${(dim.val).toFixed(2)} mm`, scx, scy - 12, color, isModifying);
  } else if (dim.type === 'arc') {
    const [scx, scy] = toScreen(dim.cx, dim.cy);
    const [smx, smy] = toScreen(dim.mid.x, dim.mid.y);

    ctx.beginPath();
    ctx.moveTo(scx, scy);
    ctx.lineTo(smx, smy);
    ctx.stroke();

    const dx = smx - scx, dy = smy - scy;
    const dlen = Math.hypot(dx, dy) || 1;
    drawArrow(smx, smy, -dx / dlen, -dy / dlen, 8);

    drawDimBadge(dim.label || `R ${(dim.val).toFixed(2)} mm`, (scx + smx) / 2, (scy + smy) / 2 - 10, color, isModifying);
  }

  ctx.restore();
}

function drawArrow(x, y, dirX, dirY, size = 8) {
  const perpX = -dirY;
  const perpY = dirX;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dirX * size + perpX * (size / 2.5), y + dirY * size + perpY * (size / 2.5));
  ctx.lineTo(x + dirX * size - perpX * (size / 2.5), y + dirY * size - perpY * (size / 2.5));
  ctx.closePath();
  ctx.fill();
}

function drawDimBadge(text, x, y, color, isModifying) {
  ctx.font = 'bold 12px "Consolas", monospace';
  const textMetrics = ctx.measureText(text);
  const pw = textMetrics.width + 16;
  const ph = 22;
  const bx = x - pw / 2;
  const by = y - ph / 2;

  ctx.fillStyle = '#14171d';
  ctx.strokeStyle = color;
  ctx.lineWidth = isModifying ? 2 : 1.2;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bx, by, pw, ph, 4);
  } else {
    ctx.rect(bx, by, pw, ph);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isModifying ? '#ffffff' : color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/* --------------------------------------------------------------------------
   Explode Geometry (Decompose into Individual Lines and Arcs)
   -------------------------------------------------------------------------- */
function explodeSelection() {
  const selected = state.ents.filter(e => selectedIds.has(e.id));
  if (!selected.length) {
    return showToast('Select a part, square, or polyline to explode');
  }

  let explodedCount = 0;
  pushState();

  const newSelection = new Set();
  const nextEnts = [];

  state.ents.forEach(e => {
    if (selectedIds.has(e.id)) {
      const parts = Geo.explodeEntity(e);
      if (parts && parts.length > 0) {
        explodedCount++;
        parts.forEach(p => {
          p.id = state.nextId++;
          p.layer = e.layer || state.curLayer || '0';
          nextEnts.push(p);
          newSelection.add(p.id);
        });
      } else {
        nextEnts.push(e);
        newSelection.add(e.id);
      }
    } else {
      nextEnts.push(e);
    }
  });

  state.ents = nextEnts;
  selectedIds = newSelection;
  window.selectedIds = selectedIds;

  if (explodedCount > 0) {
    showToast(`Exploded into ${newSelection.size} individual lines and arcs`);
  } else {
    showToast('Selected geometry is already individual lines/arcs');
  }

  updateUI();
  render();
}

/* --------------------------------------------------------------------------
   IGEMS CAM Actions
   -------------------------------------------------------------------------- */
function runAutoCAM() {
  if (!state.ents.length) return showToast('Drawing is empty');
  pushState();

  // 1. Join connected lines into polylines
  const joins = Geo.joinEntities(state.ents, 0.05);
  if (joins.length > 0) {
    const removeIds = new Set();
    joins.forEach(j => {
      j.srcIds.forEach(id => removeIds.add(id));
      addEntity(j.ent);
    });
    state.ents = state.ents.filter(e => !removeIds.has(e.id));
  }

  // 2. Classify inner holes vs outer perimeters
  const analysis = Cam.analyzeContours(state.ents);
  analysis.forEach(item => {
    item.ent.layer = item.isInner ? 'HOLES' : 'PARTS';
  });

  options.showCam = true;
  document.getElementById('toggle-cam').classList.add('active');
  showToast(`Auto CAM applied: ${analysis.length} contours classified & sequenced`);
  updateUI();
  render();
}

function classifyInnerOuter() {
  const analysis = Cam.analyzeContours(state.ents);
  if (!analysis.length) return showToast('No closed contours detected');
  pushState();
  analysis.forEach(item => {
    item.ent.layer = item.isInner ? 'HOLES' : 'PARTS';
  });
  showToast(`Classified ${analysis.filter(a => a.isInner).length} inner holes, ${analysis.filter(a => !a.isInner).length} outer profiles`);
  updateUI();
  render();
}

/* --------------------------------------------------------------------------
   Join Geometry (Inverse of Explode: Turn Chosen Lines/Arcs into One Part)
   -------------------------------------------------------------------------- */
function joinSelection() {
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
  selectedIds = newSelection;
  window.selectedIds = selectedIds;

  const totalJoined = removeIds.size;
  const numParts = joins.length;
  showToast(`Joined ${totalJoined} lines/arcs into ${numParts} unified ${numParts === 1 ? 'part' : 'parts'} (Polyline)`);

  updateUI();
  render();
}

function joinContours() {
  return joinSelection();
}

function checkOpenEnds() {
  const ends = Geo.openEnds(state.ents, 0.05);
  options.openEnds = ends;
  if (ends.length > 0) {
    showToast(`Found ${ends.length} open unclosed contour endpoints (shown in red)`);
  } else {
    showToast('All contours are completely closed!');
  }
  render();
}

function cleanupGeometry() {
  pushState();
  const res = Geo.cleanup(state.ents, 0.01);
  state.ents = res.keep;
  showToast(`Cleanup complete: removed ${res.removed.length} duplicate/zero-length entities`);
  updateUI();
  render();
}

/* --------------------------------------------------------------------------
   DXF Import & Export Logic
   -------------------------------------------------------------------------- */
async function exportDXF(includeCam = false) {
  if (!state.ents.length) return showToast('Nothing to export');

  let dxfEnts = [...state.ents];

  if (includeCam) {
    // Generate CAM toolpaths, lead-ins, rapids as DXF layers
    const toolpath = Cam.buildToolpath(state.ents, {
      type: document.getElementById('cam-lead-type').value,
      inLen: parseFloat(document.getElementById('cam-lead-len').value) || 3.0,
      inRadius: parseFloat(document.getElementById('cam-lead-rad').value) || 2.0,
      outLen: parseFloat(document.getElementById('cam-lead-out').value) || 1.5
    });

    // Add lead-in / lead-out segments to DXF
    toolpath.cuts.forEach(cut => {
      cut.leadIn.forEach(s => {
        dxfEnts.push({ ...Geo.entFromSegs([s], false), layer: 'LEADS' });
      });
      cut.leadOut.forEach(s => {
        dxfEnts.push({ ...Geo.entFromSegs([s], false), layer: 'LEADS' });
      });
    });
  }

  const dxfContent = Dxf.toDXF(dxfEnts, state.layers, state.units);

  // If running inside Electron desktop app
  if (window.electronAPI && window.electronAPI.saveFileDialog) {
    const filePath = await window.electronAPI.saveFileDialog(includeCam ? 'cam_toolpath.dxf' : 'drawing.dxf');
    if (filePath) {
      const res = await window.electronAPI.saveFileContent(filePath, dxfContent);
      if (res.success) {
        showToast(`Saved DXF: ${filePath}`);
      } else {
        showToast(`Error saving DXF: ${res.error}`);
      }
    }
  } else {
    // Browser download fallback
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = includeCam ? 'cam_part.dxf' : 'drawing.dxf';
    a.click();
    showToast('DXF downloaded');
  }
}

async function openDXF() {
  if (window.electronAPI && window.electronAPI.openFileDialog) {
    const result = await window.electronAPI.openFileDialog();
    if (result && result.content) {
      loadDxfText(result.content, result.fileName);
    }
  } else {
    // Browser file picker
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

function loadDxfText(text, name = 'drawing.dxf') {
  const parsed = Dxf.parseDXF(text);
  if (!parsed.ents.length) return showToast('No supported entities found in DXF');

  pushState();
  state.ents = [];
  state.nextId = 1;
  selectedIds.clear();

  // Merge layers
  Object.entries(parsed.layers).forEach(([layName, aci]) => {
    if (!state.layers.some(l => l.name === layName)) {
      state.layers.push({ name: layName, aci: aci || 7, visible: true });
    }
  });

  parsed.ents.forEach(addEntity);
  zoomFit();
  updateUI();
  showToast(`Imported ${parsed.ents.length} objects from ${name}`);
}

/* --------------------------------------------------------------------------
   Rendering Engine (1x1mm Grid, CAM, Snaps)
   -------------------------------------------------------------------------- */
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1b1d22';
  ctx.fillRect(0, 0, width, height);

  // 1. Strictly 1x1mm Grid
  if (options.grid) {
    const [x0, y0] = toWorld(0, height);
    const [x1, y1] = toWorld(width, 0);
    ctx.lineWidth = 1;

    // Draw 1mm lines when scale allows, major lines at 5mm and 10mm
    const show1mm = view.scale >= 2.0;

    for (let i = Math.floor(x0); i <= Math.ceil(x1); i++) {
      if (!show1mm && (i % 5 !== 0)) continue;
      const sx = Math.round(i * view.scale + view.panX) + 0.5;
      ctx.strokeStyle = (i % 10 === 0) ? '#383e4a' : ((i % 5 === 0) ? '#282d36' : '#1f2228');
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
    }

    for (let j = Math.floor(y0); j <= Math.ceil(y1); j++) {
      if (!show1mm && (j % 5 !== 0)) continue;
      const sy = Math.round(view.panY - j * view.scale) + 0.5;
      ctx.strokeStyle = (j % 10 === 0) ? '#383e4a' : ((j % 5 === 0) ? '#282d36' : '#1f2228');
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
    }
  }

  // 2. Axes
  const [ox, oy] = toScreen(0, 0);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#853232'; // X axis red
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(width, oy); ctx.stroke();
  ctx.strokeStyle = '#327d42'; // Y axis green
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, height); ctx.stroke();

  // 3. Drawing Entities
  const layMap = {};
  state.layers.forEach(l => { layMap[l.name] = l; });

  state.ents.forEach(e => {
    const lay = layMap[e.layer] || { visible: true, aci: 7 };
    if (!lay.visible) return;

    const isSel = selectedIds.has(e.id);
    const col = isSel ? '#00bfff' : getColor(lay.aci);
    renderEntity(e, col, isSel ? 2.5 : 1.6, isSel ? [6, 4] : []);
  });

  // 4. IGEMS CAM Toolpath Simulation (Leads, Rapids, Cut Numbers)
  if (options.showCam && state.ents.length > 0) {
    renderCamToolpath();
  }

  // 5. Open Ends Highlights
  if (options.openEnds.length > 0) {
    ctx.strokeStyle = '#ff3333';
    ctx.fillStyle = 'rgba(255, 50, 50, 0.3)';
    ctx.lineWidth = 2;
    options.openEnds.forEach(p => {
      const [sx, sy] = toScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // 6. Interactive Drawing Preview
  renderPreview();

  // 6b. SolidWorks Smart Dimensions Display
  renderDimensions();

  // 7. Snap Marker
  if (activeSnap) {
    const [sx, sy] = toScreen(mouseWorld.x, mouseWorld.y);
    ctx.strokeStyle = '#39c5cf';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 5, sy - 5, 10, 10);
  }

  // 8. Box Selection Rectangle
  if (dragAction && dragAction.type === 'box') {
    const x = Math.min(dragAction.x0, mouseScreen.x);
    const y = Math.min(dragAction.y0, mouseScreen.y);
    const w = Math.abs(mouseScreen.x - dragAction.x0);
    const h = Math.abs(mouseScreen.y - dragAction.y0);
    const isWindow = mouseScreen.x > dragAction.x0;
    ctx.fillStyle = isWindow ? 'rgba(56, 139, 253, 0.15)' : 'rgba(57, 197, 207, 0.15)';
    ctx.strokeStyle = isWindow ? '#388bfd' : '#39c5cf';
    ctx.setLineDash(isWindow ? [] : [5, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

function renderEntity(e, color, lw = 1.5, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash(dash);
  ctx.beginPath();

  switch (e.type) {
    case 'line': {
      const [x1, y1] = toScreen(e.x1, e.y1);
      const [x2, y2] = toScreen(e.x2, e.y2);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      break;
    }
    case 'circle': {
      const [cx, cy] = toScreen(e.cx, e.cy);
      ctx.arc(cx, cy, e.r * view.scale, 0, Math.PI * 2);
      break;
    }
    case 'arc': {
      const [cx, cy] = toScreen(e.cx, e.cy);
      ctx.arc(cx, cy, e.r * view.scale, -e.a1, -e.a2, true);
      break;
    }
    case 'poly': {
      const segs = Geo.segsOf(e);
      segs.forEach((s, idx) => {
        if (s.t === 'L') {
          const [sx, sy] = toScreen(s.x1, s.y1);
          const [ex, ey] = toScreen(s.x2, s.y2);
          if (idx === 0) ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
        } else {
          const [cx, cy] = toScreen(s.cx, s.cy);
          ctx.arc(cx, cy, s.r * view.scale, -s.a0, -s.a1, !s.ccw);
        }
      });
      if (e.closed) ctx.closePath();
      break;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderCamToolpath() {
  const toolpath = Cam.buildToolpath(state.ents, {
    type: document.getElementById('cam-lead-type').value,
    inLen: parseFloat(document.getElementById('cam-lead-len').value) || 3.0,
    inRadius: parseFloat(document.getElementById('cam-lead-rad').value) || 2.0,
    outLen: parseFloat(document.getElementById('cam-lead-out').value) || 1.5
  });

  // 1. Rapid Traverse Lines (G0)
  ctx.strokeStyle = '#c678dd';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  toolpath.rapids.forEach(r => {
    const [x1, y1] = toScreen(r.from.x, r.from.y);
    const [x2, y2] = toScreen(r.to.x, r.to.y);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 2. Leads and Sequence Numbers
  toolpath.cuts.forEach(cut => {
    cut.leadIn.forEach(s => {
      const e = Geo.entFromSegs([s], false);
      renderEntity(e, '#e5c07b', 2.0);
    });

    cut.leadOut.forEach(s => {
      const e = Geo.entFromSegs([s], false);
      renderEntity(e, '#d19a66', 2.0);
    });

    if (cut.leadIn.length > 0) {
      const pt = Geo.segStart(cut.leadIn[0]);
      const [px, py] = toScreen(pt.x, pt.y);
      ctx.fillStyle = '#98c379';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const startPt = Geo.segStart(cut.geometry[0]);
    const [bx, by] = toScreen(startPt.x, startPt.y);
    ctx.fillStyle = '#61afef';
    ctx.beginPath();
    ctx.arc(bx - 12, by - 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e2227';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cut.order, bx - 12, by - 12);
  });
}

function renderPreview() {
  if (!activePoints.length) return;
  const p0 = activePoints[activePoints.length - 1];
  const pCur = mouseWorld;

  ctx.strokeStyle = '#e5c07b';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();

  switch (activeTool) {
    case 'line': {
      const [x1, y1] = toScreen(p0.x, p0.y);
      const [x2, y2] = toScreen(pCur.x, pCur.y);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      break;
    }
    case 'poly': {
      activePoints.forEach((p, i) => {
        const [sx, sy] = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      const [cx, cy] = toScreen(pCur.x, pCur.y);
      ctx.lineTo(cx, cy);
      break;
    }
    case 'rect': {
      const [x1, y1] = toScreen(p0.x, p0.y);
      const [x2, y2] = toScreen(pCur.x, pCur.y);
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      break;
    }
    case 'circle': {
      const [cx, cy] = toScreen(p0.x, p0.y);
      const r = Geo.dist(p0, pCur) * view.scale;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    }
    case 'arc': {
      if (activePoints.length === 2) {
        const a = createArc3(activePoints[0], activePoints[1], pCur);
        if (a) {
          const [cx, cy] = toScreen(a.cx, a.cy);
          ctx.arc(cx, cy, a.r * view.scale, -a.a1, -a.a2, true);
        }
      }
      break;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/* --------------------------------------------------------------------------
   UI Panels & Live Property / Dimension Editor
   -------------------------------------------------------------------------- */
function updateUI() {
  // Layers
  const layerContainer = document.getElementById('layers-container');
  layerContainer.innerHTML = '';
  state.layers.forEach(l => {
    const div = document.createElement('div');
    div.className = `layer-item ${l.name === state.curLayer ? 'active' : ''}`;
    div.innerHTML = `
      <input type="checkbox" ${l.visible ? 'checked' : ''} title="Visibility">
      <span class="color-swatch" style="background: ${getColor(l.aci)}"></span>
      <span style="flex:1;">${l.name}</span>
    `;
    div.querySelector('input').onclick = e => {
      e.stopPropagation();
      l.visible = e.target.checked;
      render();
    };
    div.onclick = () => {
      state.curLayer = l.name;
      updateUI();
    };
    layerContainer.appendChild(div);
  });

  // Entity Properties & Interactive Dimension Editor
  const propBox = document.getElementById('selection-properties');
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
    }

    propBox.innerHTML = html;

    // Attach listeners for live dimension modification
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
      inRad.onchange = () => {
        pushState();
        e.r = Math.max(0.1, parseFloat(inRad.value) || 1);
        if (inDia) inDia.value = (e.r * 2).toFixed(3);
        render();
      };
      if (inDia) {
        inDia.onchange = () => {
          pushState();
          e.r = Math.max(0.05, (parseFloat(inDia.value) || 2) / 2);
          inRad.value = e.r.toFixed(3);
          render();
        };
      }
    }

    const btnExplode = document.getElementById('btn-prop-explode');
    if (btnExplode) {
      btnExplode.onclick = explodeSelection;
    }
  } else {
    propBox.innerHTML = `
      <div style="color: var(--accent-blue); font-size: 12px; margin-bottom: 8px;">${sel.length} objects selected</div>
      <button id="btn-prop-join" class="btn-primary prop-action-btn" style="background: #238636; border-color: #2ea043; margin-bottom: 6px;">🔗 Join Chosen into One Part (J)</button>
      <button id="btn-prop-explode" class="btn-secondary prop-action-btn">💥 Explode All Selected (X)</button>
    `;
    const btnPropJoin = document.getElementById('btn-prop-join');
    if (btnPropJoin) btnPropJoin.onclick = joinSelection;
    const btnPropExplode = document.getElementById('btn-prop-explode');
    if (btnPropExplode) btnPropExplode.onclick = explodeSelection;
  }
}

/* --------------------------------------------------------------------------
   Event Listeners (Mouse, Pan, Zoom, Keyboard)
   -------------------------------------------------------------------------- */
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const res = resolvePoint(mouseScreen.x, mouseScreen.y);
  mouseWorld = res.p;
  activeSnap = res.snap;

  // Middle-click or Space+Left-click: Pan
  if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
    dragAction = { type: 'pan', x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
    return;
  }

  if (e.button === 0) {
    if (activeTool === 'smart-dim') {
      const hit = pickEntity(mouseScreen.x, mouseScreen.y);
      if (hit) {
        const dim = resolveSmartDim(hit, mouseWorld.x, mouseWorld.y);
        if (dim) {
          showSmartDimHUD(dim);
          render();
        }
      }
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
        dragAction = { type: 'box', x0: mouseScreen.x, y0: mouseScreen.y, shift: e.shiftKey };
      }
    } else {
      handlePointInput(mouseWorld);
    }
  }
});

window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const res = resolvePoint(mouseScreen.x, mouseScreen.y);
  mouseWorld = res.p;
  activeSnap = res.snap;

  coordDisplay.textContent = `X: ${mouseWorld.x.toFixed(3)}  Y: ${mouseWorld.y.toFixed(3)}`;

  if (activeTool === 'smart-dim') {
    const hit = pickEntity(mouseScreen.x, mouseScreen.y);
    smartDimState.hoverTarget = hit ? resolveSmartDim(hit, mouseWorld.x, mouseWorld.y) : null;
  }

  if (dragAction && dragAction.type === 'pan') {
    view.panX = dragAction.panX + (e.clientX - dragAction.x);
    view.panY = dragAction.panY + (e.clientY - dragAction.y);
    render();
  } else {
    render();
  }
});

window.addEventListener('mouseup', e => {
  if (dragAction) {
    if (dragAction.type === 'box') {
      const [x0, y0] = toWorld(dragAction.x0, dragAction.y0);
      const [x1, y1] = toWorld(mouseScreen.x, mouseScreen.y);
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
      const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      const isWindow = mouseScreen.x > dragAction.x0;

      if (!dragAction.shift) selectedIds.clear();
      state.ents.forEach(ent => {
        const bb = Geo.bbox(ent);
        const inside = bb[0] >= minX && bb[2] <= maxX && bb[1] >= minY && bb[3] <= maxY;
        const touch = !(bb[2] < minX || bb[0] > maxX || bb[3] < minY || bb[1] > maxY);
        if (isWindow ? inside : touch) selectedIds.add(ent.id);
      });
      updateUI();
    }
    dragAction = null;
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

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const ctrl = e.ctrlKey || e.metaKey;

  if (e.key === ' ') isSpacePressed = true;
  if (e.key === 'Escape') {
    activePoints = [];
    selectedIds.clear();
    hideManualInputHUD();
    setTool('select');
  }
  if (e.key === 'Enter') {
    if (activeTool === 'poly') finishPolyline(false);
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedIds.size > 0) {
      pushState();
      state.ents = state.ents.filter(e => !selectedIds.has(e.id));
      selectedIds.clear();
      showToast('Deleted selected entities');
      updateUI();
      render();
    }
  }
  // Keyboard shortcut D: SolidWorks Smart Dimension
  if (e.key.toLowerCase() === 'd' && !ctrl && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    setTool('smart-dim');
  }
  // Keyboard shortcut X: Explode geometry
  if (e.key.toLowerCase() === 'x' && !ctrl) {
    e.preventDefault();
    explodeSelection();
  }
  // Keyboard shortcut J: Join chosen lines and arcs into one part (inverse of Explode)
  if (e.key.toLowerCase() === 'j' && !ctrl) {
    e.preventDefault();
    joinSelection();
  }
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); exportDXF(false); }
  if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openDXF(); }
  if (e.key === 'Home') zoomFit();
  if (e.key === 'F3') { options.osnap = !options.osnap; document.getElementById('toggle-osnap').classList.toggle('active', options.osnap); }
  if (e.key === 'F4') { options.gsnap = !options.gsnap; document.getElementById('toggle-gsnap').classList.toggle('active', options.gsnap); }
  if (e.key === 'F7') { options.grid = !options.grid; document.getElementById('toggle-grid').classList.toggle('active', options.grid); render(); }
  if (e.key === 'F8') { options.ortho = !options.ortho; document.getElementById('toggle-ortho').classList.toggle('active', options.ortho); }
});

window.addEventListener('keyup', e => {
  if (e.key === ' ') isSpacePressed = false;
});

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

// Tool Buttons
document.querySelectorAll('.ribbon-btn[data-tool]').forEach(btn => {
  btn.onclick = () => setTool(btn.dataset.tool);
});

// Action Buttons
document.getElementById('btn-new').onclick = () => {
  if (confirm('Create new drawing?')) {
    pushState();
    state.ents = [];
    selectedIds.clear();
    activePoints = [];
    render();
    updateUI();
  }
};
document.getElementById('btn-open').onclick = openDXF;
document.getElementById('btn-save-dxf').onclick = () => exportDXF(false);
document.getElementById('btn-export-cam-dxf').onclick = () => exportDXF(true);
document.getElementById('btn-undo').onclick = undo;
document.getElementById('btn-redo').onclick = redo;
document.getElementById('btn-zoom-fit').onclick = zoomFit;
document.getElementById('btn-auto-cam').onclick = runAutoCAM;
document.getElementById('btn-detect-holes').onclick = classifyInnerOuter;
const btnJoin = document.getElementById('btn-join');
if (btnJoin) btnJoin.onclick = joinSelection;
const btnJoinDraw = document.getElementById('btn-join-draw');
if (btnJoinDraw) btnJoinDraw.onclick = joinSelection;
document.getElementById('btn-explode').onclick = explodeSelection;
const btnExplodeMod = document.getElementById('btn-explode-mod');
if (btnExplodeMod) btnExplodeMod.onclick = explodeSelection;
document.getElementById('btn-check-open').onclick = checkOpenEnds;
document.getElementById('btn-cleanup').onclick = cleanupGeometry;
document.getElementById('btn-delete').onclick = () => {
  if (selectedIds.size > 0) {
    pushState();
    state.ents = state.ents.filter(e => !selectedIds.has(e.id));
    selectedIds.clear();
    updateUI();
    render();
  }
};
document.getElementById('btn-reverse-dir').onclick = () => {
  const sel = state.ents.filter(e => selectedIds.has(e.id));
  if (!sel.length) return showToast('Select entity to reverse direction');
  pushState();
  sel.forEach(e => Object.assign(e, Geo.reverseEntity(e)));
  showToast('Cutting direction reversed');
  render();
};

// Ribbon Manual Dimensions Button
const btnManualInput = document.getElementById('btn-manual-input');
if (btnManualInput) {
  btnManualInput.onclick = () => {
    showManualInputHUD('rect', mouseWorld);
  };
}

/* ==========================================================================
   Parametric Part Library Controller (IGEMS Standard Shapes)
   ========================================================================== */
let activePartId = 'flange';
let currentPartValues = {};

function initPartLibraryUI() {
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

  // Close on Escape or click on background backdrop
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

function openPartLibraryModal() {
  const modal = document.getElementById('part-library-modal');
  if (!modal || !window.Parts) return;
  modal.style.display = 'flex';

  // Set default insertion coordinates
  const insX = document.getElementById('part-ins-x');
  const insY = document.getElementById('part-ins-y');
  if (insX && insY) {
    insX.value = Math.round(mouseWorld.x || 0);
    insY.value = Math.round(mouseWorld.y || 0);
  }

  renderPartCatalog();
  selectPart(activePartId || (window.Parts.CATALOG[0] && window.Parts.CATALOG[0].id));
}

function renderPartCatalog() {
  const catalogList = document.getElementById('part-catalog-list');
  if (!catalogList || !window.Parts) return;

  catalogList.innerHTML = '';
  window.Parts.CATALOG.forEach(part => {
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

function selectPart(partId) {
  activePartId = partId;
  const part = window.Parts.CATALOG.find(p => p.id === partId);
  if (!part) return;

  // Highlight active catalog item
  const items = document.querySelectorAll('.part-cat-item');
  window.Parts.CATALOG.forEach((p, idx) => {
    if (items[idx]) {
      items[idx].classList.toggle('active', p.id === partId);
    }
  });

  const titleEl = document.getElementById('part-current-title');
  if (titleEl) titleEl.textContent = `${part.name} Dimensions`;

  // Initialize or retain parameter values
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

function renderPartPreview() {
  const canvas = document.getElementById('part-preview-canvas');
  if (!canvas || !window.Parts) return;
  const pctx = canvas.getContext('2d');

  // Match physical canvas pixel dimensions
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

  const part = window.Parts.CATALOG.find(p => p.id === activePartId);
  if (!part) return;

  // Generate entities centered at origin (0, 0)
  let ents = [];
  try {
    ents = part.generator(currentPartValues, 0, 0);
  } catch (err) {
    console.error('Error generating part preview:', err);
    return;
  }

  if (!ents || !ents.length) return;

  // Calculate bounding box
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

  // Auto-fit scale with margin
  const margin = 40 * dpr;
  const scale = Math.min((w - margin * 2) / bw, (h - margin * 2) / bh);

  function ptToPrev(px, py) {
    return [
      w / 2 + (px - cx) * scale,
      h / 2 - (py - cy) * scale
    ];
  }

  // Draw entities
  ents.forEach(e => {
    const isHole = (e.layer === 'HOLES');
    pctx.strokeStyle = isHole ? '#33e0ff' : '#4dff6a';
    pctx.lineWidth = Math.max(1.5, 2.0 * dpr);
    pctx.beginPath();

    switch (e.type) {
      case 'line': {
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

  // Dimension overlay text
  pctx.fillStyle = '#9aa5b5';
  pctx.font = `${Math.round(12 * dpr)}px sans-serif`;
  pctx.fillText(`${bw.toFixed(1)} × ${bh.toFixed(1)} mm`, 14 * dpr, h - 14 * dpr);
}

function insertSelectedPart() {
  const part = window.Parts.CATALOG.find(p => p.id === activePartId);
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

  updateUI();
  render();
}

// Bottom Status Toggles
document.getElementById('toggle-osnap').onclick = e => {
  options.osnap = !options.osnap;
  e.target.classList.toggle('active', options.osnap);
};
document.getElementById('toggle-gsnap').onclick = e => {
  options.gsnap = !options.gsnap;
  e.target.classList.toggle('active', options.gsnap);
};
document.getElementById('toggle-grid').onclick = e => {
  options.grid = !options.grid;
  e.target.classList.toggle('active', options.grid);
  render();
};
document.getElementById('toggle-ortho').onclick = e => {
  options.ortho = !options.ortho;
  e.target.classList.toggle('active', options.ortho);
};
document.getElementById('toggle-cam').onclick = e => {
  options.showCam = !options.showCam;
  e.target.classList.toggle('active', options.showCam);
  render();
};

// Initialize
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
initPartLibraryUI();
initSmartDimensionsUI();
updateUI();
updatePrompt();
render();

// Debug / automation hooks
window.explodeSelection = explodeSelection;
window.joinSelection = joinSelection;
window.applySmartDimension = applySmartDimension;
window.smartDimState = smartDimState;
window.showSmartDimHUD = showSmartDimHUD;
window.resolveSmartDim = resolveSmartDim;
window.getActiveTool = () => activeTool;
window.setTool = setTool;
