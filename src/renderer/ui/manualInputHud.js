/**
 * Floating Manual Dimension Input HUD
 * Interactive popup dialog for specifying exact dimensions for Square, Rectangle, Line, Circle.
 */
import { pushState, addEntity, activePoints, setActivePoints, getCallbacks } from '../state.js';
import { toScreen, render } from '../viewport.js';
import { showToast } from './toast.js';

let hudBox, hudTitle, hudValW, hudValH, hudLabelW, hudLabelH;
let hudSquareRow, hudLockSquare, hudApplyBtn, hudCancelBtn, hudCloseBtn, hudHRow;
let hudContext = null; // { mode: 'rect'|'line'|'circle', origin: {x, y} }

export function initManualInputHUD() {
  hudBox = document.getElementById('manual-input-box');
  hudTitle = document.getElementById('hud-title');
  hudValW = document.getElementById('hud-val-w');
  hudValH = document.getElementById('hud-val-h');
  hudLabelW = document.getElementById('hud-label-w');
  hudLabelH = document.getElementById('hud-label-h');
  hudSquareRow = document.getElementById('hud-square-row');
  hudLockSquare = document.getElementById('hud-lock-square');
  hudApplyBtn = document.getElementById('hud-apply-btn');
  hudCancelBtn = document.getElementById('hud-cancel-btn');
  hudCloseBtn = document.getElementById('hud-close-btn');
  hudHRow = document.getElementById('hud-h-row');

  if (hudValW) {
    hudValW.addEventListener('input', () => {
      if (hudContext && hudContext.mode === 'rect' && hudLockSquare && hudLockSquare.checked) {
        hudValH.value = hudValW.value;
      } else if (hudContext && hudContext.mode === 'circle') {
        hudValH.value = (parseFloat(hudValW.value) || 0) * 2;
      }
    });
  }

  if (hudValH) {
    hudValH.addEventListener('input', () => {
      if (hudContext && hudContext.mode === 'rect') {
        if (hudLockSquare && hudValH.value !== hudValW.value) {
          hudLockSquare.checked = false;
        }
      } else if (hudContext && hudContext.mode === 'circle') {
        hudValW.value = (parseFloat(hudValH.value) || 0) / 2;
      }
    });
  }

  if (hudLockSquare) {
    hudLockSquare.addEventListener('change', () => {
      if (hudLockSquare.checked) {
        hudValH.value = hudValW.value;
        if (hudApplyBtn) hudApplyBtn.textContent = 'Create Square';
      } else {
        if (hudApplyBtn) hudApplyBtn.textContent = 'Create Rectangle';
      }
    });
  }

  if (hudApplyBtn) hudApplyBtn.onclick = applyManualInput;
  if (hudCancelBtn) {
    hudCancelBtn.onclick = () => {
      setActivePoints([]);
      hideManualInputHUD();
      getCallbacks().updatePrompt();
      render();
    };
  }
  if (hudCloseBtn) {
    hudCloseBtn.onclick = () => {
      setActivePoints([]);
      hideManualInputHUD();
      getCallbacks().updatePrompt();
      render();
    };
  }

  [hudValW, hudValH].forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyManualInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActivePoints([]);
        hideManualInputHUD();
        getCallbacks().updatePrompt();
        getCallbacks().render();
        render();
      }
    });
  });
}

export function showManualInputHUD(mode, origin, initialValues = null) {
  if (!hudBox) initManualInputHUD();
  if (!hudBox) return;

  hudContext = { mode, origin: { ...origin } };
  const [sx, sy] = toScreen(origin.x, origin.y);

  const left = Math.min(Math.max(10, sx + 15), window.innerWidth - 260);
  const top = Math.min(Math.max(10, sy - 40), window.innerHeight - 200);
  hudBox.style.left = left + 'px';
  hudBox.style.top = top + 'px';
  hudBox.style.display = 'flex';

  if (mode === 'rect') {
    hudTitle.textContent = 'Specify Square / Rectangle';
    hudLabelW.textContent = 'Width:';
    hudLabelH.textContent = 'Height:';
    hudSquareRow.style.display = 'flex';
    hudHRow.style.display = 'flex';
    const initW = initialValues && initialValues.w != null ? initialValues.w : 50;
    const initH = initialValues && initialValues.h != null ? initialValues.h : initW;
    const isSquare = initialValues && initialValues.lockSquare != null ? initialValues.lockSquare : (initW === initH);
    hudLockSquare.checked = isSquare;
    hudValW.value = String(initW);
    hudValH.value = String(initH);
    hudApplyBtn.textContent = isSquare ? 'Create Square' : 'Create Rectangle';
  } else if (mode === 'line') {
    hudTitle.textContent = 'Specify Line Dimensions';
    hudLabelW.textContent = 'Length:';
    hudLabelH.textContent = 'Angle (°):';
    hudSquareRow.style.display = 'none';
    hudHRow.style.display = 'flex';
    hudValW.value = String(initialValues && initialValues.len != null ? initialValues.len : 50);
    hudValH.value = String(initialValues && initialValues.ang != null ? initialValues.ang : 0);
    hudApplyBtn.textContent = 'Create Line';
  } else if (mode === 'circle') {
    hudTitle.textContent = 'Specify Circle Dimensions';
    hudLabelW.textContent = 'Radius:';
    hudLabelH.textContent = 'Diameter:';
    hudSquareRow.style.display = 'none';
    hudHRow.style.display = 'flex';
    const r = initialValues && initialValues.r != null ? initialValues.r : 25;
    hudValW.value = String(r);
    hudValH.value = String(r * 2);
    hudApplyBtn.textContent = 'Create Circle';
  }

  hudValW.focus();
  hudValW.select();
}

export function hideManualInputHUD() {
  if (hudBox) hudBox.style.display = 'none';
  hudContext = null;
}

export function applyManualInput() {
  if (!hudContext) return;
  const p0 = hudContext.origin;
  const w = parseFloat(hudValW.value) || 50;
  const h = parseFloat(hudValH.value) || 50;

  pushState();

  if (hudContext.mode === 'rect') {
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

  setActivePoints([]);
  hideManualInputHUD();
  const cb = getCallbacks();
  cb.updatePrompt();
  cb.updateUI();
  render();
}
