import { useEffect, useId, useState } from 'react';
import { useLab } from '../app/LabContext';
import { timings, type Phase } from '../lungs/breathing';
import { breathClock } from '../viewer/breathClock';
import { AIR } from '../viewer/palette';

/** Follows the breathing clock's phase (updates twice per breath, not every frame). */
export function usePhase(): Phase {
  const [phase, setPhase] = useState<Phase>(breathClock.state.phase);
  useEffect(() => {
    setPhase(breathClock.state.phase);
    return breathClock.subscribe(setPhase);
  }, []);
  return phase;
}

/** Breathing mode: play/pause, breathing rate, the current phase explained, and the route of air. */
export function BreathingPanel() {
  const { def, state, dispatch } = useLab();
  const phase = usePhase();
  const id = useId();
  const b = def.breathing;
  const t = timings(state.rate, b.inspirationFraction);
  const route = def.airRoute;

  return (
    <section className="sheet breathing-panel" aria-labelledby={`${id}-title`}>
      <div className="detail-head">
        <h2 id={`${id}-title`} className="panel-title">Breathing</h2>
        <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-playing', value: !state.playing })} aria-pressed={!state.playing}>
          {state.playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <div className={`phase phase-${phase}`} aria-live="polite" data-phase={phase}>
        <span className="dot" aria-hidden="true" style={{ background: phase === 'inspiration' ? AIR.fresh : AIR.exhaled }} />
        <strong>{phase === 'inspiration' ? 'Breathing in (inspiration)' : 'Breathing out (expiration)'}</strong>
        <p className="small">{phase === 'inspiration' ? b.phases.inspiration : b.phases.expiration}</p>
      </div>

      <div className="field">
        <label htmlFor={`${id}-rate`}>Breathing rate</label>
        <input
          id={`${id}-rate`}
          type="range"
          min={b.minRate}
          max={b.maxRate}
          step={1}
          value={state.rate}
          aria-valuetext={`${state.rate} breaths per minute`}
          onChange={(e) => dispatch({ type: 'set-rate', value: Number(e.target.value) })}
        />
        <output htmlFor={`${id}-rate`}>{state.rate} / min</output>
      </div>
      <p className="small muted">
        One breath every {t.period.toFixed(1)} s: in for {t.inspiration.toFixed(1)} s, out for {t.expiration.toFixed(1)} s.
      </p>

      <h3 className="group-title">{route.label}</h3>
      <ol className="flow-steps">
        {route.steps.map((st, i) => (
          <li key={i}>
            <span className="dot" aria-hidden="true" style={{ background: AIR.fresh }} />
            {st.structure ? (
              <button type="button" className="link" aria-pressed={state.selected === st.structure} onClick={() => dispatch({ type: 'select', id: st.structure! })}>{st.label}</button>
            ) : (
              <span className="offmodel">{st.label} <span className="tag">not on model</span></span>
            )}
            {st.note && <span className="muted small block">{st.note}</span>}
          </li>
        ))}
      </ol>

      <div className="legend small" aria-label="Colour key">
        <span><span className="dot" style={{ background: AIR.fresh }} aria-hidden="true" /> Fresh air in</span>
        <span><span className="dot" style={{ background: AIR.exhaled }} aria-hidden="true" /> Exhaled air out</span>
      </div>
      <details className="more">
        <summary>Model assumptions</summary>
        <ul className="small disclaimers">
          {b.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </details>
    </section>
  );
}
