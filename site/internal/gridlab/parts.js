// GRIDLAB — modes, presets, printer/material profiles and the build pipeline (shared by the page and the Node tests).
import * as G from './geom.js';
import { BOARDS, placeShelf, placeTablePlate, placeHook, placeBase, placeShelfDove } from './boards.js';
import { printCheck } from './printcheck.js';

export const g = (shape, a, b, n, pitch, extra = {}) => ({ shape, a, b: b ?? a, n, pitch, rows: 1, rowPitch: 0, x: 0, y: 0, depth: 0, through: false, cells: false, stagger: false, ...extra });

export const MODES = [
  { id: 'shelf', label: 'Shelf', blurb: 'Gridfinity baseplate shelf for Board A or B. Dovetail tongues on the back slide into bases on the board — or pins through the back plate.' },
  { id: 'table', label: 'Table plate', blurb: 'Baseplate that plugs into the table’s holes. One piece, studs printed upright.' },
  { id: 'holder', label: 'Holder', blurb: 'Tool holder on a Gridfinity foot: round, hex, slot and traced cut-outs. Sits on any shelf, plate or drawer.' },
  { id: 'hook', label: 'Hooks', blurb: 'Wire-style hooks and hangers for Board A or B — pegs, J and L hooks, U-hooks, rings, spool rods, cradles, wide hangers — on a dovetail tab. None need supports.' },
  { id: 'mount', label: 'Saddle', blurb: 'A block with a pocket shaped to the part of the tool you pick — a handle, the pivot, the head — on a dovetail back plate. For awkward tools like wire strippers.' },
  { id: 'base', label: 'Dovetail base', blurb: 'The studded plates every wall part slides into: S, M or L, for Board A or B. Spares, or a row to fill a board before the parts.' },
  { id: 'box', label: 'Box', blurb: 'Gridfinity bin or lid: stacking lip, compartments, label tabs, scoops, finger cut-out, see-through walls, magnets.' },
  { id: 'desk', label: 'Desk organiser', blurb: 'Desk stacks — drawer units that stack, under an angled caddy with a Gridfinity floor and inserts for pens, markers, scissors, cutters, rulers and post-its. Also trays (angled or flat), open-front bins, pen cups, slot blocks, file sorters and stands, flat-bottomed or on Gridfinity feet. No supports.' },
  { id: 'drawer', label: 'Drawer', blurb: 'Baseplate fitted to a drawer’s inside, padded to size and split into tiles that fit the bed.' },
  { id: 'fit', label: 'Fit test', blurb: 'Coupons to dial in tolerances for your printer and filament before a batch.' },
  { id: 'pins', label: 'Pins', blurb: 'Stud pins for the shelves, printed upright like the original coupons.' },
];

export const PRINTERS = [
  { id: 'h2c-l', label: 'H2C · single nozzle, left', x: 325, y: 320, z: 325 },
  { id: 'h2c-r', label: 'H2C · single nozzle, right', x: 305, y: 320, z: 325 },
  { id: 'h2c-d', label: 'H2C · both nozzles', x: 300, y: 320, z: 325 },
  { id: 'h3c', label: 'H3C · any PrintTool', x: 330, y: 320, z: 325 },
  { id: 'custom', label: 'Custom', x: 300, y: 300, z: 300 },
];

// tolerance defaults per filament (mm). hole: added to holes and cut-outs · stud: added to studs/pins Ø
// socket: widens baseplate sockets per side · bin: shrinks bins per side · pinFit: pin hole over pin Ø
// dove: dovetail groove clearance, normal to each flank
export const MATERIALS = [
  { id: 'abs-gf', label: 'Bambu ABS-GF', density: 1.08, hole: 0.15, stud: 0, socket: 0, bin: 0, pinFit: 0.15, dove: 0.2,
    notes: ['Dry 80 °C for 8 h before printing.', 'Nozzle 240–280 °C; 0.4 or 0.6 mm (0.6 recommended), not 0.2. Glass fibre is abrasive — hardened nozzle.', 'Bed 90–100 °C with glue on Textured PEI or the Engineering Plate, enclosure closed.', 'Brim on long, thin parts (shelves) to stop corner lift.', 'Elongation at break is about 6 %: it snaps rather than bends. No press fits — pins slip in and get glued.', 'Layer lines are the weak direction. Upright pins can snap at the board face under a heavy shelf: print the pin set in plain ABS, or use 3/16″ (4.76 mm) steel rod on Board A.'] },
  { id: 'abs', label: 'ABS', density: 1.04, hole: 0.1, stud: 0, socket: 0, bin: 0, pinFit: 0.1, dove: 0.2,
    notes: ['Your stud coupons (Ø4.7 / Ø7.65) were fit-tested in ABS.', 'Enclosure closed, brim on long parts.'] },
  { id: 'asa', label: 'ASA', density: 1.07, hole: 0.1, stud: 0, socket: 0, bin: 0, pinFit: 0.1, dove: 0.2, notes: ['Prints like ABS; UV stable.'] },
  { id: 'petg', label: 'PETG', density: 1.27, hole: 0.15, stud: -0.05, socket: 0.05, bin: 0, pinFit: 0.15, dove: 0.25, notes: ['Strings and swells slightly — looser fits.'] },
  { id: 'pla', label: 'PLA', density: 1.24, hole: 0.1, stud: 0, socket: 0, bin: 0, pinFit: 0.1, dove: 0.15, notes: ['Creeps under constant load — fine for bins, not for loaded shelves.'] },
];

// print settings by what a part does: strength where it carries load, as little plastic as holds up elsewhere.
// walls = perimeters (0.42 mm lines), top/bottom = solid layers (0.2 mm), infill % and pattern.
export const PROFILES = {
  base: { label: 'Dovetail bases', walls: 4, top: 5, bottom: 5, infill: 15, pattern: 'gyroid', why: 'four walls make the Ø4.7 studs solid; they carry everything on the wall' },
  arm: { label: 'Hooks and saddles', walls: 4, top: 5, bottom: 5, infill: 20, pattern: 'gyroid', why: 'thin and loaded in bending — they are mostly walls anyway, so it costs a gram or two' },
  shelf: { label: 'Shelves and table plates', walls: 3, top: 4, bottom: 4, infill: 12, pattern: 'gyroid', why: 'they carry bins; the back plate and floor work as beams' },
  store: { label: 'Bins, holders, trays', walls: 2, top: 4, bottom: 3, infill: 8, pattern: 'gyroid', why: 'they only hold tools up — two walls and light infill is the Gridfinity norm' },
  tile: { label: 'Drawer tiles', walls: 2, top: 3, bottom: 3, infill: 10, pattern: 'grid', why: 'they lie flat in a drawer and carry nothing' },
  pin: { label: 'Pins and stud coupons', walls: 4, top: 4, bottom: 4, infill: 100, pattern: 'rectilinear', why: 'small and loaded across the layers: solid' },
};
// which profile a part prints with
export function profileFor(mode, key) {
  if (key === 'base' || key === 'doveBase' || key === 'studsA' || key === 'studsB') return 'base';
  if (key === 'hook' || key === 'saddle' || key === 'doveStubs') return 'arm';
  if (key === 'shelf' || key === 'plate' || key === 'holesA' || key === 'holesB') return 'shelf';
  if (key === 'pins') return 'pin';
  if (key === 'stand') return 'shelf';
  if (/^tile/.test(key) || key === 'socket') return 'tile';
  return 'store';
}
export const profileText = (pr) => `${pr.walls} walls · ${pr.top}/${pr.bottom} top/bottom · ${pr.infill} % ${pr.pattern}`;
export const DEFAULT_SETTINGS = { printer: 'h2c-l', bed: { x: 325, y: 320, z: 325 }, material: 'abs-gf', tol: { hole: 0.15, stud: 0, socket: 0, bin: 0, pinFit: 0.15, dove: 0.2 }, infill: 15, shell: 1.1, density: 1.08 };

