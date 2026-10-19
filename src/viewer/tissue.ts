/**
 * The real-tissue look shared by the anatomy labs.
 *
 * - A physically based material with a clear coat (the moist surface sheen of fresh tissue) and a
 *   sheen (soft, velvety tissue), lit by an image-based environment.
 * - Baked per-vertex data (_TISSUE, from tools/bake-shading.mjs): ambient occlusion darkens folds
 *   and grooves, a noise value breaks up flat colour, and an optional fat mask tints tissue
 *   (epicardial fat along the heart's vessels).
 * - A soft warm rim where the surface turns away from the viewer, approximating light that scatters
 *   under the surface of living tissue (cheap stand-in for subsurface scattering).
 * Same file in every lab; each lab picks its own colours.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface TissueLook {
  /** Base colour of the tissue. */
  color: string;
  roughness?: number;
  /** Wet surface coat, 0–1. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Velvety sheen, 0–1, and its tint. */
  sheen?: number;
  sheenColor?: string;
  /** Subsurface rim glow strength and tint. */
  rim?: number;
  rimColor?: string;
  /** How strongly baked occlusion darkens folds, 0–1. */
  ao?: number;
  /** How strongly the mottling noise varies the colour, 0–1, and the colour it shifts towards. */
  mottle?: number;
  mottleTint?: string;
  /** Fat tint along vessels (only where the bake wrote a fat mask). */
  fat?: number;
  fatColor?: string;
}

const DEFAULTS: Required<Omit<TissueLook, 'color'>> = {
  roughness: 0.5,
  clearcoat: 0.35,
  clearcoatRoughness: 0.35,
  sheen: 0.35,
  sheenColor: '#ffd9cf',
  rim: 0.22,
  rimColor: '#ff8a70',
  ao: 0.85,
  mottle: 0.25,
  mottleTint: '#b07a6e',
  fat: 0,
  fatColor: '#e8c46a',
};

interface TissueUniforms {
  uAO: { value: number };
  uMottle: { value: number };
  uMottleTint: { value: THREE.Color };
  uFat: { value: number };
  uFatColor: { value: THREE.Color };
  uRim: { value: number };
  uRimColor: { value: THREE.Color };
}

export type TissueMaterial = THREE.MeshPhysicalMaterial & { userData: { tissue: TissueUniforms; look: Required<TissueLook> } };

/**
 * Rendering quality. "high" draws the wet coat and velvety sheen; "low" leaves them out (three.js
 * then compiles a much cheaper shader), keeping colour, baked folds and lighting. Low is chosen for
 * software renderers and when frames stay slow; `?quality=high` or `?quality=low` overrides it.
 */
export type Quality = 'high' | 'low';
const qualityListeners = new Set<(q: Quality) => void>();
export const quality = {
  level: 'high' as Quality,
  forced: false,
  set(level: Quality) {
    if (level === this.level) return;
    this.level = level;
    qualityListeners.forEach((fn) => fn(level));
  },
  subscribe(fn: (q: Quality) => void): () => void {
    qualityListeners.add(fn);
    return () => { qualityListeners.delete(fn); };
  },
};

/** The starting quality: the URL override, else low on a software (CPU) renderer, else high. */
export function initialQuality(gl: THREE.WebGLRenderer): Quality {
  const param = new URLSearchParams(window.location.search).get('quality');
  if (param === 'high' || param === 'low') {
    quality.forced = true;
    return param;
  }
  const ctx = gl.getContext();
  const info = ctx.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
  return /swiftshader|llvmpipe|software|basic render/i.test(renderer) ? 'low' : 'high';
}

/** Turns the costly coat and sheen on or off for one material. */
export function applyQuality(material: TissueMaterial, level: Quality) {
  const l = material.userData.look;
  material.clearcoat = level === 'high' ? l.clearcoat : 0;
  material.sheen = level === 'high' ? l.sheen : 0;
}

