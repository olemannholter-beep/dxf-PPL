/**
 * Viewport, Canvas Rendering Engine & Coordinate Mapping
 * Handles 1x1mm grid, zoom/pan transforms, entity rendering, CAM toolpaths,
 * snap markers, flat blank view, and Smart Dimension graphics.
 */
import { Geo, Cam, SheetMetal } from './core.js';
import {
  state,
  options,
  selectedIds,
  activePoints,
  activeTool,
  mouseWorld,
  mouseScreen,
  snapState,
  dragActionState
} from './state.js';
import { smartDimState } from './tools/smartDimTool.js';

export const ACI_COLORS = {
  1: '#ff4d4d', 2: '#ffd966', 3: '#4dff6a', 4: '#33e0ff',
  5: '#5b8cff', 6: '#ff4dff', 7: '#ffffff', 8: '#8a8a8a', 9: '#c0c0c0'
};
export const getColor = aci => ACI_COLORS[aci] || '#ffffff';

export const view = {
  scale: 4, // px per unit (mm)
  panX: 0,
  panY: 0
};

export const toScreen = (x, y) => [x * view.scale + view.panX, view.panY - y * view.scale];
export const toWorld = (sx, sy) => [(sx - view.panX) / view.scale, (view.panY - sy) / view.scale];

let canvas, ctx, wrapper;
export let width = 0, height = 0, dpr = 1;

export function initViewport() {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  wrapper = document.getElementById('canvas-wrapper');
  resizeCanvas();
}

export function getCanvas() {
  return canvas;
}

export function getContext() {
  return ctx;
}

