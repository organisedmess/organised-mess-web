# organisedmess.studio — changes from the Cargo site

Baseline: the live Cargo site as pulled on 15 Oct 2026. Everything below is
what differs in `site/`.

## Platform

- Cargo-hosted → static HTML/CSS/JS in `site/`, deployable to Cloudflare Pages (`_redirects`, `_headers`, README).
- Cargo's frontend bundle, Pixi.js and Backbone removed; two small hand-written scripts (`js/site.js`, `js/slitscan.js`) instead.
- Fonts: Cargo's Dinamo webfonts → our own ABC Diatype Thin (200) and ABC Gaisyr Light (300) as woff2 — the same two weights the site used.
- Cargo's custom markup (`<bodycopy>`, `<column-set>`, `<br><br>` paragraphs) → semantic HTML.

## Copy

- Page / OG / Twitter title: `organisedmess` → `Organised Mess — creative technology studio, Singapore`.
- Hero text unchanged; `(read more)` superscript → sentence link **Read more about what we do →**.
- Footer: bordered `Capabilities` button removed; `Website under maintenance —` → `Website under maintenance.`
- Overlay: `[ ← Back ]` → **← Back to the studio**.
- About Us: "We pair the right people…" folded into the "small number of projects" paragraph (5 paragraphs → 4).
- "How we work" + "Our capabilities" (overlapping) → one **What we do** section with four entries carrying the capability keywords.
- Contact row: duplicate "If you'd like to chat…" sentence → just the email.
- Copyright: `©2023—2026` (em dash) → `©2023–2026` (en dash).

## Layout & spacing

- Hero column 7/12 (58%) → `min(100%, 64rem)`; paragraph gap a full blank line → 0.55em; intro auto-scales down (to a 60% floor) when it would run under the footer.
- Footer: 3/9 grid → flex row, status left / note right; the home page gets bottom padding equal to the footer height so nothing is covered.
- Overlay rows: 3/9 grid kept, as real `.row` blocks with consistent padding; headings 0.3rem above their description, 1.5rem before the next; paragraph measure capped at 44rem; copyright pinned to the panel's bottom edge.
- Mobile overlay: labels stack above content instead of squeezing into a 3/12 column; footer type raised from 9px to ~11–12px.

## Type

- Tokenised 1.2-ratio scale: copyright 0.85 · footer 1 · body 1.2 · labels/subheads 1.45 · hero link 1.75 · hero 2.6 rem (was body, labels and subheads all 1.3).
- Body line-height 1.1 → 1.3; hero letter-spacing −0.005em.
- Row labels aligned to body cap-height from measured font metrics (Diatype x 0.479 / cap 0.700, Gaisyr x 0.459 / cap 0.700).
- `text-wrap: pretty` plus a JS widow/orphan fallback (non-breaking last space, glued em dashes).

## Colour

- Page background `#fbf8f6` (warm) → `#f2f2f2` (neutral); rules 55% → 34% black.
- Hover states added: underline on text links, border darkens on Back / hero link. Keyboard focus outlines.

## Backdrop (slitscan)

- Re-implemented in raw WebGL from Cargo's shader (Andrew Ohlmann's slit-scan filter).
- Two Cargo quirks corrected: motion advanced per frame (2× speed on 120 Hz screens) → time-based; the `dimensions` uniform Cargo set was overwritten by Pixi at render time, so the port uses the value that actually rendered.
- Settings: short wave 5 → 3, wiggle 100 → 35, speed 100 → 40. Hidden `?tune` panel with live sliders.
- Scroll coupling: raw scrollTop → impulse with inertia; bands follow content direction (works the same under natural or traditional scrolling).
- Pauses off-screen and under `prefers-reduced-motion`.

## Capabilities overlay

- Still a 60% panel over the blurred home, but it rises from below instead of sliding in from the right (0.65 s open / 0.45 s close), with an 18% dark scrim added behind.
- Back link sticky at the top of the panel.
- Click-only (no scroll-to). Alternative `?nav=page` mode (section below the hero) kept but off.

## New

- Studio clock in the footer: `Studio open · Singapore` / `Studio closed · opens …`, with a dot that fills clockwise through Mon–Fri 09:00–19:00 (Asia/Singapore).
- Lights-off mode outside those hours: dark palette, backdrop dimmed and slowed; the first click / key / scroll / tap turns the lights on for the session (`?lights=off` / `?lights=on` to test).

