// Section 2 = the overview video's method chapter (video/scripts/method/method_v3.py), made live. Same cards and
// carousel (carousel.py: pair -> Standard Exploration widens -> swipe -> EigenDEXplore full -> back to the pair), same
// shots replayed from their own data (tools/export_method_web.py: the collision-free noise S1b, the retarget S4 with its
// MANO overlay, the PC sweeps S2), the same posture-cloud layer (104_pca3d_apple.py: camera, reveal, arrows, rails,
// mean, probe, trail), the EgoSuite panel (ego_panel.py, mirrored), the clip cards around the cloud, the PC halo and
// the hand's name tag, one caption pill per step. The hand is the robot's own mesh in the video's studio look
// (studio3d.js), seen through each card's cam_method. Everything can be dragged; the tour advances on its own.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Z2Y, CAL, agxContrast, lookMaterials, loadGlb, loadLights, initAreaLights, makeRenderer, studio, addStudioLights } from './studio3d.js';
import { buildCollider, safeScale } from './handcollide.js';
import { glassify, pump } from './glass.js';
import { phone, engaged } from './stage.js';
import { quiet, breathe, budget, yieldTask } from './idle.js';
import { orbitDemo } from './orbitdemo.js';

const $ = (s, r = document) => r.querySelector(s);
const S2 = new URL('../assets/s2/', import.meta.url).href;
const FPS = 29.97;
const SIDES = ['js', 'ours'];
const PC_COL = ['#7098b7', '#e1b84e', '#87a08b'], PC_NAME = ['Grasp', 'Claw', 'Twist'];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the stacked layout (as css/site.css and fitS2); asked many times a frame, so kept from the last size change (reading
// clientWidth after a style write would force a layout each time)
let narrowNow = document.documentElement.clientWidth < 760;
new ResizeObserver(() => { narrowNow = document.documentElement.clientWidth < 760; }).observe(document.documentElement);
const narrow = () => narrowNow;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = p => { p = clamp(p, 0, 1); return p * p * p * (p * (6 * p - 15) + 10); };   // carousel.py's smootherstep
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);

// the steps (the video's beats B, C1, C2, C3+C5, C6, D) and their carousel state
const STEPS = [
  { state: 'left_full', card: 'js', dur: 6.5, cap: 'Joint\u2011Space: every joint explores independently',
    sub: 'Each of the 22 joints gets its own random perturbation around the same command. Most of these combinations are postures no hand would make.' },
  { state: 'right_full', card: 'ours', dur: 8.4, cap: 'Human hand videos, retargeted to the robot hand',
    sub: 'An EgoSuite clip of a person using their hand. Each frame of that hand is retargeted to the Sharpa hand, which follows it here.' },
  { state: 'right_full', card: 'ours', dur: 6.6, cap: 'Every frame becomes one hand posture',
    sub: '39,200 retargeted postures from EgoSuite, placed by their first three principal components.' },
  { state: 'right_full', card: 'ours', dur: 12.4, cap: 'PCA finds the directions human hands move along',
    sub: 'Grasp, Claw and Twist are the main directions of human hand postures.' },
  { state: 'right_full', card: 'ours', dur: 6.6, cap: 'Exploring along these directions, without changing the action space',
    sub: 'EigenDEXplore adds noise along the human directions to independent joint noise, with the same total variance as Joint\u2011Space.' },
  { state: 'pair', card: null, dur: null, cap: '',
    sub: 'The same noise budget on both hands: independent joint noise on the left, noise along the human directions on the right.' },
];

