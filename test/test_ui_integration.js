const assert = require('assert');
const Geo = require('../src/core/geometry.js');
const Dxf = require('../src/core/dxf.js');
const Cam = require('../src/core/cam.js');
const SheetMetal = require('../src/core/sheetmetal.js');

console.log('=== RUNNING SHEET METAL UI & INTERACTIVE INTEGRATION TESTS ===\n');

// Mock a lightweight DOM environment for headless testing
function createMockElement(id, tagName = 'div', initialVal = '') {
  return {
    id,
    tagName: tagName.toUpperCase(),
    value: initialVal,
    textContent: initialVal,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c);
        } else if (force) this._classes.add(c);
        else this._classes.delete(c);
      },
      contains(c) { return this._classes.has(c); }
    },
    style: {},
    dataset: {},
    children: [],
    appendChild(c) { this.children.push(c); },
    addEventListener(ev, fn) { this['on' + ev] = fn; },
    onclick: null,
    onchange: null
  };
}

const mockElements = {
  'sm-mat-select': createMockElement('sm-mat-select', 'select', 'mild_steel'),
  'sm-side-mat': createMockElement('sm-side-mat', 'select', 'mild_steel'),
  'sm-thickness': createMockElement('sm-thickness', 'input', '2.0'),
  'sm-side-t': createMockElement('sm-side-t', 'input', '2.0'),
  'sm-kfactor': createMockElement('sm-kfactor', 'input', '0.44'),
  'sm-side-k': createMockElement('sm-side-k', 'input', '0.44'),
  'sm-bend-angle': createMockElement('sm-bend-angle', 'input', '90'),
  'sm-side-ang': createMockElement('sm-side-ang', 'input', '90'),
  'sm-bend-radius': createMockElement('sm-bend-radius', 'input', '2.0'),
  'sm-side-rad': createMockElement('sm-side-rad', 'input', '2.0'),
  'sm-bend-dir': createMockElement('sm-bend-dir', 'select', 'UP'),
  'btn-toggle-sm-view': createMockElement('btn-toggle-sm-view', 'button'),
  'lbl-sm-view-mode': createMockElement('lbl-sm-view-mode', 'span', 'Formed View'),
  'btn-quick-bracket': createMockElement('btn-quick-bracket', 'button'),
  'btn-export-flat-dxf': createMockElement('btn-export-flat-dxf', 'button'),
  'btn-bend-tool': createMockElement('btn-bend-tool', 'button'),
  'btn-draw-bend': createMockElement('btn-draw-bend', 'button'),
  'sm-hud-ba': createMockElement('sm-hud-ba', 'span'),
  'sm-hud-ossb': createMockElement('sm-hud-ossb', 'span'),
  'sm-hud-bd': createMockElement('sm-hud-bd', 'span'),
  'sm-hud-delta': createMockElement('sm-hud-delta', 'span'),
  'sm-badge-status': createMockElement('sm-badge-status', 'span'),
  'selection-properties': createMockElement('selection-properties', 'div'),
  'layers-container': createMockElement('layers-container', 'div')
};

global.document = {
  getElementById(id) { return mockElements[id] || null; },
  querySelectorAll(sel) { return []; },
  createElement(tag) { return createMockElement('created', tag); },
  activeElement: null
};

global.window = {
  Geo,
  Dxf,
  SheetMetal,
  addEventListener() {}
};

// --------------------------------------------------------------------------
// Test 1: Simulation of Bend Line creation across drawn part
// --------------------------------------------------------------------------
const state = {
  ents: [],
  layers: [
    { name: '0', aci: 7, visible: true },
    { name: 'PARTS', aci: 3, visible: true },
    { name: 'BEND_UP', aci: 6, visible: true },
    { name: 'BEND_DOWN', aci: 2, visible: true }
  ],
  sheetMetal: {
    material: 'mild_steel',
    thickness: 2.0,
    kFactor: 0.44,
    defaultAngle: 90,
    defaultRadius: 2.0,
    defaultDir: 'UP',
    viewMode: 'formed'
  },
  nextId: 1
};

console.log('1. Testing Quick Bracket creation...');
const bracket = SheetMetal.createFormedBracket(50, 50, 50, {
  angle: 90,
  radius: 2.0,
  direction: 'UP',
  thickness: state.sheetMetal.thickness,
  kFactor: state.sheetMetal.kFactor
});

state.ents.push(bracket.contour);
state.ents.push(bracket.bendLine);

