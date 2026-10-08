// Section 5's 3D (js/s5.js): the overview video's part 5 shots as live scenes, built from the video's own v3 scene
// module (tools/export_part5_3d.py: its hands, objects, support, materials, light rig and studio bowl) and driven by
// the video's data (tools/export_part5_data.py): DexMachina's two rollouts at their native 60 Hz, SPIDER as the final
// video's pan cut (its orbiting camera and its clock: the episode holds at each commit while the optimiser's real
// candidates grow out of the fingertips, generation after generation, and tighten into the chosen plan).
//  - one renderer per player, over both cards (as section 4's replay); the cards' rounded corners are the canvas mask
//    (js/s5.js)
//  - the camera: the video's (one schedule for both cards), cropped to the card around what it frames; drag to orbit
//  - the look: the video's s20 rig as area lights with soft VSM shadows, the dark hand parts at 0.7 x key and rim (its
//    light linking), AgX Medium High Contrast at -2.8, then the video's grade (lookGrade). As in its studio pass,
//    DexMachina's floor carries no shadow and its support reads as a faint shape; SPIDER's object casts its contact
//    shadow on the invisible plinth's catcher
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Z2Y, CAL, agxContrast, lookGrade, lookMaterials, initAreaLights, makeRenderer, studioMat, addStudioLights, shadowSize, fitShadowBias } from './studio3d.js';
import { stageOrbit } from './stageorbit.js';
import { readColumns } from './gpuread.js';

