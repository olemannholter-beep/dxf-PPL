import _Geo from '../core/geometry.js';
import _Dxf from '../core/dxf.js';
import _Cam from '../core/cam.js';
import _Parts from '../core/parts.js';
import _SheetMetal from '../core/sheetmetal.js';

export const Geo = _Geo && _Geo.default ? _Geo.default : _Geo;
export const Dxf = _Dxf && _Dxf.default ? _Dxf.default : _Dxf;
export const Cam = _Cam && _Cam.default ? _Cam.default : _Cam;
export const Parts = _Parts && _Parts.default ? _Parts.default : _Parts;
export const SheetMetal = _SheetMetal && _SheetMetal.default ? _SheetMetal.default : _SheetMetal;

export default { Geo, Dxf, Cam, Parts, SheetMetal };