assert.strictEqual(state.ents.length, 2, 'Must have 2 entities (contour + bend line)');
console.log('   ✓ Formed Bracket created with contour and bend line');

// --------------------------------------------------------------------------
// Test 2: Calculate Flat Blank Unfolding
// --------------------------------------------------------------------------
console.log('2. Testing Flat Blank Unfolding...');
const unfolded = SheetMetal.unfoldContour(state.ents, state.sheetMetal);
const contour = unfolded.find(e => e.type === 'poly');
const bb = Geo.bbox(contour);
const blankLen = +(bb[2] - bb[0]).toFixed(3);
assert.strictEqual(blankLen, 96.524, 'Blank length must be exactly 96.524 mm');
console.log(`   ✓ Formed Length 100mm compensated with BD=3.476mm to Flat Blank = ${blankLen} mm`);

// --------------------------------------------------------------------------
// Test 3: Material change to Aluminum immediately recalculates
// --------------------------------------------------------------------------
console.log('3. Testing Material change to Aluminum (T=3.0, K=0.40, R=3.0)...');
state.sheetMetal.material = 'aluminum';
state.sheetMetal.thickness = 3.0;
state.sheetMetal.kFactor = 0.40;
bracket.bendLine.radius = 3.0;

const alCalc = SheetMetal.computeBend({
  angle: bracket.bendLine.angle,
  thickness: state.sheetMetal.thickness,
  radius: bracket.bendLine.radius,
  kFactor: state.sheetMetal.kFactor
});

assert.strictEqual(alCalc.OSSB_formatted, 6.000);
assert.strictEqual(alCalc.BA_formatted, 6.597);
assert.strictEqual(alCalc.BD_formatted, 5.403);
console.log(`   ✓ Aluminum recalculated: OSSB=${alCalc.OSSB_formatted}mm, BA=${alCalc.BA_formatted}mm, BD=${alCalc.BD_formatted}mm`);

const alUnfolded = SheetMetal.unfoldContour(state.ents, state.sheetMetal);
const alContour = alUnfolded.find(e => e.type === 'poly');
const alBb = Geo.bbox(alContour);
const alBlankLen = +(alBb[2] - alBb[0]).toFixed(3);
assert.strictEqual(alBlankLen, 94.597, 'Aluminum blank length must be 94.597 mm (100 - 5.403)');
console.log(`   ✓ Aluminum Flat Blank = ${alBlankLen} mm`);

// --------------------------------------------------------------------------
// Test 4: DXF Export generation with BEND_UP layer
// --------------------------------------------------------------------------
console.log('4. Testing DXF Export with Bends...');
const dxfContent = Dxf.toDXF(alUnfolded, state.layers);
assert(dxfContent.includes('SECTION\r\n2\r\nHEADER') || dxfContent.includes('SECTION\n2\nHEADER'), 'DXF Header section');
assert(dxfContent.includes('BEND_UP'), 'DXF must contain BEND_UP layer');
assert(dxfContent.includes('PARTS'), 'DXF must contain PARTS layer');
assert(dxfContent.includes('DASHED'), 'DXF must define DASHED linetype');
assert(dxfContent.includes('1001\r\nBEND') || dxfContent.includes('1001\nBEND'), 'DXF press brake XDATA application name');
assert(dxfContent.includes('ANGLE=90'), 'DXF press brake XDATA angle');
assert(dxfContent.includes('RADIUS=3'), 'DXF press brake XDATA radius');
assert(dxfContent.includes('BD=5.403'), 'DXF press brake XDATA BD value');
console.log('   ✓ DXF export verified with standard press brake layers and group codes');

// --------------------------------------------------------------------------
// Test 5: Entity picking in Compensated Flat Blank view mode
// --------------------------------------------------------------------------
console.log('5. Testing Entity Picking in Compensated Flat Blank View...');
function pickSim(wx, wy, simState) {
  const isFlatView = simState.sheetMetal && simState.sheetMetal.viewMode === 'flat' && simState.ents.some(e => e.type === 'bend');
  const entsToPick = isFlatView ? SheetMetal.unfoldContour(simState.ents, simState.sheetMetal) : simState.ents;
  let best = null, bd = 5.0;
  entsToPick.forEach(e => {
    const d = Geo.distEnt(e, wx, wy);
    if (d < bd) {
      bd = d;
      best = isFlatView ? (simState.ents.find(orig => orig.id === e.id) || e) : e;
    }
  });
  return best;
}

