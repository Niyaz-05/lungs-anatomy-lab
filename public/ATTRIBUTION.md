# Attribution and asset provenance

## 3D lung model — `models/lungs.glb`

Built from the **HuBMAP Human Reference Atlas (HRA)** 3D reference organs by **Kristen Browne and Heidi Schlehlein** (and HRA contributors), licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). HuBMAP has not reviewed or endorsed this lab.

### Sources

1. **3D Reference Organ for Lung, Female, v1.4.** DOI https://doi.org/10.48539/HBM994.HXJP.575
   - File: `3d-vh-f-lung.glb` from `https://cdn.humanatlas.io/digital-objects/ref-organ/lung-female/v1.4/assets/3d-vh-f-lung.glb`
   - 23,255,188 bytes, sha256 `101f48ec64f2ed762fde03fc1193eaae583a0d35c47b72a9ca007d72eefb5f71`
   - Provides the 20 bronchopulmonary segments, the hilum, and the lobar and segmental bronchi with their cartilage.
   - According to its dataset page, it is based on the Visible Human Dataset (U.S. National Library of Medicine; Spitzer & Whitlock).
2. **3D Reference Organ Set for Female v1.5 (HRA united female).** DOI https://doi.org/10.48539/HBM352.BTSQ.586
   - Taken as converted by *Female Atlas* (github.com/Niyaz-05/female-atlas, MIT code, commit `4c2dfcca02739b59827601915128ee64abdff2ea`).
   - Provides the larynx cartilages, trachea and tracheal cartilage, carina, main bronchi with their cartilage, pulmonary trunk, pulmonary arteries and pulmonary veins.
   - These were removed from the lung organ in its v1.3. The converter's +0.794760942 m vertical translation is reversed here. All 56 meshes the two sources share differ by exactly that translation.

### Changes made (as CC BY 4.0 requires)

`tools/extract-lungs.mjs`:

- selected the meshes listed in `src/lungs/source/structures.source.json`;
- welded coincident vertices and recomputed smooth normals;
- simplified each mesh with meshoptimizer within a 0.2 % relative error bound (331,350 → 122,199 triangles);
- merged the meshes into 68 structures;
- translated the model so the centre of the lung segments is the origin.

Some source mesh *names* were corrected to match their position. The pulmonary vein names are swapped left/right in the source, and a heart artery labelled as a pulmonary branch was excluded.

Output `lungs.glb` has sha256 `d8a8a24c0ce28780564e4ad773b6357ee12e39b8c78d48260f3de38bbf409cf7`. The full record is in `src/lungs/generated/provenance.json`.

## Explanatory text

Written for this project and checked against the sources cited in the lab. No source text is reproduced.

## Software

React, three.js, @react-three/fiber, @react-three/drei and zod (all MIT), each under its own licence.
