#!/usr/bin/env node
/**
 * Checks public/models/lungs.glb against its provenance and geometry records:
 * file hash, node set, finite positions, unit normals, in-range indices, sane bounds and the
 * attribution file. Exits non-zero on any failure so it can gate builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (msg) => problems.push(msg);

const glbPath = path.join(root, 'public/models/lungs.glb');
const glb = fs.readFileSync(glbPath);
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'src/lungs/generated/provenance.json'), 'utf8'));
const geometry = JSON.parse(fs.readFileSync(path.join(root, 'src/lungs/generated/geometry.json'), 'utf8'));

const hash = crypto.createHash('sha256').update(glb).digest('hex');
if (hash !== provenance.output.sha256) fail(`lungs.glb sha256 ${hash} does not match provenance ${provenance.output.sha256}`);

const doc = await new NodeIO().readBinary(new Uint8Array(glb));
const nodes = doc.getRoot().listNodes();
const names = nodes.map((n) => n.getName());
const expected = Object.keys(geometry.structures);
for (const id of expected) if (!names.includes(id)) fail(`node "${id}" missing from lungs.glb`);
for (const n of names) if (!expected.includes(n)) fail(`unexpected node "${n}" in lungs.glb`);
if (new Set(names).size !== names.length) fail('duplicate node names in lungs.glb');

let triangles = 0;
for (const node of nodes) {
  const id = node.getName();
  const mesh = node.getMesh();
  if (!mesh) { fail(`${id}: node has no mesh`); continue; }
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')?.getArray();
    const nor = prim.getAttribute('NORMAL')?.getArray();
    const idx = prim.getIndices()?.getArray();
    if (!pos || !nor || !idx) { fail(`${id}: missing POSITION, NORMAL or indices`); continue; }
    if (pos.length !== nor.length) fail(`${id}: ${pos.length / 3} positions but ${nor.length / 3} normals`);
    for (let i = 0; i < pos.length; i++) {
      if (!Number.isFinite(pos[i])) { fail(`${id}: non-finite position at ${i}`); break; }
      // The whole extract fits in a 70 cm cube around the lung centre.
      if (Math.abs(pos[i]) > 0.35) { fail(`${id}: position ${pos[i]} outside the expected 0.35 m range`); break; }
    }
    for (let i = 0; i < nor.length; i += 3) {
      const len = Math.hypot(nor[i], nor[i + 1], nor[i + 2]);
      if (Math.abs(len - 1) > 1e-3) { fail(`${id}: normal ${i / 3} has length ${len}`); break; }
    }
    const vCount = pos.length / 3;
    for (const i of idx) if (i >= vCount) { fail(`${id}: index ${i} >= vertex count ${vCount}`); break; }
    if (idx.length % 3) fail(`${id}: index count ${idx.length} not divisible by 3`);
    const tissue = prim.getAttribute('_TISSUE');
    if (!tissue) fail(`${id}: no baked _TISSUE shading attribute (run tools/bake-shading.mjs)`);
    else if (tissue.getCount() !== pos.length / 3 || tissue.getElementSize() !== 4 || !tissue.getNormalized()) fail(`${id}: _TISSUE must be normalised VEC4, one per vertex`);
    triangles += idx.length / 3;
    const recorded = geometry.structures[id];
    if (recorded && recorded.triangleCount !== idx.length / 3) fail(`${id}: ${idx.length / 3} triangles, geometry.json says ${recorded.triangleCount}`);
  }
}

const attribution = path.join(root, 'public/ATTRIBUTION.md');
if (!fs.existsSync(attribution)) fail('public/ATTRIBUTION.md is missing');
else {
  const text = fs.readFileSync(attribution, 'utf8');
  for (const needle of ['HuBMAP', 'Kristen Browne', '10.48539/HBM994.HXJP.575', '10.48539/HBM352.BTSQ.586', 'CC BY 4.0', provenance.output.sha256, provenance.sources.lung.sha256]) {
    if (!text.includes(needle)) fail(`public/ATTRIBUTION.md does not mention "${needle}"`);
  }
}

if (problems.length) {
  console.error(`Asset validation FAILED (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Asset validation passed: ${names.length} nodes, ${triangles} triangles, sha256 ${hash.slice(0, 12)}…`);
