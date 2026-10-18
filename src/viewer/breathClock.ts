/**
 * One breathing clock shared by the lung model, the airflow particles and the breathing panel.
 * Advanced once per frame by <BreathDriver/>; React components subscribe to phase changes only
 * (twice per breath), never to every frame.
 */
import { breathAt, type BreathState, type Phase } from '../lungs/breathing';

type Listener = (phase: Phase) => void;

class BreathClock {
  time = 0;
  rate = 15;
  inspirationFraction = 1 / 3;
  state: BreathState = { phase: 'inspiration', volume: 0, flow: 0, cycle: 0 };
  private listeners = new Set<Listener>();

  advance(dt: number) {
    this.time += dt;
    this.update();
  }

  update() {
    const prev = this.state.phase;
    this.state = breathAt(this.time, this.rate, this.inspirationFraction);
    if (this.state.phase !== prev) this.listeners.forEach((l) => l(this.state.phase));
  }

  reset() {
    this.time = 0;
    this.update();
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

export const breathClock = new BreathClock();
