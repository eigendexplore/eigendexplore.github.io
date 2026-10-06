// The overview video's studio look for every live 3D view on the page (section 1's replay, section 2's hand): Blender's
// AgX view with the scenes' "Medium High Contrast" look, the four disk area lights of the video's scenes (as
// RectAreaLights, each shadowed through a paired spot light's soft VSM map), an ambient probe of the studio rendered in
// Cycles, and studio geometry carrying its baked Cycles lighting. Built from tools/export_web.py, bake_env.py,
// render_refs.py and export_palm_stage.py on the video's own .blend files.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export const BASE = new URL('../assets/replay/', import.meta.url).href;
export const Z2Y = new THREE.Matrix4().makeRotationX(-Math.PI / 2);     // Blender world (z up) -> three (y up)
export const CAL = { exposure: -0.2, contrast: 1.25 };            // matched to the Cycles frames (tools/replay_ref.html)

// Blender's AgX view with the scenes' "AgX - Medium High Contrast" look: three's AgX with the look's contrast applied in
// AgX log space about mid grey (the look is a log-space contrast grade; three.js ships the base look only)
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `uniform float agxContrast;
  uniform float lookGrade;
  vec3 gradeS( vec3 c ) {           // the overview video's grade (video/scripts/opening/engine.py grade): a soft S and a touch of warmth, in sRGB
    vec3 e = mix( 12.92 * c, 1.055 * pow( max( c, 0.0 ), vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
    e = clamp( ( e - 0.22 * sin( 6.2831853 * e ) / 6.2831853 ) * vec3( 1.012, 1.0, 0.985 ), 0.0, 1.0 );
    return mix( e / 12.92, pow( ( e + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, e ) );
  }
  vec3 CustomToneMapping( vec3 color ) {
    const mat3 AgXInsetMatrix = mat3( vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ), vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ), vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 ) );
    const mat3 AgXOutsetMatrix = mat3( vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ), vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ), vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 ) );
    const float AgxMinEv = - 12.47393; const float AgxMaxEv = 4.026069;
    color *= toneMappingExposure;
    color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
    color = AgXInsetMatrix * color;
    color = max( color, 1e-10 );
    color = log2( color );
    color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
    color = clamp( ( color - 0.6061 ) * agxContrast + 0.6061, 0.0, 1.0 );
    color = agxDefaultContrastApprox( color );
    color = AgXOutsetMatrix * color;
    color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
    color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
    color = clamp( color, 0.0, 1.0 );
    return lookGrade > 0.5 ? gradeS( color ) : color;
  }`);
export const agxContrast = { value: 1.2 };
export const lookGrade = { value: 0 };                           // section 5 sets it while it draws (the video's part 5 cards were graded)
// the scene's four disk lights are RectAreaLights (same area, radiance, pose); three cannot shadow those, so each one is
// paired with a zero-intensity SpotLight at its centre whose (soft, VSM) shadow map scales that area light's contribution
const LIGHTS_CHUNK = THREE.ShaderChunk.lights_fragment_begin.replace('rectAreaLight = rectAreaLights[ i ];', `rectAreaLight = rectAreaLights[ i ];
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		rectAreaLight.color *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLightShadows[ i ].shadowMapSize, spotLightShadows[ i ].shadowIntensity, spotLightShadows[ i ].shadowBias, spotLightShadows[ i ].shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif`);
export function lookMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m.userData.look) continue;
      m.userData.look = true;
      m.onBeforeCompile = sh => {
        sh.uniforms.agxContrast = agxContrast; sh.uniforms.lookGrade = lookGrade;
        sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', LIGHTS_CHUNK);
      };
      m.customProgramCacheKey = () => 'agx-look-arealight-shadows';
    }
  });
}


