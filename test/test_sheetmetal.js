const assert = require('assert');
const Geo = require('../src/core/geometry.js');
const Dxf = require('../src/core/dxf.js');
const Cam = require('../src/core/cam.js');
const SheetMetal = require('../src/core/sheetmetal.js');

console.log('=== RUNNING SHEET METAL BEND & COMPENSATION TESTS ===\n');

let passedTests = 0;
let totalTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// --------------------------------------------------------------------------
// 1. Acceptance Criteria Mathematical Accuracy: Mild Steel
// --------------------------------------------------------------------------
it('Mild Steel 90° bend (T=2.0, K=0.44, R=2.0) matches Acceptance Criteria', () => {
  const res = SheetMetal.computeBend({
    angle: 90,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });

  assert.strictEqual(res.OSSB_formatted, 4.000, 'OSSB must equal 4.000 mm');
  assert.strictEqual(res.BA_formatted, 4.524, 'BA must equal 4.524 mm');
  assert.strictEqual(res.BD_formatted, 3.476, 'BD must equal 3.476 mm');
  assert.strictEqual(res.Rn_formatted, 2.880, 'Rn must equal 2.880 mm');

  // Two-flange bracket with formed outer dimensions 50mm x 50mm
  const flat = SheetMetal.calculateFlatLength([50, 50], {
    angle: 90,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });

  assert.strictEqual(flat.formedLength, 100.000, 'Formed length must be 100.000 mm');
  assert.strictEqual(flat.totalBD, 3.476, 'Total BD must be 3.476 mm');
  assert.strictEqual(flat.flatLength, 96.524, 'Flat blank length must equal 96.524 mm');
});

// --------------------------------------------------------------------------
// 2. Acceptance Criteria Mathematical Accuracy: Aluminum
// --------------------------------------------------------------------------
it('Aluminum 90° bend (T=3.0, K=0.40, R=3.0) matches Acceptance Criteria', () => {
  const res = SheetMetal.computeBend({
    angle: 90,
    thickness: 3.0,
    radius: 3.0,
    kFactor: 0.40
  });

  assert.strictEqual(res.OSSB_formatted, 6.000, 'OSSB must equal 6.000 mm');
  assert.strictEqual(res.BA_formatted, 6.597, 'BA must equal 6.597 mm');
  assert.strictEqual(res.BD_formatted, 5.403, 'BD must equal 5.403 mm');
  assert.strictEqual(res.Rn_formatted, 4.200, 'Rn must equal 4.200 mm');

  const flat = SheetMetal.calculateFlatLength([50, 50], {
    angle: 90,
    thickness: 3.0,
    radius: 3.0,
    kFactor: 0.40
  });
  assert.strictEqual(flat.flatLength, 94.597, 'Flat blank length must equal 94.597 mm (100 - 5.403)');
});

// --------------------------------------------------------------------------
// 3. Stainless Steel Preset Verification
// --------------------------------------------------------------------------
it('Stainless Steel preset verification (T=1.5, K=0.45, R=1.5, angle=90°)', () => {
  const res = SheetMetal.computeBend({
    angle: 90,
    thickness: 1.5,
    radius: 1.5,
    kFactor: 0.45
  });

  // Rn = 1.5 + 0.45 * 1.5 = 2.175
  assert.strictEqual(res.Rn_formatted, 2.175);
  // OSSB = tan(45) * (1.5 + 1.5) = 3.000
  assert.strictEqual(res.OSSB_formatted, 3.000);
  // BA = (pi / 2) * 2.175 = 3.416
  assert.strictEqual(res.BA_formatted, 3.416);
  // BD = 2 * 3.000 - 3.416 = 2.584
  assert.strictEqual(res.BD_formatted, 2.584);
});

// --------------------------------------------------------------------------
// 4. Edge Cases: Acute, Obtuse, Extreme Angles, and Zero Radius
// --------------------------------------------------------------------------
it('Acute bend: 45° angle calculation', () => {
  const res = SheetMetal.computeBend({
    angle: 45,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });
  // OSSB = tan(22.5°) * (2 + 2) = 0.41421356 * 4 = 1.657
  assert.strictEqual(res.OSSB_formatted, 1.657);
  // BA = (pi / 180) * 45 * 2.88 = 2.262
  assert.strictEqual(res.BA_formatted, 2.262);
  // BD = 2 * 1.65685 - 2.2619 = 1.052
  assert.strictEqual(res.BD_formatted, 1.052);
});

it('Obtuse bend: 135° angle calculation', () => {
  const res = SheetMetal.computeBend({
    angle: 135,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });
  // OSSB = tan(67.5°) * 4 = 2.41421356 * 4 = 9.657
  assert.strictEqual(res.OSSB_formatted, 9.657);
  // BA = (pi / 180) * 135 * 2.88 = 6.786
  assert.strictEqual(res.BA_formatted, 6.786);
  // BD = 2 * 9.65685 - 6.7858 = 12.528
  assert.strictEqual(res.BD_formatted, 12.528);
});

