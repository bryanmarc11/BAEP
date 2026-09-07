# BSESS Accreditation Evidence Portal

A 100% static, client-side, zero-backend website for organizing, staging, and
presenting documentary evidence for AACCUP accreditation of
**Bachelor of Science in Exercise and Sport Sciences**, built from the actual **AACCUP, Inc. Master Survey Instrument** (10 Areas,
Parameters, System/Implementation/Outcome Sections, Indicators, and
Sub-indicators — ~1,135 addressable checklist nodes in total).

No build step, no framework CLI, no CDN, no analytics. Plain HTML5 + CSS +
vanilla ES6 modules.

## Architecture: why 11 static pages, not one big SPA

Each Area (`area-1.html` … `area-10.html`) is a separate, fully pre-rendered
HTML page containing that Area's complete Parameter → Section → Indicator →
Sub-indicator checklist as real, static markup (built once from
`accreditation-structure.json` — the actual Master Survey Instrument content,
not placeholder text). `index.html` is a small dashboard/landing page.

This directly satisfies several constraints at once:

- **Lazy-load per route (constraint 4):** visiting Area III only downloads
  `area-3.html`; the other 9 Areas are never fetched. The dashboard route
  (`index.html` + shared CSS/JS + the tiny `data/manifest.js`) totals **~38 KB
  raw / ~12 KB gzipped** — far under the 500 KB budget. Even the largest
  single Area page (Area IV, 187 indicators) is ~236 KB raw / ~21 KB gzipped.
- **No fetch()/JSON at runtime for taxonomy content (constraint 2):** because
  the checklist is baked into each page as real HTML, there is no `fetch()`
  of JSON that can fail, hang, or trip file:// CORS restrictions — eliminating
  an entire class of runtime errors and broken-JSON risk. The only JSON-like
  data loaded at runtime is `data/manifest.js`, loaded as a plain `<script>`
  global (not `fetch`), so it works identically on GitHub Pages, Vercel,
  Netlify, and raw `file://`.
- **Progressive enhancement (constraint 3):** every Area page ships a
  `<noscript>` block containing the complete, plain nested-list indicator
  checklist for that Area, rendered from the same real data. With JavaScript
  the interactive version (collapsible tree, evidence staging, status
  tracking, print controls) is shown instead — the `.app-content` container
  is hidden by default in CSS and only revealed once a tiny synchronous
  inline script confirms scripting is active. If JavaScript fails outright,
  visitors never see a blank screen: the browser falls back to rendering the
  `<noscript>` content automatically.

## File layout

```
index.html                 Dashboard: aggregate progress, rating-scale legend
area-1.html … area-10.html  One page per AACCUP Area, full real checklist baked in
assets/css/style.css       All styling: layout, focus rings, print stylesheet
assets/js/
  sanitize.js              escapeHtml()/safeText() — the only text-injection helpers used
  storage.js               localStorage wrapper; every call is try/catch-guarded
  evidence.js              Evidence CRUD, status tracking, per-area progress cache
  nav.js                   Drawer nav, Arrow/Home/End tree keyboard nav, print-single-parameter
  main.js                  Entry point (type=module); wraps every init step in try/catch
  dashboard.js             Reads data/manifest.js + progress cache to render index.html's dashboard
data/manifest.js           Tiny area titles/weights/counts manifest (script global, not fetched)
evidence/AreaX/ParamY/     Empty folders + README.txt marking the "File reference" path convention
serve-offline.sh / .bat    One-command local static server for offline venues
vercel.json / netlify.toml Static deployment configs (no build command)
.nojekyll                  Prevents GitHub Pages from mangling /assets with Jekyll
```

## How each constraint is met

**1. No backend/build step/framework.** Everything here is hand-written
HTML/CSS/vanilla ES6 modules (`<script type="module">`). No React/Vue/Next,
no Tailwind CDN (a self-authored, self-hosted stylesheet was used instead —
this is stricter than the allowed Tailwind-with-vendored-fallback option and
removes an entire dependency + its offline-fallback complexity).

**2. No runtime errors, never a blank screen.** `storage.js` wraps every
`localStorage` read/write in try/catch and exposes `storageAvailable` so the
UI can show a visible banner instead of failing silently. `main.js` wraps
every subsystem's initialization (`initDrawer`, `initEvidence`,
`initTreeKeyboardNav`, `initPrintButtons`, progress caching) in its own
try/catch, so one broken subsystem can't take down the page — a fatal error
in the evidence system surfaces as a plain-language `.error-banner`, not a
console-only failure. `dashboard.js` checks that `window.BSESS_MANIFEST`
actually exists before using it and shows an error message otherwise. There
is no unguarded `fetch()` or `JSON.parse()` anywhere in the codebase.

**3. Progressive enhancement.** See "Architecture" above — every Area page's
`<noscript>` block is a complete, real fallback, not a placeholder.

**4. Performance budget.** See the measured byte counts above. Fonts are
system stack (no web font requests at all, satisfying constraint 8 too).

**5. Accessibility (WCAG 2.1 AA).**
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`.
- Skip-to-content link, visible on keyboard focus.
- `:focus-visible` outlines (3px, high-contrast blue `#0B5FBF`) on every
  interactive element.
- Accordions use native `<details>/<summary>` for Parameters and for any
  Indicator/Sub-indicator that has children — this gives `aria-expanded`-
  equivalent disclosure semantics for free, is keyboard-operable by default
  (Enter/Space/Tab), and can't desync from visual state the way a custom
  ARIA implementation could.
