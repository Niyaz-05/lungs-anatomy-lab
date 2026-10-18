#!/usr/bin/env node
/**
 * Build public/models/lungs.glb from HuBMAP HRA sources.
 *
 *   node tools/extract-lungs.mjs <official lung GLB> <repo3 female atlas models dir>
 *
 *   <official lung GLB>  3d-vh-f-lung.glb, HRA "3D Reference Organ for Lung, Female" v1.4
 *   <models dir>         repo3-female-atlas/public/models (atlas.json + *.bin): HRA united-female
 *                        v1.5 converted with a +0.794760942 m y translation, which is reversed here.
 *
 * Per mesh: weld coincident vertices, recompute smooth normals, simplify with meshoptimizer
 * within a 0.2 % relative error bound, then merge into one node per structure (structures.source.json).
 * Writes public/models/lungs.glb, src/lungs/generated/geometry.json and provenance.json.
 * Fails loudly on a missing node, non-finite data, or a structure on the wrong side.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [lungPath, modelsDir] = process.argv.slice(2);
if (!lungPath || !modelsDir) {
  console.error('Usage: node tools/extract-lungs.mjs <3d-vh-f-lung.glb> <repo3 public/models dir>');
  process.exit(2);
}
await MeshoptSimplifier.ready;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/lungs/source/structures.source.json'), 'utf8'));
const SHIFT = spec.unitedYShift;
const MAX_ERROR = 0.002;

// ── Sources ────────────────────────────────────────────────────────────────
const lungBytes = fs.readFileSync(lungPath);
const lungDoc = await new NodeIO().readBinary(new Uint8Array(lungBytes));
const lungNodes = new Map(lungDoc.getRoot().listNodes().map((n) => [n.getName(), n]));

const atlasBytes = fs.readFileSync(path.join(modelsDir, 'atlas.json'));
const atlas = JSON.parse(atlasBytes.toString('utf8'));
const unitedParts = new Map(atlas.parts.map((p) => [p.id, p]));
const chunkCache = new Map();
const chunkHashes = {};
function chunk(i) {
  if (!chunkCache.has(i)) {
    const file = path.join(modelsDir, atlas.chunks[i].url.split('/').pop());
    const buf = fs.readFileSync(file);
    chunkCache.set(i, buf);
    chunkHashes[path.basename(file)] = sha256(buf);
  }
  return chunkCache.get(i);
}

/** Raw positions and indices of one source node, in the official lung's coordinate frame. */
function readSource(source, name) {
  if (source === 'lung') {
    const node = lungNodes.get(name);
    const mesh = node?.getMesh();
    if (!mesh) throw new Error(`lung GLB: node "${name}" missing or has no mesh`);
    const world = node.getWorldMatrix();
    const positions = [], indices = [];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
      const base = positions.length / 3;
      for (let i = 0; i < pos.length; i += 3) {
        const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
        positions.push(
          world[0] * x + world[4] * y + world[8] * z + world[12],
          world[1] * x + world[5] * y + world[9] * z + world[13],
          world[2] * x + world[6] * y + world[10] * z + world[14],
        );
      }
      for (const i of idx) indices.push(i + base);
    }
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
  }
  const p = unitedParts.get(name);
  if (!p) throw new Error(`united atlas: part "${name}" missing`);
  const b = chunk(p.chunk);
  const positions = new Float32Array(b.buffer.slice(b.byteOffset + p.positions, b.byteOffset + p.positions + p.vertexCount * 12));
  const indices = new Uint32Array(b.buffer.slice(b.byteOffset + p.indices, b.byteOffset + p.indices + p.indexCount * 4));
  for (let i = 1; i < positions.length; i += 3) positions[i] -= SHIFT;
  return { positions, indices };
}