it('Zero bend radius (R=0 sharp tool)', () => {
  const res = SheetMetal.computeBend({
    angle: 90,
    thickness: 2.0,
    radius: 0.0,
    kFactor: 0.44
  });
  // Rn = 0 + 0.44 * 2.0 = 0.88
  assert.strictEqual(res.Rn_formatted, 0.880);
  // OSSB = tan(45°) * (0 + 2.0) = 2.000
  assert.strictEqual(res.OSSB_formatted, 2.000);
  // BA = (pi / 2) * 0.88 = 1.382
  assert.strictEqual(res.BA_formatted, 1.382);
  // BD = 2 * 2.0 - 1.382 = 2.618
  assert.strictEqual(res.BD_formatted, 2.618);
});

it('K-Factor boundary limits [0.20 - 0.50]', () => {
  const minK = SheetMetal.computeBend({ angle: 90, thickness: 2.0, radius: 2.0, kFactor: 0.10 });
  assert.strictEqual(minK.kFactor, 0.20, 'Clamped to min 0.20');

  const maxK = SheetMetal.computeBend({ angle: 90, thickness: 2.0, radius: 2.0, kFactor: 0.99 });
  assert.strictEqual(maxK.kFactor, 0.50, 'Clamped to max 0.50');
});

// --------------------------------------------------------------------------
// 5. Unfolding & Flat Blank Geometry Compensation
// --------------------------------------------------------------------------
it('Unfold 50x50 formed bracket into compensated flat blank', () => {
  // Formed bracket: 100mm wide (50 + 50) x 50mm height
  const bracket = SheetMetal.createFormedBracket(50, 50, 50, {
    angle: 90,
    radius: 2.0,
    direction: 'UP'
  });

  const ents = [bracket.contour, bracket.bendLine];
  const unfolded = SheetMetal.unfoldContour(ents, { thickness: 2.0, kFactor: 0.44 });

  const unfoldedContour = unfolded.find(e => e.type === 'poly');
  const unfoldedBend = unfolded.find(e => e.type === 'bend');

  assert(unfoldedContour, 'Unfolded contour must exist');
  assert(unfoldedBend, 'Unfolded bend must exist');

  // Verify bounding box of unfolded contour
  const bb = Geo.bbox(unfoldedContour);
  const blankLength = +(bb[2] - bb[0]).toFixed(3);
  const blankWidth = +(bb[3] - bb[1]).toFixed(3);

  assert.strictEqual(blankLength, 96.524, 'Unfolded flat blank length must equal 96.524 mm');
  assert.strictEqual(blankWidth, 50.000, 'Unfolded flat blank width must be unchanged at 50.000 mm');
  assert.strictEqual(unfoldedBend.layer, 'BEND_UP', 'Bend layer must be BEND_UP');
  assert.strictEqual(unfoldedBend.bd, 3.476, 'Bend deduction recorded on bend');
});

it('Unfold Aluminum 3.0mm bracket (50x50)', () => {
  const bracket = SheetMetal.createFormedBracket(50, 50, 40, {
    angle: 90,
    radius: 3.0,
    direction: 'DOWN'
  });

  const ents = [bracket.contour, bracket.bendLine];
  const unfolded = SheetMetal.unfoldContour(ents, { thickness: 3.0, kFactor: 0.40 });

  const unfoldedContour = unfolded.find(e => e.type === 'poly');
  const unfoldedBend = unfolded.find(e => e.type === 'bend');

  const bb = Geo.bbox(unfoldedContour);
  const blankLength = +(bb[2] - bb[0]).toFixed(3);

  assert.strictEqual(blankLength, 94.597, 'Aluminum blank length must equal 94.597 mm');
  assert.strictEqual(unfoldedBend.layer, 'BEND_DOWN', 'Bend layer must be BEND_DOWN');
  assert.strictEqual(unfoldedBend.bd, 5.403, 'Bend deduction recorded on bend');
});

