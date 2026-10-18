/**
 * Simplified breathing cycle. Volume rises smoothly during inspiration and falls during
 * expiration (half-cosine shapes, so flow is zero at the turning points). Flow is the time
 * derivative of volume, normalised so that its peak during inspiration is +1.
 * Educational model only: the shape and the inspiration share are model assumptions.
 */
export type Phase = 'inspiration' | 'expiration';

export interface BreathState {
  phase: Phase;
  /** Lung volume above its resting level, 0 (end of expiration) to 1 (end of inspiration). */
  volume: number;
  /** Signed, normalised airflow: positive = air moving in, negative = air moving out. */
  flow: number;
  /** Position within the current breath, 0–1. */
  cycle: number;
}

export function breathAt(timeSeconds: number, ratePerMinute: number, inspirationFraction: number): BreathState {
  if (!(ratePerMinute > 0) || !(inspirationFraction > 0 && inspirationFraction < 1)) {
    throw new Error('breathAt: rate must be positive and inspirationFraction between 0 and 1');
  }
  const period = 60 / ratePerMinute;
  const cycle = (((timeSeconds / period) % 1) + 1) % 1;
  const ti = inspirationFraction;
  const te = 1 - inspirationFraction;
  // Peak inspiratory flow of the half-cosine is (π/2)/ti in cycle units; normalise by it.
  const peakIn = Math.PI / 2 / ti;
  if (cycle < ti) {
    const u = cycle / ti;
    return { phase: 'inspiration', volume: (1 - Math.cos(Math.PI * u)) / 2, flow: ((Math.PI / 2 / ti) * Math.sin(Math.PI * u)) / peakIn, cycle };
  }
  const u = (cycle - ti) / te;
  return { phase: 'expiration', volume: (1 + Math.cos(Math.PI * u)) / 2, flow: (-(Math.PI / 2 / te) * Math.sin(Math.PI * u)) / peakIn, cycle };
}

/** Seconds per breath and per phase, for the readout. */
export function timings(ratePerMinute: number, inspirationFraction: number) {
  const period = 60 / ratePerMinute;
  return { period, inspiration: period * inspirationFraction, expiration: period * (1 - inspirationFraction) };
}
