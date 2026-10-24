/**
 * Comprehensive Automated Tests for Refactored Modular Architecture & Parity
 * Deep verification of modular ES components in src/renderer/:
 * state, snap, viewport, tools (draw, modify, smart dim, explode, join), ui, core
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Mock a lightweight browser DOM & Canvas environment
let promptText = '';
let drawCalls = [];
const mockCtx = {
  save() { drawCalls.push('save'); },
  restore() { drawCalls.push('restore'); },
  setLineDash(d) { drawCalls.push(['setLineDash', d]); },
  beginPath() { drawCalls.push('beginPath'); },
  moveTo(x, y) { drawCalls.push(['moveTo', x, y]); },
  lineTo(x, y) { drawCalls.push(['lineTo', x, y]); },
  stroke() { drawCalls.push('stroke'); },
  fill() { drawCalls.push('fill'); },
  closePath() { drawCalls.push('closePath'); },
  measureText(t) { return { width: (t ? t.length * 7 : 50) }; },
  fillText(t, x, y) { drawCalls.push(['fillText', t, x, y]); },
  rect() { drawCalls.push('rect'); },
  setTransform() {},
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  arc() {},
  set strokeStyle(v) {},
  set fillStyle(v) {},
  set lineWidth(v) {},
  set font(v) {},
  set textAlign(v) {},
  set textBaseline(v) {}
};

const mockCanvas = {
  getContext: () => mockCtx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: {}
};
const mockWrapper = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
};

function makeInput(val = '') {
  const listeners = {};
  return {
    value: val,
    focus() {},
    select() {},
    style: {},
    addEventListener(ev, fn) {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    },
    trigger(ev, e = {}) {
      if (listeners[ev]) listeners[ev].forEach(f => f(e));
    }
  };
}

const mockElements = {
  'main-canvas': mockCanvas,
  'canvas-wrapper': mockWrapper,
  'command-prompt': { textContent: promptText, set textContent(v) { promptText = v; } },
  'coord-display': { textContent: '' },
  'selection-properties': { innerHTML: '' },
  'layers-container': { innerHTML: '', appendChild() {} },
  'manual-input-box': { style: {} },
  'smart-dim-hud': { style: {} },
  'dim-hud-val': makeInput('100'),
  'dim-hud-prefix': { textContent: '' },
  'dim-hud-label': { textContent: '' },
  'dim-hud-joint-lock': { checked: true },
  'dim-hud-ortho-box': { checked: true },
  'dim-hud-ortho-box-row': { style: {} },
  'hud-val-w': makeInput('50'),
  'hud-val-h': makeInput('50'),
  'hud-lock-square': { ...makeInput(''), checked: true },
  'hud-title': { textContent: '' },
  'hud-label-w': { textContent: '' },
  'hud-label-h': { textContent: '' },
  'hud-square-row': { style: {} },
  'hud-h-row': { style: {} },
  'hud-apply-btn': { textContent: '' },
  'hud-cancel-btn': {},
  'hud-close-btn': {},
  'part-library-modal': { style: {} },
  'part-ins-x': makeInput('0'),
  'part-ins-y': makeInput('0'),
  'part-catalog-list': { innerHTML: '', appendChild() {} },
  'part-params-container': { innerHTML: '', appendChild() {} },
  'part-current-title': { textContent: '' },
  'part-preview-canvas': mockCanvas,
  'btn-part-library': {},
  'btn-close-part-modal': {},
  'btn-cancel-part': {},
  'btn-insert-part': {},
  'sm-mat-select': { value: 'mild_steel' },
  'sm-side-mat': { value: 'mild_steel' },
  'sm-thickness': { value: '2.0' },
  'sm-side-t': { value: '2.0' },
  'sm-kfactor': { value: '0.44' },
  'sm-side-k': { value: '0.44' },
  'sm-bend-angle': { value: '90' },
  'sm-side-ang': { value: '90' },
  'sm-bend-radius': { value: '2.0' },
  'sm-side-rad': { value: '2.0' },
  'sm-bend-dir': { value: 'UP' },
  'lbl-sm-view-mode': { textContent: 'Formed View' },
  'sm-badge-status': { textContent: '' },
  'sm-hud-ba': { textContent: '' },
  'sm-hud-ossb': { textContent: '' },
  'sm-hud-bd': { textContent: '' },
  'sm-hud-delta': { textContent: '' },
  'cam-lead-type': { value: 'line_arc' },
  'cam-lead-len': { value: '3.0' },
  'cam-lead-rad': { value: '2.0' },
  'cam-lead-out': { value: '1.5' },
  'cam-kerf': { value: '0.75' },
  'toggle-osnap': { classList: { toggle() {}, add() {}, remove() {} } },
  'toggle-gsnap': { classList: { toggle() {}, add() {}, remove() {} } },
  'toggle-grid': { classList: { toggle() {}, add() {}, remove() {} } },
  'toggle-ortho': { classList: { toggle() {}, add() {}, remove() {} } },
  'toggle-cam': { classList: { toggle() {}, add() {}, remove() {} } }
};

global.window = {
  innerWidth: 1000,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener() {}
};

global.document = {
  getElementById: (id) => mockElements[id] || null,
  querySelectorAll: () => [],
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    appendChild() {},
    querySelector: () => ({ onclick() {} }),
    classList: { add() {}, remove() {}, toggle() {} }
  }),
  activeElement: null
};

// Import modular ES modules
import {
  state,
  history,
  pushState,
  addEntity,
  selectedIds,
  setActivePoints,
  activePoints,
  setTool,
  getActiveTool,
  undo,
  redo,
  deleteSelected,
  options,
  registerCallbacks,
  getCallbacks
} from '../src/renderer/state.js';

import {
  initViewport,
  toScreen,
  toWorld,
  getGridInterval,
  drawDimensionGraphic,
  pickEntity,
  view
} from '../src/renderer/viewport.js';

import { collectSnapPoints, resolvePoint } from '../src/renderer/snap.js';
import { handleLinePoint } from '../src/renderer/tools/lineTool.js';
import { handlePolyPoint, finishPolyline } from '../src/renderer/tools/polyTool.js';
import { handleRectPoint } from '../src/renderer/tools/rectTool.js';
import { handleCirclePoint } from '../src/renderer/tools/circleTool.js';
import { createArc3, handleArcPoint } from '../src/renderer/tools/arcTool.js';
import { handleBendPoint } from '../src/renderer/tools/bendTool.js';
import {
  resolveSmartDim,
  applySmartDimension,
  smartDimState,
  moveJointVertex,
  showSmartDimHUD,
  hideSmartDimHUD,
  findNearestPolySegment
} from '../src/renderer/tools/smartDimTool.js';
import { explodeSelection } from '../src/renderer/tools/explodeTool.js';
import { joinSelection } from '../src/renderer/tools/joinTool.js';
import { handleTrimPoint } from '../src/renderer/tools/trimTool.js';
import {
  handleMoveCopyPoint,
  handleRotatePoint,
  handleScalePoint,
  handleMirrorPoint,
  reverseDirection
} from '../src/renderer/tools/modifyTools.js';
import { updatePrompt, handlePointInput } from '../src/renderer/tools/index.js';
import { initManualInputHUD, showManualInputHUD, hideManualInputHUD } from '../src/renderer/ui/manualInputHud.js';
import { insertSelectedPart, selectPart } from '../src/renderer/ui/partLibraryModal.js';
import { loadDxfText } from '../src/renderer/ui/camActions.js';
import { Geo, Dxf, Cam, Parts, SheetMetal } from '../src/renderer/core.js';

console.log('=== RUNNING COMPREHENSIVE MODULAR ARCHITECTURE TEST SUITE ===\n');
let testsPassed = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Group 1: Requirement R1 - File Structure & Legacy Cleanup
// -----------------------------------------------------------------------------
it('R1: Legacy directory contains legacy/index.html and project root has no obsolete index.html', () => {
  const legacyPath = path.join(rootDir, 'legacy', 'index.html');
  const rootIndexPath = path.join(rootDir, 'index.html');
  assert(fs.existsSync(legacyPath), 'legacy/index.html must exist');
  assert(!fs.existsSync(rootIndexPath), 'root index.html must be removed/archived');
  assert(!fs.existsSync(path.join(rootDir, 'start.bat')), 'start.bat must be removed');
  assert(!fs.existsSync(path.join(rootDir, 'build.bat')), 'build.bat must be removed');
});

// -----------------------------------------------------------------------------
// Group 2: Requirement R2 - ES Module Bundling & Elimination of Window Globals
// -----------------------------------------------------------------------------
it('R2: src/renderer/index.html loads entry script via type="module" src="./main.js" and has 0 global script tags', () => {
  const htmlContent = fs.readFileSync(path.join(rootDir, 'src/renderer/index.html'), 'utf8');
  assert(htmlContent.includes('<script type="module" src="./main.js"></script>'), 'Must load main.js as ES module');
  assert(!htmlContent.includes('src="../core/geometry.js"'), 'Must eliminate raw script tags for geometry.js');
  assert(!htmlContent.includes('src="../core/dxf.js"'), 'Must eliminate raw script tags for dxf.js');
  assert(!htmlContent.includes('src="../core/cam.js"'), 'Must eliminate raw script tags for cam.js');
  assert(!htmlContent.includes('src="../core/parts.js"'), 'Must eliminate raw script tags for parts.js');
  assert(!htmlContent.includes('src="../core/sheetmetal.js"'), 'Must eliminate raw script tags for sheetmetal.js');
});

it('R2: Window globals window.Geo, window.Cam, window.Dxf, window.Parts, window.SheetMetal are eliminated', () => {
  assert.strictEqual(global.window.Geo, undefined, 'window.Geo must not exist');
  assert.strictEqual(global.window.Cam, undefined, 'window.Cam must not exist');
  assert.strictEqual(global.window.Dxf, undefined, 'window.Dxf must not exist');
  assert.strictEqual(global.window.Parts, undefined, 'window.Parts must not exist');
  assert.strictEqual(global.window.SheetMetal, undefined, 'window.SheetMetal must not exist');
});

it('R2: vite.config.js is configured for electron renderer environment', () => {
  assert(fs.existsSync(path.join(rootDir, 'vite.config.js')), 'vite.config.js must exist');
  const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.js'), 'utf8');
  assert(viteConfig.includes('dist/renderer'), 'Vite outDir points to dist/renderer');
  assert(viteConfig.includes('5173'), 'Vite dev server configured on port 5173');
});

// -----------------------------------------------------------------------------
// Group 3: Requirement R3 - Decomposed Modules: State & Undo/Redo Engine
// -----------------------------------------------------------------------------
it('R3: state.js centralized state and Undo/Redo stack with prompt sync', () => {
  state.ents = [];
  selectedIds.clear();
  setActivePoints([]);

  let promptUpdated = false;
  let uiUpdated = false;
  registerCallbacks({
    updatePrompt: () => { promptUpdated = true; },
    updateUI: () => { uiUpdated = true; },
    render: () => {},
    hideHUDs: () => {}
  });

  // 1. Initial State
  pushState();
  const line = addEntity({ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 });
  assert.strictEqual(state.ents.length, 1);
  selectedIds.add(line.id);

  // 2. Set tool and prompt
  setTool('line');
  assert.strictEqual(getActiveTool(), 'line');

  // 3. Delete Selected
  deleteSelected();
  assert.strictEqual(state.ents.length, 0);
  assert.strictEqual(selectedIds.size, 0);

  // 4. Undo restores entity and calls updatePrompt
  promptUpdated = false;
  undo();
  assert.strictEqual(state.ents.length, 1);
  assert(promptUpdated, 'undo must call updatePrompt to keep status prompt synced');

  // 5. Redo re-deletes entity and calls updatePrompt
  promptUpdated = false;
  redo();
  assert.strictEqual(state.ents.length, 0);
  assert(promptUpdated, 'redo must call updatePrompt to keep status prompt synced');
});

// -----------------------------------------------------------------------------
// Group 4: Requirement R3 - Decomposed Modules: Viewport & 1x1mm Grid Snapping
// -----------------------------------------------------------------------------
it('R3: viewport.js strictly enforces 1x1mm grid interval and accurate coordinate mapping', () => {
  initViewport();
  assert.strictEqual(getGridInterval(), 1.0, 'Grid interval must be strictly 1.0 mm');

  view.scale = 10; // 10px per mm
  view.panX = 200;
  view.panY = 300;

  const [sx, sy] = toScreen(15, 25);
  assert.strictEqual(sx, 200 + 15 * 10); // 350
  assert.strictEqual(sy, 300 - 25 * 10); // 50

  const [wx, wy] = toWorld(350, 50);
  assert.strictEqual(wx, 15);
  assert.strictEqual(wy, 25);
});

it('R3: snap.js snaps strictly to 1x1mm integer coordinates when gsnap is enabled', () => {
  options.osnap = false;
  options.gsnap = true;
  options.ortho = false;

  view.scale = 1;
  view.panX = 0;
  view.panY = 0;

  // Screen point at x=14.3, y=-28.7
  const res = resolvePoint(14.3, -28.7);
  assert.strictEqual(res.p.x, 14);
  assert.strictEqual(res.p.y, 29);
});

it('R3: snap.js collects OSNAP points (END, MID, CEN, QUA) across lines, polylines, circles, arcs, bends', () => {
  state.ents = [
    { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { type: 'circle', cx: 50, cy: 50, r: 10 },
    { type: 'bend', direction: 'UP', x1: 20, y1: 0, x2: 20, y2: 40 }
  ];

  const snaps = collectSnapPoints();
  const snapTypes = new Set(snaps.map(s => s.type));
  assert(snapTypes.has('END'), 'Must have END snaps');
  assert(snapTypes.has('MID'), 'Must have MID snaps');
  assert(snapTypes.has('CEN'), 'Must have CEN snaps');
  assert(snapTypes.has('QUA'), 'Must have QUA snaps');
});

// -----------------------------------------------------------------------------
// Group 5: Requirement R3 - Decomposed Modules: Smart Dimension & Bend Graphics
// -----------------------------------------------------------------------------
it('R3: drawDimensionGraphic renders witness lines, dimension lines, arrows, and badge for bend lines', () => {
  const bendEnt = {
    id: 99,
    type: 'bend',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 0, y1: 0,
    x2: 0, y2: 60
  };

  const dim = resolveSmartDim(bendEnt, 0, 30);
  assert.strictEqual(dim.type, 'bend');
  assert(dim.label.includes('UP 90° (L=60.00 mm)'));

  drawCalls = [];
  drawDimensionGraphic(dim, '#00e5ff', true);

  // Must render dimension graphics: witness lines, dimension line, arrows, and badge
  const hasLineDash = drawCalls.some(c => Array.isArray(c) && c[0] === 'setLineDash');
  const hasMoveTo = drawCalls.some(c => Array.isArray(c) && c[0] === 'moveTo');
  const hasLineTo = drawCalls.some(c => Array.isArray(c) && c[0] === 'lineTo');
  const hasFillText = drawCalls.some(c => Array.isArray(c) && c[0] === 'fillText' && c[1].includes('UP 90°'));

  assert(hasLineDash, 'drawDimensionGraphic must set dashed witness lines');
  assert(hasMoveTo && hasLineTo, 'drawDimensionGraphic must draw geometry lines');
  assert(hasFillText, 'drawDimensionGraphic must render dimension text badge');
});

it('R3: Smart Dimension on line with intact joints and orthogonal box edges (dir=start, dir=center)', () => {
  // Box of 4 lines
  state.ents = [];
  const b = addEntity({ id: 1, type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 });
  const r = addEntity({ id: 2, type: 'line', x1: 100, y1: 0, x2: 100, y2: 50 });
  const t = addEntity({ id: 3, type: 'line', x1: 100, y1: 50, x2: 0, y2: 50 });
  const l = addEntity({ id: 4, type: 'line', x1: 0, y1: 50, x2: 0, y2: 0 });

  // 1. Grow end (dir=start) by +20mm -> right edge translates to x=120
  const dimBottom = resolveSmartDim(b, 50, 0);
  applySmartDimension(dimBottom, 120, { dir: 'start', keepJoints: true, moveOrtho: true });

  assert.strictEqual(b.x2, 120, 'b.x2 must be 120');
  assert.strictEqual(r.x1, 120, 'r.x1 must translate to 120');
  assert.strictEqual(r.x2, 120, 'r.x2 must translate to 120');
  assert.strictEqual(t.x1, 120, 't.x1 must move to 120');
  assert.strictEqual(l.x1, 0, 'l.x1 must remain at 0');

  // 2. Symmetric center resize (dir=center) by +20mm (from 120 to 140)
  // Each end expands by +10mm -> x1 goes to -10, x2 goes to 130
  // Left edge translates to -10, Right edge translates to 130
  const dimCenter = resolveSmartDim(b, 60, 0);
  applySmartDimension(dimCenter, 140, { dir: 'center', keepJoints: true, moveOrtho: true });

  assert.strictEqual(b.x1, -10, 'b.x1 must expand symmetrically to -10');
  assert.strictEqual(b.x2, 130, 'b.x2 must expand symmetrically to 130');
  assert.strictEqual(l.x1, -10, 'l.x1 must translate parallelly to -10');
  assert.strictEqual(l.x2, -10, 'l.x2 must translate parallelly to -10');
  assert.strictEqual(r.x1, 130, 'r.x1 must translate parallelly to 130');
  assert.strictEqual(r.x2, 130, 'r.x2 must translate parallelly to 130');
});

// -----------------------------------------------------------------------------
// Group 6: Requirement R3 - Decomposed Modules: Explode (X) and Join (J) Tools
// -----------------------------------------------------------------------------
it('R3: Explode (X) and Join (J) round-trip equivalence', () => {
  state.ents = [];
  selectedIds.clear();

  // Create a 4-point closed polyline rectangle
  const poly = addEntity({
    type: 'poly',
    closed: true,
    pts: [
      { x: 0, y: 0, b: 0 },
      { x: 50, y: 0, b: 0 },
      { x: 50, y: 30, b: 0 },
      { x: 0, y: 30, b: 0 }
    ]
  });

  selectedIds.add(poly.id);
  assert.strictEqual(state.ents.length, 1);

  // Explode polyline into 4 lines
  explodeSelection();
  assert.strictEqual(state.ents.length, 4, 'Must explode into 4 line segments');
  assert(state.ents.every(e => e.type === 'line'), 'All exploded parts must be lines');
  assert.strictEqual(selectedIds.size, 4, 'All 4 lines must be selected');

  // Join the 4 lines back into 1 unified closed polyline
  joinSelection();
  assert.strictEqual(state.ents.length, 1, 'Must join back into 1 unified polyline');
  assert.strictEqual(state.ents[0].type, 'poly', 'Joined entity must be poly');
  assert.strictEqual(state.ents[0].closed, true, 'Joined polyline must be closed');
  assert.strictEqual(state.ents[0].pts.length, 4, 'Joined polyline must have 4 vertices');
});

// -----------------------------------------------------------------------------
// Group 7: Requirement R3 - Decomposed Modules: Parametric Part Library (7 Shapes)
// -----------------------------------------------------------------------------
it('R3: Parametric Part Library contains all 7 standard IGEMS shapes and generates valid entities', () => {
  assert.strictEqual(Parts.CATALOG.length, 7, 'Part Library must define all 7 standard shapes');
  const expectedShapes = ['flange', 'baseplate', 'slotted', 'washer', 'liftingLug', 'gusset', 'hexagon'];
  const catalogIds = Parts.CATALOG.map(p => p.id);
  expectedShapes.forEach(id => assert(catalogIds.includes(id), `Shape "${id}" must exist in catalog`));

  // Generate each shape and verify valid CAD geometry
  Parts.CATALOG.forEach(part => {
    const defaults = {};
    part.params.forEach(param => { defaults[param.key] = param.default; });
    const ents = part.generator(defaults, 10, 20);
    assert(ents && ents.length > 0, `Shape ${part.name} must generate entities`);
    ents.forEach(e => {
      assert(e.type, `Entity in ${part.name} must have type`);
      const bb = Geo.bbox(e);
      assert(!isNaN(bb[0]) && !isNaN(bb[2]), `Bounding box of ${part.name} must be valid numbers`);
    });
  });
});

// -----------------------------------------------------------------------------
// Group 8: Requirement R3 - Decomposed Modules: Sheet Metal Unfolding & DXF Round-Trip
// -----------------------------------------------------------------------------
it('R3: Sheet metal bend line creation, flat blank unfolding, and DXF export parity', () => {
  state.ents = [];
  const bracket = SheetMetal.createFormedBracket(60, 40, 30, {
    angle: 90,
    radius: 2.0,
    direction: 'UP',
    thickness: 2.0,
    kFactor: 0.44
  });

  addEntity(bracket.contour);
  addEntity(bracket.bendLine);

  // Unfold bracket
  const unfolded = SheetMetal.unfoldContour(state.ents, state.sheetMetal);
  const unfoldedPoly = unfolded.find(e => e.type === 'poly');
  const unfoldedBend = unfolded.find(e => e.type === 'bend');
  assert(unfoldedPoly && unfoldedBend);

  const bb = Geo.bbox(unfoldedPoly);
  const flatWidth = +(bb[2] - bb[0]).toFixed(3);
  // Formed width = 60 + 40 = 100mm; BD = 3.476mm; Flat blank = 96.524mm
  assert.strictEqual(flatWidth, 96.524, 'Compensated blank length must be exactly 96.524 mm');

  // Export DXF
  const dxfString = Dxf.toDXF(unfolded, state.layers);
  assert(dxfString.includes('BEND_UP'), 'DXF must contain BEND_UP layer');
  assert(dxfString.includes('1001\r\nBEND') || dxfString.includes('1001\nBEND'), 'DXF must contain BEND XDATA app');

  // Re-import DXF
  const imported = Dxf.parseDXF(dxfString);
  const importedBend = imported.ents.find(e => e.type === 'bend');
  assert(importedBend, 'Re-imported DXF must contain bend entity');
  assert.strictEqual(importedBend.direction, 'UP');
  assert.strictEqual(importedBend.angle, 90);
});

// -----------------------------------------------------------------------------
// Group 9: Requirement R4 - Cross-Platform npm Scripts & Multi-Target Packaging
// -----------------------------------------------------------------------------
it('R4: package.json defines standard cross-platform npm scripts and electron-builder multi-target packaging', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  // Standard npm scripts
  assert(pkg.scripts.dev.includes('concurrently') && pkg.scripts.dev.includes('vite'), 'npm run dev launches Vite and Electron');
  assert.strictEqual(pkg.scripts.build, 'vite build', 'npm run build compiles via Vite');
  assert(pkg.scripts.pack.includes('electron-builder --dir'), 'npm run pack packages directory');
  assert(pkg.scripts.dist.includes('electron-builder'), 'npm run dist packages installer');

  // Multi-target declarations
  assert(pkg.build.win.target.includes('nsis') && pkg.build.win.target.includes('portable'), 'Windows targets nsis and portable');
  assert(pkg.build.mac.target.includes('dmg') && pkg.build.mac.target.includes('zip'), 'macOS targets dmg and zip');
  assert(pkg.build.linux.target.includes('AppImage'), 'Linux targets AppImage');
});

// -----------------------------------------------------------------------------
// Group 10: Edge Cases, State Integrity & UI Synchronization
// -----------------------------------------------------------------------------
it('R3: redo() prunes phantom entity IDs from selectedIds and deleteSelected() hides HUDs', () => {
  state.ents = [];
  selectedIds.clear();
  let hudHidden = false;
  registerCallbacks({
    render: () => {},
    updateUI: () => {},
    updatePrompt: () => {},
    hideHUDs: () => { hudHidden = true; }
  });

  const ent1 = addEntity({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 });
  const ent2 = addEntity({ type: 'line', x1: 0, y1: 10, x2: 10, y2: 10 });
  selectedIds.add(ent1.id);

  // 1. deleteSelected hides open HUDs and deletes ent1
  hudHidden = false;
  deleteSelected();
  assert(hudHidden, 'deleteSelected must hide open HUD popovers');
  assert.strictEqual(state.ents.length, 1);
  assert.strictEqual(state.ents[0].id, ent2.id);

  // 2. undo restores ent1
  undo();
  assert.strictEqual(state.ents.length, 2);

  // 3. User selects ent1 again and clicks redo
  selectedIds.add(ent1.id);
  redo();
  assert.strictEqual(state.ents.length, 1);
  assert.strictEqual(state.ents[0].id, ent2.id);
  assert(!selectedIds.has(ent1.id), 'redo() must prune deleted entity IDs from selectedIds');
  assert.strictEqual(selectedIds.size, 0, 'selectedIds must be completely empty');
});

it('R3: Escape key in manual dimension input HUD clears activePoints and dismisses preview', () => {
  initManualInputHUD();
  setActivePoints([{ x: 20, y: 30 }]);
  showManualInputHUD('line', { x: 20, y: 30 });

  assert.strictEqual(mockElements['manual-input-box'].style.display, 'flex');
  assert.strictEqual(activePoints.length, 1);

  let rendered = false;
  let promptUpdated = false;
  registerCallbacks({
    render: () => { rendered = true; },
    updateUI: () => {},
    updatePrompt: () => { promptUpdated = true; },
    hideHUDs: () => {}
  });

  // Trigger Escape key inside the manual input field
  mockElements['hud-val-w'].trigger('keydown', { key: 'Escape', preventDefault() {} });

  assert.strictEqual(mockElements['manual-input-box'].style.display, 'none', 'HUD must be hidden on Escape');
  assert.strictEqual(activePoints.length, 0, 'activePoints must be cleared to eliminate rubber-band preview');
  assert(rendered, 'Viewport must re-render to erase preview line');
  assert(promptUpdated, 'Prompt bar must update instruction text');
});

it('R3: hideSmartDimHUD() triggers viewport re-render to erase active dimension graphic', () => {
  let rendered = false;
  registerCallbacks({
    render: () => { rendered = true; },
    updateUI: () => {},
    updatePrompt: () => {},
    hideHUDs: () => {}
  });

  const dummyDim = { type: 'line', targetId: 1, val: 50, p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 } };
  showSmartDimHUD(dummyDim);
  assert(smartDimState.activeDim, 'Active dim must be set');

  rendered = false;
  hideSmartDimHUD();
  assert.strictEqual(smartDimState.activeDim, null, 'Active dim must be cleared');
  assert(rendered, 'hideSmartDimHUD must re-render viewport immediately');
});

it('R3: insertSelectedPart() triggers updateUI callback to synchronize properties panel', () => {
  state.ents = [];
  selectedIds.clear();

  let uiUpdated = false;
  registerCallbacks({
    render: () => {},
    updateUI: () => { uiUpdated = true; },
    updatePrompt: () => {},
    hideHUDs: () => {}
  });

  selectPart('washer');
  uiUpdated = false;
  insertSelectedPart();

  assert(uiUpdated, 'insertSelectedPart must invoke updateUI callback to synchronize sidebar');
  assert(selectedIds.size > 0, 'Inserted part entities must be selected');
  assert(state.ents.length > 0, 'Entities must be added to state.ents');
  for (const id of selectedIds) {
    assert(state.ents.some(e => e.id === id), 'All selected IDs must exist in state.ents');
  }
});

it('R3: handleTrimPoint() removes trimmed entity ID from selectedIds', () => {
  state.ents = [];
  selectedIds.clear();

  const line1 = addEntity({ id: 101, type: 'line', x1: 0, y1: 10, x2: 100, y2: 10 });
  const cutter = addEntity({ id: 102, type: 'line', x1: 50, y1: 0, x2: 50, y2: 20 });
  selectedIds.add(line1.id);

  // Trim right segment of line 1 (at x=80, y=10)
  const [sx, sy] = toScreen(80, 10);
  handleTrimPoint({ x: 80, y: 10 }, sx, sy);

  assert(!state.ents.some(e => e.id === line1.id), 'Old entity must be deleted');
  assert(!selectedIds.has(line1.id), 'Deleted entity must be removed from selectedIds');
});

it('R3: explodeSelection() and joinSelection() invoke updateUI callback', () => {
  state.ents = [];
  selectedIds.clear();

  let uiCallCount = 0;
  registerCallbacks({
    render: () => {},
    updateUI: () => { uiCallCount++; },
    updatePrompt: () => {},
    hideHUDs: () => {}
  });

  const poly = addEntity({
    type: 'poly',
    closed: true,
    pts: [
      { x: 0, y: 0, b: 0 },
      { x: 20, y: 0, b: 0 },
      { x: 20, y: 20, b: 0 },
      { x: 0, y: 20, b: 0 }
    ]
  });
  selectedIds.add(poly.id);

  uiCallCount = 0;
  explodeSelection();
  assert.strictEqual(uiCallCount, 1, 'explodeSelection must invoke updateUI');

  uiCallCount = 0;
  joinSelection();
  assert.strictEqual(uiCallCount, 1, 'joinSelection must invoke updateUI');
});

it('R3: options.openEnds is cleared on loadDxfText', () => {
  options.openEnds = [{ x: 10, y: 10 }, { x: 20, y: 20 }];
  const dxf = `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n50\n21\n0\n0\nENDSEC\n0\nEOF\n`;
  loadDxfText(dxf, 'test.dxf');
  assert.strictEqual(options.openEnds.length, 0, 'options.openEnds must be cleared on new DXF import');
});

it('R3: explodeSelection() on non-explodable entity does not pollute undo history stack', () => {
  state.ents = [];
  selectedIds.clear();
  history.undoStack.length = 0;

  const line = addEntity({ type: 'line', x1: 0, y1: 0, x2: 50, y2: 0 });
  selectedIds.add(line.id);

  const initialUndoDepth = history.undoStack.length;
  explodeSelection();

  assert.strictEqual(history.undoStack.length, initialUndoDepth, 'No undo snapshot should be pushed when explode is a no-op');
  assert.strictEqual(state.ents.length, 1, 'Entity count unchanged');
  assert.strictEqual(state.ents[0].id, line.id, 'Original line entity remains unchanged');
});

it('R3: findNearestPolySegment, resolveSmartDim, and drawDimensionGraphic safely handle degenerate geometry without throwing', () => {
  // Empty and 1-point polylines
  const emptyPoly = { type: 'poly', pts: [], closed: false };
  const singlePtPoly = { type: 'poly', pts: [{ x: 10, y: 10, b: 0 }], closed: false };

  assert.strictEqual(findNearestPolySegment(emptyPoly, 10, 10), null);
  assert.strictEqual(findNearestPolySegment(singlePtPoly, 10, 10), null);
  assert.strictEqual(resolveSmartDim(emptyPoly, 10, 10), null);
  assert.strictEqual(resolveSmartDim(singlePtPoly, 10, 10), null);

  // drawDimensionGraphic null / missing checks
  assert.doesNotThrow(() => {
    drawDimensionGraphic(null, '#00e5ff', false);
    drawDimensionGraphic({ type: 'line' }, '#00e5ff', false);
    drawDimensionGraphic({ type: 'poly_seg' }, '#00e5ff', false);
    drawDimensionGraphic({ type: 'arc' }, '#00e5ff', false);
  });
});

it('R2: vite.config.js transforms UMD core modules into valid ESM with default exports in dev server', () => {
  const viteConfigPath = path.join(rootDir, 'vite.config.js');
  const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf8');
  assert(viteConfigContent.includes('core-umd-to-esm'), 'vite.config.js must include core UMD transform plugin');
  assert(viteConfigContent.includes('export default module.exports'), 'Plugin must export default module.exports');
});

console.log('\n========================================');
console.log(`ALL ${testsPassed}/${totalTests} MODULAR ARCHITECTURE TESTS PASSED!`);
console.log('========================================\n');
