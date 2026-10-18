import { useLab } from '../app/LabContext';
import type { Oxygenation } from '../contract/schema';

const BLOOD_TEXT: Record<Oxygenation, string> = {
  'oxygen-poor': 'Oxygen-poor blood',
  'oxygen-rich': 'Oxygen-rich blood',
  'not-applicable': '',
};

/** Context-sensitive explanation of the selected structure, with its sources and model notes. */
export function DetailPanel() {
  const { def, state, dispatch } = useLab();
  const s = state.selected ? def.structures.find((x) => x.id === state.selected) : null;

  if (!s) return null; // details appear only after something is selected

  const sources = s.sources.map((id) => def.sources.find((x) => x.id === id)).filter((x) => x !== undefined);
  const layer = def.layers.find((l) => l.id === s.layer);
  const lobe = s.lobe ? def.structures.find((x) => x.id === s.lobe) : undefined;

  return (
    <section className="sheet detail-panel" aria-live="polite" aria-labelledby="detail-title">
      <div className="detail-head">
        <div>
          <p className="eyebrow">{layer?.label}</p>
          <h2 id="detail-title" className="panel-title">{s.label}</h2>
        </div>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'select', id: null })} aria-label="Clear selection">✕</button>
      </div>
      <p className="chip-row">
        {lobe && <button type="button" className="chip-static" onClick={() => dispatch({ type: 'select', id: lobe.id })}>{lobe.label}</button>}
        {s.code && <span className="chip-static">{s.code.startsWith('S') ? `Segment ${s.code}` : `Bronchus ${s.code}`}</span>}
        {s.blood !== 'not-applicable' && (
          <span className={`blood-chip ${s.blood}`}><span aria-hidden="true" className="dot" />{BLOOD_TEXT[s.blood]}</span>
        )}
      </p>
      <p className="lead">{s.summary}</p>
      <h3 className="group-title">Function</h3>
      <p>{s.function}</p>
      {s.kind === 'group' && s.members && (
        <>
          <h3 className="group-title">{s.members.length} {s.layer === 'segment' ? 'segments' : 'parts'}</h3>
          <ul className="chips">
            {s.members.map((m) => {
              const ms = def.structures.find((x) => x.id === m);
              return ms ? <li key={m}><button type="button" onClick={() => dispatch({ type: 'select', id: m })}>{ms.label}</button></li> : null;
            })}
          </ul>
        </>
      )}
      {s.related.length > 0 && (
        <>
          <h3 className="group-title">Related</h3>
          <ul className="chips">
            {s.related.map((r) => {
              const rs = def.structures.find((x) => x.id === r);
              return rs ? (
                <li key={r}><button type="button" onClick={() => dispatch({ type: 'select', id: r })}>{rs.label}</button></li>
              ) : null;
            })}
          </ul>
        </>
      )}
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={state.isolate} onChange={(e) => dispatch({ type: 'set-isolate', value: e.target.checked })} />
          Isolate
        </label>
        <button type="button" className="secondary" onClick={() => dispatch({ type: 'camera', preset: state.camera.preset, focus: [s.id] })}>Zoom to</button>
      </div>
      <details className="more">
        <summary>Model note &amp; sources</summary>
        {s.modelNote && <p className="model-note">{s.modelNote}</p>}
        <ol className="sources small">
          {sources.map((src) => (
            <li key={src.id}>{src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer">{src.citation}</a> : src.citation}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
