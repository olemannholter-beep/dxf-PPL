/**
 * SolidWorks Inspired Smart Dimension Tool
 * Measures and modifies lines, polylines, circles, arcs, angles, and point-to-point distances
 * while preserving joint topology and orthogonal box translations.
 */
import { Geo } from '../core.js';
import { state, pushState, setTool, getCallbacks } from '../state.js';
import { toScreen, render, pickEntity } from '../viewport.js';
import { showToast } from '../ui/toast.js';

export const smartDimState = {
  activeDim: null,
  activeDir: 'start', // 'start' (grow end), 'end' (grow start), 'center' (symmetric)
  hoverTarget: null,
  mode: null, // null | 'points' | 'angle' | 'circle_diameter' | 'circle_radius' | 'line'
  point1: null,
  angleLine1: null,
  get placedDims() {
    if (!state.dimensions) state.dimensions = [];
    return state.dimensions;
  },
  set placedDims(val) {
    state.dimensions = val;
  }
};

// UI Elements
let smartDimHud, dimHudVal, dimHudPrefix, dimHudLabel, dimHudCloseBtn, dimHudApplyBtn, dimHudCancelBtn;
let dimHudJointLock, dimHudOrthoBox, dimHudOrthoBoxRow, dimDirBtns, smartDimModeMenu;