// ── Mesh clean-up ───────────────────────────────────────────────────────────
function weld(positions, indices) {
  const map = new Map(), remap = new Uint32Array(positions.length / 3), out = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const key = `${Math.round(positions[i * 3] * 1e6)},${Math.round(positions[i * 3 + 1] * 1e6)},${Math.round(positions[i * 3 + 2] * 1e6)}`;
    let k = map.get(key);
    if (k === undefined) { k = out.length / 3; map.set(key, k); out.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); }
    remap[i] = k;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c); // drop degenerate triangles
  }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(idx) };
}

function smoothNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; // area-weighted
    for (const v of [a, b, c]) { n[v] += f[0]; n[v + 1] += f[1]; n[v + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 0) { n[i] /= len; n[i + 1] /= len; n[i + 2] /= len; } else { n[i + 1] = 1; }
  }
  return n;
}

function simplify(positions, indices) {
  const target = Math.max(96, Math.floor((indices.length * 0.25) / 3) * 3);
  const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, MAX_ERROR);
  const used = new Map(), pos = [];
  const idx = new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    const v = simplified[i];
    let k = used.get(v);
    if (k === undefined) { k = pos.length / 3; used.set(v, k); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[i] = k;
  }
  return { positions: Float32Array.from(pos), indices: idx, error };
}

// ── Build structures ────────────────────────────────────────────────────────
const meshes = [];
let sourceTriangles = 0, maxError = 0;
for (const s of spec.structures) {
  const pieces = s.nodes.map((name) => {
    const raw = readSource(s.source, name);
    for (const v of raw.positions) if (!Number.isFinite(v)) throw new Error(`${name}: non-finite position`);
    for (const i of raw.indices) if (i >= raw.positions.length / 3) throw new Error(`${name}: index out of range`);
    sourceTriangles += raw.indices.length / 3;
    const welded = weld(raw.positions, raw.indices);
    const simple = simplify(welded.positions, welded.indices);
    maxError = Math.max(maxError, simple.error);
    return simple;
  });
  const vCount = pieces.reduce((n, p) => n + p.positions.length / 3, 0);
  const positions = new Float32Array(vCount * 3), indices = new Uint32Array(pieces.reduce((n, p) => n + p.indices.length, 0));
  let vo = 0, io = 0;
  for (const p of pieces) {
    positions.set(p.positions, vo * 3);
    for (let k = 0; k < p.indices.length; k++) indices[io + k] = p.indices[k] + vo;
    vo += p.positions.length / 3; io += p.indices.length;
  }
  meshes.push({ structure: s, positions, indices });
}

// Centre on the lung tissue (segments), so the larynx and vessels do not move the pivot.
const bboxOf = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  return [lo, hi];
};
const segBoxes = meshes.filter((m) => m.structure.layer === 'segment').map((m) => bboxOf(m.positions));
const centre = [0, 1, 2].map((a) => (Math.min(...segBoxes.map((b) => b[0][a])) + Math.max(...segBoxes.map((b) => b[1][a]))) / 2);
for (const m of meshes) {
  for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) m.positions[i + a] -= centre[a];
  m.normals = smoothNormals(m.positions, m.indices);
}