const shelfBase = { board: 'A', mount: 'dovetail', dove: 'auto', doveN: 0, load: 0, nx: 5, ny: 1, backH: 42, backT: 6, rim: 3, cheeks: true, floor: 'open', window: 30, magStyle: 'press', pinD: 0, pinLen: 15, maxGap: 100, at: { x: 700, y: 200 } };
const tableBase = { nx: 3, ny: 2, rim: 3, funnel: 3, studLen: 15, maxStuds: 6, at: { x: 40, y: 270 } };
const holderBase = { nx: 2, ny: 1, U: 4, lip: false, tilt: 0, chamfer: 0.6, magnets: 'off', magCorners: false, above: 0, below: 0, on: null, groups: [] };
const boxBase = { kind: 'bin', nx: 2, ny: 1, U: 3, wall: 1.2, floorZ: 6, lip: 'normal', divX: 1, divY: 1, divH: 100, label: 'full', labelW: 12, labelLen: 30, scoop: true, scoopR: 10,
  cutout: false, cutoutW: 40, cutoutD: 10, pattern: 'off', patR: 4, patGap: 1.6, magnets: 'off', magCorners: false, screws: false, deck: 1.6, above: 0, on: null };
const hookBase = { board: 'A', mount: 'dovetail', dove: 'auto', load: 0, type: 'peg', wire: 0, rows: 2, L: 40, rise: 5, tip: 6, H: 16, R: 10, gap: 12, ringD: 22, stem: 6, spoolD: 18, stop: 4, cradleW: 60, width: 30, drop: 0, top: 2, studLen: 0,
  tool: { show: true, kind: 'plier', L: 130, W: 50, T: 12 }, at: { x: 1000, y: 100 } };
const mountBase = { ...hookBase, type: 'mount', rows: 2, sec: null, width: 24, clear: 1, wallB: 3, wallF: 3, floor: 3, hold: 0.6, lip: 3, orient: 'edge', tool: { show: true, kind: 'plier', L: 190, W: 60, T: 18 }, at: { x: 1000, y: 120 } };
// one parameter set for every desk kind; each kind reads its own fields (see the page's schema)
export const deskBase = { kind: 'tray', base: 'flat', W: 160, D: 100, H: 30, r: 6, nx: 3, ny: 2, U: 4, wall: 1.6, div: 1.2, floor: 1.6, pads: true, magnets: 'off', magCorners: false, on: null, above: 0,
  cx: 1, cy: 1, cols: '', frontH: 0, slopeTo: 1, tilt: 0, scoop: 0, divDrop: 0, notch: 0, notchD: 0, label: false, labelW: 0, labelH: 12,
  shape: 'round', dia: 70, slant: 0, dividers: 'none',
  n: 6, gap: 3, pitch: 0, depth: 0, lean: 0, round: false, rise: 0, endWall: 3,
  gaps: '', step: 20, sides: true,
  angle: 20, slot: 12, lip: 10, thick: 4, cable: 0, brace: true,
  layers: '60 x2, 40', caddy: true, inserts: 'pens, scissors, rulers', pull: 36, pocket: true, flutes: false };
const drawerBase = { sizing: 'drawer', W: 400, D: 300, H: 80, clear: 1.0, alignX: 'center', alignY: 'center', style: 'frame', magStyle: 'press', screws: false, cornerR: 2, nx: 4, ny: 4, rim: 0 };

