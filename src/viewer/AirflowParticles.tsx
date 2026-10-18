import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { buildAirStreams, type AirStream } from '../lungs/airflow';
import { AIR } from './palette';
import { breathClock } from './breathClock';

/** Particles per metre of path; keeps density even across short and long streams. */
const DENSITY = 160;
/** Peak particle speed along the path, metres per second at the model's scale (schematic). */
const PEAK_SPEED = 0.06;

interface Track { stream: AirStream; curve: THREE.CatmullRomCurve3; length: number; count: number; offset: number }

/**
 * Schematic airflow: particles move along each segment's airway path, inwards while breathing in
 * and outwards while breathing out, at a speed that follows the airflow of the breathing model.
 * Colour shows fresh air coming in and exhaled air going out. With reduced motion the particles
 * are drawn still along the paths.
 */
export function AirflowParticles({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const streams = useMemo(() => buildAirStreams(), []);
  const tracks = useMemo<Track[]>(() => {
    let offset = 0;
    return streams.map((stream) => {
      const curve = new THREE.CatmullRomCurve3(stream.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
      const length = curve.getLength();
      const count = Math.max(6, Math.round(length * DENSITY));
      const t = { stream, curve, length, count, offset };
      offset += count;
      return t;
    });
  }, [streams]);
  const total = tracks.reduce((n, t) => n + t.count, 0);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const travelled = useRef(0);
  const shownPhase = useRef<'inspiration' | 'expiration' | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.0012, 8, 6), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const point = useMemo(() => new THREE.Vector3(), []);

  function paint(phase: 'inspiration' | 'expiration') {
    const m = mesh.current;
    if (!m || shownPhase.current === phase) return;
    const colour = new THREE.Color(phase === 'inspiration' ? AIR.fresh : AIR.exhaled);
    for (let i = 0; i < total; i++) m.setColorAt(i, colour);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    shownPhase.current = phase;
  }

  function place(distance: number) {
    const m = mesh.current;
    if (!m) return;
    for (const t of tracks) {
      const shift = distance / t.length;
      for (let i = 0; i < t.count; i++) {
        const u = (((i / t.count + shift) % 1) + 1) % 1;
        t.curve.getPointAt(u, point);
        tmp.position.copy(point);
        tmp.updateMatrix();
        m.setMatrixAt(t.offset + i, tmp.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }

  useEffect(() => {
    paint(breathClock.state.phase);
    place(travelled.current);
    invalidate();
    // place/paint only read refs and tracks.
  }, [tracks]);

  useFrame((_, dt) => {
    if (!playing || reducedMotion) return;
    // Distance moved this frame follows the breathing flow: forwards in, backwards out.
    travelled.current += breathClock.state.flow * PEAK_SPEED * Math.min(dt, 0.05);
    paint(breathClock.state.phase);
    place(travelled.current);
  });

  const first = tracks[0];
  const a = first?.stream.points[first.stream.offModel.from];
  const b = first?.stream.points[first.stream.offModel.to];
  return (
    <group>
      <instancedMesh ref={mesh} args={[geometry, material, total]} frustumCulled={false} renderOrder={3} />
      {a && b && (
        <>
          <Line points={[a, b]} color={AIR.fresh} lineWidth={1.5} dashed dashSize={0.004} gapSize={0.003} />
          <Html position={a} center zIndexRange={[5, 0]} className="offmodel-tag">From nose and mouth</Html>
        </>
      )}
    </group>
  );
}
