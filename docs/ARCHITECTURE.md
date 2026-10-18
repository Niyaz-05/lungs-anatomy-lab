# Architecture

The lungs lab shares the heart lab's design: a validated, data-only **`SimulationDefinition`** rendered by a generic viewer. The code is a deliberate copy, not a shared package, so each lab deploys independently.

## Differences from the heart lab

| Area | Lungs |
|---|---|
| Contract | `kind: 'group'` with `members` (lobes and lungs are groups of segments). `side`, `lobe` and `code` (S1–S10 / B1–B10) on structures. `airRoute` in place of a blood-flow path. A `breathing` model whose assumptions must be listed |
| Validation | Groups may only list mesh structures, a `lobe` must be a group, and the breathing default must lie within its range, on top of the heart's checks |
| State | Modes `explore` / `breathe` / `tour`, `colourBy` (lobe / segment), breathing `rate` |
| Breathing | `src/lungs/breathing.ts` is pure maths: half-cosine volume over an inspiration share of the cycle, and flow as its derivative. `viewer/breathClock.ts` holds one shared clock advanced per frame by `BreathDriver`. React subscribes only to phase changes |
| Lung movement | `LungModel` scales the segments and the structures inside the lung about each lung's hilum by `1 + expansion × volume`. The trachea, larynx and vessels stay still |
| Airflow | `src/lungs/airflow.ts` builds one stream per segment from measured geometry: larynx → trachea, main, lobar and segmental centrelines → the segment's interior point. Particles move along centripetal Catmull–Rom curves with velocity ∝ flow (in on inspiration, out on expiration), coloured fresh or exhaled |
| Labels | Labels mode labels lobes (groups) and airways, not all 20 segments; a selected segment is always labelled |

## Asset pipeline

```
HRA lung-female v1.4 GLB (official, 23 MB) ──────────────┐
                                                           ├─ tools/extract-lungs.mjs ─▶ public/models/lungs.glb (68 nodes, 122k triangles, 3.1 MB)
HRA united-female v1.5 (via Female Atlas; y −0.7948 m) ───┘                              src/lungs/generated/geometry.json · provenance.json
```

The two sources were cross-checked: all 56 meshes they share differ by exactly the converter's translation, so the trachea, larynx, main bronchi and pulmonary vessels line up with the official lung.

**Source labelling defects, and how they are handled:**
- The inferior pulmonary vein names are swapped left/right. The extraction uses ids, checks every side by position, and fails on a mismatch.
- A heart artery is labelled as a pulmonary branch. It is excluded.
