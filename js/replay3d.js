// Section 1 3D replay, built from the overview video's own transition scenes (video scripts 20_build_scene.py +
// 63_orbit_run.py: footage-matched materials, the wrist connector, the fitted tool shapes and tool-pose corrections, the
// studio bowl and table, the four area lights), exported by tools/export_web.py. Each card renders its take from the
// take's fitted Sony camera with the card's footage crop and the take's footage-matched exposure, so the 3D frame lands
// on the footage pixel for pixel and dissolves in place, as in the video's orbit transitions. Dragging orbits both
// cards together about the hand; a double click (or the reset button) flies back to the footage view.
import * as THREE from 'three';
import { BASE, Z2Y, CAL, agxContrast, lookMaterials, loadGlb, loadLights, initAreaLights, makeRenderer, studio, studioMat, addStudioLights } from './studio3d.js';
export { CAL };
const SIDES = ['js', 'ours'];
// view exposure per take, matched to its own footage (63_orbit_run.py plans: mean of the take's two orbit ends)
const EXPOSURE = { hammer_js: -2.653, hammer_ours: -3.015, wipe_js: -2.574, wipe_ours: -2.711,
  brush_js: -2.417, brush_ours: -2.597, scoop_js: -2.720, scoop_ours: -3.076 };
const TOOL = { hammer: 'hammer', wipe: 'wipe', brush: 'brush', scoop: 'scoop' };
const TABLE_TOP = 0.53;
const takes = {};
function loadTake(take) {
  takes[take] ??= Promise.all([
    fetch(`${BASE}anim/${take}.json`).then(r => r.json()),
    fetch(`${BASE}anim/${take}.bin`).then(r => r.arrayBuffer()),
  ]).then(([meta, buf]) => {
    const a = new Float32Array(buf), w = a.length / meta.n, nj = meta.joints.length;
    // pivot for orbiting: the median palm position over the take (Blender world)
    const med = k => { const v = []; for (let i = 0; i < meta.n; i++) v.push(a[i * w + nj + 7 + k]); v.sort((x, y) => x - y); return v[v.length >> 1]; };
    const pivot = new THREE.Vector3(med(0), med(1), med(2)).applyMatrix4(Z2Y);
    const T = new THREE.Matrix4().set(...meta.T.flat());
    const camWorld = Z2Y.clone().multiply(T);
    return { meta, a, w, nj, pivot, camWorld };
  });
  return takes[take];
}

// one side: its own scene (robot, tool, studio), driven by one take
function makeSide(robotGltf, envGltf, env, lights, mobile) {
  const scene = new THREE.Scene();
  scene.environment = env;
  const world = new THREE.Group(); world.matrixAutoUpdate = false; world.matrix.copy(Z2Y); scene.add(world);
  const robot = robotGltf.scene.clone(true);
  robot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  world.add(robot);
  // the studio (bowl, table) carries its Cycles lighting baked into vertex colours (radiance / ENV_SCALE)
  const studioMesh = envGltf.scene.clone(true);
  studioMesh.traverse(o => { if (o.isMesh) o.material = studioMat; });
  world.add(studioMesh);
  lookMaterials(world);
  addStudioLights(scene, lights, new THREE.Vector3(-0.02, 0.72, -0.12), { mobile });          // the hand's working volume
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.66), new THREE.ShadowMaterial({ opacity: 0.3 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.set(-0.16, TABLE_TOP + 0.0015, 0.12);
  catcher.receiveShadow = true;
  scene.add(catcher);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 60);
  return { scene, world, robot, camera, tool: null, take: null, links: null, base: null };
}