state.sheetMetal.viewMode = 'flat';
// Left edge in formed view was at x=0; in flat view it is shifted to x = +halfBD = +2.7015 mm
// Testing picking at x=2.70, y=20 (on the flat blank boundary)
const pickedInFlat = pickSim(2.70, 20, state);
assert(pickedInFlat, 'Should successfully pick contour in flat blank view');
assert.strictEqual(pickedInFlat.type, 'poly');
console.log('   ✓ Entity picking operates seamlessly on compensated flat blank geometry');

// --------------------------------------------------------------------------
// Test 6: CAM toolpath generation on compensated flat blank
// --------------------------------------------------------------------------
console.log('6. Testing CAM Toolpath Generation with Flat Blank...');
const flatForCam = SheetMetal.unfoldContour(state.ents, state.sheetMetal);
const toolpath = Cam.buildToolpath(flatForCam);
assert.strictEqual(toolpath.cuts.length, 1, 'Only outer perimeter must have CAM cut path, excluding bend line');
const cutSegs = toolpath.cuts[0].geometry;
const cutBb = Geo.bbox(Geo.entFromSegs(cutSegs, true));
assert.strictEqual(+(cutBb[2] - cutBb[0]).toFixed(3), 94.597, 'Cut toolpath must follow compensated 94.597 mm blank');
console.log('   ✓ CAM toolpaths correctly exclude bend lines and follow compensated blank dimensions');

// --------------------------------------------------------------------------
// Test 7: Box Selection in Compensated Flat Blank View
// --------------------------------------------------------------------------
console.log('7. Testing Box Selection in Compensated Flat Blank View...');
function boxSelectSim(x0, y0, x1, y1, isWindow, simState) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const selected = new Set();
  const isFlatView = simState.sheetMetal && simState.sheetMetal.viewMode === 'flat' && simState.ents.some(e => e.type === 'bend');
  const entsToSelect = isFlatView ? SheetMetal.unfoldContour(simState.ents, simState.sheetMetal) : simState.ents;
  entsToSelect.forEach((ent, idx) => {
    const bb = Geo.bbox(ent);
    const inside = bb[0] >= minX && bb[2] <= maxX && bb[1] >= minY && bb[3] <= maxY;
    const touch = !(bb[2] < minX || bb[0] > maxX || bb[3] < minY || bb[1] > maxY);
    if (isWindow ? inside : touch) {
      const orig = isFlatView ? (ent.id != null ? simState.ents.find(o => o.id === ent.id) : simState.ents[idx]) : ent;
      if (orig && orig.id != null) selected.add(orig.id);
    }
  });
  return selected;
}

state.ents[0].id = 1;
state.ents[1].id = 2;
// Box encompassing flat blank [2.0 to 98.0, -1 to 51]
const selectedBox = boxSelectSim(2.0, -1, 98.0, 51, true, state);
assert(selectedBox.has(1), 'Contour must be selected inside flat blank box');
assert(selectedBox.has(2), 'Bend line must be selected inside flat blank box');
console.log('   ✓ Box selection accurately selects entities based on compensated flat blank coordinates');