## Grid + instrument pass (18 Oct)

- 1px frame inset from the viewport; header strip with four cells (name · Singapore / studio clock / Capabilities → / email ↗); footer strip with the slitscan readout and the note. Strips are frosted so content scrolling under them stays legible.
- Backdrop now lives inside the frame.
- Live instrument readout in the footer (`scan · wig · drift · x · y`), updating ~12 Hz from the actual slitscan state. Clicking it opens the tuning panel (sliders, reset, copy settings); `?tune` opens it on load.
- Overlay rows numbered `01–04` with counts; vertical rule between label and body columns; services as a numbered list; `03 Selected work (0)` scaffolded as a table (commented example row; hovering a row can nudge the backdrop via `data-*` attributes).
- Load reveal: hero lines and link rise in staggered; strip cells fade in.
- Arrows travel on hover (→ right, ↗ up-right, ← left).



- Unused Cargo component styles (shop, audio player, slideshow nav, quick-view), editor scaffolding, page-transition CSS, the `cargo-domain` meta.

Everything except the copy edits is a token, attribute or one-line switch in `site/`.

## Life / Lenia through liquid
- `js/backdrop.js`: two GPU modes, `life-liquid` and `lenia-liquid`. The simulation runs as a WebGL ping-pong texture (Life: RGBA8 with a decaying trail channel; Lenia: float, ring kernel R=9, mu .15 sigma .017, dt .12) and the display pass samples it through the liquid domain warp (`data-warp`, default 0.14) with a 9-tap soften and a per-frame crossfade between generations so ticks never pop, then the shared paper/grain finish. Pointer paints into the sim.
- Test rig: both added to the wallpaper row; OS readout names them.

