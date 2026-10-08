// Section 4's 3D (js/s4.js), from the overview video's own part 4b scene (tools/export_dextreme_3d.py on
// 89b_part4b_catch.py with the approved crane's options): the calibrated Allegro rig, the fitted CB3 UR5 with its mount
// and base plate, the classic cube (B1's AR cube: 65 mm, bevelled, a glossy material per face) and the 'glow' studio
// bowl with its light baked in.
//  - createAR: the classic cube rendered through each filmed camera in the lab look the video's B1 used (its Sony
//    light rig, white world 0.4, AgX Medium High Contrast at -2.7), handed to the cards' 2D canvases, which lay it over
//    the footage behind the fingers (s4.js).
//  - createReplay: the 3D replay over both cards, as section 1's: each card starts from its filmed camera with the
//    card's crop (pixel aligned with the footage), the state world's rig (four disk lights as area lights with soft
//    shadows; the Allegro's black parts see only 0.7 x key and 0.7 x rim, the crane's light linking), exposure -2.8.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Z2Y, CAL, agxContrast, lookMaterials, initAreaLights, makeRenderer, studio, studioMat, addStudioLights } from './studio3d.js';

const D3 = new URL('../assets/s4/3d/', import.meta.url).href;
const SIDES = ['js', 'ours'], CLIP = { js: 'C0138', ours: 'C0137' };
const CV2BL = new THREE.Matrix4().makeScale(1, -1, -1);           // OpenCV camera (y down, z forward) -> Blender / three camera
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let assetsP = null;
export const loadAssets = () => (assetsP ??= Promise.all([
  fetch(`${D3}dex3d.json`).then(r => r.json()),
  ...['dex_hand', 'dex_arm', 'dex_cube', 'dex_env'].map(n => loader.loadAsync(`${D3}${n}.glb`)),
]).then(([meta, hand, arm, cube, env]) => ({ meta, hand, arm, cube, env })));
const mat4 = m => new THREE.Matrix4().set(...m.flat());

// a camera whose projection is the Sony intrinsics cropped to the card's window of the frame (Sony px)
function cropProjection(cam, K, r, near = 0.02, far = 40) {
  const f = K.f, l = (r.x - K.cx) / f * near, rt = (r.x + r.w - K.cx) / f * near, t = (K.cy - r.y) / f * near, b = (K.cy - r.y - r.h) / f * near;
  cam.projectionMatrix.makePerspective(l, rt, t, b, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}
// the classic cube with its own materials (each copy fades on its own)
function cubeCopy(gltf) {
  const c = gltf.scene.clone(true);
  // one-sided (Blender exports its materials two-sided): a translucent convex cube shows only its faces towards the camera
  c.traverse(o => { if (o.isMesh) { o.material = [].concat(o.material).map(m => { m = m.clone(); m.transparent = true; m.side = THREE.FrontSide; return m; }); if (o.material.length === 1) o.material = o.material[0]; } });
  c.matrixAutoUpdate = false;
  return c;
}
function setOpacity(obj, a) {
  obj.visible = a > 0.004;
  obj.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.opacity = a; m.depthWrite = a > 0.99; } });
}
// a uniform white world of radiance v (the scenes' world): ambient light and reflections alike
function uniformEnv(renderer, v) {
  const s = new THREE.Scene(); s.background = new THREE.Color(v, v, v);
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(s, 0).texture; pm.dispose();
  return t;
}

