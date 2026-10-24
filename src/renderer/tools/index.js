/**
 * Tool Orchestrator
 * Routes user point input and prompt status to active CAD/CAM tool.
 */
import { activeTool, activePoints } from '../state.js';
import { showManualInputHUD } from '../ui/manualInputHud.js';
import { smartDimState } from './smartDimTool.js';
import { handleLinePoint } from './lineTool.js';
import { handlePolyPoint } from './polyTool.js';
import { handleRectPoint } from './rectTool.js';
import { handleCirclePoint } from './circleTool.js';
import { handleArcPoint } from './arcTool.js';
import { handleTrimPoint } from './trimTool.js';
import { handleExtendPoint } from './extendTool.js';
import { handleFilletPoint } from './filletTool.js';
import { handleOffsetPoint } from './offsetTool.js';
import { handleBendPoint } from './bendTool.js';
import {
  handleMoveCopyPoint,
  handleRotatePoint,
  handleScalePoint,
  handleMirrorPoint
} from './modifyTools.js';

export * from './lineTool.js';
export * from './polyTool.js';
export * from './rectTool.js';
export * from './circleTool.js';
export * from './arcTool.js';
export * from './trimTool.js';
export * from './extendTool.js';
export * from './filletTool.js';
export * from './offsetTool.js';
export * from './explodeTool.js';
export * from './joinTool.js';
export * from './bendTool.js';
export * from './smartDimTool.js';
export * from './modifyTools.js';

export function handleRightClickInput(p) {
  if (activeTool === 'rect') {
    if (activePoints.length > 0) {
      const p0 = activePoints[0];
      const w = Math.abs(p.x - p0.x);
      const h = Math.abs(p.y - p0.y);
      showManualInputHUD('rect', p0, {
        w: w > 1e-4 ? Math.round(w) : 50,
        h: h > 1e-4 ? Math.round(h) : (w > 1e-4 ? Math.round(w) : 50),
        lockSquare: Math.abs(w - h) < 1e-4
      });
    } else {
      showManualInputHUD('rect', p, { w: 50, h: 50, lockSquare: true });
    }
    updatePrompt();
    return true;
  }
  if (activeTool === 'circle') {
    if (activePoints.length > 0) {
      const p0 = activePoints[0];
      const r = Math.hypot(p.x - p0.x, p.y - p0.y);
      showManualInputHUD('circle', p0, { r: r > 1e-4 ? Math.round(r) : 25 });
    } else {
      showManualInputHUD('circle', p, { r: 25 });
    }
    updatePrompt();
    return true;
  }
  if (activeTool === 'line') {
    if (activePoints.length > 0) {
      const p0 = activePoints[0];
      const len = Math.hypot(p.x - p0.x, p.y - p0.y);
      const ang = Math.atan2(p.y - p0.y, p.x - p0.x) * 180 / Math.PI;
      showManualInputHUD('line', p0, { len: len > 1e-4 ? Math.round(len) : 50, ang: Math.round(ang) });
    } else {
      showManualInputHUD('line', p, { len: 50, ang: 0 });
    }
    updatePrompt();
    return true;
  }
  return false;
}

export function handlePointInput(p, sx, sy) {
  switch (activeTool) {
    case 'bend':
      handleBendPoint(p);
      break;
    case 'line':
      handleLinePoint(p);
      break;
    case 'poly':
      handlePolyPoint(p);
      break;
    case 'rect':
      handleRectPoint(p);
      break;
    case 'circle':
      handleCirclePoint(p);
      break;
    case 'arc':
      handleArcPoint(p);
      break;
    case 'move':
      handleMoveCopyPoint(p, false);
      break;
    case 'copy':
      handleMoveCopyPoint(p, true);
      break;
    case 'rotate':
      handleRotatePoint(p);
      break;
    case 'scale':
      handleScalePoint(p);
      break;
    case 'mirror':
      handleMirrorPoint(p);
      break;
    case 'trim':
      handleTrimPoint(p, sx, sy);
      break;
    case 'extend':
      handleExtendPoint(p, sx, sy);
      break;
    case 'fillet':
      handleFilletPoint(p, sx, sy);
      break;
    case 'offset':
      handleOffsetPoint(p, sx, sy);
      break;
  }
}

export function updatePrompt() {
  const commandPrompt = document.getElementById('command-prompt');
  if (!commandPrompt) return;

  let msg = '';
  const n = activePoints.length;
  switch (activeTool) {
    case 'select': msg = 'Click to select. Drag left-to-right (window) or right-to-left (cross). Del deletes, X explodes.'; break;
    case 'smart-dim': {
      if (smartDimState.point1) {
        msg = 'Smart Dimension: Point 1 set. Left-click Point 2 to place dimension (Right-click to cancel).';
      } else if (smartDimState.angleLine1) {
        msg = 'Smart Dimension (Angle): Line 1 selected. Left-click second line to measure angle (Right-click to cancel).';
      } else if (smartDimState.mode === 'points') {
        msg = 'Smart Dimension: Left-click Point 1, then Point 2 to measure distance. Right-click for mode menu. Click dimension to edit.';
      } else if (smartDimState.mode === 'angle') {
        msg = 'Smart Dimension (Angle): Left-click first line, then second line to measure angle. Right-click for menu.';
      } else if (smartDimState.mode === 'circle_diameter') {
        msg = 'Smart Dimension (Circle Diameter): Left-click any circle to measure full diameter (Ø). Right-click for menu.';
      } else if (smartDimState.mode === 'circle_radius') {
        msg = 'Smart Dimension (Circle/Arc Radius): Left-click any circle or arc to measure radius (R). Right-click for menu.';
      } else if (smartDimState.mode === 'line') {
        msg = 'Smart Dimension (Full Line): Left-click any line or polyline edge. Right-click for menu.';
      } else {
        msg = 'Smart Dimension: Left-click points or entities to measure. Right-click for mode menu. Click dimension to edit.';
      }
      break;
    }
    case 'line': msg = n ? 'Line: Left-click next point, or right-click for manual dimensions' : 'Line: Left-click start point, or right-click for manual dimensions'; break;
    case 'poly': msg = n ? `Polyline: Pick point ${n + 1} (Enter=finish, C=close)` : 'Polyline: Pick start point'; break;
    case 'rect': msg = n ? 'Rectangle: Drag and left-click opposite corner, or right-click for manual input' : 'Rectangle: Left-click start corner, or right-click for manual input'; break;
    case 'circle': msg = n ? 'Circle: Drag and left-click radius, or right-click for manual dimensions' : 'Circle: Pick center point, or right-click for manual dimensions'; break;
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
    case 'bend': msg = n ? 'Bend Line: Click second point across part to define bend line' : 'Bend Line: Click first point on part contour (B)'; break;
  }
  commandPrompt.textContent = msg;
}
