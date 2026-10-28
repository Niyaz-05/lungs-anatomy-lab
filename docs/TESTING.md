# Testing

Results recorded on 2026-10-17 on Windows 11, Node 22.14.0, headless Chromium (Playwright 1.64, software WebGL via SwiftShader).

## Commands

| Check | Command | What it covers |
|---|---|---|
| Types | `npm run typecheck` | TypeScript strict, `noUncheckedIndexedAccess` |
| Unit | `npm test` | Definition validity and validation-gate rejections; every node ↔ structure; 3 + 2 lobes and 10 + 10 segments; each segment in exactly one lobe with its own bronchus (same number); every left/right structure on its side; vessel oxygenation; default rate within the cited 12–18 /min; breathing curve (periodic, 0–1, ⅓ / ⅔ split, flow sign, zero flow at turns, bad input rejected); 20 airflow streams (order larynx → trachea → main → lobar → segmental → segment, end inside own segment, correct side, only the entry leg off-model); reducer (lobe highlight, isolate, colour mode, rate clamping, breathing in tour steps, reset); search (RUL, lingula, windpipe, voice box) |
| Assets | `npm run validate:assets` | GLB sha256 = provenance, node set = geometry record, finite positions, unit normals, indices in range, triangle counts, attribution names HuBMAP, the authors, both DOIs, CC BY 4.0 and the source and output hashes |
| Determinism | re-run `tools/extract-lungs.mjs` | Byte-identical `lungs.glb` (sha256 `d8a8a24c…`) on a second run |
| Build | `npm run build` | Type check + production bundle |
| E2E | `npm run build && npm run e2e` | 16 scenarios below; screenshots in `docs/screenshots/` |
| Dependencies | `npm audit` (at install) | 0 vulnerabilities reported on 2026-10-17 |

## E2E scenarios (`tests/e2e/lab.spec.ts`)

1. Loads with no console errors; the main screen shows no details sheet or disclaimer text.
2. Clicking the model selects the structure under the pointer.
3. Search: "RUL" + Enter selects the right upper lobe; "lingula" finds both lingular segments and their bronchi; "windpipe" → trachea; no-match message; Escape restores the list.
4. Selecting a lobe lists its segments; segment → its bronchus by link.
5. Colour by lobe / segment changes the rendered colours.
6. Layer toggles: cartilage, airways and pulmonary vessels hide and show.
7. Isolate, Zoom to and Reset.
8. Camera presets change the view.
9. Labels mode: at least 3 labels, none overlapping.
10. Breathing: the phase alternates expiration ↔ inspiration at 30/min; the rate readout follows the slider; Pause/Play; 9-step air route; no console errors.
11. Guided tour: 9 steps, Next/Back, jump to a step, Finish.
12. Phone 390×844: no horizontal overflow; Structures opens from the dock; picking closes it and shows the details.
13. About (ⓘ): HuBMAP credit, CC BY 4.0, model assumptions; Escape closes.
14. `?nowebgl`: fallback message; the list and details still work.
15. Missing model (HTTP 404): error alert; Try again refetches and loads.
16. Reduced motion: breathing mode without errors.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** (0 errors) |
| `npm test` | **Pass**: 23/23 tests in 2 files |
| `npm run validate:assets` | **Pass**: 68 nodes, 122,199 triangles, sha256 `d8a8a24c0ce2…` |
| Extraction determinism | **Pass**: identical sha256 on re-run |
| `npm run build` | **Pass**. JS bundle about 1.45 MB (about 400 kB gzip); Vite warns about chunk size |
| `npm run e2e` | **Pass**: 16/16 in 3.0 min (software WebGL), final clean run on the latest code |
| `npm audit` | 0 vulnerabilities at install time |
| Live site (2026-10-18) | **Pass**: https://lungs-anatomy-lab.vercel.app returns the page; `models/lungs.glb` is served with the recorded sha256 `d8a8a24c…`; the model renders in headless Chromium with no console errors |

## Results: real-tissue look (2026-10-19)

Re-run on Windows 11, Node 22.14.0, headless Chromium (software WebGL, which uses the automatic low-quality mode), after adding the real-tissue look and the Real · Lobe · Segment colour switch.

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass**: 24/24, including real colours by default and tour steps that set their own colours |
| `npm run validate:assets` | **Pass**: 68 nodes, 122,199 triangles, sha256 `34e61e6eca96…`, with the baked `_TISSUE` attribute on every mesh |
| `npm run build` | **Pass** |
| `npm run e2e` | **Pass**: 16/16. The full run had 15/16; the breathing test then passed after the fix below |

