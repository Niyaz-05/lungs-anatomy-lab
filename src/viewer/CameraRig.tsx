import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { boundsOfIds, homeBounds } from '../lungs/anchors';

/** Distance at which a sphere of `radius` fills the view, for a perspective camera. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 0.95): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const limiting = Math.min(vFov, hFov);
  return (radius * margin) / Math.sin(limiting / 2);
}

/**
 * Distance at which a sphere fills the smaller side (`spanPx`) of a free rectangle on a canvas
 * `canvasHeightPx` tall. The rectangle's half-angle has tangent tan(vFov/2) · span / height.
 */
export function fitDistanceInRect(radius: number, fovDeg: number, spanPx: number, canvasHeightPx: number, margin = 0.95): number {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * (spanPx / Math.max(canvasHeightPx, 1));
  return (radius * margin) / Math.sin(Math.atan(t));
}

/** Screen space (px) covered by floating panels; the heart is framed in what is left. */
export interface ViewInsets { left: number; right: number; top: number; bottom: number }

interface Flight {
  fromPos: THREE.Vector3; toPos: THREE.Vector3;
  fromTarget: THREE.Vector3; toTarget: THREE.Vector3;
  fromUp: THREE.Vector3; toUp: THREE.Vector3;
  t: number; duration: number;
}

type Controls = THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update(): void };

/**
 * Moves the camera when the lab state asks for it (preset, focus, reset). Frames the focus
 * structures, or the heart when there is no focus, from the preset's direction, centred in the
 * part of the screen the panels leave free. Animated unless the reader prefers reduced motion.
 * After a resize or a panel opening it re-frames at once, unless the reader has moved the camera.
 */
export function CameraRig({ reducedMotion, insets }: { reducedMotion: boolean; insets: ViewInsets }) {
  const { def, state } = useLab();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const flight = useRef<Flight | null>(null);
  const userMoved = useRef(false);
  const lastNonce = useRef<number | null>(null);

  // Shift the projection centre into the free area between the panels.
  useEffect(() => {
    const dx = (insets.left - insets.right) / 2;
    const dy = (insets.top - insets.bottom) / 2;
    if (dx === 0 && dy === 0) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, -dx, -dy, size.width, size.height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, insets.left, insets.right, insets.top, insets.bottom, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => { userMoved.current = true; flight.current = null; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  useEffect(() => {
    if (!controls) return;
    const isRequest = lastNonce.current !== state.camera.nonce;
    // A resize or panel change only re-frames a camera the reader has not moved.
    if (!isRequest && userMoved.current) return;
    lastNonce.current = state.camera.nonce;
    if (isRequest) userMoved.current = false;

    const preset = def.cameraPresets.find((c) => c.id === state.camera.preset) ?? def.cameraPresets[0]!;
    const box = (state.camera.focus.length ? boundsOfIds(def, state.camera.focus) : null) ?? homeBounds(def);
    const lo = new THREE.Vector3(...box[0]), hi = new THREE.Vector3(...box[1]);
    const target = lo.clone().add(hi).multiplyScalar(0.5);
    const radius = Math.max(lo.distanceTo(hi) / 2, 0.025);
    const dir = new THREE.Vector3(...preset.direction).normalize();
    const freeW = Math.max(size.width - insets.left - insets.right, 120);
    const freeH = Math.max(size.height - insets.top - insets.bottom, 120);
    const distance = fitDistanceInRect(radius, camera.fov, Math.min(freeW, freeH), size.height);
    const toPos = target.clone().addScaledVector(dir, distance);
    const toUp = new THREE.Vector3(...(preset.up ?? [0, 1, 0]));
    flight.current = {
      fromPos: camera.position.clone(), toPos,
      fromTarget: controls.target.clone(), toTarget: target,
      fromUp: camera.up.clone(), toUp,
      t: 0, duration: reducedMotion ? 0 : isRequest ? 0.7 : 0.35,
    };
    invalidate();
  }, [state.camera.nonce, controls, def, camera, reducedMotion, invalidate, size.width, size.height, insets.left, insets.right, insets.top, insets.bottom]);

  useFrame((_, dt) => {
    const f = flight.current;
    if (!f || !controls) return;
    f.t = f.duration === 0 ? 1 : Math.min(1, f.t + dt / f.duration);
    const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2; // ease in-out cubic
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    camera.up.lerpVectors(f.fromUp, f.toUp, k).normalize();
    camera.lookAt(controls.target);
    controls.update();
    if (f.t >= 1) flight.current = null;
    invalidate();
  });

  return null;
}