export function resizeCanvas() {
  if (!wrapper || !canvas) return;
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
export function getGridInterval() {
  return 1.0;
}

export function zoomFit() {
  const isFlatView = state.sheetMetal && state.sheetMetal.viewMode === 'flat' && state.ents.some(e => e.type === 'bend');
  const visible = isFlatView ? SheetMetal.unfoldContour(state.ents, state.sheetMetal) : state.ents;
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

export function pickEntity(sx, sy) {
  const w = toWorld(sx, sy);
  const tol = 8 / view.scale;
  let best = null, bd = tol;
  const isFlatView = state.sheetMetal && state.sheetMetal.viewMode === 'flat' && state.ents.some(e => e.type === 'bend');
  const entsToPick = isFlatView ? SheetMetal.unfoldContour(state.ents, state.sheetMetal) : state.ents;
  entsToPick.forEach(e => {
    const d = Geo.distEnt(e, w[0], w[1]);
    if (d < bd) {
      bd = d;
      best = isFlatView ? (state.ents.find(orig => orig.id === e.id) || e) : e;
    }
  });
  return best;
}

export function render() {
  if (!ctx) return;
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

  const isFlatView = state.sheetMetal && state.sheetMetal.viewMode === 'flat';
  const entsToRender = (isFlatView && state.ents.some(e => e.type === 'bend'))
    ? SheetMetal.unfoldContour(state.ents, state.sheetMetal)
    : state.ents;

  entsToRender.forEach(e => {
    const lay = layMap[e.layer] || { visible: true, aci: 7 };
    if (!lay.visible) return;

    const isSel = selectedIds.has(e.id);
    const col = isSel ? '#00bfff' : getColor(lay.aci);
    renderEntity(e, col, isSel ? 2.5 : 1.6, isSel ? [6, 4] : []);
  });

  if (isFlatView && state.ents.some(e => e.type === 'bend')) {
    drawFlatBlankBanner();
  }

  // 4. Open Ends Highlights
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
  if (snapState.activeSnap) {
    const [sx, sy] = toScreen(mouseWorld.x, mouseWorld.y);
    ctx.strokeStyle = '#39c5cf';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 5, sy - 5, 10, 10);
  }

  // 8. Box Selection Rectangle
  const dragAction = dragActionState.dragAction;
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

export function renderEntity(e, color, lw = 1.5, dash = []) {
  if (!ctx) return;
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
    case 'bend': {
      const [x1, y1] = toScreen(e.x1, e.y1);
      const [x2, y2] = toScreen(e.x2, e.y2);
      const isUp = (e.direction || 'UP').toUpperCase() === 'UP';
      const isSel = selectedIds.has(e.id);
      const bendColor = isSel ? '#00bfff' : (isUp ? '#ff4dff' : '#ffa726');
      ctx.strokeStyle = bendColor;
      ctx.lineWidth = isSel ? 2.5 : 2.0;
      ctx.setLineDash([10, 5]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isSel) {
        ctx.fillStyle = '#00bfff';
        ctx.fillRect(x1 - 3, y1 - 3, 6, 6);
        ctx.fillRect(x2 - 3, y2 - 3, 6, 6);
      }

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dirText = isUp ? 'UP' : 'DOWN';
      const angText = (e.angle != null ? e.angle : 90);
      const radText = (e.radius != null ? e.radius : 2.0).toFixed(1);
      const badge = `${dirText} ${angText}° R=${radText}`;
      drawBendBadge(badge, mx, my, bendColor, isSel);
      return;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawBendBadge(text, x, y, color, isSel) {
  if (!ctx) return;
  ctx.save();
  ctx.font = 'bold 11px Consolas, monospace';
  const padX = 7, padY = 3;
  const metrics = ctx.measureText(text);
  const bw = metrics.width + padX * 2;
  const bh = 18;

  ctx.fillStyle = 'rgba(27, 29, 34, 0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = isSel ? 2 : 1.2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 4);
  } else {
    ctx.rect(x - bw / 2, y - bh / 2, bw, bh);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawFlatBlankBanner() {
  if (!ctx) return;
  ctx.save();
  const bends = state.ents.filter(e => e.type === 'bend');
  let totalBD = 0;
  bends.forEach(b => {
    const calc = SheetMetal.computeBend({
      angle: b.angle || 90,
      thickness: state.sheetMetal.thickness,
      radius: b.radius != null ? b.radius : 2.0,
      kFactor: state.sheetMetal.kFactor
    });
    totalBD += calc.BD;
  });

  const bannerText = `📏 COMPENSATED FLAT BLANK VIEW (Total BD: -${totalBD.toFixed(3)} mm, ${bends.length} bend${bends.length === 1 ? '' : 's'})`;
  ctx.font = 'bold 12px sans-serif';
  const m = ctx.measureText(bannerText);
  const bw = m.width + 24;
  const bh = 26;
  const bx = (width - bw) / 2;
  const by = 12;

  ctx.fillStyle = 'rgba(30, 40, 60, 0.92)';
  ctx.strokeStyle = '#388bfd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(bx, by, bw, bh, 6);
  } else {
    ctx.rect(bx, by, bw, bh);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#79c0ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerText, bx + bw / 2, by + bh / 2);
  ctx.restore();
}

export function renderPreview() {
  if (!ctx || !activePoints.length) return;
  const p0 = activePoints[activePoints.length - 1];
  const pCur = mouseWorld;

  ctx.strokeStyle = '#e5c07b';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();

  switch (activeTool) {
    case 'bend': {
      const [x1, y1] = toScreen(p0.x, p0.y);
      const [x2, y2] = toScreen(pCur.x, pCur.y);
      const dirEl = document.getElementById('sm-bend-dir');
      const dir = (dirEl && dirEl.value) || state.sheetMetal.defaultDir || 'UP';
      ctx.strokeStyle = dir === 'DOWN' ? '#ffa726' : '#ff4dff';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([8, 4]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      const angEl = document.getElementById('sm-bend-angle');
      const radEl = document.getElementById('sm-bend-radius');
      const ang = (angEl && angEl.value) || 90;
      const rad = (radEl && radEl.value) || 2.0;
      drawBendBadge(`${dir} ${ang}° R=${rad}`, (x1 + x2) / 2, (y1 + y2) / 2, ctx.strokeStyle, false);
      return;
    }
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
      const minX = Math.min(x1, x2), minY = Math.min(y1, y2);
      const wPx = Math.abs(x2 - x1), hPx = Math.abs(y2 - y1);
      ctx.strokeRect(minX, minY, wPx, hPx);

      // Render live dragged dimensions badge
      const realW = Math.abs(pCur.x - p0.x);
      const realH = Math.abs(pCur.y - p0.y);
      if (wPx > 10 && hPx > 10) {
        ctx.save();
        ctx.font = 'bold 11px Consolas, monospace';
        const txt = `${realW.toFixed(1)} × ${realH.toFixed(1)} mm`;
        const m = ctx.measureText(txt);
        const bw = m.width + 12, bh = 18;
        const bx = minX + wPx / 2 - bw / 2;
        const by = minY + hPx / 2 - bh / 2;
        ctx.fillStyle = 'rgba(27, 29, 34, 0.9)';
        ctx.strokeStyle = '#e5c07b';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#e5c07b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + bw / 2, by + bh / 2);
        ctx.restore();
      }
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
        const ax = activePoints[0].x, ay = activePoints[0].y;
        const bx = activePoints[1].x, by = activePoints[1].y;
        const px = pCur.x, py = pCur.y;
        const d = 2 * (ax * (by - py) + bx * (py - ay) + px * (ay - by));
        if (Math.abs(d) >= 1e-12) {
          const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = px * px + py * py;
          const ux = (a2 * (by - py) + b2 * (py - ay) + c2 * (ay - by)) / d;
          const uy = (a2 * (px - bx) + b2 * (ax - px) + c2 * (bx - ax)) / d;
          const r = Math.hypot(ax - ux, ay - uy);
          const a1 = Math.atan2(ay - uy, ax - ux);
          const am = Math.atan2(by - uy, bx - ux);
          const a3 = Math.atan2(py - uy, px - ux);
          const [cx, cy] = toScreen(ux, uy);
          if (Geo.norm(am - a1) <= Geo.norm(a3 - a1)) {
            ctx.arc(cx, cy, r * view.scale, -a1, -a3, true);
          } else {
            ctx.arc(cx, cy, r * view.scale, -a3, -a1, true);
          }
        }
      }
      break;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function renderDimensions() {
  if (!ctx) return;
  const placed = smartDimState.placedDims || [];
  placed.forEach(dim => {
    const isMod = (smartDimState.activeDim && smartDimState.activeDim.id === dim.id);
    drawDimensionGraphic(dim, isMod ? '#00e5ff' : '#388bfd', isMod);
  });

  if (activeTool === 'smart-dim') {
    if (smartDimState.point1) {
      // Dynamic point-to-point preview between point1 and current mouseWorld
      const p1 = smartDimState.point1;
      const p2 = mouseWorld;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const previewDim = {
        type: 'points',
        p1,
        p2,
        val: dist,
        label: `${dist.toFixed(2)} mm`
      };
      drawDimensionGraphic(previewDim, '#00e5ff', true);
    } else if (smartDimState.angleLine1) {
      // Highlight first selected line for angle measurement
      const l1 = smartDimState.angleLine1.line || smartDimState.angleLine1.ent;
      if (l1) {
        ctx.save();
        ctx.strokeStyle = '#e5c07b';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        const [x1, y1] = toScreen(l1.x1, l1.y1);
        const [x2, y2] = toScreen(l1.x2, l1.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    } else if (smartDimState.activeDim && !placed.some(d => d.id === smartDimState.activeDim.id)) {
      drawDimensionGraphic(smartDimState.activeDim, '#00e5ff', true);
    } else if (smartDimState.hoverTarget && !smartDimState.activeDim) {
      drawDimensionGraphic(smartDimState.hoverTarget, '#00e5ff', false);
    }
  }
}

export function drawDimensionGraphic(dim, color, isModifying) {
  if (!ctx || !dim) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = isModifying ? 2 : 1.5;

  if (dim.type === 'line' || dim.type === 'poly_seg' || dim.type === 'bend' || dim.type === 'points') {
    if (!dim.p1 || !dim.p2) { ctx.restore(); return; }
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
    const badgeMetrics = drawDimBadge(dim.label || `${dim.val.toFixed(2)} mm`, mx, my, color, isModifying);
    dim._screen = {
      badge: { x: mx, y: my, w: badgeMetrics.width, h: badgeMetrics.height },
      line: { x1: d1x, y1: d1y, x2: d2x, y2: d2y }
    };
  } else if (dim.type === 'circle') {
    const [scx, scy] = toScreen(dim.cx, dim.cy);
    const sr = dim.r * view.scale;
    const ang = -Math.PI / 4;

    if (dim.subtype === 'radius') {
      const p1x = scx;
      const p1y = scy;
      const p2x = scx + sr * Math.cos(ang);
      const p2y = scy + sr * Math.sin(ang);

      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(scx, scy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const ux = Math.cos(ang), uy = Math.sin(ang);
      drawArrow(p2x, p2y, -ux, -uy, 8);

      const mx = (scx + p2x) / 2;
      const my = (scy + p2y) / 2 - 12;
      const badgeMetrics = drawDimBadge(dim.label || `R ${(dim.val).toFixed(2)} mm`, mx, my, color, isModifying);
      dim._screen = {
        badge: { x: mx, y: my, w: badgeMetrics.width, h: badgeMetrics.height },
        line: { x1: p1x, y1: p1y, x2: p2x, y2: p2y },
        circle: { x: scx, y: scy, r: sr }
      };
    } else {
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

      const badgeMetrics = drawDimBadge(dim.label || `Ø ${(dim.val).toFixed(2)} mm`, scx, scy - 12, color, isModifying);
      dim._screen = {
        badge: { x: scx, y: scy - 12, w: badgeMetrics.width, h: badgeMetrics.height },
        line: { x1: p1x, y1: p1y, x2: p2x, y2: p2y },
        circle: { x: scx, y: scy, r: sr }
      };
    }
  } else if (dim.type === 'arc') {
    if (!dim.mid) { ctx.restore(); return; }
    const [scx, scy] = toScreen(dim.cx, dim.cy);
    const [smx, smy] = toScreen(dim.mid.x, dim.mid.y);

    ctx.beginPath();
    ctx.moveTo(scx, scy);
    ctx.lineTo(smx, smy);
    ctx.stroke();

    const dx = smx - scx, dy = smy - scy;
    const dlen = Math.hypot(dx, dy) || 1;
    drawArrow(smx, smy, -dx / dlen, -dy / dlen, 8);

    const badgeMetrics = drawDimBadge(dim.label || `R ${(dim.val).toFixed(2)} mm`, (scx + smx) / 2, (scy + smy) / 2 - 10, color, isModifying);
    dim._screen = {
      badge: { x: (scx + smx) / 2, y: (scy + smy) / 2 - 10, w: badgeMetrics.width, h: badgeMetrics.height },
      line: { x1: scx, y1: scy, x2: smx, y2: smy }
    };
  } else if (dim.type === 'angle') {
    if (!dim.center) { ctx.restore(); return; }
    const [scx, scy] = toScreen(dim.center.x, dim.center.y);
    const rPx = 45;
    let a1 = dim.ang1;
    let a2 = dim.ang2;
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const startAng = a1;
    const endAng = a1 + diff;
    const isCcw = diff < 0;

    // Draw the angle arc
    ctx.beginPath();
    ctx.arc(scx, scy, rPx, -startAng, -endAng, isCcw);
    ctx.stroke();

    // Arrows at arc endpoints
    const arrowSz = 7;
    const tan1X = -Math.sin(startAng) * (isCcw ? -1 : 1);
    const tan1Y = Math.cos(startAng) * (isCcw ? -1 : 1);
    drawArrow(scx + rPx * Math.cos(startAng), scy - rPx * Math.sin(startAng), tan1X, -tan1Y, arrowSz);

    const tan2X = Math.sin(endAng) * (isCcw ? -1 : 1);
    const tan2Y = -Math.cos(endAng) * (isCcw ? -1 : 1);
    drawArrow(scx + rPx * Math.cos(endAng), scy - rPx * Math.sin(endAng), tan2X, -tan2Y, arrowSz);

    // Badge at mid angle
    const midAng = a1 + diff / 2;
    const bx = scx + (rPx + 16) * Math.cos(midAng);
    const by = scy - (rPx + 16) * Math.sin(midAng);
    const badgeMetrics = drawDimBadge(dim.label || `${dim.val.toFixed(1)}°`, bx, by, color, isModifying);
    dim._screen = {
      badge: { x: bx, y: by, w: badgeMetrics.width, h: badgeMetrics.height },
      center: { x: scx, y: scy },
      arcR: rPx
    };
  }

  ctx.restore();
}

export function drawArrow(x, y, dirX, dirY, size = 8) {
  if (!ctx) return;
  const perpX = -dirY;
  const perpY = dirX;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dirX * size + perpX * (size / 2.5), y + dirY * size + perpY * (size / 2.5));
  ctx.lineTo(x + dirX * size - perpX * (size / 2.5), y + dirY * size - perpY * (size / 2.5));
  ctx.closePath();
  ctx.fill();
}

export function drawDimBadge(text, x, y, color, isModifying) {
  if (!ctx) return { width: 40, height: 20 };
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
  return { width: pw, height: ph, x: bx, y: by };
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function pickDimension(sx, sy) {
  const dims = smartDimState.placedDims || [];
  for (let i = dims.length - 1; i >= 0; i--) {
    const dim = dims[i];
    if (!dim._screen) continue;
    const { badge, line, circle, center, arcR } = dim._screen;
    // 1. Badge hit
    if (badge) {
      const halfW = (badge.w || 60) / 2 + 6;
      const halfH = (badge.h || 22) / 2 + 6;
      if (Math.abs(sx - badge.x) <= halfW && Math.abs(sy - badge.y) <= halfH) {
        return dim;
      }
    }
    // 2. Line hit
    if (line) {
      const d = distToSeg(sx, sy, line.x1, line.y1, line.x2, line.y2);
      if (d <= 8) return dim;
    }
    // 3. Circle hit
    if (circle) {
      const d = Math.abs(Math.hypot(sx - circle.x, sy - circle.y) - circle.r);
      if (d <= 8) return dim;
    }
    // 4. Arc / Center hit
    if (center && arcR) {
      const d = Math.abs(Math.hypot(sx - center.x, sy - center.y) - arcR);
      if (d <= 10) return dim;
    }
  }
  return null;
}
