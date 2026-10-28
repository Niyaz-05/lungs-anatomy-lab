# Human Lungs — Interactive 3D Learning Lab

**Live:** https://lungs-anatomy-lab.vercel.app

Works on phones and tablets: the details rise from the bottom in a sheet you can drag, fold or close with a swipe down, and picking a structure frames it above the sheet.

An interactive 3D model of the human lungs for secondary-school and first-year biology:

- **Anatomy:** select, search and isolate the larynx cartilages, trachea and carina, main, lobar and segmental bronchi, the 5 lobes and 20 bronchopulmonary segments, the hilum and the pulmonary vessels.
- **Real look:** the lungs look as they do in a specimen: salmon-pink with grey mottling, pale airways, real vessel colours.
- **Lobes & segments explorer:** colour the lungs by lobe or by segment. Each segment links to its own segmental bronchus.
- **Breathing:** a schematic breathing cycle with a rate slider. The lungs expand and recoil, and airflow particles run from the larynx to every segment and back out. The panel explains each phase (diaphragm, intercostals, passive recoil).
- **Guided tour:** the route of air from the larynx to the alveoli, then breathing in and out.

**Educational only.** This is not a clinical tool, and the text has not been reviewed by a physician. The 3D model is built from the HuBMAP Human Reference Atlas (Browne, Schlehlein et al., CC BY 4.0); see [public/ATTRIBUTION.md](public/ATTRIBUTION.md).

## Run

Requires Node.js ≥ 22.12.

```sh
npm install
npm run dev            # http://localhost:5182
npm run build          # type-check + production build → dist/
npm run preview        # http://localhost:5183
```

## Check

```sh
npm run typecheck
npm test                         # unit tests (Vitest)
npm run validate:assets          # model hash, nodes, geometry sanity, attribution
npx playwright install chromium  # once
npm run build && npm run e2e     # browser tests (Playwright)
```

See [docs/TESTING.md](docs/TESTING.md) for results and what is not verified.

## Rebuild the lung model

`public/models/lungs.glb` is generated:

1. Download the official HRA lung (23.3 MB) to `source/hra-lung-female-v1.4/3d-vh-f-lung.glb` from
   `https://cdn.humanatlas.io/digital-objects/ref-organ/lung-female/v1.4/assets/3d-vh-f-lung.glb`
   (sha256 `101f48ec64f2ed762fde03fc1193eaae583a0d35c47b72a9ca007d72eefb5f71`).
2. Have a checkout of the Female Atlas (`github.com/Niyaz-05/female-atlas`). It supplies the larynx, trachea, main bronchi and pulmonary vessels from the HRA united-female body.
3. Run:

```sh
node tools/extract-lungs.mjs source/hra-lung-female-v1.4/3d-vh-f-lung.glb "<female-atlas>/public/models"
node tools/bake-shading.mjs      # baked shading for the real-tissue look
node tools/validate-assets.mjs
```

The extraction is deterministic, and its inputs and output are hashed in `src/lungs/generated/provenance.json`.

## Deploy

The site is a Vercel project (Vite preset, output `dist/`) connected to [github.com/Niyaz-05/lungs-anatomy-lab](https://github.com/Niyaz-05/lungs-anatomy-lab). Every push to `main` deploys to https://lungs-anatomy-lab.vercel.app; pushes to other branches get preview URLs.

## Layout

| Path | What |
|---|---|
| `src/contract/` | Simulation schema (zod), approved-asset registry, validation gate |
| `src/lungs/` | Definition (structures, layers, air route, breathing model, tour, sources), breathing maths, airflow streams, anchors, generated geometry and provenance |
| `src/app/` | Pure state reducer, search, React context |
| `src/viewer/` | three.js / react-three-fiber scene: lung model, breathing clock, airflow particles, camera rig, labels |
| `src/ui/` | Panels: structures, details, breathing, tour, About |
| `tools/` | Model extraction and asset validation |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |
