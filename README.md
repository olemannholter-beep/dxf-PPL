# IGEMS DXF Studio — Desktop CAD/CAM Application

A 2D Computer-Aided Design (CAD) and Computer-Aided Manufacturing (CAM) desktop application built with **Electron** and **JavaScript**. Designed specifically for sheet metal cutting (waterjet, laser, plasma, router), inspired by **IGEMS CAD/CAM**.

---

## 📁 Project Structure

```
dxf/
├── package.json              # Electron & electron-builder packaging config
├── README.md                 # Documentation & build guide
├── src/
│   ├── main/
│   │   ├── main.js           # Electron main process (lifecycle, native file dialogs, IPC)
│   │   └── preload.js        # Secure ContextBridge IPC API
│   ├── core/
│   │   ├── geometry.js       # 2D CAD Geometry Kernel (Trim, Extend, Fillet, Offset, Join...)
│   │   ├── dxf.js            # AutoCAD R12 ASCII DXF Exporter & Importer
│   │   └── cam.js            # IGEMS CAM Engine (Nesting, Inner/Outer, Leads, Sequencing)
│   └── renderer/
│       ├── index.html        # Desktop Application Window & Ribbon UI
│       ├── style.css         # Dark CAD Workbench theme
│       └── app.js            # Canvas rendering, Osnap engine, interactive tool controllers
```

---

## ⚡ Features (IGEMS Style)

### 1. Precision 2D CAD Drawing & Snapping
- **Entities**: Lines, Continuous Polylines (with DXF bulge arcs), Rectangles, Circles, and 3-Point Arcs.
- **Snaps (OSNAP)**: Endpoint, Midpoint, Center, Quadrant, with visual green indicator badges.
- **Precision Inputs**: Bottom command prompt accepts:
  - Absolute: `100,50`
  - Relative: `@25,10`
  - Polar: `@50<45` (Length `<` Angle)
  - Direct distance entry in the direction of the cursor.
- **Auto-Coordinate & Dimension Badges**: Live display of lengths, angles, circle diameters, and rectangle dimensions while drawing.

### 2. Geometry Editing (Modify Tools)
- **Trim**: Cuts entity segments back to cutting edges.
- **Extend**: Extends lines and arcs to boundary entities.
- **Fillet**: Rounds sharp corners of polylines or line junctions to a specified radius.
- **Offset**: Generates parallel contours (kerf compensation / tool radius offset) to the inside or outside.
- **Join (Auto-Chain)**: Connects touching lines and arcs into continuous closed polylines.
- **Explode**: Decomposes complex polylines back into individual lines and arcs.
- **Clean Geometry**: Automatically detects and deletes duplicate overlapping lines and zero-length artifacts.
- **Open Ends Detector**: Scans and marks any unclosed endpoints with red warning circles.

### 3. CAM / Waterjet / Laser Cutting Tools (IGEMS Core)
- **Inner / Outer Contour Classification**: Automatically identifies nested hole contours vs. outer part perimeters using winding numbers and ray-casting.
- **Automatic Piercing & Lead-in / Lead-out**:
  - Automatically places lead-in pierces **inside holes** (in scrap material) and **outside parts** (in remnant plate).
  - Supported lead geometries: **Line + Arc** (IGEMS standard tangent radius), **Arc**, or **Line**.
  - Customizable lead-in length, radius, angle, and lead-out overcut.
- **Cut Sequence Optimizer (G0 Rapids)**: Automatically sorts cutting order so all internal holes are cut before the outer boundary, minimizing machine rapid traverse movements.
- **Interactive Start Point Relocation**: Click anywhere on a contour to relocate the piercing point and lead-in.
- **Cut Direction Control**: Instant toggle between clockwise (CW) and counter-clockwise (CCW) cutting directions (Climb vs Conventional cutting).
- **Rapid Traverse Simulation**: Renders dashed purple G0 machine traverse links and numbered sequence badges (1, 2, 3...).