export async function init() {
  const stage = $('#mstage'), canvas = $('#mcanvas');
  const renderer = makeRenderer(canvas, { mobile: phone() });
  renderer.autoClear = false;
  initAreaLights();
  const egoKey = 'screwdriver';                          // the hero clip (S4's episode)
  const [robotGltf, lightsData, stageEnv, hand, cards, mj, mbuf, pca, cloudBuf, ovj, postsData, ego] = await Promise.all([
    loadGlb('robot'), loadLights(), studio(renderer, 'stage_ambient.hdr'),
    fetch(`${S2}hand.json`).then(r => r.json()), fetch(`${S2}cards.json`).then(r => r.json()),
    fetch(`${S2}motion.json`).then(r => r.json()), fetch(`${S2}motion.bin`).then(r => r.arrayBuffer()),
    fetch(`${S2}pca3d.json`).then(r => r.json()), fetch(`${S2}cloud.bin`).then(r => r.arrayBuffer()),
    fetch(`${S2}overlay.json`).then(r => r.json()), fetch(`${S2}posts/posts.json`).then(r => r.json()), fetch(`assets/data/ego_${egoKey}.json`).then(r => r.json()),
  ]);
  await yieldTask();                                      // the build below runs in steps, so taps elsewhere get through
  const motion = new Float32Array(mbuf);
  const shot = key => { const e = mj.shots[key]; return { ...e, q: i => { const k = clamp(i, 0, e.n - 1), i0 = Math.floor(k), i1 = Math.min(i0 + 1, e.n - 1), u = k - i0, o = e.offset, out = new Array(22); for (let j = 0; j < 22; j++) out[j] = motion[o + i0 * 22 + j] * (1 - u) + motion[o + i1 * 22 + j] * u; return out; } }; };
  const SH = { js: shot('s1b_js_js'), eigen: shot('s1b_eigen_ours'), sweep: shot('s2_pc_sweeps_ours'), retarget: shot('s4_retarget_ours') };
  const REF = SH.sweep.q(0);                                               // Fig. 2's reference pose (a_q)

  // ---------------------------------------------------------------- the hand (robot meshes, palm stage pose)
  const HIDE = /^V_(iiwa14_link_\d|sharpa_connector|sharpa_mount)/;
  function makeHand() {
    const robot = robotGltf.scene.clone(true), drop = [];
    robot.traverse(o => { if (o.isMesh) { if (HIDE.test(o.name) || HIDE.test(o.parent?.name || '')) drop.push(o); else o.castShadow = o.receiveShadow = true; } });
    drop.forEach(o => o.parent.remove(o));
    for (const [link, ang] of Object.entries(hand.arm_pose)) robot.getObjectByName(`L_${link}`)?.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    const joints = hand.rig.map(([, link, axis]) => ({ node: robot.getObjectByName(`L_${link}`), axis: new THREE.Vector3(...axis) }));
    const world = new THREE.Group(); world.matrixAutoUpdate = false; world.matrix.copy(Z2Y); world.add(robot);
    lookMaterials(world);
    const set = q => { for (let j = 0; j < 22; j++) joints[j].node?.quaternion.setFromAxisAngle(joints[j].axis, q[j]); };
    const meshes = []; world.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { world, robot, set, meshes, palm: robot.getObjectByName('L_left_hand_C_MC') };
  }
  const C = {};
  for (const side of SIDES) {
    const h = makeHand(), scene = new THREE.Scene();
    scene.environment = stageEnv; scene.add(h.world);
    h.set(REF); h.world.updateMatrixWorld(true);
    const box = new THREE.Box3(); h.meshes.forEach(m => box.expandByObject(m));
    const centre = box.getCenter(new THREE.Vector3());
    const lg = new THREE.Group(); scene.add(lg);
    addStudioLights(lg, lightsData, centre, { mobile: phone(), angle: 0.16, near: 1.5, far: 6, radius: 6 });
    // the card's cam_method, re-expressed against the palm this page renders (camera = palm * palm_card^-1 * cam_card)
    const card = cards[side], Pc = new THREE.Matrix4().set(...card.palm.flat()), Cc = new THREE.Matrix4().set(...card.T_world_cam.flat());
    const camW = new THREE.Matrix4().copy(h.palm.matrixWorld).multiply(Pc.clone().invert()).multiply(Cc);
    const cam = new THREE.PerspectiveCamera(2 * Math.atan(540 / card.f_px) * 180 / Math.PI, 16 / 9, 0.01, 20);
    const base = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; camW.decompose(base.p, base.q, new THREE.Vector3());
    const reach = card.reach || reachOf(h, base, card, side);
    h.set(REF); h.world.updateMatrixWorld(true);
    C[side] = { h, scene, cam, base, centre, card, col: null, reach, c: 1, q: REF.slice(), shown: REF.slice(), blend: null, shadowQ: null };
    await yieldTask();
  }
  // phones frame the hand by its own reach: the union of its image box (card camera px) over every pose it plays (stored
  // in cards.json; computed here only if it is missing)
  function reachOf(h, base, card, side) {
    const toCam = new THREE.Matrix4().compose(base.p, base.q, new THREE.Vector3(1, 1, 1)).invert(), v = new THREE.Vector3(), reach = [1e9, 1e9, -1e9, -1e9];
    for (const sh of side === 'js' ? [SH.js] : [SH.eigen, SH.sweep, SH.retarget]) for (let i = 0; i < sh.n; i += 6) {
      h.set(sh.q(i)); h.world.updateMatrixWorld(true);
      for (const m of h.meshes) { const P = m.geometry.attributes.position; for (let j = 0; j < P.count; j += 23) {
        v.fromBufferAttribute(P, j).applyMatrix4(m.matrixWorld).applyMatrix4(toCam); const X = card.cx + card.f_px * v.x / -v.z, Y = card.cy - card.f_px * v.y / -v.z;
        reach[0] = Math.min(reach[0], X); reach[1] = Math.min(reach[1], Y); reach[2] = Math.max(reach[2], X); reach[3] = Math.max(reach[3], Y); } }
    }
    return reach;
  }
  // the self-collision guard (Compare, the Directions sliders) is built in quiet moments, in slices (js/idle.js), after
  // the first frames: spheres fitted to the links at a_q, calibrated on the shots the video's mesh check passed
  async function buildGuard(side) {
    const S = C[side], all = sh => Array.from({ length: sh.n }, (_, i) => sh.q(i)), slice = budget(6);
    const ref = () => { S.h.set(REF); S.h.world.updateMatrixWorld(true); };
    ref();
    const col = await buildCollider(S.h.robot, slice, ref);
    await col.calibrate([...all(SH.js), ...all(SH.eigen)], q => { S.h.set(q); S.h.world.updateMatrixWorld(true); }, slice);
    S.h.set(S.shown); S.h.world.updateMatrixWorld(true); S.col = col;
  }

  // ---------------------------------------------------------------- the halo (video add_halo: silhouette glow, outside only)
  const rtA = new THREE.WebGLRenderTarget(4, 4), rtB = new THREE.WebGLRenderTarget(4, 4), rtM = new THREE.WebGLRenderTarget(4, 4);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const VS = 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const blurMat = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, vertexShader: VS,
    fragmentShader: `uniform sampler2D t; uniform vec2 d; varying vec2 v; void main(){ float w[7]; w[0]=.199; w[1]=.176; w[2]=.121; w[3]=.065; w[4]=.027; w[5]=.009; w[6]=.002;
      float s = texture2D(t, v).r * w[0]; for (int i = 1; i < 7; i++) { s += texture2D(t, v + d * float(i)).r * w[i]; s += texture2D(t, v - d * float(i)).r * w[i]; } gl_FragColor = vec4(vec3(s), 1.); }` });
  const haloMat = new THREE.ShaderMaterial({ uniforms: { g: { value: null }, m: { value: null }, col: { value: new THREE.Color() }, k: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, vertexShader: VS,
    fragmentShader: 'uniform sampler2D g; uniform sampler2D m; uniform vec3 col; uniform float k; varying vec2 v; void main(){ float a = clamp(texture2D(g, v).r * 1.6, 0., 1.) * (1. - texture2D(m, v).r) * k * .65; gl_FragColor = vec4(col, a); }' });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat), quadScene = new THREE.Scene(); quadScene.add(quad);
  function halo(side, hv, H, colHex, k) {
    const S = C[side], w = Math.max(8, Math.round(hv[2] / 4)), h = Math.max(8, Math.round(hv[3] / 4));
    for (const rt of [rtA, rtB, rtM]) if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    renderer.setScissorTest(false);
    S.scene.overrideMaterial = white;
    renderer.setRenderTarget(rtM); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(S.scene, S.cam);
    S.scene.overrideMaterial = null;
    quad.material = blurMat;
    blurMat.uniforms.t.value = rtM.texture; blurMat.uniforms.d.value.set(2.2 / w, 0); renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
    blurMat.uniforms.t.value = rtA.texture; blurMat.uniforms.d.value.set(0, 2.2 / h); renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0); vp(hv, H); renderer.setScissorTest(true);
    quad.material = haloMat; haloMat.uniforms.g.value = rtB.texture; haloMat.uniforms.m.value = rtM.texture; haloMat.uniforms.col.value.set(colHex); haloMat.uniforms.k.value = k;
    renderer.render(quadScene, quadCam);
  }

  // ---------------------------------------------------------------- the posture-cloud layer (104_pca3d_apple.py)
  const L3 = pca.look, W3 = pca.world, CAM3 = pca.camera;
  const cl = { scene: new THREE.Scene(), group: new THREE.Group(), cam: new THREE.PerspectiveCamera(2 * Math.atan(18 / CAM3.lens) * 180 / Math.PI, 1, 0.1, 60), orbit: { az: 0, el: 0, taz: 0, tel: 0 } };
  // the cloud's reflections (arrows, probe): a room environment, made in the warm-up (or by the first cloud frame)
  const roomEnv = () => { if (!cl.scene.environment) { const pmg = new THREE.PMREMGenerator(renderer); cl.scene.environment = pmg.fromScene(new RoomEnvironment(), 0.04).texture; pmg.dispose(); } };
  cl.group.matrixAutoUpdate = false; cl.group.matrix.copy(Z2Y); cl.scene.add(cl.group);
  const toWorld = q => { const B = pca.basis, z = [0, 0, 0]; for (let k = 0; k < 3; k++) { let s = 0; for (let j = 0; j < 22; j++) s += (q[j] - B.mean[j]) * B.components[k][j]; z[k] = s / B.std0 - B.centroid[k]; } return new THREE.Vector3(...z); };
  // the probe, as 100_pca3d_data.py places it: P3 = the sweep's coefficient / std0 along the active PC, P4 = the noise's own
  // PC1-3 coefficients / std0; both times s_k, which puts the larger sweep extreme of each PC exactly at its arrow tip
  const std0 = pca.basis.std0;
  const SK = [0, 1, 2].map(k => { let m = 0; SH.sweep.pc.forEach((p, i) => { if (p === k + 1) m = Math.max(m, Math.abs(SH.sweep.coef[i])); }); return m ? Math.min(1, W3.arrow_len[k] / (m / std0)) : 1; });
  const EIG = SH.eigen.eig.map(c => c.map((x, k) => x / std0 * SK[k]));
  const eigAt = x => {                                                    // Catmull-Rom between frames (the trail's sub-frame samples)
    const n = EIG.length; x = clamp(x, 0, n - 1); const i = Math.floor(x), t = x - i, P = [-1, 0, 1, 2].map(o => EIG[clamp(i + o, 0, n - 1)]);
    return [0, 1, 2].map(k => 0.5 * (2 * P[1][k] + (-P[0][k] + P[2][k]) * t + (2 * P[0][k] - 5 * P[1][k] + 4 * P[2][k] - P[3][k]) * t * t + (-P[0][k] + 3 * P[1][k] - 3 * P[2][k] + P[3][k]) * t ** 3));
  };
  function sweepAt(i) {                                                   // [pc, world position] at sweep frame i
    const n = SH.sweep.n, i0 = clamp(Math.floor(i), 0, n - 1), i1 = Math.min(i0 + 1, n - 1), pc = SH.sweep.pc[i0], v = [0, 0, 0];
    if (!pc) return [0, v];
    const u = SH.sweep.pc[i1] === pc ? clamp(i - i0, 0, 1) : 0, c = SH.sweep.coef[i0] * (1 - u) + SH.sweep.coef[i1] * u;
    v[pc - 1] = c / std0 * SK[pc - 1]; return [pc, v];
  }
  const cloudN = pca.cloud.n, cloudI = new Int16Array(cloudBuf);
  {
    const pos = new Float32Array(cloudN * 3), birth = new Float32Array(cloudN), rng = mulberry(20261001);
    for (let i = 0; i < cloudN * 3; i++) pos[i] = cloudI[i] * pca.cloud.scale;
    for (let i = 0; i < cloudN; i++) birth[i] = pca.reveal.birth_s[0] + rng() * (pca.reveal.birth_s[1] - pca.reveal.birth_s[0]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('birth', new THREE.BufferAttribute(birth, 1));
    cl.pts = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uPx: { value: 1 }, uCol: { value: new THREE.Color(L3.pt_rgb) }, uCue: { value: new THREE.Vector2(CAM3.dist - 2.6, CAM3.dist + 2.6) } },
      vertexShader: `attribute float birth; uniform float uT; uniform float uPx; uniform vec2 uCue; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          float born = smoothstep(birth, birth + ${pca.reveal.dissolve_s.toFixed(2)}, uT);
          float cue = 1. - ${L3.depth_cue.toFixed(2)} * clamp((-mv.z - uCue.x) / (uCue.y - uCue.x), 0., 1.);
          vA = born * cue; gl_PointSize = max(1.3, ${(2 * L3.pt_radius).toFixed(4)} * uPx / -mv.z * 1.25); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA; varying float vA; void main(){ vec2 c = gl_PointCoord - .5; float d = dot(c, c); if (d > .25) discard;
        gl_FragColor = vec4(uCol, smoothstep(.25, .04, d) * vA * uA * ${(L3.pt_alpha * 1.15).toFixed(2)}); }` }));
    cl.pts.frustumCulled = false; cl.group.add(cl.pts);
  }
  const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  cl.arrows = W3.arrow_len.map((Lk, k) => {
    const m = new THREE.MeshStandardMaterial({ color: PC_COL[k], emissive: PC_COL[k], emissiveIntensity: 0.3, roughness: 0.32, metalness: 0, transparent: true, opacity: 0, toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(L3.shaft_r, L3.shaft_r, 1, 20), m), cone = new THREE.Mesh(new THREE.ConeGeometry(L3.cone_r, L3.cone_h, 28), m);
    const g = new THREE.Group(); g.add(shaft, cone); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AX[k]); cl.group.add(g);
    const [lo, hi] = pca.rails.range_world[k];
    const rm = new THREE.MeshBasicMaterial({ color: PC_COL[k], transparent: true, opacity: 0, toneMapped: false });
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(L3.rail_r, L3.rail_r, hi - lo, 10), rm);
    rail.quaternion.copy(g.quaternion); rail.position.copy(AX[k]).multiplyScalar((lo + hi) / 2); cl.group.add(rail);
    return { k, L: Lk, shaft, cone, m, rm };
  });
  const mean = new THREE.Mesh(new THREE.SphereGeometry(L3.mean_r, 24, 16), new THREE.MeshBasicMaterial({ color: L3.mean_rgb, transparent: true, opacity: 0, toneMapped: false }));
  cl.group.add(mean);                                                       // at the origin (the sample's centroid), as in the video
  const probe = new THREE.Mesh(new THREE.SphereGeometry(L3.probe_r, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.15, transparent: true, opacity: 0, toneMapped: false }));
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const probeHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  probeHalo.scale.setScalar(L3.halo_r * 2.4); cl.group.add(probe, probeHalo);
  const TRAIL_SUB = 8, TRAIL = Math.ceil(0.4 * FPS * TRAIL_SUB) + 1, trailPos = new Float32Array(TRAIL * 3), trailAge = new Float32Array(TRAIL).fill(1);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('age', new THREE.BufferAttribute(trailAge, 1));
  const trail = new THREE.Points(trailGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { uO: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float age; varying float vA; uniform float uPx; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
      float r = ${L3.trail_r.toFixed(4)} * pow(1. - age, .6) + .0015; vA = .95 * pow(1. - age, 1.15); gl_PointSize = max(1.5, 2. * r * uPx / -mv.z); }`,
    fragmentShader: `uniform float uO; varying float vA; void main(){ vec2 c = gl_PointCoord - .5; float d = dot(c, c); if (d > .25) discard; gl_FragColor = vec4(.945, .918, .863, vA * uO * smoothstep(.25, .16, d)); }` }));
  trail.frustumCulled = false; cl.group.add(trail);
  const WHITE = new THREE.Color(1, 1, 1), NEUTRAL = new THREE.Color('#F1EADC'), haloCol = new THREE.Color('#F1EADC'), tmpC = new THREE.Color();
  let cloudT = 0;
  function placeCloudCam() {
    const az = (CAM3.az0 + CAM3.span * smooth(cloudT / 26)) * Math.PI / 180 + cl.orbit.az, el = clamp(CAM3.el * Math.PI / 180 + cl.orbit.el, 0.05, 1.35);
    const T = new THREE.Vector3(...CAM3.T), p = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).multiplyScalar(CAM3.dist).add(T);
    cl.cam.position.copy(p.applyMatrix4(Z2Y)); cl.cam.up.set(0, 1, 0); cl.cam.lookAt(T.clone().applyMatrix4(Z2Y)); cl.cam.updateMatrixWorld();
  }

  await yieldTask();
  // ---------------------------------------------------------------- DOM: cards, overlays
  const els = { bg: {}, ov: {} };
  for (const side of SIDES) { els.bg[side] = $(`.m-bg[data-side="${side}"]`); els.ov[side] = $(`.m-ov[data-side="${side}"]`); }
  const capEl = { js: $('.m-ov[data-side="js"] .m-cap'), ours: $('.m-ov[data-side="ours"] .m-cap') };
  const egoEl = $('#mEgo'), egoV = $('#mEgo video'), egoC = $('#mEgo canvas'), egoG = egoC.getContext('2d');
  const postsEl = $('#mPosts'), linesEl = $('#mLines'), pclEls = [...document.querySelectorAll('.m-pcl')], handTag = $('#mHandTag');
  const resetEl = $('#mReset'), subEl = $('#mSub'), scaleRow = $('#mScale'), scaleIn = $('#mScale input'), scaleOut = $('#mScale output');
  const beatBtns = [...document.querySelectorAll('#beats button')], underEl = $('.m-under'), capNEl = $('#mCapN'), beatThumb = $('#beats .seg-thumb');
  let thumbAt = 0;
  const moveBeatThumb = (i = thumbAt) => { thumbAt = i; const b = beatBtns[i]; beatThumb.style.width = `${b.offsetWidth}px`; beatThumb.style.transform = `translateX(${b.offsetLeft}px)`; };
  addEventListener('resize', () => moveBeatThumb()); document.fonts?.ready.then(() => moveBeatThumb());

  // the hero clip (S4's episode): the panel frames the hands, mirrored so the person's right hand reads as our left
  egoV.src = `assets/ego/ego_${egoKey}.mp4`; egoV.poster = `assets/ego/ego_${egoKey}.jpg`; egoV.preload = 'auto';
  $('#mEgo .m-ego-t').textContent = ego.title;
  const egoBox = (() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const f of ego.keypoints) for (const k of [f.l, f.r]) if (k) for (let j = 0; j < 42; j += 2) { const x = k[j] / 2, y = k[j + 1] / 2; if (x < -50 || x > 760 || y < -50 || y > 590) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const pad = 0.35; return { cx: 712 - (x0 + x1) / 2, cy: (y0 + y1) / 2, bw: (x1 - x0) * (1 + pad), bh: (y1 - y0) * (1 + pad) }; })();

  // ---------------------------------------------------------------- S4's MANO hand, live (84_method_v2_blender.build_overlay)
  // the clip's human hand, laid on the robot by the video's display fit, in our palm frame: the skin (one front layer at
  // the video's max_alpha), its 22 chain points, the robot's matching sites and the lines between them. Drawn over the
  // robot like the video's overlay pass, and, being 3D, it stays on while the hand is orbited.
  const mano = { ready: false, op: 0, group: new THREE.Group() };
  mano.group.matrixAutoUpdate = false; C.ours.scene.add(mano.group);
  C.ours.scene.traverse(o => { if (o.isLight) o.layers.enable(1); });
  (async () => {
    const [mjn, mb] = await Promise.all([fetch(`${S2}mano.json`).then(r => r.json()), fetch(`${S2}mano.bin`).then(r => r.arrayBuffer())]);
    const A = (k, T) => { const l = mjn.layout[k]; return new T(mb, l.offset, l.shape.reduce((a, b) => a * b, 1)); };
    const bsc = A('basis_scale', Float32Array), bq = A('basis', Int16Array), K = mjn.rank, NV = mjn.verts * 3;
    const basis = new Float32Array(K * NV); for (let k = 0; k < K; k++) for (let j = 0; j < NV; j++) basis[k * NV + j] = bq[k * NV + j] * bsc[k];
    Object.assign(mano, { j: mjn, mean: A('mean', Float32Array), coef: A('coef', Float32Array), chain: A('chain', Float32Array), basis, K, NV });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NV), 3)); geo.setIndex(new THREE.BufferAttribute(A('faces', Uint16Array), 1));
    mano.geo = geo;
    const L1 = o => { o.layers.set(1); o.frustumCulled = false; return o; };
    const mask = L1(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })));       // depth first: only the front layer gets colour
    mano.skin = new THREE.MeshStandardMaterial({ color: mjn.colors.mano, emissive: mjn.colors.mano, emissiveIntensity: 0.3, roughness: 0.55, metalness: 0, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide });
    mano.alpha = 1 - (1 - mjn.max_alpha) ** 2;            // Cycles saw the closed skin through two surfaces at max_alpha each
    const skin = L1(new THREE.Mesh(geo, mano.skin)); mask.renderOrder = 0; skin.renderOrder = 1;
    const ball = new THREE.SphereGeometry(1, 16, 10), rod = new THREE.CylinderGeometry(1, 1, 1, 10);
    const mat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.4, transparent: true, depthWrite: true });
    mano.mats = [mat(mjn.colors.tip, 0.6), mat(mjn.colors.site, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false })];
    mano.tips = L1(new THREE.InstancedMesh(ball, mano.mats[0], 22)); mano.sites = L1(new THREE.InstancedMesh(ball, mano.mats[1], 22)); mano.lines = L1(new THREE.InstancedMesh(rod, mano.mats[2], 22));
    const tipC = new THREE.Color(mjn.colors.line).multiplyScalar(1.6), lineC = new THREE.Color(mjn.colors.line);
    mjn.corr_is_tip.forEach((t, j) => mano.lines.setColorAt(j, t ? tipC : lineC));
    mano.links = mjn.corr_links.map(lk => C.ours.h.robot.getObjectByName(`L_${lk}`));
    mano.group.add(mask, skin, mano.tips, mano.sites, mano.lines);
    lookMaterials(mano.group);                            // the studio look (AgX contrast, area-light shading) like the robot
    mano.ready = true;
  })().catch(e => console.error('mano', e));
  const mM = new THREE.Matrix4(), mP = new THREE.Vector3(), mQ = new THREE.Quaternion(), mS = new THREE.Vector3(), mA = new THREE.Vector3(), mB = new THREE.Vector3(), mY = new THREE.Vector3(0, 1, 0), mInv = new THREE.Matrix4();
  function poseMano(x) {                                  // clip frame x (fractional): skin, chain points, sites, lines
    const m = mano, n = m.j.frames, i0 = clamp(Math.floor(x), 0, n - 1), i1 = Math.min(i0 + 1, n - 1), u = clamp(x - i0, 0, 1), K = m.K, NV = m.NV;
    const c = new Float32Array(K); for (let k = 0; k < K; k++) c[k] = m.coef[i0 * K + k] * (1 - u) + m.coef[i1 * K + k] * u;
    const pos = m.geo.attributes.position.array; pos.set(m.mean);
    for (let k = 0; k < K; k++) { const ck = c[k], o = k * NV; if (Math.abs(ck) < 1e-7) continue; for (let j = 0; j < NV; j++) pos[j] += ck * m.basis[o + j]; }
    m.geo.attributes.position.needsUpdate = true; m.geo.computeVertexNormals();
    const palm = C.ours.h.palm; palm.updateWorldMatrix(true, false); m.group.matrix.copy(palm.matrixWorld); m.group.matrixWorldNeedsUpdate = true; mInv.copy(palm.matrixWorld).invert();
    const R = m.j.radii;
    for (let j = 0; j < 22; j++) {
      const tip = m.j.corr_is_tip[j], q = (i0 * 22 + j) * 3, q1 = (i1 * 22 + j) * 3;
      mA.set(m.chain[q] * (1 - u) + m.chain[q1] * u, m.chain[q + 1] * (1 - u) + m.chain[q1 + 1] * u, m.chain[q + 2] * (1 - u) + m.chain[q1 + 2] * u);
      m.links[j].getWorldPosition(mB).applyMatrix4(mInv);                     // the robot's site, in the palm frame
      m.tips.setMatrixAt(j, mM.compose(mA, mQ.identity(), mS.setScalar(tip ? R.tip : R.chain)));
      m.sites.setMatrixAt(j, mM.compose(mB, mQ.identity(), mS.setScalar(tip ? R.site_tip : R.site)));
      const d = mB.clone().sub(mA), L = d.length(), rr = tip ? R.line_tip : R.line;
      m.lines.setMatrixAt(j, mM.compose(mP.copy(mA).add(mB).multiplyScalar(0.5), mQ.setFromUnitVectors(mY, d.divideScalar(L || 1)), mS.set(rr, Math.max(L, 1e-6), rr)));
    }
    m.tips.instanceMatrix.needsUpdate = m.sites.instanceMatrix.needsUpdate = m.lines.instanceMatrix.needsUpdate = true;
    m.skin.opacity = m.op * m.alpha; m.mats.forEach(t => { t.opacity = m.op; });
  }
  egoV.addEventListener('ended', () => { $('#mEgo').classList.add('ended'); });
  $('#mEgoReplay').addEventListener('click', () => { takeOver(); $('#mEgo').classList.remove('ended'); egoV.currentTime = 0; egoV.play().catch(() => {}); st.u = 0; });

  // the lit points of the cloud: 150 real EgoSuite postures spread over it (tools/export_posture_points.py), each with a
  // still of its own frame, the hand in question traced in gold. Six light up on their own at the video's card slots
  // (method_v3.draw_postures, which of them: pickPosts); any lit point can be tapped: its still shows, the hand takes it.
  const POSTS = postsData.points.map(p => ({ ...p, w: toWorld(p.q) }));
  const NSLOT = 6;
  postsEl.innerHTML = Array.from({ length: NSLOT }, (_, s) => `<figure class="m-post lg" data-s="${s}"><div class="m-post-m"><img alt="" decoding="async"></div></figure>`).join('')
    + Array.from({ length: NSLOT }, (_, s) => `<span class="m-bead" data-s="${s}"></span>`).join('') + '<span class="m-bead hover"></span>';
  const postEls = [...postsEl.querySelectorAll('.m-post')], beadEls = [...postsEl.querySelectorAll('.m-bead[data-s]')], beadHover = postsEl.querySelector('.m-bead.hover');
  let autoPick = [0, 1, 2, 3, 4, 5], hoverPost = -1;
  const stillURL = j => `${S2}posts/stills/${POSTS[j].still}`;
  {                                                       // the lit points themselves: small gold glows in the cloud layer
    const g = new THREE.BufferGeometry(), pos = new Float32Array(POSTS.length * 3), del = new Float32Array(POSTS.length), rng = mulberry(7);
    POSTS.forEach((p, i) => { pos.set([p.w.x, p.w.y, p.w.z], i * 3); del[i] = rng(); });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('d', new THREE.BufferAttribute(del, 1));
    cl.lit = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uS: { value: 8 } },
      vertexShader: 'attribute float d; uniform float uT; uniform float uS; varying float vA; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); vA = smoothstep(1.0 + d * 1.8, 1.4 + d * 1.8, uT); gl_PointSize = uS; }',
      fragmentShader: 'uniform float uA; varying float vA; void main(){ float r = length(gl_PointCoord - .5); if (r > .5) discard; float core = smoothstep(.3, .16, r), glow = smoothstep(.5, .18, r) * .5;' +
        ' gl_FragColor = vec4(mix(vec3(.88, .72, .31), vec3(1., .96, .84), core * .55), (core + glow) * vA * uA); }' }));
    cl.lit.frustumCulled = false; cl.group.add(cl.lit);
  }

  // ---------------------------------------------------------------- state, carousel
  const st = { step: 0, u: 0, tour: !reduced, visible: false, started: false, interacted: false, scale: 1, post: -1, postAt: 0, postSlot: 0, pcJump: null,
    orb: { az: 0, el: 0, taz: 0, tel: 0 }, engaged: false, jsT: 0, oursT: 0, split: 0, s4w: 0, manual: false, dirs: [0, 0, 0],
    birthT: 0, arrowKeep: 0, probeFrom: [0, 0, 0], probeT0: 0, hPc: 0, hK: 0, trailA: 0, peekAt: 0, peekYaw: 0, hov: { x: 0, y: 0, tx: 0, ty: 0 } };
  const GAP = () => (narrow() ? 8 : 14);
  const STATES = (W, H) => { const g = GAP(), half = (W - g) / 2;
    if (narrow()) return {                              // phones: the pair stacks, so the carousel runs vertically
      pair: { js: [0, 0, W, (H - g) / 2], ours: [0, (H + g) / 2, W, (H - g) / 2] },
      left_full: { js: [0, 0, W, H], ours: [0, H + g, W, H] },
      right_full: { js: [0, -H - g, W, H], ours: [0, 0, W, H] } };
    return {
      pair: { js: [0, 0, half, H], ours: [half + g, 0, half, H] },
      left_full: { js: [0, 0, W, H], ours: [W + g, 0, W, H] },
      right_full: { js: [-W - g, 0, W, H], ours: [0, 0, W, H] } }; };
  let lay = { from: null, to: 'pair', t0: 0 }, rectNow = null;
  function goState(to, now) { if (to === lay.to) return; lay = { from: { js: rectNow.js.slice(), ours: rectNow.ours.slice() }, to, t0: now }; }
  function rectsAt(now) {
    const S = STATES(stage.clientWidth, stage.clientHeight)[lay.to];
    if (!lay.from) return { js: S.js.slice(), ours: S.ours.slice() };
    const e = ease((now - lay.t0) / 800), out = {};
    for (const s of SIDES) out[s] = lay.from[s].map((v, i) => v + (S[s][i] - v) * e);
    if (e >= 1) lay.from = null;
    return out;
  }

  // S4 (the retarget beat) has its own camera: cam_method moved back along its view axis with a lens shift, blended in
  // and out per frame (st.s4w); the MANO overlay frames were rendered through it, so the robot is too
  const S4 = ovj.s4cam;
  // the hand's view in a card: the video's crop window (carousel crop_window / window_centre), scaled to fit the card
  function handView(side, hv) {
    const S = C[side], cr = S.card.crops, w = hv[2], h = hv[3], b = side === 'ours' ? st.s4w : 0;
    const pcx = S.card.cx + (960 - S4.shift_x * 1920 - S.card.cx) * b, pcy = S.card.cy + (540 + S4.shift_y * 1920 - S.card.cy) * b;
    let k, cx, cy;
    if (narrow()) {                                     // phones: the hand's reach, padded, as large as the card allows
      const R = S.reach, pw = (R[2] - R[0]) * 1.1, ph = (R[3] - R[1]) * 1.12;
      k = Math.min(w / pw, h / ph); cx = (R[0] + R[2]) / 2; cy = (R[1] + R[3]) / 2;
    } else {                                            // the video's crop window (carousel crop_window / window_centre)
      k = Math.min(w / 922, h / 1024);
      const p = clamp((1864 - w / k) / (1864 - 922), 0, 1);
      cx = cr.full_width.centre[0] + (cr.card.centre[0] - cr.full_width.centre[0]) * p; cy = cr.full_width.centre[1] + (cr.card.centre[1] - cr.full_width.centre[1]) * p;
    }
    const ww = w / k, wh = h / k;
    const x0 = cx - ww / 2, y0 = cy - wh / 2;
    S.cam.setViewOffset(1920, 1080, x0 - (pcx - 960), y0 - (pcy - 540), ww, wh);
    return { k, x0, y0 };                                        // camera px -> viewport px: (X - x0) * k
  }
  // cam_method, rigidly orbited about the hand's centre (the centre keeps its pixel)
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), back = new THREE.Vector3(), LEAN = [0.2, 0.1];   // hover lean at the card's edge (rad)
  function placeHandCam(side) {
    const S = C[side], up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.base.q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.base.q);
    tq.setFromAxisAngle(up, st.orb.az + st.peekYaw - LEAN[0] * st.hov.x).multiply(tq2.setFromAxisAngle(right, st.orb.el - LEAN[1] * st.hov.y));
    back.set(0, 0, 1).applyQuaternion(S.base.q).multiplyScalar(side === 'ours' ? S4.dz_m * st.s4w : 0);
    S.cam.position.copy(S.base.p).add(back).sub(S.centre).applyQuaternion(tq).add(S.centre);
    S.cam.quaternion.copy(tq).multiply(S.base.q); S.cam.updateMatrixWorld();
  }
  // the layers' places in a card (the video's card coordinates, 1864 x 1024, scaled); phones stack them
  function slots(side, r) {
    const [x, y, w, h] = r, kk = h / 1024;
    if (narrow()) {
      const sq = Math.min(w - 8, h * 0.56), e = side === 'ours' ? st.split : 0;  // the hand moves down (eased) while a layer sits above it
      const eh = Math.min((w - 20) * 0.66, h * 0.42 - 46), ew = eh / 0.66;      // the clip panel stays above the hand
      return { hand: [x, y + h * 0.42 * e, w, h * (1 - 0.42 * e)], cloud: [x + (w - sq) / 2, y + 8, sq, sq], ego: [x + (w - ew) / 2, y + 46, ew, eh], k: w / 1000 };
    }
    return { hand: r, cloud: [x + 20 * kk, y + 12 * kk, 1000 * kk, 1000 * kk], ego: [x + 40 * kk, y + 150 * kk, 960 * kk, 720 * kk], k: kk };
  }

  // ---------------------------------------------------------------- steps
  function setStep(i, now = performance.now()) {
    if (st.step === 5 && i !== 5) st.jsT = 0;
    st.step = i; st.u = 0; st.post = -1; st.pcJump = null;
    for (const s of SIDES) C[s].blend = { q: C[s].shown.slice(), t0: now };       // each beat's motion starts from where the hand is
    // the cloud layer starts each beat from what is on screen: a revealed cloud stays revealed, grown arrows stay grown,
    // the probe glides from where it is (a click mid-beat then looks like the tour's own hand-over)
    if (i === 2 && cloudAlpha < 0.1) st.birthT = 0;
    st.arrowKeep = arrowsOn > 0.5 ? 1 : 0;
    st.probeFrom = probe.position.toArray(); st.probeT0 = now;
    if (rectNow) goState(STEPS[i].state, now);
    beatBtns.forEach((b, j) => { b.setAttribute('aria-current', j === i ? 'true' : 'false'); b.querySelector('i').style.transform = j < i ? 'scaleX(1)' : 'scaleX(0)'; });
    // the text and controls under the stage change with the step: their row eases to its new height (the page below
    // glides instead of jumping) and the new words fade in
    const h0 = underEl.offsetHeight;
    subEl.textContent = STEPS[i].sub; capNEl.textContent = STEPS[i].cap || beatBtns[i].querySelector('.t').textContent;
    moveBeatThumb(i);
    scaleRow.classList.toggle('on', i === 5); dirRow.classList.toggle('on', i === 3); resetDirs();
    easeUnder(h0);
    $('#mEgo').classList.remove('ended');
    if (i === 1) { egoV.currentTime = 0; if (st.engaged) egoV.play().catch(() => {}); } else egoV.pause();
    if (i === 5) { st.oursT = st.oursT || 0; }
    const nav = $('#beats'), bt = beatBtns[i];
    if (nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: bt.offsetLeft - (nav.clientWidth - bt.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
    glassify(document);
  }
  function easeUnder(h0) {
    if (reduced || !st.started) return;
    underEl.style.height = ''; const h1 = underEl.offsetHeight;
    for (const el of [capNEl, subEl, scaleRow, dirRow]) if (el.offsetParent) el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (Math.abs(h1 - h0) < 1) return;
    underEl.getAnimations().forEach(a => a.cancel());
    underEl.style.overflow = 'hidden';
    underEl.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => { underEl.style.overflow = ''; };
  }
  function takeOver() {
    st.interacted = true; demo.stop(performance.now(), false);
    if (st.tour) { st.tour = false; $('#tour').classList.add('paused'); $('#tourBtn').setAttribute('aria-label', 'Resume the tour'); }
  }
  $('#tourBtn').addEventListener('click', () => {
    st.tour = !st.tour; st.interacted = true;
    $('#tour').classList.toggle('paused', !st.tour); $('#tourBtn').setAttribute('aria-label', st.tour ? 'Pause the tour' : 'Resume the tour');
    if (st.tour) setStep(st.step === 5 ? 0 : st.step);
  });
  beatBtns.forEach(b => b.addEventListener('click', () => { takeOver(); setStep(+b.dataset.beat); }));
  scaleIn.addEventListener('input', () => { takeOver(); st.scale = scaleIn.value / 100; scaleOut.textContent = `${st.scale.toFixed(2)}×`; });
  postEls.forEach(c => c.addEventListener('click', () => { if (c._j != null) selectPost(c._j); }));
  // Directions, by hand: one slider per PC (centre = a_q, ends = the video's sweep extremes); they combine, the collision
  // guard keeps the pose valid, the probe follows. Tapping a PC label plays that direction's sweep again.
  const dirRow = $('#mDirs'), dirEls = [...document.querySelectorAll('#mDirs input')];
  const SWEEP = [1, 2, 3].map(k => { const v = SH.sweep.coef.filter((_, i) => SH.sweep.pc[i] === k); return [Math.min(...v), Math.max(...v)]; });
  const LO = hand.joint_lower, HI = hand.joint_upper, COMP = pca.basis.components;
  const dirCoef = () => st.dirs.map((d, k) => (d >= 0 ? d * SWEEP[k][1] : -d * SWEEP[k][0]));
  const manualQ = () => { const c = dirCoef(); return REF.map((r, j) => clamp(r + c[0] * COMP[0][j] + c[1] * COMP[1][j] + c[2] * COMP[2][j], LO[j], HI[j])); };
  const resetDirs = () => { st.manual = false; st.dirs = [0, 0, 0]; dirEls.forEach(e => { e.value = 0; }); };
  dirEls.forEach((el, k) => el.addEventListener('input', () => {
    takeOver(); if (!st.manual) { st.manual = true; st.dirs = [0, 0, 0]; dirEls.forEach((e, j) => { if (j !== k) e.value = 0; }); C.ours.blend = { q: C.ours.shown.slice(), t0: performance.now() }; }
    st.dirs[k] = el.value / 100;
  }));
  pclEls.forEach((el, k) => el.addEventListener('click', () => { takeOver(); resetDirs(); st.pcJump = k + 1; st.u = 2; st.probeFrom = probe.position.toArray(); st.probeT0 = performance.now(); }));
  resetEl.addEventListener('click', () => { st.orb.taz = st.orb.tel = 0; cl.orbit.taz = cl.orbit.tel = 0; });

  // dragging: on the cloud it turns the cloud, elsewhere both hands together (as in section 1)
  const demo = orbitDemo({ key: 'eg-orbit-demo-s2' });
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button, .m-ego, .m-post, input')) return;
    if (e.pointerType === 'mouse') e.preventDefault();                     // a drag must not select the text around it
    const dy = demo.stop(performance.now(), true); if (dy) { st.orb.az += dy; st.orb.taz += dy; st.peekYaw = 0; }
    const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, cs = slots('ours', rectNow.ours).cloud;
    const onCloud = cloudAlpha > 0.3 && x >= cs[0] && x <= cs[0] + cs[2] && y >= cs[1] && y <= cs[1] + cs[3];
    drag = { x: e.clientX, y: e.clientY, onCloud, id: e.pointerId, moved: 0 }; stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag && e.pointerType === 'mouse') {
      hoverPost = nearestPost(e.clientX, e.clientY, 18); stage.style.cursor = hoverPost >= 0 ? 'pointer' : '';
      // the hand leans a few degrees toward the pointer, as a drag that way would turn it (desktop: it invites the drag)
      const sr = stage.getBoundingClientRect(), x = e.clientX - sr.left, y = e.clientY - sr.top, r = rectNow && SIDES.map(s => rectNow[s]).find(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh);
      const free = r && !reduced && Math.abs(st.orb.taz) + Math.abs(st.orb.tel) < 0.02;   // once orbited, the view is the reader's: no lean
      st.hov.tx = free ? clamp((x - r[0] - r[2] / 2) / (r[2] / 2), -1, 1) : 0; st.hov.ty = free ? clamp((y - r[1] - r[3] / 2) / (r[3] / 2), -1, 1) : 0;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4 && !drag.real) {                    // a real drag (not a tap): the lean becomes part of the orbit, so nothing jumps
      drag.real = true; takeOver();
      const h = st.hov; st.orb.az -= LEAN[0] * h.x; st.orb.taz -= LEAN[0] * h.x; st.orb.el -= LEAN[1] * h.y; st.orb.tel -= LEAN[1] * h.y; h.x = h.y = h.tx = h.ty = 0;
    }
    if (drag.onCloud) { cl.orbit.taz -= dx * 0.008; cl.orbit.tel = clamp(cl.orbit.tel + dy * 0.006, -0.5, 0.8); }
    else { st.orb.taz -= dx * 0.0065; if (e.pointerType !== 'touch') st.orb.tel = clamp(st.orb.tel - dy * 0.0045, -0.6, 0.6); }
  });
  const endDrag = e => {                                  // a tap (no drag) on the posture cloud picks the nearest lit point
    if (drag && e.type === 'pointerup' && drag.moved < 6 && st.step === 2) { const j = nearestPost(e.clientX, e.clientY, e.pointerType === 'touch' ? 32 : 22); if (j >= 0) selectPost(j); }
    drag = null; stage.classList.remove('grabbing');
  };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { hoverPost = -1; stage.style.cursor = ''; st.hov.tx = st.hov.ty = 0; });
  stage.addEventListener('dblclick', () => { st.orb.taz = st.orb.tel = 0; cl.orbit.taz = cl.orbit.tel = 0; });

  // ---------------------------------------------------------------- per-frame content
  let cloudAlpha = 0, arrowsOn = 0, egoA = 0, cloudGain = 1, postA = 0;
  const fz = { u: 0, post: -1, postAt: 0, slot: 0 };       // the posture cloud's overlays as last shown
  const loopQ = (S, t, easeOut) => {                     // a noise clip as a seamless loop: eased back to a_q at its end
    const T = S.n / FPS, tt = t % T, f = 1 - smooth(seg(tt, T - easeOut, T)), q = S.q(tt * FPS);
    return q.map((v, j) => REF[j] + (v - REF[j]) * f);
  };
  function pcActive(i) {
    const P = SH.sweep.pc, f = Math.min(SH.sweep.n - 1, Math.max(0, Math.floor(i))), pc = P[f]; if (!pc) return [0, 0];
    let j0 = f, j1 = f; while (j0 > 0 && P[j0 - 1] === pc) j0--; while (j1 < SH.sweep.n - 1 && P[j1 + 1] === pc) j1++;
    return [pc, smooth(seg(i, j0, j0 + 8)) * (1 - smooth(seg(i, j1 - 8, j1)))];
  }
  const sweepI = () => (st.pcJump ? SH.sweep.pc.indexOf(st.pcJump) : 0) + (st.u - 2) * FPS;
  function dirActive() {                                  // [pc, strength] in Directions: the sweep's, or the one slider moved
    if (st.step !== 3) return [0, 0];
    if (!st.manual) return st.u > 2 ? pcActive(sweepI()) : [0, 0];
    // a direction is named only while it is the only one moved: two or three together are a mix, not Grasp or Claw
    const moved = st.dirs.map((d, j) => (Math.abs(d) > 0.02 ? j : -1)).filter(j => j >= 0);
    if (moved.length !== 1) return [0, 0];
    const k = moved[0];
    return [k + 1, Math.min(1, Math.abs(st.dirs[k]) * 3)];
  }
  function poseFor(side) {
    const s = st.step, u = st.u;
    if (side === 'js') return loopQ(SH.js, s === 5 ? st.jsT : u, 1.0);
    if (s === 0) return REF;
    if (s === 1) return SH.retarget.q(egoV.currentTime * 30);
    if (s === 2) return st.post < 0 ? REF : POSTS[st.post].q;                // eased by the pose blend set on selection
    if (s === 3) return st.manual ? manualQ() : u < 2 ? REF : SH.sweep.q(sweepI());
    if (s === 4) return loopQ(SH.eigen, u, 0.02);
    return loopQ(SH.eigen, st.oursT, 0.02);
  }

  // ---------------------------------------------------------------- frame
  // drawn whenever any of it shows; its clock (tour, motion, clips) runs only while most of it is on screen
  const isVis = () => { const r = stage.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  let last = performance.now(), lastTick = 0, firstFrame = true, lastDraw = 0;
  function vp(r, H) { const y = H - r[1] - r[3]; renderer.setViewport(r[0], y, r[2], r[3]); renderer.setScissor(Math.max(0, r[0]), Math.max(0, y), Math.max(0, r[2]), Math.max(0, r[3])); }
  function tick(now) {
    lastTick = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    st.visible = isVis();
    const eg = engaged(stage, st.engaged); if (eg !== st.engaged) { st.engaged = eg; if (!eg) egoV.pause(); else if (st.step === 1) egoV.play().catch(() => {}); }
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!rectNow) rectNow = rectsAt(now);
    if (!st.visible) { warmQ.shift()?.(); return; }
    if (!st.started && st.engaged) { st.started = true; st.startAt = now + 900; st.u = 0; st.peekAt = now + 1700; }
    if (st.startAt && now >= st.startAt) { st.startAt = 0; if (st.step === 0) goState('left_full', now); }
    if (canvas._w !== W || canvas._h !== H) { renderer.setSize(W, H, false); canvas._w = W; canvas._h = H; }
    // tour
    const dtp = st.engaged ? dt : 0;                     // the beat's clock only runs while it is being watched
    st.u += dtp; st.jsT += dtp; st.oursT += dtp; st.dtp = dtp;
    const step = STEPS[st.step];
    if (st.tour && step.dur) {
      beatBtns[st.step].querySelector('i').style.transform = `scaleX(${clamp(st.u / step.dur, 0, 1)})`;
      if (st.u >= step.dur) setStep(st.step + 1, now);
    }
    rectNow = rectsAt(now);
    for (const s of SIDES) { const [x, y, w, h] = rectNow[s]; for (const el of [els.bg[s], els.ov[s]]) { el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.width = `${w.toFixed(1)}px`; el.style.height = `${h.toFixed(1)}px`; } }
    // the hint that the hand can be turned (once a visit, js/orbitdemo.js): it turns a little on its own and back
    if (st.peekAt && now >= st.peekAt) { demo.start(now); st.peekAt = 0; }
    st.peekYaw = demo.yaw(now);
    { const h = st.hov, k = 1 - Math.exp(-dt * 3.5); h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k; }     // the hover lean, slow and soft
    // orbit easing
    for (const o of [st.orb, cl.orbit]) { const k = 1 - Math.exp(-dt * 10); o.az += (o.taz - o.az) * k; o.el += (o.tel - o.el) * k; }
    resetEl.classList.toggle('on', Math.abs(st.orb.taz) + Math.abs(st.orb.tel) + Math.abs(cl.orbit.taz) + Math.abs(cl.orbit.tel) >= 0.02);   // fades in / out
    // layer alphas, eased like the video's beats
    // layers leave quickly (gone before the carousel has moved far), and come in at the beat's pace
    const k3 = 1 - Math.exp(-dt * 5), kOut = 1 - Math.exp(-dt * 16);
    const egoT = st.step === 1 ? 1 : 0, cloudTg = st.step >= 2 && st.step <= 4 ? 1 : 0;
    egoA += (egoT - egoA) * (egoT < egoA ? kOut : k3);
    cloudAlpha += (cloudTg - cloudAlpha) * (cloudTg < cloudAlpha ? kOut : k3);
    st.s4w = st.step === 1 ? S4.w[Math.min(S4.w.length - 1, Math.floor(egoV.currentTime * 30))] : st.s4w * Math.exp(-dt * 6);
    st.split += ((st.step >= 1 && st.step <= 4 ? 1 : 0) - st.split) * (1 - Math.exp(-dt * 7));
    const arrowsT = st.step === 3 ? Math.max(st.arrowKeep, smooth(seg(st.u, 0.1, 1.9))) : st.step === 4 ? 1 : 0;
    // the posture cloud's reveal: on its own beat it follows the beat's clock (the video's P1); elsewhere it completes
    if (cloudAlpha < 0.02 && st.step !== 2) st.birthT = 0;
    st.birthT = st.step === 2 ? Math.max(st.birthT, st.u) : Math.min(99, st.birthT + dt * 3);
    // step 2's cards and lit points leave as they were (frozen), fading; the trail fades in and out with Exploring
    postA += ((st.step === 2 ? 1 : 0) - postA) * (st.step === 2 ? k3 : 1 - Math.exp(-dt * 9));
    if (st.step === 2) Object.assign(fz, { u: st.u, post: st.post, postAt: st.postAt, slot: st.postSlot });
    st.trailA += ((st.step === 4 ? 1 : 0) - st.trailA) * (st.step === 4 ? k3 : kOut);
    arrowsOn = st.step === 3 ? arrowsT : arrowsOn + (arrowsT - arrowsOn) * k3;
    // drawn at most ~60 times a second (the motion is 29.97 fps data; on a 120 Hz screen drawing every refresh only makes
    // the frame pacing uneven): the clocks above run every tick
    if (now - lastDraw < 12.5) return;
    lastDraw = now;
    // poses (compare: the noise scale, kept collision-free)
    for (const s of SIDES) {
      const S = C[s]; let q = poseFor(s);
      if (S.blend) { const e = ease((now - S.blend.t0) / 550), q0 = S.blend.q; q = q.map((v, j) => q0[j] + (v - q0[j]) * e); if (e >= 1) S.blend = null; }
      S.q = q;
      if (st.step === 5 || (st.step === 3 && st.manual && s === 'ours')) {
        const apply = c => { S.h.set(S.shown = q.map((x, j) => REF[j] + (x - REF[j]) * c)); S.h.world.updateMatrixWorld(true); };
        const want = st.step === 5 ? st.scale : 1, cs = S.col ? safeScale(S.col, apply, want) : want;   // the guard, once built
        S.c = Math.min(cs, S.c + dt * 1.5); apply(S.c);
      } else { S.c = st.scale; S.h.set(S.shown = q); }
    }
    // draw (a warm-up draw first, if one is waiting: the frame's clear below wipes its pixel)
    warmQ.shift()?.();
    renderer.setScissorTest(true); renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor(0x000000, 0); renderer.clear();
    clipCanvas(W);
    const tExp = Math.pow(2, hand.exposure + CAL.exposure);
    for (const s of SIDES) {
      const r = rectNow[s]; if (r[0] + r[2] < 1 || r[0] > W - 1 || r[1] + r[3] < 1 || r[1] > H - 1) continue;
      const sl = slots(s, r);
      if (s === 'ours' && cloudAlpha > 0.01) drawCloud(sl.cloud, H, dt, k3);
      const hv = sl.hand; vp(hv, H);
      const view = handView(s, hv); placeHandCam(s);
      C[s].cam.aspect = 1920 / 1080; C[s].cam.updateProjectionMatrix();          // the window is set by the view offset
      if (s === 'ours') {
        const [pc, kk] = dirActive();                   // the halo and the tag fade out (a click may leave mid-sweep)
        if (pc) st.hPc = pc;
        st.hK = pc ? kk : st.hK * Math.exp(-dt * 7);
        if (st.hPc && st.hK > 0.01) halo(s, hv, H, PC_COL[st.hPc - 1], st.hK);
        handLabel(hv, st.hK > 0.02 ? st.hPc : 0, st.hK);
      }
      vp(hv, H);
      // the soft shadows are redrawn only when the hand's pose changed (orbiting and the carousel do not move them)
      // ... and at most at the motion's own rate (29.97 fps): a moving hand's shadows a frame behind are invisible
      const S = C[s], sq = S.shadowQ, moved = (!sq || S.shown.some((v, j) => Math.abs(v - sq[j]) > 1e-6)) && (!sq || now - (S.shadowT || 0) >= 30);
      if (moved) { S.shadowQ = S.shown.slice(); S.shadowT = now; }
      renderer.toneMappingExposure = tExp; agxContrast.value = CAL.contrast; renderer.shadowMap.needsUpdate = moved;
      renderer.render(S.scene, S.cam);
      if (s === 'ours') {
        placeEgo(sl, view, hv);
        if (mano.ready && mano.op > 0.004) {                     // the overlay pass: over the robot, its own depth
          poseMano(egoV.currentTime * 30); renderer.clearDepth();
          C.ours.cam.layers.set(1); renderer.render(C.ours.scene, C.ours.cam); C.ours.cam.layers.set(0);
        }
      }
    }
    renderer.setScissorTest(false);
    if (cloudAlpha <= 0.01) hideCloudOverlays();
    // the caption pill of the step's card
    for (const s of SIDES) {
      const on = STEPS[st.step].card === s && !!STEPS[st.step].cap, a = on ? smooth(seg(st.u, 0.3, 0.65)) : 0;
      if (on && capEl[s].textContent !== STEPS[st.step].cap) capEl[s].textContent = STEPS[st.step].cap;
      capEl[s].style.opacity = a.toFixed(3);
    }
    // Reset view sits at the stage's top centre, as on every 3D stage (css/site.css: .m-reset)
    if (firstFrame) { firstFrame = false; stage.classList.add('ready'); }
  }

  function drawCloud(cr, H, dt, k3) {
    roomEnv(); vp(cr, H);
    cloudT += st.dtp ?? dt; placeCloudCam(); cl.cam.aspect = 1; cl.cam.updateProjectionMatrix();
    const px = cr[3] * renderer.getPixelRatio() / (2 * Math.tan(cl.cam.fov * Math.PI / 360));
    cloudGain += ((st.step === 4 ? 0.72 : 1) - cloudGain) * k3;              // P4: the cloud dims
    const u = cl.pts.material.uniforms; u.uT.value = st.birthT; u.uA.value = cloudAlpha * cloudGain; u.uPx.value = px;
    const lu = cl.lit.material.uniforms; lu.uT.value = fz.u; lu.uA.value = postA * cloudAlpha; lu.uS.value = clamp(cr[2] * 0.012, 4.5, 8) * renderer.getPixelRatio();   // sized to the cloud
    trail.material.uniforms.uPx.value = px;
    const active = dirActive()[0];
    for (const a of cl.arrows) {
      const g = Math.max(1e-3, smooth(seg(arrowsOn, a.k * 0.12, 0.76 + a.k * 0.12))), Lc = a.L * g, hh = Math.min(L3.cone_h, Lc * 0.6);
      a.shaft.scale.set(1, Math.max(1e-4, Lc - hh * 0.92), 1); a.shaft.position.y = (Lc - hh * 0.92) / 2;
      a.cone.scale.setScalar(hh / L3.cone_h); a.cone.position.y = Lc - hh / 2;
      const dim = st.step === 4 ? 0.6 : active ? (active === a.k + 1 ? 1 : 0.35) : 1;
      a.dim = (a.dim ?? 1) + (dim - (a.dim ?? 1)) * k3;
      a.m.opacity = Math.min(1, g * 2) * cloudAlpha * a.dim; a.rm.opacity = pca.rails.opacity * arrowsOn * cloudAlpha;
    }
    mean.material.opacity = cloudAlpha * arrowsOn;
    // probe: P3 on the active PC (its halo in that PC's colour), P4 on the noise's coefficients with a 0.4 s trail
    const probeOn = (st.step === 3 && (st.u > 2 || st.manual)) || st.step === 4 ? 1 : 0;
    let pw = [0, 0, 0], hc = NEUTRAL, hs = 1;
    if (st.step === 3 && st.manual) { const c = dirCoef(); pw = c.map((x, k) => x * C.ours.c / std0 * SK[k]); const [pc] = dirActive(); if (pc && st.dirs[pc - 1]) hc = tmpC.set(PC_COL[pc - 1]); }
    else if (st.step === 3 && st.u > 2) {
      const [pc, v] = sweepAt(sweepI()); pw = v; if (pc) hc = tmpC.set(PC_COL[pc - 1]);
      const ci = SH.sweep.coef[clamp(Math.round(sweepI()), 0, SH.sweep.n - 1)];       // the sweep moves its slider too
      dirEls.forEach((e, k) => { const f = k === pc - 1 ? (ci >= 0 ? ci / SWEEP[k][1] : -ci / SWEEP[k][0]) : 0; if (document.activeElement !== e) e.value = Math.round(f * 100); });
    }
    const x4 = st.step === 4 ? (st.u % (SH.eigen.n / FPS)) * FPS : -1;
    if (x4 >= 0) { pw = eigAt(x4); hs = 0.72; }
    const pg = ease((performance.now() - st.probeT0) / 500);             // from where it was when the beat changed
    if (pg < 1) pw = pw.map((v, k) => st.probeFrom[k] + (v - st.probeFrom[k]) * pg);
    probe.position.fromArray(pw); probeHalo.position.fromArray(pw);
    haloCol.lerp(hc, k3); probeHalo.material.color.copy(haloCol);
    probe.material.color.copy(WHITE).lerp(haloCol, 0.85); probe.material.emissive.copy(probe.material.color);     // the clear droplet shows its halo's hue
    probeHalo.scale.setScalar(L3.halo_r * 2.4 * (probeHalo.userData.hs = (probeHalo.userData.hs ?? 1) + (hs - (probeHalo.userData.hs ?? 1)) * k3));
    probe.material.opacity += (probeOn * cloudAlpha - probe.material.opacity) * k3; probeHalo.material.opacity = probe.material.opacity * 0.6;
    if (x4 >= 0) {
      for (let i = 0; i < TRAIL; i++) { const x = x4 - i / TRAIL_SUB; if (x < 0) { trailAge[i] = 1; continue; } trailPos.set(eigAt(x), i * 3); trailAge[i] = Math.min(1, i / TRAIL_SUB / (0.4 * FPS)); }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.age.needsUpdate = true;
    }
    trail.material.uniforms.uO.value = st.trailA * cloudAlpha;
    renderer.toneMappingExposure = 1; renderer.render(cl.scene, cl.cam);
    placeCloudOverlays(cr);
  }

  // the canvas spans the stage: clip it to the cards' rounded shapes
  let clipKey = '';
  function clipCanvas() {
    const rad = narrow() ? 18 : 22;
    const parts = SIDES.map(s => { const [x, y, w, h] = rectNow[s]; const k = Math.min(rad, w / 2, h / 2);
      return `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`; }).join('');
    if (parts !== clipKey) { clipKey = parts; canvas.style.clipPath = `path('${parts}')`; }
  }

  // EgoSuite panel, and the MANO overlay's opacity (the clip's own fade, once the hand has reached the clip's pose)
  function placeEgo(sl) {
    const ox = rectNow.ours[0], oy = rectNow.ours[1];
    egoEl.style.opacity = egoA.toFixed(3); egoEl.style.pointerEvents = egoA > 0.5 ? '' : 'none';
    if (egoA > 0.01) { const [x, y, w, h] = sl.ego; Object.assign(egoEl.style, { left: `${x - ox}px`, top: `${y - oy}px`, width: `${w}px`, height: `${h}px` }); drawEgo(w, h); }
    const i = Math.min(SH.retarget.n - 1, Math.floor(egoV.currentTime * 30));
    const settled = C.ours.blend ? ease((performance.now() - C.ours.blend.t0) / 550) ** 2 : 1;        // the overlay waits for the hand to reach the clip's pose
    mano.op = st.step === 1 ? SH.retarget.overlay[i] * egoA * settled : 0;
  }
  function drawEgo(w, h) {
    const pr = Math.min(2, devicePixelRatio || 1);
    if (egoC.width !== Math.round(w * pr) || egoC.height !== Math.round(h * pr)) { egoC.width = Math.round(w * pr); egoC.height = Math.round(h * pr); }
    const s = Math.max(Math.min(w / egoBox.bw, h / egoBox.bh), w / 712, h / 540);
    const vx = clamp(w / 2 - s * egoBox.cx, w - 712 * s, 0), vy = clamp(h / 2 - s * egoBox.cy, h - 540 * s, 0);   // centred on the hands, never short of an edge
    Object.assign(egoV.style, { width: `${712 * s}px`, height: `${540 * s}px`, left: `${vx}px`, top: `${vy}px` });
    egoG.clearRect(0, 0, egoC.width, egoC.height);
    const f = ego.keypoints[Math.min(ego.keypoints.length - 1, Math.round(egoV.currentTime * ego.fps))]; if (!f) return;
    const X = p => (vx + (712 - p / 2) * s) * pr, Y = p => (vy + p / 2 * s) * pr, kk = Math.min(1, Math.max(0.45, w / 960));
    egoG.lineCap = 'round';
    for (const side of ['l', 'r']) {
      const k = f[side]; if (!k) continue; const drive = side === 'r';
      const lw = (drive ? 4 : 2.4) * kk * pr, a = drive ? 1 : 0.55;
      for (const pass of [0, 1]) for (const [p0, p1] of ego.bones) {
        egoG.strokeStyle = pass ? (drive ? 'rgb(201,162,39)' : `rgba(236,236,238,${a})`) : `rgba(10,10,12,${0.47 * a})`; egoG.lineWidth = pass ? lw : lw + 3.2 * kk * pr;
        egoG.beginPath(); egoG.moveTo(X(k[p0 * 2]), Y(k[p0 * 2 + 1])); egoG.lineTo(X(k[p1 * 2]), Y(k[p1 * 2 + 1])); egoG.stroke();
      }
      for (let j = 0; j < 21; j++) { const r = (drive ? 4.2 : 2.8) * kk * pr; egoG.fillStyle = `rgba(10,10,12,${0.55 * a})`; egoG.beginPath(); egoG.arc(X(k[j * 2]), Y(k[j * 2 + 1]), r + 1.2 * kk * pr, 0, 7); egoG.fill(); egoG.fillStyle = `rgba(255,255,255,${a})`; egoG.beginPath(); egoG.arc(X(k[j * 2]), Y(k[j * 2 + 1]), r, 0, 7); egoG.fill(); }
    }
  }

  // cloud overlays: PC labels past the arrow tips; the clip cards with leaders and glass beads
  const pv = new THREE.Vector3();
  function proj(w, cr) { pv.copy(w).applyMatrix4(Z2Y).project(cl.cam); return [cr[0] + (pv.x + 1) / 2 * cr[2], cr[1] + (1 - pv.y) / 2 * cr[3]]; }
  const SLOTS = [[60, 90], [790, 520], [420, 36], [30, 420], [790, 150], [60, 700]];       // method_v3.SLOTS (card px)
  // narrow screens: three rows down each side of the cloud square (slots alternate sides as they light up), the cards
  // sized so that a column never overlaps; returns [x, y, width, height] in the card's px
  function narrowSlot(s, ow, cr, oy) {
    const cw = Math.min(0.32 * ow, ((cr[3] - 8) / 3 - 8) / 0.75 + 8), ch = (cw - 8) * 0.75 + 8, row = [0, 0, 2, 2, 1, 1][s];
    return [s % 2 ? ow - cw - 8 : 8, cr[1] - oy + 4 + row * (cr[3] - 8 - ch) / 2, cw, ch];
  }
  // method_v3._pick_points over the lit points: for each card slot, a point a bit inside the cloud on that slot's side
  // (between the 60th and 88th percentile along the slot's direction, near that line, not in the outer quarter), the
  // slots in order, kept apart. slotC = the slots' centres in the layer's px (0..1000).
  let picked = '';
  function pickPosts(slotC, key) {
    if (picked === key) return; picked = key;
    const keep = [cloudT, cl.orbit.az, cl.orbit.el]; cloudT = 6; cl.orbit.az = cl.orbit.el = 0; placeCloudCam(); cl.cam.aspect = 1; cl.cam.updateProjectionMatrix();
    const R = [0, 0, 1000, 1000], v3 = new THREE.Vector3(), P = [];
    for (let i = 0; i < cloudN; i += 5) P.push(proj(v3.set(cloudI[i * 3], cloudI[i * 3 + 1], cloudI[i * 3 + 2]).multiplyScalar(pca.cloud.scale), R));
    const F = POSTS.map(p => proj(p.w, R));
    [cloudT, cl.orbit.az, cl.orbit.el] = keep; placeCloudCam();
    const pct = (a, q) => { const b = Float64Array.from(a).sort(); return b[Math.floor(q / 100 * (b.length - 1))]; };
    const c = [pct(P.map(p => p[0]), 50), pct(P.map(p => p[1]), 50)], r75 = pct(P.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])), 75);
    const chosen = [];
    autoPick = slotC.map(sc => {
      const n = Math.hypot(sc[0] - c[0], sc[1] - c[1]) || 1, v = [(sc[0] - c[0]) / n, (sc[1] - c[1]) / n], along = P.map(p => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1]);
      const lo = pct(along, 60), hi = pct(along, 88);
      let best = -1, bc = 1e9;
      F.forEach(([x, y], j) => {
        if (chosen.some(k => Math.hypot(F[k][0] - x, F[k][1] - y) < 100)) return;
        const a = (x - c[0]) * v[0] + (y - c[1]) * v[1], pe = Math.abs(-(x - c[0]) * v[1] + (y - c[1]) * v[0]), r = Math.hypot(x - c[0], y - c[1]);
        const cost = Math.max(0, lo - a) + Math.max(0, a - hi) + Math.max(0, pe - 70) + Math.max(0, r - r75) + Math.max(0, y - 820) + 0.15 * Math.abs(a - (lo + hi) / 2);
        if (cost < bc) { bc = cost; best = j; }
      });
      chosen.push(best); return best;
    });
    autoPick.forEach(j => { new Image().src = stillURL(j); });            // the six the tour shows: fetched ahead
  }
  function pickForLayout() {                              // picked once per layout, for the card's settled (full) size
    const W = stage.clientWidth, H = stage.clientHeight, fc = slots('ours', [0, 0, W, H]).cloud, k1 = H / 1024, toL = (x, y) => [(x - fc[0]) / fc[2] * 1000, (y - fc[1]) / fc[3] * 1000];
    pickPosts(narrow() ? SLOTS.map((_, j) => { const [x, y, w, h] = narrowSlot(j, W, fc, 0); return toL(x + w / 2, y + h / 2); })
                       : SLOTS.map(([x, y]) => toL((x + 124) * k1, (y + 93) * k1)), `${narrow()}|${W}x${H}`);
  }
  // the card slots in the ours card's px: [x, y, w, h]
  function slotRect(sl, cr, oy) {
    if (narrow()) return narrowSlot(sl, rectNow.ours[2], cr, oy);
    const kk = rectNow.ours[3] / 1024, w = 248 * kk + 12, h = 186 * kk + 12;    // .m-post: 248 x 186 card px plus its 6 px rim
    return [SLOTS[sl][0] * kk, SLOTS[sl][1] * kk, w, h];
  }
  let litPx = null;                                       // the lit points on the stage this frame (for taps / hover)
  function nearestPost(cx, cy, rad) {
    if (st.step !== 2 || cloudAlpha < 0.5 || st.u < 1.2 || !litPx) return -1;
    const r = stage.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    let best = -1, bd = rad;
    for (let j = 0; j < POSTS.length; j++) { const d = Math.hypot(litPx[j * 2] - x, litPx[j * 2 + 1] - y); if (d < bd) { bd = d; best = j; } }
    return best;
  }
  function selectPost(j) {
    takeOver();
    const sr = stage.getBoundingClientRect(), ox = rectNow.ours[0], oy = rectNow.ours[1], px = litPx[j * 2] - ox, py = litPx[j * 2 + 1] - oy;
    let bs = 0, bd = 1e9;                                   // its still goes to the nearest card slot
    for (let sl = 0; sl < NSLOT; sl++) { const [x, y, w, h] = slotRect(sl, lastCloud, oy), d = Math.hypot(x + w / 2 - px, y + h / 2 - py); if (d < bd) { bd = d; bs = sl; } }
    st.post = j; st.postAt = st.u; st.postSlot = bs;
    C.ours.blend = { q: C.ours.shown.slice(), t0: performance.now() };
  }
  function hideCloudOverlays() {
    pclEls.forEach(e => { e.style.opacity = 0; e.style.pointerEvents = 'none'; });
    postEls.forEach(e => { e.style.opacity = 0; e.style.pointerEvents = 'none'; e.classList.remove('on'); });
    [...beadEls, beadHover].forEach(b => { b.style.opacity = 0; });
    if (linesEl.innerHTML) { linesEl.innerHTML = ''; linesEl._k = ''; }
  }
  let lastCloud = [0, 0, 1, 1];
  function placeCloudOverlays(cr) {
    lastCloud = cr;
    const ox = rectNow.ours[0], oy = rectNow.ours[1], o = proj(new THREE.Vector3(0, 0, 0), cr), s = cr[2] / 1000;
    els.ov.ours.style.setProperty('--k3', (rectNow.ours[3] / 1024).toFixed(3));
    cl.arrows.forEach((a, k) => {
      const tip = proj(AX[k].clone().multiplyScalar(a.L), cr), d = [tip[0] - o[0], tip[1] - o[1]], n = Math.hypot(d[0], d[1]) || 1;
      const el = pclEls[k];
      el.style.left = `${tip[0] + 34 * s * d[0] / n - ox}px`; el.style.top = `${tip[1] + 30 * s * d[1] / n - oy}px`;
      el.style.opacity = (smooth(seg(arrowsOn, 0.6 + k * 0.08, 1)) * cloudAlpha * (0.4 + 0.6 * (a.dim ?? 1))).toFixed(3); el.style.pointerEvents = arrowsOn > 0.8 && st.step === 3 ? '' : 'none';
      el.classList.toggle('on', st.step === 3 && st.pcJump === k + 1);
    });
    const show = postA * cloudAlpha;
    if (show <= 0.003) { postEls.forEach(e => { e.style.opacity = 0; e.style.pointerEvents = 'none'; }); [...beadEls, beadHover].forEach(b => { b.style.opacity = 0; }); if (linesEl.innerHTML) { linesEl.innerHTML = ''; linesEl._k = ''; } return; }
    pickForLayout();
    litPx ??= new Float32Array(POSTS.length * 2);
    POSTS.forEach((p, j) => { const b = proj(p.w, cr); litPx[j * 2] = b[0]; litPx[j * 2 + 1] = b[1]; });
    let lines = '';
    for (let sl = 0; sl < NSLOT; sl++) {
      const card = postEls[sl], bead = beadEls[sl], t0 = 0.7 + sl * 0.62;
      let j, a;
      if (fz.post >= 0) { j = fz.post; a = sl === fz.slot ? smooth(seg(fz.u, fz.postAt, fz.postAt + 0.25)) : 0; }
      else { j = autoPick[sl]; a = smooth(seg(fz.u, t0, t0 + 0.3)) * (1 - smooth(seg(fz.u, t0 + 1.7, t0 + 2.0))); }
      a *= show;
      card.style.opacity = bead.style.opacity = a.toFixed(3); card.style.pointerEvents = a > 0.5 && st.step === 2 ? 'auto' : 'none'; card.classList.toggle('on', a > 0.5);
      bead.classList.toggle('on', fz.post >= 0);
      if (a < 0.01 || j < 0) continue;
      if (card._j !== j) { card._j = j; card.querySelector('img').src = stillURL(j); card.title = POSTS[j].task; }
      const bx = litPx[j * 2] - ox, by = litPx[j * 2 + 1] - oy, [x, y, cw, ch] = slotRect(sl, cr, oy);
      bead.style.left = `${bx}px`; bead.style.top = `${by}px`;
      card.style.left = `${x}px`; card.style.top = `${y}px`; card.style.width = narrow() ? `${cw}px` : '';
      const ex = clamp(bx, x, x + cw), ey = clamp(by, y, y + ch);
      lines += `<line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" style="opacity:${a.toFixed(3)}"/>`;
    }
    const hv = hoverPost >= 0 && hoverPost !== st.post && st.step === 2 ? show : 0;    // desktop: the lit point under the pointer
    beadHover.style.opacity = hv.toFixed(3);
    if (hv > 0) { beadHover.style.left = `${litPx[hoverPost * 2] - ox}px`; beadHover.style.top = `${litPx[hoverPost * 2 + 1] - oy}px`; }
    if (linesEl._k !== lines) { linesEl._k = lines; linesEl.innerHTML = lines; }
  }
  // the PC's name on the palm while it sweeps (method_v3.pc_hand_label puts it at camera px 1574, 672): that pixel's
  // point on the palm, so the tag stays on the palm while the hand is orbited
  await yieldTask();
  const tagAnchor = (() => {
    const S = C.ours, d = new THREE.Vector3((1574 - S.card.cx) / S.card.f_px, -(672 - S.card.cy) / S.card.f_px, -1).normalize().applyQuaternion(S.base.q);
    S.h.set(REF); S.h.world.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(S.base.p.clone(), d, 0.01, 5).intersectObjects(S.h.meshes, false)[0];
    return S.h.palm.worldToLocal((hit ? hit.point : S.centre).clone());
  })();
  const tagV = new THREE.Vector3();
  function handLabel(hv, pc, k) {
    if (!pc || k < 0.02) { handTag.style.opacity = 0; return; }
    handTag.textContent = `“${PC_NAME[pc - 1]}”`; handTag.style.setProperty('--c', PC_COL[pc - 1]);
    tagV.copy(tagAnchor); C.ours.h.palm.localToWorld(tagV); tagV.project(C.ours.cam);
    handTag.style.left = `${hv[0] + (tagV.x + 1) / 2 * hv[2] - rectNow.ours[0]}px`; handTag.style.top = `${hv[1] + (1 - tagV.y) / 2 * hv[3] - rectNow.ours[1]}px`;
    handTag.style.opacity = k.toFixed(3);
  }

  // ---------------------------------------------------------------- warm-up
  // Every GPU program a step needs is compiled in quiet moments before the reader gets there (a first compile stalls
  // its frame, on iPhones for a long time): each scene drawn once, shadows included, into a 1 px window; the halo's
  // passes; the posture cloud's card points picked for this layout. While the stage is on screen a warm-up draw waits
  // for the start of the next frame (a draw between frames would show a cleared canvas).
  const warmQ = [];
  const warmDraw = fn => new Promise(res => {
    warmQ.push(() => { renderer.setScissorTest(true); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); try { fn(); } finally { res(); } });
  });
  // compileAsync first: where the browser compiles in parallel (KHR_parallel_shader_compile) the programs build off the
  // main thread and the warm-up draw finds them ready
  async function warmUp() {
    for (let i = 0; i < 40 && !mano.ready; i++) await new Promise(r => setTimeout(r, 250));
    if (mano.ready) poseMano(0);
    for (const s of SIDES) {
      await renderer.compileAsync(C[s].scene, C[s].cam); await breathe();
      await warmDraw(() => { renderer.shadowMap.needsUpdate = true; renderer.render(C[s].scene, C[s].cam); C[s].shadowQ = null; }); await breathe();
    }
    if (mano.ready) { await warmDraw(() => { C.ours.cam.layers.set(1); renderer.render(C.ours.scene, C.ours.cam); C.ours.cam.layers.set(0); }); await breathe(); }
    roomEnv(); await breathe();
    placeCloudCam(); await renderer.compileAsync(cl.scene, cl.cam); await breathe();
    await warmDraw(() => { renderer.toneMappingExposure = 1; renderer.render(cl.scene, cl.cam); }); await breathe();
    await warmDraw(() => halo('ours', [0, 0, 8, 8], 8, PC_COL[0], 0)); await breathe();
    pickForLayout();
  }

  // ---------------------------------------------------------------- start
  window.__s2 = { st, setStep, C, cl, SH, POSTS, mano, get rect() { return rectNow; } };
  setStep(0);
  quiet(() => warmUp().then(() => buildGuard('ours')).then(() => buildGuard('js')).catch(e => console.error('section 2 warm-up', e)));
  if (reduced) { $('#tour').classList.add('paused'); }
  const frame = now => { requestAnimationFrame(frame); tick(now); };
  requestAnimationFrame(frame);
  pump(() => lastTick, tick);
  glassify(document);
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