// --------------------------------------------------------------------------
// Test 8: OSNAP Snap Point Collection in Compensated Flat Blank View
// --------------------------------------------------------------------------
console.log('8. Testing OSNAP Snapping in Compensated Flat Blank View...');
function collectSnapPointsSim(simState) {
  const pts = [];
  const isFlatView = simState.sheetMetal && simState.sheetMetal.viewMode === 'flat' && simState.ents.some(e => e.type === 'bend');
  const entsToSnap = isFlatView ? SheetMetal.unfoldContour(simState.ents, simState.sheetMetal) : simState.ents;
  entsToSnap.forEach(e => {
    switch (e.type) {
      case 'line':
      case 'bend':
        pts.push({ x: e.x1, y: e.y1, type: 'END' }, { x: e.x2, y: e.y2, type: 'END' });
        pts.push({ x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2, type: 'MID' });
        break;
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

const flatSnaps = collectSnapPointsSim(state);
// In formed view, left-most point was x=0; in flat view, left-most point must be > 0 (x ≈ 2.7015 mm)
const minSnapX = Math.min(...flatSnaps.map(p => p.x));
assert(minSnapX > 2.0 && minSnapX < 3.0, `Flat blank snap point must be shifted to contracted blank edge (got ${minSnapX})`);
console.log(`   ✓ OSNAP points correctly snap to compensated flat blank perimeter at x=${minSnapX.toFixed(3)} mm`);

// --------------------------------------------------------------------------
// Test 9: Smart Dimension HUD on Bend Lines
// --------------------------------------------------------------------------
console.log('9. Testing Smart Dimension HUD on Bend Lines...');
function resolveSmartDimSim(e) {
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
  }
}

const dimRes = resolveSmartDimSim(bracket.bendLine);
assert(dimRes, 'Smart Dimension must resolve bend lines');
assert.strictEqual(dimRes.type, 'bend');
assert(dimRes.label.includes('UP 90°'), `Label must contain bend direction and angle: ${dimRes.label}`);
assert(dimRes.label.includes('50.00 mm'), `Label must contain bend length: ${dimRes.label}`);
console.log(`   ✓ Smart Dimension resolves bend line badge: "${dimRes.label}"`);

// --------------------------------------------------------------------------
// Test 10: Multi-Selected Bend Lines Parameter Update
// --------------------------------------------------------------------------
console.log('10. Testing Multi-Selection Bend Line Parameter Update...');
const bendA = { id: 10, type: 'bend', angle: 90, radius: 2.0, direction: 'UP' };
const bendB = { id: 11, type: 'bend', angle: 90, radius: 2.0, direction: 'UP' };
const simEnts = [bendA, bendB];
const simSel = new Set([10, 11]);

function multiAngChangeSim(val, ents, selIds, smSettings) {
  const parsed = parseFloat(val);
  const a = !isNaN(parsed) ? Math.max(1, Math.min(179, parsed)) : 90;
  const selBends = ents.filter(e => selIds.has(e.id) && e.type === 'bend');
  selBends.forEach(b => {
    b.angle = a;
    const c = SheetMetal.computeBend({
      angle: a,
      thickness: smSettings.thickness,
      radius: b.radius != null ? b.radius : 2.0,
      kFactor: smSettings.kFactor
    });
    b.ba = c.BA_formatted;
    b.bd = c.BD_formatted;
    b.ossb = c.OSSB_formatted;
  });
}

multiAngChangeSim(45, simEnts, simSel, state.sheetMetal);
assert.strictEqual(bendA.angle, 45, 'Bend A angle must update to 45');
assert.strictEqual(bendB.angle, 45, 'Bend B angle must update to 45');
assert.strictEqual(bendA.bd, bendB.bd, 'Both bends must have identical recalculated BD');
console.log(`   ✓ Both selected bend lines simultaneously updated to 45° with BD=${bendA.bd} mm`);

// --------------------------------------------------------------------------
// Test 11: Mirror Tool on Selection with Bend Lines
// --------------------------------------------------------------------------
console.log('11. Testing Mirror Tool Interactive Execution with Bend Lines...');
const mirrorPart = {
  id: 20,
  type: 'poly',
  closed: true,
  pts: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 0, y: 30 }]
};
const mirrorBend = {
  id: 21,
  type: 'bend',
  direction: 'UP',
  angle: 90,
  radius: 2.0,
  thickness: 2.0,
  kFactor: 0.44,
  ba: 4.524,
  bd: 3.476,
  x1: 25, y1: 0,
  x2: 25, y2: 30
};
const mirrorEnts = [mirrorPart, mirrorBend];
const mirrorSel = new Set([20, 21]);

function handleMirrorSim(p1, p2, ents, selIds) {
  if (Geo.dist(p1, p2) > 1e-6) {
    ents.filter(e => selIds.has(e.id)).forEach(e => Geo.mirrorEnt(e, p1, p2));
  }
}

// Mirror across axis x = 50: (x' = 2*50 - x)
handleMirrorSim({ x: 50, y: 0 }, { x: 50, y: 100 }, mirrorEnts, mirrorSel);
assert.strictEqual(mirrorBend.type, 'bend', 'Mirror must keep bend entity type');
assert.strictEqual(+mirrorBend.x1.toFixed(3), 75.0, 'Bend line x1 must be mirrored to 75');
assert.strictEqual(+mirrorBend.x2.toFixed(3), 75.0, 'Bend line x2 must be mirrored to 75');
assert.strictEqual(mirrorBend.direction, 'UP', 'Direction preserved');
assert.strictEqual(mirrorBend.angle, 90, 'Angle preserved');
console.log(`   ✓ Mirror tool accurately mirrors bend lines and part boundary across arbitrary axis`);

// --------------------------------------------------------------------------
// Test 12: Smart Dimension Resize of Bend Line & Connected Joint Vertices
// --------------------------------------------------------------------------
console.log('12. Testing Smart Dimension on Bend Line and Connected Joints...');
const dimBend = {
  id: 30,
  type: 'bend',
  direction: 'UP',
  angle: 90,
  radius: 2.0,
  x1: 50, y1: 0,
  x2: 50, y2: 50
};
const boundaryLine = {
  id: 31,
  type: 'line',
  x1: 50, y1: 50,
  x2: 100, y2: 50
};
const dimEnts = [dimBend, boundaryLine];

function moveJointVertexSim(pOld, pNew, ents, excludeIds = [], tol = 0.05) {
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds : [excludeIds]);
  ents.forEach(other => {
    if (excludeSet.has(other.id)) return;
    if (other.type === 'line' || other.type === 'bend') {
      if (Math.hypot(other.x1 - pOld.x, other.y1 - pOld.y) <= tol) {
        other.x1 = pNew.x; other.y1 = pNew.y;
      }
      if (Math.hypot(other.x2 - pOld.x, other.y2 - pOld.y) <= tol) {
        other.x2 = pNew.x; other.y2 = pNew.y;
      }
    }
  });
}