## Nine organisms, one liquid
- `js/backdrop.js` rewritten as a registry of GPU simulations behind a shared liquid display pass: life, lenia, smoothlife, mnca (multi-neighbourhood CA), rd, cyclic, bz (Belousov–Zhabotinsky, float — 8-bit let reagents hit zero and die), physarum (agents in a 256² float texture, deposit via gl.POINTS, trail diffuse/decay), ink (curl-noise advection with occasional drops).
- `data-backdrop="random"` picks a different system each load (remembers the last in localStorage so it never repeats).
- Removed: standalone liquid and caustic shaders, the CPU `js/systems.js` sims (eca / sand / boids — rigid or point-like, they don't survive the warp). `git rm site/js/systems.js`.
- Pointer no longer paints into any simulation; it only nudges the liquid warp. The organisms are purely algorithmic.

## Twelve organisms, invert mode
- New: `bugs` (Larger-than-Life, range-5), `waves` (damped wave field tapped at random), `crystal` (grain growth until the sheet fills, then dissolve).
- BZ seeds with spatially desynced phases so spiral waves exist from the first frame instead of a uniform pulse; ink drops on a fixed cadence (~every 2.5 s) and fades slower; cyclic uses a round radius-2 neighbourhood with threshold 3 (marbling rather than square debris).
- `data-blend="invert"`: the organism flips the sheet rather than inking it. Third row in the test rig.
- Invert mode: the sheet is a slow drifting field of light/dark pools rather than the top-to-bottom gradient, so flips happen all over the page.

## Fourteen systems, frame budget
- New on the agent pipeline (Nature of Code): `flow` (particles riding a curl-noise field, leaving streamlines), `dla` (random walkers freezing into dendrites; the aggregate ages out and reseeds every ~2 min).
- Smoothness: heavy kernels (lenia, smoothlife, mnca, bugs) step at most once per frame; warm-up runs in batches of 3–10 steps instead of 20; the tick accumulator never banks more than one tick (time is dropped rather than caught up in a burst); adaptive quality halves the sim resolution once if fps stays under 45 for 2.5 s.
- Invert verified across all fourteen systems.
- Pointer lens: a soft disc (data-lens, 0.22 of the height) that inverts whatever is under the pointer, edge pulled by the liquid; eases in on the first move, out when the pointer leaves. Display-pass only — the sims stay untouched. Off for touch.
- Pointer lens softened into a blob: radius wobbles with the liquid, falloff runs to the centre, 90% strength (data-lens 0.3).
- Custom cursor: a 14px ring in difference blend (readable on both halves and inside the lens), grows into a translucent disc over links, shrinks on press; pointer devices only, hidden when the mouse leaves.

## Pills + window
- Capabilities opens as an OS-style window (`<body data-caps="window">`, the default): glass panel with title bar, close dot and drag, pops in from slightly below; the home stays visible behind a light scrim and a click outside, Escape, back or the dot closes it. `data-caps="sheet"` restores the rising 60% panel. Window helpers (`OM.windowify`, `OM.makeDraggable`) now live in site.js; os.js reuses them.
- Overlay row reveal scheduled on a timer rather than animation frames, so it can't be starved by heavy frames.
- Test rig: fourth row toggles window / sheet.

## Watchdog, flip reset, OS chrome removed
- Coverage probe + watchdog: full or frozen sheets flip the page to its inverse (`uFlip`, eased) and reseed under cover of the turn; empty sheets reseed quietly; flips ≥ 20 s apart. Framebuffer-completeness checks with fallback to `life`; WebGL context loss handled.
- DLA: more seeds (9×5 grid), walker count scales with sim size (all agent systems now use a density, not a fixed count), shorter warm-up so growth happens on screen; resets by flip when ~26% covered. Crystal grows slower and flips at 85%.
- Removed OS chrome (`js/os.js`, menu bar, statement window, readout) and the unused `js/liquid.js` / `js/slitscan.js` — `git rm` them. Kept: pills, invert, pointer lens, Capabilities window.
- Test rig moved to the bottom of the page, three rows: system · ink/invert · window/sheet.
- `?q=<0–1>` pins sim quality (disables the adaptive fallback).

## System pill
- Header gains a pill top-left: "System · <name> ▾" — a glass menu of all fourteen organisms; choosing one switches the backdrop live (`Backdrop#setMode`, old textures freed, `backdropchange` event) and is remembered for the next visit. Keyboard: arrows, Escape.
- Invert and the Capabilities window are now fixed defaults (`data-blend="invert"`, `data-caps="window"`); the test-rig toggles are gone from the preview.
- Capabilities window: copyright line removed from the panel; the home blurs behind the overlay again (header pills blur with it); the window may cover the header but stops above the footer pills, which sit above the overlay and stay crisp. Mobile uses the same window with side margins.
- System pill moved to the footer centre (footer is a 3-column grid: status · system · rights); its menu opens upward. Mobile: status left, system right.
- System menu in three content-width columns of five (one column on mobile), no scrolling, so it sits low over the footer.
- System menu: selection dot sits before the name (slot reserved so names align).
- Cursor: listeners moved to the document in capture phase (menus and drag handles can't swallow moves), system cursor hidden on every element while the custom one is shown, hides on window blur / leaving the viewport, shows again on the next move; z-index raised above everything.
- Lights off: a centred notice on the dark sheet from the first frame — "The studio is closed. It opens <when>, Singapore time. Click anywhere to turn the lights on." — fades on wake; the hero sits at 35% until then.
- Lights-off notice: serif message + small sans click prompt; the opening time is converted to the visitor's clock ("02:00 tomorrow, your time" in London; plain "09:00 tomorrow" when their clock matches Singapore's).
- Closed state: page content and pills blurred (10px) and inert, backdrop blurred too, pointer lens off; only the notice is sharp. First click/scroll/key wakes everything together over 1.4 s.

## QA pass 1
- Type floors: rem scales with the viewport (1rem ≈ 10px on phones), so chrome and panel text could hit 6–9px. Pills ≥ 12px (13 on mobile), pill height ≥ 34px on touch, title bar ≥ 12px, `--t-xs/m/l` floors (10/13/16px; 11/15/18 on mobile), system menu ≥ 13px, lights notice ≥ 20px.
- Mobile footer: © pill back as a second row; status text compact ("Closed · 01:00 tomorrow"); `minmax(0,1fr)` so it never pushes the system pill out. Window height now uses the measured `--footer-height`, so it clears the two-row footer and short laptop windows.
- Status pill shows the next opening in the visitor's clock, matching the notice. "click to turn the lights on" hint removed (the notice says it).
- Reduced motion: reveals, blur-ins and window animations disabled with content shown immediately (rows were stuck invisible before).
- No WebGL: CSS gradient sheet, system pill reads "Static" and is disabled.
- favicon.ico 291KB → 697B (16+32); apple-touch-icon and icon-512 added; theme-color.
- 404.html for unknown paths (Workers `not_found_handling: 404-page`).
- Copy: "About us" (sentence case like the other rows), Oxford commas made consistent with the hero, "hardware development" repetition removed from Systems & Prototyping.
- Footer: desktop status · system · ©; mobile row 1 status | system, row 2 © flush left. © pill in the sans like the others. Section numbers sit on the label baseline at 0.62× the label size.

## QA pass 2
- System menu never taller than the viewport: on mobile it scrolls as a last resort, and short-but-wide screens (landscape phones) get 2 or 3 columns.
- Keyboard: opening Capabilities moves focus into the window (Tab walks its links), closing returns focus to the link that opened it.
- Closed state on phones fades the hero further so the notice sits on a clean sheet.
- Verified: 11 breakpoints, open/close every way, back/forward, resize while open, drag reset, rapid system switching, touch wake, no-WebGL, reduced motion, context loss, 60 s soak (flat heap, no GL errors), open/close spam + switch storm + resize storm, 404 page, production headers/compression/routing.

## QA pass 3 (external report)
- `/capabilities` deep link: Workers Static Assets can't 200-rewrite from `_redirects`, so `worker.js` now fronts the assets and serves `index.html` at `/capabilities` (URL and query kept). `wrangler.jsonc` gains `main` + `ASSETS` binding.
- Icons also served at `/favicon.ico` and `/apple-touch-icon.png`; `robots.txt`, `sitemap.xml`, canonical link; `shrink-to-fit` removed; OG image replaced with a 1200×630 frame of physarum, `og:image:width/height` set.
- After hours: decided in an inline `<head>` script so the dark sheet is the first paint (no light→dark flash); a mouse moving ~12 px wakes the page as well as click/scroll/tap, so overseas desktop visitors are never stuck. Hint is 14px+, weight 300, AA contrast, says "tap" on touch; notice is a `role="status"` live region; status pill keeps "your time" on desktop.
- Capabilities window: `role="dialog"`, `aria-modal`, labelled by its title; page behind is `inert`; Tab cycles inside; "Index (3)" hidden from screen readers. Glass raised to 88%.
- System picker: visible-text name (no aria-label), `menu` / `menuitemradio` + `aria-checked`, keys hidden from names, Home/End. No-WebGL instances are no longer registered, so the pill reads "Static".
- CTA reachable at short heights: home pads to the measured footer and scrolls once the intro hits its floor.
- `#hash` reloads only for system names; reduced motion draws a few frames then stops the loop, lens off.
- Copy: rows in Title Case ("About Us", "What We Do"); Product & Tool Development no longer opens with "Custom hardware"; typographic apostrophe on the 404.

## Performance: warp pre-pass, direct cursor
- All the slow noise fields (liquid warp q/r, pools, liquid shade, lens wobble, paper mottle) now render once per frame at quarter resolution into two small textures; the full-resolution pass just samples them. ~16× less noise work per frame — physarum went from ~22 to ~64 fps in the software renderer used for testing. Canvas pixel budget trimmed to 1600×900.
- Custom cursor is positioned directly on every pointer event (no easing, no dependence on the render frame rate), and the native cursor is hidden on pseudo-elements and scrollbars too, so it can't peek through on heavy frames.

## Internal (login wall) + Tools
- `/internal/`: a studio-only area behind one login — an index page listing what's inside, and anything placed under `site/internal/` is covered automatically. `worker.js` gates `/internal*` with a username + password from Worker secrets (`INTERNAL_USER`, `INTERNAL_PASSWORD`), 30-day HMAC-signed HttpOnly cookie, constant-time compares, open-redirect-safe `next`, `no-store` + `noindex` on everything behind it. Login page is a small `.os-win` window on the 404's gradient sheet. `wrangler.jsonc` adds `run_worker_first` for `/internal*` so the asset cache can't serve the protected files around the check.
- `/internal/tools/`: the workshop tool inventory as a searchable page — 304 pieces, 220 line items, 12 sets in 18 categories — rendered from `tools/data/*.json` with masked product photos (`mix-blend-mode: multiply` drops their white onto the paper). Same tokens, type and numbered row grid as Capabilities; header pills for Internal / Log out; category heads stick while their rows scroll. Search is token-aware (short/numeric terms match whole tokens), highlights matches, and treats sets sensibly: collapsed when the set description matches, open on just the matching items when its contents do. Chips filter by category with live counts; `?q=`/`?cat=` in the URL. `/tools` redirects here.
