// Section 3 = the overview video's training chapter (video/scripts/method/training_v3_cut.py), live. The two SimToolReal
// runs (Joint-Space seed 13 and EigenDEXplore seed 202: the median runs of the paper's Fig. 3b) replay env 3 (the
// screwdriver) from the very states the video's final renders were keyed from (data/training/v3; the export is
// site_lab/tools/export_training_web.py): slow windows at untrained, 3B, 9B, 30B and 60B and fast stretches between, one
// continuous camera pan, and under the cards the curve band (goals reached per episode, the playhead, the goal
// tolerance tightening at 9B). The studio is the training scene's own, its light baked (bake_env.py); the robot, its
// look and its four area lights are section 1's. Drag to orbit both cards; tap a checkpoint or drag along the band.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Z2Y, CAL, agxContrast, lookMaterials, loadGlb, loadLights, initAreaLights, makeRenderer, studio, studioMat, addStudioLights } from './studio3d.js';
import { phone, engaged } from './stage.js';
import { quiet, breathe, yieldTask } from './idle.js';
import { orbitDemo } from './orbitdemo.js';

const $ = (s, r = document) => r.querySelector(s);
const S3 = new URL('../assets/s3/', import.meta.url).href;
const SIDES = ['js', 'ours'];
const COL = { js: '#7098b7', ours: '#e1b84e' }, CORAL = '#ec6852';
const XMAX = 62, YMAX = 15;
// the goal ghost (Cycles: green 0.35 0.85 0.45 at alpha 0.32, emission 0.15): opacity, glow and colour here matched to
// the video's final frames (its green reads deeper through the transparent Principled surface)
const GH = [0.57, 0.5, 0.28, 0.85, 0.32];
const EXPOSURE = -2.9;                                   // the training scenes' view exposure (92_training_scene.py)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoother = p => { p = clamp(p, 0, 1); return p * p * p * (p * (6 * p - 15) + 10); };
const narrow = () => document.documentElement.clientWidth < 760;
const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export async function init() {
  const stage = $('#tStage'), canvas = $('#tCanvas'), band = $('#tBand'), plot = $('#tPlot'), tag = $('#tTag');
  const renderer = makeRenderer(canvas, { mobile: phone() });
  renderer.autoClear = false;
  initAreaLights();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [J, buf, robotGltf, envGltf, lights, env] = await Promise.all([
    fetch(`${S3}train.json`).then(r => r.json()), fetch(`${S3}train.bin`).then(r => r.arrayBuffer()),
    loadGlb('robot'), loader.loadAsync(`${S3}env_train.glb`), loadLights(), studio(renderer)]);
  await yieldTask();
  const F = J.frames, FPS = J.fps;
  const track = name => { const L = J.layout[name], a = new Int16Array(buf, L.offset, L.shape[0] * L.shape[1]), f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] * L.step; return f; };
  const D = {};
  for (const m of SIDES) D[m] = { q: track(`${m}_q`), op: track(`${m}_obj_p`), oq: track(`${m}_obj_q`), gp: track(`${m}_goal_p`), gq: track(`${m}_goal_q`), tz: track(`${m}_table_z`),
    reset: new Set(J.methods[m].reset), src: J.methods[m].source };
  const CAM = track('cam');                                // per frame: location xyz, target xyz (Blender world)
  const NJ = J.joints.length;

  // ---------------------------------------------------------------- the scene of one card
  const toolGeo = J.tool.parts.map(p => {                 // the URDF's primitives, bevelled like the video's
    let g;
    if (p.kind === 'box') g = new RoundedBoxGeometry(p.size[0], p.size[1], p.size[2], 2, Math.min(...p.size) * 0.12);
    else {                                                // a cylinder along its own z, with rounded rims
      const r = p.r, l = p.l, b = Math.min(r, l) * 0.15, pts = [new THREE.Vector2(0, -l / 2)];
      for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), -l / 2 + b + b * Math.sin(a))); }
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - b + b * Math.cos(a), l / 2 - b + b * Math.sin(a))); }
      pts.push(new THREE.Vector2(0, l / 2));
      g = new THREE.LatheGeometry(pts, 48).rotateX(Math.PI / 2);
    }
    const o = new THREE.Matrix4().compose(new THREE.Vector3(...p.xyz), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rpy[0], p.rpy[1], p.rpy[2], 'ZYX')), new THREE.Vector3(1, 1, 1));
    return { g: g.applyMatrix4(o), mat: p.mat };
  });
  const TOOL_MAT = { brown: new THREE.MeshStandardMaterial({ color: srgb(0.40, 0.24, 0.12), roughness: 0.6, metalness: 0 }),
    gray: new THREE.MeshStandardMaterial({ color: srgb(0.42, 0.43, 0.45), roughness: 0.35, metalness: 0.6 }) };
  const GHOST = new THREE.MeshStandardMaterial({ color: srgb(GH[2], GH[3], GH[4]), emissive: srgb(GH[2], GH[3], GH[4]), emissiveIntensity: GH[1], roughness: 0.4,
    transparent: true, opacity: GH[0], depthWrite: false });
  const makeTool = ghost => { const g = new THREE.Group(); for (const p of toolGeo) { const m = new THREE.Mesh(p.g, ghost ? GHOST : TOOL_MAT[p.mat] || TOOL_MAT.gray); m.castShadow = !ghost; m.receiveShadow = !ghost; g.add(m); } return g; };
  const fpx = 50 / 36 * 1920, PY = J.camera.principal_y;   // 50 mm on a 36 mm sensor, horizontal fit, 1920 px wide
  const tz0 = D.ours.tz[0], topZ = tz0 + J.table.size[2] / 2;     // the bake's table (the scene's frame 1): table_narrow, 0.3 m box
  function makeSide(m) {
    const scene = new THREE.Scene(); scene.environment = env;
    const world = new THREE.Group(); world.matrixAutoUpdate = false; world.matrix.copy(Z2Y); scene.add(world);
    const robot = robotGltf.scene.clone(true); robot.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); world.add(robot);
    const studioG = envGltf.scene.clone(true); studioG.traverse(o => { if (o.isMesh) o.material = studioMat; });
    const table = new THREE.Group(); [...studioG.children].filter(o => o.name.startsWith('table_')).forEach(o => table.add(o));
    world.add(studioG, table);
    // the studio's own light is baked; live, only a faint shadow on the table top (the video's large soft lights leave
    // the table nearly even: measured against its frames, anything stronger reads as a dark smear)
    const catchTop = new THREE.Mesh(new THREE.PlaneGeometry(0.475, 0.4), new THREE.ShadowMaterial({ opacity: 0.08 })); catchTop.position.set(0, 0, topZ + 0.0015); catchTop.receiveShadow = true; table.add(catchTop);
    const tool = makeTool(false), ghost = makeTool(true); tool.matrixAutoUpdate = ghost.matrixAutoUpdate = true; world.add(tool, ghost);
    lookMaterials(world);
    addStudioLights(scene, lights, new THREE.Vector3(0, 0.65, -0.35), { mobile: phone() });      // aimed at (0, 0.35, 0.65), as the scene's lights
    const camera = new THREE.PerspectiveCamera(2 * Math.atan(540 / fpx) * 180 / Math.PI, 16 / 9, 0.02, 60);
    const links = J.joints.map(([link, axis]) => ({ node: robot.getObjectByName(`L_${link}`), axis: new THREE.Vector3(...axis) }));
    return { m, scene, robot, table, tool, ghost, camera, links, shadowKey: null };
  }
  const C = {}; for (const m of SIDES) { C[m] = makeSide(m); await yieldTask(); }

  // ---------------------------------------------------------------- the state of a card at (fractional) frame f
  // within an episode the frames interpolate (the display runs faster than the 29.97 fps data); across a reset or a
  // change of source they hold, then cut, as the training does. The goal ghost jumps (as the video keys it).
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function stateAt(m, f, out) {
    const d = D[m], i0 = clamp(Math.floor(f), 0, F - 1), i1 = Math.min(i0 + 1, F - 1);
    const u = d.reset.has(i1) || d.src[i1] !== d.src[i0] ? 0 : f - i0;
    for (let j = 0; j < NJ; j++) out.q[j] = d.q[i0 * NJ + j] * (1 - u) + d.q[i1 * NJ + j] * u;
    for (let k = 0; k < 3; k++) out.op[k] = d.op[i0 * 3 + k] * (1 - u) + d.op[i1 * 3 + k] * u;
    qa.fromArray(d.oq, i0 * 4).slerp(qb.fromArray(d.oq, i1 * 4), u).toArray(out.oq);
    const ig = u > 0.5 ? i1 : i0;
    for (let k = 0; k < 3; k++) out.gp[k] = d.gp[ig * 3 + k];
    for (let k = 0; k < 4; k++) out.gq[k] = d.gq[ig * 4 + k];
    out.tz = d.tz[i0] * (1 - u) + d.tz[i1] * u;
    return out;
  }
  const blank = () => ({ q: new Float32Array(NJ), op: [0, 0, 0], oq: [0, 0, 0, 1], gp: [0, 0, 0], gq: [0, 0, 0, 1], tz: 0 });
  const shown = { js: blank(), ours: blank() }, want = { js: blank(), ours: blank() }, from = { js: blank(), ours: blank() };
  const copyS = (a, b) => { b.q.set(a.q); for (const k of ['op', 'oq', 'gp', 'gq']) for (let i = 0; i < a[k].length; i++) b[k][i] = a[k][i]; b.tz = a.tz; };
  function mix(a, b, e, out) {                           // a jump (a checkpoint tapped): from what is shown to the new state
    for (let j = 0; j < NJ; j++) out.q[j] = a.q[j] + (b.q[j] - a.q[j]) * e;
    for (const k of ['op', 'gp']) for (let i = 0; i < 3; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * e;
    for (const k of ['oq', 'gq']) qa.fromArray(a[k]).slerp(qb.fromArray(b[k]), e).toArray(out[k]);
    out.tz = a.tz + (b.tz - a.tz) * e;
  }
  function apply(S, s) {
    for (let j = 0; j < NJ; j++) S.links[j].node?.quaternion.setFromAxisAngle(S.links[j].axis, s.q[j]);
    S.tool.position.fromArray(s.op); S.tool.quaternion.fromArray(s.oq);
    S.ghost.position.fromArray(s.gp); S.ghost.quaternion.fromArray(s.gq);
    S.table.position.z = s.tz - tz0;
  }

  // ---------------------------------------------------------------- episode resets in the slow windows dissolve
  // (training_v3_cut.card: a reset at <= 30x reads as a cut, so +/-3 frames cross-dissolve; resets a few frames apart
  // merge into one window; at 50x a new episode every few frames is the time-lapse itself and stays a cut)
  const K = 3, RW = {};
  for (const m of SIDES) {
    RW[m] = [];
    for (const r of J.methods[m].reset) { if (J.speed[r] > 30) continue; const w = RW[m][RW[m].length - 1]; if (w && r - w[1] <= K) w[1] = r; else RW[m].push([r, r]); }
  }
  const pr = () => renderer.getPixelRatio();
  // the outgoing frame is drawn once when its dissolve starts (a texture per card), then faded over the new one: a
  // dissolve frame costs one scene, not two
  const heldMat = { js: null, ours: null }, heldScene = { js: null, ours: null }, heldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  for (const m of SIDES) { heldMat[m] = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthTest: false, depthWrite: false }); heldScene[m] = new THREE.Scene(); heldScene[m].add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), heldMat[m])); }
  const holdTex = (m, w, h) => { let t = heldMat[m].map; if (!t || t.image.width !== w || t.image.height !== h) { t?.dispose(); t = new THREE.FramebufferTexture(w, h); t.colorSpace = THREE.SRGBColorSpace; heldMat[m].map = t; heldMat[m].needsUpdate = true; } return t; };
  const dissolveAt = (m, f) => { for (const [r0, r1] of RW[m]) if (f >= r0 - K && f <= r1 + K) return { r0, a: Math.min(f, r0 - 1), b: Math.max(f, r1), w: smoother((f - (r0 - K)) / (r1 - r0 + 2 * K)) }; return null; };
  const heldFor = { js: -1, ours: -1 };
  const sA = blank(), vpos = new THREE.Vector2();

  // ---------------------------------------------------------------- the camera: the video's pan, orbited by the reader
  const cl = new THREE.Vector3(), ct = new THREE.Vector3(), cR = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), oq1 = new THREE.Quaternion(), oq2 = new THREE.Quaternion();
  // once the reader orbits, the video's pan stops where it was (the view is theirs: nothing turns it on its own); Reset
  // glides back onto the pan
  const hl = new THREE.Vector3(), ht = new THREE.Vector3();
  function placeCamera(S, f, w, h, now = performance.now()) {
    const i = clamp(Math.round(f), 0, F - 1);
    cl.fromArray(CAM, i * 6).applyMatrix4(Z2Y); ct.fromArray(CAM, i * 6 + 3).applyMatrix4(Z2Y);
    const hi = st.hold ?? st.release?.from;
    if (hi != null) {
      hl.fromArray(CAM, hi * 6).applyMatrix4(Z2Y); ht.fromArray(CAM, hi * 6 + 3).applyMatrix4(Z2Y);
      const e = st.hold != null ? 0 : smoother((now - st.release.t0) / 900);
      if (st.hold == null && e >= 1) st.release = null;
      cl.lerpVectors(hl, cl, e); ct.lerpVectors(ht, ct, e);
    }
    const v = cl.sub(ct);                                 // orbit about the target: yaw about up, pitch about the camera's right
    cR.crossVectors(v, Y).normalize();
    oq1.setFromAxisAngle(Y, st.orb.az + st.peekYaw - 0.2 * st.hov.x); oq2.setFromAxisAngle(cR, clamp(st.orb.el - 0.1 * st.hov.y, -0.25, 0.75));
    v.applyQuaternion(oq2).applyQuaternion(oq1);
    S.camera.position.copy(ct).add(v); S.camera.up.set(0, 1, 0); S.camera.lookAt(ct);
    // the card shows the video's visible box (922 x 660 around x 960, y 390 of the 1920 x 1080 frame), as large as fits;
    // the frame's principal point is at y 396.5 (lens shift), so the window sits that much lower in three's centred frame
    // phones' square cards: a little closer and a little lower (the box is wider than tall, its top mostly studio wall)
    const sq = w / h < 1.2, k = sq ? Math.min(w / (922 * 0.84), h / 600) : Math.min(w / 922, h / 660), ww = w / k, wh = h / k, cy = sq ? 430 : 390;
    S.camera.setViewOffset(1920, 1080, 960 - ww / 2, cy - wh / 2 + (540 - PY), ww, wh); S.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- state, clock
  const st = { f: 0, playing: false, ended: false, started: false, engaged: false, visible: false, scrub: false, jump: null,
    orb: { az: 0, el: 0, taz: 0, tel: 0 }, peekYaw: 0, peekAt: 0, hov: { x: 0, y: 0, tx: 0, ty: 0 }, interacted: false, hold: null, release: null };
  const orbited = () => st.hold != null || !!st.orbBack || Math.abs(st.orb.taz) + Math.abs(st.orb.tel) >= 0.02;
  const fbAt = f => { const i = clamp(Math.floor(f), 0, F - 1), j = Math.min(i + 1, F - 1), u = f - i; return J.fb[i] * (1 - u) + J.fb[j] * u; };
  const frameOfB = b => { let lo = 0, hi = F - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (J.fb[mid] < b) lo = mid; else hi = mid; } return J.fb[hi] - b < b - J.fb[lo] ? hi : lo; };
  const demo = orbitDemo({ key: 'eg-orbit-demo-s3' });
  const playBtn = $('#tPlay'), resetEl = $('#tReset');
  function setPlaying(p) { st.playing = p; if (p) st.ended = false; playBtn.classList.toggle('playing', p); playBtn.classList.toggle('ended', !p && st.ended); playBtn.setAttribute('aria-label', p ? 'Pause' : st.ended ? 'Replay' : 'Play'); }
  function jumpTo(f, glide = true) {                      // a checkpoint tapped: the cards glide from what they show
    if (glide && !reduced) { for (const m of SIDES) copyS(shown[m], from[m]); st.jump = { t0: performance.now() }; } else st.jump = null;
    st.f = clamp(f, 0, F - 1); st.ended = false;
  }
  playBtn.addEventListener('click', () => { st.interacted = true; if (st.ended) { jumpTo(0); setPlaying(true); } else setPlaying(!st.playing); });

  // ---------------------------------------------------------------- the checkpoints (the video's slow windows)
  const stopsEl = $('#tStops'), thumb = stopsEl.querySelector('.seg-thumb');
  stopsEl.insertAdjacentHTML('beforeend', J.windows.map((w, i) => `<button type="button" data-i="${i}" aria-pressed="false">${w.label}</button>`).join(''));
  const stopBtns = [...stopsEl.querySelectorAll('button')];
  stopBtns.forEach((b, i) => b.addEventListener('click', () => { st.interacted = true; demo.stop(performance.now(), false); jumpTo(J.windows[i].f0); setPlaying(true); }));
  let geo = null; const measureStops = () => { geo = stopBtns.map(b => [b.offsetLeft, b.offsetWidth]); };
  addEventListener('resize', measureStops); document.fonts?.ready.then(measureStops);
  const thumbNow = { x: 0, w: 0 };
  function placeThumb(fb, dt) {                          // between two checkpoints the thumb travels with the playhead
    if (!geo) measureStops();
    const ck = J.windows.map(w => w.ck); let i = 0; while (i < ck.length - 1 && fb >= ck[i + 1]) i++;
    const p = i < ck.length - 1 ? smoother((fb - ck[i]) / (ck[i + 1] - ck[i])) : 0, a = geo[i], b = geo[Math.min(i + 1, geo.length - 1)];
    const x = a[0] + (b[0] - a[0]) * p, w = a[1] + (b[1] - a[1]) * p, k = 1 - Math.exp(-dt * 14);
    thumbNow.x = thumbNow.w ? thumbNow.x + (x - thumbNow.x) * k : x; thumbNow.w = thumbNow.w ? thumbNow.w + (w - thumbNow.w) * k : w;
    thumb.style.transform = `translateX(${thumbNow.x.toFixed(1)}px)`; thumb.style.width = `${thumbNow.w.toFixed(1)}px`;
    const cur = J.windows.findIndex(w => st.f >= w.f0 && st.f <= w.f1 + 0.5);
    stopBtns.forEach((b, j) => { const on = j === (cur >= 0 ? cur : p < 0.5 ? i : i + 1) ? 'true' : 'false'; if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on); });
  }

  // ---------------------------------------------------------------- the curve band (training_v3_cut.plot_layer, as SVG)
  const NS = 'http://www.w3.org/2000/svg', el = (n, a = {}, p = plot) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
  let G = null;                                           // geometry + live elements, rebuilt on resize
  function buildBand() {
    plot.textContent = '';
    const W = band.clientWidth, H = band.clientHeight, nar = narrow();
    const px0 = nar ? 34 : 50, px1 = W - (nar ? 14 : 22), py0 = nar ? 40 : 48, py1 = H - (nar ? 24 : 28);
    const X = b => px0 + (px1 - px0) * b / XMAX, Yv = v => py1 - (py1 - py0) * clamp(v, 0, YMAX) / YMAX;
    plot.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const defs = el('defs');
    for (const m of SIDES) {
      const g = el('linearGradient', { id: `tg-${m}`, x1: 0, y1: py0, x2: 0, y2: py1, gradientUnits: 'userSpaceOnUse' }, defs);
      el('stop', { offset: 0, 'stop-color': COL[m], 'stop-opacity': m === 'ours' ? 0.26 : 0.18 }, g); el('stop', { offset: 1, 'stop-color': COL[m], 'stop-opacity': 0 }, g);
    }
    const clip = el('clipPath', { id: 't-reveal' }, defs), reveal = el('rect', { x: 0, y: 0, width: px0, height: H }, clip);
    for (const v of [0, 5, 10, 15]) { el('line', { x1: px0, x2: px1, y1: Yv(v), y2: Yv(v), stroke: '#fff', 'stroke-opacity': v ? 0.09 : 0.28, 'stroke-width': v ? 1 : 1.5 }); el('text', { x: px0 - 9, y: Yv(v) + 4, 'text-anchor': 'end' }).textContent = v; }
    el('line', { x1: px0, x2: px0, y1: py0 - 6, y2: py1, stroke: '#fff', 'stroke-opacity': 0.28, 'stroke-width': 1.5 });
    for (let b = 0; b <= 60; b += 10) { el('line', { x1: X(b), x2: X(b), y1: py1, y2: py1 + 5, stroke: '#fff', 'stroke-opacity': 0.4 }); if (nar && b % 20) continue; el('text', { x: X(b), y: py1 + (nar ? 16 : 19), 'text-anchor': 'middle' }).textContent = b ? `${b}B` : '0'; }
    el('text', { x: nar ? 14 : 22, y: nar ? 24 : 29, class: 'tt' }).textContent = 'Goals reached per episode';
    const rv = el('text', { x: px1, y: nar ? 25 : 30, class: 'rv', 'text-anchor': 'end' }), rk = el('text', { x: px1, y: nar ? 25 : 30, class: 'rk', 'text-anchor': 'end' });
    rk.textContent = W < 400 ? '' : 'training frames';    // the smallest phones: the value alone (the axis says frames)
    const zone = el('rect', { x: X(J.event_b), y: py0 - 6, width: 0, height: py1 - py0 + 6, fill: CORAL, 'fill-opacity': 0 });
    const evGlow = el('line', { x1: X(J.event_b), x2: X(J.event_b), y1: py0 - 6, y2: py1, stroke: CORAL, 'stroke-width': 7, 'stroke-opacity': 0, 'stroke-linecap': 'round' });
    const ev = el('line', { x1: X(J.event_b), x2: X(J.event_b), y1: py0 - 6, y2: py1, stroke: CORAL, 'stroke-width': 2, 'stroke-opacity': 0 });
    const curves = el('g', { 'clip-path': 'url(#t-reveal)' });
    for (const m of SIDES) {                             // the whole curve, revealed up to the playhead
      const y = J.curves[m].y, n = Math.min(y.length, Math.floor(XMAX / J.curves[m].dx));
      let d = ''; for (let i = 0; i < n; i += i < n - 2 ? 2 : 1) d += `${i ? 'L' : 'M'}${X(i * J.curves[m].dx).toFixed(1)} ${Yv(y[i]).toFixed(1)}`;
      el('path', { d: `${d}L${X((n - 1) * J.curves[m].dx).toFixed(1)} ${py1}L${px0} ${py1}Z`, fill: `url(#tg-${m})` }, curves);
      el('path', { d, fill: 'none', stroke: COL[m], 'stroke-width': 7, 'stroke-opacity': 0.22, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, curves);
      el('path', { d, fill: 'none', stroke: COL[m], 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, curves);
    }
    const head = el('line', { y1: py0 - 6, y2: py1, stroke: '#fff', 'stroke-opacity': 0.75, 'stroke-width': 1.5 });
    const knobs = Object.fromEntries(SIDES.map(m => [m, el('circle', { r: nar ? 5.5 : 7, fill: COL[m], 'fill-opacity': 0.55, stroke: '#fff', 'stroke-opacity': 0.85, 'stroke-width': 1.5 })]));
    G = { W, H, px0, px1, py0, py1, X, Yv, reveal, rv, rk, zone, ev, evGlow, head, knobs, lastRv: '' };
  }
  const curveAt = (m, b) => { const c = J.curves[m], x = b / c.dx, i = clamp(Math.floor(x), 0, c.y.length - 2), u = clamp(x - i, 0, 1); return c.y[i] * (1 - u) + c.y[i + 1] * u; };
  let evAt = -1;
  function drawBand(fb, now) {
    if (!G) buildBand();
    const { X, Yv } = G, x = X(Math.min(fb, XMAX));
    G.reveal.setAttribute('width', x.toFixed(1)); G.head.setAttribute('x1', x.toFixed(1)); G.head.setAttribute('x2', x.toFixed(1));
    for (const m of SIDES) { G.knobs[m].setAttribute('cx', x.toFixed(1)); G.knobs[m].setAttribute('cy', Yv(curveAt(m, fb)).toFixed(1)); }
    const val = fb < 0.05 ? 'untrained' : `${fb.toFixed(1)}B`;
    if (val !== G.lastRv) { G.lastRv = val; G.rv.textContent = val; const w = (G.tw ??= {})[val.length] ??= G.rv.getComputedTextLength(); G.rk.setAttribute('x', (G.px1 - w - 10).toFixed(1)); }
    // the tolerance event: the coral line, a faint warm zone after it, the capsule (once the playhead is past 9B)
    const past = fb >= J.event_b;
    if (past && evAt < 0) evAt = now; else if (!past) evAt = -1;
    const z = past ? smoother((now - evAt) / 450) : 0;
    G.ev.setAttribute('stroke-opacity', z.toFixed(3)); G.evGlow.setAttribute('stroke-opacity', (0.35 * z).toFixed(3));
    G.zone.setAttribute('width', Math.max(0, x - X(J.event_b)).toFixed(1)); G.zone.setAttribute('fill-opacity', (0.07 * z).toFixed(3));
    // phones: the capsule announces the event, then steps back (the short band would keep it over the curves)
    const tagOn = past && !(narrow() && now - evAt > 3200);
    if (tag.classList.contains('on') !== tagOn) { tag.classList.toggle('on', tagOn); tag.style.left = `${X(J.event_b) + 10}px`; tag.style.top = `${G.py0 - 2}px`; }
    band.setAttribute('aria-valuenow', Math.round(fb));
  }
  // scrub: drag along the band to move through training (the cards follow; playing resumes after)
  let scrubWas = false;
  const scrubTo = cx => { const r = band.getBoundingClientRect(), b = clamp(((cx - r.left) - G.px0) / (G.px1 - G.px0) * XMAX, 0, J.fb[F - 1]); st.jump = null; st.f = frameOfB(b); st.ended = false; };
  band.addEventListener('pointerdown', e => { st.interacted = true; band.setPointerCapture(e.pointerId); st.scrub = true; scrubWas = st.playing; setPlaying(false); scrubTo(e.clientX); });
  band.addEventListener('pointermove', e => { if (st.scrub) scrubTo(e.clientX); });
  const endScrub = () => { if (!st.scrub) return; st.scrub = false; if (scrubWas && st.f < F - 1) setPlaying(true); };
  band.addEventListener('pointerup', endScrub); band.addEventListener('pointercancel', endScrub);
  band.addEventListener('keydown', e => { const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (d) { st.interacted = true; jumpTo(frameOfB(clamp(fbAt(st.f) + d * 2, 0, 60)), false); e.preventDefault(); } });

  // ---------------------------------------------------------------- orbit (both cards together), hover lean, reset
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    const dy = demo.stop(performance.now(), true); if (dy) { st.orb.az += dy; st.orb.taz += dy; st.peekYaw = 0; }
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag && e.pointerType === 'mouse' && !reduced && !orbited()) {   // the view leans a little toward the pointer (it invites the drag)
      const r = stage.getBoundingClientRect(); st.hov.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1); st.hov.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4 && !drag.real) {                    // a real drag: hold the camera where it is (the lean folded in, nothing jumps)
      drag.real = true; st.interacted = true;
      if (st.orbBack) { st.orbBack = null; st.orb.taz = st.orb.az; st.orb.tel = st.orb.el; }
      if (st.hold == null) {
        st.hold = Math.round(st.f);
        if (st.release) { const e = smoother((performance.now() - st.release.t0) / 900); if (e < 0.5) st.hold = st.release.from; st.release = null; }
        st.orb.az -= 0.2 * st.hov.x; st.orb.taz = st.orb.az; st.orb.el -= 0.1 * st.hov.y; st.orb.tel = st.orb.el;
      }
      st.hov.x = st.hov.y = st.hov.tx = st.hov.ty = 0;
    }
    if (!drag.real) return;
    st.orb.taz -= dx * 0.0065; if (e.pointerType !== 'touch') st.orb.tel = clamp(st.orb.tel + dy * 0.0045, -0.25, 0.75);
  });
  const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { st.hov.tx = st.hov.ty = 0; });
  // Reset: the orbit and the camera glide back together, on one 0.9 s curve (the pan resumes under it)
  const resetView = () => {
    const now = performance.now();
    st.orbBack = { az: st.orb.az, el: st.orb.el, t0: now }; st.orb.taz = st.orb.tel = 0;
    if (st.hold != null) { st.release = { from: st.hold, t0: now }; st.hold = null; }
  };
  resetEl.addEventListener('click', resetView); stage.addEventListener('dblclick', resetView);

  // ---------------------------------------------------------------- frame
  const cards = SIDES.map(m => stage.querySelector(`.t-card[data-side="${m}"]`));
  let rects = null, W = 0, H = 0, needGrad = true;         // read on resize only (no layout reads in the frame)
  const root = document.documentElement;
  // only a real change of the stage (its size or its place) re-lays the canvas and the band: the paper's figure growing
  // below it resizes the column every frame of its opening, and must cost nothing here
  let geoKey = '';
  const ro = new ResizeObserver(() => {
    const w = stage.clientWidth, h = stage.clientHeight, top = stage.offsetTop, bw = band.clientWidth, key = `${w}|${h}|${top}|${bw}`;
    if (key === geoKey) return; geoKey = key;
    W = w; H = h; rects = cards.map(c => [c.offsetLeft, c.offsetTop, c.offsetWidth, c.offsetHeight]); G = null; needGrad = true;
    root.style.setProperty('--stTop', `${top}px`); root.style.setProperty('--stH', `${h}px`);
  });
  ro.observe(stage); ro.observe(stage.parentElement);
  // the page is the studio: once a frame shows the default view, one column of pixels at each card edge gives the
  // studio's gradient at every height (the median of the four columns, so the robot or a table leg crossing one does
  // not count); it is drawn behind the cards across the page and continued above and below them (css .s3)
  const gl = renderer.getContext();
  function sampleGradient() {
    const p = renderer.getPixelRatio(), N = 24, cols = [];
    rects.forEach(([x, y, w, h]) => cols.push([x + 4, y, h], [x + w - 5, y, h]));
    const per = cols.map(([cx, cy, ch]) => {
      const n = Math.max(8, Math.floor(ch * p) - 4), buf = new Uint8Array(n * 4);
      gl.readPixels(Math.round(cx * p), Math.round((H - cy - ch) * p) + 2, 1, n, gl.RGBA, gl.UNSIGNED_BYTE, buf);     // bottom row first
      return Array.from({ length: N }, (_, i) => { const r = Math.round((1 - i / (N - 1)) * (n - 1)) * 4; return [buf[r], buf[r + 1], buf[r + 2]]; });
    });
    const stops = Array.from({ length: N }, (_, i) => per.map(c => c[i]).sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[Math.floor(cols.length / 2)]);
    if (stops.some(c => c[0] + c[1] + c[2] < 30)) return false;                  // not drawn yet
    const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    root.style.setProperty('--tg', `linear-gradient(180deg, ${stops.map((c, i) => `${rgb(c)} ${(i / (N - 1) * 100).toFixed(1)}%`).join(', ')})`);
    root.style.setProperty('--tgTop', rgb(stops[0])); root.style.setProperty('--tgBot', rgb(stops[N - 1]));      // also the bleed into the footer
    return true;
  }
  let clipKey = '', last = performance.now(), lastTick = 0, first = true, lastDraw = 0;
  function clipCanvas(sr, rects) {
    const parts = rects.map(([x, y, w, h], i) => { const k = Math.min(narrow() ? 18 : 22, w / 2, h / 2);
      return `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`; }).join('');
    if (parts !== clipKey) { clipKey = parts; canvas.style.clipPath = `path('${parts}')`; }
  }
  const warmQ = [];
  function tick(now) {
    lastTick = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const r0 = stage.getBoundingClientRect(); st.visible = r0.bottom > 0 && r0.top < innerHeight;
    const eg = engaged(stage, st.engaged);
    if (eg !== st.engaged) { st.engaged = eg; if (eg && !st.started) { st.started = true; if (!reduced) setPlaying(true); st.peekAt = now + 1500; } }
    if (!st.visible) { warmQ.shift()?.(); return; }
    // clock: the time-lapse runs at the video's frame rate while it is watched
    if (st.playing && st.engaged && !st.scrub) { st.f += dt * FPS; if (st.f >= F - 1) { st.f = F - 1; st.ended = true; setPlaying(false); } }
    if (st.peekAt && now >= st.peekAt) { demo.start(now); st.peekAt = 0; }
    st.peekYaw = demo.yaw(now);
    { const h = st.hov, k = 1 - Math.exp(-dt * 3.5); h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k; }
    if (st.orbBack) { const e = smoother((now - st.orbBack.t0) / 900); st.orb.az = st.orbBack.az * (1 - e); st.orb.el = st.orbBack.el * (1 - e); if (e >= 1) st.orbBack = null; }
    else { const o = st.orb, k = 1 - Math.exp(-dt * 10); o.az += (o.taz - o.az) * k; o.el += (o.tel - o.el) * k; }
    resetEl.classList.toggle('on', orbited());
    if (orbited()) st.hov.tx = st.hov.ty = 0;
    // drawn at most ~60 times a second: the data is 29.97 fps, and on a 120 Hz screen two full scenes per refresh only
    // make the frame pacing uneven
    if (now - lastDraw < 12.5) return;
    lastDraw = now;
    // sizes: the canvas spans the stage; a viewport per card
    if (!rects) return;
    if (canvas._w !== W || canvas._h !== H) { renderer.setSize(W, H, false); canvas._w = W; canvas._h = H; }
    clipCanvas(null, rects);
    warmQ.shift()?.();
    renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.setScissorTest(true);
    const e = st.jump ? smoother((now - st.jump.t0) / 520) : 1; if (e >= 1) st.jump = null;
    renderer.toneMappingExposure = Math.pow(2, EXPOSURE + CAL.exposure); agxContrast.value = CAL.contrast;
    SIDES.forEach((m, k) => {
      const S = C[m], [x, y, w, h] = rects[k], dv = st.jump || st.scrub ? null : dissolveAt(m, st.f);
      renderer.setViewport(x, H - y - h, w, h); renderer.setScissor(x, H - y - h, w, h);
      placeCamera(S, st.f, w, h);
      if (dv && heldFor[m] !== dv.r0) {                    // the frame before the reset, drawn and copied once
        heldFor[m] = dv.r0;
        apply(S, stateAt(m, Math.min(st.f, dv.r0 - 1), sA)); renderer.shadowMap.needsUpdate = true; renderer.render(S.scene, S.camera);
        const p = pr(), tex = holdTex(m, Math.round(w * p), Math.round(h * p));
        renderer.copyFramebufferToTexture(tex, vpos.set(Math.round(x * p), Math.round((H - y - h) * p)));
        renderer.clear(); S.shadowKey = null;
      }
      if (!dv) heldFor[m] = -1;
      stateAt(m, dv ? dv.b : st.f, want[m]);
      if (st.jump) mix(from[m], want[m], e, shown[m]); else copyS(want[m], shown[m]);
      apply(S, shown[m]);
      // the soft shadows follow the data (29.97 fps), not the display: redrawn when its frame changes (or a jump glides)
      const key = st.jump ? `j${Math.floor(now / 33)}` : `${Math.floor(dv ? dv.b : st.f)}`;
      renderer.shadowMap.needsUpdate = key !== S.shadowKey; S.shadowKey = key;
      renderer.render(S.scene, S.camera);
      if (dv) { heldMat[m].opacity = 1 - dv.w; renderer.render(heldScene[m], heldCam); }
    });
    renderer.setScissorTest(false);
    if (needGrad && !orbited() && !demo.active && !st.jump && st.release == null) needGrad = !sampleGradient();
    const fb = fbAt(st.f);
    drawBand(fb, now); placeThumb(fb, dt);
    if (first) { first = false; stage.classList.add('ready'); }
  }

  // ---------------------------------------------------------------- warm-up: programs compiled in quiet moments
  const warmDraw = fn => new Promise(res => { warmQ.push(() => { renderer.setScissorTest(true); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); try { fn(); } finally { res(); } }); });
  quiet(async () => {
    for (const m of SIDES) {
      stateAt(m, 0, shown[m]); apply(C[m], shown[m]); placeCamera(C[m], 0, 922, 660);
      await renderer.compileAsync(C[m].scene, C[m].camera); await breathe();
      await warmDraw(() => { renderer.shadowMap.needsUpdate = true; renderer.render(C[m].scene, C[m].camera); C[m].shadowKey = null; }); await breathe();
    }
  });

  // ---------------------------------------------------------------- the paper's Fig. 3, opened below the band
  // (the row grows to its height and the page below glides; built the first time it is opened)
  const more = $('#tMore'), paper = $('#tPaper'), GLIDE = 'cubic-bezier(.45, 0, .2, 1)';   // a gentle start and a soft landing (a fast-out ease lurched)
  let built = null, anim = null;
  more.addEventListener('click', async () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', open);
    const h0 = paper.hidden ? 0 : paper.getBoundingClientRect().height;
    anim?.cancel();
    if (open) {
      const m0 = paper.hidden ? 0 : parseFloat(getComputedStyle(paper).marginTop) || 0;
      paper.hidden = false; paper.style.height = `${h0}px`; paper.style.marginTop = `${m0}px`; paper.style.overflow = 'hidden';
      built ??= import('./fig3panel.js').then(m => m.initFig3(paper.querySelector('.t-paper-in')));
      await built;                                         // (the first time: drawn while still shut)
      if (more.getAttribute('aria-expanded') !== 'true') return;      // closed again meanwhile
      paper.style.height = ''; const h1 = paper.scrollHeight; paper.style.height = `${h0}px`;   // measured in one task: never painted at full height
      anim = paper.animate([{ height: `${h0}px`, marginTop: `${m0}px`, opacity: 0.2 }, { height: `${h1}px`, marginTop: '14px', opacity: 1 }], { duration: reduced ? 0 : clamp(h1 * 1.1, 380, 620), easing: GLIDE });
      paper.style.height = ''; paper.style.marginTop = '14px';
      anim.onfinish = () => { anim = null; paper.style.overflow = ''; };
    } else {
      paper.style.overflow = 'hidden';
      anim = paper.animate([{ height: `${h0}px`, marginTop: '14px', opacity: 1 }, { height: '0px', marginTop: '0px', opacity: 0 }], { duration: reduced ? 0 : clamp(h0 * 1.0, 340, 560), easing: GLIDE });
      anim.onfinish = () => { anim = null; paper.hidden = true; paper.style.overflow = ''; paper.style.marginTop = '0px'; };
    }
  });

  quiet(() => {                                          // the paper's figure: its code, its numbers, and a first 2D canvas (whose set-up can take a while)
    import('./fig3panel.js').then(m => m.loadFig3());
    const g = document.createElement('canvas').getContext('2d'); g.font = `600 12px ${getComputedStyle(document.body).fontFamily}`; g.fillText('0', 0, 10);
  }, { after: 1500 });

  window.__s3 = { st, C, J, jumpTo, setPlaying, fbAt };
  const frame = now => { requestAnimationFrame(frame); tick(now); };
  requestAnimationFrame(frame);
}
