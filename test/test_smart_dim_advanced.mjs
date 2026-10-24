/**
 * Automated Test Suite for Advanced Smart Dimensions
 * Tests:
 * 1. Point-to-Point right-click measurement & canvas persistence
 * 2. Left-click Mode Menu (Line, Angle, Circle/Arc, Points)
 * 3. Modifying point-to-point dimensions while keeping joints intact
 * 4. Angle measurement calculation between two lines & rotating geometry
 * 5. Dimension picking via pickDimension (for left/right click modification)
 * 6. Deleting placed dimensions
 * 7. Undo/Redo persistence of dimensions
 */
import assert from 'assert';
import { state, pushState, undo, redo } from '../src/renderer/state.js';
import {
  smartDimState,
  handleSmartDimRightClick,
  handleSmartDimLeftClick,
  setSmartDimMode,
  showSmartDimModeMenu,
  hideSmartDimModeMenu,
  computeAngleBetweenLines,
  applySmartDimension,
  deleteCurrentSmartDim
} from '../src/renderer/tools/smartDimTool.js';
import { pickDimension } from '../src/renderer/viewport.js';

console.log('=== RUNNING ADVANCED SMART DIMENSIONS TEST SUITE ===\n');

// Mock DOM elements required by HUD and menu
global.window = {
  innerWidth: 1920,
  innerHeight: 1080
};
global.document = {
  getElementById: (id) => {
    return {
      id,
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {}
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      focus: () => {},
      select: () => {}
    };
  },
  querySelectorAll: () => []
};

// 1. Point-to-Point Left-Click Measurement & Right-Click Cancel/Menu
console.log('1. Testing Point-to-Point Left-Click Measurement & Right-Click Cancel/Menu...');
state.ents = [];
state.dimensions = [];
smartDimState.mode = 'points';
smartDimState.point1 = null;

// Left-click point 1
handleSmartDimLeftClick({ x: 0, y: 0 }, 100, 100, 100, 100);
assert.ok(smartDimState.point1, 'Point 1 should be recorded');
assert.strictEqual(smartDimState.point1.x, 0);
assert.strictEqual(smartDimState.point1.y, 0);

// Test Right-Click while point 1 is active cancels the pick
handleSmartDimRightClick({ x: 50, y: 50 }, 150, 150, 150, 150);
assert.strictEqual(smartDimState.point1, null, 'Right click should cancel active point 1 pick');

// Set point 1 again
handleSmartDimLeftClick({ x: 0, y: 0 }, 100, 100, 100, 100);
assert.ok(smartDimState.point1, 'Point 1 recorded again');

// Left-click point 2
handleSmartDimLeftClick({ x: 100, y: 0 }, 200, 100, 200, 100);
assert.strictEqual(smartDimState.point1, null, 'Point 1 should be cleared after point 2 is set');
assert.strictEqual(smartDimState.placedDims.length, 1, 'Placed dimensions should contain 1 dimension');
const pDim = smartDimState.placedDims[0];
assert.strictEqual(pDim.type, 'points', 'Dimension type should be points');
assert.strictEqual(pDim.val, 100, 'Dimension value should be 100 mm');
assert.strictEqual(pDim.label, '100.00 mm', 'Dimension label should be formatted');
console.log('   ✓ Point-to-point left-click measurement created persistent dimension on canvas (100.00 mm)');

