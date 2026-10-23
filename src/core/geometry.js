/* ==========================================================================
   Geometry kernel.  Works in the browser (window.Geo) and in Node (require).

   Entity model (all coordinates in drawing units, Y up):
     line   {x1,y1,x2,y2}
     circle {cx,cy,r}
     arc    {cx,cy,r,a1,a2}              counter-clockwise from a1 to a2 (radians)
     poly   {pts:[{x,y,b}], closed}      b = DXF "bulge" of the segment that
                                         starts at this vertex (0 = straight)
   Every entity also has id, layer and optionally `lead`.

   "Segments" are the directional primitives used by every algorithm:
     {t:'L', x1,y1,x2,y2}
     {t:'A', cx,cy,r, a0,a1, ccw}         travels from angle a0 to a1
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const norm = a => ((a % TAU) + TAU) % TAU;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clone = o => JSON.parse(JSON.stringify(o));
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };

  /* ------------------------------------------------------------------ segments */
  const segStart = s => s.t === 'L' ? { x: s.x1, y: s.y1 } : { x: s.cx + s.r * Math.cos(s.a0), y: s.cy + s.r * Math.sin(s.a0) };
  const segEnd = s => s.t === 'L' ? { x: s.x2, y: s.y2 } : { x: s.cx + s.r * Math.cos(s.a1), y: s.cy + s.r * Math.sin(s.a1) };
  const segSweep = s => s.t === 'C' ? TAU : (s.ccw ? norm(s.a1 - s.a0) : norm(s.a0 - s.a1));
  const segLen = s => s.t === 'L' ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) : s.r * segSweep(s);
  const bulgeOf = s => { const b = (s.ccw ? 1 : -1) * Math.tan(segSweep(s) / 4); return Math.abs(b) < 1e-12 ? 0 : b; };

  function segTanStart(s) {
    if (s.t === 'L') return unit(s.x2 - s.x1, s.y2 - s.y1);
    return s.ccw ? { x: -Math.sin(s.a0), y: Math.cos(s.a0) } : { x: Math.sin(s.a0), y: -Math.cos(s.a0) };
  }
  function segTanEnd(s) {
    if (s.t === 'L') return unit(s.x2 - s.x1, s.y2 - s.y1);
    return s.ccw ? { x: -Math.sin(s.a1), y: Math.cos(s.a1) } : { x: Math.sin(s.a1), y: -Math.cos(s.a1) };
  }
  function segReverse(s) {
    if (s.t === 'L') return { t: 'L', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
    return { t: 'A', cx: s.cx, cy: s.cy, r: s.r, a0: s.a1, a1: s.a0, ccw: !s.ccw };
  }
  function angOnSeg(s, a) {
    if (s.t === 'C') return true;
    return s.ccw ? norm(a - s.a0) <= norm(s.a1 - s.a0) + 1e-12 : norm(s.a0 - a) <= norm(s.a0 - s.a1) + 1e-12;
  }
  // point at fraction u (0..1) along a segment
  function segPointAt(s, u) {
    if (s.t === 'L') return { x: s.x1 + (s.x2 - s.x1) * u, y: s.y1 + (s.y2 - s.y1) * u };
    const a = s.a0 + (s.ccw ? 1 : -1) * segSweep(s) * u;
    return { x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) };
  }
  // sub-segment between fractions u0..u1
  function subSeg(s, u0, u1) {
    if (s.t === 'L') { const p = segPointAt(s, u0), q = segPointAt(s, u1); return { t: 'L', x1: p.x, y1: p.y, x2: q.x, y2: q.y }; }
    const sw = segSweep(s), d = s.ccw ? 1 : -1;
    return { t: 'A', cx: s.cx, cy: s.cy, r: s.r, a0: s.a0 + d * sw * u0, a1: s.a0 + d * sw * u1, ccw: s.ccw };
  }
  function segFromBulge(p, q, b) {
    const dx = q.x - p.x, dy = q.y - p.y, c = Math.hypot(dx, dy);
    if (c < 1e-12) return null;
    if (!b || Math.abs(b) < 1e-12) return { t: 'L', x1: p.x, y1: p.y, x2: q.x, y2: q.y };
    const th = 4 * Math.atan(Math.abs(b)), r = c / (2 * Math.sin(th / 2)), h = r * Math.cos(th / 2), sg = b > 0 ? 1 : -1;
    const cx = (p.x + q.x) / 2 + sg * (-dy / c) * h, cy = (p.y + q.y) / 2 + sg * (dx / c) * h;
    return { t: 'A', cx, cy, r, a0: Math.atan2(p.y - cy, p.x - cx), a1: Math.atan2(q.y - cy, q.x - cx), ccw: b > 0 };
  }

  function segsOf(e) {
    switch (e.type) {
      case 'line': return [{ t: 'L', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }];
      case 'arc': return [{ t: 'A', cx: e.cx, cy: e.cy, r: e.r, a0: e.a1, a1: e.a2, ccw: true }];
      case 'circle': return [
        { t: 'A', cx: e.cx, cy: e.cy, r: e.r, a0: 0, a1: Math.PI, ccw: true },
        { t: 'A', cx: e.cx, cy: e.cy, r: e.r, a0: Math.PI, a1: 0, ccw: true }];
      case 'poly': {
        const out = [], n = e.pts.length, m = e.closed ? n : n - 1;
        for (let i = 0; i < m; i++) {
          const s = segFromBulge(e.pts[i], e.pts[(i + 1) % n], e.pts[i].b || 0);
          if (s) out.push(s);
        }
        return out;
      }
    }
    return [];
  }

  function polyFromSegs(segs, closed) {
    const pts = segs.map(s => { const p = segStart(s); return { x: p.x, y: p.y, b: s.t === 'A' ? bulgeOf(s) : 0 }; });
    if (!closed && segs.length) { const e = segEnd(segs[segs.length - 1]); pts.push({ x: e.x, y: e.y, b: 0 }); }
    return { type: 'poly', pts, closed: !!closed };
  }
  function entFromSegs(segs, closed) {
    if (segs.length === 1 && !closed) {
      const s = segs[0];
      if (s.t === 'L') return { type: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      if (s.t === 'A') {
        return s.ccw
          ? { type: 'arc', cx: s.cx, cy: s.cy, r: s.r, a1: s.a0, a2: s.a1 }
          : { type: 'arc', cx: s.cx, cy: s.cy, r: s.r, a1: s.a1, a2: s.a0 };
      }
    }
    return polyFromSegs(segs, closed);
  }

  /* -------------------------------------------------------------- measurement */
  function segBBox(s) {
    if (s.t === 'L') return [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)];
    const p = [segStart(s), segEnd(s)];
    if (s.t === 'C') { p.length = 0; }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; if (angOnSeg(s, a)) p.push({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) }); }
    const xs = p.map(q => q.x), ys = p.map(q => q.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  function bbox(e) {
    if (e.type === 'circle') return [e.cx - e.r, e.cy - e.r, e.cx + e.r, e.cy + e.r];
    const bs = segsOf(e).map(segBBox);
    if (!bs.length) return [0, 0, 0, 0];
    return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
  }
  function nearestOnSeg(s, x, y) {
    if (s.t === 'L') {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - s.x1) * dx + (y - s.y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const px = s.x1 + t * dx, py = s.y1 + t * dy;
      return { x: px, y: py, d: Math.hypot(x - px, y - py), u: t };
    }
    const a = Math.atan2(y - s.cy, x - s.cx);
    if (angOnSeg(s, a)) {
      const sw = segSweep(s), u = sw ? Math.min(1, (s.ccw ? norm(a - s.a0) : norm(s.a0 - a)) / sw) : 0;
      const px = s.cx + s.r * Math.cos(a), py = s.cy + s.r * Math.sin(a);
      return { x: px, y: py, d: Math.hypot(x - px, y - py), u };
    }
    const p0 = segStart(s), p1 = segEnd(s), d0 = Math.hypot(x - p0.x, y - p0.y), d1 = Math.hypot(x - p1.x, y - p1.y);
    return d0 <= d1 ? { x: p0.x, y: p0.y, d: d0, u: 0 } : { x: p1.x, y: p1.y, d: d1, u: 1 };
  }
  function distEnt(e, x, y) {
    if (e.type === 'circle') return Math.abs(Math.hypot(x - e.cx, y - e.cy) - e.r);
    let d = Infinity;
    for (const s of segsOf(e)) d = Math.min(d, nearestOnSeg(s, x, y).d);
    return d;
  }
  const entLen = e => e.type === 'circle' ? TAU * e.r : segsOf(e).reduce((a, s) => a + segLen(s), 0);

  function signedArea(segs) {
    let a = 0;
    for (const s of segs) {
      const p = segStart(s), q = segEnd(s);
      if (s.t === 'L') a += (p.x * q.y - q.x * p.y) / 2;
      else a += 0.5 * (s.r * s.r * (s.ccw ? 1 : -1) * segSweep(s) + s.cx * (q.y - p.y) - s.cy * (q.x - p.x));
    }
    return a;
  }
  function isClosed(e) { return e.type === 'circle' || (e.type === 'poly' && e.closed); }
  function area(e) { return isClosed(e) ? Math.abs(signedArea(segsOf(e))) : 0; }

  // polygon approximation of segments (for inside/outside tests)
  function sample(segs, step) {
    step = step || 0.08;
    const out = [];
    for (const s of segs) {
      if (s.t === 'L') { out.push(segStart(s)); continue; }
      const n = Math.max(2, Math.ceil(segSweep(s) / step));
      for (let i = 0; i < n; i++) out.push(segPointAt(s, i / n));
    }
    return out;
  }
  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /* --------------------------------------------------------------- transforms */
  function mapPts(e, f) {
    switch (e.type) {
      case 'line': { const a = f(e.x1, e.y1), b = f(e.x2, e.y2); e.x1 = a[0]; e.y1 = a[1]; e.x2 = b[0]; e.y2 = b[1]; break; }
      case 'circle': case 'arc': { const c = f(e.cx, e.cy); e.cx = c[0]; e.cy = c[1]; break; }
      case 'poly': e.pts.forEach(p => { const q = f(p.x, p.y); p.x = q[0]; p.y = q[1]; }); break;
    }
  }
  function moveEnt(e, dx, dy) { mapPts(e, (x, y) => [x + dx, y + dy]); return e; }
  function rotEnt(e, c, a) {
    const co = Math.cos(a), si = Math.sin(a);
    mapPts(e, (x, y) => [c.x + (x - c.x) * co - (y - c.y) * si, c.y + (x - c.x) * si + (y - c.y) * co]);
    if (e.type === 'arc') { e.a1 += a; e.a2 += a; }
    return e;
  }
  function scaleEnt(e, c, k) {
    mapPts(e, (x, y) => [c.x + (x - c.x) * k, c.y + (y - c.y) * k]);
    if (e.type === 'circle' || e.type === 'arc') e.r *= k;
    if (e.lead) { ['inLen', 'outLen'].forEach(f => { if (e.lead[f]) e.lead[f] *= k; }); }
    return e;
  }
  function mirrorEnt(e, p1, p2) {
    const d = unit(p2.x - p1.x, p2.y - p1.y), phi = Math.atan2(d.y, d.x);
    mapPts(e, (x, y) => {
      const vx = x - p1.x, vy = y - p1.y, pr = vx * d.x + vy * d.y;
      return [2 * (p1.x + d.x * pr) - x, 2 * (p1.y + d.y * pr) - y];
    });
    if (e.type === 'arc') { const a1 = 2 * phi - e.a2, a2 = 2 * phi - e.a1; e.a1 = a1; e.a2 = a2; }
    if (e.type === 'poly') e.pts.forEach(p => { p.b = -(p.b || 0); });
    return e;
  }

  /* ------------------------------------------------------------- intersection */
  function llInt(a, b) {
    const d1x = a.x2 - a.x1, d1y = a.y2 - a.y1, d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12 * Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y) || den === 0) return null;
    const t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / den;
    return { x: a.x1 + t * d1x, y: a.y1 + t * d1y };
  }
  function lcInt(l, c) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1, fx = l.x1 - c.cx, fy = l.y1 - c.cy;
    const A = dx * dx + dy * dy; if (A < 1e-18) return [];
    const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r;
    let disc = B * B - 4 * A * C;
    if (disc < -1e-9 * Math.max(1, B * B)) return [];
    disc = Math.sqrt(Math.max(0, disc));
    const ts = disc < 1e-9 ? [-B / (2 * A)] : [(-B - disc) / (2 * A), (-B + disc) / (2 * A)];
    return ts.map(t => ({ x: l.x1 + t * dx, y: l.y1 + t * dy }));
  }
  function ccInt(a, b) {
    const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
    if (d < 1e-12 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
    const x = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
    const mx = a.cx + dx * x / d, my = a.cy + dy * x / d;
    if (h < 1e-9) return [{ x: mx, y: my }];
    return [{ x: mx - dy * h / d, y: my + dx * h / d }, { x: mx + dy * h / d, y: my - dx * h / d }];
  }
  function onSeg(s, p, ext) {
    if (ext) return true;
    if (s.t === 'L') {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
      const t = l2 ? ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / l2 : 0;
      return t >= -1e-9 && t <= 1 + 1e-9;
    }
    return angOnSeg(s, Math.atan2(p.y - s.cy, p.x - s.cx));
  }
  // ext1/ext2: treat that segment as an infinite line / full circle
  function intersect(s1, s2, ext1, ext2) {
    const L1 = s1.t === 'L', L2 = s2.t === 'L';
    let raw;
    if (L1 && L2) { const r = llInt(s1, s2); raw = r ? [r] : []; }
    else if (L1) raw = lcInt(s1, s2);
    else if (L2) raw = lcInt(s2, s1);
    else raw = ccInt(s1, s2);
    return raw.filter(p => onSeg(s1, p, ext1) && onSeg(s2, p, ext2));
  }
  function paramOf(s, p) {
    if (s.t === 'L') {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy;
      return l2 ? ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / l2 : 0;
    }
    const a = Math.atan2(p.y - s.cy, p.x - s.cx), sw = segSweep(s);
    return Math.min(1, (s.ccw ? norm(a - s.a0) : norm(s.a0 - a)) / sw);
  }

  /* ---------------------------------------------------------------- trim/extend */
  function trimSeg(s, p, cutters) {
    const params = [];
    for (const c of cutters) { if (c === s) continue; for (const ip of intersect(s, c, false, false)) params.push(Math.max(0, Math.min(1, paramOf(s, ip)))); }
    if (!params.length) return [];
    const u = nearestOnSeg(s, p.x, p.y).u;
    let lo = null, hi = null;
    for (const t of params) { if (t <= u) { if (lo === null || t > lo) lo = t; } else if (hi === null || t < hi) hi = t; }
    const out = [], L = segLen(s), eps = 1e-6 / Math.max(L, 1e-9);
    if (lo !== null && lo > eps) out.push(subSeg(s, 0, lo));
    if (hi !== null && hi < 1 - eps) out.push(subSeg(s, hi, 1));
    return out;
  }
  function trimCircle(e, p, cutters) {
    const cs = { t: 'C', cx: e.cx, cy: e.cy, r: e.r }, angs = [];
    for (const c of cutters) for (const ip of intersect(cs, c, false, false)) angs.push(norm(Math.atan2(ip.y - e.cy, ip.x - e.cx)));
    const u = [...new Set(angs.map(a => +a.toFixed(9)))].sort((a, b) => a - b);
    if (u.length < 2) return null;
    const ac = norm(Math.atan2(p.y - e.cy, p.x - e.cx));
    let lo = null, hi = null;
    for (const a of u) { if (a <= ac) lo = a; }
    for (let i = u.length - 1; i >= 0; i--) { if (u[i] > ac) hi = u[i]; }
    if (lo === null) lo = u[u.length - 1];
    if (hi === null) hi = u[0];
    return { type: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: hi, a2: lo };
  }
  // returns null (nothing to do) or { add: [entity,...] } meaning "replace e with these"
  function trimEntity(e, p, cutterSegs) {
    if (e.type === 'circle') { const a = trimCircle(e, p, cutterSegs); return a ? { add: [a] } : null; }
    const segs = segsOf(e);
    let k = 0, bd = Infinity;
    segs.forEach((s, i) => { const d = nearestOnSeg(s, p.x, p.y).d; if (d < bd) { bd = d; k = i; } });
    const others = segs.filter((_, i) => i !== k);
    const pieces = trimSeg(segs[k], p, cutterSegs.concat(others));
    if (e.type !== 'poly' && !pieces.length && !cutterSegs.some(c => intersect(segs[k], c, false, false).length)) return null;
    if (e.type === 'poly' && segs.length > 1 && !pieces.length && !cutterSegs.concat(others).some(c => c !== segs[k] && intersect(segs[k], c, false, false).length)) return null;
    return { add: others.map(s => entFromSegs([s], false)).concat(pieces.map(s => entFromSegs([s], false))) };
  }
  function extendEntity(e, p, boundSegs) {
    if (e.type === 'line') {
      const s = segsOf(e)[0], atEnd = Math.hypot(p.x - s.x2, p.y - s.y2) < Math.hypot(p.x - s.x1, p.y - s.y1);
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx * dx + dy * dy; let best = null;
      for (const b of boundSegs) for (const ip of intersect(s, b, true, false)) {
        const t = ((ip.x - s.x1) * dx + (ip.y - s.y1) * dy) / l2;
        if (atEnd) { if (t > 1 + 1e-9 && (best === null || t < best)) best = t; }
        else if (t < -1e-9 && (best === null || t > best)) best = t;
      }
      if (best === null) return null;
      const q = { x: s.x1 + best * dx, y: s.y1 + best * dy };
      return atEnd ? Object.assign({}, e, { x2: q.x, y2: q.y }) : Object.assign({}, e, { x1: q.x, y1: q.y });
    }
    if (e.type === 'arc') {
      const s = segsOf(e)[0], atEnd = dist(p, segEnd(s)) < dist(p, segStart(s)), sw = segSweep(s); let best = null;
      for (const b of boundSegs) for (const ip of intersect(s, b, true, false)) {
        const a = Math.atan2(ip.y - e.cy, ip.x - e.cx), du = atEnd ? norm(a - s.a1) : norm(s.a0 - a);
        if (du > 1e-9 && du < TAU - sw - 1e-9 && (best === null || du < best)) best = du;
      }
      if (best === null) return null;
      return atEnd ? Object.assign({}, e, { a2: e.a2 + best }) : Object.assign({}, e, { a1: e.a1 - best });
    }
    return null;
  }

  /* ------------------------------------------------------------ fillet/chamfer */
  // two (infinite-extended) lines with pick points -> {a, b, mid}
  function filletLines(l1, c1, l2, c2, R, chamfer) {
    const V = llInt(l1, l2); if (!V) return null;
    const keep = (l, c) => {
      const d0 = (l.x1 - V.x) * (c.x - V.x) + (l.y1 - V.y) * (c.y - V.y), d1 = (l.x2 - V.x) * (c.x - V.x) + (l.y2 - V.y) * (c.y - V.y);
      return d0 > d1 ? 0 : 1;
    };
    const k1 = keep(l1, c1), k2 = keep(l2, c2);
    const Ea = k1 === 0 ? { x: l1.x1, y: l1.y1 } : { x: l1.x2, y: l1.y2 };
    const Eb = k2 === 0 ? { x: l2.x1, y: l2.y1 } : { x: l2.x2, y: l2.y2 };
    const dA = unit(Ea.x - V.x, Ea.y - V.y), dB = unit(Eb.x - V.x, Eb.y - V.y);
    const mk = (l, k, E, T) => k === 0 ? Object.assign({}, l, { x1: E.x, y1: E.y, x2: T.x, y2: T.y }) : Object.assign({}, l, { x1: T.x, y1: T.y, x2: E.x, y2: E.y });
    if (!(R > 0)) return { a: mk(l1, k1, Ea, V), b: mk(l2, k2, Eb, V), mid: null };
    const al = Math.acos(Math.max(-1, Math.min(1, dA.x * dB.x + dA.y * dB.y)));
    if (al < 1e-6 || al > Math.PI - 1e-6) return null;
    const t = chamfer ? R : R / Math.tan(al / 2);
    if (t > dist(V, Ea) + 1e-9 || t > dist(V, Eb) + 1e-9) return null;
    const TA = { x: V.x + dA.x * t, y: V.y + dA.y * t }, TB = { x: V.x + dB.x * t, y: V.y + dB.y * t };
    let mid;
    if (chamfer) mid = { type: 'line', x1: TA.x, y1: TA.y, x2: TB.x, y2: TB.y };
    else {
      const bis = unit(dA.x + dB.x, dA.y + dB.y), k = R / Math.sin(al / 2), C = { x: V.x + bis.x * k, y: V.y + bis.y * k };
      const aA = Math.atan2(TA.y - C.y, TA.x - C.x), aB = Math.atan2(TB.y - C.y, TB.x - C.x);
      const cr = (TA.x - C.x) * (TB.y - C.y) - (TA.y - C.y) * (TB.x - C.x);
      mid = cr > 0 ? { type: 'arc', cx: C.x, cy: C.y, r: R, a1: aA, a2: aB } : { type: 'arc', cx: C.x, cy: C.y, r: R, a1: aB, a2: aA };
    }
    return { a: mk(l1, k1, Ea, TA), b: mk(l2, k2, Eb, TB), mid };
  }
  // round (or chamfer) the straight-straight corners of a polyline. Returns {ent, count}
  function roundCorners(p, R, chamfer, onlyIdx) {
    const n = p.pts.length, out = []; let count = 0;
    for (let i = 0; i < n; i++) {
      const v = p.pts[i], hasPrev = p.closed || i > 0, hasNext = p.closed || i < n - 1;
      const A = p.pts[(i - 1 + n) % n], C = p.pts[(i + 1) % n];
      if (!(hasPrev && hasNext) || (A.b || 0) !== 0 || (v.b || 0) !== 0 || (onlyIdx !== undefined && onlyIdx !== i)) { out.push({ x: v.x, y: v.y, b: v.b || 0 }); continue; }
      const u = unit(v.x - A.x, v.y - A.y), w = unit(C.x - v.x, C.y - v.y);
      const cr = u.x * w.y - u.y * w.x, phi = Math.atan2(Math.abs(cr), u.x * w.x + u.y * w.y);
      const lim = 0.5 * Math.min(dist(A, v), dist(v, C)) + 1e-9;
      const t = chamfer ? R : R * Math.tan(phi / 2);
      if (phi < 1e-6 || phi > Math.PI - 1e-6 || !(t > 0) || t > lim) { out.push({ x: v.x, y: v.y, b: 0 }); continue; }
      out.push({ x: v.x - u.x * t, y: v.y - u.y * t, b: chamfer ? 0 : Math.sign(cr) * Math.tan(phi / 4) });
      out.push({ x: v.x + w.x * t, y: v.y + w.y * t, b: 0 });
      count++;
    }
    return { ent: Object.assign({}, p, { pts: out }), count };
  }

  /* ------------------------------------------------------------------- offset */
  function offsetSeg(s, d) {
    if (s.t === 'L') {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * d, ny = dx / l * d;
      return { t: 'L', x1: s.x1 + nx, y1: s.y1 + ny, x2: s.x2 + nx, y2: s.y2 + ny };
    }
    const r = s.ccw ? s.r - d : s.r + d;
    return r <= 1e-9 ? null : Object.assign({}, s, { r });
  }
  const setEnd = (s, p) => { if (s.t === 'L') { s.x2 = p.x; s.y2 = p.y; } else s.a1 = Math.atan2(p.y - s.cy, p.x - s.cx); };
  const setStart = (s, p) => { if (s.t === 'L') { s.x1 = p.x; s.y1 = p.y; } else s.a0 = Math.atan2(p.y - s.cy, p.x - s.cx); };

  // d > 0 offsets to the LEFT of the direction of travel
  function offsetSegs(segs, closed, d) {
    const orig = [], off = [];
    segs.forEach(s => { const o = offsetSeg(s, d); if (o) { orig.push(s); off.push(o); } });
    const n = off.length; if (!n) return [];
    const joints = new Array(n).fill(null), m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n, a = off[i], b = off[j], V = segEnd(orig[i]);
      const ta = segTanEnd(orig[i]), tb = segTanStart(orig[j]), cr = ta.x * tb.y - ta.y * tb.x, dt = ta.x * tb.x + ta.y * tb.y;
      const pa = segEnd(a), pb = segStart(b), gap = dist(pa, pb);
      if (gap < 1e-7) continue;
      if (Math.abs(cr) < 1e-9 && dt > 0) { joints[i] = { seg: { t: 'L', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y } }; continue; }
      const inner = d > 0 ? cr > 0 : cr < 0;
      if (inner) {
        const ips = intersect(a, b, true, true);
        if (ips.length) {
          ips.sort((p, q) => dist(p, V) - dist(q, V));
          joints[i] = { pt: ips[0] };
        } else joints[i] = { seg: { t: 'L', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y } };
      } else {
        joints[i] = { seg: { t: 'A', cx: V.x, cy: V.y, r: Math.abs(d), a0: Math.atan2(pa.y - V.y, pa.x - V.x), a1: Math.atan2(pb.y - V.y, pb.x - V.x), ccw: cr > 0 } };
      }
    }
    const res = off.map(s => Object.assign({}, s));
    for (let i = 0; i < m; i++) { const j = (i + 1) % n; if (joints[i] && joints[i].pt) { setEnd(res[i], joints[i].pt); setStart(res[j], joints[i].pt); } }
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = res[i], o = orig[i];
      let ok = true;
      if (s.t === 'L') { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, ox = o.x2 - o.x1, oy = o.y2 - o.y1; ok = dx * ox + dy * oy > 1e-12; }
      else ok = segSweep(s) <= segSweep(o) + 1e-6 && segSweep(s) > 1e-9;
      if (ok) out.push(s);
      if (joints[i] && joints[i].seg) out.push(joints[i].seg);
    }
    return out;
  }
  // signed side test: +1 if point is left of the entity's direction at its nearest point
  function sideOf(e, p) {
    if (e.type === 'circle' || e.type === 'arc') return Math.hypot(p.x - e.cx, p.y - e.cy) < e.r ? 1 : -1;
    let best = null, bd = Infinity;
    for (const s of segsOf(e)) { const q = nearestOnSeg(s, p.x, p.y); if (q.d < bd) { bd = q.d; best = s; } }
    if (!best) return 1;
    if (best.t === 'L') return ((best.x2 - best.x1) * (p.y - best.y1) - (best.y2 - best.y1) * (p.x - best.x1)) >= 0 ? 1 : -1;
    const inside = Math.hypot(p.x - best.cx, p.y - best.cy) < best.r;
    return (best.ccw ? inside : !inside) ? 1 : -1;
  }
  function offsetEntity(e, d, sidePt) {
    if (e.type === 'circle' || e.type === 'arc') {
      const inside = Math.hypot(sidePt.x - e.cx, sidePt.y - e.cy) < e.r, r = inside ? e.r - d : e.r + d;
      if (r <= 1e-9) return null;
      return Object.assign(clone(e), { r });
    }
    const sg = sideOf(e, sidePt), closed = e.type === 'poly' && e.closed;
    const segs = offsetSegs(segsOf(e), closed, sg * d);
    if (!segs.length) return null;
    return entFromSegs(segs, closed);
  }

  /* --------------------------------------------------- join / explode / cleanup */
  function joinEntities(ents, tol) {
    const items = [];
    ents.forEach(e => {
      if (e.type === 'circle' || (e.type === 'poly' && e.closed)) return;
      segsOf(e).forEach(s => items.push({ s, id: e.id, used: false }));
    });
    const result = [];
    for (const it of items) {
      if (it.used) continue;
      it.used = true;
      const chain = [it.s], ids = new Set([it.id]);
      const find = (pt, wantStart) => {
        let best = null, bd = tol;
        for (const o of items) {
          if (o.used) continue;
          const ps = segStart(o.s), pe = segEnd(o.s);
          const d1 = dist(pt, wantStart ? ps : pe), d2 = dist(pt, wantStart ? pe : ps);
          if (d1 <= bd) { bd = d1; best = { o, rev: false }; }
          if (d2 < bd) { bd = d2; best = { o, rev: true }; }
        }
        return best;
      };
      for (;;) { // forward
        const f = find(segEnd(chain[chain.length - 1]), true);
        if (!f) break; f.o.used = true; ids.add(f.o.id); chain.push(f.rev ? segReverse(f.o.s) : f.o.s);
        if (dist(segEnd(f.rev ? segReverse(f.o.s) : f.o.s), segStart(chain[0])) <= tol && chain.length > 1) break;
      }
      for (;;) { // backward (only if not closed)
        if (chain.length > 1 && dist(segEnd(chain[chain.length - 1]), segStart(chain[0])) <= tol) break;
        const f = find(segStart(chain[0]), false);
        if (!f) break; f.o.used = true; ids.add(f.o.id); chain.unshift(f.rev ? segReverse(f.o.s) : f.o.s);
      }
      const closed = chain.length > 1 && dist(segEnd(chain[chain.length - 1]), segStart(chain[0])) <= tol;
      if (chain.length > 1) result.push({ ent: entFromSegs(chain, closed), srcIds: [...ids], closed });
    }
    return result;
  }
  function explodeEntity(e) {
    if (e.type === 'poly') {
      return segsOf(e).map(s => {
        const ent = entFromSegs([s], false);
        ent.layer = e.layer;
        return ent;
      });
    }
    if (e.type === 'circle') {
      return [
        { type: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: 0, a2: Math.PI, layer: e.layer },
        { type: 'arc', cx: e.cx, cy: e.cy, r: e.r, a1: Math.PI, a2: 0, layer: e.layer }
      ];
    }
    return null;
  }
  function reverseEntity(e) {
    if (e.type === 'line') return Object.assign({}, e, { x1: e.x2, y1: e.y2, x2: e.x1, y2: e.y1 });
    if (e.type === 'arc' || e.type === 'circle') {
      const segs = e.type === 'arc' ? segsOf(e) : segsOf(e);
      const rev = segs.map(segReverse).reverse();
      return Object.assign(polyFromSegs(rev, e.type === 'circle'), {});
    }
    if (e.type === 'poly') {
      const n = e.pts.length, B = e.pts.map(p => p.b || 0), out = [];
      for (let k = 0; k < n; k++) {
        const src = e.pts[n - 1 - k];
        const b = k <= n - 2 ? -B[n - 2 - k] : (e.closed ? -B[n - 1] : 0);
        out.push({ x: src.x, y: src.y, b });
      }
      return Object.assign({}, e, { pts: out });
    }
    return e;
  }
  // make the contour begin at the point nearest to p (inserting a vertex if needed)
  function setStartPoint(e, p, snapTol) {
    if (e.type === 'line') return dist(p, { x: e.x1, y: e.y1 }) <= dist(p, { x: e.x2, y: e.y2 }) ? e : reverseEntity(e);
    if (e.type === 'arc') return e;
    let segs = segsOf(e);
    if (!segs.length) return e;
    let k = 0, bu = 0, bd = Infinity;
    segs.forEach((s, i) => { const q = nearestOnSeg(s, p.x, p.y); if (q.d < bd) { bd = q.d; k = i; bu = q.u; } });
    const s = segs[k], L = segLen(s);
    let rotated;
    if (bu * L <= snapTol) rotated = segs.slice(k).concat(segs.slice(0, k));
    else if ((1 - bu) * L <= snapTol) { const j = (k + 1) % segs.length; rotated = segs.slice(j).concat(segs.slice(0, j)); }
    else rotated = [subSeg(s, bu, 1)].concat(segs.slice(k + 1), segs.slice(0, k), [subSeg(s, 0, bu)]);
    return polyFromSegs(rotated, true);
  }
  // remove zero-length items & exact duplicates. returns {keep:[...], removed:[ids]}
  function cleanup(ents, tol) {
    const seen = new Set(), removed = [], keep = [];
    const q = v => Math.round(v / tol);
    const sig = e => {
      switch (e.type) {
        case 'line': { const a = [q(e.x1), q(e.y1)], b = [q(e.x2), q(e.y2)]; return 'L' + (a < b ? a + '|' + b : b + '|' + a); }
        case 'circle': return 'C' + [q(e.cx), q(e.cy), q(e.r)];
        case 'arc': return 'A' + [q(e.cx), q(e.cy), q(e.r), q(norm(e.a1) * e.r), q(norm(e.a2) * e.r)];
        case 'poly': { const a = e.pts.map(p => q(p.x) + ',' + q(p.y)); const f = a.join(';'), r = a.slice().reverse().join(';'); return 'P' + e.closed + (f < r ? f : r); }
      }
    };
    for (const e of ents) {
      const tiny = (e.type === 'line' && Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < tol) || ((e.type === 'circle' || e.type === 'arc') && e.r < tol) ||
        (e.type === 'poly' && (e.pts.length < 2 || entLen(e) < tol));
      const s = sig(e);
      if (tiny || seen.has(s)) removed.push(e.id); else { seen.add(s); keep.push(e); }
    }
    return { keep, removed };
  }
  // unconnected end points of open contours (for the "show open ends" check)
  function openEnds(ents, tol) {
    const pts = [];
    ents.forEach(e => {
      if (isClosed(e)) return;
      const segs = segsOf(e); if (!segs.length) return;
      pts.push(segStart(segs[0]), segEnd(segs[segs.length - 1]));
    });
    return pts.filter((p, i) => !pts.some((q, j) => j !== i && dist(p, q) <= tol));
  }

  return {
    TAU, D2R, norm, dist, clone, unit,
    segStart, segEnd, segSweep, segLen, bulgeOf, segTanStart, segTanEnd, segReverse, angOnSeg, segPointAt, subSeg, segFromBulge,
    segsOf, polyFromSegs, entFromSegs, segBBox, bbox, nearestOnSeg, distEnt, entLen, signedArea, isClosed, area, sample, pointInPoly,
    moveEnt, rotEnt, scaleEnt, mirrorEnt, intersect, paramOf,
    trimEntity, extendEntity, filletLines, roundCorners, offsetSegs, offsetEntity, sideOf,
    joinEntities, explodeEntity, reverseEntity, setStartPoint, cleanup, openEnds,
  };
});