- Keyboard tree navigation: `nav.js`'s `initTreeKeyboardNav` adds ArrowUp/
  ArrowDown/Home/End movement between sibling `<summary>` elements within the
  same list (Parameter list, or any Indicator/Sub-indicator sibling group),
  layered on top of the native Enter/Space/Tab behavior (left untouched).
- Contrast: computed with the WCAG relative-luminance formula for every
  color pairing used — white text is only placed on `#0B6E2D` (6.4:1) or
  darker (`#074A1E`, 10.5:1); status pill orange (`#B45309`) with white text
  is 5.0:1; dark green body text (`#08421C`-family, via `--ink`/`--green-800`)
  on light green/orange tint backgrounds is 10+:1. All ≥ 4.5:1.

**6. Responsive 320px → 4K.** Mobile (<600px): sidebar becomes an off-canvas
drawer opened by a hamburger button (`aria-expanded` toggled, Escape closes,
focus is moved on open/close, a dimmed overlay closes it on click/tap).
Tablet (600–1099px): 2-column CSS Grid (narrow sidebar + content). Desktop
(≥1100px): persistent left sidebar + content pane. A 1600px+ breakpoint bumps
base font size slightly for very large displays. Tested visually against a
1024×768 layout (the classic projector resolution) — the persistent-sidebar
breakpoint doesn't kick in until 1100px, so 1024×768 correctly gets the
2-column tablet layout with a legible, non-cramped content pane.

**7. Print/PDF-ready.** The print stylesheet hides the header, sidebar,
dialogs, and every `.no-print`-flagged control; `.app-content` is forced
visible even though it's normally gated behind the `html.js` class (so a
printed/exported PDF from a JS-enabled session always shows the full
content); each Parameter forces a page break before it
(`page-break-before:always`) so the printed "Evidence Index" reads as one
clean section per Parameter; links are expanded inline via
`a[href]::after{content:" (" attr(href) ")" }` so a paper copy still shows
where each piece of evidence points. A "Print this Parameter" button per
Parameter isolates just that Parameter for a shorter printout.

**8. Security/privacy.** No analytics, no third-party trackers, no CDN
fonts — the entire font stack is the OS system font. Every place a
user-entered string (evidence title, notes, file path/URL) reaches the DOM,
it goes through `safeText()` (which always uses `.textContent`, never
`innerHTML`) or is set via `.value`/`.href` attribute assignment, which the
browser does not parse as HTML. The one `innerHTML`-adjacent operation in
the codebase — clearing the evidence list before re-render — uses
`while (list.firstChild) list.removeChild(list.firstChild)` rather than
`list.innerHTML = ""`, and no user string is ever concatenated into an HTML
string and parsed.

## Deployment

### GitHub Pages
Push this folder to a repo; Settings → Pages → choose branch/folder.
`.nojekyll` is included so `/assets` and `/data` aren't mangled.

### Vercel / Netlify
Import the folder as-is (`vercel.json` / `netlify.toml` mark it static with
no build command) — or drag-and-drop the folder into the Netlify dashboard.

### Offline USB / LAN (no internet at the venue)
**Recommended — run the tiny local server:** copy the folder to the USB/LAN
share, then double-click `serve-offline.bat` (Windows) or run
`./serve-offline.sh` (macOS/Linux). This uses Python's built-in
`http.server` (no internet required, no install needed on macOS/Linux;
Windows laptops commonly have Python already, or install it once beforehand).
Open `http://localhost:8000`. Full functionality, including reliable
`localStorage` persistence across reloads.

**Fallback — open `index.html` directly via `file://`:** everything renders
identically since there's no `fetch()` of local JSON to trip Chrome's
file:// CORS restriction. The one caveat is `localStorage` persistence under
`file://`, which is inconsistent across browsers (Firefox generally persists
it; Chrome/Edge sometimes isolate each file:// page load). The app detects
this at startup (`storageAvailable` check in `storage.js`) and shows an
on-screen banner telling the task force to rely on the server option, or to
finish a session's data entry in one sitting without reloading.

## Using the portal

- Every Indicator/Sub-indicator has a status dropdown (Not Started / In
  Progress / Complete / Verified) and an **Add evidence** button.
- Evidence types: **File reference** (a relative path into `/evidence/...`,
  no size limit, works everywhere, never breaks as long as the file exists at
  that path), **External link** (a cloud URL, useful only where there's
  internet), or **Embed small copy** (Base64 copy in `localStorage`, capped
  client-side at 4 MB).
- The dashboard on `index.html` shows per-Area and overall completion,
  computed from a small cache (`bsess_progress_v2` in `localStorage`) that
  each Area page updates whenever its evidence/status changes — visit an
  Area at least once for it to count.
- **Print this Parameter** isolates one Parameter for a clean printout;
  browser Print (Ctrl/Cmd+P) on any Area page prints the whole Area with the
  same clean, nav-free formatting.

## Content accuracy note

The taxonomy in every Area page is generated directly from
`accreditation-structure.json`, which contains the real, complete AACCUP
Master Survey Instrument text supplied for this program — nothing here is
placeholder or fabricated wording. If your institution uses a different
instrument version, regenerate the pages from an updated JSON file using the
same structure (`areas[].parameters[].sections[].indicators[].subIndicators[]`
with `code`/`text` fields).
