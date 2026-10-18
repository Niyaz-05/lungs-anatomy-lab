import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { focusIds, isVisible } from '../app/state';
import { anchorOf } from '../lungs/anchors';

interface Sample { p: THREE.Vector3; n: THREE.Vector3 }
interface Label {
  id: string;
  text: string;
  el: HTMLDivElement;
  priority: number;
  /** Where the label points now; updated as the camera moves. */
  anchor: THREE.Vector3;
  /** Fixed anchor (segment interior, group middle) or null to choose among surface samples. */
  fixed: THREE.Vector3 | null;
  centre: THREE.Vector3;
  occluded: boolean;
}

const SAMPLES = 64;

/**
 * Screen-space labels drawn into a DOM overlay.
 * - Each surface structure is labelled at a camera-facing point on its own mesh, nearest its
 *   middle, so curved vessels are labelled where the reader can see them.
 * - A label is hidden when another opaque structure blocks the line of sight (one throttled
 *   raycast per label, rerun only after the camera moves).
 * - A greedy pass hides labels that would overlap a higher-priority one.
 * Updated imperatively: no React render per frame.
 */
export function LabelLayer({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const { def, state } = useLab();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const labels = useRef<Label[]>([]);
  const samples = useRef(new Map<string, Sample[]>());

  const focus = focusIds(def, state);
  const wantedIds = state.labels
    ? def.structures
        .filter((s) =>
          s.kind === 'group'
            ? s.layer === 'segment' && !s.id.endsWith('-lung') && (s.members ?? []).some((m) => isVisible(def, state, m))
            : s.layer !== 'segment' && s.layer !== 'cartilage' && isVisible(def, state, s.id),
        )
        .map((s) => s.id)
    : focus;
  // Stable keys, so labels are rebuilt only when the set actually changes.
  const wantedKey = wantedIds.join('|');
  const focusKey = focus.join('|');

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const made: Label[] = [];
    const focusSet = new Set(focusKey ? focusKey.split('|') : []);
    for (const id of wantedKey ? wantedKey.split('|') : []) {
      const s = def.structures.find((x) => x.id === id);
      const a = anchorOf(def, id);
      if (!s || !a) continue;
      const el = document.createElement('div');
      el.className = 'scene-label';
      el.textContent = s.label;
      el.dataset.structure = id;
      el.setAttribute('aria-hidden', 'true');
      el.style.visibility = 'hidden';
      root.appendChild(el);
      const isFocus = focusSet.has(id);
      if (isFocus) el.classList.add('is-focus');
      // Every structure is labelled on a visible part of its own surface (groups: of their members).
      const fixed = null;
      made.push({
        id, text: s.label, el, fixed, occluded: false,
        priority: isFocus ? 2 : s.kind === 'group' || s.id === 'trachea' ? 1 : 0,
        anchor: new THREE.Vector3(...a), centre: new THREE.Vector3(...a),
      });
    }
    made.sort((x, y) => y.priority - x.priority);
    labels.current = made;
    lastCheck.current.count = -1; // force a visibility pass
    invalidate();
    return () => made.forEach((l) => l.el.remove());
  }, [wantedKey, focusKey, def, container, invalidate]);

  /**
   * Up to SAMPLES surface points (with normals) of a structure, in world space. A group samples
   * its member meshes, so a lobe is labelled on whichever of its segments faces the reader.
   */
  function samplesFor(id: string, meshes: Map<string, THREE.Mesh>): Sample[] {
    const cached = samples.current.get(id);
    if (cached) return cached;
    const members = meshes.has(id) ? [id] : (def.structures.find((s) => s.id === id)?.members ?? []);
    const out: Sample[] = [];
    for (const m of members) {
      const mesh = meshes.get(m);
      const pos = mesh?.geometry.getAttribute('position');
      const nor = mesh?.geometry.getAttribute('normal');
      if (!mesh || !pos || !nor) continue;
      const step = Math.max(1, Math.floor((pos.count * members.length) / SAMPLES));
      for (let i = 0; i < pos.count; i += step) {
        out.push({
          p: new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld),
          n: new THREE.Vector3().fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld),
        });
      }
    }
    if (out.length) samples.current.set(id, out);
    return out;
  }

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const lastCheck = useRef({ time: -1, matrix: new THREE.Matrix4(), count: -1, meshes: -1 });
  const isOwn = (label: string, hit: string) =>
    hit === label || (def.structures.find((s) => s.id === label)?.members?.includes(hit) ?? false);

  function updateAnchors(now: number) {
    const meshes = new Map<string, THREE.Mesh>();
    const blockers: THREE.Object3D[] = [];
    const visible: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.userData.structureId) return;
      meshes.set(o.userData.structureId as string, o);
      if (!o.visible) return;
      visible.push(o);
      const m = o.material as THREE.Material;
      if (!m.transparent || m.opacity >= 0.9) blockers.push(o);
    });
    // Until the model is in the scene there is nothing to label.
    if (meshes.size === 0) {
      labels.current.forEach((l) => { l.occluded = true; });
      return;
    }
    const last = lastCheck.current;
    const changed = !last.matrix.equals(camera.matrixWorld) || last.count !== labels.current.length || last.meshes !== blockers.length;
    if (!changed) return;
    if (now - last.time < 0.15) {
      invalidate(); // render again shortly so the final camera position gets checked
      return;
    }
    last.time = now; last.matrix.copy(camera.matrixWorld); last.count = labels.current.length; last.meshes = blockers.length;

    const eye = camera.position;
    const toEye = new THREE.Vector3();
    for (const l of labels.current) {
      if (!l.fixed) {
        const ss = samplesFor(l.id, meshes);
        if (ss.length) {
          if (l.centre.equals(l.anchor) && ss.length) {
            l.centre.set(0, 0, 0);
            ss.forEach((s) => l.centre.add(s.p));
            l.centre.divideScalar(ss.length);
          }
          // Camera-facing samples, nearest the structure's middle first.
          const facing = ss
            .filter((s) => s.n.dot(toEye.copy(eye).sub(s.p)) > 0)
            .sort((a, b) => a.p.distanceToSquared(l.centre) - b.p.distanceToSquared(l.centre));
          // Prefer a point whose line of sight reaches this structure first, even through
          // see-through lung tissue, so a lobe is labelled where that lobe is actually seen.
          let best: Sample | null = facing[0] ?? null;
          // Lung tissue overlaps a lot, so search further for lobes and segments (bounded cost).
          const s0 = def.structures.find((x) => x.id === l.id);
          const tries = s0?.layer === 'segment' ? 48 : 8;
          for (const s of facing.slice(0, tries)) {
            const d = s.p.clone().sub(eye);
            raycaster.set(eye, d.normalize());
            raycaster.far = Infinity;
            const first = raycaster.intersectObjects(visible, false)[0];
            if (first && isOwn(l.id, first.object.userData.structureId as string)) { best = s; break; }
          }
          if (best) l.anchor.copy(best.p).addScaledVector(best.n, 0.0005);
          l.occluded = !best;
          if (!best) continue;
        }
      } else {
        l.anchor.copy(l.fixed);
      }
      const dir = l.anchor.clone().sub(eye);
      const far = dir.length();
      raycaster.set(eye, dir.normalize());
      raycaster.far = far - 0.0008;
      const hit = raycaster.intersectObjects(blockers, false)[0];
      l.occluded = !!hit && !isOwn(l.id, hit.object.userData.structureId as string);
    }
  }

  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    // Wall-clock time: the render clock does not advance while the canvas renders on demand.
    updateAnchors(performance.now() / 1000);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of labels.current) {
      v.copy(l.anchor).project(camera);
      const hidden = v.z > 1 || (l.occluded && l.priority < 2);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      const w = l.el.offsetWidth || l.text.length * 7, h = l.el.offsetHeight || 18;
      const boxAt = (dy: number) => ({ x0: x - w / 2 - 3, y0: y + dy - h - 6, x1: x + w / 2 + 3, y1: y + dy + 2 });
      const hits = (b: { x0: number; y0: number; x1: number; y1: number }) =>
        placed.some((p) => !(b.x1 < p.x0 || b.x0 > p.x1 || b.y1 < p.y0 || b.y0 > p.y1));
      let dy = 0;
      let box = boxAt(0);
      // Labels in focus must all be readable: stack a clashing one upwards (its pointer stays on the anchor).
      if (l.priority === 2) for (let k = 1; k <= 4 && hits(box); k++) { dy = -(h + 4) * k; box = boxAt(dy); }
      const offscreen = box.x1 < 0 || box.x0 > size.width || box.y1 < 0 || box.y0 > size.height;
      const clash = hits(box);
      const show = !hidden && !offscreen && !clash;
      l.el.style.visibility = show ? 'visible' : 'hidden';
      l.el.dataset.state = hidden ? 'occluded' : offscreen ? 'offscreen' : clash ? 'overlap' : 'shown';
      l.el.style.setProperty('--lift', `${-dy}px`);
      if (show) {
        placed.push(box);
        l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + dy)}px) translate(-50%, calc(-100% - 6px))`;
      }
    }
  });

  return null;
}
