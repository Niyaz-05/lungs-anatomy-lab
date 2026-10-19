#!/usr/bin/env node
/**
 * Bake per-vertex shading data into the lab's model, for the real-tissue look.
 *
 *   node tools/bake-shading.mjs            (reads tools/bake.config.json)
 *
 * Adds one glTF attribute, _TISSUE (VEC4, normalised UNSIGNED_BYTE), to every primitive:
 *   r  ambient occlusion: 1 = open surface, 0 = deep in a fold (rays cast over the hemisphere
 *      around the normal against the meshes listed for that layer in `occluders`)
 *   g  mottling: smooth 3D value noise, so tissue is not one flat colour
 *   b  fat: closeness to the `fat.sourceLayers` meshes, in grooves (e.g. epicardial fat along the
 *      coronary vessels)
 *   a  unused (1)
 * Deterministic: fixed ray directions, no randomness. Re-running on a baked model strips the old
 * _TISSUE first, so the output is the same. Updates the output size and sha256 in provenance.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'tools/bake.config.json'), 'utf8'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const modelPath = path.join(root, config.model);
const provenancePath = path.join(root, config.provenance);

const io = new NodeIO();
const doc = await io.readBinary(new Uint8Array(fs.readFileSync(modelPath)));

// ── Collect meshes in world space ───────────────────────────────────────────
const items = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const layer = node.getExtras()?.layer;
  if (typeof layer !== 'string') throw new Error(`node "${node.getName()}" has no extras.layer`);
  const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (const prim of mesh.listPrimitives()) {
    const old = prim.getAttribute('_TISSUE');
    if (old) { prim.setAttribute('_TISSUE', null); old.dispose(); }
    const pos = prim.getAttribute('POSITION').getArray();
    const nor = prim.getAttribute('NORMAL').getArray();
    const idx = prim.getIndices().getArray();
    const wp = new Float32Array(pos.length), wn = new Float32Array(nor.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m); wp.set([v.x, v.y, v.z], i);
      v.set(nor[i], nor[i + 1], nor[i + 2]).applyMatrix3(nm).normalize(); wn.set([v.x, v.y, v.z], i);
    }
    items.push({ name: node.getName(), layer, prim, positions: wp, normals: wn, indices: idx });
  }
}
const known = new Set(items.map((i) => i.layer));
for (const [layer, list] of Object.entries(config.occluders)) {
  if (!known.has(layer)) throw new Error(`bake.config: unknown layer "${layer}"`);
  for (const l of list) if (!known.has(l)) throw new Error(`bake.config: unknown occluder layer "${l}" for ${layer}`);
}
for (const l of known) if (!(l in config.occluders)) throw new Error(`bake.config: no occluders listed for layer "${l}"`);

// ── One BVH per occluder set ────────────────────────────────────────────────
const bvhCache = new Map();
function bvhFor(layers) {
  const key = [...layers].sort().join('|');
  if (!key) return null;
  if (!bvhCache.has(key)) {
    const parts = items.filter((i) => layers.includes(i.layer));
    const vCount = parts.reduce((n, p) => n + p.positions.length / 3, 0);
    const pos = new Float32Array(vCount * 3), idx = new Uint32Array(parts.reduce((n, p) => n + p.indices.length, 0));
    let vo = 0, io2 = 0;
    for (const p of parts) {
      pos.set(p.positions, vo * 3);
      for (let k = 0; k < p.indices.length; k++) idx[io2 + k] = p.indices[k] + vo;
      vo += p.positions.length / 3; io2 += p.indices.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    bvhCache.set(key, new MeshBVH(g));
  }
  return bvhCache.get(key);
}

// Fixed, evenly spread ray directions (Fibonacci sphere); each vertex uses those in its hemisphere.
const RAYS = config.rays ?? 48;
const dirs = [];
for (let i = 0; i < RAYS; i++) {
  const y = 1 - (2 * (i + 0.5)) / RAYS, r = Math.sqrt(1 - y * y), phi = i * Math.PI * (3 - Math.sqrt(5));
  dirs.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
}

// ── Noise ───────────────────────────────────────────────────────────────────
function hash(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const fx = s(x - xi), fy = s(y - yi), fz = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}
const F = config.noiseFrequency ?? 150;
const mottle = (x, y, z) => 0.65 * valueNoise(x * F, y * F, z * F) + 0.35 * valueNoise(x * F * 2.7 + 17, y * F * 2.7 + 5, z * F * 2.7 + 11);

// ── Fat proximity (spatial grid over the source meshes) ─────────────────────
let fatGrid = null;
const fat = config.fat;
if (fat) {
  const C = fat.far;
  fatGrid = new Map();
  for (const it of items.filter((i) => fat.sourceLayers.includes(i.layer))) {
    for (let k = 0; k < it.positions.length; k += 3) {
      const key = `${Math.floor(it.positions[k] / C)},${Math.floor(it.positions[k + 1] / C)},${Math.floor(it.positions[k + 2] / C)}`;
      (fatGrid.get(key) ?? fatGrid.set(key, []).get(key)).push(it.positions[k], it.positions[k + 1], it.positions[k + 2]);
    }
  }
}
function fatAt(x, y, z) {
  const C = fat.far;
  const [gx, gy, gz] = [Math.floor(x / C), Math.floor(y / C), Math.floor(z / C)];
  let best = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const c = fatGrid.get(`${gx + i},${gy + j},${gz + k}`);
    if (!c) continue;
    for (let q = 0; q < c.length; q += 3) best = Math.min(best, (c[q] - x) ** 2 + (c[q + 1] - y) ** 2 + (c[q + 2] - z) ** 2);
  }
  const d = Math.sqrt(best);
  const t = Math.min(1, Math.max(0, (fat.far - d) / (fat.far - fat.near)));
  // Fat follows the vessels as a band, slightly uneven.
  return t * t * (3 - 2 * t) * (0.8 + 0.2 * valueNoise(x * F * 1.5 + 3, y * F * 1.5 + 7, z * F * 1.5 + 1));
}

// ── Bake ────────────────────────────────────────────────────────────────────
const ray = new THREE.Ray();
const o = new THREE.Vector3(), n = new THREE.Vector3();
const EPS = config.rayOffset ?? 0.0003;
const D = config.aoDistance;
const stats = {};
let vertices = 0;
const t0 = Date.now();
for (const it of items) {
  const bvh = bvhFor(config.occluders[it.layer]);
  const count = it.positions.length / 3;
  const data = new Uint8Array(count * 4);
  let aoSum = 0;
  for (let v = 0; v < count; v++) {
    const [x, y, z] = [it.positions[v * 3], it.positions[v * 3 + 1], it.positions[v * 3 + 2]];
    n.set(it.normals[v * 3], it.normals[v * 3 + 1], it.normals[v * 3 + 2]);
    let ao = 1;
    if (bvh) {
      let occ = 0, wsum = 0;
      o.set(x, y, z).addScaledVector(n, EPS);
      for (const d of dirs) {
        const c = d.dot(n);
        if (c <= 0.05) continue;
        ray.set(o, d);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, D);
        if (hit) occ += c * (1 - hit.distance / D);
        wsum += c;
      }
      ao = wsum > 0 ? 1 - occ / wsum : 1;
    }
    aoSum += ao;
    // Fat sits in the grooves along the vessels: near a vessel and in a concave (occluded) spot.
    const groove = Math.min(1, Math.max(0, (0.93 - ao) / 0.25));
    const f = fat && fat.tissueLayers.includes(it.layer) ? fatAt(x, y, z) * groove : 0;
    data[v * 4] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
    data[v * 4 + 1] = Math.round(mottle(x, y, z) * 255);
    data[v * 4 + 2] = Math.round(f * 255);
    data[v * 4 + 3] = 255;
  }
  vertices += count;
  const acc = doc.createAccessor(`${it.name}_tissue`).setType('VEC4').setArray(data).setNormalized(true)
    .setBuffer(doc.getRoot().listBuffers()[0]);
  it.prim.setAttribute('_TISSUE', acc);
  stats[it.layer] ??= { meshes: 0, meanAO: 0, vertices: 0 };
  stats[it.layer].meshes++;
  stats[it.layer].vertices += count;
  stats[it.layer].meanAO += aoSum;
}
for (const s of Object.values(stats)) s.meanAO = Math.round((s.meanAO / s.vertices) * 1000) / 1000;

const glb = await io.writeBinary(doc);
fs.writeFileSync(modelPath, glb);

const prov = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
const unbaked = prov.shadingBake?.unbakedSha256 && prov.shadingBake.unbakedOutput ? prov.shadingBake : null;
prov.shadingBake = {
  tool: 'tools/bake-shading.mjs',
  config: { ...config },
  attribute: '_TISSUE (VEC4 unsigned byte, normalised): r ambient occlusion, g mottling noise, b fat proximity, a unused',
  unbakedSha256: unbaked ? unbaked.unbakedSha256 : prov.output.sha256,
  unbakedOutput: unbaked ? unbaked.unbakedOutput : { bytes: prov.output.bytes },
  vertices,
  layers: stats,
};
prov.output = { ...prov.output, bytes: glb.byteLength, sha256: sha256(glb) };
fs.writeFileSync(provenancePath, JSON.stringify(prov, null, 2) + '\n');
console.log(JSON.stringify({ vertices, bytes: glb.byteLength, sha256: sha256(glb), seconds: (Date.now() - t0) / 1000, layers: stats }, null, 2));
