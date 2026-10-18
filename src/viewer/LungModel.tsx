import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { breathingActive, focusIds, highlightedIds, isVisible } from '../app/state';
import type { AnatomicalStructure } from '../contract/schema';
import { hilumPivot } from '../lungs/anchors';
import { baseColour, HIGHLIGHT, HOVER } from './palette';
import { breathClock } from './breathClock';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/lungs.glb`;

const GREY = new THREE.Color('#9aa3aa');
const HIGHLIGHT_COLOUR = new THREE.Color(HIGHLIGHT);

/** Pointer travel (px) above which a press is treated as a drag (rotate), not a pick. */
const CLICK_SLOP = 5;

interface Part {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  structure: AnatomicalStructure;
  /** Moves with the lung while breathing (segments and everything inside the lung). */
  breathes: boolean;
  pivot: THREE.Vector3 | null;
}

/** Structures inside the lungs move with them; the trachea, larynx and vessels stay put. */
function breathes(s: AnatomicalStructure): boolean {
  if (s.side === 'midline') return false;
  return s.layer === 'segment' || s.layer === 'hilum' || (s.layer === 'airway' && !!s.lobe) || s.id.endsWith('bronchial-cartilage');
}

export function LungModel({ onReady, reducedMotion }: { onReady?: () => void; reducedMotion: boolean }) {
  const { def, state, dispatch } = useLab();
  const gltf = useGLTF(MODEL_URL);
  const invalidate = useThree((s) => s.invalidate);

  const parts = useMemo(() => {
    const out = new Map<string, Part>();
    const pivots = { right: new THREE.Vector3(...hilumPivot('right')), left: new THREE.Vector3(...hilumPivot('left')) };
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const id = o.name || o.parent?.name || '';
      const s = def.structures.find((x) => x.id === id);
      if (!s) return;
      const material = new THREE.MeshStandardMaterial({
        roughness: s.layer === 'segment' ? 0.75 : 0.55,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const b = breathes(s);
      out.set(id, { id, mesh: o, material, structure: s, breathes: b, pivot: b && s.side !== 'midline' ? pivots[s.side] : null });
    });
    return out;
  }, [gltf, def]);

  // Attach materials in an effect, not in useMemo: StrictMode may run the memo twice, and the
  // meshes must carry the materials this component actually updates. Dispose them on unmount.
  useLayoutEffect(() => {
    for (const p of parts.values()) {
      p.mesh.material = p.material;
      p.mesh.userData.structureId = p.id;
    }
    onReady?.();
    return () => parts.forEach((p) => p.material.dispose());
  }, [parts, onReady]);

  const focus = focusIds(def, state);
  const lit = highlightedIds(def, focus);
  const breathing = breathingActive(def, state);

  useEffect(() => {
    for (const p of parts.values()) {
      const s = p.structure;
      p.mesh.visible = isVisible(def, state, p.id);
      const isLit = lit.has(p.id);
      const isHover = state.hovered === p.id && !isLit;
      const dim = lit.size > 0 && !isLit;
      p.material.color.set(baseColour(s, state.colourBy));
      // Lung tissue keeps its lobe/segment colour when highlighted (the colour is the lesson);
      // it stands out by becoming more opaque and glowing in its own hue. Other parts turn amber.
      const ownGlow = s.layer === 'segment';
      if (isLit && !ownGlow) p.material.color.lerp(HIGHLIGHT_COLOUR, 0.3);
      else if (dim) p.material.color.lerp(GREY, 0.5);
      if (isLit) p.material.emissive.copy(ownGlow ? p.material.color : HIGHLIGHT_COLOUR);
      else p.material.emissive.set(isHover ? HOVER : '#000000');
      p.material.emissiveIntensity = isLit ? (ownGlow ? 0.18 : 0.35) : isHover ? 0.3 : 0;

      // Lung tissue is see-through so the bronchial tree inside stays visible.
      let opacity = 1;
      if (s.layer === 'segment') {
        if (isLit) opacity = 0.85;
        else if (lit.size > 0) opacity = 0.14;
        else opacity = breathing ? 0.26 : state.colourBy === 'segment' ? 0.55 : 0.36;
      } else if (dim) {
        opacity = 0.45;
      }
      const transparent = opacity < 1;
      // Changing `transparent` changes the shader program; only flag an update when it flips.
      if (p.material.transparent !== transparent) p.material.needsUpdate = true;
      p.material.transparent = transparent;
      p.material.opacity = opacity;
      p.material.depthWrite = !transparent;
      p.mesh.renderOrder = transparent ? 1 : 0;
    }
    invalidate();
  }, [parts, def, state, lit, breathing, invalidate]);

  // Breathing: expand and recoil about each hilum, following the shared clock.
  useFrame(() => {
    const amount = breathing && !reducedMotion ? def.breathing.expansion * breathClock.state.volume : 0;
    for (const p of parts.values()) {
      if (!p.breathes || !p.pivot) continue;
      const s = 1 + amount;
      if (p.mesh.scale.x === s) continue;
      p.mesh.scale.setScalar(s);
      p.mesh.position.copy(p.pivot).multiplyScalar(1 - s);
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible) return; // let the event reach the next hit
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    dispatch({ type: 'select', id });
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible) return;
    e.stopPropagation();
    dispatch({ type: 'hover', id });
    document.body.style.cursor = 'pointer';
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    if (e.object.userData.structureId === state.hovered) dispatch({ type: 'hover', id: null });
    document.body.style.cursor = '';
  };

  return <primitive object={gltf.scene} onClick={pick} onPointerOver={over} onPointerOut={out} />;
}
