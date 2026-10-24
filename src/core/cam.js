/* ==========================================================================
   CAM / Waterjet / Laser module (IGEMS style)
   Provides:
     - Inner/Outer contour classification & nesting hierarchy
     - Automatic cut sequencing (inside holes first, outer perimeter last)
     - Lead-in and Lead-out generation (Linear, Arc, Line+Arc)
     - Overlap / Over-cut prevention
     - Rapid traverse link paths (G0 simulation)
     - CAM DXF export with dedicated layers (LEAD_IN, LEAD_OUT, RAPID, PART)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geometry.js'));
  else root.Cam = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  /**
   * Classify closed contours into parts and holes based on nesting level.
   * Odd depth = hole (inner cut), Even depth = outer perimeter.
   */
  function analyzeContours(ents) {
    const closed = ents.filter(Geo.isClosed);
    const infos = closed.map(e => {
      const segs = Geo.segsOf(e);
      const poly = Geo.sample(segs, 0.1);
      const a = Math.abs(Geo.signedArea(segs));
      const bb = Geo.bbox(e);
      return { ent: e, poly, area: a, bb, parents: 0, children: [] };
    });

    // Sort by area descending so outer containers come before inner
    infos.sort((a, b) => b.area - a.area);

    for (let i = 0; i < infos.length; i++) {
      const cur = infos[i];
      // Pick a sample point from cur
      const pt = cur.poly[0] || { x: cur.bb[0], y: cur.bb[1] };
      for (let j = 0; j < infos.length; j++) {
        if (i === j) continue;
        const other = infos[j];
        if (other.area > cur.area &&
            cur.bb[0] >= other.bb[0] && cur.bb[2] <= other.bb[2] &&
            cur.bb[1] >= other.bb[1] && cur.bb[3] <= other.bb[3]) {
          if (Geo.pointInPoly(pt, other.poly)) {
            cur.parents++;
            other.children.push(cur);
          }
        }
      }
    }

    return infos.map(inf => ({
      ent: inf.ent,
      isInner: (inf.parents % 2) === 1, // 1, 3, 5 parents -> inner hole
      depth: inf.parents,
      area: inf.area
    }));
  }

  /**
   * Auto-sort cutting sequence (IGEMS style):
   * Cut deepest holes first, then outer part profiles, minimizing rapid traverse.
   */
  function sequenceCuts(ents, startPoint = { x: 0, y: 0 }) {
    const analysis = analyzeContours(ents);
    const unvisited = [...analysis];
    const ordered = [];
    let curPos = { ...startPoint };

    // Group by nesting depth (deepest first)
    unvisited.sort((a, b) => b.depth - a.depth);

    while (unvisited.length > 0) {
      // Find candidate with max depth, then shortest distance from curPos
      const maxDepth = Math.max(...unvisited.map(u => u.depth));
      const candidates = unvisited.filter(u => u.depth === maxDepth);

      let bestIdx = -1, bestDist = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const segs = Geo.segsOf(candidates[i].ent);
        const p0 = Geo.segStart(segs[0]);
        const d = Math.hypot(p0.x - curPos.x, p0.y - curPos.y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      const chosen = candidates[bestIdx];
      ordered.push(chosen);
      unvisited.splice(unvisited.indexOf(chosen), 1);

      const segs = Geo.segsOf(chosen.ent);
      curPos = Geo.segEnd(segs[segs.length - 1]);
    }

    // Add any open contours at the end (excluding bend lines, which are press brake lines, not cuts)
    const closedSet = new Set(closedEntities(ents).map(e => e.id));
    ents.filter(e => !closedSet.has(e.id) && e.type !== 'bend').forEach(e => {
      ordered.push({ ent: e, isInner: false, depth: 0, area: 0 });
    });

    return ordered;
  }

  function closedEntities(ents) {
    return ents.filter(Geo.isClosed);
  }

  /**
   * Generate lead-in and lead-out for an entity.
   * config: {
   *   type: 'arc' | 'line' | 'line_arc',
   *   inLen: 3.0,
   *   inRadius: 2.0,
   *   inAngle: 60, // degrees
   *   outLen: 2.0,
   *   outRadius: 1.5,
   *   outAngle: 45,
   *   overlap: 0.5,
   *   isInner: false
   * }
   */
  function generateLeads(ent, config) {
    const segs = Geo.segsOf(ent);
    if (!segs.length) return null;

    const firstSeg = segs[0];
    const lastSeg = segs[segs.length - 1];
    const startPt = Geo.segStart(firstSeg);
    const endPt = Geo.segEnd(lastSeg);

    // Tangent at start of cut
    const tan0 = Geo.segTanStart(firstSeg);
    // Normal vector: for inner hole, lead-in should be inside; for outer part, outside
    const isInner = config.isInner !== undefined ? config.isInner : false;
    // Normal pointing inside (+90 deg if CCW contour has positive area)
    const area = Geo.signedArea(segs);
    const isCCW = area > 0;
    
    // Side factor: 1 for left/inside, -1 for right/outside
    const side = (isInner ? 1 : -1) * (isCCW ? 1 : -1);
    const norm0 = { x: -tan0.y * side, y: tan0.x * side };

    const inLen = config.inLen || 3;
    const inRad = config.inRadius || 2;
    const inAng = (config.inAngle || 60) * D2R;

    let leadInSegs = [];
    if (config.type === 'line') {
      // Straight angled lead-in
      const ang = Math.atan2(tan0.y, tan0.x) + (side > 0 ? (Math.PI - inAng) : -(Math.PI - inAng));
      const pierce = {
        x: startPt.x + inLen * Math.cos(ang),
        y: startPt.y + inLen * Math.sin(ang)
      };
      leadInSegs.push({ t: 'L', x1: pierce.x, y1: pierce.y, x2: startPt.x, y2: startPt.y });
    } else if (config.type === 'arc') {
      // Circular arc tangent to contour start
      const arcCenter = {
        x: startPt.x + norm0.x * inRad,
        y: startPt.y + norm0.y * inRad
      };
      const aStart = Math.atan2(startPt.y - arcCenter.y, startPt.x - arcCenter.x);
      const sweep = (config.inAngle || 90) * D2R;
      const ccw = side < 0;
      const aPierce = ccw ? aStart - sweep : aStart + sweep;
      leadInSegs.push({
        t: 'A',
        cx: arcCenter.x,
        cy: arcCenter.y,
        r: inRad,
        a0: aPierce,
        a1: aStart,
        ccw: ccw
      });
    } else {
      // Line + Arc (classic IGEMS waterjet standard)
      const arcCenter = {
        x: startPt.x + norm0.x * inRad,
        y: startPt.y + norm0.y * inRad
      };
      const aStart = Math.atan2(startPt.y - arcCenter.y, startPt.x - arcCenter.x);
      const sweep = Math.PI / 2; // 90 deg tangent arc
      const ccw = side < 0;
      const aArcMid = ccw ? aStart - sweep : aStart + sweep;
      const arcPiercePt = {
        x: arcCenter.x + inRad * Math.cos(aArcMid),
        y: arcCenter.y + inRad * Math.sin(aArcMid)
      };
      // Straight line extension extending back
      const lineDir = { x: -tan0.x, y: -tan0.y };
      const pierce = {
        x: arcPiercePt.x + lineDir.x * inLen,
        y: arcPiercePt.y + lineDir.y * inLen
      };
      leadInSegs.push({ t: 'L', x1: pierce.x, y1: pierce.y, x2: arcPiercePt.x, y2: arcPiercePt.y });
      leadInSegs.push({
        t: 'A',
        cx: arcCenter.x,
        cy: arcCenter.y,
        r: inRad,
        a0: aArcMid,
        a1: aStart,
        ccw: ccw
      });
    }

    // Lead-out
    let leadOutSegs = [];
    const outLen = config.outLen || 2;
    if (outLen > 0) {
      const tanE = Geo.segTanEnd(lastSeg);
      const outAng = (config.outAngle || 45) * D2R;
      const aEnd = Math.atan2(tanE.y, tanE.x) + (side > 0 ? outAng : -outAng);
      const endLeadPt = {
        x: endPt.x + outLen * Math.cos(aEnd),
        y: endPt.y + outLen * Math.sin(aEnd)
      };
      leadOutSegs.push({ t: 'L', x1: endPt.x, y1: endPt.y, x2: endLeadPt.x, y2: endLeadPt.y });
    }

    return {
      leadIn: leadInSegs,
      leadOut: leadOutSegs,
      piercePoint: Geo.segStart(leadInSegs[0])
    };
  }

  /**
   * Build complete CAM toolpath including rapid traverses (G0),
   * lead-ins, cutting geometry, and lead-outs.
   */
  function buildToolpath(ents, options = {}) {
    const config = {
      type: options.type || 'line_arc',
      inLen: options.inLen || 3,
      inRadius: options.inRadius || 2,
      inAngle: options.inAngle || 60,
      outLen: options.outLen || 1.5,
      startPoint: options.startPoint || { x: 0, y: 0 }
    };

    const ordered = sequenceCuts(ents, config.startPoint);
    const cuts = [];
    const rapids = [];
    let curPos = { ...config.startPoint };

    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const leads = generateLeads(item.ent, { ...config, isInner: item.isInner });
      
      const pierce = leads ? leads.piercePoint : Geo.segStart(Geo.segsOf(item.ent)[0]);

      // Rapid traverse from previous cut end to this pierce point
      rapids.push({
        from: { ...curPos },
        to: { ...pierce }
      });

      const cutItem = {
        id: item.ent.id,
        isInner: item.isInner,
        order: i + 1,
        leadIn: leads ? leads.leadIn : [],
        geometry: Geo.segsOf(item.ent),
        leadOut: leads ? leads.leadOut : []
      };
      cuts.push(cutItem);

      // Next position is end of leadOut or geometry
      if (leads && leads.leadOut.length > 0) {
        curPos = Geo.segEnd(leads.leadOut[leads.leadOut.length - 1]);
      } else {
        const segs = cutItem.geometry;
        curPos = Geo.segEnd(segs[segs.length - 1]);
      }
    }

    return { cuts, rapids };
  }

  return {
    analyzeContours,
    sequenceCuts,
    generateLeads,
    buildToolpath
  };
});
