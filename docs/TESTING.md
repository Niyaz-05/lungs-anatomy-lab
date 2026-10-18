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

## Defects found and fixed during QA

- **The highlight swamped the lobe colours.** In the "Three lobes" tour step every lobe turned amber. A highlighted lung segment now keeps its own colour and stands out by opacity and a glow in its own hue.
- **Focus labels overlapped** ("Right middle lobe" / "Right lower lobe"). Labels in focus now stack upwards, with the pointer extended to the anchor.
- **Lobe labels pointed at the wrong lobe.** From the front, the right lower lobe label sat on the middle lobe. Labels for lobes and segments are now placed on a camera-facing point whose line of sight, even through see-through tissue, reaches their own structure first.
- **Label visibility checks stopped while the canvas rendered on demand.** The throttle read the render clock, which does not advance in on-demand mode. It now uses wall-clock time. The same latent bug was fixed in the heart lab.
- **Segment shades were too similar** in "colour by segment". The shade spread was widened, adjacent segment numbers alternate light and dark, and opacity is higher in that mode.
- **Three of my own E2E assertions were wrong.** "lingula" correctly matches 4 items, and a hidden tag is part of a list button's text. The tests were corrected; the app was right.

## Not verified

- **Physical devices and GPUs.** All browser tests used software WebGL in headless Chromium. Frame rate with breathing and about 1,600 airflow particles on a real mid-range laptop or phone is not measured.
- **Other browsers.** Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed. Keyboard paths and ARIA labels were checked by hand and by E2E only.
- **Anatomical review.** The structure map follows HuBMAP node names (corrected by position where the source mislabels), and the text was checked against OpenStax A&P 2e §19.1 and §22.1–22.3. No anatomist or physician has reviewed it.
- **The breathing model is schematic.** The ⅓ / ⅔ timing and the 5 % expansion are stated model assumptions, not measurements.
- **Airflow ends inside segments.** The particles stop at each segment's interior point: bronchioles and alveoli are not modelled. While breathing, the end points do not follow the 5 % lung expansion.