MeshoptDecoder.useWorkers?.(2);                                   // decode the GLBs' meshopt streams off the main thread
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const glb = {};
export const loadGlb = name => (glb[name] ??= loader.loadAsync(`${BASE}${name}.glb`));
let lightsP = null;
export const loadLights = () => (lightsP ??= fetch(`${BASE}lights.json`).then(r => r.json()));
let rectInit = false;
export function initAreaLights() { if (!rectInit) { RectAreaLightUniformsLib.init(); rectInit = true; } }

// Imagination PowerVR GPUs (the Pixel 10's) hang on a VSM map read inside the area-light loop (LIGHTS_CHUNK), and Chrome
// then blocks WebGL for the whole page; PCF soft shadows there work, kept as soft as VSM's and free of stripes below
function vsmHangs(r) {
  const gl = r.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  return /PowerVR|Imagination/i.test(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
}
// the PCF fallback filters across about three texels, VSM across its radius: there the map is made coarser in step, so
// its edge is as soft as everywhere else (the same shader, only a smaller map)
let pcfFallback = false;
export function shadowSize(base, radius) {
  if (!pcfFallback) return base;
  return Math.min(base, Math.max(64, 2 ** Math.round(Math.log2(base * 2 / Math.max(1, radius)))));   // 2: closest to VSM's look, measured
}
// PCF compares depths directly, so a surface can shadow itself in stripes (VSM never does): there the lookup moves off
// the surface by ~1.5 of the map's texels (their size where the spot aims; far less than the soft edge is wide)
export function fitShadowBias(spot) {
  if (!pcfFallback) return;
  const d = spot.position.distanceTo(spot.target.position), texel = 2 * d * Math.tan(spot.angle) / spot.shadow.mapSize.x;
  spot.shadow.normalBias = 1.5 * texel;
}

export function makeRenderer(canvas, { mobile }) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.CustomToneMapping;
  r.shadowMap.enabled = true;
  if (vsmHangs(r)) pcfFallback = true;
  r.shadowMap.type = pcfFallback ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;
  r.shadowMap.autoUpdate = false;                                 // re-rendered only when a pose changes
  r.setClearColor(0x000000, 0);
  r.setScissorTest(true);
  return r;
}

// ambient: the studio bowl and world as Cycles lights them (the light disks themselves are left out of the probe). The
// file is fetched and decoded once for every renderer that asks (sections 1, 3 and 4 share it); each prefilters its own
const hdrs = {};
export async function studio(renderer, name = 'studio_ambient.hdr') {
  const hdr = await (hdrs[name] ??= new RGBELoader().loadAsync(`${BASE}${name}`));
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(hdr).texture;
  pm.dispose(); hdr.dispose();                               // its GPU copy only: the decoded pixels stay for the next renderer
  return env;
}

export const ENV_SCALE = 8;
export const studioMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(ENV_SCALE, ENV_SCALE, ENV_SCALE) });


// the video's four studio lights in a scene: area light i + its shadow spot i (same order, see LIGHTS_CHUNK)
export function addStudioLights(scene, lights, aim, { mobile = false, angle = 0.42, near = 1, far = 7, radius = 10 } = {}) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), spots = [];
  for (const L of lights) {
    m.set(...L.m.flat()).premultiply(Z2Y).decompose(p, q, sc);
    const area = new THREE.RectAreaLight(0xffffff, L.radiance, L.side, L.side);
    area.position.copy(p); area.quaternion.copy(q);
    const spot = new THREE.SpotLight(0xffffff, 0, 0, angle, 0, 0);
    spot.position.copy(p); spot.target.position.copy(aim);
    spot.castShadow = true;
    const n = shadowSize(mobile ? 512 : 1024, radius); spot.shadow.mapSize.set(n, n);
    spot.shadow.camera.near = near; spot.shadow.camera.far = far;
    spot.shadow.radius = radius; spot.shadow.blurSamples = 12; spot.shadow.bias = -0.0002;
    fitShadowBias(spot);
    scene.add(area, spot, spot.target); spots.push(spot);
  }
  return spots;
}