// --------------------------------------------------------------------------
// 6. DXF Export with Bends & CNC Press Brake Layers
// --------------------------------------------------------------------------
it('DXF Export includes BEND_UP / BEND_DOWN layers and controller metadata', () => {
  const ents = [
    {
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts: [
        { x: 0, y: 0, b: 0 },
        { x: 96.524, y: 0, b: 0 },
        { x: 96.524, y: 50, b: 0 },
        { x: 0, y: 50, b: 0 }
      ]
    },
    {
      type: 'bend',
      layer: 'BEND_UP',
      direction: 'UP',
      angle: 90,
      radius: 2.0,
      ba: 4.524,
      bd: 3.476,
      x1: 48.262,
      y1: 0,
      x2: 48.262,
      y2: 50
    }
  ];

  const dxfStr = Dxf.toDXF(ents, [
    { name: '0', aci: 7 },
    { name: 'PARTS', aci: 3 },
    { name: 'BEND_UP', aci: 6 },
    { name: 'BEND_DOWN', aci: 2 }
  ]);

  assert(dxfStr.includes('BEND_UP'), 'DXF must contain BEND_UP layer');
  assert(dxfStr.includes('LINE'), 'DXF must write bend line entity');
  assert(dxfStr.includes('PARTS'), 'DXF must contain PARTS layer');
  assert(dxfStr.includes('DASHED'), 'DXF must contain DASHED linetype for press brake');
});

// --------------------------------------------------------------------------
// 7. Multi-Bend Unfolding: 3-Flange U-Channel (30mm, 60mm, 30mm)
// --------------------------------------------------------------------------
it('Multi-bend unfolding: U-Channel with dual 90° bends', () => {
  // Formed U-channel: 120mm total length (30 + 60 + 30)
  const contour = {
    type: 'poly',
    layer: 'PARTS',
    closed: true,
    pts: [
      { x: 0, y: 0, b: 0 },
      { x: 120, y: 0, b: 0 },
      { x: 120, y: 40, b: 0 },
      { x: 0, y: 40, b: 0 }
    ]
  };

  const bend1 = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 30, y1: 0,
    x2: 30, y2: 40
  };

  const bend2 = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 90, y1: 0,
    x2: 90, y2: 40
  };

  const flatResult = SheetMetal.calculateFlatLength([30, 60, 30], [
    { angle: 90, thickness: 2.0, radius: 2.0, kFactor: 0.44 },
    { angle: 90, thickness: 2.0, radius: 2.0, kFactor: 0.44 }
  ]);

  // Total formed = 120; BD for each bend = 3.476; Total BD = 6.952
  // Flat length = 120 - 6.952 = 113.048 mm
  assert.strictEqual(flatResult.formedLength, 120.000);
  assert.strictEqual(flatResult.totalBD, 6.952);
  assert.strictEqual(flatResult.flatLength, 113.048);

  const unfolded = SheetMetal.unfoldContour([contour, bend1, bend2], { thickness: 2.0, kFactor: 0.44 });
  const unfoldedContour = unfolded.find(e => e.type === 'poly');
  const bb = Geo.bbox(unfoldedContour);
  const blankLength = +(bb[2] - bb[0]).toFixed(3);
  assert.strictEqual(blankLength, 113.048, 'Compensated blank length must equal 120 - 2 * 3.476 = 113.048 mm');
});

// --------------------------------------------------------------------------
// 8. DXF Round-Trip: Export and Re-Import of Bend Lines
// --------------------------------------------------------------------------
it('DXF Round-Trip preserves BEND_UP and BEND_DOWN entities and parameters', () => {
  const originalEnts = [
    {
      type: 'bend',
      layer: 'BEND_UP',
      direction: 'UP',
      angle: 90,
      radius: 2.5,
      ba: 4.869,
      bd: 3.869,
      x1: 50, y1: 0,
      x2: 50, y2: 100
    },
    {
      type: 'bend',
      layer: 'BEND_DOWN',
      direction: 'DOWN',
      angle: 45,
      radius: 1.5,
      ba: 1.885,
      bd: 0.885,
      x1: 80, y1: 0,
      x2: 80, y2: 100
    }
  ];

  const dxfString = Dxf.toDXF(originalEnts);
  const parsed = Dxf.fromDXF(dxfString);

  assert.strictEqual(parsed.ents.length, 2, 'Should parse 2 entities');
  const b1 = parsed.ents.find(e => e.layer === 'BEND_UP');
  const b2 = parsed.ents.find(e => e.layer === 'BEND_DOWN');

  assert(b1, 'BEND_UP must be recovered');
  assert.strictEqual(b1.type, 'bend');
  assert.strictEqual(b1.direction, 'UP');
  assert.strictEqual(b1.angle, 90);
  assert.strictEqual(b1.radius, 2.5);

  assert(b2, 'BEND_DOWN must be recovered');
  assert.strictEqual(b2.type, 'bend');
  assert.strictEqual(b2.direction, 'DOWN');
  assert.strictEqual(b2.angle, 45);
  assert.strictEqual(b2.radius, 1.5);
});

