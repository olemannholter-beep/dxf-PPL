/**
 * Automated Test Suite for Automatic K-Factor Calculation Engine & Modal
 */
const assert = require('assert');
const SheetMetal = require('../src/core/sheetmetal.js');

let passCount = 0;
function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== RUNNING AUTOMATIC K-FACTOR CALCULATION TESTS ===\n');

// 1. calculateKFactor basic functionality
it('calculateKFactor defaults and Mild Steel baseline at R/T = 1.0', () => {
  const res = SheetMetal.calculateKFactor({ radius: 2.0, thickness: 2.0, material: 'mild_steel' });
  assert.strictEqual(res.ratio, 1.0);
  assert.strictEqual(res.kFactor, 0.44);
});

it('calculateKFactor adapts for sharp bends (R/T < 1.0 pulls neutral axis inward)', () => {
  const res = SheetMetal.calculateKFactor({ radius: 1.0, thickness: 2.0, material: 'mild_steel' });
  assert.strictEqual(res.ratio, 0.5);
  // Log10(0.5) * 0.15 = -0.045 -> 0.44 - 0.045 = 0.395
  assert.strictEqual(res.kFactor, 0.395);
  assert(res.kFactor < 0.44, 'K must be lower than baseline for sharp bend');
});

it('calculateKFactor adapts for wide bends (R/T > 1.0 shifts neutral axis toward center)', () => {
  const res = SheetMetal.calculateKFactor({ radius: 4.0, thickness: 2.0, material: 'mild_steel' });
  assert.strictEqual(res.ratio, 2.0);
  // Log10(2.0) * 0.15 = 0.045 -> 0.44 + 0.045 = 0.485
  assert.strictEqual(res.kFactor, 0.485);
  assert(res.kFactor > 0.44, 'K must be higher than baseline for wide bend');
});

it('calculateKFactor clamps to physical boundaries [0.20 - 0.50]', () => {
  const sharp = SheetMetal.calculateKFactor({ radius: 0.0, thickness: 5.0, material: 'mild_steel' });
  assert(sharp.kFactor >= 0.20 && sharp.kFactor <= 0.30, `Sharp K (${sharp.kFactor}) must be within [0.20, 0.30]`);

  const wide = SheetMetal.calculateKFactor({ radius: 20.0, thickness: 1.0, material: 'mild_steel' });
  assert.strictEqual(wide.kFactor, 0.50, 'Wide radius K must clamp at 0.50');
});

// 2. Material presets
it('calculateKFactor handles Aluminum preset (Base K = 0.40)', () => {
  const res = SheetMetal.calculateKFactor({ radius: 3.0, thickness: 3.0, material: 'aluminum' });
  assert.strictEqual(res.ratio, 1.0);
  assert.strictEqual(res.kFactor, 0.40);
});

it('calculateKFactor handles Stainless Steel preset (Base K = 0.45)', () => {
  const res = SheetMetal.calculateKFactor({ radius: 1.5, thickness: 1.5, material: 'stainless_steel' });
  assert.strictEqual(res.ratio, 1.0);
  assert.strictEqual(res.kFactor, 0.45);
});

it('calculateKFactor handles Copper / Brass preset (Base K = 0.42)', () => {
  const res = SheetMetal.calculateKFactor({ radius: 1.5, thickness: 1.5, material: 'copper_brass' });
  assert.strictEqual(res.ratio, 1.0);
  assert.strictEqual(res.kFactor, 0.42);
});

// 3. Methods: DIN 6935 and Bottoming
it('calculateKFactor supports German standard DIN 6935 logarithmic model', () => {
  const res = SheetMetal.calculateKFactor({ radius: 2.0, thickness: 2.0, method: 'din6935' });
  // DIN 6935: k = 0.65 + 0.5*log10(1) = 0.65 -> K_cad = 0.65 / 2 = 0.325
  assert.strictEqual(res.kFactor, 0.325);

  const resWide = SheetMetal.calculateKFactor({ radius: 10.0, thickness: 2.0, method: 'din6935' });
  // R/T = 5.0 -> k_din = 1.0 -> K_cad = 0.50
  assert.strictEqual(resWide.kFactor, 0.50);
});

it('calculateKFactor supports Bottoming / Coining method', () => {
  const res = SheetMetal.calculateKFactor({ radius: 2.0, thickness: 2.0, material: 'mild_steel', method: 'bottoming' });
  assert.strictEqual(res.kFactor, 0.48);
});

// 4. Reverse Calculate K-Factor from Physical Test Bend Coupons
it('reverseCalculateKFactor accurately back-calculates K-Factor from test coupon (Mild Steel)', () => {
  // 50x50 bracket formed from 96.524mm blank on 2mm steel with R=2mm
  const rev = SheetMetal.reverseCalculateKFactor({
    flatLength: 96.524,
    flange1: 50.0,
    flange2: 50.0,
    angle: 90.0,
    radius: 2.0,
    thickness: 2.0
  });

  assert.strictEqual(rev.formedLength, 100.0);
  assert.strictEqual(rev.BD, 3.476);
  assert.strictEqual(rev.OSSB, 4.0);
  assert.strictEqual(rev.BA, 4.524);
  assert.strictEqual(rev.kFactor, 0.44);
  assert.strictEqual(rev.isValid, true);
});

it('reverseCalculateKFactor accurately back-calculates K-Factor from test coupon (Aluminum 3mm)', () => {
  // 50x50 bracket formed from 94.597mm blank on 3mm aluminum with R=3mm
  const rev = SheetMetal.reverseCalculateKFactor({
    flatLength: 94.597,
    flange1: 50.0,
    flange2: 50.0,
    angle: 90.0,
    radius: 3.0,
    thickness: 3.0
  });

  assert.strictEqual(rev.BD, 5.403);
  assert.strictEqual(rev.OSSB, 6.0);
  assert.strictEqual(rev.BA, 6.597);
  assert.strictEqual(rev.kFactor, 0.40);
  assert.strictEqual(rev.isValid, true);
});

// 5. Tooling & V-Die Recommendation
it('recommendVDie calculates standard press brake die opening and expected radius', () => {
  const tool = SheetMetal.recommendVDie(2.0, 'mild_steel');
  assert.strictEqual(tool.vDie, 16);
  assert.strictEqual(tool.naturalRadius, 2.67);
  assert.strictEqual(tool.minFlange, 11.2);
  assert(tool.recommendedK > 0.44 && tool.recommendedK < 0.48);
});

// 6. Integration with computeBend
it('computeBend automatically calculates K-factor when autoKFactor is true', () => {
  const res = SheetMetal.computeBend({
    angle: 90,
    thickness: 2.0,
    radius: 4.0, // R/T = 2.0
    autoKFactor: true,
    material: 'mild_steel'
  });

  assert.strictEqual(res.kFactor, 0.485);
  assert(res.BA > 0 && res.BD > 0);
});

console.log(`\n========================================`);
console.log(`ALL ${passCount}/${passCount} AUTO K-FACTOR ENGINE TESTS PASSED!`);
console.log(`========================================\n`);