export const PRESETS = {
  shelf: [
    { id: 'e4', label: 'E4 · tweezers, solder assist, brushes', zone: 'E4', p: { ...shelfBase, nx: 5, at: { x: 732, y: 196 } },
      note: 'Bay 2, 5 units. Floor sits on the zone’s bottom edge so tools stand up into E4.' },
    { id: 's2', label: 'S2 · solder spool, flux, tip bins', zone: 'S2', p: { ...shelfBase, nx: 7, at: { x: 735, y: 377 } },
      note: 'Bay 2 spare band. 7 units (300 mm) is the longest that prints straight on the H2C; S2 takes two side by side.' },
    { id: 's3', label: 'S3 · terminals, ferrules, heat-shrink', zone: 'S3', p: { ...shelfBase, nx: 4, at: { x: 1853, y: 452 } },
      note: 'Bay 3 spare. Takes the S3 boxes.' },
    { id: 'e3', label: 'E3 · SN-58B dies', zone: 'E3', p: { ...shelfBase, nx: 2, ny: 2, at: { x: 1845, y: 330 } },
      note: '2 × 2 for the die holder. Floor on the zone’s bottom edge.' },
    { id: 'h3', label: 'H3 · Wera VDE blades (Board B)', zone: 'H3', p: { ...shelfBase, board: 'B', nx: 7, backH: 49, pinLen: 18, window: 34, at: { x: 80, y: 525 } },
      note: 'Board B. Wide windows so blades drop through the holder and hang below the shelf.' },
    { id: 'h9', label: 'H9 · Wera Micro drivers (Board B)', zone: 'H9', p: { ...shelfBase, board: 'B', nx: 7, backH: 49, pinLen: 18, window: 34, at: { x: 140, y: 715 } },
      note: 'Board B. Blades drop through; caps stay up.' },
  ],
  table: [
    { id: 'quiver', label: 'Quiver plate beside the stations', zone: 'Quiver', p: { ...tableBase, nx: 1, ny: 2, at: { x: 1326, y: 255 } },
      note: '1 × 2 on the quiver spot (x 1330–1370). Takes the quiver holder.' },
    { id: 'low', label: 'Back row, right — under 50 tall', zone: 'Low', p: { ...tableBase, nx: 6, ny: 2, at: { x: 1430, y: 30 } },
      note: 'Plate is 8 mm, so bins up to 5U keep the back row under 50 mm.' },
    { id: 'generic', label: '3 × 2 plate, left assembly edge', zone: 'Left', p: { ...tableBase, nx: 3, ny: 2, at: { x: 40, y: 270 } },
      note: 'Behind the clear assembly area, so the area stays clear.' },
  ],
  holder: [
    { id: 'e4tw', label: 'E4 · Goot tweezers ×6 + SA-10 ×6', p: { ...holderBase, nx: 2, ny: 1, U: 4, tilt: 8, above: 115, groups: [g('slot', 6, 12, 6, 13, { y: 9, depth: 20 }), g('round', 8.5, 8.5, 6, 13, { y: -11, depth: 20 })] },
      note: 'Slots 6 × 12 from the E4 drafts; SA-10 taken as Ø8. Leans 8° toward the board. Measure before printing.' },
    { id: 'e4br', label: 'E4 · brushes ×4 + TL08 pen', p: { ...holderBase, nx: 3, ny: 1, U: 4, tilt: 8, above: 150, groups: [g('slot', 15, 14, 4, 19, { x: -12, depth: 20 }), g('round', 14, 14, 1, 0, { x: 45, depth: 20 })] },
      note: 'Muji brushes ×3 + toothbrush (10–15 wide), TL08 Ø13. Sizes from the E4 drafts.' },
    { id: 'quiver', label: 'Quiver · GS-150, GS-108, GS-158, WSU-30M', p: { ...holderBase, nx: 1, ny: 2, U: 8, above: 190, groups: [g('round', 24, 24, 1, 0, { y: 26, depth: 48 }), g('round', 15, 15, 2, 18, { y: 0, depth: 48 }), g('round', 9, 9, 1, 0, { y: -26, depth: 48 })] },
      note: 'GS-150 Ø23, GS-108/158 Ø14, WSU-30M Ø8. Sits on the quiver table plate.' },
    { id: 'h3', label: 'H3 · Wera VDE blades, 28 holes, through', p: { ...holderBase, nx: 7, ny: 1, U: 3, above: 20, below: 140, groups: [g('round', 8.5, 8.5, 2, 14, { rows: 2, rowPitch: 16, cells: true, through: true })] },
      note: '4 per cell × 7 = 28 for the 24 blades. Blades drop through the holder and the shelf window. Hole Ø is a guess — measure the shaft (+0.5) and check the collar can’t pass.' },
    { id: 'h9', label: 'H9 · Wera Micro drivers, 28 holes, through', p: { ...holderBase, nx: 7, ny: 1, U: 3, above: 60, below: 60, groups: [g('round', 5, 5, 2, 17, { rows: 2, rowPitch: 18, cells: true, through: true })] },
      note: '4 per cell × 7 = 28 for the 25 drivers + fork. Assumes handles ≤ Ø16 — measure.' },
    { id: 'e3', label: 'E3 · SN-58B dies ×8 on edge', p: { ...holderBase, nx: 2, ny: 2, U: 3, above: 15, groups: [g('rect', 38.6, 9.6, 2, 42, { rows: 4, rowPitch: 15, depth: 15 })] },
      note: 'Dies 38 × 30 × 9 stand on edge, 15 mm in, 15 showing.' },
    { id: 'bits', label: '¼″ hex bits ×24', p: { ...holderBase, nx: 2, ny: 1, U: 3, above: 15, groups: [g('hex', 6.7, 6.7, 8, 9.5, { rows: 3, rowPitch: 11, depth: 12 })] },
      note: '6.35 across flats + 0.35.' },
    { id: 'trace', label: 'Shadow tray · traced tool outline', p: { ...holderBase, nx: 4, ny: 2, U: 3, groups: [g('outline', 0, 0, 1, 0, { depth: 12, clear: 1, fingers: 2, fingerD: 20, scale: 1, rot: 0, pts: [[-70, -9], [-40, -12], [30, -6], [72, -14], [80, 0], [72, 14], [30, 6], [-40, 12], [-70, 9]] })] },
      note: 'Load a photo of the tool on white paper in the cut-out list to trace it. The sample outline is a placeholder pliers shape.' },
  ],
  hook: [
    { id: 'peg40', label: 'Peg 40 · pliers by the crotch (E5)', p: { ...hookBase, at: { x: 1000, y: 60 } }, note: 'One per tool. 5° rise and a 6 mm up-tip so nothing slides off.' },
    { id: 'u12', label: 'U-hook 12 · small Hakko cutters head-down', p: { ...hookBase, type: 'u', gap: 12, L: 30, tip: 4, at: { x: 1050, y: 60 } }, note: 'Pivot rests on the two prongs, handles up.' },
    { id: 'u20', label: 'U-hook 20 · strippers and crimpers (E1)', p: { ...hookBase, type: 'u', gap: 20, L: 35, tip: 5, tool: { show: true, kind: 'plier', L: 190, W: 60, T: 16 }, at: { x: 1600, y: 60 } } },
    { id: 'ring22', label: 'Ring Ø22 · screwdrivers, tubes', p: { ...hookBase, type: 'ring', ringD: 22, tool: { show: true, kind: 'rod', L: 180, W: 18, T: 18 }, at: { x: 1100, y: 60 } } },
    { id: 'j30', label: 'J-hook · cables, straps, loops', p: { ...hookBase, type: 'j', L: 30, R: 10, H: 16, tool: { show: true, kind: 'coil', L: 120, W: 120, T: 25 }, at: { x: 150, y: 80 } } },
    { id: 'l20', label: 'L-hook · light things with a hole', p: { ...hookBase, type: 'l', L: 20, H: 10, at: { x: 200, y: 80 } } },
    { id: 'spool', label: 'Spool rod Ø18 · wire spools (W zone)', p: { ...hookBase, type: 'spool', L: 90, rise: 3, spoolD: 18, rows: 3, tool: { show: true, kind: 'spool', L: 30, W: 60, T: 60 }, at: { x: 120, y: 80 } },
      note: 'Fits the 22 mm-bore printed spools. Three stud rows for the load; rod prints lying down, so it is strong along its length.' },
    { id: 'cradle', label: 'Cradle · Sanwa CD800a (M1)', p: { ...hookBase, type: 'cradle', L: 50, H: 18, cradleW: 70, rows: 3, tool: { show: true, kind: 'box', L: 104, W: 46, T: 176 }, at: { x: 1430, y: 330 } },
      note: 'Meter stands on its edge between the arms and the front rail. Far arm prints on snap-off props.' },
    { id: 'hanger', label: 'Wide hanger · cords and cables', p: { ...hookBase, type: 'hanger', L: 40, R: 12, H: 20, width: 30, tool: { show: true, kind: 'coil', L: 160, W: 160, T: 30 }, at: { x: 250, y: 80 } } },
    { id: 'pegB', label: 'Board B · peg 50 · TwinGrip, pliers wrench', p: { ...hookBase, board: 'B', L: 50, at: { x: 580, y: 280 } } },
  ],
  mount: [
    { id: 'sad', label: 'Saddle · pick a tool and the part to hold', p: { ...mountBase }, note: 'Add a tool under For, then pick the part to hold on the tool strip below the view.' },
  ],
  base: [
    { id: 'aS', label: 'Board A · S bases ×4 — hooks, light saddles', p: { board: 'A', dove: 'S', count: 4 } },
    { id: 'aM', label: 'Board A · M bases ×4 — shelves, spool rods, cradles', p: { board: 'A', dove: 'M', count: 4 } },
    { id: 'aL', label: 'Board A · L bases ×2 — heavy and tall parts', p: { board: 'A', dove: 'L', count: 2 } },
    { id: 'bS', label: 'Board B · S bases ×4', p: { board: 'B', dove: 'S', count: 4 } },
    { id: 'bM', label: 'Board B · M bases ×4', p: { board: 'B', dove: 'M', count: 4 } },
  ],
  box: [
    { id: 'b211', label: '2 × 1 × 3U · two compartments', p: { ...boxBase, divX: 2 } },
    { id: 's3', label: 'S3 · 3 × 1 × 4U · terminals, ferrules, heat-shrink', p: { ...boxBase, nx: 3, U: 4, divX: 3, label: 'left' } },
    { id: 'b111', label: '1 × 1 × 3U', p: { ...boxBase, nx: 1, ny: 1 } },
    { id: 'see', label: '2 × 2 × 6U · see-through walls, finger cut-out', p: { ...boxBase, nx: 2, ny: 2, U: 6, pattern: 'all', cutout: true, label: 'off', scoop: false } },
    { id: 'div', label: 'Drawer divider tray · 4 × 2 × 4U, 4 × 2 compartments', p: { ...boxBase, nx: 4, ny: 2, U: 4, divX: 4, divY: 2, label: 'off' } },
    { id: 'lid', label: 'Stackable lid · 2 × 1', p: { ...boxBase, kind: 'lidStack' } },
    { id: 'lidf', label: 'Flat lid · 2 × 1', p: { ...boxBase, kind: 'lidFlat' } },
  ],
  desk: [
    { id: 'stack3', label: 'Desk stack · 3 × 2 — two drawer units and an angled caddy', p: { ...deskBase, kind: 'stack', nx: 3, ny: 2, layers: '60 x2, 40', H: 72, frontH: 50, inserts: 'pens, scissors, rulers', flutes: true, pull: 36, label: true, cols: '2 1', scoop: 8 },
      note: 'Bottom: two 60 mm drawers. Middle: one 40 mm drawer split 2 : 1 — the wide side takes 76 mm post-it pads. Top: a fluted caddy, 50 mm at the front and 72 at the back, with pens and markers, scissors and cutters, and rulers. 134 × 92 × 168 mm.' },
    { id: 'stack5', label: 'Desk stack · 5 × 2 — everything in the caddy', p: { ...deskBase, kind: 'stack', nx: 5, ny: 2, layers: '50 x2', H: 72, frontH: 50, inserts: 'postits, pens, scissors, rulers', flutes: true, pull: 36, label: true, cx: 3, scoop: 8 },
      note: 'Two 50 mm drawers side by side, three compartments each, under a caddy with post-its, pens and markers, scissors and cutters, and rulers. 218 × 92 × 120 mm.' },
    { id: 'drawer40', label: 'Drawer unit · 3 × 2, one 40 mm drawer', p: { ...deskBase, kind: 'drawers', nx: 3, ny: 2, H: 40, n: 1, cols: '2 1', scoop: 8, pull: 36, label: true },
      note: 'Prints on its back. The drawer stops at a ridge inside the front; lift its front a little to take it out.' },
    { id: 'drawer60', label: 'Drawer unit · 3 × 2, two 60 mm drawers', p: { ...deskBase, kind: 'drawers', nx: 3, ny: 2, H: 60, n: 2, scoop: 8, pull: 30, flutes: true },
      note: 'Two bays side by side, fluted to match the caddy.' },
    { id: 'caddy', label: 'Angled caddy · 3 × 2, Gridfinity floor', p: { ...deskBase, kind: 'caddy', nx: 3, ny: 2, H: 72, frontH: 50, flutes: true },
      note: 'Takes any 3 × 2 of bins, holders or desk inserts. Sits on a drawer unit of the same footprint, or on the desk.' },
    { id: 'pentray', label: 'Angled pen tray · 3 troughs', p: { ...deskBase, kind: 'tray', W: 200, D: 90, H: 28, r: 8, cy: 3, frontH: 18, tilt: 5, scoop: 7 },
      note: 'Three troughs front to back, the top stepping down to 18 mm at the front and the floor tilted 5° so pens roll to the scoop.' },
    { id: 'valet', label: 'Catch-all tray · keys, phone, wallet', p: { ...deskBase, kind: 'tray', W: 180, D: 120, H: 30, r: 14, cols: '2 1', scoop: 14, divDrop: 8, notch: 40 },
      note: 'Two bays (2 : 1), the divider 8 mm under the rim, a grab notch in the front.' },
    { id: 'gridtray', label: 'Parts tray on the grid · 3 × 2, 8 bays', p: { ...deskBase, kind: 'tray', base: 'grid', nx: 3, ny: 2, U: 4, cx: 4, cy: 2, scoop: 8, divDrop: 4, wall: 1.2 },
      note: 'Gridfinity feet, so it drops into a shelf, table plate or drawer.' },
    { id: 'bin', label: 'Open-front parts bin · stackable row', p: { ...deskBase, kind: 'bin', W: 80, D: 120, H: 60, r: 4, frontH: 28, slopeTo: 0.5, scoop: 14, label: true, labelW: 50, wall: 1.6, floor: 2 },
      note: 'Front cut down to 28 mm over the first half, scooped floor, a 0.6 mm recess for a label. Line several up.' },
    { id: 'gridbin', label: 'Open-front bin on the grid · 2 × 3 × 8U', p: { ...deskBase, kind: 'bin', base: 'grid', nx: 2, ny: 3, U: 8, frontH: 26, slopeTo: 0.45, scoop: 16, label: true, labelW: 50, floor: 2 },
      note: 'Grid feet, open front over the first 45 % of the depth.' },
    { id: 'pencup', label: 'Pen cup · hex, slanted top, divider', p: { ...deskBase, kind: 'cup', shape: 'hex', dia: 72, H: 100, slant: 14, dividers: 'half', divDrop: 15, wall: 1.6, floor: 2.4 },
      note: 'Across the flats 72 mm, the top dropping 14 mm to the front, a divider 15 mm under the low edge of the rim.' },
    { id: 'gridcup', label: 'Pen cup on the grid · round, 2 × 2', p: { ...deskBase, kind: 'cup', base: 'grid', nx: 2, ny: 2, U: 14, shape: 'round', dia: 78, dividers: 'cross', divDrop: 15, floor: 2 },
      note: 'Round Ø78 on a 2 × 2 foot, cross dividers.' },
    { id: 'sdcards', label: 'SD card slots · 10, on the grid', p: { ...deskBase, kind: 'slots', base: 'grid', nx: 1, ny: 2, U: 4, n: 10, gap: 2.8, pitch: 6.5, depth: 15, lean: 15, rise: 6, wall: 2.4 },
      note: 'Slots 2.8 wide for full-size SD cards (2.1 thick), leaning back 15°, the top stepping down 6 mm to the front so the back cards show.' },
    { id: 'cards', label: 'Business card slots · 4', p: { ...deskBase, kind: 'slots', W: 104, D: 64, H: 30, r: 5, n: 4, gap: 8, pitch: 13, depth: 22, lean: 15, notch: 30, wall: 2.4 },
      note: '89 × 51 cards, about 20 a slot. A finger channel across the middle.' },
    { id: 'dock', label: 'Phone and tablet slots · 3', p: { ...deskBase, kind: 'slots', W: 170, D: 96, H: 40, r: 8, n: 3, gap: 14, pitch: 28, depth: 26, lean: 15, round: true, endWall: 6, wall: 3 },
      note: 'Round-bottomed 14 mm slots (a phone in a case), leaning 15°.' },
    { id: 'sorter', label: 'Letter sorter · 3 slots, stepped', p: { ...deskBase, kind: 'sorter', W: 160, n: 3, gap: 30, frontH: 50, step: 25, lean: 12, notch: 50, div: 2.4, floor: 2.4, wall: 2.4 },
      note: 'Dividers 50 → 125 mm, 12° back, a finger notch in each.' },
    { id: 'phone', label: 'Phone stand · 20°, cable funnel', p: { ...deskBase, kind: 'stand', W: 75, angle: 20, H: 90, slot: 12, lip: 10, thick: 4, cable: 12 },
      note: 'Prints on its side. Slot 12 mm for a phone in a case; the funnel lets the cable through the lip.' },
    { id: 'tablet', label: 'Tablet or book stand · 25°', p: { ...deskBase, kind: 'stand', W: 140, angle: 25, H: 140, slot: 14, lip: 14, thick: 5 },
      note: 'Prints on its side, 140 mm tall on the bed.' },
  ],
  drawer: [
    { id: 'dw', label: 'Fit a drawer · 400 × 300 inside', p: { ...drawerBase } },
    { id: 'd44', label: '4 × 4 frame, no drawer', p: { ...drawerBase, sizing: 'cells', nx: 4, ny: 4 } },
    { id: 'd32m', label: '3 × 2 with magnets', p: { ...drawerBase, sizing: 'cells', nx: 3, ny: 2, style: 'magnets' } },
  ],
  fit: [
    { id: 'all', label: 'Full set · socket, foot, studs, dovetail and pin holes', p: { socket: true, foot: true, ladderA: true, ladderB: true, holesA: true, holesB: true, dove: true, step: 0.05 } },
    { id: 'dove', label: 'Dovetail fit · one S base + five tongue stubs', p: { socket: false, foot: false, ladderA: false, ladderB: false, holesA: false, holesB: false, dove: true, step: 0.05 } },
    { id: 'grid', label: 'Gridfinity fit only · socket + foot', p: { socket: true, foot: true, ladderA: false, ladderB: false, holesA: false, holesB: false, dove: false, step: 0.05 } },
  ],
  pins: [
    { id: 'pa', label: 'Board A · Ø4.7 × 21 ×8', p: { board: 'A', count: 8, length: 21, pinD: 0 } },
    { id: 'pb', label: 'Board B · Ø7.65 × 24 ×8', p: { board: 'B', count: 8, length: 24, pinD: 0 } },
  ],
};

