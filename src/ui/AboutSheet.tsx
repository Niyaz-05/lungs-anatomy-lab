import { useEffect, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { AIR, LOBE } from '../viewer/palette';

/**
 * Source, scope and credits, kept off the main screen. The HuBMAP attribution required by
 * CC BY 4.0 lives here and is reachable from the ⓘ button and the "Source & credits" link.
 */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const { def } = useLab();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="about-sheet glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ghost sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Source &amp; scope</p>
        <h2 id="about-title" className="sheet-title" tabIndex={-1} ref={title}>About this lab</h2>
        <p>{def.summary}</p>

        <h3 className="group-title">You will learn to</h3>
        <ul className="objectives">
          {def.learningObjectives.map((o) => <li key={o.id}>{o.text}</li>)}
        </ul>

        <h3 className="group-title">Colours</h3>
        <p className="legend-row">
          {def.structures.filter((x) => x.kind === 'group' && x.layer === 'segment' && !x.id.endsWith('-lung')).map((l) => (
            <span key={l.id}><span className="dot" style={{ background: LOBE[l.id] }} aria-hidden="true" /> {l.label}</span>
          ))}
        </p>
        <p className="legend-row">
          <span><span className="dot" style={{ background: AIR.fresh }} aria-hidden="true" /> Fresh air in</span>
          <span><span className="dot" style={{ background: AIR.exhaled }} aria-hidden="true" /> Exhaled air out</span>
        </p>
        <p className="small muted">
          “Real” shows the lungs as they look in a specimen: salmon-pink lung with grey mottling, pale airways and
          cartilage, and real vessel colours. “Lobe” and “Segment” paint the lung tissue to teach its divisions. The
          pulmonary arteries carry oxygen-poor blood to the lungs and the pulmonary veins bring oxygen-rich blood back,
          because "artery" and "vein" describe direction relative to the heart, not oxygen content.
        </p>

        <h3 className="group-title">Breathing model</h3>
        <ul className="small disclaimers">
          {def.breathing.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>

        <h3 className="group-title">Please note</h3>
        <ul className="small disclaimers">
          {def.disclaimers.map((d) => <li key={d}>{d}</li>)}
        </ul>

        <h3 className="group-title">Source</h3>
        <p className="small">
          3D model built from the HuBMAP Human Reference Atlas reference organs by Kristen Browne, Heidi Schlehlein et al.,
          licensed under CC Attribution 4.0 International. HuBMAP has not reviewed or endorsed this lab.
        </p>
        <div className="link-list small">
          <a href={`${import.meta.env.BASE_URL}ATTRIBUTION.md`} target="_blank" rel="noopener">Attribution and changes made ↗</a>
          <a href="https://doi.org/10.48539/HBM994.HXJP.575" target="_blank" rel="noopener noreferrer">HRA lung, female v1.4 ↗</a>
          <a href="https://doi.org/10.48539/HBM352.BTSQ.586" target="_blank" rel="noopener noreferrer">HRA female organ set v1.5 ↗</a>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 licence ↗</a>
        </div>
      </section>
    </div>
  );
}