// --------------------------------------------------------------------------
// 9. Undo/Redo State Serialization with Bends & Parameters
// --------------------------------------------------------------------------
it('Undo/Redo cleanly reverses and reapplies bend additions and parameter edits', () => {
  const simState = {
    ents: [],
    sheetMetal: {
      material: 'mild_steel',
      thickness: 2.0,
      kFactor: 0.44,
      defaultAngle: 90,
      defaultRadius: 2.0
    }
  };

  const undoStack = [];
  const redoStack = [];

  function pushState() {
    undoStack.push(JSON.stringify(simState));
    redoStack.length = 0;
  }
  function undo() {
    redoStack.push(JSON.stringify(simState));
    const prev = JSON.parse(undoStack.pop());
    Object.assign(simState, prev);
  }
  function redo() {
    undoStack.push(JSON.stringify(simState));
    const next = JSON.parse(redoStack.pop());
    Object.assign(simState, next);
  }

  // 1. Initial state (empty)
  assert.strictEqual(simState.ents.length, 0);

  // 2. Add bend line
  pushState();
  simState.ents.push({
    type: 'bend',
    id: 1,
    angle: 90,
    radius: 2.0,
    direction: 'UP',
    layer: 'BEND_UP',
    x1: 50, y1: 0, x2: 50, y2: 50
  });
  assert.strictEqual(simState.ents.length, 1);

  // 3. Edit bend angle to 45°
  pushState();
  simState.ents[0].angle = 45;
  assert.strictEqual(simState.ents[0].angle, 45);

  // 4. Edit material to Aluminum (K=0.40, T=3.0)
  pushState();
  simState.sheetMetal.material = 'aluminum';
  simState.sheetMetal.thickness = 3.0;
  simState.sheetMetal.kFactor = 0.40;
  assert.strictEqual(simState.sheetMetal.material, 'aluminum');

  // Test Undo 1: Revert material
  undo();
  assert.strictEqual(simState.sheetMetal.material, 'mild_steel');
  assert.strictEqual(simState.sheetMetal.thickness, 2.0);
  assert.strictEqual(simState.ents[0].angle, 45);

  // Test Undo 2: Revert bend angle back to 90°
  undo();
  assert.strictEqual(simState.ents[0].angle, 90);

  // Test Undo 3: Revert bend addition (empty)
  undo();
  assert.strictEqual(simState.ents.length, 0);

  // Test Redo 1: Reapply bend addition
  redo();
  assert.strictEqual(simState.ents.length, 1);
  assert.strictEqual(simState.ents[0].angle, 90);

  // Test Redo 2: Reapply bend angle change to 45°
  redo();
  assert.strictEqual(simState.ents[0].angle, 45);

  // Test Redo 3: Reapply Aluminum change
  redo();
  assert.strictEqual(simState.sheetMetal.material, 'aluminum');
  assert.strictEqual(simState.sheetMetal.thickness, 3.0);
});

// --------------------------------------------------------------------------
// 10. Angle Extreme Boundary Conditions (1° and 179°)
// --------------------------------------------------------------------------
it('Angle boundaries 1° and 179° calculate without error or NaN', () => {
  const minAngle = SheetMetal.computeBend({
    angle: 1,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });
  assert(!isNaN(minAngle.BA) && minAngle.BA > 0, 'BA must be positive number');
  assert(!isNaN(minAngle.OSSB) && minAngle.OSSB > 0, 'OSSB must be positive number');
  assert(!isNaN(minAngle.BD), 'BD must be a valid number');

  const maxAngle = SheetMetal.computeBend({
    angle: 179,
    thickness: 2.0,
    radius: 2.0,
    kFactor: 0.44
  });
  assert(!isNaN(maxAngle.BA) && maxAngle.BA > 0, 'BA must be positive number');
  assert(!isNaN(maxAngle.OSSB) && maxAngle.OSSB > 0, 'OSSB must be positive number');
  assert(!isNaN(maxAngle.BD), 'BD must be a valid number');
});

// --------------------------------------------------------------------------
// 11. computeBend Defaults & Missing/Null/Empty Parameters (No NaNs)
// --------------------------------------------------------------------------
it('computeBend and calculateFlatLength with empty/null/missing parameters produce valid numbers without NaN', () => {
  const emptyRes = SheetMetal.computeBend({});
  assert(!isNaN(emptyRes.BA) && emptyRes.BA > 0, 'Default BA must not be NaN');
  assert(!isNaN(emptyRes.OSSB) && emptyRes.OSSB > 0, 'Default OSSB must not be NaN');
  assert(!isNaN(emptyRes.BD), 'Default BD must not be NaN');
  assert.strictEqual(emptyRes.thickness, 2.0);
  assert.strictEqual(emptyRes.radius, 2.0);
  assert.strictEqual(emptyRes.kFactor, 0.44);

  const noArgRes = SheetMetal.computeBend();
  assert(!isNaN(noArgRes.BA) && noArgRes.BA > 0);

  const nanR = SheetMetal.computeBend({ radius: '' });
  assert(!isNaN(nanR.radius) && nanR.radius === 2.0);

  const zeroR = SheetMetal.computeBend({ radius: 0 });
  assert.strictEqual(zeroR.radius, 0.0);

  const flatDefault = SheetMetal.calculateFlatLength([50, 50]);
  assert(!isNaN(flatDefault.totalBD) && flatDefault.totalBD > 0);
  assert(!isNaN(flatDefault.flatLength) && flatDefault.flatLength < 100);
});