const fmt = (v) => (Math.round(v * 10) / 10).toString();

// ---------- drawer plan ----------
function splitAxis(n, padA, padB, L) {
  for (let t = 1; t <= Math.max(1, n); t++) {
    const base = Math.floor(n / t), rem = n % t;
    const sizes = Array(t).fill(base);
    const order = [...Array(t).keys()].sort((a, b) => Math.abs(a - (t - 1) / 2) - Math.abs(b - (t - 1) / 2));
    for (let k = 0; k < rem; k++) sizes[order[k]]++;
    const lens = sizes.map((c, i) => 42 * c + (i === 0 ? padA : 0) + (i === t - 1 ? padB : 0));
    if (lens.every(l => l <= L) && sizes.every(c => c > 0)) return sizes;
  }
  return null;
}
export function drawerPlan(p, bed) {
  let nx, ny, pad;
  const warn = [];
  if (p.sizing === 'cells') {
    nx = p.nx; ny = p.ny; pad = { L: p.rim, R: p.rim, F: p.rim, B: p.rim };
  } else {
    const w = p.W - p.clear, d = p.D - p.clear;
    nx = Math.floor(w / 42); ny = Math.floor(d / 42);
    const px = w - 42 * nx, py = d - 42 * ny;
    const sx = p.alignX === 'left' ? [0, px] : p.alignX === 'right' ? [px, 0] : [px / 2, px / 2];
    const sy = p.alignY === 'front' ? [0, py] : p.alignY === 'back' ? [py, 0] : [py / 2, py / 2];
    pad = { L: sx[0], R: sx[1], F: sy[0], B: sy[1] };
    if (nx < 1 || ny < 1) warn.push('drawer is smaller than one 42 mm cell');
  }
  nx = Math.max(1, nx); ny = Math.max(1, ny);
  const L = Math.min(bed.x, bed.y) - 5;
  const cx = splitAxis(nx, pad.L, pad.R, L), cy = splitAxis(ny, pad.F, pad.B, L);
  if (!cx || !cy) warn.push('padding is wider than the bed allows — align the grid to one side');
  const xs = cx || [nx], ys = cy || [ny];
  const tiles = [];
  let x0 = -pad.L;
  for (let i = 0; i < xs.length; i++) {
    let y0 = -pad.F;
    const padL = i === 0 ? pad.L : 0, padR = i === xs.length - 1 ? pad.R : 0;
    for (let j = 0; j < ys.length; j++) {
      const padF = j === 0 ? pad.F : 0, padB = j === ys.length - 1 ? pad.B : 0;
      const w = 42 * xs[i] + padL + padR, d = 42 * ys[j] + padF + padB;
      tiles.push({ i, j, nx: xs[i], ny: ys[j], pad: { L: padL, R: padR, F: padF, B: padB },
        outer: { L: i === 0, R: i === xs.length - 1, F: j === 0, B: j === ys.length - 1 }, x0, y0, w, d });
      y0 += d;
    }
    x0 += 42 * xs[i] + padL + padR;
  }
  const T = p.style === 'frame' ? 5 : p.style === 'magnets' ? 8 : 7;
  const totalW = 42 * nx + pad.L + pad.R, totalD = 42 * ny + pad.F + pad.B;
  const uMax = p.sizing === 'drawer' ? Math.floor((p.H - T - 3.8 - 2) / 7) : null;
  return { nx, ny, pad, tiles, T, totalW, totalD, uMax, warn, cols: xs, rows: ys };
}