export function initSmartDimensionsUI() {
  smartDimHud = document.getElementById('smart-dim-hud');
  dimHudVal = document.getElementById('dim-hud-val');
  dimHudPrefix = document.getElementById('dim-hud-prefix');
  dimHudLabel = document.getElementById('dim-hud-label');
  dimHudCloseBtn = document.getElementById('dim-hud-close-btn');
  dimHudApplyBtn = document.getElementById('dim-hud-apply-btn');
  dimHudCancelBtn = document.getElementById('dim-hud-cancel-btn');
  dimHudJointLock = document.getElementById('dim-hud-joint-lock');
  dimHudOrthoBox = document.getElementById('dim-hud-ortho-box');
  dimHudOrthoBoxRow = document.getElementById('dim-hud-ortho-box-row');
  dimDirBtns = document.querySelectorAll('.dim-dir-btn');

  const dimHudDeleteBtn = document.getElementById('dim-hud-delete-btn');
  if (dimHudDeleteBtn) dimHudDeleteBtn.onclick = deleteCurrentSmartDim;

  smartDimModeMenu = document.getElementById('smart-dim-mode-menu');
  if (smartDimModeMenu) {
    smartDimModeMenu.querySelectorAll('.dim-menu-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        setSmartDimMode(item.dataset.mode);
      };
    });
  }

  // Dismiss mode menu when clicking outside
  window.addEventListener('mousedown', e => {
    if (smartDimModeMenu && smartDimModeMenu.style.display !== 'none') {
      if (!smartDimModeMenu.contains(e.target)) {
        hideSmartDimModeMenu();
      }
    }
  });

  const btnSmartDim = document.getElementById('btn-smart-dim');
  if (btnSmartDim) {
    btnSmartDim.onclick = () => {
      setTool('smart-dim');
      smartDimState.mode = 'points';
      smartDimState.point1 = null;
      smartDimState.angleLine1 = null;
      showToast('Smart Dimension: Left-click point 1, then point 2. Right-click for mode menu.');
      getCallbacks().updatePrompt();
    };
    btnSmartDim.addEventListener('contextmenu', e => {
      e.preventDefault();
      const rect = btnSmartDim.getBoundingClientRect();
      showSmartDimModeMenu(rect.left, rect.bottom + 6);
    });
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

export function showSmartDimModeMenu(clientX, clientY) {
  if (!smartDimModeMenu) smartDimModeMenu = document.getElementById('smart-dim-mode-menu');
  if (!smartDimModeMenu) return;

  const left = Math.min(Math.max(10, clientX), window.innerWidth - 270);
  const top = Math.min(Math.max(10, clientY), window.innerHeight - 280);

  smartDimModeMenu.style.left = left + 'px';
  smartDimModeMenu.style.top = top + 'px';
  smartDimModeMenu.style.display = 'flex';

  const items = smartDimModeMenu.querySelectorAll('.dim-menu-item');
  items.forEach(item => {
    item.classList.toggle('active', item.dataset.mode === smartDimState.mode);
  });
}

export function hideSmartDimModeMenu() {
  if (!smartDimModeMenu) smartDimModeMenu = document.getElementById('smart-dim-mode-menu');
  if (smartDimModeMenu) smartDimModeMenu.style.display = 'none';
}

export function setSmartDimMode(mode) {
  smartDimState.mode = mode;
  smartDimState.point1 = null;
  smartDimState.angleLine1 = null;
  hideSmartDimModeMenu();

  const labels = {
    points: 'Point to Point: Left-click 2 points to measure distance (Right-click for menu)',
    angle: 'Measure Angle: Left-click line 1, then line 2 to measure included angle',
    circle_diameter: 'Circle Diameter (Ø): Left-click any circle to measure full diameter',
    circle_radius: 'Circle/Arc Radius (R): Left-click any circle or arc to measure radius',
    line: 'Measure Full Line: Left-click any line or polyline edge',
    auto: 'Smart Detect: Left-click points or entities to measure'
  };

  showToast(`Mode: ${labels[mode] || mode}`);
  getCallbacks().updatePrompt();
  getCallbacks().render();
  render();
}

export function showSmartDimHUD(dim) {
  smartDimState.activeDim = dim;
  if (!smartDimHud) return;

  smartDimState.activeDir = 'start';
  if (dimDirBtns) {
    dimDirBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.dir === 'start');
    });
  }

  let sx = window.innerWidth / 2, sy = window.innerHeight / 2;
  if (dim.center) {
    const s = toScreen(dim.center.x, dim.center.y);
    sx = s[0]; sy = s[1];
  } else if (dim.mid) {
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

  const left = Math.min(Math.max(15, sx + 25), window.innerWidth - 290);
  const top = Math.min(Math.max(15, sy - 60), window.innerHeight - 250);
  smartDimHud.style.left = left + 'px';
  smartDimHud.style.top = top + 'px';
  smartDimHud.style.display = 'flex';

  const dimHudUnit = document.getElementById('dim-hud-unit');

  if (dim.type === 'circle' && dim.subtype === 'radius') {
    dimHudPrefix.textContent = 'R';
    dimHudLabel.textContent = 'Modify Radius';
    if (dimHudUnit) dimHudUnit.textContent = 'mm';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else if (dim.type === 'circle') {
    dimHudPrefix.textContent = 'Ø';
    dimHudLabel.textContent = 'Modify Diameter';
    if (dimHudUnit) dimHudUnit.textContent = 'mm';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else if (dim.type === 'arc') {
    dimHudPrefix.textContent = 'R';
    dimHudLabel.textContent = 'Modify Radius';
    if (dimHudUnit) dimHudUnit.textContent = 'mm';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else if (dim.type === 'angle') {
    dimHudPrefix.textContent = '∠';
    dimHudLabel.textContent = 'Modify Angle';
    if (dimHudUnit) dimHudUnit.textContent = '°';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else if (dim.type === 'points') {
    dimHudPrefix.textContent = 'D1';
    dimHudLabel.textContent = 'Modify Distance';
    if (dimHudUnit) dimHudUnit.textContent = 'mm';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'none';
  } else {
    dimHudPrefix.textContent = 'D1';
    dimHudLabel.textContent = 'Modify Length';
    if (dimHudUnit) dimHudUnit.textContent = 'mm';
    if (dimHudOrthoBoxRow) dimHudOrthoBoxRow.style.display = 'flex';
  }

  const formatted = (dim.val % 1 === 0) ? dim.val.toFixed(0) : (dim.type === 'angle' ? dim.val.toFixed(1) : dim.val.toFixed(2));
  dimHudVal.value = formatted;
  setTimeout(() => {
    dimHudVal.focus();
    dimHudVal.select();
  }, 30);
}

export function hideSmartDimHUD() {
  smartDimState.activeDim = null;
  if (smartDimHud) smartDimHud.style.display = 'none';
  getCallbacks().render();
  render();
}

export function deleteCurrentSmartDim() {
  if (!smartDimState.activeDim) return;
  const targetId = smartDimState.activeDim.id;
  pushState();
  smartDimState.placedDims = smartDimState.placedDims.filter(d => d.id !== targetId);
  hideSmartDimHUD();
  showToast('Dimension annotation deleted');
  getCallbacks().updateUI();
  getCallbacks().render();
  render();
}

export function applyCurrentSmartDim() {
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

export function applySmartDimension(dim, newVal, opts = {}) {
  const oldVal = dim.val;
  if (Math.abs(newVal - oldVal) < 1e-5) {
    hideSmartDimHUD();
    return;
  }

  const keepJoints = (opts.keepJoints !== false);
  const moveOrtho = (opts.moveOrtho !== false);
  const dir = opts.dir || 'start';

  // 1. Point-to-Point Dimension
  if (dim.type === 'points') {
    pushState();
    const p1 = { ...dim.p1 };
    const p2 = { ...dim.p2 };
    const curLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (curLen < 1e-9) return;
    const delta = newVal - curLen;
    const ux = (p2.x - p1.x) / curLen;
    const uy = (p2.y - p1.y) / curLen;

    if (dir === 'center') {
      const hx = (delta / 2) * ux;
      const hy = (delta / 2) * uy;
      const newP1 = { x: p1.x - hx, y: p1.y - hy };
      const newP2 = { x: p2.x + hx, y: p2.y + hy };
      if (keepJoints) {
        moveJointVertex(p1, newP1);
        moveJointVertex(p2, newP2);
      }
      dim.p1 = newP1;
      dim.p2 = newP2;
    } else if (dir === 'end') {
      const newP1 = { x: p1.x - delta * ux, y: p1.y - delta * uy };
      if (keepJoints) {
        moveJointVertex(p1, newP1);
      }
      dim.p1 = newP1;
    } else {
      const newP2 = { x: p2.x + delta * ux, y: p2.y + delta * uy };
      if (keepJoints) {
        moveJointVertex(p2, newP2);
      }
      dim.p2 = newP2;
    }
    dim.val = newVal;
    dim.label = `${newVal.toFixed(2)} mm`;
    dim.mid = { x: (dim.p1.x + dim.p2.x) / 2, y: (dim.p1.y + dim.p2.y) / 2 };
    hideSmartDimHUD();
    showToast(`Dimension changed to ${newVal.toFixed(2)} mm (Joints intact)`);
    getCallbacks().updateUI();
    render();
    return;
  }

  // 2. Angle Dimension
  if (dim.type === 'angle') {
    const target2 = state.ents.find(e => e.id === dim.targetId2);
    if (!target2 || (target2.type !== 'line' && target2.type !== 'bend')) {
      hideSmartDimHUD();
      return;
    }
    pushState();
    const deltaDeg = newVal - dim.val;
    const rad = (deltaDeg * Math.PI) / 180;
    const cx = dim.center.x, cy = dim.center.y;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);

    const old1 = { x: target2.x1, y: target2.y1 };
    const old2 = { x: target2.x2, y: target2.y2 };
    const new1 = {
      x: cx + (old1.x - cx) * cosA - (old1.y - cy) * sinA,
      y: cy + (old1.x - cx) * sinA + (old1.y - cy) * cosA
    };
    const new2 = {
      x: cx + (old2.x - cx) * cosA - (old2.y - cy) * sinA,
      y: cy + (old2.x - cx) * sinA + (old2.y - cy) * cosA
    };

    target2.x1 = new1.x; target2.y1 = new1.y;
    target2.x2 = new2.x; target2.y2 = new2.y;

    if (keepJoints) {
      moveJointVertex(old1, new1, [target2.id]);
      moveJointVertex(old2, new2, [target2.id]);
    }

    dim.ang2 += rad;
    dim.val = newVal;
    dim.label = `${newVal.toFixed(1)}°`;
    hideSmartDimHUD();
    showToast(`Angle changed to ${newVal.toFixed(1)}° (Joints intact)`);
    getCallbacks().updateUI();
    render();
    return;
  }

  // 3. Entity-bound Dimensions (Line, Poly segment, Arc, Circle, Bend)
  const target = state.ents.find(e => e.id === dim.targetId);
  if (!target) {
    hideSmartDimHUD();
    return;
  }

  pushState();

  if (target.type === 'line' || target.type === 'bend') {
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
      if (dir === 'center') {
        const hx = (delta / 2) * ux;
        const hy = (delta / 2) * uy;
        const oldP1 = { ...p1 }, oldP2 = { ...p2 };
        const newP1 = { x: p1.x - hx, y: p1.y - hy };
        const newP2 = { x: p2.x + hx, y: p2.y + hy };

        const connectedP1 = state.ents.filter(o => {
          if (o.id === target.id || (o.type !== 'line' && o.type !== 'bend')) return false;
          const touches = Math.hypot(o.x1 - p1.x, o.y1 - p1.y) < 0.05 ||
                          Math.hypot(o.x2 - p1.x, o.y2 - p1.y) < 0.05;
          if (!touches) return false;
          const oIsH = Math.abs(o.y2 - o.y1) < 1e-4;
          const oIsV = Math.abs(o.x2 - o.x1) < 1e-4;
          return (isH && oIsV) || (isV && oIsH);
        });

        const connectedP2 = state.ents.filter(o => {
          if (o.id === target.id || (o.type !== 'line' && o.type !== 'bend')) return false;
          const touches = Math.hypot(o.x1 - p2.x, o.y1 - p2.y) < 0.05 ||
                          Math.hypot(o.x2 - p2.x, o.y2 - p2.y) < 0.05;
          if (!touches) return false;
          const oIsH = Math.abs(o.y2 - o.y1) < 1e-4;
          const oIsV = Math.abs(o.x2 - o.x1) < 1e-4;
          return (isH && oIsV) || (isV && oIsH);
        });

        connectedP1.forEach(perp => {
          const ptA = { x: perp.x1, y: perp.y1 };
          const ptB = { x: perp.x2, y: perp.y2 };
          const newA = { x: ptA.x - hx, y: ptA.y - hy };
          const newB = { x: ptB.x - hx, y: ptB.y - hy };
          perp.x1 = newA.x; perp.y1 = newA.y;
          perp.x2 = newB.x; perp.y2 = newB.y;
          moveJointVertex(ptA, newA, [target.id, perp.id]);
          moveJointVertex(ptB, newB, [target.id, perp.id]);
        });

        connectedP2.forEach(perp => {
          const ptA = { x: perp.x1, y: perp.y1 };
          const ptB = { x: perp.x2, y: perp.y2 };
          const newA = { x: ptA.x + hx, y: ptA.y + hy };
          const newB = { x: ptB.x + hx, y: ptB.y + hy };
          perp.x1 = newA.x; perp.y1 = newA.y;
          perp.x2 = newB.x; perp.y2 = newB.y;
          moveJointVertex(ptA, newA, [target.id, perp.id]);
          moveJointVertex(ptB, newB, [target.id, perp.id]);
        });

        target.x1 = newP1.x; target.y1 = newP1.y;
        target.x2 = newP2.x; target.y2 = newP2.y;
        moveJointVertex(oldP1, newP1, [target.id, ...connectedP1.map(p => p.id)]);
        moveJointVertex(oldP2, newP2, [target.id, ...connectedP2.map(p => p.id)]);
      } else {
        const moveEnd = (dir === 'start');
        const movedPt = moveEnd ? p2 : p1;
        const dispX = moveEnd ? delta * ux : -delta * ux;
        const dispY = moveEnd ? delta * uy : -delta * uy;

        const connectedPerp = state.ents.filter(o => {
          if (o.id === target.id || (o.type !== 'line' && o.type !== 'bend')) return false;
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
      }
    } else {
      applyLineJointMove(target, p1, p2, ux, uy, delta, dir, keepJoints);
    }

    dim.p1 = { x: target.x1, y: target.y1 };
    dim.p2 = { x: target.x2, y: target.y2 };
    dim.mid = { x: (target.x1 + target.x2) / 2, y: (target.y1 + target.y2) / 2 };
    const isBend = target.type === 'bend';
    dim.label = isBend
      ? `${target.direction || 'UP'} ${target.angle || 90}° (L=${newVal.toFixed(2)} mm)`
      : `${newVal.toFixed(2)} mm`;
  } else if (target.type === 'poly') {
    if (!target.pts || target.pts.length < 2) {
      hideSmartDimHUD();
      return;
    }
    const k = dim.segIndex || 0;
    const n = target.pts.length;
    const p1 = target.pts[k];
    const p2 = target.pts[(k + 1) % n];
    if (!p1 || !p2) {
      hideSmartDimHUD();
      return;
    }
    const curLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (curLen < 1e-9) return;
    const delta = newVal - curLen;
    const ux = (p2.x - p1.x) / curLen;
    const uy = (p2.y - p1.y) / curLen;

    const isH = Math.abs(uy) < 1e-4;
    const isV = Math.abs(ux) < 1e-4;

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

    dim.p1 = target.pts[k];
    dim.p2 = target.pts[(k + 1) % n];
    dim.mid = { x: (dim.p1.x + dim.p2.x) / 2, y: (dim.p1.y + dim.p2.y) / 2 };
    dim.label = `${newVal.toFixed(2)} mm`;
  } else if (target.type === 'circle') {
    if (dim.subtype === 'radius') {
      target.r = Math.max(0.1, newVal);
      dim.val = newVal;
      dim.r = target.r;
      dim.label = `R ${newVal.toFixed(2)} mm`;
    } else {
      target.r = Math.max(0.1, newVal / 2);
      dim.val = newVal;
      dim.r = target.r;
      dim.label = `Ø ${newVal.toFixed(2)} mm`;
    }
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
    dim.val = newVal;
    dim.r = target.r;
    dim.label = `R ${newVal.toFixed(2)} mm`;
  }

  dim.val = newVal;
  hideSmartDimHUD();
  showToast(`Dimension changed to ${newVal.toFixed(2)} mm (Joints intact)`);
  getCallbacks().updateUI();
  render();
}

export function applyLineJointMove(target, p1, p2, ux, uy, delta, dir, keepJoints) {
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

export function moveJointVertex(pOld, pNew, excludeIds = [], tol = 0.05) {
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]);

  state.ents.forEach(other => {
    if (excludeSet.has(other.id)) return;

    if (other.type === 'line' || other.type === 'bend') {
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

export function computeAngleBetweenLines(line1, line2) {
  if (!line1 || !line2) return null;
  const x1 = line1.x1, y1 = line1.y1, x2 = line1.x2, y2 = line1.y2;
  const x3 = line2.x1, y3 = line2.y1, x4 = line2.x2, y4 = line2.y2;

  const a1 = y2 - y1, b1 = x1 - x2, c1 = a1 * x1 + b1 * y1;
  const a2 = y4 - y3, b2 = x3 - x4, c2 = a2 * x3 + b2 * y3;
  const det = a1 * b2 - a2 * b1;

  if (Math.abs(det) < 1e-6) {
    return null; // Parallel lines
  }

  const cx = (b2 * c1 - b1 * c2) / det;
  const cy = (a1 * c2 - a2 * c1) / det;

  const d1A = Math.hypot(x1 - cx, y1 - cy);
  const d1B = Math.hypot(x2 - cx, y2 - cy);
  const p1 = (d1A >= d1B) ? { x: x1, y: y1 } : { x: x2, y: y2 };
  const ang1 = Math.atan2(p1.y - cy, p1.x - cx);

  const d2A = Math.hypot(x3 - cx, y3 - cy);
  const d2B = Math.hypot(x4 - cx, y4 - cy);
  const p2 = (d2A >= d2B) ? { x: x3, y: y3 } : { x: x4, y: y4 };
  const ang2 = Math.atan2(p2.y - cy, p2.x - cx);

  let diff = Math.abs(ang2 - ang1);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  const deg = (diff * 180) / Math.PI;

  return {
    center: { x: cx, y: cy },
    ang1,
    ang2,
    deg
  };
}

export function recordPointToPoint(wPt) {
  if (!smartDimState.point1) {
    smartDimState.point1 = { x: wPt.x, y: wPt.y };
    showToast(`Point 1 set (${wPt.x.toFixed(1)}, ${wPt.y.toFixed(1)}). Left-click Point 2 to measure.`);
    getCallbacks().updatePrompt();
    getCallbacks().render();
    render();
    return true;
  } else {
    const p1 = smartDimState.point1;
    const p2 = { x: wPt.x, y: wPt.y };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist < 1e-4) {
      showToast('Points are too close together');
      return true;
    }
    const newDim = {
      id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'points',
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      val: dist,
      label: `${dist.toFixed(2)} mm`
    };
    pushState();
    smartDimState.placedDims.push(newDim);
    smartDimState.point1 = null;
    showToast(`Dimension placed: ${dist.toFixed(2)} mm. Click dimension to edit.`);
    getCallbacks().updatePrompt();
    getCallbacks().render();
    render();
    return true;
  }
}

export function handleSmartDimRightClick(wPt, sx, sy, clientX, clientY) {
  // If active measurement in progress (Point 1 or Line 1 set), right-click cancels it
  if (smartDimState.point1 || smartDimState.angleLine1) {
    smartDimState.point1 = null;
    smartDimState.angleLine1 = null;
    showToast('Measurement cancelled. Left-click to measure, or Right-click for mode menu.');
    getCallbacks().updatePrompt();
    getCallbacks().render();
    render();
    return true;
  }

  // Right-click opens the Smart Dimension Mode Selector menu
  const cx = (clientX !== undefined) ? clientX : (sx || 200);
  const cy = (clientY !== undefined) ? clientY : (sy || 200);
  showSmartDimModeMenu(cx, cy);
  return true;
}

export function handleSmartDimLeftClick(wPt, sx, sy, clientX, clientY) {
  hideSmartDimModeMenu();

  // 1. Angle Mode (Picking two lines)
  if (smartDimState.mode === 'angle') {
    const hit = pickEntity(sx, sy);
    if (!hit || (hit.type !== 'line' && hit.type !== 'bend' && hit.type !== 'poly')) {
      showToast('Click a line or polyline edge to measure angle (Right-click to cancel)');
      return true;
    }
    if (!smartDimState.angleLine1) {
      const lineData = (hit.type === 'poly') ? findNearestPolySegment(hit, wPt.x, wPt.y) : hit;
      smartDimState.angleLine1 = { ent: hit, line: lineData };
      showToast('Line 1 selected. Left-click second line to measure angle (Right-click to cancel).');
      getCallbacks().updatePrompt();
      getCallbacks().render();
      render();
      return true;
    } else {
      if (hit.id === smartDimState.angleLine1.ent.id && hit.type !== 'poly') {
        showToast('Please pick a different second line');
        return true;
      }
      const line1 = smartDimState.angleLine1.line;
      const line2 = (hit.type === 'poly') ? findNearestPolySegment(hit, wPt.x, wPt.y) : hit;
      const angleRes = computeAngleBetweenLines(line1, line2);
      if (!angleRes) {
        showToast('Selected lines are parallel (0° or 180°)');
        smartDimState.angleLine1 = null;
        getCallbacks().updatePrompt();
        getCallbacks().render();
        render();
        return true;
      }
      const newDim = {
        id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'angle',
        targetId1: smartDimState.angleLine1.ent.id,
        targetId2: hit.id,
        center: angleRes.center,
        ang1: angleRes.ang1,
        ang2: angleRes.ang2,
        val: angleRes.deg,
        label: `${angleRes.deg.toFixed(1)}°`
      };
      pushState();
      smartDimState.placedDims.push(newDim);
      smartDimState.angleLine1 = null;
      showToast(`Angle placed: ${angleRes.deg.toFixed(1)}°. Click dimension to edit.`);
      getCallbacks().updatePrompt();
      getCallbacks().render();
      render();
      return true;
    }
  }

  // 2. Circle: Diameter Mode
  if (smartDimState.mode === 'circle_diameter') {
    const hit = pickEntity(sx, sy);
    if (hit && (hit.type === 'circle' || hit.type === 'arc')) {
      const val = hit.r * 2;
      const newDim = {
        id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'circle',
        subtype: 'diameter',
        targetId: hit.id,
        cx: hit.cx,
        cy: hit.cy,
        r: hit.r,
        val: val,
        label: `Ø ${val.toFixed(2)} mm`
      };
      pushState();
      smartDimState.placedDims.push(newDim);
      showToast(`Diameter placed: Ø ${val.toFixed(2)} mm. Click dimension to edit.`);
      getCallbacks().render();
      render();
      return true;
    }
    showToast('Click a circle or arc to measure diameter (Right-click for menu)');
    return true;
  }

  // 3. Circle / Arc: Radius Mode
  if (smartDimState.mode === 'circle_radius') {
    const hit = pickEntity(sx, sy);
    if (hit && (hit.type === 'circle' || hit.type === 'arc')) {
      const val = hit.r;
      let mid = null;
      if (hit.type === 'arc') {
        const am = hit.a1 + Geo.norm(hit.a2 - hit.a1) / 2;
        mid = { x: hit.cx + hit.r * Math.cos(am), y: hit.cy + hit.r * Math.sin(am) };
      }
      const newDim = {
        id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: hit.type === 'arc' ? 'arc' : 'circle',
        subtype: 'radius',
        targetId: hit.id,
        cx: hit.cx,
        cy: hit.cy,
        r: hit.r,
        mid,
        val: val,
        label: `R ${val.toFixed(2)} mm`
      };
      pushState();
      smartDimState.placedDims.push(newDim);
      showToast(`Radius placed: R ${val.toFixed(2)} mm. Click dimension to edit.`);
      getCallbacks().render();
      render();
      return true;
    }
    showToast('Click a circle or arc to measure radius (Right-click for menu)');
    return true;
  }

  // 4. Full Line Mode
  if (smartDimState.mode === 'line') {
    const hit = pickEntity(sx, sy);
    if (hit && (hit.type === 'line' || hit.type === 'poly' || hit.type === 'bend')) {
      const resolved = resolveSmartDim(hit, wPt.x, wPt.y);
      if (resolved) {
        const newDim = {
          id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          ...resolved
        };
        pushState();
        smartDimState.placedDims.push(newDim);
        showToast(`Line dimension placed: ${resolved.label}. Click dimension to edit.`);
        getCallbacks().render();
        render();
        return true;
      }
    }
    showToast('Click a line or polyline segment to measure (Right-click for menu)');
    return true;
  }

  // 5. Smart Detect / Auto Mode: if user clicked an entity directly without starting a point
  if (smartDimState.mode === 'auto' && !smartDimState.point1) {
    const hit = pickEntity(sx, sy);
    if (hit) {
      if (hit.type === 'circle') {
        const val = hit.r * 2;
        const newDim = {
          id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          type: 'circle',
          subtype: 'diameter',
          targetId: hit.id,
          cx: hit.cx,
          cy: hit.cy,
          r: hit.r,
          val: val,
          label: `Ø ${val.toFixed(2)} mm`
        };
        pushState();
        smartDimState.placedDims.push(newDim);
        showToast(`Diameter placed: Ø ${val.toFixed(2)} mm. Click dimension to edit.`);
        getCallbacks().render();
        render();
        return true;
      }
      if (hit.type === 'arc') {
        const val = hit.r;
        const am = hit.a1 + Geo.norm(hit.a2 - hit.a1) / 2;
        const mid = { x: hit.cx + hit.r * Math.cos(am), y: hit.cy + hit.r * Math.sin(am) };
        const newDim = {
          id: 'dim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          type: 'arc',
          subtype: 'radius',
          targetId: hit.id,
          cx: hit.cx,
          cy: hit.cy,
          r: hit.r,
          mid,
          val: val,
          label: `R ${val.toFixed(2)} mm`
        };
        pushState();
        smartDimState.placedDims.push(newDim);
        showToast(`Radius placed: R ${val.toFixed(2)} mm. Click dimension to edit.`);
        getCallbacks().render();
        render();
        return true;
      }
    }
  }

  // 6. Point to Point (Default or explicit 'points')
  return recordPointToPoint(wPt);
}

export function findNearestPolySegment(poly, wx, wy) {
  if (!poly || !poly.pts || poly.pts.length < 2) return null;
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

  return { index: bestIdx, p1: bestP1, p2: bestP2, len: bestLen, x1: bestP1.x, y1: bestP1.y, x2: bestP2.x, y2: bestP2.y };
}

export function resolveSmartDim(e, wx, wy) {
  if (!e) return null;
  switch (e.type) {
    case 'line':
    case 'bend': {
      const p1 = { x: e.x1, y: e.y1 };
      const p2 = { x: e.x2, y: e.y2 };
      const val = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const isBend = e.type === 'bend';
      const label = isBend
        ? `${e.direction || 'UP'} ${e.angle || 90}° (L=${val.toFixed(2)} mm)`
        : `${val.toFixed(2)} mm`;
      return { type: e.type, targetId: e.id, p1, p2, mid, val, label };
    }
    case 'poly': {
      const seg = findNearestPolySegment(e, wx, wy);
      if (!seg || !seg.p1 || !seg.p2) return null;
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
