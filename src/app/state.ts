/**
 * UI and simulation state as a pure reducer, so every learner action is unit-testable without
 * rendering. The 3D scene only reads this state; it never owns selection or visibility itself.
 */
import type { SimulationDefinition } from '../contract/schema';

export type Mode = 'explore' | 'breathe' | 'tour';
export type ColourBy = 'lobe' | 'segment';

export interface LabState {
  mode: Mode;
  selected: string | null;
  hovered: string | null;
  visibleLayers: ReadonlySet<string>;
  isolate: boolean;
  labels: boolean;
  colourBy: ColourBy;
  /** Breathing animation running. */
  playing: boolean;
  /** Breaths per minute. */
  rate: number;
  tourIndex: number;
  /** A camera move the scene should perform; the nonce makes repeat requests distinct. */
  camera: { preset: string; focus: readonly string[]; nonce: number };
}

export type LabAction =
  | { type: 'select'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'toggle-layer'; layer: string }
  | { type: 'set-isolate'; value: boolean }
  | { type: 'set-labels'; value: boolean }
  | { type: 'set-colour-by'; value: ColourBy }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-rate'; value: number }
  | { type: 'tour-go'; index: number }
  | { type: 'camera'; preset: string; focus?: readonly string[] }
  | { type: 'reset' };

export function initialState(def: SimulationDefinition): LabState {
  return {
    mode: 'explore',
    selected: null,
    hovered: null,
    visibleLayers: new Set(def.layers.filter((l) => l.visibleByDefault).map((l) => l.id)),
    isolate: false,
    labels: false,
    colourBy: 'lobe',
    playing: true,
    rate: def.breathing.defaultRate,
    tourIndex: 0,
    camera: { preset: def.defaultCamera, focus: [], nonce: 0 },
  };
}

/** Ids that a selection or tour step highlights: a group stands for its members. */
export function highlightedIds(def: SimulationDefinition, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const s = def.structures.find((x) => x.id === id);
    if (!s) continue;
    if (s.kind === 'group') s.members?.forEach((m) => out.add(m));
    else out.add(id);
  }
  return out;
}

/** The structures currently in focus: the selection in explore/breathe, the step's focus in a tour. */
export function focusIds(def: SimulationDefinition, state: LabState): string[] {
  if (state.mode === 'tour') return [...(def.tour[state.tourIndex]?.focus ?? [])];
  return state.selected ? [state.selected] : [];
}

/** True while the breathing animation and airflow should show. */
export function breathingActive(def: SimulationDefinition, state: LabState): boolean {
  return state.mode === 'breathe' || (state.mode === 'tour' && def.tour[state.tourIndex]?.routeStep !== undefined);
}

/**
 * Whether a mesh structure is drawn. Hidden layers hide their meshes, except that a highlighted
 * structure is always shown. With isolate on, only highlighted structures are drawn.
 */
export function isVisible(def: SimulationDefinition, state: LabState, id: string): boolean {
  const s = def.structures.find((x) => x.id === id);
  if (!s) return false;
  const lit = highlightedIds(def, focusIds(def, state));
  if (lit.has(id)) return true;
  if (state.isolate && lit.size > 0) return false;
  return state.visibleLayers.has(s.layer);
}

export function makeReducer(def: SimulationDefinition) {
  const known = new Set(def.structures.map((s) => s.id));
  const layers = new Set(def.layers.map((l) => l.id));
  const presets = new Set(def.cameraPresets.map((c) => c.id));
  const { minRate, maxRate } = def.breathing;

  return function reduce(state: LabState, action: LabAction): LabState {
    switch (action.type) {
      case 'select': {
        if (action.id !== null && !known.has(action.id)) return state;
        const selected = action.id === state.selected ? null : action.id;
        return { ...state, selected, isolate: selected ? state.isolate : false };
      }
      case 'hover':
        return action.id === state.hovered || (action.id !== null && !known.has(action.id)) ? state : { ...state, hovered: action.id };
      case 'toggle-layer': {
        if (!layers.has(action.layer)) return state;
        const next = new Set(state.visibleLayers);
        if (next.has(action.layer)) next.delete(action.layer);
        else next.add(action.layer);
        return { ...state, visibleLayers: next };
      }
      case 'set-isolate':
        return { ...state, isolate: action.value };
      case 'set-labels':
        return { ...state, labels: action.value };
      case 'set-colour-by':
        return action.value === state.colourBy ? state : { ...state, colourBy: action.value };
      case 'set-mode': {
        if (action.mode === state.mode) return state;
        if (action.mode === 'tour') {
          const step = def.tour[0];
          return {
            ...state, mode: 'tour', tourIndex: 0, selected: null, isolate: false, playing: true,
            camera: { preset: step?.camera ?? def.defaultCamera, focus: step?.focus ?? [], nonce: state.camera.nonce + 1 },
          };
        }
        return { ...state, mode: action.mode, playing: true };
      }
      case 'set-playing':
        return { ...state, playing: action.value };
      case 'set-rate': {
        if (!Number.isFinite(action.value)) return state;
        return { ...state, rate: Math.max(minRate, Math.min(maxRate, Math.round(action.value))) };
      }
      case 'tour-go': {
        const index = Math.max(0, Math.min(def.tour.length - 1, action.index));
        const step = def.tour[index];
        if (!step) return state;
        return {
          ...state, mode: 'tour', tourIndex: index,
          camera: { preset: step.camera ?? state.camera.preset, focus: step.focus, nonce: state.camera.nonce + 1 },
        };
      }
      case 'camera':
        if (!presets.has(action.preset)) return state;
        return { ...state, camera: { preset: action.preset, focus: action.focus ?? [], nonce: state.camera.nonce + 1 } };
      case 'reset': {
        const fresh = initialState(def);
        return { ...fresh, camera: { ...fresh.camera, nonce: state.camera.nonce + 1 } };
      }
    }
  };
}