// --------------------------------------------------------------------------
// 12. Geo.cleanup preserves distinct bend lines and removes tiny ones
// --------------------------------------------------------------------------
it('Geo.cleanup preserves all distinct bend lines without false duplicate deletion', () => {
  const b1 = { type: 'bend', id: 1, x1: 20, y1: 0, x2: 20, y2: 40 };
  const b2 = { type: 'bend', id: 2, x1: 50, y1: 0, x2: 50, y2: 40 };
  const bTiny = { type: 'bend', id: 3, x1: 50, y1: 0, x2: 50.0001, y2: 0 };
  const bDup = { type: 'bend', id: 4, x1: 20, y1: 0, x2: 20, y2: 40 };

  const cleaned = Geo.cleanup([b1, b2, bTiny, bDup], 0.05);
  assert.strictEqual(cleaned.keep.length, 2, 'Must keep exactly 2 unique bend lines');
  assert(cleaned.removed.includes(3), 'Tiny bend must be removed');
  assert(cleaned.removed.includes(4), 'Duplicate bend must be removed');
  assert(cleaned.keep.some(e => e.id === 1), 'Bend 1 must be kept');
  assert(cleaned.keep.some(e => e.id === 2), 'Bend 2 must be kept');
});

// --------------------------------------------------------------------------
// 13. Geo.openEnds ignores bend lines (press brake lines, not open cuts)
// --------------------------------------------------------------------------
it('Geo.openEnds ignores internal bend lines and reports 0 open ends on closed part', () => {
  const bracket = SheetMetal.createFormedBracket(50, 50, 50, { angle: 90, radius: 2, direction: 'UP' });
  bracket.contour.id = 1;
  bracket.bendLine.id = 2;

  const ends = Geo.openEnds([bracket.contour, bracket.bendLine], 0.05);
  assert.strictEqual(ends.length, 0, 'Internal bend line endpoints must not be reported as open cut contours');
});

// --------------------------------------------------------------------------
// 14. Cam.buildToolpath does NOT cut bend lines
// --------------------------------------------------------------------------
it('Cam.buildToolpath generates cuts only for part contour, excluding bend lines', () => {
  const bracket = SheetMetal.createFormedBracket(50, 50, 50, { angle: 90, radius: 2, direction: 'UP' });
  bracket.contour.id = 1;
  bracket.bendLine.id = 2;

  const tp = Cam.buildToolpath([bracket.contour, bracket.bendLine]);
  assert.strictEqual(tp.cuts.length, 1, 'Toolpath must only contain 1 cut (the outer contour), not the bend line');
  assert.strictEqual(tp.cuts[0].id, 1, 'Cutting path must be for the contour');
});

// --------------------------------------------------------------------------
// 15. DXF APPID Table & Missing Layer Recovery
// --------------------------------------------------------------------------
it('DXF Export writes APPID table for BEND and ensures all used layers exist', () => {
  const ents = [
    { type: 'poly', layer: 'PARTS', closed: true, pts: [{x:0, y:0}, {x:50, y:0}, {x:50, y:50}, {x:0, y:50}] },
    { type: 'bend', layer: 'BEND_UP', direction: 'UP', angle: 90, radius: 2, ba: 4.524, bd: 3.476, x1: 25, y1: 0, x2: 25, y2: 50 }
  ];

  // Pass empty layer array to verify automatic layer resolution
  const dxfStr = Dxf.toDXF(ents, []);
  assert(dxfStr.includes('APPID'), 'DXF must contain APPID table');
  assert(dxfStr.includes('BEND'), 'DXF APPID table must register BEND application');
  assert(dxfStr.includes('BEND_UP'), 'DXF must register BEND_UP layer even when layers array was empty');
});

