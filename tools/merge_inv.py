"""Merge an updated hand-tools markdown export into tools.json / kits.json.

Usage: python3 tools/merge_inv.py export.md site/internal/tools/data/tools.json site/internal/tools/data/kits.json photos.txt
  photos.txt = one photo key per line (ls site/internal/tools/img | sed s/.webp//); new records get a key only if a photo exists.

Keeps records the markdown doesn't mention (Laser cutting, Workstation …),
preserves ids/keys/titles for matched records, adds new ones, updates sizes,
details, uses, tags, urls and quantities, and re-expands quantities into
one row per piece.
"""
import json, re, sys, collections

md_path, tools_path, kits_path, photo_list = sys.argv[1:5]
md = open(md_path, encoding='utf-8').read().split('\n')
tools = json.load(open(tools_path, encoding='utf-8'))
kits = json.load(open(kits_path, encoding='utf-8'))
photos = set(l.strip() for l in open(photo_list) if l.strip())

def slug(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')

# ---- collapse the existing per-piece rows back to records -----------------
base = collections.OrderedDict()
for t in tools:
    bid = re.sub(r'-\d+$', '', t['id']) if t.get('of') else t['id']
    if bid not in base:
        r = dict(t); r.pop('nth', None); r.pop('of', None); r['qty'] = 0; r['id'] = bid
        base[bid] = r
    base[bid]['qty'] += t.get('qty', 1)
print('existing records', len(base), 'kits', len(kits))

# ---- parse the markdown ------------------------------------------------------
BRANDS = ['Bambu Lab', 'OK Industries', "Pro'sKit", 'Engineer', 'Knipex', 'Hakko', 'Kamaki', 'OLFA', 'Goot', 'Rhino', 'DEKO', 'Miniware',
          'Weller', 'IWISS', 'Wera', 'Wiha', 'HOTO', 'Sanwa', 'LEM', 'iGaging', 'Adafruit', 'Muji', 'Noctua', 'ASUS']
cat = None
recs = []      # loose: dict ; sets: dict with subs
i = 0
top_re = re.compile(r'^- \*\*(.+?)\*\* — (.+?) ×(\d+)\s*$')
sub_re = re.compile(r'^  - (.+) \(([^()]*)\) ×(\d+)(?: — (.*))?\s*$')
link_re = re.compile(r'\[(Official page|Product page)\]\((\S+?)\)')
while i < len(md):
    line = md[i].rstrip()
    if line.startswith('## '):
        cat = line[3:].strip(); i += 1; continue
    m = top_re.match(line)
    if m:
        title, name, qty = m.group(1), m.group(2), int(m.group(3))
        rec = {'cat': cat, 'mdtitle': title, 'name': name, 'qty': qty, 'is_set': name == 'set', 'size': '', 'detail': '', 'uses': '', 'url': '', 'official': None, 'tags': [], 'subs': []}
        i += 1
        extra = []
        while i < len(md) and md[i].startswith('  ') and not top_re.match(md[i]):
            l = md[i].rstrip()
            sm = sub_re.match(l)
            if sm:
                rec['subs'].append({'name': sm.group(1), 'model': sm.group(2), 'qty': int(sm.group(3)), 'size': (sm.group(4) or '').strip().rstrip('—').strip()})
            elif l.strip().startswith('Size:'):
                rec['size'] = l.strip()[5:].strip()
            elif l.strip().startswith('Tags:'):
                rec['tags'] = [x.strip() for x in l.strip()[5:].split(',') if x.strip()]
            elif link_re.search(l):
                lm = link_re.search(l)
                rec['uses'] = link_re.sub('', l).strip()
                rec['url'] = lm.group(2); rec['official'] = lm.group(1) == 'Official page'
            elif l.strip():
                extra.append(l.strip())
            i += 1
        # extra lines: the one before Tags without a link is either detail (bullets with ·) or uses (prose)
        if extra:
            if not rec['uses'] and len(extra) >= 1 and ' · ' not in extra[-1]:
                rec['uses'] = extra.pop()
            rec['detail'] = ' · '.join(extra)
        recs.append(rec)
        continue
    i += 1
print('markdown records', len(recs), 'sets', sum(r['is_set'] for r in recs), 'subs', sum(len(r['subs']) for r in recs))

def split_brand(title):
    for b in sorted(BRANDS, key=len, reverse=True):
        if title.lower().startswith(b.lower() + ' '):
            return b, title[len(b):].strip()
    if title.startswith('— '): return '—', title[2:].strip()
    return '', title

# ---- merge -----------------------------------------------------------------
# match loose records by brand+model (md title == brand + ' ' + model)
by_bm = {}
by_bm_name = {}
for bid, r in base.items():
    if not r['kit']:
        bm0 = (r['brand'] + ' ' + r['model']).strip()
        by_bm.setdefault(bm0, bid)
        by_bm_name[(bm0, r['name'])] = bid
kit_subs_old = collections.defaultdict(list)
for bid, r in base.items():
    if r['kit']: kit_subs_old[r['kit']].append(r)

new_records = collections.OrderedDict()
seen_kits = set()
added, updated = [], []

def photo_key(*cands):
    for c in cands:
        if c and c in photos: return c
    return None

for rec in recs:
    if rec['is_set']:
        kname = rec['mdtitle']; seen_kits.add(kname)
        kit = kits.get(kname)
        if not kit:
            key = photo_key({'Wera Kraftform Kompakt 20 RA-R ratchet bit driver, 6 pc (05051513001)': 'wera-kk20rar',
                             'Wera Bit-Check 7 Hex-Plus 1, 7 pc (05056168001)': 'wera-bitcheck7hex',
                             'Wera Kraftform Kompakt VDE Big Pack 1, 26 pc (05006617001)': 'wera-vde-bigpack1'}.get(kname), slug(kname))
            kit = {'key': key or slug(kname)[:40], 'id': key or slug(kname)[:40], 'title': re.sub(r'\s*\(\d{6,}\)\s*$', '', kname)}
            kits[kname] = kit; added.append('SET ' + kname)
        kit['url'] = rec['url'] or kit.get('url'); kit['official'] = rec['official'] if rec['official'] is not None else kit.get('official', True)
        kit['uses'] = rec['uses'] or kit.get('uses', ''); kit['tags'] = rec['tags'] or kit.get('tags', []); kit['size'] = rec['size'] or kit.get('size', '')
        if rec['detail']: kit['detail'] = rec['detail']
        brand, _ = split_brand(kname)
        olds = {(o['name'], o['model']): o for o in kit_subs_old.get(kname, [])}
        for s in rec['subs']:
            o = olds.pop((s['name'], s['model']), None)
            if o is None:
                # try by name only (model spelling may have shifted)
                for k2 in list(olds):
                    if k2[0] == s['name']: o = olds.pop(k2); break
            if o is None:
                pkey = photo_key(
                    {'817 VDE': 'wera-817vde', '895/4/1 K': 'wera-895', '62 iS': 'wera-vde-62', '65 iS': 'wera-vde-65', '62 iS PH/S': 'wera-vde-62s',
                     '65 iS PZ/S': 'wera-vde-65s', '67 i': 'wera-vde-67', '67 iS': 'wera-vde-67', '64 i': 'wera-vde-64', '60 i': 'wera-vde-60', '60 iS': 'wera-vde-60',
                     '818/4/1 RA-R': 'wera-kk20rar', '851/1 BTZ': 'wera-851', '855/1 BTZ': 'wera-855', '867/1 BTZ': 'wera-867', '800/1 BTZ': 'wera-800', '840/1 Z': 'wera-840Z'}.get(s['model']))
                o = {'cat': rec['cat'], 'brand': brand or (kit_subs_old.get(kname) or [{'brand': ''}])[0]['brand'], 'model': s['model'], 'name': s['name'], 'qty': 0, 'kit': kname,
                     'status': 'Owned', 'note': '', 'pkey': pkey, 'size': s['size'], 'id': kit['key'] + '--' + slug(s['name'])[:60]}
                if not pkey: o.pop('pkey')
                added.append('  ' + kname[:30] + ' / ' + s['name'])
            else:
                if o.get('size') != s['size'] and s['size']: updated.append(s['name'] + ': size');
                o['size'] = s['size'] or o.get('size', '')
                o['cat'] = rec['cat']
            o['qty'] = s['qty']; o['model'] = s['model']
            new_records[o['id']] = o
        for k2, o in olds.items(): print('  removed from', kname[:30], ':', k2[0])
    else:
        bm = rec['mdtitle']
        bid = by_bm_name.get((bm, rec['name'])) or by_bm.get(bm)
        if bid is None:
            # fuzzy: same brand and model without part-number parentheses
            for key2, b2 in by_bm.items():
                if re.sub(r'\s*\(.*?\)', '', key2) == re.sub(r'\s*\(.*?\)', '', bm): bid = b2; break
        if bid is None:
            brand, model = split_brand(bm)
            key = photo_key({'Knipex 97 51 10': 'knipex-975110', 'Knipex 16 60 06 SB': 'knipex-166006', 'Knipex 74 01 180': 'knipex-7401180',
                             'Knipex 70 01 160': 'knipex-7001160', 'Knipex 78 61 125 ESD': 'knipex-7861125esd', 'Knipex 82 01 200': 'knipex-8201200',
                             'Knipex 86 03 150': 'knipex-8603150', 'Knipex 35 12 115 ESD': 'knipex-3512115esd', 'Weller WLACCWSM1-02': 'weller-mat'}.get(bm), slug(bm))
            title = {'Knipex 97 51 10': 'Knipex 97 51 10 RJ45 crimper', 'Knipex 16 60 06 SB': 'Knipex 16 60 06 coax stripper', 'Knipex 78 61 125 ESD': 'Knipex Electronics Super Knips 78 61 125 ESD',
                     'Knipex 82 01 200': 'Knipex TwinGrip 82 01 200', 'Knipex 86 03 150': 'Knipex Pliers Wrench 86 03 150', 'Weller WLACCWSM1-02': 'Weller soldering mat WLACCWSM1-02'}.get(bm, bm)
            o = {'cat': rec['cat'], 'brand': brand or '—', 'model': model or '—', 'title': title, 'name': rec['name'], 'qty': 0, 'kit': '', 'status': 'Owned', 'note': '',
                 'key': key or slug(bm), 'id': key or slug(bm), 'size': '', 'detail': '', 'uses': '', 'tags': [], 'url': '', 'official': True}
            added.append(bm)
        else:
            o = base[bid]
            if o['qty'] != rec['qty']: updated.append(bm + ': qty %d→%d' % (o['qty'], rec['qty']))
            for f in ('size', 'detail', 'uses'):
                if rec[f] and rec[f] != o.get(f, ''): updated.append(bm + ': ' + f)
        o['cat'] = rec['cat']; o['qty'] = rec['qty']
        if rec['size']: o['size'] = rec['size']
        if rec['detail']: o['detail'] = rec['detail']
        if rec['uses']: o['uses'] = rec['uses']
        if rec['tags']: o['tags'] = rec['tags']
        if rec['url']: o['url'] = rec['url']; o['official'] = rec['official']
        if rec['name'] != 'set': o['name'] = rec['name']
        new_records[o['id']] = o

# records not in the markdown (Laser cutting, Workstation …) are kept as they are
kept = 0
for bid, r in base.items():
    if bid not in new_records:
        if r['kit'] and r['kit'] in seen_kits: continue   # dropped sub-item
        new_records[bid] = r; kept += 1
print('kept unmentioned', kept)

# ---- expand to one row per piece, preserving id scheme ----------------------
out = []
for bid, r in new_records.items():
    q = r['qty'] or 1
    if q == 1:
        rr = dict(r); rr.pop('nth', None); rr.pop('of', None); out.append(rr)
    else:
        for n in range(1, q + 1):
            rr = dict(r); rr['qty'] = 1; rr['id'] = f'{bid}-{n}'; rr['nth'] = n; rr['of'] = q; out.append(rr)
assert len(set(t['id'] for t in out)) == len(out)
json.dump(out, open(tools_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(kits, open(kits_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('\nADDED (%d):' % len(added)); print('\n'.join('  ' + a for a in added))
print('\nUPDATED (%d):' % len(updated)); print('\n'.join('  ' + u for u in updated if 'qty' in u or 'size' in u))
print('\nrows', len(out), 'pieces', sum(t['qty'] for t in out), 'kits', len(kits), 'cats', len(set(t['cat'] for t in out)))
missing = [t['id'] for t in out if not (t.get('key') or t.get('pkey'))]
print('rows without photo', len(missing), missing[:12])