// ---------- wall placement (pure: no geometry) ----------
// Where a shelf, hook or saddle lands on its board. Dovetail parts snap their base(s) to the lattice; P.at is the
// base's top centre for hooks and saddles, the back plate's top-left for shelves. off = how far the part's back
// sits off the board (the base's thickness). ax, ay: the board point the part's anchor sits on.
export function wallPlacement(mode, P) {
  const board = BOARDS[P.board];
  if (mode === 'shelf') {
    const d = G.shelfDims(P);
    if (P.mount === 'pins') { const pl = placeShelf(board, { W: d.Wt, H: P.backH, floorT: d.Tf, maxGap: P.maxGap }, P.at); return { ...pl, off: 0 }; }
    const lay = G.shelfDove(P, board);
    const pl = placeShelfDove(board, { W: d.Wt, H: P.backH }, lay, P.at);
    if (P.backH < lay.D.L + 1) pl.warnings.push(`back plate is shorter than a size-${lay.D.id} tongue — make it ≥ ${lay.D.L + 1} mm`);
    if (lay.pick.over) pl.warnings.push(`heavy for ${lay.n} size-${lay.D.id} base${lay.n > 1 ? 's' : ''}: ${lay.pick.why}`);
    return { ...pl, lay, pick: lay.pick, D: lay.D, off: lay.D.T };
  }
  if (mode === 'hook' || mode === 'mount') {
    const hd = G.hookDims(P, board);
    if (P.mount === 'studs') { const pl = placeHook(board, P, hd); return { ...pl, ax: pl.studs[0].x, ay: pl.studs[0].y, off: 0 }; }
    const pick = mode === 'hook' ? G.hookPaths(P, board).pick : G.pickDove('mount', P, board);
    const D = G.doveDims(pick.cls, board);
    const b = placeBase(board, D, P.at);
    const warnings = b.warnings.slice();
    if (pick.over) warnings.push(`heavy for a size-${D.id} base: ${pick.why} — pick a bigger size`);
    return { bx: b.cx, by: b.top, ax: b.cx, ay: b.top, studs: b.studs, bases: [b], warnings, pick, D, off: D.T, dove: true };
  }
  return null;
}
// the base(s) behind a dovetail part: one part, shown where they sit (view, in the part's frame + shift) and laid
// out face down for printing. list: [{cls, x, y, z}] base origins (board face, top centre) in the part's model frame.
function baseParts(list, shift, board, D) {
  const views = [], prints = [];
  for (const q of list) {
    const r = G.doveBase(q.cls, board);
    views.push(r.solid.translate([q.x + shift[0], (q.y || 0) + shift[1], (q.z || 0) + shift[2]]));
    prints.push(G.basePrint(r.solid)); r.solid.delete();
  }
  const n = list.length;
  return { key: 'base', name: `dovebase_${D.id}_${board.id}${n > 1 ? `_x${n}` : ''}`, view: G.assemble(views), print: G.row(prints, 8), pos: [0, 0, 0], assembled: true, secondary: true,
    orient: 'face down, studs up — the groove widens as it rises', count: n };
}

// ---------- build ----------
// Returns { parts, placement, warnings, info, board, dims }. part.view = use orientation (centred, z ≥ 0),
// part.print = print orientation, part.pos = [x, y, z] offset for the assembled preview (assembled: view only).

// ---------- desk stack: drawer units + caddy + inserts, assembled ----------
// inserts sit in the caddy's baseplate, one column each (post-its take two), the caddy's full depth
export const INSERTS = {
  pens: { cols: 1, label: 'Pens and markers' }, markers: { cols: 1, label: 'Markers and highlighters' }, scissors: { cols: 1, label: 'Scissors and cutters' },
  rulers: { cols: 1, label: 'Rulers' }, postits: { cols: 2, label: 'Post-its' }, bin: { cols: 1, label: 'Open bin' },
};
const INSERT_ALIAS = { pen: 'pens', pencils: 'pens', pencil: 'pens', highlighters: 'markers', cutters: 'scissors', cutter: 'scissors', knives: 'scissors', knife: 'scissors', ruler: 'rulers', 'post-its': 'postits', 'post-it': 'postits', postit: 'postits', sticky: 'postits', notes: 'postits', bins: 'bin' };
export function parseInserts(s, nx) {
  const out = [], warn = []; let used = 0;
  for (const tok of String(s || '').toLowerCase().split(/[,\s]+/).filter(Boolean)) {
    const k = INSERT_ALIAS[tok] || (INSERTS[tok] ? tok : Object.keys(INSERTS).find((q) => q.startsWith(tok.slice(0, 4)) || tok.startsWith(q.slice(0, 4))));
    if (!k) { warn.push(`no insert called “${tok}” — pens, markers, scissors, rulers, postits or bin`); continue; }
    if (used + INSERTS[k].cols > nx) { warn.push(`${INSERTS[k].label} left out — the caddy is ${nx} wide`); continue; }
    out.push({ kind: k, a: used, cols: INSERTS[k].cols }); used += INSERTS[k].cols;
  }
  while (used < nx) { out.push({ kind: 'bin', a: used, cols: 1, filler: true }); used++; }
  return { list: out, warn };
}
function insertSolid(kind, ny, U) {
  const cellY = (c) => (c - (ny - 1) / 2) * 42, groups = [];
  const holder = (gs) => G.holder({ nx: 1, ny, U, lip: false, tilt: 0, chamfer: 0.8, magnets: 'off', magCorners: false, above: 0, below: 0, groups: gs });
  if (kind === 'pens' || kind === 'markers') {
    for (let c = 0; c < ny; c++) groups.push(kind === 'markers' || (c === 0 && ny > 1) ? g('round', 17, 17, 2, 19.5, { rows: 2, rowPitch: 19.5, y: cellY(c) }) : g('round', 11, 11, 3, 13, { rows: 3, rowPitch: 13, y: cellY(c) }));
    return holder(groups);
  }
  if (kind === 'scissors') {
    for (let c = 0; c < ny; c++) {
      if (c % 2 === 0) groups.push(g('slot', 7, 26, 2, 17, { y: cellY(c) }));
      else groups.push(g('slot', 15, 26, 1, 0, { x: -9, y: cellY(c) }), g('round', 12, 12, 1, 0, { x: 11, y: cellY(c) }));
    }
    return holder(groups);
  }
  if (kind === 'rulers') {
    const D = 42 * ny - 0.5, depth = 7 * U - 10, room = D - 2 * 2.4 - depth * Math.tan((8 * Math.PI) / 180) - 4.2;
    return G.desk({ ...deskBase, kind: 'slots', base: 'grid', nx: 1, ny, U, n: Math.max(1, Math.min(8, Math.floor(room / 10) + 1)), gap: 4.2, pitch: 10, depth, lean: 8, wall: 2.4, endWall: 3 }).solid;
  }
  if (kind === 'postits') return G.desk({ ...deskBase, kind: 'tray', base: 'grid', nx: 2, ny, U: Math.min(U, 4), wall: 1.6, floor: 1.6, notch: 34, notchD: 10 }).solid;
  return G.desk({ ...deskBase, kind: 'tray', base: 'grid', nx: 1, ny, U, scoop: 10, wall: 1.2 }).solid;
}
export function parseLayers(s) {
  const out = [];
  for (const tok of String(s || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = tok.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:[x×]\s*(\d+))?$/i);
    if (m) out.push({ H: +m[1], n: m[2] ? +m[2] : 1 });
  }
  return out;
}
// one drawer unit as parts: the housing (prints on its back) and its drawers (upright), placed for the view
function drawerUnitParts(P, z0, pull, tag) {
  const r = G.drawerUnit(P), parts = [];
  const hv = G.transformed(r.housing, 'center'), hr = r.housing.rotate([-90, 0, 0]), hp = G.transformed(hr, 'center'); hr.delete(); r.housing.delete();
  parts.push({ key: 'housing', name: `${tag}housing_${P.nx}x${P.ny}_${fmt(r.H)}${r.drawers.length > 1 ? `_x${r.drawers.length}` : ''}`, view: hv, print: hp, pos: [0, 0, z0], assembled: true, orient: 'on its back, the openings up' });
  r.drawers.forEach((m, k) => {
    const v = G.transformed(m, 'center'); m.delete();
    parts.push({ key: 'drawer', name: `${tag}drawer_${fmt(r.H)}_${k + 1}`, view: v, print: v, pos: [r.bays[k], -r.D / 2 + r.dd / 2 - pull * r.dd, z0 + r.zb], assembled: true, orient: 'upright' });
  });
  return { parts, r };
}
const binsIn = (inner) => { const a = Math.floor((inner.W + 0.5) / 42), b = Math.floor((inner.D + 0.5) / 42), u = Math.floor(inner.H / 7); return a && b && u >= 2 ? `${a} × ${b} Gridfinity bins up to ${u}U` : 'no full Gridfinity bin'; };
function deskStackBuild(P, parts, warnings, info) {
  const k = P.kind, { W: Wf, D: Df } = G.stackSize(P.nx, P.ny);
  if (k === 'drawers') {
    const { parts: ps, r } = drawerUnitParts(P, 0, 0.35, 'desk_');
    parts.push(...ps); warnings.push(...r.warn);
    info.push(`${r.drawers.length} drawer${r.drawers.length > 1 ? 's' : ''}, inside ${fmt(r.inner.W)} × ${fmt(r.inner.D)} × ${fmt(r.inner.H)} mm — takes ${binsIn(r.inner)}`);
    info.push(`footprint ${fmt(Wf)} × ${fmt(Df)}; stacks on any desk-stack unit with the same footprint`);
    return { W: Wf, D: Df, top: r.H };
  }
  const cad = (z0) => {
    const c = G.caddy(P);
    const v = G.transformed(c.solid, 'center'); c.solid.delete();
    parts.push({ key: 'caddy', name: `desk_caddy_${P.nx}x${P.ny}_${fmt(c.Hf)}-${fmt(c.H)}`, view: v, print: v, pos: [0, 0, z0], assembled: true, orient: 'upright' });
    return c;
  };
  if (k === 'caddy') { const c = cad(0); info.push(`Gridfinity floor, ${P.nx} × ${P.ny}; front ${fmt(c.Hf)} → back ${fmt(c.H)} mm; footprint ${fmt(Wf)} × ${fmt(Df)}`); return { W: Wf, D: Df, top: c.H }; }
  // the whole stack, bottom up
  const layers = parseLayers(P.layers);
  let z = 0;
  layers.forEach((L, i) => {
    const { parts: ps, r } = drawerUnitParts({ ...P, H: L.H, n: L.n, pocket: true }, z, i === layers.length - 1 ? 0.35 : 0, `stack${i + 1}_`);
    parts.push(...ps); warnings.push(...r.warn);
    info.push(`layer ${i + 1}: ${L.n} drawer${L.n > 1 ? 's' : ''} ${fmt(L.H)} tall, inside ${fmt(r.inner.W)} × ${fmt(r.inner.D)} × ${fmt(r.inner.H)} — ${binsIn(r.inner)}`);
    z += r.H - G.STACK.foot;
  });
  let top = z + G.STACK.foot;
  if (P.caddy !== false) {
    const c = cad(z);
    top = z + c.H;
    const U = Math.max(3, Math.floor((c.Hf - c.zBin - 2) / 7)), ins = parseInserts(P.inserts, P.nx);
    warnings.push(...ins.warn);
    for (const it of ins.list) {
      const m = insertSolid(it.kind, P.ny, U), v = G.transformed(m, 'center'); m.delete();
      parts.push({ key: `insert_${it.kind}`, name: `stack_insert_${it.kind}_${it.cols}x${P.ny}`, view: v, print: v, pos: [(it.a + (it.cols - 1) / 2 - (P.nx - 1) / 2) * 42, 0, z + c.zBin], assembled: true, orient: 'feet down' });
    }
    info.push(`caddy ${fmt(c.Hf)} → ${fmt(c.H)} mm with ${ins.list.map((q) => INSERTS[q.kind].label.toLowerCase() + (q.filler ? ' (filler)' : '')).join(', ')} — inserts ${U}U`);
  }
  info.push(`stack ${fmt(Wf)} × ${fmt(Df)} × ${fmt(top)} mm, ${layers.length} drawer unit${layers.length === 1 ? '' : 's'}${P.caddy !== false ? ' and the caddy' : ''}; each layer’s foot sits in the pocket of the one below`);
  return { W: Wf, D: Df, top };
}