// ── Geometry facts ──────────────────────────────────────────────────────────
function centroid(pos) {
  const c = [0, 0, 0], n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) c[a] += pos[i + a] / n;
  return c;
}
function covariance(pos, c) {
  const m = new Array(9).fill(0), n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - c[0], pos[i + 1] - c[1], pos[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[r * 3 + k] += (d[r] * d[k]) / n;
  }
  return m;
}
function principalAxis(m) {
  let v = [1, 0.5, 0.25];
  for (let it = 0; it < 100; it++) {
    const w = [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
    const len = Math.hypot(...w); v = w.map((x) => x / len);
  }
  return v;
}
function crossings(pos, idx, o, d) {
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-14) continue;
    const s = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 0) n++;
  }
  return n;
}
const DIRS = [[1, 0.0013, 0.0007], [0.0011, 1, 0.0017], [0.0009, 0.0015, 1]];
const inside = (pos, idx, p) => DIRS.filter((d) => crossings(pos, idx, p, d) % 2 === 1).length >= 2;
function interiorPoint(pos, idx) {
  const [lo, hi] = bboxOf(pos);
  const N = 11;
  let best = null, bestDist = -1;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) for (let k = 1; k < N; k++) {
    const p = [lo[0] + ((hi[0] - lo[0]) * i) / N, lo[1] + ((hi[1] - lo[1]) * j) / N, lo[2] + ((hi[2] - lo[2]) * k) / N];
    let dmin = Infinity;
    for (let v = 0; v < pos.length; v += 3) dmin = Math.min(dmin, Math.hypot(pos[v] - p[0], pos[v + 1] - p[1], pos[v + 2] - p[2]));
    if (dmin <= bestDist || !inside(pos, idx, p)) continue;
    best = p; bestDist = dmin;
  }
  return best ? { point: best, clearance: bestDist } : null;
}
function centreline(pos, c, axis, slices = 6) {
  const proj = [];
  for (let v = 0; v < pos.length; v += 3) proj.push((pos[v] - c[0]) * axis[0] + (pos[v + 1] - c[1]) * axis[1] + (pos[v + 2] - c[2]) * axis[2]);
  let min = Infinity, max = -Infinity;
  for (const t of proj) { if (t < min) min = t; if (t > max) max = t; }
  const pts = [];
  for (let s = 0; s < slices; s++) {
    const a = min + ((max - min) * s) / slices, b = min + ((max - min) * (s + 1)) / slices;
    const acc = [0, 0, 0]; let n = 0;
    proj.forEach((t, i) => { if (t >= a && t <= b) { acc[0] += pos[i * 3]; acc[1] += pos[i * 3 + 1]; acc[2] += pos[i * 3 + 2]; n++; } });
    if (n) pts.push(acc.map((x) => x / n));
  }
  return pts;
}

const geometry = {};
const sideErrors = [];
for (const m of meshes) {
  const s = m.structure;
  const [lo, hi] = bboxOf(m.positions);
  const c = centroid(m.positions);
  const axis = principalAxis(covariance(m.positions, c));
  // Side check: the source mislabels some left/right names, so position decides.
  if (s.side === 'right' && !(c[0] < 0)) sideErrors.push(`${s.id} claims right but centroid x = ${c[0].toFixed(4)}`);
  if (s.side === 'left' && !(c[0] > 0)) sideErrors.push(`${s.id} claims left but centroid x = ${c[0].toFixed(4)}`);
  let nearest = 0, nearestD = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]);
    if (d < nearestD) { nearestD = d; nearest = i; }
  }
  const entry = {
    layer: s.layer,
    side: s.side,
    bounds: [lo.map(r6), hi.map(r6)],
    centroid: c.map(r6),
    principalAxis: axis.map(r6),
    surfaceAnchor: [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6),
    vertexCount: m.positions.length / 3,
    triangleCount: m.indices.length / 3,
  };
  if (s.layer === 'segment') {
    const ip = interiorPoint(m.positions, m.indices);
    if (!ip) throw new Error(`${s.id}: no interior point found; is the segment mesh closed?`);
    entry.interiorPoint = ip.point.map(r6);
    entry.interiorClearance = r6(ip.clearance);
  }
  if (s.layer === 'airway' || s.layer === 'vessel') entry.centreline = centreline(m.positions, c, axis).map((p) => p.map(r6));
  geometry[s.id] = entry;
}
if (sideErrors.length) throw new Error(`Side checks failed:\n${sideErrors.join('\n')}`);

