import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { initialQuality, makeEnvironment, quality } from './tissue';

/** Frames slower than this (seconds), sustained, switch to low quality. */
const SLOW_FRAME = 0.05;

/**
 * Studio lighting for real-looking tissue: soft image-based light and reflections from a built-in
 * room environment, a warm key light, a soft back light that outlines the silhouette,
 * and a gentle fill. It also picks the rendering quality (see tissue.ts). Same file in every lab.
 */
export function Lighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  // Neutral tone mapping keeps hues true (ACES shifts bright reds toward orange, which turns heart
  // muscle yellowish). Pick the quality once the renderer exists, then watch frame times while the
  // scene animates.
  useEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1;
    quality.set(initialQuality(gl));
    invalidate();
  }, [gl, invalidate]);
  const slow = useRef({ frames: 0, total: 0 });
  useFrame((_, dt) => {
    if (quality.level === 'low' || quality.forced || dt > 0.25) return; // ignore idle gaps between on-demand frames
    const s = slow.current;
    s.frames++; s.total += dt;
    if (s.frames >= 60) {
      if (s.total / s.frames > SLOW_FRAME) quality.set('low');
      s.frames = 0; s.total = 0;
    }
  });
  useEffect(() => {
    const env = makeEnvironment(gl);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.4;
    invalidate();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene, invalidate]);
  return (
    <>
      <hemisphereLight args={['#fff8f2', '#5a4440', 0.45]} />
      <directionalLight position={[0.5, 0.8, 0.9]} intensity={1.7} color="#fff1e6" />
      <directionalLight position={[-0.7, 0.3, -0.9]} intensity={0.9} color="#f4ece6" />
      <directionalLight position={[-0.4, -0.6, 0.5]} intensity={0.35} color="#ffe0d6" />
    </>
  );
}