/**
 * A tissue material for one mesh. `baked` says whether the mesh carries the _TISSUE attribute
 * (the shader reads it only then, so unbaked meshes render correctly too).
 */
export function makeTissueMaterial(look: TissueLook, baked: boolean): TissueMaterial {
  const l = { ...DEFAULTS, ...look };
  const material = new THREE.MeshPhysicalMaterial({
    color: l.color,
    roughness: l.roughness,
    metalness: 0,
    clearcoat: l.clearcoat,
    clearcoatRoughness: l.clearcoatRoughness,
    sheen: l.sheen,
    sheenColor: new THREE.Color(l.sheenColor),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
  }) as TissueMaterial;
  const uniforms: TissueUniforms = {
    uAO: { value: l.ao },
    uMottle: { value: l.mottle },
    uMottleTint: { value: new THREE.Color(l.mottleTint) },
    uFat: { value: l.fat },
    uFatColor: { value: new THREE.Color(l.fatColor) },
    uRim: { value: l.rim },
    uRimColor: { value: new THREE.Color(l.rimColor) },
  };
  material.userData.tissue = uniforms;
  material.userData.look = l;
  applyQuality(material, quality.level);
  if (baked) material.defines = { ...material.defines, USE_TISSUE: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef USE_TISSUE\nattribute vec4 _tissue;\nvarying vec4 vTissue;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_TISSUE\nvTissue = _tissue;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uAO; uniform float uMottle; uniform vec3 uMottleTint;',
          'uniform float uFat; uniform vec3 uFatColor; uniform float uRim; uniform vec3 uRimColor;',
          '#ifdef USE_TISSUE',
          'varying vec4 vTissue;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          'float tissueAO = 1.0;',
          '#ifdef USE_TISSUE',
          '  float tissueFat = clamp(vTissue.b * uFat, 0.0, 1.0);',
          // Fat is bright and glossy even deep in a groove, so it takes less of the occlusion.
          '  tissueAO = mix(1.0, vTissue.r, uAO * (1.0 - 0.75 * tissueFat));',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, uFatColor, tissueFat);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uMottleTint, (1.0 - vTissue.g) * uMottle);',
          '  diffuseColor.rgb *= tissueAO;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <aomap_fragment>',
        [
          '#include <aomap_fragment>',
          // Folds also hide ambient light and reflections, not only the base colour.
          'reflectedLight.indirectDiffuse *= tissueAO;',
          'reflectedLight.indirectSpecular *= tissueAO * tissueAO;',
          'reflectedLight.directSpecular *= mix(1.0, tissueAO, 0.85);',
          '#ifdef USE_CLEARCOAT',
          '  clearcoatSpecularIndirect *= tissueAO * tissueAO;',
          '  clearcoatSpecularDirect *= tissueAO;',
          '#endif',
        ].join('\n'),
      )
      .replace(
        '#include <emissivemap_fragment>',
        [
          '#include <emissivemap_fragment>',
          'float tissueFacing = abs(dot(normal, normalize(vViewPosition)));',
          'totalEmissiveRadiance += uRimColor * uRim * pow(1.0 - tissueFacing, 2.5) * tissueAO * diffuseColor.rgb;',
        ].join('\n'),
      );
  };
  // All tissue materials share one program per USE_TISSUE variant.
  material.customProgramCacheKey = () => (baked ? 'tissue-baked' : 'tissue');
  return material;
}

/** True when a loaded mesh carries the baked _TISSUE attribute. */
export function hasTissueData(mesh: THREE.Mesh): boolean {
  return !!mesh.geometry.getAttribute('_tissue');
}

/** Image-based lighting from three's built-in studio room (no download), for realistic reflections. */
export function makeEnvironment(gl: THREE.WebGLRenderer): { texture: THREE.Texture; dispose(): void } {
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();
  return { texture, dispose: () => texture.dispose() };
}