function applySmartDimSim(target, newVal, ents) {
  if (target.type === 'line' || target.type === 'bend') {
    const curLen = Math.hypot(target.x2 - target.x1, target.y2 - target.y1);
    const delta = newVal - curLen;
    const ux = (target.x2 - target.x1) / curLen;
    const uy = (target.y2 - target.y1) / curLen;
    const oldP2 = { x: target.x2, y: target.y2 };
    target.x2 += delta * ux;
    target.y2 += delta * uy;
    moveJointVertexSim(oldP2, { x: target.x2, y: target.y2 }, ents, [target.id]);
  }
}

// Resize bend from length 50 to 60 mm
applySmartDimSim(dimBend, 60, dimEnts);
assert.strictEqual(dimBend.y2, 60, 'Bend end y2 must be resized to 60');
assert.strictEqual(boundaryLine.y1, 60, 'Connected boundary line endpoint must follow joint to 60');
console.log(`   ✓ Smart Dimension resizes bend line and dynamically maintains attached joint vertices`);

// --------------------------------------------------------------------------
// Test 13: CAM Toolpath Simulation in Compensated Flat Blank View
// --------------------------------------------------------------------------
console.log('13. Testing CAM Toolpath Simulation in Flat Blank View...');
const testBracket = SheetMetal.createFormedBracket(50, 50, 50, {
  angle: 90,
  radius: 2.0,
  direction: 'UP',
  thickness: 2.0,
  kFactor: 0.44
});
const camFlatSimState = {
  ents: [testBracket.contour, testBracket.bendLine],
  sheetMetal: { thickness: 2.0, kFactor: 0.44, viewMode: 'flat' }
};

function getCamEntsSim(simState) {
  const isFlat = simState.sheetMetal && simState.sheetMetal.viewMode === 'flat' && simState.ents.some(e => e.type === 'bend');
  return isFlat ? SheetMetal.unfoldContour(simState.ents, simState.sheetMetal) : simState.ents;
}

const entsForCam = getCamEntsSim(camFlatSimState);
const flatCamToolpath = Cam.buildToolpath(entsForCam, { type: 'line', inLen: 3.0 });
const cutGeom = flatCamToolpath.cuts[0].geometry;
// Verify cutting segments correspond to 96.524mm blank width
const camXCoords = cutGeom.flatMap(s => [s.x1, s.x2]);
const camWidth = +(Math.max(...camXCoords) - Math.min(...camXCoords)).toFixed(3);
assert.strictEqual(camWidth, 96.524, 'CAM cut geometry must follow compensated flat blank length 96.524 mm');
console.log(`   ✓ CAM toolpath simulation seamlessly binds to compensated flat blank contour (${camWidth} mm)`);