const g = (id) => geometry[id];
const checks = {
  tracheaAboveCarina: g('trachea').centroid[1] > g('carina').centroid[1],
  larynxAboveTrachea: g('cricoid-cartilage').centroid[1] > g('trachea').bounds[1][1] - 0.01,
  upperLobeAboveLower: g('right-apical-segment').centroid[1] > g('right-posterior-basal-segment').centroid[1],
  anteriorSegmentInFront: g('right-anterior-segment').centroid[2] > g('right-posterior-segment').centroid[2],
  middleLobeOnRight: g('right-medial-segment').centroid[0] < 0,
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) throw new Error(`Orientation checks failed: ${failed.join(', ')}`);

// ── Write ───────────────────────────────────────────────────────────────────
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('lungs');
for (const m of meshes) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.indices).setBuffer(buffer));
  const node = doc.createNode(m.structure.id).setMesh(doc.createMesh(m.structure.id).addPrimitive(prim))
    .setExtras({ layer: m.structure.layer, source: m.structure.source, nodes: m.structure.nodes });
  scene.addChild(node);
}
doc.getRoot().getAsset().generator = 'lungs-anatomy-lab tools/extract-lungs.mjs';
doc.getRoot().getAsset().copyright = 'HuBMAP Human Reference Atlas 3D reference organs (Browne, Schlehlein et al.), CC BY 4.0';
const outGlb = path.join(root, 'public/models/lungs.glb');
fs.mkdirSync(path.dirname(outGlb), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
fs.writeFileSync(outGlb, glb);

let repo3Commit = null;
try { repo3Commit = execFileSync('git', ['-C', path.resolve(modelsDir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }

const genDir = path.join(root, 'src/lungs/generated');
fs.mkdirSync(genDir, { recursive: true });
fs.writeFileSync(path.join(genDir, 'geometry.json'), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 2) + '\n');
const triangles = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
fs.writeFileSync(path.join(genDir, 'provenance.json'), JSON.stringify({
  output: { file: 'public/models/lungs.glb', bytes: glb.byteLength, sha256: sha256(glb), triangles, sourceTriangles },
  sources: {
    lung: {
      name: '3D Reference Organ for Lung, Female, v1.4 (HuBMAP Human Reference Atlas)',
      creators: 'Kristen Browne, Heidi Schlehlein',
      doi: 'https://doi.org/10.48539/HBM994.HXJP.575',
      license: 'CC-BY-4.0',
      url: 'https://cdn.humanatlas.io/digital-objects/ref-organ/lung-female/v1.4/assets/3d-vh-f-lung.glb',
      bytes: lungBytes.byteLength,
      sha256: sha256(lungBytes),
      basedOn: 'Visible Human Dataset, U.S. National Library of Medicine (Spitzer & Whitlock 1998)',
    },
    united: {
      name: '3D Reference Organ Set for Female v1.5 (HuBMAP HRA united female), as converted by Female Atlas',
      creators: 'Kristen Browne, Heidi Schlehlein',
      doi: 'https://doi.org/10.48539/HBM352.BTSQ.586',
      license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/female-atlas (MIT code), commit ' + repo3Commit,
      atlasJsonSha256: sha256(atlasBytes),
      chunkSha256: chunkHashes,
      transformReversed: `y - ${SHIFT} m (verified: all 56 shared lung meshes differ from the official file by exactly this translation)`,
    },
  },
  changesHere: `Selected the nodes in src/lungs/source/structures.source.json; welded coincident vertices; recomputed smooth normals; simplified each mesh with meshoptimizer within a ${MAX_ERROR * 100} % relative error bound (largest error used: ${(maxError * 100).toFixed(3)} %); merged into one node per structure; translated so the centre of the lung segments is the origin.`,
  centreOffsetMetres: centre.map(r6),
  orientationChecks: checks,
  structures: spec.structures.map((s) => ({ id: s.id, source: s.source, nodes: s.nodes })),
}, null, 2) + '\n');

console.log(JSON.stringify({ structures: meshes.length, sourceTriangles, triangles, bytes: glb.byteLength, maxErrorPct: r6(maxError * 100), checks }, null, 2));
