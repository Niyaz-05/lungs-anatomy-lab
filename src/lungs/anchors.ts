import geometryJson from './generated/geometry.json';
import type { SimulationDefinition } from '../contract/schema';

export type Vec3 = [number, number, number];

interface G { centroid: number[]; bounds: number[][]; interiorPoint?: number[]; surfaceAnchor?: number[]; side: string; layer: string }
export const geometry = geometryJson.structures as Record<string, G>;

const vec = (p: number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** A point to hang a label on: inside a segment, on the structure's surface otherwise, the middle of a group. */
export function anchorOf(def: SimulationDefinition, id: string): Vec3 | null {
  const g = geometry[id];
  if (g) return vec(g.interiorPoint ?? g.surfaceAnchor ?? g.centroid);
  const s = def.structures.find((x) => x.id === id);
  if (s?.kind === 'group' && s.members) {
    const pts = s.members.map((m) => anchorOf(def, m)).filter((p): p is Vec3 => p !== null);
    if (!pts.length) return null;
    return [0, 1, 2].map((a) => pts.reduce((n, p) => n + p[a]!, 0) / pts.length) as Vec3;
  }
  return null;
}

/** Axis-aligned bounds of a set of structures (groups expand to their members). */
export function boundsOfIds(def: SimulationDefinition, ids: readonly string[]): [Vec3, Vec3] | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (id: string) => {
    const g = geometry[id];
    if (g) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!);
        hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!);
      }
      return;
    }
    def.structures.find((x) => x.id === id)?.members?.forEach(visit);
  };
  ids.forEach(visit);
  return Number.isFinite(lo[0]) ? [lo, hi] : null;
}

/** Bounds of the default view: the lung segments plus the trachea and larynx. */
export function homeBounds(def: SimulationDefinition): [Vec3, Vec3] {
  const ids = def.structures.filter((s) => s.kind === 'mesh' && (s.layer === 'segment' || s.layer === 'larynx' || s.id === 'trachea')).map((s) => s.id);
  return boundsOfIds(def, ids) ?? [[-0.15, -0.15, -0.15], [0.15, 0.15, 0.15]];
}

/** Centre of the hilum on each side: the pivot the lung segments expand about while breathing. */
export function hilumPivot(side: 'right' | 'left'): Vec3 {
  const g = geometry[`${side}-hilum`];
  if (!g) throw new Error(`no geometry for ${side}-hilum`);
  return vec(g.centroid);
}