// --------------------------------------------------------------------------
// Test 14: Side Properties Panel Live Input Without Focus Destruction
// --------------------------------------------------------------------------
console.log('14. Testing Side Properties Panel Live Typing & Calc Spans...');
const mockPropSpans = {
  'prop-calc-rn': createMockElement('prop-calc-rn', 'span'),
  'prop-calc-ba': createMockElement('prop-calc-ba', 'span'),
  'prop-calc-ossb': createMockElement('prop-calc-ossb', 'span'),
  'prop-calc-bd': createMockElement('prop-calc-bd', 'span'),
  'prop-calc-fbd': createMockElement('prop-calc-fbd', 'span'),
  'prop-bend-ang': createMockElement('prop-bend-ang', 'input', '45')
};

function liveBendAngSim(inputVal, bendEnt, smSettings, spans) {
  const pAng = parseFloat(inputVal);
  bendEnt.angle = !isNaN(pAng) ? Math.max(1, Math.min(179, pAng)) : 90;
  const c = SheetMetal.computeBend({
    angle: bendEnt.angle,
    thickness: smSettings.thickness,
    radius: bendEnt.radius != null ? bendEnt.radius : 2.0,
    kFactor: smSettings.kFactor
  });
  bendEnt.ba = c.BA_formatted;
  bendEnt.bd = c.BD_formatted;
  bendEnt.ossb = c.OSSB_formatted;
  spans['prop-calc-rn'].textContent = `${c.Rn_formatted} mm`;
  spans['prop-calc-ba'].textContent = `${c.BA_formatted} mm`;
  spans['prop-calc-ossb'].textContent = `${c.OSSB_formatted} mm`;
  spans['prop-calc-bd'].textContent = `${c.BD_formatted} mm`;
  spans['prop-calc-fbd'].textContent = `-${c.BD_formatted} mm`;
}

const testBendEnt = { type: 'bend', angle: 90, radius: 2.0 };
liveBendAngSim('45', testBendEnt, { thickness: 2.0, kFactor: 0.44 }, mockPropSpans);
assert.strictEqual(testBendEnt.angle, 45);
assert.strictEqual(mockPropSpans['prop-calc-bd'].textContent, '1.052 mm');
assert.strictEqual(mockPropSpans['prop-calc-ba'].textContent, '2.262 mm');
console.log(`   ✓ Live typing updates calc spans in-place (BD=${mockPropSpans['prop-calc-bd'].textContent}) without DOM destruction`);

// --------------------------------------------------------------------------
// Test 15: DXF Import Automatically Syncs Sheet Metal Settings
// --------------------------------------------------------------------------
console.log('15. Testing DXF Import Sheet Metal Settings Synchronization...');
const aluDxfText = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', 'BEND_UP',
  '1001', 'BEND', '1000', 'DIR=UP;ANGLE=90;RADIUS=3.0;THICK=3.0;K=0.40;BA=6.597;BD=5.403',
  '10', '0.0', '20', '0.0', '30', '0.0',
  '11', '0.0', '21', '50.0', '31', '0.0',
  '0', 'ENDSEC', '0', 'EOF'
].join('\n');

const importedDxf = Dxf.parseDXF(aluDxfText);
const importSimState = {
  ents: [],
  sheetMetal: { material: 'mild_steel', thickness: 2.0, kFactor: 0.44 }
};

function loadDxfSim(parsed, simState) {
  parsed.ents.forEach(e => simState.ents.push(e));
  const b = parsed.ents.find(e => e.type === 'bend' && (e.thickness != null || e.kFactor != null));
  if (b && simState.sheetMetal) {
    if (b.thickness != null) simState.sheetMetal.thickness = b.thickness;
    if (b.kFactor != null) simState.sheetMetal.kFactor = b.kFactor;
    const match = Object.values(SheetMetal.MATERIALS).find(m => Math.abs(m.kFactor - simState.sheetMetal.kFactor) < 0.005);
    simState.sheetMetal.material = match ? match.id : 'custom';
  }
}

loadDxfSim(importedDxf, importSimState);
assert.strictEqual(importSimState.sheetMetal.thickness, 3.0, 'Thickness must sync to 3.0 mm');
assert.strictEqual(importSimState.sheetMetal.kFactor, 0.40, 'K-Factor must sync to 0.40');
assert.strictEqual(importSimState.sheetMetal.material, 'aluminum', 'Material preset must sync to aluminum');
console.log(`   ✓ DXF import cleanly synchronizes material to Aluminum (T=${importSimState.sheetMetal.thickness}mm, K=${importSimState.sheetMetal.kFactor})`);

console.log('\n========================================');
console.log('ALL UI & INTEGRATION TESTS PASSED!');
console.log('========================================\n');
