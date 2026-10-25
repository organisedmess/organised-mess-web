# organisedmess.studio

Static source for the Organised Mess website, ported from Cargo to plain
HTML / CSS / JS and hosted on Cloudflare Pages. No build step.

```
site/
├── index.html          the whole site (home + footer + Capabilities overlay)
├── css/site.css        tokens, type, home, footer, overlay, backdrop mechanics
├── js/site.js          base unit + mobile class, widow fix, overlay routing
├── js/backdrop.js      WebGL backdrops: liquid | rd | caustic (older slitscan.js / liquid.js kept, unused)
├── fonts/              ABC Diatype (Thin 200) + ABC Gaisyr (Light 300), woff2
├── assets/             slitscan source image, favicon, OG image
├── tools/              internal workshop tool inventory — login required (see below)
├── css/tools.css       /tools + its login page, on site.css's tokens and the Capabilities row grid
├── _redirects          /capabilities → index.html (200 rewrite)
└── _headers            caching + security headers
```

## /tools — internal inventory

`tools/index.html` renders every tool in the workshop from `tools/data/tools.json`
(one record per line item) and `tools/data/kits.json` (set-level records), with
product photos in `tools/img/`. Search matches name, brand, model, size, details,
uses and tags; short or numeric terms match whole tokens ("tx 8" won't light up
"80 mm"). Category chips filter; sets are collapsible rows — collapsed when the
set's own description matches, open on just the matching items when its contents
do. `?q=` and `?cat=` are shareable. `/` focuses the search box.

**Updating:** re-export the inventory, replace `tools/data/*.json` and any new
photos in `tools/img/`. The header stats are computed from the data; only the
"Updated" date is a constant at the top of `tools/tools.js`.

**Login:** `../worker.js` gates `/tools*` behind a username + password held in two
Worker secrets, `TOOLS_USER` and `TOOLS_PASSWORD` (optional `TOOLS_SECRET`):

```
npx wrangler secret put TOOLS_USER
npx wrangler secret put TOOLS_PASSWORD
```

A good login sets a 30-day HttpOnly, HMAC-signed cookie scoped to `/tools`;
`/tools/logout` clears it; changing either secret logs every session out. Protected
responses are `no-store` and `noindex`. `../wrangler.jsonc` lists `/tools*` in
`run_worker_first` — without that, Workers Static Assets would serve the files
under `/tools` straight from the asset cache and skip the check. For local preview
put the same two keys in `../.dev.vars` (gitignored) and run `npx wrangler dev`
from the repo root. If more people ever need access, Cloudflare Access on `/tools*`
is the upgrade: per-person email codes, and the gate in `worker.js` can go.

## Local preview

Any static server works, e.g.

```
cd site
python3 -m http.server 8000
```

then open http://localhost:8000 (and http://localhost:8000/capabilities —
note `python -m http.server` doesn't read `_redirects`, so use `/?` + the
"(read more)" link, or `npx wrangler pages dev .` which does).

## Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`site`**
4. Custom domains → add `organisedmess.studio` (and `www.`), then move the
   DNS from Cargo to the records Cloudflare gives you.

Every push to the production branch redeploys; other branches get preview URLs.

## Editing

- Copy lives in `index.html` — plain semantic HTML. Home intro is `<h1 class="intro">`
  with one `<span class="para">` per paragraph; the overlay is a list of
  `.row` blocks (`.row-label` + `.row-body` with `<h3>` / `<p>`).
- Design tokens (colours, spacing scale, panel width, page padding) are the
  custom properties at the top of `css/site.css`. Type sizes are in rem,
  where 1rem = the viewport-relative base unit `js/site.js` computes
  (≈13px at 1440×900, ≈9px on a phone) — the same scale Cargo used.
- Orphans/widows: `text-wrap: pretty` in CSS; `js/site.js` applies a
  non-breaking-space fallback (and glues " — ") in browsers without it.
- Backdrop settings are `data-*` attributes on
  `[data-backdrop="slitscan"]` in `index.html` (orientation, scan size,
  short wave, wiggle, speed, mouse/scroll interaction, image).
- Capabilities navigation: `<body data-nav="overlay">` (default: a 60% panel
  rises over the blurred home; click-only) or `data-nav="page"`
  (section below the hero, links scroll to it). Append `?nav=overlay` / `?nav=page` to the URL to try the other
  without editing. `rel="history"` links open it, `rel="close-overlay"`
  closes it; the URL becomes `/capabilities` either way (see `_redirects`).
- Backdrop: `data-backdrop="liquid|rd|caustic"` in `index.html`; append
  `?bg=rd` etc. to the URL to compare without editing. Shared settings:
  `data-color-a/b`, `data-speed`, `data-grain`, `data-paper`. liquid:
  `data-scale`, `data-contrast`. rd (Gray–Scott): `data-feed`, `data-kill`.
  caustic: `data-scale`, `data-intensity`. The old slitscan port is still in
  `js/slitscan.js` if you ever want it back (swap the script tag and the
  `data-backdrop` block; see git history).
- Work index: `#work` in `index.html` has a commented `<table class="index">`
  with an example row. Uncomment, add rows, delete the `.index-empty` line.
  Optional `data-wiggle` / `data-scan-cycles` / `data-speed` on a `<tr>`
  nudge the backdrop while that row is hovered.
- Frame / strips: `--frame`, `--strip-h`, `--page-pad` tokens in `site.css`.
- Studio clock: `STUDIO_TZ` and `STUDIO_HOURS` at the top of section 3 in
  `js/site.js` (per weekday, 24h). Shown in the footer with an open/closed
  dot — the dot is a tiny clock: a faint disc with a solid wedge filling
  clockwise through the day's hours; faint disc only when closed.
- Lights off: outside `STUDIO_HOURS` the site loads in a dark, dimmed state
  (palette in section 10 of `css/site.css`, backdrop slowed to 35%). The
  first click / key / scroll / tap switches the lights on for the session.
  Test with `?lights=off`; disable with `?lights=on`.
- Backdrop scroll coupling: wheel and touch scrolls are impulses with
  inertia (`GAIN`, `MAX`, `FRICTION` in `scrollImpulse` /
  `updateScrollOffset` in `js/slitscan.js`). Bands follow the content
  direction, so it feels right under either OS scroll setting.

## Fonts

Cargo bundled Dinamo's Diatype and Gaisyr under Cargo's own licence. This
site ships our own cuts (`fonts/`). Check the licence on those files covers
commercial web use for organisedmess.studio before going live.
