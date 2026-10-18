import type { AnatomicalStructure } from '../contract/schema';
import type { ColourBy } from '../app/state';

/** Oxygen content of blood in the pulmonary vessels (textbook blue / red convention). */
export const BLOOD = {
  'oxygen-poor': '#4a73c4',
  'oxygen-rich': '#c8443b',
} as const;

/** Airflow particle colours: fresh air coming in, exhaled air going out. */
export const AIR = { fresh: '#1f9bd1', exhaled: '#8a6fb3' } as const;

/** One hue per lobe; segments get shades of their lobe's hue. */
export const LOBE: Record<string, string> = {
  'right-upper-lobe': '#e58a6f',
  'right-middle-lobe': '#d9a03f',
  'right-lower-lobe': '#5fa68f',
  'left-upper-lobe': '#c27bb0',
  'left-lower-lobe': '#6c8fd0',
};

const LAYER: Record<string, string> = {
  airway: '#e9e2d4',
  cartilage: '#cfd8dc',
  larynx: '#d8cfb8',
  hilum: '#b98a7a',
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Colour of a structure; segments follow the "colour by" choice. */
export function baseColour(s: AnatomicalStructure, colourBy: ColourBy): string {
  if (s.layer === 'segment' && s.lobe) {
    const hue = LOBE[s.lobe] ?? '#d99a8c';
    if (colourBy === 'lobe') return hue;
    const n = Number(s.code?.slice(1) ?? 1);
    // Neighbouring segment numbers alternate light and dark so adjacent segments stand apart.
    return shade(hue, ((n * 7) % 5) / 4 * 0.9 - 0.45);
  }
  if (s.layer === 'vessel') return s.blood === 'not-applicable' ? '#999999' : BLOOD[s.blood];
  return LAYER[s.layer] ?? '#bbbbbb';
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
