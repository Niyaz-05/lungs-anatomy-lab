/**
 * Airflow streams built from measured model geometry: one stream per bronchopulmonary segment,
 * running outside air → larynx → trachea → main bronchus → lobar bronchus → segmental bronchus →
 * a point inside the segment (where the bronchioles and alveoli, too small to model, would be).
 * Only the short entry leg above the larynx is off the model.
 */
import geometryJson from './generated/geometry.json';
import source from './source/structures.source.json';

export type Vec3 = [number, number, number];

interface G { centroid: number[]; bounds: number[][]; interiorPoint?: number[]; centreline?: number[][] }
const geometry = geometryJson.structures as Record<string, G>;

interface SourceEntry { id: string; layer: string; side: string; lobe?: string; supplies?: string }
const entries = source.structures as SourceEntry[];

export interface AirStream {
  /** The segment this stream ventilates. */
  segment: string;
  side: 'right' | 'left';
  points: Vec3[];
  /** Structures passed through, in order. */
  through: string[];
  /** Index range of `points` that is off the model (outside air). */
  offModel: { from: number; to: number };
}

const g = (id: string) => {
  const s = geometry[id];
  if (!s) throw new Error(`airflow: no geometry for "${id}"`);
  return s;
};
const v = (p: number[] | undefined, what: string): Vec3 => {
  if (!p || p.length !== 3) throw new Error(`airflow: missing ${what}`);
  return [p[0]!, p[1]!, p[2]!];
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Centreline of an airway, ordered so it starts at the end nearest `from`. */
function airway(id: string, from: Vec3): Vec3[] {
  const line = (g(id).centreline ?? []).map((p, i) => v(p, `${id} centreline ${i}`));
  if (line.length < 2) throw new Error(`airflow: ${id} has no centreline`);
  return dist(line[0]!, from) <= dist(line[line.length - 1]!, from) ? line : [...line].reverse();
}

const LOBAR: Record<string, string> = {
  'right-upper-lobe': 'right-upper-lobar-bronchus',
  'right-middle-lobe': 'right-middle-lobar-bronchus',
  'right-lower-lobe': 'right-lower-lobar-bronchus',
  'left-upper-lobe': 'left-upper-lobar-bronchus',
  'left-lower-lobe': 'left-lower-lobar-bronchus',
};

export function buildAirStreams(): AirStream[] {
  const larynx = v(g('cricoid-cartilage').centroid, 'cricoid centroid');
  const top = v(g('epiglottis').bounds[1], 'epiglottis top');
  const outside: Vec3 = [larynx[0], top[1] + 0.02, larynx[2]];
  const trachea = airway('trachea', larynx);
  const tracheaEnd = trachea[trachea.length - 1]!;

  return entries
    .filter((e) => e.layer === 'airway' && e.supplies)
    .map((bronchus) => {
      const side = bronchus.side as 'right' | 'left';
      const main = airway(`${side}-main-bronchus`, tracheaEnd);
      const lobarId = LOBAR[bronchus.lobe ?? ''];
      if (!lobarId) throw new Error(`airflow: no lobar bronchus for ${bronchus.id}`);
      const lobar = airway(lobarId, main[main.length - 1]!);
      const segmental = airway(bronchus.id, lobar[lobar.length - 1]!);
      const segment = bronchus.supplies!;
      const target = v(g(segment).interiorPoint, `${segment} interior point`);
      const points: Vec3[] = [outside, larynx, ...trachea, ...main, ...lobar, ...segmental, target];
      return {
        segment,
        side,
        points,
        through: ['larynx', 'trachea', `${side}-main-bronchus`, lobarId, bronchus.id, segment],
        offModel: { from: 0, to: 1 },
      };
    });
}
