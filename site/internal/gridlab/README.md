# /internal/gridlab — GRIDLAB

Gridfinity parts for the studio bench, behind the same `/internal` login as the tool inventory.
No build step: plain ES modules, served as-is.

```
index.html        page shell (header, dialogs)
gridlab.css       styles — site.css tokens (Diatype, Gaisyr, #f2f2f2, glass pills, os-win windows)
app.js            the page: Bench · Tools (with Trace and Scan inside) · Make · Print · Rules
library.js        tool library: the pegboard plan's tools, inventory import and merge
fit.js            fits parts to tools: holders, trays, hooks, saddles, bins; grips; hook load estimate
model.js          tool models: height field from photo views or a scan; weight, balance, profiles, sections
parts.js          modes, presets, printer/filament profiles, build pipeline
geom.js           geometry (Manifold): bins, holders, shelves, plates, hooks, saddles, dovetail bases, desk organisers and stacks, drawer tiles, coupons
printcheck.js     print check: overhangs past 50/65°, bridges vs cantilevers, on each part as it lies on the bed
boards.js         Board A / Board B / table: hole lattices, zones, no-go holes, placement of shelves, hooks and dovetail bases
trace.js          photo → paper → outlines; tray packing; SVG/DXF export
export.js         binary STL + store-only ZIP
lib/              three.js r169, OrbitControls, Manifold 3.0 (WASM inlined as base64)
lib/loaders/      three.js STL, OBJ, PLY, GLTF and 3MF loaders (+ fflate), loaded only by the Scan tab
```

**Inventory.** On load the page reads `../tools/data/tools.json` and `kits.json` (same origin, same login
cookie) and the photos in `../tools/img/`. Plan sizes fill in widths, thicknesses, shafts and zones the
inventory doesn't give (marked *est.* in Tools). Re-exporting the inventory needs no change here.

**Trace review.** Every traced tool is rebuilt in 3D on the straightened photo — flat tools as outline ×
thickness, round ones turned on their long axis — with length, width and thickness on it, and a table
against the listed sizes. The models download as STL.

**Scans.** Attached scans are kept in IndexedDB (database `gridlab`), decimated to under ~30k triangles.

**State.** Bench parts, tool edits, traced outlines and drafts live in the browser (`localStorage`,
key `gridlab.v2`). Bench → *Save project .json* moves everything to another machine.

**Needs WebAssembly.** The site sends no Content-Security-Policy today; if one is added, allow
`'wasm-unsafe-eval'` in `script-src` for `/internal/gridlab/*`.