// ---------------------------------------------------------------- the AR cube for the filmed cards
export async function createAR(K) {
  const { meta, cube } = await loadAssets();
  const canvas = document.createElement('canvas');
  const renderer = makeRenderer(canvas, { mobile: false });
  renderer.shadowMap.enabled = false;
  initAreaLights();
  const env = uniformEnv(renderer, 0.2);
  const S = {};
  for (const m of SIDES) {
    const scene = new THREE.Scene(); scene.environment = env;
    // the Sony rig, carried into this camera's frame (the scene is built in camera space: the camera sits at the origin)
    const toCam = mat4(meta.clips[CLIP[m]].cam).invert(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (const L of meta.lab.lights) {
      mat4(L.m).premultiply(toCam).decompose(p, q, s);
      const a = new THREE.RectAreaLight(0xffffff, L.radiance, L.side, L.side); a.position.copy(p); a.quaternion.copy(q); scene.add(a);
    }
    const cubes = [cubeCopy(cube), cubeCopy(cube), cubeCopy(cube), cubeCopy(cube)];
    cubes.forEach(c => scene.add(c)); lookMaterials(scene);
    S[m] = { scene, cubes, cam: new THREE.PerspectiveCamera() };
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  // matched to the released video's part 4b frames (EigenDEXplore 0:37, the goal's three faces: rms 10 levels; the rest
  // is the video's final grade, which the page's raw footage does not have either): -0.45 stop, white world 0.2
  const look = { dExp: -0.45 };
  let W = 0, H = 0;
  // draw items [{ q (x y z w), t (m), alpha, scale }] (OpenCV camera frame of the run's Sony camera) over a card's 2D
  // context: V = the card's view (s4.js viewOf), clip = the finger polygons (even-odd) or null
  function draw(ctx, m, V, items, clip) {
    const D = V.D, w = Math.round(V.w * D), h = Math.round(V.h * D);
    if (w > W || h > H) { W = Math.max(W, w); H = Math.max(H, h); renderer.setPixelRatio(1); renderer.setSize(W, H, false); }
    const T = S[m];
    T.cubes.forEach((c, i) => {
      const it = items[i]; if (!it) { c.visible = false; return; }
      M.compose(P.set(...it.t), Q.set(...it.q), SC.setScalar(it.scale ?? 1)).premultiply(CV2BL);
      c.matrix.copy(M); c.matrixWorldNeedsUpdate = true; setOpacity(c, it.alpha);
    });
    cropProjection(T.cam, K[m], { x: V.x0, y: V.y0, w: V.w / V.s, h: V.h / V.s });
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
    renderer.toneMappingExposure = Math.pow(2, meta.lab.exposure + CAL.exposure + look.dExp); agxContrast.value = look.contrast ?? CAL.contrast;
    renderer.clear();
    renderer.render(T.scene, T.cam);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clip) { ctx.setTransform(D * V.s, 0, 0, D * V.s, -V.x0 * D * V.s, -V.y0 * D * V.s); ctx.clip(clip, 'evenodd'); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    ctx.drawImage(canvas, 0, H - h, w, h, 0, 0, w, h);
    ctx.restore();
  }
  async function warm() { for (const m of SIDES) await renderer.compileAsync(S[m].scene, S[m].cam); }
  // calibration hook (tools/web): exposure offset and world fill, matched to the video's frames
  const tune = ({ dExp = 0, env: e, contrast } = {}) => { look.dExp = dExp; if (contrast != null) look.contrast = contrast; if (e != null) for (const m of SIDES) S[m].scene.environmentIntensity = e / 0.2; };
  return { draw, warm, tune };
}

// ---------------------------------------------------------------- the 3D replay
export async function createReplay(canvas, cardsEl, { mobile }) {
  const renderer = makeRenderer(canvas, { mobile });
  initAreaLights();
  const [A, ambient] = await Promise.all([loadAssets(), studio(renderer)]);
  const { meta } = A;
  const cards = Object.fromEntries(SIDES.map(s => [s, cardsEl.querySelector(`.card[data-side="${s}"]`)]));
  const focus = new THREE.Vector3(...meta.state.focus).applyMatrix4(Z2Y);
  const gains = meta.state.lights.map(L => L.hand_gain);
  const sides = {};
  for (const s of SIDES) {
    const c = meta.clips[CLIP[s]], scene = new THREE.Scene();
    scene.environment = ambient;
    const world = new THREE.Group(); world.matrixAutoUpdate = false; world.matrix.copy(Z2Y); scene.add(world);
    const hand = A.hand.scene.clone(true), arm = A.arm.scene.clone(true), env = A.env.scene.clone(true);
    // the rig's root at this run's calibrated hand base
    const root = hand.getObjectByName('A_root') || hand.children[0];
    root.matrixAutoUpdate = true; mat4(c.hand_root).decompose(root.position, root.quaternion, root.scale);
    [hand, arm].forEach(g => g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }));
    env.traverse(o => { if (o.isMesh) o.material = studioMat; });
    world.add(hand, arm, env);
    const cube = cubeCopy(A.cube), goal = cubeCopy(A.cube), flights = [cubeCopy(A.cube), cubeCopy(A.cube)];
    // the tracked cube casts its shadow on the hand; the goal and the copies flying to it are the video's separate
    // layer (B2), with no shadows
    cube.traverse(x => { if (x.isMesh) x.castShadow = true; });
    [cube, goal, ...flights].forEach(o => world.add(o));
    lookMaterials(world);
    // the crane's light linking: the Allegro's black parts receive only part of each light (hand_gain, same order)
    hand.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (m.name !== 'ah_black' || m.userData.gain) continue;
        m.userData.gain = true;
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (sh, r) => {
          prev(sh, r);
          sh.uniforms.handGain = { value: gains };
          sh.fragmentShader = `uniform float handGain[ ${gains.length} ];\n` + sh.fragmentShader.replace('rectAreaLight = rectAreaLights[ i ];', 'rectAreaLight = rectAreaLights[ i ];\n\t\trectAreaLight.color *= handGain[ i ];');
        };
        m.customProgramCacheKey = () => 'agx-look-arealight-shadows-handgain';
      }
    });
    addStudioLights(scene, meta.state.lights, focus, { mobile, angle: 0.5, near: 0.8, far: 6, radius: 8 });
    // shadows on the bowl floor (its light is baked without the robot): a catcher just above it
    const floorY = meta.state.room_floor_z;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.28 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.set(focus.x, floorY + 0.002, focus.z); catcher.receiveShadow = true; scene.add(catcher);
    const links = meta.joint_order.map(j => { const J = meta.joints.find(x => x.joint === j); return J && { node: hand.getObjectByName(`L_${J.link}`), axis: new THREE.Vector3(...J.axis) }; });
    const camBase = mat4(c.cam).premultiply(Z2Y);
    const K = { f: c.K[0][0], cx: c.K[0][2], cy: c.K[1][2] };
    sides[s] = { scene, world, hand, links, cube, goal, flights, camBase, K, camera: new THREE.PerspectiveCamera(), toWorld: mat4(c.cam).multiply(CV2BL) };
  }

  // ---- orbit, shared by both cards (as section 1): yaw about the vertical through the hand, pitch, zoom
  const orb = { az: 0, el: 0, zoom: 1, taz: 0, tel: 0, tzoom: 1 };
  let peek = 0, dirty = true, crops = {}, lastKey = '';
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(), C0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), R = new THREE.Quaternion(), R2 = new THREE.Quaternion(), Cv = new THREE.Vector3();
  function rig(S, az, el, zoom) {
    C0.setFromMatrixPosition(S.camBase); Q0.setFromRotationMatrix(S.camBase);
    right.set(1, 0, 0).applyQuaternion(Q0); right.y = 0; right.normalize();
    R.setFromAxisAngle(up, az).multiply(R2.setFromAxisAngle(right, el));
    return Cv.copy(C0).sub(focus).multiplyScalar(zoom).applyQuaternion(R).add(focus);
  }
  function placeCamera(S) {
    S.camera.position.copy(rig(S, orb.az + peek, orb.el, orb.zoom));
    S.camera.quaternion.copy(R).multiply(Q0);
    S.camera.updateMatrixWorld(true);
  }
  const CLEAR = meta.state.room_floor_z + 0.25;
  function pitchRange() {
    let lo = -1.2, hi = 1.2;
    for (const s of SIDES) {
      const ok = el => rig(sides[s], orb.taz, el, orb.tzoom).y >= CLEAR;
      if (!ok(0)) continue;
      let e = 0; while (e < 1.2 && ok(e + 0.01)) e += 0.01; hi = Math.min(hi, e);
      e = 0; while (e > -1.2 && ok(e - 0.01)) e -= 0.01; lo = Math.max(lo, e);
    }
    return [lo, hi];
  }

  // ---- pose one side from its state: q (16 joints), cube { q, t } or null, goal { q, t, alpha, scale }, flights [...]
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), SC = new THREE.Vector3();
  function place(S, obj, it) {
    if (!it) { obj.visible = false; return; }
    M.compose(P.set(...it.t), Q.set(...it.q), SC.setScalar(it.scale ?? 1)).premultiply(S.toWorld);
    obj.matrix.copy(M); obj.matrixWorldNeedsUpdate = true; setOpacity(obj, it.alpha ?? 1);
  }
  function pose(S, st) {
    for (let j = 0; j < S.links.length; j++) { const L = S.links[j]; if (L?.node) L.node.quaternion.setFromAxisAngle(L.axis, st.q[j]); }
    place(S, S.cube, st.cube); place(S, S.goal, st.goal);
    S.flights.forEach((f, i) => place(S, f, st.flights[i]));
  }

  let size = [0, 0];
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width !== size[0] || r.height !== size[1]) { size = [r.width, r.height]; renderer.setSize(r.width, r.height, false); dirty = true; }
  }
  // states: { js, ours } from s4.js; views: { js, ours } card views (s4.js viewOf); key: changes when the states do,
  // shadowKey: when the data frame does (the shadows follow the data, not every drawn frame)
  let lastShadow = '';
  function render(states, views, key, shadowKey = key) {
    const moving = Math.abs(orb.taz - orb.az) + Math.abs(orb.tel - orb.el) + Math.abs(orb.tzoom - orb.zoom) > 1e-4;
    if (moving) { const k = 0.16; orb.az += (orb.taz - orb.az) * k; orb.el += (orb.tel - orb.el) * k; orb.zoom += (orb.tzoom - orb.zoom) * k; }
    resize();
    const changed = key !== lastKey;
    if (!dirty && !moving && !changed) return;
    dirty = false;
    const cr = canvas.getBoundingClientRect();
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    const shadows = shadowKey !== lastShadow; lastShadow = shadowKey;
    lastKey = key;
    for (const s of SIDES) {
      const S = sides[s], V = views[s];
      pose(S, states[s]); placeCamera(S);
      cropProjection(S.camera, S.K, { x: V.x0, y: V.y0, w: V.w / V.s, h: V.h / V.s });
      const r = cards[s].getBoundingClientRect(), x = r.left - cr.left, y = cr.bottom - r.bottom;
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      renderer.toneMappingExposure = Math.pow(2, meta.state.exposure + CAL.exposure); agxContrast.value = CAL.contrast;
      if (shadows || !S.shadowed) { renderer.shadowMap.needsUpdate = true; S.shadowed = true; }   // per card: the flag clears after each render
      renderer.render(S.scene, S.camera);
    }
  }

  // ---- interaction: drag = orbit (both cards), pinch / ctrl+wheel = zoom, double click = back to the filmed view
  const pts = new Map(); let pinch0 = null;
  const onChange = new Set(), emit = () => onChange.forEach(f => f(isOrbited()));
  const isOrbited = () => Math.abs(orb.taz) + Math.abs(orb.tel) + Math.abs(orb.tzoom - 1) > 0.01;
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId);
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = [Math.hypot(p[0] - q[0], p[1] - q[1]), orb.tzoom]; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; orb.tzoom = THREE.MathUtils.clamp(pinch0[1] * pinch0[0] / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), 0.45, 2.2); }
    else if (pts.size === 1) { orb.taz -= dx * 0.0065; if (e.pointerType !== 'touch') orb.tel -= dy * 0.0045; }
    keepClear(); emit();
  });
  const upP = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
  canvas.addEventListener('pointerup', upP); canvas.addEventListener('pointercancel', upP);
  canvas.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); e.lenisStopPropagation = true; orb.tzoom = THREE.MathUtils.clamp(orb.tzoom * Math.exp(e.deltaY * 0.004), 0.45, 2.2); keepClear(); emit(); }, { passive: false });
  canvas.addEventListener('dblclick', () => reset());
  function keepClear() { const [lo, hi] = pitchRange(); orb.tel = THREE.MathUtils.clamp(orb.tel, Math.max(lo, -0.9), Math.min(hi, 0.9)); }
  function reset() { orb.taz = 0; orb.tel = 0; orb.tzoom = 1; emit(); }
  const settled = () => !isOrbited() && Math.abs(orb.az) + Math.abs(orb.el) + Math.abs(orb.zoom - 1) < 0.004;
  // every program compiled ahead, then one draw of each side into a 1 px window while the canvas is still hidden
  async function warm(states, views, stillHidden = () => true) {
    for (const s of SIDES) await renderer.compileAsync(sides[s].scene, sides[s].camera);
    if (!stillHidden()) return;
    renderer.setScissorTest(true); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1);
    for (const s of SIDES) { const S = sides[s]; pose(S, states[s]); placeCamera(S); renderer.shadowMap.needsUpdate = true; renderer.render(S.scene, S.camera); }
    dirty = true; lastKey = ''; lastShadow = ''; SIDES.forEach(s => { sides[s].shadowed = false; });
  }
  const setPeek = y => { if (y !== peek) { peek = y; dirty = true; } };
  const absorb = y => { orb.az += y; orb.taz += y; peek = 0; dirty = true; emit(); };
  return { render, warm, reset, settled, isOrbited, setPeek, absorb, onChange: f => onChange.add(f), invalidate: () => { dirty = true; } };
}