// 2. Modifying Point-to-Point Dimension with Joint Preservation
console.log('2. Testing Altering Point-to-Point Dimension & Joint Movement...');
// Add an attached rectangle/line at (0,0) to (100,0)
state.ents = [
  { id: 101, type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
  { id: 102, type: 'line', x1: 100, y1: 0, x2: 100, y2: 50 }
];

// Modify point dimension from 100 to 140 mm (dir=start: keep p1, expand p2)
applySmartDimension(pDim, 140, { dir: 'start', keepJoints: true });
assert.strictEqual(pDim.val, 140, 'Dimension value should be updated to 140');
assert.strictEqual(pDim.label, '140.00 mm', 'Dimension label should be 140.00 mm');
assert.strictEqual(pDim.p2.x, 140, 'P2.x should be shifted to 140');

// Verify that attached line 102 endpoint moved to 140 (joint intact)
const movedLine = state.ents.find(e => e.id === 102);
assert.strictEqual(movedLine.x1, 140, 'Connected joint endpoint should move with the dimension');
console.log('   ✓ Altering point dimension shifted joint vertex to 140 mm keeping joints intact');

// 3. Left-Click Mode Menu
console.log('3. Testing Smart Dimension Mode Selector...');
setSmartDimMode('points');
assert.strictEqual(smartDimState.mode, 'points', 'Mode should be set to points');
setSmartDimMode('angle');
assert.strictEqual(smartDimState.mode, 'angle', 'Mode should be set to angle');
setSmartDimMode('circle_diameter');
assert.strictEqual(smartDimState.mode, 'circle_diameter', 'Mode should be set to circle_diameter');
setSmartDimMode('circle_radius');
assert.strictEqual(smartDimState.mode, 'circle_radius', 'Mode should be set to circle_radius');
setSmartDimMode('line');
assert.strictEqual(smartDimState.mode, 'line', 'Mode should be set to line');
console.log('   ✓ Mode selector cleanly sets smart dimension modes (points, angle, diameter, radius, line)');

// 4. Angle Measurement & Geometric Rotation
console.log('4. Testing Angle Measurement between Two Lines & Modifying Angle...');
const line1 = { id: 201, type: 'line', x1: 0, y1: 0, x2: 50, y2: 0 };
const line2 = { id: 202, type: 'line', x1: 0, y1: 0, x2: 0, y2: 50 };
state.ents.push(line1, line2);

const angleRes = computeAngleBetweenLines(line1, line2);
assert.ok(angleRes, 'Angle calculation should return result');
assert.strictEqual(Math.round(angleRes.deg), 90, 'Included angle should be 90 degrees');
assert.strictEqual(angleRes.center.x, 0, 'Center should be at (0,0)');
assert.strictEqual(angleRes.center.y, 0, 'Center should be at (0,0)');

const angleDim = {
  id: 'dim_angle_1',
  type: 'angle',
  targetId1: line1.id,
  targetId2: line2.id,
  center: angleRes.center,
  ang1: angleRes.ang1,
  ang2: angleRes.ang2,
  val: angleRes.deg,
  label: `${angleRes.deg.toFixed(1)}°`
};
smartDimState.placedDims.push(angleDim);

// Alter angle from 90° to 45°
applySmartDimension(angleDim, 45, { keepJoints: true });
assert.strictEqual(angleDim.val, 45, 'Angle dimension should update to 45°');
assert.strictEqual(angleDim.label, '45.0°', 'Angle dimension label should update');

// Verify line2 rotated 45° around (0,0)
const rotatedLine2 = state.ents.find(e => e.id === 202);
assert.strictEqual(rotatedLine2.x1, 0, 'Fixed vertex stays at 0');
assert.strictEqual(rotatedLine2.y1, 0, 'Fixed vertex stays at 0');
const newLen = Math.hypot(rotatedLine2.x2, rotatedLine2.y2);
assert.ok(Math.abs(newLen - 50) < 1e-3, 'Line length should be preserved after rotation');
console.log('   ✓ Angle computed as 90° and rotated to 45° preserving line length');

// 4b. Circle Diameter vs Radius Measurement
console.log('4b. Testing Circle Diameter vs Radius Measurement...');
const circleEnt = { id: 301, type: 'circle', cx: 200, cy: 200, r: 25 };
state.ents.push(circleEnt);

// Test Diameter Mode
const dimDiam = {
  id: 'dim_diam_1',
  type: 'circle',
  subtype: 'diameter',
  targetId: circleEnt.id,
  cx: circleEnt.cx,
  cy: circleEnt.cy,
  r: circleEnt.r,
  val: circleEnt.r * 2,
  label: `Ø ${(circleEnt.r * 2).toFixed(2)} mm`
};
smartDimState.placedDims.push(dimDiam);
assert.strictEqual(dimDiam.val, 50, 'Diameter should be 50 mm');
assert.strictEqual(dimDiam.label, 'Ø 50.00 mm');

// Modify diameter to 60 mm
applySmartDimension(dimDiam, 60);
assert.strictEqual(circleEnt.r, 30, 'Circle radius should become 30 when diameter is set to 60');
assert.strictEqual(dimDiam.label, 'Ø 60.00 mm');

// Test Radius Mode
const dimRad = {
  id: 'dim_rad_1',
  type: 'circle',
  subtype: 'radius',
  targetId: circleEnt.id,
  cx: circleEnt.cx,
  cy: circleEnt.cy,
  r: circleEnt.r,
  val: circleEnt.r,
  label: `R ${circleEnt.r.toFixed(2)} mm`
};
smartDimState.placedDims.push(dimRad);
assert.strictEqual(dimRad.val, 30, 'Radius should be 30 mm');
assert.strictEqual(dimRad.label, 'R 30.00 mm');

// Modify radius to 40 mm
applySmartDimension(dimRad, 40);
assert.strictEqual(circleEnt.r, 40, 'Circle radius should update to 40 mm');
assert.strictEqual(dimRad.label, 'R 40.00 mm');
console.log('   ✓ Circle Diameter (Ø) and Radius (R) accurately measured and modified');

// 5. Dimension Picking via Screen Coordinates
console.log('5. Testing Dimension Picking via Screen Coordinates...');
// Mock screen representation for angleDim
angleDim._screen = {
  badge: { x: 30, y: 30, w: 50, h: 22 }
};
const pickedBadge = pickDimension(32, 31);
assert.strictEqual(pickedBadge.id, angleDim.id, 'pickDimension should hit-test dimension badge');

// Mock line screen representation for point dimension
pDim._screen = {
  line: { x1: 50, y1: 50, x2: 250, y2: 50 }
};
const pickedLine = pickDimension(150, 52);
assert.strictEqual(pickedLine.id, pDim.id, 'pickDimension should hit-test dimension line');
console.log('   ✓ pickDimension accurately detects clicks and right-clicks on placed dimensions');

// 6. Deleting Placed Dimension
console.log('6. Testing Deleting Dimension Annotation...');
const countBefore = smartDimState.placedDims.length;
smartDimState.activeDim = pDim;
deleteCurrentSmartDim();
assert.strictEqual(smartDimState.placedDims.length, countBefore - 1, 'Placed dimensions count should decrease by 1');
assert.ok(!smartDimState.placedDims.some(d => d.id === pDim.id), 'Deleted dimension should no longer exist');
console.log('   ✓ deleteCurrentSmartDim successfully removed dimension annotation');

// 7. Undo/Redo Persistence
console.log('7. Testing Undo/Redo Persistence of Placed Dimensions...');
assert.ok(smartDimState.placedDims.some(d => d.id === angleDim.id), 'angleDim exists before undo');
undo(); // Reverses deleteCurrentSmartDim
assert.ok(smartDimState.placedDims.some(d => d.id === pDim.id), 'Undo restores deleted dimension');
redo(); // Re-applies delete
assert.ok(!smartDimState.placedDims.some(d => d.id === pDim.id), 'Redo re-applies deletion');
console.log('   ✓ Dimensions cleanly persist and restore through Undo/Redo stack');

console.log('\n========================================');
console.log('ALL ADVANCED SMART DIMENSIONS TESTS PASSED!');
console.log('========================================\n');
