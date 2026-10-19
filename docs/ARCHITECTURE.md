# Architecture

The lungs lab shares the heart lab's design: a validated, data-only **`SimulationDefinition`** rendered by a generic viewer. The code is a deliberate copy, not a shared package, so each lab deploys independently.

## Differences from the heart lab

| Area | Lungs |
|---|---|
| Contract | `kind: 'group'` with `members` (lobes and lungs are groups of segments). `side`, `lobe` and `code` (S1–S10 / B1–B10) on structures. `airRoute` in place of a blood-flow path. A `breathing` model whose assumptions must be listed |
| Validation | Groups may only list mesh structures, a `lobe` must be a group, and the breathing default must lie within its range, on top of the heart's checks |
| State | Modes `explore` / `breathe` / `tour`, `colourBy` (real / lobe / segment; real by default, and tour steps on lobes and segments set their own), breathing `rate` |
| Breathing | `src/lungs/breathing.ts` is pure maths: half-cosine volume over an inspiration share of the cycle, and flow as its derivative. `viewer/breathClock.ts` holds one shared clock advanced per frame by `BreathDriver`. React subscribes only to phase changes |
| Lung movement | `LungModel` scales the segments and the structures inside the lung about each lung's hilum by `1 + expansion × volume`. The trachea, larynx and vessels stay still |
| Airflow | `src/lungs/airflow.ts` builds one stream per segment from measured geometry: larynx → trachea, main, lobar and segmental centrelines → the segment's interior point. Particles move along centripetal Catmull–Rom curves with velocity ∝ flow (in on inspiration, out on expiration), coloured fresh or exhaled |
| Labels | Labels mode labels lobes (groups) and airways, not all 20 segments; a selected segment is always labelled |

## The real-tissue look

The lungs are drawn opaque and salmon-pink with grey mottling, the airways pale, and the vessels in their real colours; they turn see-through while breathing, in the lobe and segment views, and when an airway or vessel is picked. The lab draws tissue as it looks in a fresh specimen. `src/viewer/tissue.ts` and `src/viewer/Lighting.tsx` are the same files in the heart, lungs and brain labs.

- **Material.** `MeshPhysicalMaterial` with a clear coat (moist surface) and sheen (velvety tissue), plus a shader hook that:
  - reads the baked `_TISSUE` attribute;
  - darkens folds and grooves by ambient occlusion, including their reflections;
  - varies the colour with noise;
  - tints fat where the bake marked it;
  - adds a soft warm rim where the surface turns away, a cheap stand-in for light scattering under living tissue.
- **Lighting.** Image-based light from three's built-in `RoomEnvironment` (no download), a warm key, a soft back light and a fill. Neutral tone mapping keeps reds true.
- **Quality.**
  - **High:** draws the coat and sheen.
  - **Low:** leaves them out (a much cheaper shader).
  - **Choosing:** low is picked on software renderers and when animation frames stay above 50 ms. `?quality=high|low` overrides it.
- **Bake.** `tools/bake-shading.mjs` (config in `tools/bake.config.json`) writes `_TISSUE` into the model:
  - **r:** ambient occlusion, from 48 fixed rays per vertex through a `three-mesh-bvh` tree;
  - **g:** colour noise;
  - **b:** a fat mask.

  It is deterministic and updates the output hash in `provenance.json`. Run it after the extraction.

## Asset pipeline

```
HRA lung-female v1.4 GLB (official, 23 MB) ──────────────┐
                                                           ├─ tools/extract-lungs.mjs ─▶ tools/bake-shading.mjs ─▶ public/models/lungs.glb (68 nodes, 122k triangles, 3.3 MB)
HRA united-female v1.5 (via Female Atlas; y −0.7948 m) ───┘                              src/lungs/generated/geometry.json · provenance.json
```

The two sources were cross-checked: all 56 meshes they share differ by exactly the converter's translation, so the trachea, larynx, main bronchi and pulmonary vessels line up with the official lung.

**Source labelling defects, and how they are handled:**
- The inferior pulmonary vein names are swapped left/right. The extraction uses ids, checks every side by position, and fails on a mismatch.
- A heart artery is labelled as a pulmonary branch. It is excluded.
