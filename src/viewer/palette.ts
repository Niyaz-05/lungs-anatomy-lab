import type { AnatomicalStructure } from '../contract/schema';
import type { ColourBy } from '../app/state';
import type { TissueLook } from './tissue';

/** Oxygen content of blood (textbook convention), used only for the small chips in the details. */
export const BLOOD = {
  'oxygen-poor': '#4a73c4',
  'oxygen-rich': '#c8443b',
} as const;

/** Airflow particle colours: fresh air coming in, exhaled air going out. */
export const AIR = { fresh: '#1f9bd1', exhaled: '#8a6fb3' } as const;

/** One hue per lobe; segments get shades of their lobe's hue (Colour by: Lobe / Segment). */
export const LOBE: Record<string, string> = {
  'right-upper-lobe': '#e58a6f',
  'right-middle-lobe': '#d9a03f',
  'right-lower-lobe': '#5fa68f',
  'left-upper-lobe': '#c27bb0',
  'left-lower-lobe': '#6c8fd0',
};

/**
 * Real-tissue looks: salmon-pink lung with grey mottling, pale cartilage-white airways, the
 * yellowish-white cartilage of the larynx, and vessel walls as they look in a specimen (pale
 * pulmonary arteries, dark purple-red pulmonary veins).
 */
const REAL: Record<string, TissueLook> = {
  segment: { color: '#d9958e', roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: '#ffd9d2', rim: 0.32, rimColor: '#ff8a7a', ao: 0.85, mottle: 0.6, mottleTint: '#5d5560' },
  airway: { color: '#e8d6c8', roughness: 0.5, clearcoat: 0.45, sheen: 0.3, rim: 0.18, ao: 0.7, mottle: 0.15, mottleTint: '#c9aa9a' },
  cartilage: { color: '#eee5d6', roughness: 0.42, clearcoat: 0.55, sheen: 0.2, rim: 0.12, ao: 0.7, mottle: 0.1 },
  larynx: { color: '#e6d9bf', roughness: 0.45, clearcoat: 0.5, sheen: 0.25, rim: 0.14, ao: 0.8, mottle: 0.15, mottleTint: '#c9b48e' },
  hilum: { color: '#b07a72', roughness: 0.55, clearcoat: 0.4, sheen: 0.35, rim: 0.2, ao: 0.8, mottle: 0.2 },
  'vessel-oxygen-poor': { color: '#b98a8c', roughness: 0.4, clearcoat: 0.6, sheen: 0.25, rim: 0.2, ao: 0.7, mottle: 0.12 },
  'vessel-oxygen-rich': { color: '#7a3446', roughness: 0.35, clearcoat: 0.7, sheen: 0.2, rim: 0.22, rimColor: '#c4506a', ao: 0.7, mottle: 0.12 },
};

export function realLook(s: AnatomicalStructure): TissueLook {
  if (s.layer === 'vessel') return REAL[s.blood === 'oxygen-rich' ? 'vessel-oxygen-rich' : 'vessel-oxygen-poor']!;
  return REAL[s.layer] ?? REAL.segment!;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Colour of a structure; lung tissue follows the "colour by" choice, everything else looks real. */
export function baseColour(s: AnatomicalStructure, colourBy: ColourBy): string {
  if (s.layer === 'segment' && colourBy !== 'real') {
    const lobe = s.kind === 'group' ? s.id : s.lobe;
    const hue = (lobe && LOBE[lobe]) ?? '#d99a8c';
    if (colourBy === 'lobe' || s.kind === 'group') return hue;
    const n = Number(s.code?.slice(1) ?? 1);
    // Neighbouring segment numbers alternate light and dark so adjacent segments stand apart.
    return shade(hue, ((n * 7) % 5) / 4 * 0.9 - 0.45);
  }
  return realLook(s).color;
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