// --------------------------------------------------------------------------
// 16. DXF Import parses ba/bd and handles 2-point LWPOLYLINE bends
// --------------------------------------------------------------------------
it('DXF Parser extracts ba/bd from XDATA and parses 2-point LWPOLYLINE bends', () => {
  const ents = [
    { type: 'bend', layer: 'BEND_DOWN', direction: 'DOWN', angle: 90, radius: 2.5, ba: 4.869, bd: 3.869, x1: 30, y1: 0, x2: 30, y2: 60 }
  ];
  const dxfStr = Dxf.toDXF(ents);
  const parsed = Dxf.parseDXF(dxfStr);
  const b = parsed.ents.find(e => e.type === 'bend');
  assert(b, 'Bend entity must be parsed');
  assert.strictEqual(b.ba, 4.869, 'ba must be recovered from XDATA');
  assert.strictEqual(b.bd, 3.869, 'bd must be recovered from XDATA');

  // Test 2-point LWPOLYLINE on BEND_UP layer
  const polyDxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'BEND_UP', '70', '0',
    '1001', 'BEND', '1000', 'DIR=UP;ANGLE=90;RADIUS=2;BA=4.524;BD=3.476',
    '10', '10.0', '20', '0.0',
    '10', '10.0', '20', '50.0',
    '0', 'ENDSEC', '0', 'EOF'
  ].join('\n');

  const parsedPoly = Dxf.parseDXF(polyDxf);
  const bPoly = parsedPoly.ents.find(e => e.type === 'bend');
  assert(bPoly, '2-point LWPOLYLINE on bend layer must be parsed as bend');
  assert.strictEqual(bPoly.direction, 'UP');
  assert.strictEqual(bPoly.x1, 10.0);
  assert.strictEqual(bPoly.y2, 50.0);
});

// --------------------------------------------------------------------------
// 21. Geo.joinEntities strictly excludes bend lines from being swallowed
// --------------------------------------------------------------------------
it('Geo.joinEntities strictly excludes bend lines without merging them into polylines', () => {
  const line1 = { id: 1, type: 'line', layer: 'PARTS', x1: 0, y1: 0, x2: 50, y2: 0 };
  const bend = { id: 2, type: 'bend', layer: 'BEND_UP', direction: 'UP', angle: 90, radius: 2.0, ba: 4.524, bd: 3.476, x1: 50, y1: 0, x2: 50, y2: 50 };
  const line2 = { id: 3, type: 'line', layer: 'PARTS', x1: 50, y1: 0, x2: 100, y2: 0 };

  const joined = Geo.joinEntities([line1, bend, line2], 0.1);
  // line1 and line2 should join together, but bend line must NEVER be swallowed into a poly
  joined.forEach(j => {
    assert(!j.srcIds.includes(2), 'Bend line ID 2 must not be joined into polyline chain');
  });
});

// --------------------------------------------------------------------------
// 22. Geo.extendEntity, Geo.trimEntity, and Geo.offsetEntity support bend lines
// --------------------------------------------------------------------------
it('Geo.extendEntity, trimEntity, and offsetEntity preserve bend entity integrity', () => {
  const bend = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    ba: 4.524,
    bd: 3.476,
    x1: 25, y1: 10,
    x2: 25, y2: 40
  };

  // 1. Extend bend line to boundary y=50
  const boundary = { type: 'line', x1: 0, y1: 50, x2: 100, y2: 50 };
  const extended = Geo.extendEntity(bend, { x: 25, y: 40 }, Geo.segsOf(boundary));
  assert(extended, 'Bend must be extendable');
  assert.strictEqual(extended.type, 'bend');
  assert.strictEqual(extended.direction, 'UP');
  assert.strictEqual(extended.y2, 50, 'Extended y2 must reach boundary at y=50');

  // 2. Offset bend line by 10mm to create parallel bend
  const offset = Geo.offsetEntity(bend, 10, { x: 35, y: 25 });
  assert(offset, 'Bend must be offsettable');
  assert.strictEqual(offset.type, 'bend');
  assert.strictEqual(offset.angle, 90);
  assert.strictEqual(offset.radius, 2.0);
  assert.strictEqual(Math.round(offset.x1), 35, 'Offset x1 must be at x=35');

  // 3. Trim bend line with cutter line at y=30
  const cutter = { type: 'line', x1: 0, y1: 30, x2: 100, y2: 30 };
  const trimmed = Geo.trimEntity(bend, { x: 25, y: 35 }, Geo.segsOf(cutter));
  assert(trimmed && trimmed.add.length > 0, 'Bend must be trimmable');
  assert.strictEqual(trimmed.add[0].type, 'bend');
  assert.strictEqual(trimmed.add[0].direction, 'UP');
  assert.strictEqual(trimmed.add[0].y2, 30, 'Trimmed y2 must end at cutter line y=30');
});