const A = new URL('../assets/s5/3d/', import.meta.url).href;
const SIDES = ['js', 'ours'];
export const SHOTS = {
  box: { kind: 'dm', glb: 'box', env: 'env_dm_box', m: { js: 'jspace', ours: 'ours' } },
  notebook: { kind: 'dm', glb: 'notebook', env: 'env_dm_notebook', m: { js: 'jspace', ours: 'ours' } },
  pencil: { kind: 'sp', glb: 'pencil', env: 'env_spider', m: { js: 'iid', ours: 'pca' } },
  spoon: { kind: 'sp', glb: 'spoon', env: 'env_spider', m: { js: 'iid', ours: 'pca' } },
};
const smoother = x => { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (6 * x - 15) + 10); };
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / Math.max(b - a, 1e-9)));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// the video's grade on a display colour (engine.grade), for what is drawn without tone mapping (lines, ghost, support)
export function gradeColor(hex) {
  const c = new THREE.Color(hex);
  const e = [c.r, c.g, c.b].map(v => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
    .map((x, i) => clamp((x - 0.22 * Math.sin(2 * Math.PI * x) / (2 * Math.PI)) * [1.012, 1, 0.985][i], 0, 1));
  return new THREE.Color().setRGB(e[0], e[1], e[2], THREE.SRGBColorSpace);
}

MeshoptDecoder.useWorkers?.(2);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = {};
export function loadModels(id) {
  const S = SHOTS[id];
  return (cache[id] ??= Promise.all([loader.loadAsync(`${A}${S.glb}.glb`), cache[S.env] ??= loader.loadAsync(`${A}${S.env}.glb`),
                                     fetch(`${A}${S.glb}.json`).then(r => r.json())]).then(([rig, env, info]) => ({ rig, env, info })));
}

// ---------------------------------------------------------------- SPIDER's clock (the video's pan cut), shared with s5.js
// frames: [{ ph: hold | round | execute, r: commit, tau: episode s }] at fps; at page time u (s on the video's clock):
// the frame, the episode time, and the round's own clock
export function spClock(J) {
  if (J._clk) return J._clk;
  const F = J.frames, fps = J.fps, rounds = {};
  F.forEach((f, i) => { if (f.ph === 'round') { const r = rounds[f.r] ??= { i0: i, n: 0 }; r.n++; } });
  const at = u => {
    const x = clamp(u * fps, 0, F.length - 1), i = Math.floor(x), f = F[i], g = F[Math.min(F.length - 1, i + 1)], w = x - i;
    const R = f.ph === 'round' ? rounds[f.r] : null;
    return { x, ph: f.ph, r: f.r, tau: f.tau + (g.tau - f.tau) * w, rt: R ? (x - R.i0 + 1) / fps : 0, rd: R ? R.n / fps : 0 };
  };
  return (J._clk = { at, n: F.length, dur: F.length / fps, rounds, fps });
}

// ---------------------------------------------------------------- materials
// the target: the object where the demonstration has it, a frosted white ghost with a brighter rim (the video's
// target material at alpha 0.75), 0.7 mm inside the object's surface so the two never fight where they coincide
function ghostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: 1 }, uC: { value: gradeColor('#e9edf2') } }, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec3 p = position - normal * 0.0007; vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; uniform vec3 uC; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8);
        gl_FragColor = vec4(uC * (0.94 + 0.12 * f), uA * 0.75 * (0.42 + 0.58 * f));
        #include <colorspace_fragment>
      }`,
  });
}
// a shadow catcher with soft edges and a contact factor (SPIDER's: the invisible plinth's shadow vanishes once the
// object is lifted 8 cm)
function catcherMaterial(hx, hy, soft, opacity) {
  const m = new THREE.ShadowMaterial({ opacity, depthWrite: false, toneMapped: false });
  m.userData.k = { value: 1 }; m.userData.rect = { value: new THREE.Vector3(hx, hy, soft) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uK = m.userData.k; sh.uniforms.uRect = m.userData.rect;
    sh.vertexShader = 'varying vec2 vLoc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLoc = position.xy;');
    sh.fragmentShader = 'uniform vec3 uRect; uniform float uK; varying vec2 vLoc;\n' + sh.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      'float w = 1.0 - smoothstep( 0.0, uRect.z, length( max( abs( vLoc ) - uRect.xy, 0.0 ) ) );\n\tgl_FragColor = vec4( color, uK * w * opacity * ( 1.0 - getShadowMask() ) );');
  };
  return m;
}
function handGain(root, dark, gains) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!dark.includes(m.name) || m.userData.gain) continue;
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
}
function lines(hex, maxSeg, w = 1) {
  const g = new LineSegmentsGeometry();
  g.setPositions(new Float32Array(maxSeg * 6));
  const m = new LineMaterial({ color: gradeColor(hex), linewidth: 1, transparent: true, depthWrite: false, toneMapped: false, worldUnits: false });
  const l = new LineSegments2(g, m); l.frustumCulled = false; l.renderOrder = 5; l.userData.w = w; l.visible = false;
  return l;
}
function setSegs(l, n) { l.geometry.attributes.instanceStart.data.needsUpdate = true; l.geometry.instanceCount = n; l.visible = n > 0 && l.material.opacity > 0.003; }

// ---------------------------------------------------------------- the renderer
export async function createP5(canvas, cardsEl, { mobile, key = 'eg-orbit-demo-s5' }) {
  const renderer = makeRenderer(canvas, { mobile });
  initAreaLights();
  // the ambient: the video's own surroundings, as the hands see them: its studio bowl (the baked light) under its white
  // world (Cycles world strength), prefiltered once per bowl
  const envs = {};
  function studioEnv(env, info, at) {
    const k = `${env.scene.uuid}|${at.toArray().map(v => v.toFixed(2)).join(',')}`;
    if (envs[k]) return envs[k];
    const sc = new THREE.Scene(), w = new THREE.Group(); w.matrixAutoUpdate = false; w.matrix.copy(Z2Y); sc.add(w);
    const e = env.scene.clone(true); e.traverse(o => { if (o.isMesh) o.material = studioMat; }); w.add(e);
    sc.background = new THREE.Color(info.world, info.world, info.world);
    const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(sc, 0, 0.05, 60, { position: at }).texture; pm.dispose();
    return (envs[k] = t);
  }
  const cards = Object.fromEntries(SIDES.map(s => [s, cardsEl.querySelector(`[data-side="${s}"]`)]));
  const built = {};
  let shot = null;

  function build(id, models, data) {
    const S = SHOTS[id], { rig, env, info } = models, J = data.json, arr = data.arr;
    const focusW = new THREE.Vector3(...J.camera.focus), focus = focusW.clone().applyMatrix4(Z2Y);
    // the shadowed lights first (key, top): three gives the area lights their shadow maps in order (studio3d.js), so the
    // low fill and rim (which barely shadow) come last and cast none: half the shadow maps, the same look
    const ORDER = ['key', 'top', 'fill', 'rim'], lights = [...info.lights].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
    const gains = lights.map(L => L.hand_gain);
    const out = { id, kind: S.kind, J, arr, focus, sides: {}, clk: S.kind === 'sp' ? spClock(J) : null };
    for (const s of SIDES) {
      const m = S.m[s];
      const bg = new THREE.Scene(), fg = new THREE.Scene(); fg.environment = studioEnv(env, info, focus);
      const wb = new THREE.Group(), wf = new THREE.Group();
      [wb, wf].forEach(w => { w.matrixAutoUpdate = false; w.matrix.copy(Z2Y); });
      bg.add(wb); fg.add(wf);
      const e = env.scene.clone(true); e.traverse(o => { if (o.isMesh) o.material = studioMat; }); wb.add(e);
      lookMaterials(wb);
      const r = rig.scene.clone(true); wf.add(r);
      r.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      lookMaterials(wf); handGain(wf, info.dark, gains);
      const node = n => { const x = r.getObjectByName(n); if (x) x.matrixAutoUpdate = false; return x; };
      const side = { bg, fg, m, table: r.getObjectByName('S') };
      if (S.kind === 'dm') {
        side.groups = [['left', arr[`${m}.left.p`].shape[1]], ['right', arr[`${m}.right.p`].shape[1]], ['obj', 2]]
          .map(([k, n]) => ({ key: k, n, nodes: Array.from({ length: n }, (_, i) => node(k === 'obj' ? `O_${i}` : `H_${k}_${i}`)) }));
      } else {
        const nb = arr[`${m}.B.p`].shape[1], ib = J.object_body;
        side.groups = [{ key: 'B', n: nb, nodes: Array.from({ length: nb }, (_, i) => node(i === ib ? 'O_0' : `B_${i}`)) }];
      }
      const gm = ghostMaterial(), gnodes = [];
      for (let i = 0; i < (S.kind === 'dm' ? 2 : 1); i++) {
        const o = r.getObjectByName(`O_${i}`); if (!o) continue;
        const g = o.clone(true); g.matrixAutoUpdate = false;
        g.traverse(x => { if (x.isMesh) { x.material = gm; x.castShadow = false; x.receiveShadow = false; x.renderOrder = 3; } });
        wf.add(g); gnodes.push(g);
      }
      side.ghost = { nodes: gnodes, mat: gm };
      // the shadows: each light's soft map wide enough to take in the whole floor the cards can show (no cut-off), its
      // darkness eased as the video's big area lights soften them
      // DexMachina aims them at the floor under the table (its shadow falls there), SPIDER at the hand
      const aimS = S.kind === 'dm' ? new THREE.Vector3(focus.x, 0, focus.z) : focus;
      side.spots = addStudioLights(fg, lights, aimS, { mobile, angle: S.kind === 'dm' ? 0.62 : 0.5, near: 0.3, far: 12, radius: S.kind === 'dm' ? 10 : 20 });
      // SPIDER: the video's soft contact shadow (matched to its cold-start frame): the low fill and rim lights barely shadow
      const SPI = { key: 0.7, fill: 0.1, top: 0.7, rim: 0.1 };
      side.spots.forEach((sp, i) => {
        const nm = lights[i].name; sp.castShadow = nm === 'key' || nm === 'top';
        const n = shadowSize(mobile ? 512 : 1024, sp.shadow.radius); sp.shadow.mapSize.set(n, n); fitShadowBias(sp); sp.shadow.intensity = S.kind === 'dm' ? 0.85 : (SPI[nm] ?? 0.7);
      });
      if (S.kind === 'dm') {
        // DexMachina: the hands, the object and the support shadow the studio itself: the bowl's own surface is the
        // catcher (the floor and its cove alike, so a long shadow runs on up the cove instead of ending where a flat
        // catcher would go under it), drawn just in front of the bowl
        const cm = catcherMaterial(1e3, 1e3, 1, 0.14); Object.assign(cm, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
        const cat = env.scene.clone(true); cat.traverse(o => { if (o.isMesh) { o.material = cm; o.receiveShadow = true; o.castShadow = false; o.renderOrder = 1; } });
        wf.add(cat);
      }
      if (S.kind === 'sp') {
        if (J.catcher) {
          const c = J.catcher, [cx, cy, hx, hy, yaw] = c.rect;
          const cat = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hx + 0.2), 2 * (hy + 0.2)), catcherMaterial(hx, hy, 0.16, 0.24));
          cat.position.set(cx, cy, c.z + 0.0005); cat.rotation.z = yaw * Math.PI / 180;
          cat.receiveShadow = true; cat.renderOrder = 1; wf.add(cat); side.catcher = cat;
          side.objZ0 = arr[`${m}.B.p`][J.object_body * 3 + 2];
        }
        // the funnel: one line set per generation (its own colour and fade) and the chosen plan
        const lk = J.look, nh = J.arms[m].n_h, G = Math.max(...Object.values(J.rounds.gens).map(g => g.length));
        side.gens = Array.from({ length: G }, () => { const l = lines(lk.grey, 24 * 5 * (nh - 1)); wf.add(l); return l; });
        side.plan = lines(lk.soft[m], 5 * (nh - 1), lk.plan_w / lk.w); wf.add(side.plan);
        side.nh = nh;
      }
      out.sides[s] = side;
    }
    out.cam = { f: J.camera.f, cx: J.camera.cx, cy: J.camera.cy, C: J.camera.C, card: J.camera.card,
                R: S.kind === 'dm' ? null : J.camera.R, R0: S.kind === 'dm' ? J.camera.R.flat() : null, key: S.kind === 'dm' ? J.camera.state : null };
    // what the cards frame: the region the video's own camera fitted the content into (SPIDER's pan: its zone_fit;
    // DexMachina's tracking camera: the action zone), so the framing is the video's
    // the video's card window (39..961 of its 1000 px frame) from its top down to where its plot slab began (y 800):
    // what the video showed above the slab, so the framing (and SPIDER's samples) are the video's
    const zc = S.kind === 'sp' && J.camera.zone_fit ? J.camera.zone_fit : J.camera.zone;
    out.frame = { x0: J.camera.card[0], y0: J.camera.card[1], x1: J.camera.card[2], y1: 800, cy: (zc[1] + zc[3]) / 2, cx: (zc[0] + zc[2]) / 2 };
    return out;
  }

  // ---- poses at time u (DexMachina: sim s; SPIDER: the video's clock)
  const P = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
  function poseNodes(nodes, pA, qA, n, i0, i1, w) {
    for (let j = 0; j < n; j++) {
      const o = nodes[j]; if (!o) continue;
      const a = (i0 * n + j) * 3, b = (i1 * n + j) * 3, c = (i0 * n + j) * 4, d = (i1 * n + j) * 4;
      P.set(pA[a] + (pA[b] - pA[a]) * w, pA[a + 1] + (pA[b + 1] - pA[a + 1]) * w, pA[a + 2] + (pA[b + 2] - pA[a + 2]) * w);
      Q.set(qA[c], qA[c + 1], qA[c + 2], qA[c + 3]); Q2.set(qA[d], qA[d + 1], qA[d + 2], qA[d + 3]); Q.slerp(Q2, w);
      o.matrix.compose(P, Q, ONE); o.matrixWorldNeedsUpdate = true;
    }
  }
  const frameOf = (x, n) => { x = clamp(x, 0, n - 1); const i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1); return [i0, i1, x - i0]; };
  // the orbit's centre: DexMachina's table (the middle of its top, fixed), SPIDER's hand (the centre of its bodies, time
  // aligned so the turn follows the hand), W -> three
  const PV = new THREE.Vector3();
  function pivotOf(S, kind) {
    S.pivot ??= new THREE.Vector3();
    if (kind === 'dm') { if (!S.tableSet) { const b = new THREE.Box3(); S.table?.updateWorldMatrix(true, true); if (S.table) b.setFromObject(S.table); if (!b.isEmpty()) { S.pivot.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2); S.tableSet = true; } } return; }
    let n = 0; PV.set(0, 0, 0);
    for (const o of S.groups[0].nodes) if (o) { PV.x += o.matrix.elements[12]; PV.y += o.matrix.elements[13]; PV.z += o.matrix.elements[14]; n++; }
    if (n) S.pivot.copy(PV.multiplyScalar(1 / n)).applyMatrix4(Z2Y);
  }
  function pose(sh, u) {
    const arr = sh.arr;
    for (const s of SIDES) {
      const S = sh.sides[s], m = S.m;
      if (sh.kind === 'dm') {
        const [i0, i1, w] = frameOf(u * 60, arr[`${m}.obj.p`].shape[0]);
        for (const g of S.groups) poseNodes(g.nodes, arr[`${m}.${g.key}.p`], arr[`${m}.${g.key}.q`], g.n, i0, i1, w);
        poseNodes(S.ghost.nodes, arr[`${m}.tgt.p`], arr[`${m}.tgt.q`], S.ghost.nodes.length, i0, i1, w);
      } else {
        const c = sh.clk.at(u), [i0, i1, w] = frameOf(c.x, sh.clk.n);
        const g = S.groups[0]; poseNodes(g.nodes, arr[`${m}.B.p`], arr[`${m}.B.q`], g.n, i0, i1, w);
        poseNodes(S.ghost.nodes, arr[`${m}.tgt.p`], arr[`${m}.tgt.q`], 1, i0, i1, w);
        if (S.catcher) {
          const zi = arr[`${m}.B.p`], ib = sh.J.object_body, nb = g.n, z = zi[(i0 * nb + ib) * 3 + 2] + (zi[(i1 * nb + ib) * 3 + 2] - zi[(i0 * nb + ib) * 3 + 2]) * w;
          S.catcher.material.userData.k.value = 1 - smoother((z - S.objZ0) / 0.08);
        }
        funnel(sh, S, c);
      }
      pivotOf(S, sh.kind);
    }
  }
  // the video's sampling (p5_samples.py style C, the funnel): in commit r's round each generation of the optimiser's
  // candidates (updates 0, 3, 7, 15 in a long round, 0 and 15 in a short one) grows out of the fingertips over the last,
  // from grey to the method's colour, the older ones left as faint ghosts; then the chosen plan draws on. While the
  // commit executes, its plan stays ahead of the hand and fades over its last 30 %
  // (arrays: s<r> (gens, 24, n_h, 5, 3), p<r> (n_h, 5, 3), W)
  function tipSegs(buf, w, A, base, stride, nh, f0, f1) {
    const j0 = Math.floor(f0 * (nh - 1)), j1 = Math.round(f1 * (nh - 1));
    for (let j = j0; j < j1; j++) {
      const a = base + j * stride, b = a + stride;
      buf[w++] = A[a]; buf[w++] = A[a + 1]; buf[w++] = A[a + 2]; buf[w++] = A[b]; buf[w++] = A[b + 1]; buf[w++] = A[b + 2];
    }
    return w;
  }
  const grey = new THREE.Color(), strong = new THREE.Color();
  function funnel(sh, S, c) {
    const J = sh.J, lk = J.look, nh = S.nh, arr = sh.arr, m = S.m;
    for (const l of S.gens) { l.material.opacity = 0; setSegs(l, 0); }
    S.plan.material.opacity = 0; setSegs(S.plan, 0);
    if (c.ph === 'round') {
      const gens = J.rounds.gens[c.r], D = c.rd, t = c.rt, long = D >= 2.0, grow = long ? 0.45 : 0.3;
      const planIn = D - (long ? 0.7 : 0.4), pa = smoother(seg(t, planIn, D)), span = planIn / gens.length;
      const Sx = arr[`${m}.s${c.r}`];
      grey.set(lk.grey); strong.set(lk.strong[m]);
      gens.forEach((upd, g) => {
        const t0 = g * span, l = S.gens[g]; if (t < t0) return;
        const gr = smoother(seg(t, t0, t0 + grow)), ghost = g < gens.length - 1 ? 1 - 0.78 * smoother(seg(t, t0 + span, t0 + span + 0.3)) : 1;
        l.material.color.copy(gradeColor('#' + grey.clone().lerp(strong, g / (gens.length - 1)).getHexString()));
        l.material.opacity = lk.a * ghost * (1 - pa);
        const buf = l.geometry.attributes.instanceStart.data.array; let w = 0;
        for (let p = 0; p < 24; p++) for (let q = 0; q < 5; q++) w = tipSegs(buf, w, Sx, (((g * 24 + p) * nh) * 5 + q) * 3, 15, nh, 0, gr);
        setSegs(l, w / 6);
      });
      if (pa > 0) planLines(S, arr[`${m}.p${c.r}`], nh, 0, pa, lk.plan_a * pa);
    } else if (c.ph === 'execute') {
      const t0 = J.arms[m].commit_start[c.r] * 0.01, fr = (c.tau - t0) / lk.seg_s;
      if (fr >= 0 && fr < 1) planLines(S, arr[`${m}.p${c.r}`], nh, fr, 1, lk.plan_a * (1 - smoother(seg(fr, 0.7, 1.0))));
    }
  }
  function planLines(S, Pk, nh, f0, f1, alpha) {
    const l = S.plan, buf = l.geometry.attributes.instanceStart.data.array; let w = 0;
    for (let q = 0; q < 5; q++) w = tipSegs(buf, w, Pk, q * 3, 15, nh, f0, f1);
    l.material.opacity = alpha; setSegs(l, w / 6);
  }

  // ---- the camera: the video's at time u (DexMachina's tracking camera: a fixed turn, a moving centre; SPIDER's pan:
  // orbiting about the scene's aim)
  const Cb = new THREE.Vector3(), baseM = new THREE.Matrix4(), piv = new THREE.Vector3();
  let Rb = null;
  function baseCamera(sh, u) {
    const cm = sh.cam;
    if (sh.kind === 'dm') {
      const key = cm.key, x = u * 60; let lo = 0, hi = key.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (key[mid] <= x) lo = mid; else hi = mid; }
      const w = key[hi] > key[lo] ? clamp((x - key[lo]) / (key[hi] - key[lo]), 0, 1) : 0, a = cm.C[lo], b = cm.C[hi];
      Cb.set(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w); Rb = cm.R0;
      const c0 = cm.C[0]; piv.set(c0[0], c0[1], c0[2]).negate().add(Cb).applyMatrix4(Z2Y).add(sh.focus);   // the pivot travels with the camera
    } else {
      const [i0, i1, w] = frameOf(sh.clk.at(u).x, sh.clk.n), a = cm.C[i0], b = cm.C[i1], ra = cm.R[i0], rb = cm.R[i1];
      Cb.set(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w);
      Rb = ra.map((v, k) => v + (rb[k] - v) * w);
      piv.copy(sh.focus);
    }
    const R = Rb;                                            // OpenCV rows (x right, y down, z forward) -> a Blender camera, into three
    baseM.set(R[0], -R[3], -R[6], Cb.x, R[1], -R[4], -R[7], Cb.y, R[2], -R[5], -R[8], Cb.z, 0, 0, 0, 1).premultiply(Z2Y);
    return baseM;
  }
  // what the cards frame: the hands, the object and its ghost over the whole run (both sides), as the video's camera
  // saw them (full-frame px), clipped to the video's card window, 2 - 98 % (a hand that wanders off does not shrink it)
  function contentBox(sh) {
    const boxes = new Map(), V = new THREE.Vector3(), Bx = new THREE.Box3(), M = new THREE.Matrix4();
    const localBox = o => {
      if (boxes.has(o)) return boxes.get(o);
      const b = new THREE.Box3(); o.updateWorldMatrix(true, true); M.copy(o.matrixWorld).invert();
      o.traverse(x => { if (x.isMesh && x !== o) { x.geometry.computeBoundingBox(); Bx.copy(x.geometry.boundingBox).applyMatrix4(M.clone().multiply(x.matrixWorld)); b.union(Bx); } });
      boxes.set(o, b); return b;
    };
    const xs = [], ys = [], f = sh.cam.f;
    const T = sh.kind === 'dm' ? sh.arr[`${SHOTS[sh.id].m.js}.obj.p`].shape[0] / 60 : sh.clk.dur;
    for (let k = 0; k <= 24; k++) {
      const u = T * k / 24; pose(sh, u); baseCamera(sh, u);
      const R = Rb, C = Cb;
      for (const s of SIDES) {
        const S = sh.sides[s];
        for (const o of [...S.groups.flatMap(g => g.nodes), ...S.ghost.nodes].filter(Boolean)) {
          const b = localBox(o); if (b.isEmpty()) continue;
          for (let i = 0; i < 8; i++) {
            V.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrix);
            const dx = V.x - C.x, dy = V.y - C.y, dz = V.z - C.z, zc = R[6] * dx + R[7] * dy + R[8] * dz; if (zc < 0.05) continue;
            xs.push(f * (R[0] * dx + R[1] * dy + R[2] * dz) / zc + sh.cam.cx); ys.push(f * (R[3] * dx + R[4] * dy + R[5] * dz) / zc + sh.cam.cy);
          }
        }
      }
    }
    const q = (a, p) => { const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.max(0, Math.round(p * (b.length - 1))))]; };
    const cw = sh.cam.card;
    return { x0: Math.max(cw[0], q(xs, 0.02)), x1: Math.min(cw[2], q(xs, 0.98)), y0: Math.max(cw[1], q(ys, 0.02)), y1: Math.min(cw[3], q(ys, 0.98)) };
  }
  // the reader's hold on the stage: section 3's, shared (js/stageorbit.js): the lean toward the mouse, the drag, the held
  // camera, the Reset glide, the one-time turn
  let curU = 0, dirty = true, lastKey = '', size = [0, 0], wasOrb = false;
  const O = stageOrbit(cardsEl, { key, now: () => curU });
  const Y = new THREE.Vector3(0, 1, 0), cR = new THREE.Vector3(), C0 = new THREE.Vector3(), C1 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), Q1 = new THREE.Quaternion(), oq1 = new THREE.Quaternion(), oq2 = new THREE.Quaternion(), V = new THREE.Vector3();
  const cams = Object.fromEntries(SIDES.map(s => [s, new THREE.PerspectiveCamera()]));
  function placeCamera(cam, sh, u, side) {
    const T = O.camT(u);                                    // the video's camera at the held moment, gliding back after a Reset
    let M = baseCamera(sh, T.u); C0.setFromMatrixPosition(M); Q0.setFromRotationMatrix(M);
    if (T.live != null) { M = baseCamera(sh, T.live); C1.setFromMatrixPosition(M); Q1.setFromRotationMatrix(M); C0.lerp(C1, T.w); Q0.slerp(Q1, T.w); }
    if (side && sh.sides[side].pivot) piv.copy(sh.sides[side].pivot);
    // orbit about the subject (as section 3: yaw about up, pitch about the camera's right), the video's framing kept
    const a = O.angles();
    V.copy(C0).sub(piv); cR.crossVectors(V, Y).normalize();
    oq1.setFromAxisAngle(Y, a.yaw); oq2.setFromAxisAngle(cR, a.pitch);
    V.applyQuaternion(oq2).applyQuaternion(oq1);
    cam.position.copy(piv).add(V); cam.quaternion.copy(oq1).multiply(oq2).multiply(Q0);
    cam.updateMatrixWorld(true);
  }
  // the card's window of the video's 1000 x 1110 frame: what it frames, with room around it, at the card's aspect
  function windowFor(sh, w, h) {
    // phones' square cards: a little closer, as section 3's (0.84 of the video's card width)
    const F = sh.frame, bw = F.x1 - F.x0, bh = F.y1 - F.y0, a = w / h, sq = a < 1.2;
    const W = sq ? Math.max(bw * 0.84, bh * 0.84 * a) : Math.max(bw, bh * a), H = W / a;
    return { x: (F.cx ?? (F.x0 + F.x1) / 2) - W / 2, y: (F.cy ?? (F.y0 + F.y1) / 2) - H / 2, W, H };
  }
  function project(cam, sh, win) {
    const f = sh.cam.f, near = 0.02, l = (win.x - sh.cam.cx) / f * near, r = (win.x + win.W - sh.cam.cx) / f * near, t = (sh.cam.cy - win.y) / f * near, b = (sh.cam.cy - win.y - win.H) / f * near;
    cam.projectionMatrix.makePerspective(l, r, t, b, near, 40);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width !== size[0] || r.height !== size[1]) { size = [r.width, r.height]; renderer.setSize(r.width, r.height, false); dirty = true; }
  }
  // one card: the bowl, then everything else (the lines depth-tested against the hand: behind it hidden, in front over
  // it, as the video's back / front sample layers); its lines at the video's widths (2 px, the plan 3, at 1000 px)
  function drawSide(s, u, vx, vy, vw, vh, win, dpr, shadows) {
    const S = shot.sides[s], cam = cams[s];
    placeCamera(cam, shot, u, s); project(cam, shot, win);
    renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
    if (S.gens) for (const l of [...S.gens, S.plan]) { l.material.resolution.set(vw * dpr, vh * dpr); l.material.linewidth = Math.max(1, 2 * l.userData.w * vw * dpr / win.W); }
    renderer.autoClear = true; renderer.render(S.bg, cam); renderer.autoClear = false;
    if (shadows) renderer.shadowMap.needsUpdate = true;
    renderer.render(S.fg, cam);
  }
  let lastPose = '';
  function render(u, force = false) {
    if (!shot) return;
    const t = performance.now(), dt = Math.min(0.1, (t - (render.t ?? t)) / 1000); render.t = t; curU = u;
    O.tick(dt, t);
    const orb = O.orbited(); if (orb !== wasOrb) { wasOrb = orb; onChange.forEach(f => f(orb)); }
    resize();
    const pk = `${shot.id}|${u.toFixed(4)}`, key = `${pk}|${O.key()}`;
    if (!dirty && !force && key === lastKey) return;
    dirty = false; lastKey = key;
    const posed = pk !== lastPose || force; if (posed) { pose(shot, u); lastPose = pk; }
    const cr = canvas.getBoundingClientRect(), dpr = renderer.getPixelRatio();
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
    renderer.toneMappingExposure = Math.pow(2, -2.8 + CAL.exposure); agxContrast.value = CAL.contrast; lookGrade.value = 1;
    for (const s of SIDES) {
      const r = cards[s].getBoundingClientRect();
      drawSide(s, u, r.left - cr.left, cr.bottom - r.bottom, r.width, r.height, windowFor(shot, r.width, r.height), dpr, posed || !shot.sides[s].shadowed);
      shot.sides[s].shadowed = true;
    }
    renderer.autoClear = true; lookGrade.value = 0;
  }
  // the studio's gradient at the cards' edges (as section 3): right after a frame, one column of pixels just inside each
  // card's left and right edge, 24 stops top to bottom, the median of the four (a hand crossing one does not count)
  // asynchronous (js/gpuread.js): the frame is drawn and its pixels queued now, they arrive a frame or two later
  async function sampleEdges(u) {
    if (!shot) return null;
    render(u, true);
    const gl = renderer.getContext(), p = renderer.getPixelRatio(), cr = canvas.getBoundingClientRect(), N = 24, cols = [];
    for (const s of SIDES) { const r = cards[s].getBoundingClientRect(); cols.push([r.left - cr.left + 6, r.top - cr.top, r.height], [r.right - cr.left - 7, r.top - cr.top, r.height]); }
    const reads = cols.map(([cx, cy, ch]) => [Math.round(cx * p), Math.round((cr.height - cy - ch) * p) + 2, Math.max(8, Math.floor(ch * p) - 4)]);
    const per = (await readColumns(gl, reads)).map((buf, j) => {
      const n = reads[j][2];
      return Array.from({ length: N }, (_, i) => { const r = Math.round((1 - i / (N - 1)) * (n - 1)) * 4; return [buf[r], buf[r + 1], buf[r + 2], buf[r + 3]]; });
    });
    // the studio's light at each height: the median of the four columns (section 3's: a hand crossing one does not count),
    // the studio's falloff kept monotonic down the page (a shadow's dip is lifted), then smoothed: no band, no dip
    let stops = Array.from({ length: N }, (_, i) => { const c = per.map(x => x[i]).sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]); return c[1].map((v, k) => Math.round((v + c[2][k]) / 2)); });
    if (stops.some(c => c[3] < 250)) return null;                 // not drawn yet
    stops = stops.map(c => c.slice(0, 3));
    const up = stops[N - 1][0] + stops[N - 1][1] + stops[N - 1][2] >= stops[0][0] + stops[0][1] + stops[0][2];
    for (let i = 1; i < N; i++) for (let k = 0; k < 3; k++) stops[i][k] = up ? Math.max(stops[i][k], stops[i - 1][k]) : Math.min(stops[i][k], stops[i - 1][k]);
    stops = stops.map((c, i) => (i === 0 || i === N - 1 ? c : c.map((_, k) => Math.round((stops[i - 1][k] + 2 * c[k] + stops[i + 1][k]) / 4))));   // the ends exact
    return stops;
  }
  // a still through the video's own camera and its whole 1000 x 1110 frame (tools/web: compared with its renders)
  function still(side, u, grade = true) {
    const pr = renderer.getPixelRatio(), keep = [...size], o0 = JSON.stringify(O.st);
    Object.assign(O.st.orb, { az: 0, el: 0, taz: 0, tel: 0 }); Object.assign(O.st.hov, { x: 0, y: 0, tx: 0, ty: 0 }); O.st.peekYaw = 0;
    renderer.setPixelRatio(1); renderer.setSize(1000, 1110, false); renderer.setScissorTest(true);
    pose(shot, u);
    renderer.toneMappingExposure = Math.pow(2, -2.8 + CAL.exposure); agxContrast.value = CAL.contrast; lookGrade.value = grade ? 1 : 0;
    drawSide(side, u, 0, 0, 1000, 1110, { x: 0, y: 0, W: 1000, H: 1110 }, 1, true);
    const url = canvas.toDataURL('image/png');
    lookGrade.value = 0; renderer.autoClear = true;
    Object.assign(O.st, JSON.parse(o0)); renderer.setPixelRatio(pr); renderer.setSize(keep[0], keep[1], false); dirty = true; lastPose = '';
    return url;
  }

  const onChange = new Set();
  const reset = () => O.reset(), isOrbited = () => O.orbited();

  async function prepare(id, data) {
    if (built[id]) return built[id];
    const models = await loadModels(id);
    const sh = build(id, models, data);
    for (const s of SIDES) { const S = sh.sides[s]; await renderer.compileAsync(S.fg, cams[s]); await renderer.compileAsync(S.bg, cams[s]); }
    return (built[id] = sh);
  }
  async function setShot(id, data) { const sh = await prepare(id, data); shot = sh; dirty = true; lastPose = ''; SIDES.forEach(s => { sh.sides[s].shadowed = false; }); return sh; }
  return { render, setShot, prepare, reset, isOrbited, sampleEdges, peek: t => O.peek(t), stopDemo: () => O.stopDemo(), onChange: f => onChange.add(f), invalidate: () => { dirty = true; },
           get shot() { return shot?.id; }, _dbg: { renderer, cams, still, get sh() { return shot; }, envI(v) { for (const sh of Object.values(built)) for (const s of SIDES) sh.sides[s].fg.environmentIntensity = v; }, shadowI(v) { for (const sh of Object.values(built)) for (const s of SIDES) sh.sides[s].fg.traverse(o => { if (o.isSpotLight) o.shadow.intensity = v; }); },
           spShadow({ I, soft, opacity, radius, pad }) { for (const sh of Object.values(built)) { if (sh.kind !== 'sp') continue; for (const s of SIDES) { const S = sh.sides[s];
             S.spots?.forEach((sp, i) => { if (I) sp.shadow.intensity = I[i]; if (radius != null) sp.shadow.radius = radius; });
             if (S.catcher) { const m = S.catcher.material; if (opacity != null) m.opacity = opacity; if (soft != null) m.userData.rect.value.z = soft; if (pad != null) { const c = sh.J.catcher; S.catcher.scale.set((c.rect[2] + pad) / (c.rect[2] + c.pad), (c.rect[3] + pad) / (c.rect[3] + c.pad), 1); } }
             S.shadowed = false; } } dirty = true; },
           shadowCfg({ angle, radius, aimY, opacity }) { for (const sh of Object.values(built)) for (const s of SIDES) { const S = sh.sides[s]; S.spots?.forEach(sp => { if (angle != null) sp.angle = angle; if (radius != null) sp.shadow.radius = radius; if (aimY != null) { sp.target.position.y = aimY; sp.target.updateMatrixWorld(); } }); S.fg.traverse(o => { if (opacity != null && o.material?.isShadowMaterial) o.material.opacity = opacity; }); S.shadowed = false; } dirty = true; } } };
}
