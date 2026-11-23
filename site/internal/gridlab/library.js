// GRIDLAB — built-in tool library, from the pegboard plan (layout v21, 1 Nov 2026) and the 31 Oct inventory notes.
// Lengths, weights and box sizes are the inventory's; widths (W) and thicknesses (T) marked est are estimates —
// trace the tool or edit it in the Tools tab for an exact fit.
// kind: plier · rod (round: drivers, pens, suckers) · flat (tweezers, brushes, rulers) · box (meters, cases, dies) · spool
// L = overall length, W = width (pliers: handle spread; head = jaw/pivot width), T = thickness, D = round Ø (handle), d = shaft Ø.

const t = (id, name, brand, cat, kind, L, o = {}) => ({ id, name, brand, cat, kind, L, W: 0, T: 0, D: 0, d: 0, head: 0, g: 0, qty: 1, zone: '', est: true, src: 'plan', ...o });

export const BUILTIN_TOOLS = [
  // E4 · tweezers, solder assist, brushes
  t('goot-ts-10', 'Goot TS-10 tweezers', 'Goot', 'Tweezers', 'flat', 120, { W: 10, T: 4, zone: 'E4' }),
  t('goot-ts-11', 'Goot TS-11 tweezers', 'Goot', 'Tweezers', 'flat', 140, { W: 10, T: 4, qty: 2, zone: 'E4' }),
  t('goot-ts-12', 'Goot TS-12 tweezers', 'Goot', 'Tweezers', 'flat', 115, { W: 10, T: 4, qty: 2, zone: 'E4' }),
  t('goot-ts-15', 'Goot TS-15 curved tweezers', 'Goot', 'Tweezers', 'flat', 120, { W: 10, T: 5, zone: 'E4' }),
  t('rhino-sw-11', 'Rhino SW-11 tweezers', 'Rhino', 'Tweezers', 'flat', 120, { W: 10, T: 4, zone: 'drawer' }),
  t('goot-sa-10-chip', 'Goot SA-10 · chip holders', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('goot-sa-10-fork', 'Goot SA-10 · remover / fork', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('goot-sa-10-knife', 'Goot SA-10 · scraper / knife', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('goot-sa-10-needle', 'Goot SA-10 · needle / hook', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('goot-sa-10-reamer', 'Goot SA-10 · reamers', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('goot-sa-10-brush', 'Goot SA-10 · brushes', 'Goot', 'Soldering aids', 'rod', 180, { D: 8, zone: 'E4' }),
  t('muji-spot-brush', 'Muji spot brush', 'Muji', 'Cleaning', 'rod', 180, { D: 10, qty: 2, zone: 'E4', est: false }),
  t('muji-scraper', 'Muji scraper', 'Muji', 'Cleaning', 'flat', 180, { W: 15, T: 5, zone: 'E4' }),
  t('toothbrush', 'Toothbrush', '', 'Cleaning', 'flat', 160, { W: 12, T: 15, zone: 'E4' }),
  t('iwiss-tl08', 'IWISS TL08 pin extractor', 'IWISS', 'Crimpers', 'rod', 103, { D: 13, zone: 'E4' }),
  // E5 · micro cutters, pliers, strippers
  t('hakko-chp-170', 'Hakko CHP-170 micro cutter', 'Hakko', 'Cutters & shears', 'plier', 127, { W: 45, T: 9, head: 15, g: 60, qty: 3, zone: 'E5' }),
  t('hakko-106-03', 'Hakko 106-03 cutter', 'Hakko', 'Cutters & shears', 'plier', 130, { W: 45, T: 9, head: 16, zone: 'E5' }),
  t('knipex-78-61-125', 'Knipex Super Knips 78 61 125 ESD', 'Knipex', 'Cutters & shears', 'plier', 125, { W: 50, T: 9, head: 17, g: 57, zone: 'E5' }),
  t('knipex-35-12-115', 'Knipex 35 12 115 ESD flat-nose', 'Knipex', 'Pliers', 'plier', 115, { W: 50, T: 9, head: 17, zone: 'E5' }),
  t('hakko-pn-2005', 'Hakko PN-2005 long-nose', 'Hakko', 'Pliers', 'plier', 150, { W: 50, T: 10, head: 19, zone: 'E5' }),
  t('hakko-106-08', 'Hakko 106-08 bent-nose', 'Hakko', 'Pliers', 'plier', 146, { W: 50, T: 10, head: 19, zone: 'E5' }),
  t('engineer-ss-08', 'Engineer SS-08 IC extractor', 'Engineer', 'Pliers', 'plier', 125, { W: 30, T: 8, head: 12, zone: 'E5' }),
  t('hakko-csp-30-1', 'Hakko CSP-30-1 stripper', 'Hakko', 'Strippers', 'plier', 165, { W: 55, T: 11, head: 26, zone: 'E5' }),
  t('hakko-csp-30-2', 'Hakko CSP-30-2 stripper', 'Hakko', 'Strippers', 'plier', 165, { W: 55, T: 11, head: 26, zone: 'E5' }),
  t('hakko-106-12', 'Hakko 106-12', 'Hakko', 'Cutters & shears', 'plier', 150, { W: 52, T: 11, head: 24, zone: 'E5' }),
  t('knipex-16-60-06', 'Knipex 16 60 06 coax stripper', 'Knipex', 'Strippers', 'plier', 125, { W: 40, T: 11, head: 20, zone: 'E5' }),
  t('knipex-ergostrip', 'Knipex ErgoStrip', 'Knipex', 'Strippers', 'plier', 130, { W: 35, T: 14, head: 18, zone: 'E5' }),
  // table quiver
  t('goot-gs-150', 'Goot GS-150 solder sucker', 'Goot', 'Desoldering', 'rod', 240, { D: 23, zone: 'Quiver', est: false }),
  t('goot-gs-108', 'Goot GS-108 solder sucker', 'Goot', 'Desoldering', 'rod', 190, { D: 14, zone: 'Quiver', est: false }),
  t('goot-gs-158', 'Goot GS-158 solder sucker', 'Goot', 'Desoldering', 'rod', 190, { D: 14, zone: 'Quiver', est: false }),
  t('ok-wsu-30m', 'OK Industries WSU-30M wire-wrap tool', 'OK Industries', 'Wire wrap', 'rod', 112, { D: 8, zone: 'Quiver', est: false }),
  // E2 · auto strippers
  t('engineer-paw-41', 'Engineer PAW-41 auto stripper', 'Engineer', 'Strippers', 'plier', 195, { W: 75, T: 25, head: 30, zone: 'E2' }),
  t('knipex-precistrip16', 'Knipex PreciStrip16', 'Knipex', 'Strippers', 'plier', 195, { W: 70, T: 25, head: 30, zone: 'E2' }),
  t('knipex-nexstrip', 'Knipex NexStrip', 'Knipex', 'Strippers', 'plier', 190, { W: 55, T: 22, head: 26, zone: 'E2' }),
  // E1 · crimpers, cutters & shears
  t('engineer-pa-09', 'Engineer PA-09 crimper', 'Engineer', 'Crimpers', 'plier', 175, { W: 55, T: 14, head: 22, zone: 'E1' }),
  t('engineer-pa-20', 'Engineer PA-20 crimper', 'Engineer', 'Crimpers', 'plier', 175, { W: 55, T: 14, head: 22, zone: 'E1' }),
  t('engineer-pa-21', 'Engineer PA-21 crimper', 'Engineer', 'Crimpers', 'plier', 175, { W: 55, T: 14, head: 22, zone: 'E1' }),
  t('engineer-pa-24', 'Engineer PA-24 crimper', 'Engineer', 'Crimpers', 'plier', 160, { W: 52, T: 14, head: 22, qty: 2, zone: 'E1' }),
  t('knipex-97-53-14', 'Knipex 97 53 14 ferrule crimper', 'Knipex', 'Crimpers', 'plier', 180, { W: 60, T: 20, head: 35, g: 445, zone: 'E1' }),
  t('knipex-97-52-36', 'Knipex PreciForce 97 52 36', 'Knipex', 'Crimpers', 'plier', 220, { W: 65, T: 20, head: 38, g: 490, zone: 'E1' }),
  t('knipex-97-52-05', 'Knipex 97 52 05 crimper', 'Knipex', 'Crimpers', 'plier', 250, { W: 70, T: 20, head: 40, g: 565, zone: 'E1' }),
  t('iwiss-sn-2549', 'IWISS SN-2549 ratchet crimper', 'IWISS', 'Crimpers', 'plier', 200, { W: 65, T: 18, head: 35, zone: 'E1' }),
  t('knipex-97-51-10', 'Knipex 97 51 10 RJ45 crimper', 'Knipex', 'Crimpers', 'plier', 190, { W: 60, T: 18, head: 40, g: 340, zone: 'E1' }),
  t('iwiss-sn-58b', 'IWISS SN-58B crimper frame', 'IWISS', 'Crimpers', 'plier', 190, { W: 65, T: 18, head: 38, g: 380, zone: 'E1' }),
  t('knipex-95-11-165', 'Knipex 95 11 165 cable shears', 'Knipex', 'Cutters & shears', 'plier', 165, { W: 55, T: 14, head: 25, zone: 'E1' }),
  t('knipex-70-01-160', 'Knipex 70 01 160 diagonal cutter', 'Knipex', 'Cutters & shears', 'plier', 160, { W: 55, T: 13, head: 24, zone: 'E1' }),
  t('knipex-74-01-180', 'Knipex 74 01 180 high-leverage diagonal', 'Knipex', 'Cutters & shears', 'plier', 180, { W: 58, T: 14, head: 26, zone: 'E1' }),
  t('iwiss-sn-58b-dies', 'IWISS SN-58B dies', 'IWISS', 'Crimpers', 'box', 38, { W: 30, T: 9, qty: 8, zone: 'E3', est: false }),
  // measuring
  t('sanwa-cd800a', 'Sanwa CD800a multimeter', 'Sanwa', 'Testing & measuring', 'box', 176, { W: 104, T: 46, g: 340, zone: 'M1', est: false }),
  t('sanwa-pm7a', 'Sanwa PM7a pocket meter', 'Sanwa', 'Testing & measuring', 'box', 108, { W: 56, T: 11, zone: 'M3' }),
  t('sanwa-test-leads', 'Sanwa test-lead adaptors (CL-15a, TL-9IC, TL-A7M2)', 'Sanwa', 'Testing & measuring', 'rod', 120, { D: 10, qty: 3, zone: 'M4' }),
  t('adafruit-pcb-ruler', 'Adafruit PCB ruler', 'Adafruit', 'Testing & measuring', 'flat', 154, { W: 25, T: 1.6, zone: 'M5' }),
  t('wera-247', 'Wera 247 phase tester', 'Wera', 'Testing & measuring', 'rod', 140, { D: 12, d: 3.5, zone: 'M5' }),
  t('lem-m1', 'LEM M1 UV torch', 'LEM', 'Testing & measuring', 'rod', 115, { D: 20, zone: 'M6' }),
  t('igaging-caliper', 'iGaging OriginCal caliper', 'iGaging', 'Testing & measuring', 'flat', 235, { W: 80, T: 16, zone: 'H8' }),
  // Board B · Wera and hardware
  t('wera-micro-roll', 'Wera Kraftform Micro roll bag', 'Wera', 'Screwdrivers & bits', 'box', 235, { W: 110, T: 80, g: 571, zone: 'R', est: false }),
  t('wera-vde-roll', 'Wera VDE roll pouch', 'Wera', 'Screwdrivers & bits', 'box', 200, { W: 110, T: 85, g: 855, zone: 'R', est: false }),
  t('wera-950-hex', 'Wera 950 SPKL/9 SM N hex keys (holder)', 'Wera', 'Hex keys', 'box', 241, { W: 95, T: 30, zone: 'H1', est: false }),
  t('wiha-36990', 'Wiha 36990 metric hex keys ×9 (pack)', 'Wiha', 'Hex keys', 'box', 221, { W: 100, T: 25, zone: 'H1' }),
  t('wiha-36991', 'Wiha 36991 inch hex keys ×13 (pack)', 'Wiha', 'Hex keys', 'box', 224, { W: 130, T: 25, zone: 'H1' }),
  t('knipex-twingrip', 'Knipex TwinGrip 82 01 200', 'Knipex', 'Pliers', 'plier', 200, { W: 60, T: 18, head: 40, zone: 'H2' }),
  t('kamaki-p901s', 'Kamaki P901S pruning shear', 'Kamaki', 'Cutters & shears', 'plier', 190, { W: 60, T: 18, head: 35, zone: 'H2' }),
  t('wera-vde-blade', 'Wera VDE blades (PH, PZ, TX, hex, slotted)', 'Wera', 'Screwdrivers & bits', 'rod', 157, { D: 8, qty: 24, zone: 'H3' }),
  t('wera-vde-handle', 'Wera Kraftform VDE handle', 'Wera', 'Screwdrivers & bits', 'rod', 110, { D: 35, qty: 2, zone: 'H3' }),
  t('wera-zyklop-8000a', 'Wera Zyklop Speed 8000 A ratchet', 'Wera', 'Ratchets & sockets', 'flat', 152, { W: 30, T: 25, zone: 'H4' }),
  t('wera-kompakt-20', 'Wera Kraftform Kompakt 20 RA-R', 'Wera', 'Screwdrivers & bits', 'rod', 155, { D: 32, d: 9, zone: 'H4' }),
  t('knipex-86-03-150', 'Knipex Pliers Wrench 86 03 150', 'Knipex', 'Pliers', 'plier', 150, { W: 45, T: 14, head: 35, zone: 'H6' }),
  t('olfa-sac-1', 'OLFA SAC-1 knife', 'OLFA', 'Cutters & shears', 'flat', 140, { W: 18, T: 12, zone: 'H6' }),
  t('wera-micro-40', 'Wera Kraftform Micro driver · 40 mm blade', 'Wera', 'Screwdrivers & bits', 'rod', 130, { D: 13, d: 3.5, qty: 13, zone: 'H9' }),
  t('wera-micro-60', 'Wera Kraftform Micro driver · 60 mm blade', 'Wera', 'Screwdrivers & bits', 'rod', 150, { D: 13, d: 3.5, qty: 9, zone: 'H9' }),
  t('wera-micro-80', 'Wera Kraftform Micro driver · 80 mm blade', 'Wera', 'Screwdrivers & bits', 'rod', 170, { D: 13, d: 3.5, qty: 2, zone: 'H9' }),
  t('wera-lifting-fork', 'Wera lifting fork', 'Wera', 'Screwdrivers & bits', 'rod', 130, { D: 13, d: 4, zone: 'H9' }),
  t('wera-tool-check-plus', 'Wera Tool-Check PLUS 1 (case)', 'Wera', 'Ratchets & sockets', 'box', 190, { W: 100, T: 35, g: 498, zone: 'H5', est: false }),
  t('wera-bit-check-7', 'Wera Bit-Check 7 Hex-Plus 1', 'Wera', 'Screwdrivers & bits', 'box', 90, { W: 25, T: 25, zone: 'H7' }),
  t('hoto-s-a01', 'HOTO SnapBloq S-A01 driver + 56 bits', 'HOTO', 'Power tools', 'box', 200, { W: 120, T: 45, zone: 'table' }),
  t('hoto-d-a03', 'HOTO SnapBloq D-A03 mini drill', 'HOTO', 'Power tools', 'box', 200, { W: 120, T: 55, zone: 'table' }),
  t('hoto-r-a04', 'HOTO SnapBloq R-A04 rotary tool', 'HOTO', 'Power tools', 'box', 200, { W: 120, T: 55, zone: 'table' }),
  t('hoto-i-a06', 'HOTO SnapBloq I-A06 cordless iron', 'HOTO', 'Soldering', 'box', 200, { W: 120, T: 55, zone: 'table' }),
  // wire
  t('wire-spool-22', 'Printed wire spool, 22 mm bore', 'Organised Mess', 'Wire', 'spool', 30, { W: 60, D: 22, zone: 'W', est: true }),
];

export const KINDS = [['plier', 'Pliers / cutters / crimpers'], ['rod', 'Round: drivers, pens, suckers'], ['flat', 'Flat: tweezers, brushes, rulers'], ['box', 'Box: meters, cases, dies'], ['spool', 'Spool'], ['bench', 'Bench item — no holder']];

const BENCH_CATS = /soldering$|fume|workholding|3d print|laser|workstation|power tool/i;
export function guessKind(cat = '', name = '') {
  const c = cat.toLowerCase(), n = name.toLowerCase();
  if (/plier|cutter|shear|crimp|strip/.test(c)) return /extractor|tl08|pen/.test(n) ? 'rod' : 'plier';
  if (/tweezer|clean|hex key|ratchet/.test(c)) return /brush/.test(n) && !/tooth/.test(n) ? 'rod' : 'flat';
  if (/screwdriver|bit|desolder|wire wrap|soldering aid/.test(c)) return /set|case|check|roll|bag|pouch/.test(n) ? 'box' : 'rod';
  if (/testing|measur/.test(c)) return /pen|tester|torch|probe|lead/.test(n) ? 'rod' : /ruler|caliper/.test(n) ? 'flat' : 'box';
  if (/spool|wire$/.test(c)) return 'spool';
  if (BENCH_CATS.test(c)) return 'bench';
  return 'flat';
}
// "127 × 15 × 9 mm", "Ø23 × 240", "180 mm", "176x104x46mm · 340 g"
export function parseSize(s) {
  if (!s) return {};
  const str = String(s).replace(/,/g, '.');
  const out = {};
  const dm = str.match(/[Øø⌀]\s*(\d+(?:\.\d+)?)/); if (dm) out.D = +dm[1];
  const nums = (str.replace(/[Øø⌀]\s*\d+(?:\.\d+)?/, '').match(/\d+(?:\.\d+)?(?=\s*(?:mm|×|x|\*|\s|$))/gi) || []).map(Number).filter((v) => v > 0 && v < 3000);
  const inch = /\bin\b|″|"/.test(str) && !/mm/.test(str);
  const v = nums.map((n) => (inch ? n * 25.4 : n)).sort((a, b) => b - a);
  if (v[0]) out.L = v[0]; if (v[1]) out.W = v[1]; if (v[2]) out.T = v[2];
  if (out.D && !out.W) { out.W = out.D; out.T = out.D; }
  return out;
}
export function parseWeight(s) {
  if (s == null) return 0;
  if (typeof s === 'number') return s;
  const m = String(s).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
  return m ? (+m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1) : 0;
}
// ---------- inventory import (organisedmess.studio/internal/tools/data/tools.json + kits.json) ----------
export const normText = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
// model-like tokens: "CHP-170", "78 61 125", "TS-10", "PA-09" → "chp170", "7861125", "ts10", "pa09"
export function modelKeys(name) {
  const out = new Set();
  const raw = String(name || '');
  for (const m of raw.matchAll(/[A-Za-z]{0,6}[- ]?\d[\dA-Za-z]*(?:[- ]\d[\dA-Za-z]*)*/g)) {
    const k = normText(m[0]); if (k.length >= 4 && /\d/.test(k)) out.add(k);
    const n = k.replace(/^[a-z]+/, ''); if (n.length >= 5 && n !== k) out.add(n);
  }
  return [...out];
}
const IMG_KEYS = ['photo', 'img', 'image', 'picture'];
// one record per piece or per line item → one tool per line item, with qty
export function importInventory(records, kits = [], { imgBase = '' } = {}) {
  const byKey = new Map();
  const kitName = new Map((kits || []).map((k) => [k.id, k.title || k.name]));
  const list = Array.isArray(records) ? records : Array.isArray(records && records.tools) ? records.tools : [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const name = r.title || r.name || r.label; if (!name) continue;
    const setId = r.kit || r.set || (typeof r.of === 'string' ? r.of : '');
    const base = String(r.id || name).replace(/-\d+$/, '');
    const key = r.of != null || /-\d+$/.test(String(r.id || '')) ? base + '|' + normText(name) : String(r.id || name);
    if (byKey.has(key)) { byKey.get(key).qty += 1; continue; }
    const size = parseSize(r.size || r.dims || r.dimensions || '');
    const cat = r.cat || r.category || r.section || r.group || '';
    const kind = guessKind(cat, `${name} ${r.name || ''}`);
    const pk = r.key || r.pkey || IMG_KEYS.map((k) => r[k]).find(Boolean) || '';
    byKey.set(key, {
      id: 'inv-' + base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: String(name), sub: r.title && r.name && r.name !== r.title ? r.name : '', brand: r.brand || '', model: r.model || '', cat, kind,
      L: size.L || 0, W: size.W || 0, T: size.T || 0, D: size.D || (kind === 'rod' ? size.W || 0 : 0), d: 0, head: 0,
      g: parseWeight(r.weight || r.mass || r.g), qty: r.qty > 1 && r.of == null ? +r.qty : 1, zone: r.zone || r.location || r.loc || '', set: setId ? kitName.get(setId) || setId : '',
      photo: pk ? (/^(https?:|\/|\.)/.test(pk) ? pk : `${imgBase}${pk}${/\.\w{3,4}$/.test(pk) ? '' : '.webp'}`) : '', sizeText: r.size || '', uses: r.uses || '', est: false, src: 'inventory',
    });
  }
  for (const k of kits || []) {
    if (!k || !(k.title || k.name)) continue;
    const size = parseSize(k.size || '');
    if (!size.L) continue;
    const id = 'kit-' + String(k.id || k.title || k.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const pk = k.key || '';
    byKey.set(id, { id, name: k.title || k.name, sub: 'set', brand: k.brand || '', model: '', cat: k.cat || k.category || 'Sets', kind: 'box', L: size.L, W: size.W || 0, T: size.T || 0, D: 0, d: 0, head: 0,
      g: parseWeight(k.weight), qty: 1, zone: k.zone || '', set: '', isSet: true, photo: pk ? `${imgBase}${pk}.webp` : '', sizeText: k.size || '', uses: k.uses || '', est: false, src: 'inventory' });
  }
  return [...byKey.values()];
}
// inventory first; the plan's widths, thicknesses, shafts and zones fill what the inventory doesn't say.
// Plan tools with no match stay in the list so saved parts that point at them still resolve.
export function mergeLibrary(inv, builtin = BUILTIN_TOOLS) {
  if (!inv || !inv.length) return { tools: builtin.map((x) => ({ ...x })), alias: {} };
  const tools = inv.map((x) => ({ ...x })), alias = {};
  const hay = tools.map((x) => normText(`${x.brand} ${x.model} ${x.name} ${x.sub}`));
  for (const b of builtin) {
    const keys = modelKeys(b.name).sort((a, c) => c.length - a.length);
    let hit = -1;
    for (const k of keys) { hit = hay.findIndex((h) => h.includes(k)); if (hit >= 0) break; }
    if (hit < 0) { const n = normText(b.name); hit = hay.findIndex((h) => h === n); }
    if (hit < 0) { tools.push({ ...b }); continue; }
    const t = tools[hit];
    alias[b.id] = t.id;
    for (const k of ['W', 'T', 'D', 'd', 'head']) if (!t[k] && b[k]) { t[k] = b[k]; t.estFields = [...(t.estFields || []), k]; }
    if (!t.L) t.L = b.L;
    if (!t.zone && b.zone) t.zone = b.zone;
    if (t.kind === 'flat' && b.kind !== 'flat') t.kind = b.kind;
    if (b.kind && b.kind !== t.kind && !(t.kind === 'bench')) t.kind = b.kind;
    if (!t.g && b.g) t.g = b.g;
  }
  return { tools, alias };
}