export async function createReplay(canvas, cardsEl, { mobile, fullFrame = false }) {
  const renderer = makeRenderer(canvas, { mobile });
  initAreaLights();
  const [env, robotGltf, envGltf, lights] = await Promise.all([studio(renderer), loadGlb('robot'), loadGlb('env'), loadLights()]);
  const sides = Object.fromEntries(SIDES.map(s => [s, makeSide(robotGltf, envGltf, env, lights, mobile)]));
  const cards = Object.fromEntries(SIDES.map(s => [s, cardsEl.querySelector(`.card[data-side="${s}"]`)]));
  let task = null, cropFn = () => null, dirty = true, lastT = {};

  // orbit shared by both cards: yaw about the vertical through the pivot, pitch about the camera's right axis, zoom
  const orb = { az: 0, el: 0, zoom: 1, taz: 0, tel: 0, tzoom: 1 };
  let peek = 0;                                          // the orbit demo's extra yaw (s1.js, js/orbitdemo.js)
  const tmp = { q: new THREE.Quaternion(), q2: new THREE.Quaternion(), v: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    p: new THREE.Vector3(), s: new THREE.Vector3(), m: new THREE.Matrix4() };

  async function setTask(t, cropOf) {
    task = t; if (cropOf) cropFn = cropOf;
    const toolG = await loadGlb(`tool_${TOOL[t]}`);
    await Promise.all(SIDES.map(async s => {
      const S = sides[s], take = `${t}_${s}`, data = await loadTake(take);
      if (task !== t) return;
      if (S.tool) S.world.remove(S.tool);
      S.tool = toolG.scene.clone(true); S.tool.matrixAutoUpdate = false;
      S.tool.traverse(o => { if (o.isMesh) o.castShadow = true; });
      lookMaterials(S.tool);
      S.world.add(S.tool);
      S.take = take; S.data = data;
      S.links = data.meta.joints.map(([link, axis]) => ({ node: S.robot.getObjectByName(`L_${link}`), axis: new THREE.Vector3(...axis) }));
      S.base = data.camWorld;
      const K = data.meta.K, [W, H] = data.meta.size;
      S.camera.fov = 2 * Math.atan(H / 2 / K[1][1]) * 180 / Math.PI;
      S.camera.aspect = W / H;
    }));
    lastT = {}; dirty = true;
  }

  // pose one side at Sony master time m (seconds of the take's source clip)
  function pose(S, m) {
    const { meta, a, w, nj } = S.data;
    const f = THREE.MathUtils.clamp((m - meta.start) * meta.hz, 0, meta.n - 1);
    const i0 = Math.floor(f), i1 = Math.min(i0 + 1, meta.n - 1), u = f - i0;
    const r0 = i0 * w, r1 = i1 * w;
    for (let j = 0; j < nj; j++) {
      const L = S.links[j]; if (!L.node) continue;
      L.node.quaternion.setFromAxisAngle(L.axis, a[r0 + j] + (a[r1 + j] - a[r0 + j]) * u);
    }
    tmp.p.set(a[r0 + nj], a[r0 + nj + 1], a[r0 + nj + 2]).lerp(tmp.v.set(a[r1 + nj], a[r1 + nj + 1], a[r1 + nj + 2]), u);
    tmp.q.set(a[r0 + nj + 3], a[r0 + nj + 4], a[r0 + nj + 5], a[r0 + nj + 6]);
    tmp.q2.set(a[r1 + nj + 3], a[r1 + nj + 4], a[r1 + nj + 5], a[r1 + nj + 6]);
    tmp.q.slerp(tmp.q2, u);
    S.tool.matrix.compose(tmp.p, tmp.q, tmp.s.set(1, 1, 1));
  }

  // the fitted Sony camera, rigidly rotated about the pivot by the shared orbit (the pivot keeps its pixel)
  const _C0 = new THREE.Vector3(), _Q0 = new THREE.Quaternion(), _R = new THREE.Quaternion(), _R2 = new THREE.Quaternion(), _C = new THREE.Vector3();
  function rig(S, az, el, zoom) {
    _C0.setFromMatrixPosition(S.base); _Q0.setFromRotationMatrix(S.base);
    tmp.right.set(1, 0, 0).applyQuaternion(_Q0); tmp.right.y = 0; tmp.right.normalize();
    _R.setFromAxisAngle(tmp.up, az).multiply(_R2.setFromAxisAngle(tmp.right, el));
    _C.copy(_C0).sub(S.data.pivot).multiplyScalar(zoom).applyQuaternion(_R).add(S.data.pivot);
    return _C;
  }
  function placeCamera(S) {
    S.camera.position.copy(rig(S, orb.az + peek, orb.el, orb.zoom));
    S.camera.quaternion.copy(_R).multiply(_Q0);
    S.camera.updateMatrixWorld(true);
  }
  // the orbit may not take either camera to within 10 cm of the table top (or under it): the pitch range that keeps
  // both cameras above it, found from the current yaw and zoom (the footage view, pitch 0, is always inside it)
  const CLEAR = TABLE_TOP + 0.10;
  function pitchRange() {
    let lo = -1.3, hi = 1.3;
    for (const s of SIDES) {
      const S = sides[s]; if (!S.data) continue;
      const ok = el => rig(S, orb.taz, el, orb.tzoom).y >= CLEAR;
      if (!ok(0)) continue;
      let e = 0; while (e < 1.3 && ok(e + 0.01)) e += 0.01; hi = Math.min(hi, e);
      e = 0; while (e > -1.3 && ok(e - 0.01)) e -= 0.01; lo = Math.max(lo, e);
    }
    return [lo, hi];
  }

  // the card's crop of the Sony frame (s1.js cardMap, the same map the footage uses), so 3D and footage line up
  function viewOffset(S, side) {
    const r = fullFrame ? null : cropFn(side);
    if (!r) { S.camera.clearViewOffset(); return; }
    S.camera.setViewOffset(1920, 1080, r.x, r.y, r.w, r.h);
  }

  let size = [0, 0];
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width !== size[0] || r.height !== size[1]) { size = [r.width, r.height]; renderer.setSize(r.width, r.height, false); dirty = true; }
  }

  function render(times, cropOf) {
    if (cropOf) cropFn = cropOf;
    if (!task || SIDES.some(s => !sides[s].data || sides[s].take !== `${task}_${s}`)) return;
    const moving = Math.abs(orb.taz - orb.az) + Math.abs(orb.tel - orb.el) + Math.abs(orb.tzoom - orb.zoom) > 1e-4;
    if (moving) { const k = 0.16; orb.az += (orb.taz - orb.az) * k; orb.el += (orb.tel - orb.el) * k; orb.zoom += (orb.tzoom - orb.zoom) * k; }
    resize();
    const changed = SIDES.some(s => Math.abs((times[s] ?? 0) - (lastT[s] ?? -1)) > 1e-4);
    if (!dirty && !moving && !changed) return;
    dirty = false;
    const cr = canvas.getBoundingClientRect();
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    for (const s of SIDES) {
      const S = sides[s];
      if (changed || S.shadowsFor !== S.take) { renderer.shadowMap.needsUpdate = true; S.shadowsFor = S.take; }
      lastT[s] = times[s];
      pose(S, times[s]);
      placeCamera(S);
      const r = cards[s].getBoundingClientRect();
      const x = r.left - cr.left, y = cr.bottom - r.bottom, w = r.width, h = r.height;
      viewOffset(S, s);
      renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
      renderer.toneMappingExposure = Math.pow(2, EXPOSURE[S.take] + CAL.exposure);
      agxContrast.value = CAL.contrast;
      renderer.render(S.scene, S.camera);
    }
  }

  // ---- interaction: drag = orbit (both cards), pinch / ctrl+wheel = zoom, double click = back to the footage view
  const pts = new Map(); let pinch0 = null;
  const onChange = new Set();
  const emit = () => onChange.forEach(f => f(isOrbited()));
  const isOrbited = () => Math.abs(orb.taz) + Math.abs(orb.tel) + Math.abs(orb.tzoom - 1) > 0.01;
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = [Math.hypot(p[0] - q[0], p[1] - q[1]), orb.tzoom]; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      orb.tzoom = THREE.MathUtils.clamp(pinch0[1] * pinch0[0] / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), 0.45, 2.2);
    } else if (pts.size === 1) {
      orb.taz -= dx * 0.0065;
      if (e.pointerType !== 'touch') orb.tel -= dy * 0.0045;
    }
    keepClear(); emit();
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;                       // plain wheel keeps scrolling the page
    e.preventDefault(); e.lenisStopPropagation = true;            // nor does the smooth scroller (js/smoothscroll.js)
    orb.tzoom = THREE.MathUtils.clamp(orb.tzoom * Math.exp(e.deltaY * 0.004), 0.45, 2.2); keepClear(); emit();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => reset());
  function keepClear() { const [lo, hi] = pitchRange(); orb.tel = THREE.MathUtils.clamp(orb.tel, Math.max(lo, -0.9), Math.min(hi, 0.9)); }
  function reset() { orb.taz = 0; orb.tel = 0; orb.tzoom = 1; emit(); }
  const settled = () => !isOrbited() && Math.abs(orb.az) + Math.abs(orb.el) + Math.abs(orb.zoom - 1) < 0.004;

  // compile every program (robot, tool, studio, shadows) ahead of the first look: one draw of each side into a 1 px
  // window while the canvas is still hidden (s1.js prewarm3d); the first real frame then draws everything again
  async function warm(stillHidden = () => true) {
    if (!task || SIDES.some(s => !sides[s].data)) return;
    for (const s of SIDES) await renderer.compileAsync(sides[s].scene, sides[s].camera);    // in parallel where the browser can
    if (!stillHidden()) return;                         // opened meanwhile: its own frames draw (a draw now would blank one)
    renderer.setScissorTest(true); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1);
    for (const s of SIDES) { const S = sides[s]; pose(S, S.data.meta.start); placeCamera(S); renderer.shadowMap.needsUpdate = true; renderer.render(S.scene, S.camera); S.shadowsFor = null; }
    dirty = true;
  }

  const state = () => ({ az: +orb.az.toFixed(3), el: +orb.el.toFixed(3), zoom: +orb.zoom.toFixed(3), camY: SIDES.map(s => sides[s].camera.position.y.toFixed(3)), table: TABLE_TOP });
  // the demo's yaw; absorb(y) hands it to the orbit itself (a touch during the demo takes over from where the view is)
  const setPeek = y => { if (y !== peek) { peek = y; dirty = true; } };
  const absorb = y => { orb.az += y; orb.taz += y; peek = 0; dirty = true; emit(); };
  return { setTask, render, warm, reset, settled, isOrbited, state, setPeek, absorb, onChange: f => onChange.add(f), invalidate: () => { dirty = true; }, renderer };
}