// --------------------------------------------------------------------------
// 23. Multi-Bend Perpendicular Box Pan Blank Unfolding
// --------------------------------------------------------------------------
it('Multi-bend perpendicular box pan blank unfolding preserves bend bounds', () => {
  const contour = {
    type: 'poly',
    layer: 'PARTS',
    closed: true,
    pts: [
      { x: 0, y: 0, b: 0 },
      { x: 100, y: 0, b: 0 },
      { x: 100, y: 100, b: 0 },
      { x: 0, y: 100, b: 0 }
    ]
  };

  const bendV = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 20, y1: 0,
    x2: 20, y2: 100
  };

  const bendH = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 0, y1: 20,
    x2: 100, y2: 20
  };

  const unfolded = SheetMetal.unfoldContour([contour, bendV, bendH], { thickness: 2.0, kFactor: 0.44 });
  const unfoldedContour = unfolded.find(e => e.type === 'poly');
  const uBends = unfolded.filter(e => e.type === 'bend');

  const bb = Geo.bbox(unfoldedContour);
  // Both sides contract by BD=3.476; width & height must equal 100 - 3.476 = 96.524
  assert.strictEqual(+(bb[2] - bb[0]).toFixed(3), 96.524);
  assert.strictEqual(+(bb[3] - bb[1]).toFixed(3), 96.524);

  // Check that bend lines stay bounded inside the blank
  uBends.forEach(b => {
    assert(b.x1 >= bb[0] - 1e-3 && b.x1 <= bb[2] + 1e-3, 'Bend x1 must be within blank x-bounds');
    assert(b.x2 >= bb[0] - 1e-3 && b.x2 <= bb[2] + 1e-3, 'Bend x2 must be within blank x-bounds');
    assert(b.y1 >= bb[1] - 1e-3 && b.y1 <= bb[3] + 1e-3, 'Bend y1 must be within blank y-bounds');
    assert(b.y2 >= bb[1] - 1e-3 && b.y2 <= bb[3] + 1e-3, 'Bend y2 must be within blank y-bounds');
  });
});

// --------------------------------------------------------------------------
// 24. DXF Layer Table Resolution when e.layer is Omitted & Standard ACAD APPID
// --------------------------------------------------------------------------
it('DXF Export resolves BEND_UP layer when e.layer is omitted and includes ACAD+BEND APPID', () => {
  const ents = [
    { type: 'bend', direction: 'UP', angle: 90, radius: 2.0, ba: 4.524, bd: 3.476, x1: 20, y1: 0, x2: 20, y2: 50 }
  ];

  const dxfStr = Dxf.toDXF(ents);
  // Verify APPID table has both ACAD and BEND
  assert(dxfStr.includes('APPID\r\n2\r\nACAD') || dxfStr.includes('APPID\n2\nACAD'), 'APPID table must register ACAD');
  assert(dxfStr.includes('APPID\r\n2\r\nBEND') || dxfStr.includes('APPID\n2\nBEND'), 'APPID table must register BEND');

  // Verify LAYER table has BEND_UP
  assert(dxfStr.includes('LAYER\r\n2\r\nBEND_UP') || dxfStr.includes('LAYER\n2\nBEND_UP'), 'LAYER table must declare BEND_UP');
});

// --------------------------------------------------------------------------
// 25. DXF Import of 2-vertex standard POLYLINE and THICK/K metadata extraction
// --------------------------------------------------------------------------
it('DXF Import parses 2-vertex standard POLYLINE on bend layers and extracts THICK/K', () => {
  const r12Dxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'POLYLINE', '8', 'BEND_DOWN', '70', '0',
    '1001', 'BEND', '1000', 'DIR=DOWN;ANGLE=90;RADIUS=3.0;THICK=3.0;K=0.40;BA=6.597;BD=5.403',
    '0', 'VERTEX', '8', 'BEND_DOWN', '10', '0.0', '20', '30.0', '30', '0.0',
    '0', 'VERTEX', '8', 'BEND_DOWN', '10', '80.0', '20', '30.0', '30', '0.0',
    '0', 'SEQEND', '8', 'BEND_DOWN',
    '0', 'ENDSEC', '0', 'EOF'
  ].join('\n');

  const parsed = Dxf.parseDXF(r12Dxf);
  const b = parsed.ents.find(e => e.type === 'bend');
  assert(b, '2-vertex POLYLINE on BEND_DOWN must be parsed as a bend entity');
  assert.strictEqual(b.direction, 'DOWN');
  assert.strictEqual(b.angle, 90);
  assert.strictEqual(b.radius, 3.0);
  assert.strictEqual(b.thickness, 3.0);
  assert.strictEqual(b.kFactor, 0.40);
  assert.strictEqual(b.ba, 6.597);
  assert.strictEqual(b.bd, 5.403);
  assert.strictEqual(b.x1, 0.0);
  assert.strictEqual(b.x2, 80.0);
});

// --------------------------------------------------------------------------
// 26. Geo.setStartPoint strictly preserves bend line entity without converting to polyline
// --------------------------------------------------------------------------
it('Geo.setStartPoint strictly preserves bend line entity without converting to polyline', () => {
  const bend = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    x1: 10, y1: 0,
    x2: 10, y2: 50,
    ba: 4.524,
    bd: 3.476
  };

  const res = Geo.setStartPoint(bend, { x: 10, y: 48 }, 2.0);
  assert.strictEqual(res.type, 'bend', 'Geo.setStartPoint must not turn bend into polyline');
  assert.strictEqual(res.direction, 'UP');
  assert.strictEqual(res.angle, 90);
  assert.strictEqual(res.radius, 2.0);
  assert.strictEqual(res.ba, 4.524);
  assert.strictEqual(res.bd, 3.476);
});

