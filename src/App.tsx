import { useCallback, useEffect, useMemo, useState } from 'react';
import { LabProvider, useLab } from './app/LabContext';
import type { Mode } from './app/state';
import { validateDefinition } from './contract/validate';
import { lungsDefinition } from './lungs/definition';
import { LabViewer } from './viewer/LabViewer';
import { StructurePanel } from './ui/StructurePanel';
import { DetailPanel } from './ui/DetailPanel';
import { BreathingPanel } from './ui/BreathingPanel';
import { TourPanel } from './ui/TourPanel';
import { AboutSheet } from './ui/AboutSheet';
import type { ViewInsets } from './viewer/CameraRig';

/** Window size, for laying the model out around the floating panels. */
function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** Space the floating panels take, matching the breakpoints in styles.css. */
function panelInsets(w: number, h: number, hasSheet: boolean): ViewInsets {
  if (w <= 767) return { left: 0, right: 0, top: 120, bottom: hasSheet ? Math.round(h * 0.46) + 120 : 100 };
  const compact = w <= 1100;
  return {
    left: compact ? 266 : 318,
    right: hasSheet ? (compact ? 336 : 388) : 0,
    top: 70,
    bottom: 80,
  };
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'explore', label: 'Anatomy' },
  { id: 'breathe', label: 'Breathing' },
  { id: 'tour', label: 'Guided tour' },
];

function Toolbar({ structuresOpen, onStructures }: { structuresOpen: boolean; onStructures: () => void }) {
  const { def, state, dispatch } = useLab();
  return (
    <div className="dock glass" role="toolbar" aria-label="View controls">
      <button type="button" className="mobile-only dock-structures" aria-pressed={structuresOpen} onClick={onStructures}>
        Structures
      </button>
      <div className="seg" role="group" aria-label="Camera views">
        {def.cameraPresets.map((c) => (
          <button key={c.id} type="button" aria-pressed={state.camera.preset === c.id} onClick={() => dispatch({ type: 'camera', preset: c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <label className="check toolbar-check">
        <input type="checkbox" checked={state.labels} onChange={(e) => dispatch({ type: 'set-labels', value: e.target.checked })} />
        Labels
      </label>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'camera', preset: state.camera.preset })} title="Fit the lungs in view">Fit</button>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'reset' })} title="Reset camera, layers, selection and mode">Reset</button>
    </div>
  );
}

/** Right-hand sheet: shown only when there is something to show. */
function SidePanel() {
  const { state } = useLab();
  if (state.mode === 'tour') return <TourPanel />;
  if (state.mode === 'breathe' && !state.selected) return <BreathingPanel />;
  return <DetailPanel />;
}

function Lab() {
  const { def, state, dispatch } = useLab();
  const [about, setAbout] = useState(false);
  // Phones: the structure panel opens over the model from the dock.
  const [structuresOpen, setStructuresOpen] = useState(false);
  const closeAbout = useCallback(() => setAbout(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || about) return;
      if (e.key === 'Escape') dispatch({ type: 'select', id: null });
      if (e.key === '0' || e.key === 'Home') dispatch({ type: 'camera', preset: def.defaultCamera });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [def, dispatch, about]);

  // Picking a structure from the panel on a phone closes the panel so the details can show.
  useEffect(() => {
    if (state.selected) setStructuresOpen(false);
  }, [state.selected]);

  const hasSheet = state.mode !== 'explore' || state.selected !== null;
  const win = useWindowSize();
  const insets = useMemo(() => panelInsets(win.w, win.h, hasSheet), [win.w, win.h, hasSheet]);
  const meshCount = def.structures.filter((s) => s.kind === 'mesh').length;

  return (
    <div className="app" data-mode={state.mode}>
      <main className="stage">
        <LabViewer insets={insets} />
      </main>

      <header className="identity">
        <p className="eyebrow"><span className="status-dot" aria-hidden="true" /> Interactive anatomy</p>
        <h1>Human Lungs</h1>
        <p className="identity-meta">{meshCount} structures · HuBMAP</p>
      </header>

      <nav className="top-actions" aria-label="Mode">
        <div className="modes glass">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={state.mode === m.id} onClick={() => dispatch({ type: 'set-mode', mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button glass" aria-label="About this lab, sources and credits" onClick={() => setAbout(true)}>
          <span aria-hidden="true">i</span>
        </button>
      </nav>

      <aside className={`left glass ${structuresOpen ? 'mobile-open' : ''}`}>
        <StructurePanel />
      </aside>

      {hasSheet && (
        <aside className="right glass" aria-label="Details">
          <SidePanel />
        </aside>
      )}

      <Toolbar structuresOpen={structuresOpen} onStructures={() => setStructuresOpen((v) => !v)} />

      <footer className="studio-footer">
        <span className="hint">Drag to rotate · Scroll to zoom · Click to inspect</span>
        <button type="button" className="link" onClick={() => setAbout(true)}>Source &amp; credits</button>
      </footer>

      {about && <AboutSheet onClose={closeAbout} />}
    </div>
  );
}

export default function App() {
  const result = validateDefinition(lungsDefinition);
  if (!result.ok) {
    // A broken definition must be visible, not silently half-rendered.
    return (
      <div className="fatal" role="alert">
        <h1>This simulation definition is invalid</h1>
        <ul>{result.issues.map((i) => <li key={`${i.path}-${i.code}`}><code>{i.path}</code>: {i.message}</li>)}</ul>
      </div>
    );
  }
  return (
    <LabProvider def={result.definition}>
      <Lab />
    </LabProvider>
  );
}
