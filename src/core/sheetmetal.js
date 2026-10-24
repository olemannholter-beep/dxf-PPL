/* ==========================================================================
   Sheet Metal Bend Compensation & Unfolding Engine
   Supports Mild Steel, Stainless Steel, Aluminum presets, customizable K-Factor,
   Bend Allowance (BA), Outside Setback (OSSB), Bend Deduction (BD),
   Flat blank compensation, and CNC press brake DXF export.
   Works in Node.js (require) and in Browser (window.SheetMetal).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SheetMetal = factory(root.Geo);
  }
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  const D2R = Math.PI / 180;

  // Material presets with standard K-factors and typical defaults
  const MATERIALS = {
    mild_steel: {
      id: 'mild_steel',
      name: 'Mild Steel',
      kFactor: 0.44,
      defaultThickness: 2.0,
      defaultRadius: 2.0,
      description: 'Standard Cold/Hot Rolled Low Carbon Steel (K ≈ 0.44)'
    },
    stainless_steel: {
      id: 'stainless_steel',
      name: 'Stainless Steel',
      kFactor: 0.45,
      defaultThickness: 1.5,
      defaultRadius: 2.0,
      description: 'Austenitic / Ferritic Stainless Steel (304 / 316, K ≈ 0.45)'
    },
    aluminum: {
      id: 'aluminum',
      name: 'Aluminum',
      kFactor: 0.40,
      defaultThickness: 3.0,
      defaultRadius: 3.0,
      description: '5052 / 6061 Sheet Aluminum (K ≈ 0.40)'
    },
    copper_brass: {
      id: 'copper_brass',
      name: 'Copper / Brass',
      kFactor: 0.42,
      defaultThickness: 1.5,
      defaultRadius: 1.5,
      description: 'High Ductility Non-Ferrous Alloys (K ≈ 0.42)'
    },
    custom: {
      id: 'custom',
      name: 'Custom',
      kFactor: 0.44,
      defaultThickness: 2.0,
      defaultRadius: 2.0,
      description: 'User-specified Sheet Metal Parameters'
    }
  };

  /**
   * Clamp number between min and max
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Automatically calculate K-Factor from Radius (R), Thickness (T), Material, and Bending Method.
   *
   * Methods:
   *  - 'air': Standard Air Bending empirical model based on neutral axis displacement:
   *           K = clamp(K_base + 0.15 * log10(max(R, 0.1) / T), 0.20, 0.50)
   *  - 'din6935': Standard German DIN 6935 logarithmic formula:
   *           k_din = 0.65 + 0.5 * log10(max(R, 0.05) / T)
   *           K_cad = clamp(k_din / 2.0, 0.20, 0.50)
   *  - 'bottoming': Bottom Bending / Coining (forces neutral axis outward closer to 0.46 - 0.50):
   *           K = clamp(K_base + 0.04, 0.35, 0.50)
   *
   * @param {Object} params
   * @param {number} params.radius - Inside bend radius R (mm)
   * @param {number} params.thickness - Material thickness T (mm)
   * @param {string} [params.material='mild_steel'] - 'mild_steel'|'stainless_steel'|'aluminum'|'copper_brass'|'custom'
   * @param {string} [params.method='air'] - 'air' | 'din6935' | 'bottoming'
   * @returns {Object} { kFactor, kFactor_formatted, ratio, ratio_formatted, radius, thickness, material, method, baseK }
   */
  function calculateKFactor(params = {}) {
    const parsedT = parseFloat(params.thickness);
    const thickness = Math.max(0.01, !isNaN(parsedT) ? parsedT : 2.0);

    const parsedR = parseFloat(params.radius);
    const radius = Math.max(0.0, !isNaN(parsedR) ? parsedR : 2.0);

    const materialKey = params.material || 'mild_steel';
    const method = params.method || 'air';

    const ratio = thickness > 0 ? (radius / thickness) : 1.0;

    let baseK = 0.44;
    if (materialKey === 'aluminum') baseK = 0.40;
    else if (materialKey === 'stainless_steel') baseK = 0.45;
    else if (materialKey === 'copper_brass') baseK = 0.42;
    else if (MATERIALS[materialKey] && MATERIALS[materialKey].kFactor) {
      baseK = MATERIALS[materialKey].kFactor;
    }

    let k = baseK;

    if (method === 'din6935') {
      const safeRatio = Math.max(0.05, ratio);
      const kDin = safeRatio > 5.0 ? 1.0 : (0.65 + 0.5 * Math.log10(safeRatio));
      k = kDin / 2.0;
    } else if (method === 'bottoming') {
      k = baseK + 0.04;
    } else {
      if (radius === 0) {
        k = 0.28;
      } else {
        const safeRatio = Math.max(0.1, ratio);
        k = baseK + 0.15 * Math.log10(safeRatio);
      }
    }

    k = clamp(k, 0.20, 0.50);

    return {
      kFactor: +k.toFixed(3),
      kFactor_formatted: +k.toFixed(3),
      ratio: +ratio.toFixed(3),
      radius,
      thickness,
      material: materialKey,
      method,
      baseK
    };
  }

  /**
   * Reverse-calculate K-Factor from physical test bend measurements.
   *
   * Formed outside flange dimensions F1 and F2, test cut blank length L0:
   *   BD = F1 + F2 - L0
   *   OSSB = tan(angle/2) * (R + T)
   *   BA = 2 * OSSB - BD
   *   K = (BA * 180 / (pi * angle) - R) / T
   *
   * @param {Object} params
   * @param {number} params.flatLength - Test blank length before bend (L0)
   * @param {number} params.flange1 - Formed outside flange length 1 (F1)
   * @param {number} params.flange2 - Formed outside flange length 2 (F2)
   * @param {number} [params.angle=90] - Bend angle in degrees
   * @param {number} [params.radius=2.0] - Inside bend radius R
   * @param {number} [params.thickness=2.0] - Sheet thickness T
   * @returns {Object}
   */
  function reverseCalculateKFactor(params = {}) {
    const flatLen = parseFloat(params.flatLength) || 0;
    const f1 = parseFloat(params.flange1) || 0;
    const f2 = parseFloat(params.flange2) || 0;
    const angle = clamp(parseFloat(params.angle) || 90.0, 1.0, 179.0);
    const radius = Math.max(0.0, parseFloat(params.radius) != null ? parseFloat(params.radius) : 2.0);
    const thickness = Math.max(0.01, parseFloat(params.thickness) || 2.0);

    const BD = (f1 + f2) - flatLen;
    const angleRad = angle * D2R;
    const halfAngleRad = (angle / 2.0) * D2R;
    const OSSB = Math.tan(halfAngleRad) * (radius + thickness);
    const BA = 2.0 * OSSB - BD;

    const Rn = BA / angleRad;
    const K = (Rn - radius) / thickness;
    const clampedK = clamp(K, 0.05, 0.60);

    return {
      flatLength: flatLen,
      flange1: f1,
      flange2: f2,
      formedLength: +(f1 + f2).toFixed(3),
      angle,
      radius,
      thickness,
      BD: +BD.toFixed(3),
      OSSB: +OSSB.toFixed(3),
      BA: +BA.toFixed(3),
      Rn: +Rn.toFixed(3),
      kFactor: +clampedK.toFixed(3),
      kFactorRaw: K,
      isValid: K >= 0.15 && K <= 0.55
    };
  }

  /**
   * Recommend standard press brake V-die opening and natural inside bend radius.
   *
   * @param {number} thickness - Sheet thickness T in mm
   * @param {string} [material='mild_steel'] - Material ID
   * @returns {Object}
   */
  function recommendVDie(thickness = 2.0, material = 'mild_steel') {
    const t = Math.max(0.1, parseFloat(thickness) || 2.0);
    const standardVDies = [4, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160];

    const targetV = t < 3 ? t * 8 : (t <= 8 ? t * 8 : t * 10);
    const vDie = standardVDies.reduce((prev, curr) =>
      Math.abs(curr - targetV) < Math.abs(prev - targetV) ? curr : prev
    );

    let rDivisor = 6.0;
    if (material === 'stainless_steel') rDivisor = 5.0;
    else if (material === 'aluminum') rDivisor = 7.0;

    const naturalRadius = +(vDie / rDivisor).toFixed(2);
    const minFlange = +(vDie * 0.7).toFixed(1);
    const autoK = calculateKFactor({ radius: naturalRadius, thickness: t, material });

    return {
      thickness: t,
      material,
      vDie,
      naturalRadius,
      minFlange,
      recommendedK: autoK.kFactor
    };
  }

  /**
   * Precision Bend Calculation Engine
   * Computes Neutral Axis Radius (Rn), Bend Allowance (BA),
   * Outside Setback (OSSB), and Bend Deduction (BD).
   *
   * Formulas:
   *   Neutral Axis Radius:  Rn = R + K * T
   *   Bend Allowance:       BA = (π / 180) * α * (R + K * T)
   *   Outside Setback:      OSSB = tan(α / 2) * (R + T)
   *   Bend Deduction:       BD = 2 * OSSB - BA
   *
   * @param {Object} params
   * @param {number} params.angle - Bend angle in degrees (1° - 179°)
   * @param {number} params.thickness - Sheet thickness T in mm (T > 0)
   * @param {number} params.radius - Inside bend radius R in mm (R >= 0)
   * @param {number} [params.kFactor] - K-Factor (0.20 - 0.50). If omitted or autoKFactor=true, auto-calculated.
   * @param {boolean} [params.autoKFactor] - Whether to auto-calculate K-Factor
   * @param {string} [params.material] - Material ID for auto K calculation
   * @param {string} [params.kMethod] - Method for auto K calculation ('air'|'din6935'|'bottoming')
   * @returns {Object} Computed bend metrics
   */
  function computeBend(params = {}) {
    const parsedAngle = parseFloat(params.angle);
    const angle = clamp(!isNaN(parsedAngle) ? parsedAngle : 90.0, 1.0, 179.0);

    const parsedT = parseFloat(params.thickness);
    const thickness = Math.max(0.01, !isNaN(parsedT) ? parsedT : 2.0);

    const parsedR = parseFloat(params.radius);
    const radius = Math.max(0.0, !isNaN(parsedR) ? parsedR : 2.0);

    let kFactor;
    if (params.autoKFactor || (params.kFactor == null && params.material)) {
      const autoRes = calculateKFactor({
        radius,
        thickness,
        material: params.material || 'mild_steel',
        method: params.kMethod || 'air'
      });
      kFactor = autoRes.kFactor;
    } else {
      const parsedK = parseFloat(params.kFactor);
      kFactor = clamp(!isNaN(parsedK) ? parsedK : 0.44, 0.20, 0.50);
    }

    const angleRad = angle * D2R;
    const halfAngleRad = (angle / 2.0) * D2R;

    // Neutral Axis Radius
    const Rn = radius + kFactor * thickness;

    // Bend Allowance (BA)
    const BA = angleRad * Rn;

    // Outside Setback (OSSB)
    const OSSB = Math.tan(halfAngleRad) * (radius + thickness);

    // Bend Deduction (BD)
    const BD = 2.0 * OSSB - BA;

    return {
      angle,
      thickness,
      radius,
      kFactor,
      Rn,
      BA,
      OSSB,
      BD,
      // Fixed 3 decimal place numbers for direct verification & display
      Rn_formatted: +Rn.toFixed(3),
      BA_formatted: +BA.toFixed(3),
      OSSB_formatted: +OSSB.toFixed(3),
      BD_formatted: +BD.toFixed(3)
    };
  }

  /**
   * Calculates the compensated flat pattern length for flanges with bends.
   * Total Flat Length = Sum(formed flange lengths) - Sum(BD at each bend)
   *
   * @param {number[]} flangeLengths - Outer formed lengths of each flange
   * @param {Object[]|Object} bends - Bend parameters for each bend between flanges
   * @returns {Object} { formedLength, flatLength, totalBD, bendResults }
   */
  function calculateFlatLength(flangeLengths = [50, 50], bends = {}) {
    const formedLength = flangeLengths.reduce((a, b) => a + b, 0);
    const bendList = Array.isArray(bends) ? bends : (bends != null ? [bends] : [{}]);
    const bendResults = bendList.map(b => computeBend(b || {}));
    const totalBD = bendResults.reduce((a, b) => a + b.BD, 0);
    const flatLength = formedLength - totalBD;

    return {
      formedLength: +formedLength.toFixed(3),
      totalBD: +totalBD.toFixed(3),
      flatLength: +flatLength.toFixed(3),
      bendResults
    };
  }

  /**
   * Helper to create standard formed 2-flange L-bracket geometry with a bend line.
   * Bracket has flange1 outer length, flange2 outer length, width W, and bend at flange1.
   *
   * @param {number} f1 - Flange 1 formed outer dimension (mm)
   * @param {number} f2 - Flange 2 formed outer dimension (mm)
   * @param {number} width - Part width (mm)
   * @param {Object} bendOpts - { angle, radius, direction, thickness, kFactor }
   */
  function createFormedBracket(f1 = 50, f2 = 50, width = 50, bendOpts = {}) {
    const totalFormed = f1 + f2;
    // Contour: rectangle (0,0) to (totalFormed, width)
    const contour = {
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts: [
        { x: 0, y: 0, b: 0 },
        { x: totalFormed, y: 0, b: 0 },
        { x: totalFormed, y: width, b: 0 },
        { x: 0, y: width, b: 0 }
      ]
    };

    const dir = bendOpts.direction || 'UP';
    const bendLine = {
      type: 'bend',
      layer: dir === 'DOWN' ? 'BEND_DOWN' : 'BEND_UP',
      x1: f1,
      y1: 0,
      x2: f1,
      y2: width,
      angle: bendOpts.angle || 90,
      radius: bendOpts.radius != null ? bendOpts.radius : 2.0,
      direction: dir,
      thickness: bendOpts.thickness != null ? bendOpts.thickness : 2.0,
      kFactor: bendOpts.kFactor != null ? bendOpts.kFactor : 0.44
    };

    return {
      contour,
      bendLine,
      flange1: f1,
      flange2: f2,
      width
    };
  }

  /**
   * Unfold and Compensate Drawing Entities into Flat Pattern Blank.
   *
   * For each bend line with deduction BD:
   * The part cutting boundary and interior cutouts are adjusted along the bend normal
   * so that the outer blank cutting size equals Formed Size - Sum(BD).
   *
   * @param {Object[]} ents - List of CAD entities (contour, lines, arcs, polylines, bends)
   * @param {Object} sheetMetalSettings - { thickness, kFactor }
   * @returns {Object[]} Array of compensated flat blank entities ready for cutting & press brake
   */
  function unfoldContour(ents, sheetMetalSettings = {}) {
    const bends = ents.filter(e => e.type === 'bend');
    if (!bends.length) {
      // No bends: return deep clone of original entities
      return JSON.parse(JSON.stringify(ents));
    }

    const t = sheetMetalSettings.thickness || 2.0;
    const k = sheetMetalSettings.kFactor || 0.44;

    // Deep clone entities to avoid mutating originals
    const flatEnts = JSON.parse(JSON.stringify(ents));
    const flatBends = flatEnts.filter(e => e.type === 'bend');
    const flatCutting = flatEnts.filter(e => e.type !== 'bend');

    // Calculate BD for each bend
    flatBends.forEach(b => {
      const calc = computeBend({
        angle: b.angle || 90,
        thickness: t,
        radius: b.radius != null ? b.radius : 2.0,
        kFactor: k
      });
      b.thickness = t;
      b.kFactor = k;
      b.ba = calc.BA_formatted;
      b.bd = calc.BD_formatted;
      b.ossb = calc.OSSB_formatted;
      b._bdRaw = calc.BD;
      b._baRaw = calc.BA;
      b._ossbRaw = calc.OSSB;
    });

    // Determine primary orientation of bend lines
    // Most sheet metal parts have parallel or aligned bend lines (horizontal or vertical)
    flatBends.forEach(bend => {
      const dx = bend.x2 - bend.x1;
      const dy = bend.y2 - bend.y1;
      const len = Math.hypot(dx, dy) || 1;
      // Unit tangent along bend line
      const ux = dx / len;
      const uy = dy / len;
      // Unit normal perpendicular across bend line
      const nx = -uy;
      const ny = ux;

      const midX = (bend.x1 + bend.x2) / 2;
      const midY = (bend.y1 + bend.y2) / 2;
      const bd = bend._bdRaw;
      const halfBD = bd / 2;

      // Transform all cutting vertices
      flatCutting.forEach(e => {
        transformEntityAcrossBend(e, midX, midY, nx, ny, halfBD);
      });

      // Shift other bend lines across this bend
      flatBends.forEach(other => {
        if (other === bend) return;
        transformEntityAcrossBend(other, midX, midY, nx, ny, halfBD);
      });
    });

    // Set proper layers for bends: BEND_UP or BEND_DOWN
    flatBends.forEach(b => {
      b.layer = (b.direction === 'DOWN') ? 'BEND_DOWN' : 'BEND_UP';
    });

    return flatEnts;
  }

  /**
   * Helper to transform entity coordinates across a bend line
   */
  function transformEntityAcrossBend(e, midX, midY, nx, ny, halfBD) {
    function shiftPt(px, py) {
      const dist = (px - midX) * nx + (py - midY) * ny;
      if (Math.abs(dist) < 1e-6) {
        return { x: px, y: py };
      }
      const shift = dist > 0 ? -halfBD : halfBD;
      return {
        x: px + shift * nx,
        y: py + shift * ny
      };
    }

    if (e.type === 'poly') {
      e.pts.forEach(p => {
        const shifted = shiftPt(p.x, p.y);
        p.x = shifted.x;
        p.y = shifted.y;
      });
    } else if (e.type === 'line' || e.type === 'bend') {
      const p1 = shiftPt(e.x1, e.y1);
      const p2 = shiftPt(e.x2, e.y2);
      e.x1 = p1.x;
      e.y1 = p1.y;
      e.x2 = p2.x;
      e.y2 = p2.y;
    } else if (e.type === 'circle' || e.type === 'arc') {
      const c = shiftPt(e.cx, e.cy);
      e.cx = c.x;
      e.cy = c.y;
    }
  }

  return {
    MATERIALS,
    calculateKFactor,
    reverseCalculateKFactor,
    recommendVDie,
    computeBend,
    calculateFlatLength,
    createFormedBracket,
    unfoldContour
  };
});