### 4. Parametric Part Library (IGEMS Standard Shapes)
Access via the **Part Library** button in the Draw ribbon:
- **Circular Bolt Flange**: Pitch circle diameter (PCD), outer diameter (OD), center bore (ID), bolt hole count & diameter.
- **Mounting Baseplate**: Rectangular baseplate with 4 corner holes, corner fillets, and optional center bore.
- **Slotted Link / Stadium**: Oblong link plate with rounded ends and dual pin holes.
- **Washer / Ring Bushing**: Heavy concentric pipe ring / washer.
- **Lifting Lug / Pad Eye**: Shackle eye with rounded head and base flange.
- **Triangle Gusset / Stiffener**: Structural triangle gusset with corner weld-relief notch and lightening hole.
- **Hexagon / Polygon Hub**: Regular polygon / hex nut shape with center bore.
- Features a **live interactive auto-scaled preview canvas**, customizable origin coordinates, and automatic assignment to `PARTS` and `HOLES` CAM layers.

### 5. SolidWorks Inspired "Smart Dimensions" (`D`)
Access via the **Smart Dim** button in the ribbon or by pressing the **`D`** key:
- **Instant Measurement**:
  - **Lines & Polyline Segments**: Measures length with extension witness lines and dimension badges.
  - **Circles**: Measures diameter ($\varnothing$) across the circle.
  - **Arcs**: Measures radius ($R$) from center to arc curve.
- **Direct Dimension Modification ("Modify" Dialog)**:
  - Clicking any measured entity opens a floating SolidWorks-style modify popover.
  - Type the desired dimension (e.g. change 100 mm to 140 mm).
- **Intact Joint Topology Preservation**:
  - When changing line/segment length, all connected adjacent entities (lines, arcs, polylines) sharing the joint vertex move with it, keeping corners connected without gaps.
  - **Orthogonal Box / Rectangle Mode**: When resizing horizontal or vertical lines in a box or rectangle, translates the entire opposite edge, maintaining 90° angles and keeping all 4 corners intact.
  - **Arc Endpoints Fixed**: Changing an arc's radius preserves its start and end joint vertices, adjusting curvature seamlessly.
  - **Growth Direction Control**: Choose `[▶ Grow End]`, `[◀ Grow Start]`, or `[◀▶ Symmetric Mid]`.

### 6. DXF Import & Export
- **Export DXF (`Ctrl+S`)**: Clean AutoCAD R12 ASCII DXF format supported by all CNC controllers (IGEMS, Bystronic, Flow, OMAX, AutoCAD, SolidWorks, SheetCAM).
- **Export CAM DXF**: Exports full toolpath containing dedicated layers:
  - `PARTS`: Outer part geometry
  - `HOLES`: Internal cutout contours
  - `LEADS`: Lead-in and lead-out vectors
- **Open DXF (`Ctrl+O`)**: Opens and parses LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE, and block references.

### 7. Precision Grid, Explode & Join Tools
- **Fixed 1x1 mm Grid**: Snap and grid rendering are permanently calibrated strictly to 1.0 mm with integer millimeter snapping.
- **Explode (`X`)**: Instantly explodes selected parts, polylines, bulged contours, and circles back into individual pure lines and arcs.
- **Join (`J`)**: The exact reverse of Explode. Select touching individual lines and arcs, press **`J`** (or click **Join** in the ribbon or inspector), and they automatically merge into a single continuous unified part (polyline with arc bulges). Automatically detects closed loops vs. open chains.
- **Manual Input HUD**: Click left mouse button when drawing rectangles/squares or press the "Dimensions" button in the ribbon to open the HUD dialog to enter exact width and height numbers with locked square ratio.

---

## 🚀 How to Run in Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Launch the desktop application:
   ```bash
   npm start
   ```

---

## 📦 How to Package into an `.exe` File

The project is configured with **electron-builder** in `package.json`.

### Option A: Build Windows Installer (`Setup.exe`)
Generates an NSIS setup installer that creates Start Menu and Desktop shortcuts:
```bash
npm run dist
```
The resulting installer will be created in the `dist/` directory:
- `dist/IGEMS DXF Studio Setup 1.0.0.exe`

### Option B: Build Standalone Portable `.exe` (No installation needed)
Generates a single self-contained executable that runs immediately without installing:
```bash
npm run dist:portable
```
The resulting executable will be created in:
- `dist/IGEMS DXF Studio 1.0.0.exe`

### Option C: Unpacked Directory (Fastest for testing)
Packages all binaries into an unpacked folder for instant verification:
```bash
npm run pack
```
Run directly from `dist/win-unpacked/IGEMS DXF Studio.exe`.
