/* ==========================================================================
   DXF reader / writer  (window.Dxf  /  require)
   Writes AutoCAD R12 ASCII (LINE, CIRCLE, ARC, POLYLINE with bulges) which is
   read by practically every CAD/CAM package.  Reads LINE, CIRCLE, ARC,
   LWPOLYLINE, POLYLINE, ELLIPSE, SPLINE and INSERT (block references).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geometry.js'));
  else root.Dxf = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';
  const D2R = Math.PI / 180, TAU = Math.PI * 2, norm = Geo.norm;

  /* ------------------------------------------------------------------- write */
  function toDXF(ents, layers = [], units = 'mm') {
    const out = [], w = (c, v) => { out.push(String(c)); out.push(String(v)); };
    const f = n => String(+Number(n).toFixed(6));
    const used = new Set(ents.map(e => e.layer));
    const lay = (layers && layers.length ? layers : [
      { name: '0', aci: 7 },
      { name: 'PARTS', aci: 3 },
      { name: 'HOLES', aci: 4 },
      { name: 'LEADS', aci: 2 }
    ]).filter(l => used.has(l.name) || l.name === '0');
    w(0, 'SECTION'); w(2, 'HEADER');
    w(9, '$ACADVER'); w(1, 'AC1009');
    w(9, '$INSUNITS'); w(70, units === 'in' ? 1 : 4);
    w(9, '$MEASUREMENT'); w(70, units === 'in' ? 0 : 1);
    w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'TABLES');
    w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1);
    w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 0); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, 0);
    w(0, 'ENDTAB');
    w(0, 'TABLE'); w(2, 'LAYER'); w(70, lay.length);
    lay.forEach(l => { w(0, 'LAYER'); w(2, l.name); w(70, 0); w(62, l.aci); w(6, 'CONTINUOUS'); });
    w(0, 'ENDTAB');
    w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'BLOCKS'); w(0, 'ENDSEC');
    w(0, 'SECTION'); w(2, 'ENTITIES');
    for (const e of ents) {
      switch (e.type) {
        case 'line':
          w(0, 'LINE'); w(8, e.layer); w(10, f(e.x1)); w(20, f(e.y1)); w(30, 0); w(11, f(e.x2)); w(21, f(e.y2)); w(31, 0); break;
        case 'circle':
          w(0, 'CIRCLE'); w(8, e.layer); w(10, f(e.cx)); w(20, f(e.cy)); w(30, 0); w(40, f(e.r)); break;
        case 'arc':
          w(0, 'ARC'); w(8, e.layer); w(10, f(e.cx)); w(20, f(e.cy)); w(30, 0); w(40, f(e.r));
          w(50, f(norm(e.a1) / D2R)); w(51, f(norm(e.a2) / D2R)); break;
        case 'poly':
          w(0, 'POLYLINE'); w(8, e.layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, e.closed ? 1 : 0);
          e.pts.forEach(p => { w(0, 'VERTEX'); w(8, e.layer); w(10, f(p.x)); w(20, f(p.y)); w(30, 0); if (p.b) w(42, f(p.b)); });
          w(0, 'SEQEND'); w(8, e.layer); break;
      }
    }
    w(0, 'ENDSEC'); w(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  /* -------------------------------------------------------------------- read */
  function evalBSpline(deg, knots, ctrl) {
    const n = ctrl.length, t0 = knots[deg], t1 = knots[n], N = Math.max(24, n * 10), pts = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * i / N; let k = deg;
      while (k < n - 1 && t >= knots[k + 1]) k++;
      const d = []; for (let j = 0; j <= deg; j++) d.push({ x: ctrl[j + k - deg].x, y: ctrl[j + k - deg].y });
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
        const den = knots[j + 1 + k - r] - knots[j + k - deg], al = den ? (t - knots[j + k - deg]) / den : 0;
        d[j] = { x: (1 - al) * d[j - 1].x + al * d[j].x, y: (1 - al) * d[j - 1].y + al * d[j].y };
      }
      pts.push(d[deg]);
    }
    return pts;
  }

  function parseRecords(text) {
    const lines = text.split(/\r?\n/), recs = []; let cur = null;
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const code = parseInt(lines[i].trim(), 10), val = lines[i + 1].trim();
      if (isNaN(code)) continue;
      if (code === 0) { cur = { type: val, d: [] }; recs.push(cur); } else if (cur) cur.d.push([code, val]);
    }
    return recs;
  }

  function convert(recs, blocks, depth, skipped) {
    const ents = [];
    const addPoly = (verts, closed, layer) => {
      if (verts.length < 2) return;
      ents.push({ type: 'poly', layer, closed, pts: verts.map(v => ({ x: v.x, y: v.y, b: v.b || 0 })) });
    };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const get = (c, def = 0) => { const p = r.d.find(q => q[0] === c); return p ? parseFloat(p[1]) : def; };
      const str = (c, def = '') => { const p = r.d.find(q => q[0] === c); return p ? p[1] : def; };
      const layer = str(8, '0');
      switch (r.type) {
        case 'LINE': ents.push({ type: 'line', layer, x1: get(10), y1: get(20), x2: get(11), y2: get(21) }); break;
        case 'CIRCLE': ents.push({ type: 'circle', layer, cx: get(10), cy: get(20), r: get(40) }); break;
        case 'ARC': ents.push({ type: 'arc', layer, cx: get(10), cy: get(20), r: get(40), a1: get(50) * D2R, a2: get(51) * D2R }); break;
        case 'LWPOLYLINE': {
          const v = [];
          r.d.forEach(([c, s]) => {
            if (c === 10) v.push({ x: parseFloat(s), y: 0, b: 0 });
            else if (c === 20 && v.length) v[v.length - 1].y = parseFloat(s);
            else if (c === 42 && v.length) v[v.length - 1].b = parseFloat(s);
          });
          addPoly(v, (get(70) & 1) === 1, layer); break;
        }
        case 'POLYLINE': {
          const flags = get(70), v = []; let j = i + 1;
          while (j < recs.length && recs[j].type === 'VERTEX') {
            const vr = recs[j], g = c => { const p = vr.d.find(q => q[0] === c); return p ? parseFloat(p[1]) : 0; };
            v.push({ x: g(10), y: g(20), b: g(42) }); j++;
          }
          i = (recs[j] && recs[j].type === 'SEQEND') ? j : j - 1;
          if (flags & (16 | 64)) skipped.POLYLINE = (skipped.POLYLINE || 0) + 1; else addPoly(v, (flags & 1) === 1, layer);
          break;
        }
        case 'ELLIPSE': {
          const cx = get(10), cy = get(20), mx = get(11), my = get(21), ratio = get(40, 1);
          const t0 = get(41, 0), t1 = get(42, TAU), full = Math.abs(norm(t1 - t0)) < 1e-9 || Math.abs(t1 - t0 - TAU) < 1e-9;
          const sweep = full ? TAU : norm(t1 - t0), N = Math.max(24, Math.ceil(sweep / (TAU / 90))), v = [];
          for (let k = 0; k <= (full ? N - 1 : N); k++) {
            const t = t0 + sweep * k / N;
            v.push({ x: cx + mx * Math.cos(t) - my * ratio * Math.sin(t), y: cy + my * Math.cos(t) + mx * ratio * Math.cos(t) * 0 + mx * ratio * Math.sin(t) });
          }
          addPoly(v, full, layer); break;
        }
        case 'SPLINE': {
          const flags = get(70), deg = get(71, 3), knots = [], ctrl = [], fit = [];
          r.d.forEach(([c, s]) => {
            if (c === 40) knots.push(parseFloat(s));
            else if (c === 10) ctrl.push({ x: parseFloat(s), y: 0 });
            else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1].y = parseFloat(s);
            else if (c === 11) fit.push({ x: parseFloat(s), y: 0 });
            else if (c === 21 && fit.length) fit[fit.length - 1].y = parseFloat(s);
          });
          let v;
          if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) v = evalBSpline(deg, knots, ctrl);
          else v = fit.length ? fit : ctrl;
          addPoly(v, (flags & 1) === 1, layer); break;
        }
        case 'INSERT': {
          const b = blocks[str(2)];
          if (!b || depth > 4) { skipped.INSERT = (skipped.INSERT || 0) + 1; break; }
          const sx = get(41, 1), sy = get(42, sx), rot = get(50, 0) * D2R, ins = { x: get(10), y: get(20) };
          if (Math.abs(Math.abs(sx) - Math.abs(sy)) > 1e-9) { skipped.INSERT = (skipped.INSERT || 0) + 1; break; }
          const sub = convert(b.recs, blocks, depth + 1, skipped);
          sub.forEach(e => {
            Geo.moveEnt(e, -b.base.x, -b.base.y);
            if (sx < 0) Geo.mirrorEnt(e, { x: 0, y: 0 }, { x: 0, y: 1 });
            if (Math.abs(sx) !== 1) Geo.scaleEnt(e, { x: 0, y: 0 }, Math.abs(sx));
            if (rot) Geo.rotEnt(e, { x: 0, y: 0 }, rot);
            Geo.moveEnt(e, ins.x, ins.y);
            if (e.layer === '0') e.layer = layer;
            ents.push(e);
          });
          break;
        }
        case 'ATTRIB': case 'ATTDEF': case 'VERTEX': case 'SEQEND': break;
        default: skipped[r.type] = (skipped[r.type] || 0) + 1;
      }
    }
    return ents;
  }

  function parseDXF(text) {
    const recs = parseRecords(text), sections = {}, layers = {}, skipped = {}, blocks = {};
    let sec = '', units = null, curBlock = null;
    for (const r of recs) {
      if (r.type === 'SECTION') {
        const n = r.d.find(p => p[0] === 2); sec = n ? n[1] : ''; sections[sec] = sections[sec] || [];
        if (sec === 'HEADER') {
          for (let k = 0; k < r.d.length - 1; k++) if (r.d[k][0] === 9 && r.d[k][1] === '$INSUNITS') {
            const u = parseInt(r.d[k + 1][1], 10); if (u === 1) units = 'in'; else if (u === 4) units = 'mm';
          }
        }
        continue;
      }
      if (r.type === 'ENDSEC') { sec = ''; continue; }
      if (sec === 'TABLES' && r.type === 'LAYER') {
        const n = r.d.find(p => p[0] === 2), c = r.d.find(p => p[0] === 62);
        if (n) layers[n[1]] = Math.abs(c ? parseInt(c[1], 10) : 7) || 7;
        continue;
      }
      if (sec === 'BLOCKS') {
        if (r.type === 'BLOCK') {
          const g = c => { const p = r.d.find(q => q[0] === c); return p ? parseFloat(p[1]) : 0; };
          const n = r.d.find(p => p[0] === 2); curBlock = { recs: [], base: { x: g(10), y: g(20) } }; if (n) blocks[n[1]] = curBlock; continue;
        }
        if (r.type === 'ENDBLK') { curBlock = null; continue; }
        if (curBlock) curBlock.recs.push(r);
        continue;
      }
      if (sec === 'ENTITIES') sections.ENTITIES.push(r);
    }
    const ents = convert(sections.ENTITIES || [], blocks, 0, skipped);
    return { ents, layers, skipped, units };
  }

  return { toDXF, parseDXF };
});
