import { describe, expect, it } from 'vitest';
import { lungsDefinition as def } from '../../src/lungs/definition';
import { validateDefinition } from '../../src/contract/validate';
import { breathAt, timings } from '../../src/lungs/breathing';
import { buildAirStreams } from '../../src/lungs/airflow';
import geometry from '../../src/lungs/generated/geometry.json';

const byId = new Map(def.structures.map((s) => [s.id, s]));

describe('lungs definition', () => {
  it('passes schema and cross-reference validation with no warnings', () => {
    const r = validateDefinition(def);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('has a structure for every node in the model and a node for every mesh structure', () => {
    const nodes = Object.keys(geometry.structures);
    for (const n of nodes) expect(byId.has(n), n).toBe(true);
    for (const s of def.structures.filter((x) => x.kind === 'mesh')) expect(nodes, s.id).toContain(s.id);
  });

  it('gives the right lung three lobes and ten segments, the left two lobes and ten segments', () => {
    const lobes = (side: string) => def.structures.filter((s) => s.kind === 'group' && s.layer === 'segment' && s.side === side && !s.id.endsWith('-lung'));
    expect(lobes('right').map((l) => l.id)).toEqual(['right-upper-lobe', 'right-middle-lobe', 'right-lower-lobe']);
    expect(lobes('left').map((l) => l.id)).toEqual(['left-upper-lobe', 'left-lower-lobe']);
    expect(byId.get('right-lung')!.members).toHaveLength(10);
    expect(byId.get('left-lung')!.members).toHaveLength(10);
  });

  it('puts every segment in exactly one lobe, with its own segmental bronchus of the same number', () => {
    const segments = def.structures.filter((s) => s.kind === 'mesh' && s.layer === 'segment');
    expect(segments).toHaveLength(20);
    const lobes = def.structures.filter((s) => s.kind === 'group' && s.layer === 'segment' && !s.id.endsWith('-lung'));
    for (const seg of segments) {
      const owners = lobes.filter((l) => l.members!.includes(seg.id));
      expect(owners.map((o) => o.id), seg.id).toEqual([seg.lobe]);
      const bronchus = byId.get(seg.id.replace(/-segment$/, '-bronchus'))!;
      expect(bronchus.code, seg.id).toBe(seg.code!.replace('S', 'B'));
      expect(seg.related).toContain(bronchus.id);
    }
  });

  it('places every left/right structure on its own side of the model', () => {
    const g = geometry.structures as Record<string, { centroid: number[] }>;
    for (const s of def.structures.filter((x) => x.kind === 'mesh' && x.side !== 'midline')) {
      const x = g[s.id]!.centroid[0]!;
      expect(s.side === 'right' ? x < 0 : x > 0, `${s.id} x=${x}`).toBe(true);
    }
  });

  it('labels the pulmonary arteries oxygen-poor and the pulmonary veins oxygen-rich', () => {
    expect(byId.get('right-pulmonary-artery')!.blood).toBe('oxygen-poor');
    expect(byId.get('left-pulmonary-artery')!.blood).toBe('oxygen-poor');
    for (const v of ['right-superior', 'right-inferior', 'left-superior', 'left-inferior']) expect(byId.get(`${v}-pulmonary-vein`)!.blood).toBe('oxygen-rich');
  });

  it('keeps the default breathing rate within the cited resting range (12–18 per minute)', () => {
    expect(def.breathing.defaultRate).toBeGreaterThanOrEqual(12);
    expect(def.breathing.defaultRate).toBeLessThanOrEqual(18);
  });

  it('rejects an unknown asset, a bad lobe reference and nested groups', () => {
    const bad = structuredClone(def);
    bad.assets = [{ id: 'not-approved', role: 'anatomy-model' }];
    bad.structures.find((s) => s.id === 'right-apical-segment')!.lobe = 'trachea';
    bad.structures.find((s) => s.id === 'right-lung')!.members = ['right-upper-lobe', 'right-middle-lobe'];
    const codes = validateDefinition(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['asset.not-approved', 'ref.lobe', 'group.nested']));
  });
});

describe('breathing model', () => {
  const F = 1 / 3;

  it('is periodic and keeps volume within 0–1', () => {
    for (let t = 0; t < 8; t += 0.05) {
      const a = breathAt(t, 15, F), b = breathAt(t + 4, 15, F);
      expect(a.volume).toBeGreaterThanOrEqual(0);
      expect(a.volume).toBeLessThanOrEqual(1);
      expect(b.volume).toBeCloseTo(a.volume, 9);
    }
  });

  it('breathes in for the first third of each breath and out for the rest', () => {
    // 15 per minute: 4 s per breath, so in for 1.333 s and out for 2.667 s.
    expect(breathAt(0.5, 15, F).phase).toBe('inspiration');
    expect(breathAt(1.3, 15, F).phase).toBe('inspiration');
    expect(breathAt(1.4, 15, F).phase).toBe('expiration');
    expect(breathAt(3.9, 15, F).phase).toBe('expiration');
    const t = timings(15, F);
    expect(t.inspiration).toBeCloseTo(4 / 3, 9);
    expect(t.expiration).toBeCloseTo(8 / 3, 9);
  });

  it('has airflow inwards while breathing in and outwards while breathing out, zero at the turns', () => {
    expect(breathAt(0.6, 15, F).flow).toBeGreaterThan(0);
    expect(breathAt(2.5, 15, F).flow).toBeLessThan(0);
    expect(Math.abs(breathAt(0, 15, F).flow)).toBeLessThan(1e-9);
    expect(breathAt(4 / 3 - 1e-6, 15, F).volume).toBeCloseTo(1, 4);
    expect(breathAt(4 / 3, 15, F).flow).toBeCloseTo(0, 6);
  });

  it('rejects impossible settings', () => {
    expect(() => breathAt(1, 0, F)).toThrow();
    expect(() => breathAt(1, 15, 1.2)).toThrow();
  });
});

describe('airflow streams', () => {
  const streams = buildAirStreams();
  const g = geometry.structures as Record<string, { bounds: number[][] }>;
  const inside = (p: number[], id: string) => p.every((x, i) => x >= g[id]!.bounds[0]![i]! && x <= g[id]!.bounds[1]![i]!);

  it('builds one stream per segment', () => {
    expect(streams).toHaveLength(20);
    expect(new Set(streams.map((s) => s.segment)).size).toBe(20);
  });

  it('runs larynx → trachea → main → lobar → segmental bronchus → segment', () => {
    for (const s of streams) {
      const seg = def.structures.find((x) => x.id === s.segment)!;
      expect(s.through).toEqual(['larynx', 'trachea', `${s.side}-main-bronchus`, `${seg.lobe!.replace('-lobe', '')}-lobar-bronchus`, s.segment.replace('-segment', '-bronchus'), s.segment]);
    }
  });

  it('ends inside its own segment and on its own side', () => {
    for (const s of streams) {
      const end = s.points.at(-1)!;
      expect(inside(end, s.segment), s.segment).toBe(true);
      expect(s.side === 'right' ? end[0]! < 0 : end[0]! > 0, s.segment).toBe(true);
    }
  });

  it('starts above the larynx, outside the model, and only that leg is off-model', () => {
    for (const s of streams) {
      expect(s.offModel).toEqual({ from: 0, to: 1 });
      expect(s.points[0]![1]).toBeGreaterThan(g['epiglottis']!.bounds[1]![1]!);
      for (const p of s.points) for (const x of p) expect(Number.isFinite(x)).toBe(true);
    }
  });
});
