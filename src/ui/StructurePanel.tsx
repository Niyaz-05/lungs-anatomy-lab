import { useId, useMemo, useState } from 'react';
import { useLab } from '../app/LabContext';
import { isVisible } from '../app/state';
import { searchStructures } from '../app/search';
import type { AnatomicalStructure } from '../contract/schema';
import { baseColour } from '../viewer/palette';

/** Search, colour mode, layer toggles and the grouped structure list. Every entry selects on the model. */
export function StructurePanel() {
  const { def, state, dispatch } = useLab();
  const [query, setQuery] = useState('');
  const id = useId();
  const hits = useMemo(() => searchStructures(def.structures, query), [def, query]);
  const searching = query.trim().length > 0;
  const select = (sid: string) => dispatch({ type: 'select', id: sid });

  const item = (s: AnatomicalStructure, swatch = false) => {
    const shown = s.kind === 'group' ? (s.members ?? []).some((m) => isVisible(def, state, m)) : isVisible(def, state, s.id);
    return (
      <li key={s.id}>
        <button
          type="button"
          aria-pressed={state.selected === s.id}
          className={shown ? undefined : 'is-hidden'}
          onClick={() => select(s.id)}
          onMouseEnter={() => dispatch({ type: 'hover', id: s.kind === 'mesh' ? s.id : null })}
          onMouseLeave={() => dispatch({ type: 'hover', id: null })}
        >
          {swatch && <span className="dot" aria-hidden="true" style={{ background: baseColour(s, state.colourBy === 'real' ? 'lobe' : state.colourBy) }} />}
          {s.label}
          {!shown && <span className="tag">hidden</span>}
        </button>
      </li>
    );
  };

  const lungs = def.structures.filter((s) => s.kind === 'group' && s.id.endsWith('-lung'));
  const lobes = def.structures.filter((s) => s.kind === 'group' && s.layer === 'segment' && !s.id.endsWith('-lung'));

  return (
    <section className="panel structure-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">Structures</h2>

      <div className="search">
        <label htmlFor={`${id}-q`} className="sr-only">Search structures</label>
        <input
          id={`${id}-q`}
          type="search"
          placeholder="Search, e.g. carina, RUL, lingula"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) select(hits[0].structure.id);
            if (e.key === 'Escape') setQuery('');
          }}
          autoComplete="off"
        />
      </div>

      {searching ? (
        <div className="search-results" aria-live="polite">
          {hits.length === 0 ? (
            <p className="muted small">No structure matches “{query.trim()}”.</p>
          ) : (
            <ul className="struct-list">
              {hits.map((h) => (
                <li key={h.structure.id}>
                  <button type="button" aria-pressed={state.selected === h.structure.id} onClick={() => select(h.structure.id)}>
                    <span>{h.structure.label}</span>
                    {h.matched !== h.structure.label && <span className="muted small"> · {h.matched}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="colour-by" role="radiogroup" aria-label="Colour lungs by">
            <span className="group-title">Colour by</span>
            <div className="seg-toggle">
              {(['real', 'lobe', 'segment'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={state.colourBy === c} onClick={() => dispatch({ type: 'set-colour-by', value: c })}>
                  {c === 'real' ? 'Real' : c === 'lobe' ? 'Lobe' : 'Segment'}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="layers">
            <legend>Layers</legend>
            {def.layers.map((l) => (
              <label key={l.id} className="check" title={l.description}>
                <input type="checkbox" checked={state.visibleLayers.has(l.id)} onChange={() => dispatch({ type: 'toggle-layer', layer: l.id })} />
                {l.label}
              </label>
            ))}
          </fieldset>

          <div className="group">
            <h3 className="group-title">Lungs, lobes &amp; segments</h3>
            {lungs.map((lung) => (
              <div key={lung.id} className="tree">
                <ul className="struct-list">{item(lung)}</ul>
                {lobes.filter((l) => l.side === lung.side).map((lobe) => (
                  <div key={lobe.id} className="tree-branch">
                    <ul className="struct-list">{item(lobe, true)}</ul>
                    <ul className="struct-list tree-leaves">
                      {def.structures.filter((s) => s.kind === 'mesh' && s.layer === 'segment' && s.lobe === lobe.id).map((s) => item(s, true))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {def.layers.filter((l) => l.id !== 'segment').map((l) => {
            const items = def.structures.filter((s) => s.layer === l.id);
            if (!items.length) return null;
            return (
              <div key={l.id} className="group">
                <h3 className="group-title">{l.label}</h3>
                <ul className="struct-list">{items.map((s) => item(s))}</ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