export function build(mode, P, S = DEFAULT_SETTINGS) {
  G.setTolerances({ hole: S.tol.hole, stud: S.tol.stud, socket: S.tol.socket, bin: S.tol.bin, dove: S.tol.dove ?? 0.2 });
  const warnings = [], info = [];
  const parts = [];
  let placement = null, board = null, dims = null;
  if (mode === 'shelf') {
    board = BOARDS[P.board];
    dims = G.shelfDims(P);
    placement = wallPlacement('shelf', P);
    warnings.push(...placement.warnings);
    if (P.backH < 42 * P.ny * 0.5) warnings.push('back plate is short for this depth — the top of the back carries more pull; go taller');
    const { solid } = G.shelf({ ...P, pinFit: S.tol.pinFit }, placement.studs, board);
    const bb = solid.boundingBox(), shift = [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]];
    const view = solid.translate(shift); solid.delete();
    const name = `shelf_${P.board}_${P.nx}x${P.ny}_${P.backH}h`;
    if (P.mount === 'pins') {
      parts.push({ key: 'shelf', name, view, print: view, orient: 'floor down, back plate standing — the way it hangs' });
      const n = placement.studs.length, pinL = dims.backT + P.pinLen;
      const pm = G.pins(board, n, pinL, P.pinD);
      const pv = G.transformed(pm, 'center'); pm.delete();
      parts.push({ key: 'pins', name: `pins_${P.board}_${fmt(P.pinD || board.studD)}x${fmt(pinL)}_x${n}`, view: pv, print: pv, orient: 'standing, like the coupons', secondary: true });
      info.push(`${n} pins Ø${fmt(P.pinD || board.studD)} × ${fmt(pinL)} — push through from the front until flush, a drop of glue`);
    } else {
      const lay = placement.lay, D = lay.D;
      parts.push({ key: 'shelf', name, view, print: view, orient: 'floor down, back plate and tongues standing' });
      parts.push(baseParts(lay.xs.map((x) => ({ cls: D.id, x, y: D.T, z: P.backH })), shift, board, D));
      info.push(`${lay.n} size-${D.id} tongue${lay.n > 1 ? `s ${fmt(lay.spacing)} apart` : ''} on the back — push the base${lay.n > 1 ? 's' : ''} into the board, slide the shelf down into ${lay.n > 1 ? 'them' : 'it'}`);
      info.push(`dovetail ${lay.pick.auto ? 'sized for' : 'set to ' + D.id + ' —'} ${lay.pick.why}`);
    }
    dims = { ...dims, shift, off: placement.off };
  } else if (mode === 'table') {
    board = BOARDS.T;
    dims = G.tablePlateDims(P);
    placement = placeTablePlate(board, { W: dims.Wt, D: dims.Dt, rim: dims.rim, nx: P.nx, ny: P.ny, winBottom: dims.winBottom }, P.at, P.maxStuds);
    warnings.push(...placement.warnings);
    const r = G.tablePlate(P, placement.studs, board);
    const view = G.transformed(r.solid, 'center');
    const print = G.transformed(r.solid, 'flipX'); r.solid.delete();
    parts.push({ key: 'plate', name: `tableplate_${P.nx}x${P.ny}`, view, print, orient: 'face down, studs up, 45° funnels' });
  } else if (mode === 'holder') {
    const lay = G.holderLayout(P);
    warnings.push(...lay.warn);
    if ((P.tilt || 0) && P.groups.some(q => q.shape === 'outline')) info.push('tilt applies to round, hex, slot and rect cut-outs only');
    const m = G.holder(P);
    const view = G.transformed(m, 'center'); m.delete();
    parts.push({ key: 'holder', name: `holder_${P.nx}x${P.ny}x${P.U}U`, view, print: view, orient: 'feet down' });
    dims = { holes: lay.holes.length, H: lay.H };
    info.push(`${lay.holes.length} cut-out${lay.holes.length === 1 ? '' : 's'}`);
  } else if (mode === 'hook') {
    board = BOARDS[P.board];
    const hd = G.hookDims(P, board), dove = P.mount !== 'studs';
    placement = wallPlacement('hook', P);
    warnings.push(...placement.warnings);
    const hp = G.hookPaths(P, board);
    const m = G.hook(P, board);
    // use orientation: board face at y = 0. Print: flat hooks on their side (x = 0 on the bed); U, ring, cradle standing
    const bb = m.boundingBox();
    const shift = [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]];
    const view = m.translate(shift);
    let print;
    if (dove && hp.upright) print = G.transformed(m, 'center');
    else { const r90 = m.rotate([0, -90, 0]); print = G.transformed(r90, 'center'); r90.delete(); }
    m.delete();
    const orient = !dove ? 'lying on its side, bar and studs flat on the bed — snap off any props' : hp.upright ? 'standing, prongs flat on the bed' : 'lying on its side, the tongue’s corner on the bed';
    parts.push({ key: 'hook', name: `hook_${P.board}_${P.type}_${P.L}${dove ? '_' + hp.D.id : ''}`, view, print, orient });
    if (dove) {
      parts.push(baseParts([{ cls: hp.D.id, x: hp.xt }], shift, board, hp.D));
      info.push(`dovetail ${hp.pick.auto ? 'sized for' : 'set to ' + hp.D.id + ' —'} ${hp.pick.why}`);
    }
    dims = { ...hd, shift, anchor: dove ? [hp.xt + shift[0], shift[1], shift[2]] : [hd.rs + shift[0], shift[1], shift[2]], dove: dove ? hp.D.id : null, off: placement.off };
  } else if (mode === 'mount') {
    board = BOARDS[P.board];
    const hd = G.hookDims(P, board), dove = P.mount !== 'studs';
    placement = wallPlacement('mount', P);
    warnings.push(...placement.warnings);
    const r = G.saddle(P, board), m = r.solid;
    const bb = m.boundingBox();
    const shift = [-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2]];
    const view = m.translate(shift);
    let print;
    if (dove) print = G.transformed(m, 'center');
    else { const r90 = m.rotate([0, -90, 0]); print = G.transformed(r90, 'center'); r90.delete(); }
    m.delete();
    parts.push({ key: 'saddle', name: `saddle_${P.board}_${Math.round(r.width)}w${dove ? '_' + r.D.id : ''}`, view, print, orient: dove ? 'standing on its foot, pocket open to the top' : 'lying on its side — bar, studs and block flat on the bed' });
    if (dove) {
      parts.push(baseParts([{ cls: r.D.id, x: r.width / 2 }], shift, board, r.D));
      info.push(`dovetail ${r.pick.auto ? 'sized for' : 'set to ' + r.D.id + ' —'} ${r.pick.why}`);
    }
    dims = { ...hd, shift, anchor: dove ? [r.width / 2 + shift[0], shift[1], shift[2]] : [hd.rs + shift[0], shift[1], shift[2]], origin: r.origin.map((v, i) => v + shift[i]), sb: r.sb, width: r.width, dove: dove ? r.D.id : null, off: placement.off };
    if (!P.sec) info.push('placeholder pocket — add a tool under For and pick the part to hold');
  } else if (mode === 'base') {
    board = BOARDS[P.board];
    const D = G.doveDims(P.dove, board), n = Math.max(1, P.count | 0);
    const views = [], prints = [];
    for (let k = 0; k < n; k++) { const r = G.doveBase(P.dove, board); views.push(r.solid.translate([0, 0, D.H])); prints.push(G.basePrint(r.solid)); r.solid.delete(); }
    const view = G.row(views, 10);
    parts.push({ key: 'base', name: `dovebase_${D.id}_${board.id}_x${n}`, view, print: G.row(prints, 8), orient: 'face down, studs up — the groove widens as it rises' });
    dims = D;
    info.push(`size ${D.id}: ${D.W} × ${D.H} × ${D.T} plate, ${D.studs.length} studs Ø${board.studD} × ${board.studLen}; tongue ${D.root} → ${D.outer} wide, ${D.d} deep, ${D.L} long; good for about ${D.rate[board.id === 'B' ? 'B' : 'A']} kg ${G.DOVE_LEVER} mm out`);
    info.push(`${D.notches} notch${D.notches > 1 ? 'es in the top edge mark' : ' in the top edge marks'} the size; print with 4 walls so the studs come out solid`);
  } else if (mode === 'box') {
    const m = G.box(P);
    const view = G.transformed(m, 'center'); m.delete();
    const nm = P.kind === 'lidFlat' ? `lid_flat_${P.nx}x${P.ny}` : P.kind === 'lidStack' ? `lid_stack_${P.nx}x${P.ny}` : `box_${P.nx}x${P.ny}x${P.U}U`;
    parts.push({ key: P.kind === 'bin' ? 'box' : 'lid', name: nm, view, print: view, orient: 'feet down' });
    dims = { H: P.kind === 'bin' ? 7 * P.U : 7 };
  } else if (mode === 'desk' && ['drawers', 'caddy', 'stack'].includes(P.kind)) {
    dims = { ...deskStackBuild(P, parts, warnings, info), grid: false };
    dims.H = dims.top;
  } else if (mode === 'desk') {
    const r = G.desk(P);
    warnings.push(...r.warn);
    const view = G.transformed(r.solid, 'center');
    let print = view;
    if (r.print === 'side') { const rr = r.solid.rotate([0, -90, 0]); print = G.transformed(rr, 'center'); rr.delete(); }
    r.solid.delete();
    const dd = r.d, sz = dd.grid ? `${P.nx}x${P.ny}x${P.U}U` : `${fmt(dd.W)}x${fmt(dd.D)}x${fmt(dd.top)}`;
    const stand = P.kind === 'stand';
    parts.push({ key: stand ? 'stand' : 'desk', name: `desk_${P.kind}_${sz}`, view, print, orient: stand ? 'on its side, the profile flat on the bed' : dd.grid ? 'feet down' : 'flat on the bed' });
    dims = { ...dd, H: dd.top };
    if (P.kind === 'tray' || P.kind === 'bin') info.push(`${dd.cells} compartment${dd.cells > 1 ? 's' : ''}${dd.zFront < dd.top - 0.01 ? `; front ${fmt(dd.zFront)} → back ${fmt(dd.top)} mm` : ''}${dd.tilt > 0.05 ? `; floor tilted ${fmt(dd.tilt)}°` : ''}`);
    if (P.kind === 'slots') info.push(`${dd.n} slot${dd.n > 1 ? 's' : ''} ${fmt(P.gap)} wide, ${fmt(dd.sd)} deep${P.lean ? `, leaning ${P.lean}°` : ''}`);
    if (P.kind === 'sorter') info.push(`${dd.slots} slot${dd.slots > 1 ? 's' : ''}, dividers ${fmt(P.frontH)} → ${fmt(dd.top)} mm`);
    if (!dd.grid && P.pads && !stand) info.push('Ø10 × 1 mm recesses underneath for stick-on rubber bumpers');
  } else if (mode === 'drawer') {
    const plan = drawerPlan(P, S.bed);
    warnings.push(...plan.warn);
    dims = plan;
    plan.tiles.forEach((t, k) => {
      const r = G.drawerTile(t, P.style, P.sizing === 'drawer' ? P.cornerR : 4, { magStyle: P.magStyle, screws: P.screws });
      const view = G.transformed(r.solid, 'center'); r.solid.delete();
      const pos = [t.x0 + t.w / 2 - plan.totalW / 2 + plan.pad.L, t.y0 + t.d / 2 - plan.totalD / 2 + plan.pad.F, 0];
      parts.push({ key: `tile${k + 1}`, name: `drawer_tile_${String.fromCharCode(65 + t.i)}${t.j + 1}_${t.nx}x${t.ny}`, view, print: view, pos, orient: 'flat', tile: t });
    });
    info.push(`${plan.nx} × ${plan.ny} cells in ${plan.tiles.length} tile${plan.tiles.length > 1 ? 's' : ''}; padding left ${fmt(plan.pad.L)} · right ${fmt(plan.pad.R)} · front ${fmt(plan.pad.F)} · back ${fmt(plan.pad.B)} mm`);
    if (plan.uMax != null) info.push(plan.uMax >= 2 ? `bins up to ${plan.uMax}U with lip clear the drawer height` : 'drawer is too shallow for a lipped bin');
  } else if (mode === 'fit') {
    let x = 0;
    const add = (key, name, m, orient) => {
      const view = G.transformed(m, 'center'); m.delete();
      const st = G.stats(view);
      parts.push({ key, name, view, print: view, orient, pos: [x + st.size[0] / 2, 0, 0] });
      x += st.size[0] + 10;
    };
    const steps = [-2, -1, 0, 1, 2].map(k => k * P.step);
    if (P.socket) add('socket', 'fit_socket_1x1', G.socketCoupon(), 'flat');
    if (P.foot) add('foot', 'fit_foot_1x1', G.footCoupon(), 'feet down');
    if (P.ladderA) add('studsA', 'fit_studs_A', G.studLadder(BOARDS.A, steps, 21), 'standing');
    if (P.ladderB) add('studsB', 'fit_studs_B', G.studLadder(BOARDS.B, steps, 24), 'standing');
    const fits = [0, 1, 2, 3, 4].map(k => +(k * P.step).toFixed(3));
    if (P.holesA) add('holesA', 'fit_pinholes_A', G.pinHoleCoupon(BOARDS.A, fits), 'standing on its long edge');
    if (P.holesB) add('holesB', 'fit_pinholes_B', G.pinHoleCoupon(BOARDS.B, fits), 'standing on its long edge');
    if (P.dove) {
      const r = G.doveBase('S', BOARDS.A); add('doveBase', 'fit_dove_base_S_A', G.basePrint(r.solid), 'face down, studs up'); r.solid.delete();
      const c = G.doveCoupon(BOARDS.A, P.step); add('doveStubs', 'fit_dove_stubs', c.stubs, 'standing, tongues up the side');
    }
    const shift = x / 2;
    for (const p of parts) p.pos[0] -= shift;
    info.push(`stud ladder: 1 groove = Ø −${fmt(2 * P.step * 100) / 100} … 3 grooves = nominal … 5 grooves = Ø +${fmt(2 * P.step * 100) / 100}`);
    info.push(`pin holes: 1 notch = fit 0 … 5 notches = fit +${fmt(4 * P.step * 100) / 100} (on top of the ${S.tol.hole} hole allowance)`);
    if (P.dove) info.push(`dovetail stubs: 1 notch = ${fmt(2 * P.step * 100) / 100} tighter … 3 notches = your ${S.tol.dove ?? 0.2} clearance … 5 notches = ${fmt(2 * P.step * 100) / 100} looser. Take the snuggest that slides down on its own weight, and set the dovetail clearance to ${S.tol.dove ?? 0.2} + (notches − 3) × ${P.step}`);
  } else if (mode === 'pins') {
    board = BOARDS[P.board];
    const m = G.pins(board, P.count, P.length, P.pinD);
    const view = G.transformed(m, 'center'); m.delete();
    parts.push({ key: 'pins', name: `pins_${P.board}_${fmt(P.pinD || board.studD)}x${P.length}_x${P.count}`, view, print: view, orient: 'standing' });
  }
  for (const p of parts) {
    p.stats = G.stats(p.print);
    if (S.check !== false) { const mm = G.meshOf(p.print); p.check = printCheck(mm.pos, mm.idx); delete p.check.cls; }
    p.profileId = profileFor(mode, p.key); p.profile = PROFILES[p.profileId];
    p.mass = G.massEstimate(p.stats, p.profile.infill / 100, p.profile.walls * 0.42, S.density ?? 1.08);
    const s = p.stats.size;
    p.bed = G.bedFit(s[0], s[1], S.bed.x, S.bed.y);
    if (s[2] > S.bed.z) p.bed = { ok: false, angle: 0 };
    if (!p.bed.ok) warnings.push(`${p.key} is ${s.map(fmt).join(' × ')} mm — bigger than the bed (${S.bed.x} × ${S.bed.y})`);
    else if (p.bed.angle) info.push(`${p.key} only fits turned ${p.bed.angle}° on the bed`);
  }
  return { parts, placement, warnings, info, board, dims };
}