Defects found and fixed:

- **Breathing slowed down on slow devices.** The breathing clock advanced at most 0.05 s per frame, so with slow frames breathing nearly stopped (the E2E breathing test caught it under software WebGL). The cap is now 0.25 s per frame.
- **Dark smudges on the trachea.** The hidden cartilage rings shaded the trachea in the bake. They no longer count as occluders for the airways.

## Defects found and fixed during QA

- **The highlight swamped the lobe colours.** In the "Three lobes" tour step every lobe turned amber. A highlighted lung segment now keeps its own colour and stands out by opacity and a glow in its own hue.
- **Focus labels overlapped** ("Right middle lobe" / "Right lower lobe"). Labels in focus now stack upwards, with the pointer extended to the anchor.
- **Lobe labels pointed at the wrong lobe.** From the front, the right lower lobe label sat on the middle lobe. Labels for lobes and segments are now placed on a camera-facing point whose line of sight, even through see-through tissue, reaches their own structure first.
- **Label visibility checks stopped while the canvas rendered on demand.** The throttle read the render clock, which does not advance in on-demand mode. It now uses wall-clock time. The same latent bug was fixed in the heart lab.
- **Segment shades were too similar** in "colour by segment". The shade spread was widened, adjacent segment numbers alternate light and dark, and opacity is higher in that mode.
- **Three of my own E2E assertions were wrong.** "lingula" correctly matches 4 items, and a hidden tag is part of a list button's text. The tests were corrected; the app was right.

## Phone and tablet layouts

Added 2026-10-28, the same layer as the heart lab: `src/app/layout.ts` (the layout from the screen size: `desktop`, `sheet` for phones and portrait tablets, `landscape` for phones on their side), `src/ui/Sheet.tsx` (the details as a bottom sheet with a handle: tap to step peek / half / full, drag to follow the finger, drag down or flick to close) and a "Phones and tablets" block in `src/styles.css` (safe-area insets, finger-sized controls, a mode row that scrolls sideways). Picking a structure frames it above the sheet and hides the title and mode buttons until the details close; a tap on empty space closes them too.

`tests/e2e/responsive.spec.ts` (the same file in every lab) runs at 390×844, 844×390, 768×1024, 820×1180, 1024×768 and 1366×820 (touch emulation below 1024 px): no horizontal scroll; title, modes, dock and sheet on screen and not overlapping; room left for the model; finger-sized controls; the sheet folds, opens and expands by tap, keyboard and drag; the picked structure's label stays above the sheet; closing by ✕, by a tap on empty space and by dragging down (real touch events); a mode's own panel keeps the mode buttons and cannot be dismissed; every mode fits and scrolls to its end. Screenshots are in `docs/screenshots/responsive/`.

**Result (2026-10-28):** the whole GPU suite (this lab's own scenarios and the layout checks), installed Chrome, AMD Radeon integrated GPU: **47 passed in 4.3 min**.

**Not verified:** physical phones and tablets (only Chrome's device emulation at the six sizes), notches and safe areas on a real device, multi-finger gestures, the on-screen keyboard over the search box, and Safari and Firefox.

## Not verified

- **The real-tissue look on real GPUs.** High quality (clear coat and sheen) was reviewed in headless screenshots with `?quality=high`; its frame rate on real laptops and phones is not measured. The automatic switch to low quality on slow frames has not been tried on a real device.

- **Physical devices and GPUs.** All browser tests used software WebGL in headless Chromium. Frame rate with breathing and about 1,600 airflow particles on a real mid-range laptop or phone is not measured.
- **Other browsers.** Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed. Keyboard paths and ARIA labels were checked by hand and by E2E only.
- **Anatomical review.** The structure map follows HuBMAP node names (corrected by position where the source mislabels), and the text was checked against OpenStax A&P 2e §19.1 and §22.1–22.3. No anatomist or physician has reviewed it.
- **The breathing model is schematic.** The ⅓ / ⅔ timing and the 5 % expansion are stated model assumptions, not measurements.
- **Airflow ends inside segments.** The particles stop at each segment's interior point: bronchioles and alveoli are not modelled. While breathing, the end points do not follow the 5 % lung expansion.
