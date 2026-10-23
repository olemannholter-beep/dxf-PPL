/* ==========================================================================
   Parametric Part Library (IGEMS Style Standard Shapes)
   Generates standard sheet-metal / waterjet cut parts with full parametrization:
     1. Circular Bolt Flange
     2. Rectangular Baseplate with Corner Holes & Fillets
     3. Oblong / Slotted Link Plate
     4. Washer / Heavy Ring
     5. Lifting Lug / Pad Eye
     6. Triangle Gusset / Stiffener
     7. Hexagon / Polygon Hub with Center Bore
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Parts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2;

  /**
   * 1. Circular Bolt Flange
   * Parameters:
   *   od: Outer Diameter
   *   id: Inner Bore Diameter (0 = solid)
   *   pcd: Pitch Circle Diameter for bolt holes
   *   numHoles: Number of bolt holes (e.g. 4, 6, 8)
   *   holeDia: Diameter of bolt holes
   */
  function createFlange(params, cx = 0, cy = 0) {
    const od = Math.max(10, parseFloat(params.od) || 120);
    const id = Math.max(0, parseFloat(params.id) || 40);
    const pcd = Math.max(5, parseFloat(params.pcd) || 85);
    const numHoles = Math.max(0, parseInt(params.numHoles, 10) || 4);
    const holeDia = Math.max(1, parseFloat(params.holeDia) || 10);

    const ents = [];

    // Outer contour
    ents.push({
      type: 'circle',
      layer: 'PARTS',
      cx,
      cy,
      r: od / 2
    });

    // Center bore
    if (id > 0 && id < od) {
      ents.push({
        type: 'circle',
        layer: 'HOLES',
        cx,
        cy,
        r: id / 2
      });
    }

    // Bolt holes
    if (numHoles > 0 && holeDia > 0) {
      const pcdR = pcd / 2;
      const holeR = holeDia / 2;
      for (let i = 0; i < numHoles; i++) {
        const ang = (i * TAU) / numHoles;
        ents.push({
          type: 'circle',
          layer: 'HOLES',
          cx: cx + pcdR * Math.cos(ang),
          cy: cy + pcdR * Math.sin(ang),
          r: holeR
        });
      }
    }

    return ents;
  }

  /**
   * 2. Rectangular Baseplate with Corner Holes & Fillets
   * Parameters:
   *   w: Width
   *   h: Height
   *   cornerRad: Corner fillet radius
   *   margin: Distance of holes from edge (or inset)
   *   holeDia: Diameter of 4 corner holes
   *   centerDia: Optional center hole diameter
   */
  function createBaseplate(params, cx = 0, cy = 0) {
    const w = Math.max(10, parseFloat(params.w) || 100);
    const h = Math.max(10, parseFloat(params.h) || 80);
    const cr = Math.max(0, Math.min(Math.min(w, h) / 2 - 1, parseFloat(params.cornerRad) || 10));
    const margin = Math.max(2, parseFloat(params.margin) || 15);
    const holeDia = Math.max(0, parseFloat(params.holeDia) || 8);
    const centerDia = Math.max(0, parseFloat(params.centerDia) || 30);

    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    const x1 = cx + w / 2;
    const y1 = cy + h / 2;

    const ents = [];

    // Outer contour with 4 corner fillets
    // Bulge for 90 degree counter-clockwise arc is tan(90° / 4) = tan(22.5°) ≈ 0.41421356
    const b = Math.tan(Math.PI / 8);

    if (cr > 0) {
      ents.push({
        type: 'poly',
        layer: 'PARTS',
        closed: true,
        pts: [
          { x: x0 + cr, y: y0, b: 0 },
          { x: x1 - cr, y: y0, b },
          { x: x1, y: y0 + cr, b: 0 },
          { x: x1, y: y1 - cr, b },
          { x: x1 - cr, y: y1, b: 0 },
          { x: x0 + cr, y: y1, b },
          { x: x0, y: y1 - cr, b: 0 },
          { x: x0, y: y0 + cr, b }
        ]
      });
    } else {
      ents.push({
        type: 'poly',
        layer: 'PARTS',
        closed: true,
        pts: [
          { x: x0, y: y0, b: 0 },
          { x: x1, y: y0, b: 0 },
          { x: x1, y: y1, b: 0 },
          { x: x0, y: y1, b: 0 }
        ]
      });
    }

    // 4 Corner holes
    if (holeDia > 0) {
      const hr = holeDia / 2;
      const hx0 = x0 + margin;
      const hx1 = x1 - margin;
      const hy0 = y0 + margin;
      const hy1 = y1 - margin;

      if (hx0 < hx1 && hy0 < hy1) {
        ents.push(
          { type: 'circle', layer: 'HOLES', cx: hx0, cy: hy0, r: hr },
          { type: 'circle', layer: 'HOLES', cx: hx1, cy: hy0, r: hr },
          { type: 'circle', layer: 'HOLES', cx: hx1, cy: hy1, r: hr },
          { type: 'circle', layer: 'HOLES', cx: hx0, cy: hy1, r: hr }
        );
      }
    }

    // Center cutout
    if (centerDia > 0) {
      ents.push({
        type: 'circle',
        layer: 'HOLES',
        cx,
        cy,
        r: centerDia / 2
      });
    }

    return ents;
  }

  /**
   * 3. Oblong / Slotted Link Plate (Stadium / 2 Holes)
   * Parameters:
   *   pitch: Distance between hole centers
   *   width: Outer bar width (and end radius * 2)
   *   holeDia: Diameter of 2 end holes
   */
  function createSlottedLink(params, cx = 0, cy = 0) {
    const pitch = Math.max(10, parseFloat(params.pitch) || 80);
    const barW = Math.max(10, parseFloat(params.width) || 40);
    const holeDia = Math.max(0, parseFloat(params.holeDia) || 16);

    const r = barW / 2;
    const x0 = cx - pitch / 2;
    const x1 = cx + pitch / 2;

    const ents = [];

    // Outer contour: 2 straight lines and 2 semicircular ends (bulge for 180° is 1.0)
    ents.push({
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts: [
        { x: x0, y: cy - r, b: 0 },
        { x: x1, y: cy - r, b: 1.0 }, // 180° arc around right hole
        { x: x1, y: cy + r, b: 0 },
        { x: x0, y: cy + r, b: 1.0 }  // 180° arc around left hole
      ]
    });

    // 2 Center holes
    if (holeDia > 0 && holeDia < barW) {
      const hr = holeDia / 2;
      ents.push(
        { type: 'circle', layer: 'HOLES', cx: x0, cy, r: hr },
        { type: 'circle', layer: 'HOLES', cx: x1, cy, r: hr }
      );
    }

    return ents;
  }

  /**
   * 4. Washer / Heavy Ring
   * Parameters:
   *   od: Outer Diameter
   *   id: Inner Diameter
   */
  function createWasher(params, cx = 0, cy = 0) {
    const od = Math.max(5, parseFloat(params.od) || 60);
    const id = Math.max(1, parseFloat(params.id) || 30);

    return [
      { type: 'circle', layer: 'PARTS', cx, cy, r: od / 2 },
      { type: 'circle', layer: 'HOLES', cx, cy, r: Math.min(od / 2 - 1, id / 2) }
    ];
  }

  /**
   * 5. Lifting Lug / Pad Eye
   * Parameters:
   *   baseW: Width of bottom base
   *   height: Height from base to hole center
   *   topRad: Radius of curved top head
   *   pinDia: Shackle pin hole diameter
   */
  function createLiftingLug(params, cx = 0, cy = 0) {
    const baseW = Math.max(20, parseFloat(params.baseW) || 80);
    const h = Math.max(20, parseFloat(params.height) || 70);
    const topR = Math.max(10, parseFloat(params.topRad) || 30);
    const pinDia = Math.max(5, parseFloat(params.pinDia) || 24);

    const bHalf = baseW / 2;
    const yBase = cy - h / 2;
    const yHole = yBase + h;

    const ents = [];

    // Outer profile: bottom flat, angled or straight flanks tangent to top semicircular cap
    ents.push({
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts: [
        { x: cx - bHalf, y: yBase, b: 0 },
        { x: cx + bHalf, y: yBase, b: 0 },
        { x: cx + topR, y: yHole, b: 1.0 }, // 180° semi-circular cap on top
        { x: cx - topR, y: yHole, b: 0 }
      ]
    });

    // Pin hole
    ents.push({
      type: 'circle',
      layer: 'HOLES',
      cx,
      cy: yHole,
      r: pinDia / 2
    });

    return ents;
  }

  /**
   * 6. Triangle Gusset / Stiffener Bracket
   * Parameters:
   *   w: Base width
   *   h: Height
   *   chamfer: Corner weld relief notch (bottom-left)
   *   holeDia: Optional lightening / cable hole in center
   */
  function createGusset(params, cx = 0, cy = 0) {
    const w = Math.max(10, parseFloat(params.w) || 80);
    const h = Math.max(10, parseFloat(params.h) || 80);
    const ch = Math.max(0, parseFloat(params.chamfer) || 12);
    const holeDia = Math.max(0, parseFloat(params.holeDia) || 20);

    const x0 = cx - w / 2;
    const y0 = cy - h / 2;

    const pts = [];
    if (ch > 0 && ch < Math.min(w, h)) {
      pts.push({ x: x0 + ch, y: y0, b: 0 });
      pts.push({ x: x0 + w, y: y0, b: 0 });
      pts.push({ x: x0, y: y0 + h, b: 0 });
      pts.push({ x: x0, y: y0 + ch, b: 0 });
    } else {
      pts.push({ x: x0, y: y0, b: 0 });
      pts.push({ x: x0 + w, y: y0, b: 0 });
      pts.push({ x: x0, y: y0 + h, b: 0 });
    }

    const ents = [{
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts
    }];

    // Lightening hole
    if (holeDia > 0) {
      ents.push({
        type: 'circle',
        layer: 'HOLES',
        cx: x0 + w * 0.35,
        cy: y0 + h * 0.35,
        r: holeDia / 2
      });
    }

    return ents;
  }

  /**
   * 7. Regular Polygon / Hexagonal Flange Hub
   * Parameters:
   *   sides: Number of sides (e.g. 6 = hexagon, 8 = octagon)
   *   acrossFlats: Distance across flats (AF)
   *   boreDia: Center hole diameter
   */
  function createPolygonHub(params, cx = 0, cy = 0) {
    const sides = Math.max(3, parseInt(params.sides, 10) || 6);
    const af = Math.max(10, parseFloat(params.acrossFlats) || 60);
    const boreDia = Math.max(0, parseFloat(params.boreDia) || 25);

    // Radius to vertex R = (af / 2) / cos(pi / sides)
    const rVertex = (af / 2) / Math.cos(Math.PI / sides);
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const ang = (i * TAU) / sides + (Math.PI / sides);
      pts.push({
        x: cx + rVertex * Math.cos(ang),
        y: cy + rVertex * Math.sin(ang),
        b: 0
      });
    }

    const ents = [{
      type: 'poly',
      layer: 'PARTS',
      closed: true,
      pts
    }];

    if (boreDia > 0 && boreDia < af) {
      ents.push({
        type: 'circle',
        layer: 'HOLES',
        cx,
        cy,
        r: boreDia / 2
      });
    }

    return ents;
  }

  // Registry of all parametric shapes with metadata for the UI
  const CATALOG = [
    {
      id: 'flange',
      name: 'Bolt Flange',
      desc: 'Circular flange with bolt circle & center bore',
      generator: createFlange,
      params: [
        { key: 'od', label: 'Outer Diameter (OD)', default: 120, unit: 'mm' },
        { key: 'id', label: 'Center Bore (ID)', default: 40, unit: 'mm' },
        { key: 'pcd', label: 'Bolt Circle (PCD)', default: 85, unit: 'mm' },
        { key: 'numHoles', label: 'Bolt Hole Count', default: 4, unit: 'qty' },
        { key: 'holeDia', label: 'Bolt Hole Ø', default: 10, unit: 'mm' }
      ]
    },
    {
      id: 'baseplate',
      name: 'Mounting Baseplate',
      desc: 'Rectangular plate with 4 corner holes & rounded fillets',
      generator: createBaseplate,
      params: [
        { key: 'w', label: 'Width (W)', default: 100, unit: 'mm' },
        { key: 'h', label: 'Height (H)', default: 80, unit: 'mm' },
        { key: 'cornerRad', label: 'Corner Fillet (R)', default: 10, unit: 'mm' },
        { key: 'margin', label: 'Hole Inset Margin', default: 15, unit: 'mm' },
        { key: 'holeDia', label: 'Corner Hole Ø', default: 8, unit: 'mm' },
        { key: 'centerDia', label: 'Center Hole Ø', default: 30, unit: 'mm' }
      ]
    },
    {
      id: 'slotted',
      name: 'Slotted Link / Stadium',
      desc: 'Oblong link plate with rounded ends & 2 pin holes',
      generator: createSlottedLink,
      params: [
        { key: 'pitch', label: 'Hole-to-Hole Pitch', default: 80, unit: 'mm' },
        { key: 'width', label: 'Link Width (W)', default: 40, unit: 'mm' },
        { key: 'holeDia', label: 'Pin Hole Ø', default: 16, unit: 'mm' }
      ]
    },
    {
      id: 'washer',
      name: 'Washer / Ring Bushing',
      desc: 'Concentric circular washer or pipe spacer',
      generator: createWasher,
      params: [
        { key: 'od', label: 'Outer Diameter (OD)', default: 60, unit: 'mm' },
        { key: 'id', label: 'Inner Diameter (ID)', default: 30, unit: 'mm' }
      ]
    },
    {
      id: 'liftingLug',
      name: 'Lifting Lug / Pad Eye',
      desc: 'Welded shackle lifting eye with rounded head',
      generator: createLiftingLug,
      params: [
        { key: 'baseW', label: 'Base Width', default: 80, unit: 'mm' },
        { key: 'height', label: 'Height to Hole', default: 70, unit: 'mm' },
        { key: 'topRad', label: 'Head Radius (R)', default: 30, unit: 'mm' },
        { key: 'pinDia', label: 'Shackle Pin Hole Ø', default: 24, unit: 'mm' }
      ]
    },
    {
      id: 'gusset',
      name: 'Gusset / Stiffener',
      desc: 'Right triangle bracket with corner weld relief notch',
      generator: createGusset,
      params: [
        { key: 'w', label: 'Base Width (W)', default: 80, unit: 'mm' },
        { key: 'h', label: 'Height (H)', default: 80, unit: 'mm' },
        { key: 'chamfer', label: 'Weld Relief Notch', default: 12, unit: 'mm' },
        { key: 'holeDia', label: 'Lightening Hole Ø', default: 20, unit: 'mm' }
      ]
    },
    {
      id: 'hexagon',
      name: 'Hexagon / Polygon Hub',
      desc: 'Regular polygon (Hex nut shape) with center bore',
      generator: createPolygonHub,
      params: [
        { key: 'sides', label: 'Number of Sides', default: 6, unit: 'sides' },
        { key: 'acrossFlats', label: 'Across Flats (AF)', default: 60, unit: 'mm' },
        { key: 'boreDia', label: 'Center Bore Ø', default: 25, unit: 'mm' }
      ]
    }
  ];

  return {
    CATALOG,
    createFlange,
    createBaseplate,
    createSlottedLink,
    createWasher,
    createLiftingLug,
    createGusset,
    createPolygonHub
  };
});
