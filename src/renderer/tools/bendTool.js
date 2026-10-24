/**
 * Sheet Metal Bend Tool
 * Interactively draws press brake bend lines with angle, radius, direction,
 * and immediate Bend Deduction (BD) / Allowance (BA) calculations.
 */
import { Geo, SheetMetal } from '../core.js';
import { state, pushState, addEntity, activePoints, setActivePoints, selectedIds } from '../state.js';
import { showToast } from '../ui/toast.js';
import { render } from '../viewport.js';

export function handleBendPoint(p) {
  if (!activePoints.length) {
    setActivePoints([p]);
  } else {
    const p0 = activePoints[0];
    if (Geo.dist(p0, p) > 1e-4) {
      pushState();
      const sm = state.sheetMetal;
      const dirEl = document.getElementById('sm-bend-dir');
      const dir = (dirEl && dirEl.value) || sm.defaultDir || 'UP';
      const elAng = document.getElementById('sm-bend-angle');
      const parsedAng = elAng ? parseFloat(elAng.value) : NaN;
      const angle = !isNaN(parsedAng) ? Math.max(1, Math.min(179, parsedAng)) : (sm.defaultAngle || 90);
      const elRad = document.getElementById('sm-bend-radius');
      const parsedRad = elRad ? parseFloat(elRad.value) : NaN;
      const radius = !isNaN(parsedRad) ? Math.max(0, parsedRad) : (sm.defaultRadius != null ? sm.defaultRadius : 2.0);

      let kFactor = sm.kFactor;
      if (sm.autoKFactor && SheetMetal.calculateKFactor) {
        kFactor = SheetMetal.calculateKFactor({
          radius,
          thickness: sm.thickness,
          material: sm.material,
          method: sm.kMethod || 'air'
        }).kFactor;
      }

      const calc = SheetMetal.computeBend({
        angle,
        thickness: sm.thickness,
        radius,
        kFactor
      });

      const bendEnt = {
        type: 'bend',
        layer: dir === 'DOWN' ? 'BEND_DOWN' : 'BEND_UP',
        direction: dir,
        angle: calc.angle,
        radius: calc.radius,
        thickness: sm.thickness,
        kFactor,
        x1: p0.x,
        y1: p0.y,
        x2: p.x,
        y2: p.y,
        ba: calc.BA_formatted,
        bd: calc.BD_formatted,
        ossb: calc.OSSB_formatted
      };

      addEntity(bendEnt);
      selectedIds.clear();
      selectedIds.add(bendEnt.id);
      setActivePoints([]);
      showToast(`Bend Line placed: ${dir} ${calc.angle}° R=${calc.radius.toFixed(1)}mm (K=${kFactor.toFixed(3)}, BD=${calc.BD_formatted}mm)`);
      render();
    }
  }
}
