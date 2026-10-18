import { describe, expect, it } from 'vitest';
import { lungsDefinition as def } from '../../src/lungs/definition';
import { breathingActive, highlightedIds, initialState, isVisible, makeReducer } from '../../src/app/state';
import { searchStructures } from '../../src/app/search';

const reduce = makeReducer(def);

describe('lab state', () => {
  it('starts with lungs, airways and larynx shown; cartilage, vessels and hilum hidden', () => {
    const s = initialState(def);
    expect(isVisible(def, s, 'right-apical-segment')).toBe(true);
    expect(isVisible(def, s, 'trachea')).toBe(true);
    expect(isVisible(def, s, 'tracheal-cartilage')).toBe(false);
    expect(isVisible(def, s, 'pulmonary-trunk')).toBe(false);
    expect(s.colourBy).toBe('lobe');
    expect(s.rate).toBe(def.breathing.defaultRate);
  });

  it('selecting a lobe highlights all of its segments', () => {
    expect([...highlightedIds(def, ['right-middle-lobe'])].sort()).toEqual(['right-lateral-segment', 'right-medial-segment']);
    expect(highlightedIds(def, ['left-lower-lobe']).size).toBe(5);
  });

  it('selecting a hidden structure reveals it; isolate shows only the selection', () => {
    let s = reduce(initialState(def), { type: 'select', id: 'pulmonary-trunk' });
    expect(isVisible(def, s, 'pulmonary-trunk')).toBe(true);
    s = reduce(s, { type: 'set-isolate', value: true });
    expect(isVisible(def, s, 'trachea')).toBe(false);
  });

  it('switches colour mode and clamps the breathing rate', () => {
    let s = reduce(initialState(def), { type: 'set-colour-by', value: 'segment' });
    expect(s.colourBy).toBe('segment');
    s = reduce(s, { type: 'set-rate', value: 99 });
    expect(s.rate).toBe(def.breathing.maxRate);
    s = reduce(s, { type: 'set-rate', value: 1 });
    expect(s.rate).toBe(def.breathing.minRate);
    expect(reduce(s, { type: 'set-rate', value: Number.NaN })).toBe(s);
  });

  it('runs breathing in Breathing mode and on tour steps tied to the air route', () => {
    let s = initialState(def);
    expect(breathingActive(def, s)).toBe(false);
    s = reduce(s, { type: 'set-mode', mode: 'breathe' });
    expect(breathingActive(def, s)).toBe(true);
    s = reduce(s, { type: 'set-mode', mode: 'tour' });
    expect(breathingActive(def, s)).toBe(def.tour[0]!.routeStep !== undefined);
    const lobesStep = def.tour.findIndex((t) => t.id === 'lobes');
    s = reduce(s, { type: 'tour-go', index: lobesStep });
    expect(breathingActive(def, s)).toBe(false);
  });

  it('reset restores defaults', () => {
    let s = reduce(initialState(def), { type: 'select', id: 'carina' });
    s = reduce(s, { type: 'set-colour-by', value: 'segment' });
    s = reduce(s, { type: 'toggle-layer', layer: 'airway' });
    s = reduce(s, { type: 'reset' });
    expect(s.selected).toBeNull();
    expect(s.colourBy).toBe('lobe');
    expect(s.visibleLayers.has('airway')).toBe(true);
  });
});

describe('structure search', () => {
  it('finds lobes by abbreviation and segments by synonym', () => {
    expect(searchStructures(def.structures, 'RUL')[0]?.structure.id).toBe('right-upper-lobe');
    expect(searchStructures(def.structures, 'lingula').map((h) => h.structure.id)).toEqual(
      expect.arrayContaining(['left-superior-lingular-segment', 'left-inferior-lingular-segment']),
    );
    expect(searchStructures(def.structures, 'windpipe')[0]?.structure.id).toBe('trachea');
    expect(searchStructures(def.structures, 'voice box')[0]?.structure.id).toBe('larynx');
  });
});