// --------------------------------------------------------------------------
// 27. DXF Export includes THICK and K in XDATA when exported after blank unfolding
// --------------------------------------------------------------------------
it('DXF Export includes THICK and K in XDATA when exported after blank unfolding', () => {
  const bracket = SheetMetal.createFormedBracket(50, 50, 50, {
    angle: 90,
    radius: 3.0,
    thickness: 3.0,
    kFactor: 0.40,
    direction: 'DOWN'
  });

  const unfolded = SheetMetal.unfoldContour([bracket.contour, bracket.bendLine], {
    thickness: 3.0,
    kFactor: 0.40
  });

  const dxfStr = Dxf.toDXF(unfolded);
  assert(dxfStr.includes('THICK=3'), 'Exported DXF must include THICK in XDATA');
  assert(dxfStr.includes('K=0.4'), 'Exported DXF must include K in XDATA');
  assert(dxfStr.includes('DIR=DOWN'), 'Exported DXF must include DIR=DOWN');
  assert(dxfStr.includes('RADIUS=3'), 'Exported DXF must include RADIUS=3');
});

// --------------------------------------------------------------------------
// 28. Geo.mirrorEnt mirrors bend line coordinates while preserving bend properties
// --------------------------------------------------------------------------
it('Geo.mirrorEnt mirrors bend line coordinates while preserving bend properties', () => {
  const bend = {
    type: 'bend',
    layer: 'BEND_UP',
    direction: 'UP',
    angle: 90,
    radius: 2.0,
    thickness: 2.0,
    kFactor: 0.44,
    ba: 4.524,
    bd: 3.476,
    x1: 10, y1: 0,
    x2: 10, y2: 50
  };

  // Mirror across vertical line at x = 50
  Geo.mirrorEnt(bend, { x: 50, y: 0 }, { x: 50, y: 100 });
  // Mirrored x = 2 * 50 - 10 = 90
  assert.strictEqual(+bend.x1.toFixed(3), 90.0);
  assert.strictEqual(+bend.x2.toFixed(3), 90.0);
  assert.strictEqual(bend.y1, 0);
  assert.strictEqual(bend.y2, 50);
  assert.strictEqual(bend.type, 'bend');
  assert.strictEqual(bend.direction, 'UP');
  assert.strictEqual(bend.angle, 90);
  assert.strictEqual(bend.radius, 2.0);
  assert.strictEqual(bend.thickness, 2.0);
  assert.strictEqual(bend.kFactor, 0.44);
});

// --------------------------------------------------------------------------
// 29. computeBend handles ultra-thick plate & negative/flipped coords
// --------------------------------------------------------------------------
it('computeBend and unfoldContour handle 10mm thick plate and arbitrary coordinates', () => {
  const heavy = SheetMetal.computeBend({
    angle: 90,
    thickness: 10.0,
    radius: 10.0,
    kFactor: 0.45
  });

  // OSSB = tan(45) * (10 + 10) = 20.000 mm
  // Rn = 10 + 0.45 * 10 = 14.5 mm
  // BA = (pi / 180) * 90 * 14.5 = 22.777 mm
  // BD = 2 * 20.000 - 22.777 = 17.223 mm
  assert.strictEqual(heavy.OSSB_formatted, 20.000);
  assert.strictEqual(heavy.Rn_formatted, 14.500);
  assert.strictEqual(heavy.BA_formatted, 22.777);
  assert.strictEqual(heavy.BD_formatted, 17.223);

  // Unfolding 100x100 formed part with heavy bend
  const contour = {
    type: 'poly',
    layer: 'PARTS',
    closed: true,
    pts: [
      { x: 0, y: 0, b: 0 },
      { x: 200, y: 0, b: 0 },
      { x: 200, y: 100, b: 0 },
      { x: 0, y: 100, b: 0 }
    ]
  };
  const bendLine = {
    type: 'bend',
    direction: 'UP',
    angle: 90,
    radius: 10.0,
    x1: 100, y1: 0,
    x2: 100, y2: 100
  };

  const unfolded = SheetMetal.unfoldContour([contour, bendLine], { thickness: 10.0, kFactor: 0.45 });
  const bb = Geo.bbox(unfolded.find(e => e.type === 'poly'));
  const flatW = +(bb[2] - bb[0]).toFixed(3);
  // 200 - 17.223 = 182.777 mm
  assert.strictEqual(flatW, 182.777);
});

console.log(`\n========================================`);
console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`========================================\n`);