export function freeParts(res) {
  const seen = new Set();
  for (const p of res.parts) for (const m of [p.view, p.print]) if (m && !seen.has(m)) { seen.add(m); try { m.delete(); } catch (e) { /* freed */ } }
}

// README for an export zip
export function readme(mode, P, res, S, label) {
  const mat = MATERIALS.find(m => m.id === S.material) || MATERIALS[0];
  const pr = PRINTERS.find(p => p.id === S.printer);
  const L = [];
  L.push(`GRIDLAB — ${label || mode}`);
  L.push(`Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  L.push('');
  L.push('PARTS');
  for (const p of res.parts) { L.push(`  ${p.name}.stl  ${p.stats.size.map(fmt).join(' × ')} mm  ≈ ${fmt(p.mass)} g  — print ${p.orient}${p.bed.angle ? `, turned ${p.bed.angle}°` : ''}${p.count > 1 ? ` (${p.count} in the file)` : ''}`); if (p.profile) L.push(`      settings: ${profileText(p.profile)} — ${p.profile.why}`); if (p.check) L.push(`      print check: ${p.check.summary.join('; ')}`); }
  L.push('');
  L.push(`PRINTER  ${pr ? pr.label : 'custom'} — bed ${S.bed.x} × ${S.bed.y} × ${S.bed.z}`);
  L.push(`MATERIAL ${mat.label} — hole +${S.tol.hole}, stud ${S.tol.stud >= 0 ? '+' : ''}${S.tol.stud}, socket +${S.tol.socket}/side, bin −${S.tol.bin}/side, pin fit +${S.tol.pinFit}`);
  for (const n of mat.notes) L.push(`  · ${n}`);
  L.push('  · Every part is laid out to print without supports — each file’s print check is below.');
  L.push('  · Print settings differ by part (Bambu Studio: right-click the object → per-object settings): strength where it carries load, less plastic elsewhere.');
  if (res.placement && res.board) {
    L.push('');
    L.push(`PLACEMENT on ${res.board.name}: left edge x ${fmt(res.placement.bx)}, ${res.board.id === 'T' ? 'back' : 'top'} edge y ${fmt(res.placement.by)}`);
    for (const s of res.placement.studs) L.push(`  stud row ${s.i + 1}, hole ${s.j + 1}  (x ${fmt(s.x)}, y ${fmt(s.y)})${s.ok ? '' : '  ← NO-GO'}`);
  }
  if (res.warnings.length) { L.push(''); L.push('CHECK'); for (const w of res.warnings) L.push(`  ! ${w}`); }
  if (res.info.length) { L.push(''); for (const w of res.info) L.push(`  ${w}`); }
  L.push('');
  L.push('PARAMETERS');
  L.push(JSON.stringify({ mode, ...P }, null, 1));
  return L.join('\n');
}

// ---------- trace studio → holder ----------
export const TRACE_DEFAULT = { paper: 'A4', pw: 210, ph: 297, det: { threshold: 0, shadow: 0.5, smooth: 1, simplify: 0.4, minArea: 150, margin: 4, fillHoles: true, close: 1 },
  tray: { auto: true, nx: 3, ny: 2, autoU: true, U: 3, clear: 1, depth: 15, fingerMode: 'ends', fingerD: 20, fingerLen: 0, gap: 4, margin: 4, lip: true, magnets: 'off' }, tools: [] };
export function traceGroup(t, tray) {
  return { shape: 'outline', a: 0, b: 0, n: 1, pitch: 0, rows: 1, rowPitch: 0, x: t.x || 0, y: t.y || 0, through: false, cells: false, stagger: false,
    pts: t.pts, scale: 1, rot: t.rot || 0, depth: t.depth > 0 ? t.depth : tray.depth, clear: t.clear != null && t.clear !== '' ? t.clear : tray.clear,
    fingerMode: t.fingerMode || tray.fingerMode, fingerD: t.fingerD || tray.fingerD, fingerLen: t.fingerLen || tray.fingerLen, fingerDepth: t.fingerDepth || 0, toolT: t.toolT || 0, name: t.name };
}
export function traceHolder(T) {
  const groups = T.tools.filter((t) => t.include !== false).map((t) => traceGroup(t, T.tray));
  const maxD = groups.reduce((m, g) => Math.max(m, g.depth), 0);
  const U = T.tray.autoU ? Math.max(2, Math.ceil((maxD + 6.5) / 7)) : T.tray.U;
  return { nx: T.tray.nx, ny: T.tray.ny, U, lip: T.tray.lip, tilt: 0, chamfer: 0, magnets: T.tray.magnets, magCorners: false, above: 0, below: 0, on: null, groups };
}
