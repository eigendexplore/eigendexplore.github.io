// Section 4: in-hand reorientation on the real Allegro hand, the overview video's part 4b rebuilt as a live A/B player,
// much slower: both filmed runs play on one clock from their trial starts, at 1x by default (the video ran them at
// 4-10x). The web videos are the video's overscan canvas (the frame on its static top extension, tools/
// encode_dextreme_os.py); everything on top is drawn live from the runs' data (assets/s4/hero.json): the AR cube (the
// tracked cube in the classic colours, behind the fingers in front of it, from the video's finger masks traced into
// polygons), the goal cube 15 cm above the palm with its "Goal" bubble, a light copy of the cube flying to the goal on
// each success, the success counter and the drop. The cubes are the video's own 3D cube (js/dex3d.js), rendered
// through the filmed camera and laid over the footage behind the fingers. "3D replay": the video's scene of the lab
// over both cards, dissolving in from the filmed view, to turn and look at. "More trials": the anonymous reviewer
// site's clips of four of the paper's 40 evaluation trials per method (the quartiles and the best: the robot's camera
// with its own cube overlay, goal inset and counter), shown whole, as they are.
import { glassify, pump } from './glass.js';
import { phone, engaged } from './stage.js';
import { quiet, breathe } from './idle.js';
import { orbitDemo } from './orbitdemo.js';
import { pairClock } from './pairclock.js';
import { LITE } from './lite.js';

const $ = (s, r = document) => r.querySelector(s);
const SIDES = ['js', 'ours'];
const FPS = 30000 / 1001, SONY = 60000 / 1001;      // web video frame k = Sony frame first + 2k
// the web videos' area of the overscan canvas (Sony px), and what every card must show: the hand, the cube and the goal
// cube with its bubble (wide cards stop short of the plate's right edge, x 1915); phones show the whole square
const FMT = { wide: { x0: 164, y0: -200, w: 1856, h: 1280 }, sq: { x0: 510, y0: -240, w: 1200, h: 1200 } };
const REGION = { wide: { x0: 470, x1: 1700, y0: -175, y1: 985, xmax: 1915 }, sq: { x0: 510, x1: 1710, y0: -240, y1: 960, xmax: 1710 } };
const HALF = 0.0325, GOAL_PALM = [0.049 + 0.15, 0.0136, 0.0278];       // the video's goal: 15 cm above the cube's mean place
// part4b.py: classic face colours, AR alpha .55, goal .92; on a success a copy flies to the goal (0.35 s on screen),
// then the goal turns to the next one (0.12 s, ease-out) with a 6 % pop (0.28 s); the counter rolls over 0.4 s
const COL = { '+X': '255,255,255', '-X': '255,213,0', '+Y': '196,30,58', '-Y': '255,88,0', '+Z': '0,81,186', '-Z': '0,158,96' };
const FACES = { '+X': [4, 5, 7, 6], '-X': [0, 2, 3, 1], '+Y': [2, 6, 7, 3], '-Y': [0, 1, 5, 4], '+Z': [1, 3, 7, 5], '-Z': [0, 4, 6, 2] };
const FN = { '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1] };
const BOX = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) BOX.push([x, y, z]);
const STUCK_AFTER = 3;                               // s after the last success (as the reviewer clips' tail)
const AR_ALPHA = 0.55, GOAL_ALPHA = 0.92, FLIGHT = 0.35, TURN = 0.12, POP = 0.28, ROLL = 0.4;
const RANK = { lq: 'lower quartile', median: 'median', uq: 'upper quartile', best: 'best' };
const NAME = { js: 'Joint\u2011Space', ours: 'EigenDEXplore' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// narrow screens (as sections 2 and 3): square cards and the square cut of the footage (room above the goal for its bubble)
const narrow = () => document.documentElement.clientWidth < 760;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const smoother = x => { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); };
const msc = s => { s = Math.max(0, Math.floor(s + 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------- quaternions (x y z w)
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + b[i] * wb);
}
function qmat(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
function matq(m) {                                   // 3x3 row-major -> x y z w
  const t = m[0] + m[4] + m[8];
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; return [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4]; }
  const i = m[0] > m[4] && m[0] > m[8] ? 0 : m[4] > m[8] ? 1 : 2, j = (i + 1) % 3, k = (i + 2) % 3, M = (r, c) => m[r * 3 + c];
  const s = Math.sqrt(M(i, i) - M(j, j) - M(k, k) + 1) * 2, q = [0, 0, 0, 0];
  q[i] = s / 4; q[j] = (M(j, i) + M(i, j)) / s; q[k] = (M(k, i) + M(i, k)) / s; q[3] = (M(k, j) - M(j, k)) / s;
  return q;
}

// ---------------------------------------------------------------- data
let HERO, SCORES, OCC = null, OCCV = null;
const RUN = {};
async function load() {
  const [H, bin, S] = await Promise.all([
    fetch('assets/s4/hero.json').then(r => r.json()), fetch('assets/s4/hero.bin').then(r => r.arrayBuffer()),
    fetch('assets/s4/scores.json').then(r => r.json())]);
  HERO = H; SCORES = S;
  const arr = name => { const L = H.layout[name], n = L.shape.reduce((a, b) => a * b, 1), a = new Int16Array(bin, L.offset, n), f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = a[i] * L.step; return f; };
  for (const m of SIDES) {
    const r = H.runs[m], T4 = r.T_cam_palm, Rcp = [T4[0][0], T4[0][1], T4[0][2], T4[1][0], T4[1][1], T4[1][2], T4[2][0], T4[2][1], T4[2][2]];
    const tcp = [T4[0][3], T4[1][3], T4[2][3]], qcp = matq(Rcp);
    const anchor = [0, 1, 2].map(i => Rcp[i * 3] * GOAL_PALM[0] + Rcp[i * 3 + 1] * GOAL_PALM[1] + Rcp[i * 3 + 2] * GOAL_PALM[2] + tcp[i]);
    const uOf = sf => (sf - r.first) / SONY, kOf = sf => clamp(Math.round((sf - r.first) / 2), 0, r.frames - 1);
    RUN[m] = {
      n: r.frames, first: r.first, K: r.K, cp: arr(`${m}_cube_p`), cq: arr(`${m}_cube_q`), q: arr(`${m}_q`), anchor,
      goals: r.goals.map(g => ({ q: qmul(qcp, g.q), u: uOf(g.from_frame), k: kOf(g.from_frame) })).sort((a, b) => a.u - b.u),
      // the run ends with its log (the hand's joints and the finger masks need it): the filmed clip may run a little longer
      succ: r.successes.map(uOf), end: Math.min((r.frames - 1) / FPS, r.data_last != null ? uOf(r.data_last) : 1e9),
      drop: r.release != null ? { u: uOf(r.release), k: kOf(r.release), land: kOf(r.landing ?? r.release) } : null, ending: r.ending,
      stuckAt: r.ending && r.ending.kind !== 'drop' && r.successes.length ? uOf(r.successes[r.successes.length - 1]) + STUCK_AFTER : null,
    };
  }
  // the finger masks come later (a larger file, only for the AR cube's occlusion): until then the cube is drawn whole
  Promise.all([fetch('assets/s4/occ.json').then(r => { if (!r.ok) throw r.status; return r.json(); }), fetch('assets/s4/occ.bin').then(r => { if (!r.ok) throw r.status; return r.arrayBuffer(); })])
    .then(([j, b]) => { OCC = j; OCCV = new DataView(b); occCache.clear(); dirty = true; }).catch(() => {});
}
// the finger polygons of web frame k (Sony px, even-odd), with a big rectangle first: clipping to it keeps the cube
// everywhere except where a finger is in front
const occCache = new Map();
function occPath(m, k) {
  const idx = OCC?.index?.[m]; if (!idx || k < 0 || k >= idx.length) return null;
  const key = `${m}${k}`; if (occCache.has(key)) return occCache.get(key);
  let o = idx[k]; const np = OCCV.getUint16(o, true); o += 2;
  let p = null;
  if (np) {
    p = new Path2D(); p.rect(-4000, -4000, 10000, 10000);
    const sc = OCC.scale ?? 0.5;
    for (let i = 0; i < np; i++) {
      const n = OCCV.getUint16(o, true); o += 2;
      // format 2: the first point, then steps from the last (int8; -128: an int16 step follows)
      let x = OCCV.getInt16(o, true), y = OCCV.getInt16(o + 2, true); o += 4; p.moveTo(x * sc, y * sc);
      for (let j = 1; j < n; j++) {
        const dx = OCCV.getInt8(o);
        if (dx === -128) { x += OCCV.getInt16(o + 1, true); y += OCCV.getInt16(o + 3, true); o += 5; }
        else { x += dx; y += OCCV.getInt8(o + 1); o += 2; }
        p.lineTo(x * sc, y * sc);
      }
      p.closePath();
    }
  }
  if (occCache.size > 24) occCache.delete(occCache.keys().next().value);
  occCache.set(key, p); return p;
}

// ---------------------------------------------------------------- state
const st = { view: 'filmed', u: 0, speed: 1, playing: false, dragging: false, visible: false, ended: false };
const cardEl = {}, vids = {}, tvids = {}, ov = {}, cv = {}, shownK = { js: 0, ours: 0 };
// More trials: both clips on one clock (a clip that stalls holds the other)
const TC = pairClock(() => SIDES.map(m => tvids[m]), { speed: () => st.speed });
let L = 1, dirty = true, trialK = 'median', AR = null, arFailed = false;
let replay = null, replayLoading = null, leaving3d = false, demo3d = null, demoAt = 0;

// ---------------------------------------------------------------- card geometry: Sony px -> card px
function viewOf(m) {
  const el = cardEl[m], w = el.clientWidth, h = el.clientHeight, f = narrow() ? 'sq' : 'wide', E = FMT[f], R = REGION[f];
  const s = Math.min(w / (R.x1 - R.x0), h / (R.y1 - R.y0)), vw = w / s, vh = h / s;
  const x0 = clamp((R.x0 + R.x1 - vw) / 2, E.x0, Math.min(E.x0 + E.w, R.xmax) - vw), y0 = clamp((R.y0 + R.y1 - vh) / 2, E.y0, E.y0 + E.h - vh);
  return { w, h, s, x0, y0, f, E };
}
const VIEW = {};
function layout() {
  const D = Math.min(devicePixelRatio || 1, 2);
  for (const m of SIDES) {
    const V = VIEW[m] = viewOf(m), v = vids[m], c = cv[m];
    const st_ = v.style, l = `${((V.E.x0 - V.x0) * V.s).toFixed(1)}px`;
    if (st_.left !== l || st_.width !== `${(V.E.w * V.s).toFixed(1)}px`) Object.assign(st_, { left: l, top: `${((V.E.y0 - V.y0) * V.s).toFixed(1)}px`, width: `${(V.E.w * V.s).toFixed(1)}px`, height: `${(V.E.h * V.s).toFixed(1)}px` });
    const W = Math.round(V.w * D), Hh = Math.round(V.h * D);
    if (c.el.width !== W || c.el.height !== Hh) { c.el.width = W; c.el.height = Hh; }
    V.D = D;
  }
  dirty = true;
}

// ---------------------------------------------------------------- the AR layer
function project(K, X) { return [K.cx + K.f * X[0] / X[2], K.cy + K.f * X[1] / X[2]]; }
// one cube (camera pose q, t; metres) in the classic colours: its faces towards the camera, translucent, white edges
function drawCube(ctx, K, q, t, alpha, { scale = 1, edge = 200, lw = 1 } = {}) {
  if (alpha <= 0.004) return;
  const R = qmat(q), h = HALF * scale, uv = BOX.map(b => project(K, [
    R[0] * b[0] * h + R[1] * b[1] * h + R[2] * b[2] * h + t[0], R[3] * b[0] * h + R[4] * b[1] * h + R[5] * b[2] * h + t[1], R[6] * b[0] * h + R[7] * b[1] * h + R[8] * b[2] * h + t[2]]));
  const cam = [0, 1, 2].map(i => -(R[i] * t[0] + R[3 + i] * t[1] + R[6 + i] * t[2]));      // the camera in the cube's frame
  const vis = Object.keys(FN).filter(f => FN[f][0] * (cam[0] - FN[f][0] * h) + FN[f][1] * (cam[1] - FN[f][1] * h) + FN[f][2] * (cam[2] - FN[f][2] * h) > 0);
  const path = f => { const p = new Path2D(), ix = FACES[f]; p.moveTo(...uv[ix[0]]); for (let i = 1; i < 4; i++) p.lineTo(...uv[ix[i]]); p.closePath(); return p; };
  const ps = vis.map(path);
  vis.forEach((f, i) => { ctx.fillStyle = `rgba(${COL[f]},${alpha})`; ctx.fill(ps[i]); });
  ctx.strokeStyle = `rgba(255,255,255,${edge / 255 * Math.min(1, alpha / AR_ALPHA)})`; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  ps.forEach(p => ctx.stroke(p));
}
const poseAt = (r, k) => { k = clamp(k, 0, r.n - 1); return [qnorm([r.cq[k * 4], r.cq[k * 4 + 1], r.cq[k * 4 + 2], r.cq[k * 4 + 3]]), [r.cp[k * 3], r.cp[k * 3 + 1], r.cp[k * 3 + 2]]]; };
// on-screen seconds since run time ue (the effects keep their on-screen timing at every speed, as in the video)
const since = ue => (st.u - ue) / st.speed;
function goalNow(r) {
  let i = 0; while (i + 1 < r.goals.length && r.goals[i + 1].u <= st.u) i++;
  if (i === 0) return { q: r.goals[0].q, pulse: 1, active: false };
  const d = since(r.goals[i].u) - FLIGHT;                 // the turn starts when the copy arrives
  if (d < 0) return { q: r.goals[i - 1].q, pulse: 1, active: true };
  const x = Math.min(1, d / TURN), e = 1 - (1 - x) ** 3;
  return { q: slerp(r.goals[i - 1].q, r.goals[i].q, e), pulse: d < POP ? 1 + 0.06 * Math.sin(Math.PI * d / POP) : 1, active: d < POP };
}
// what is drawn on a run at web frame k (the picture) and the clock: the tracked cube (gone once it has left the hand),
// the goal, and the copies flying to it
function arItems(m, k) {
  const r = RUN[m], out = { cube: null, goal: null, flights: [], busy: false };
  if (!r.drop || k < r.drop.k + 3) { const [q, t] = poseAt(r, k); out.cube = { q, t, alpha: AR_ALPHA }; }
  const g = goalNow(r);
  out.goal = { q: g.q, t: r.anchor, alpha: GOAL_ALPHA, scale: g.pulse }; out.busy = g.active;
  for (let i = 1; i < r.goals.length; i++) {
    const u = since(r.goals[i].u) / FLIGHT; if (u < 0 || u >= 1) continue;
    out.busy = true;
    const e = smoother(u), [q0, t0] = poseAt(r, r.goals[i].k), arc = Math.sin(Math.PI * e);
    out.flights.push({ q: slerp(q0, r.goals[i - 1].q, e), t: [0, 1, 2].map(j => t0[j] * (1 - e) + r.anchor[j] * e + (j === 1 ? -0.03 * arc : 0)),
      alpha: 0.45 * (1 - smooth((u - 0.7) / 0.3)), scale: 1 - 0.12 * arc, edge: 120 });
  }
  return out;
}
function draw(m) {
  const r = RUN[m], V = VIEW[m], c = cv[m], ctx = c.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.el.width, c.el.height);
  if (st.view === 'trials') return false;
  const k = shownK[m], it = arItems(m, k);
  if (AR) {                                       // the video's 3D cube, through the filmed camera
    if (it.cube) AR.draw(ctx, m, V, [it.cube], occPath(m, k));
    AR.draw(ctx, m, V, [it.goal, ...it.flights], null);
    return it.busy;
  }
  if (!arFailed) return false;                    // still loading: nothing yet (the layer fades in once it is ready)
  // no WebGL: the same cubes as flat faces
  const sc = V.D * V.s, lw = 1.3 / V.s;
  ctx.setTransform(sc, 0, 0, sc, -V.x0 * sc, -V.y0 * sc);
  if (it.cube) { const clip = occPath(m, k); ctx.save(); if (clip) ctx.clip(clip, 'evenodd'); drawCube(ctx, r.K, it.cube.q, it.cube.t, AR_ALPHA, { lw }); ctx.restore(); }
  for (const x of [it.goal, ...it.flights]) drawCube(ctx, r.K, x.q, x.t, x.alpha, { scale: x.scale, edge: x.edge ?? 200, lw });
  return it.busy;
}
// the 3D replay's state of a run at the clock: joints and cube between data frames (smooth at any frame rate)
function replayState(m) {
  const r = RUN[m], f = clamp(st.u * FPS, 0, r.n - 1), k0 = Math.floor(f), k1 = Math.min(k0 + 1, r.n - 1), a = f - k0;
  const q = new Array(16); for (let j = 0; j < 16; j++) q[j] = r.q[k0 * 16 + j] * (1 - a) + r.q[k1 * 16 + j] * a;
  const it = arItems(m, k0);
  let cube = null;
  if (!r.drop || k0 < r.drop.land) { const [q0, t0] = poseAt(r, k0), [q1, t1] = poseAt(r, k1); cube = { q: slerp(q0, q1, a), t: t0.map((v, i) => v + (t1[i] - v) * a) }; }
  return { q, cube, goal: it.goal, flights: it.flights, busy: it.busy, k: k0 };
}

// ---------------------------------------------------------------- the cards' glass
function placeLabels(m) {
  const r = RUN[m], V = VIEW[m], o = ov[m], f = r.K.f, a = r.anchor;
  // clear of every corner the goal can turn to (its circumscribed radius, with the 6 % pop), not just of a face
  const [gx, gy] = project(r.K, a), half = HALF * Math.sqrt(3) * 1.06 * f / a[2];
  const x = (gx - V.x0) * V.s, y = (gy - V.y0) * V.s, hp = half * V.s, el = o.goal;
  const key = `${x.toFixed(1)}|${y.toFixed(1)}|${V.f}`;
  if (o.goalKey !== key) {
    o.goalKey = key;
    const w = el.offsetWidth, h = el.offsetHeight;
    // wide cards: above the goal (as in the video); phones: beside it, away from the method's name
    if (V.f === 'wide') { el.style.left = `${x - w / 2}px`; el.style.top = `${y - hp - 6 - h}px`; }
    else { el.style.left = `${m === 'js' ? x + hp + 3 : x - hp - 3 - w}px`; el.style.top = `${y - h / 2}px`; }
  }
  el.classList.toggle('on', st.view === 'filmed' && (!!AR || arFailed));    // with its cube
}
function setEnd(m, html) {
  const c = ov[m].count;
  if (html && c.endHTML !== html) { c.endHTML = html; c.end.innerHTML = html; }
  c.el.classList.toggle('ended', !!html);
}
function setCount(m, n, roll) {
  const c = ov[m].count; if (c.n === n) return;
  const old = c.n; c.n = n;
  c.w.textContent = n === 1 ? 'success' : 'successes';
  c.anim?.cancel();
  if (!roll || reduced || old == null || n !== old + 1) { c.r.innerHTML = `<span>${n}</span>`; return; }
  // the video's odometer: the old number rolls up and out, the new one in from below
  c.r.innerHTML = `<span>${old}</span><span>${n}</span>`;
  c.anim = c.r.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1.2em)' }], { duration: ROLL * 1000, easing: 'cubic-bezier(.45, 0, .2, 1)' });
  c.anim.onfinish = () => { c.anim = null; c.r.innerHTML = `<span>${n}</span>`; };
}
function updateOverlays() {
  for (const m of SIDES) {
    const r = RUN[m], o = ov[m];
    placeLabels(m);
    setCount(m, r.succ.filter(u => u <= st.u).length, st.playing && !st.dragging);
    const ended = st.u >= r.end - 1e-3, chip = o.chip;
    const sp = ended ? 'ended' : `${st.speed}x`; if (chip.sp.textContent !== sp) chip.sp.textContent = sp;
    const tm = mmss(Math.min(st.u, r.end)); if (chip.tm.textContent !== tm) chip.tm.textContent = tm;
    // how the run ends, as it happens: the drop, or getting stuck after its last success (a second line in the
    // counter's glass, its corner over the table, never over the hand)
    const ev = r.drop ? { u: r.drop.u, html: t => `<i></i><span class="l">Dropped the cube at ${t}</span><span class="s">Dropped at ${t}</span>` }
      : r.stuckAt != null ? { u: r.stuckAt, html: () => '<i class="stuck"></i><span>Stuck</span>' } : null;
    if (st.view !== 'trials') setEnd(m, ev && since(ev.u) > -0.05 ? ev.html(mmss(ev.u)) : null);
  }
}

// ---------------------------------------------------------------- footage
function seekTo(v, t) {
  if (v._seeking) { v._pending = t; return; }
  v._seeking = true; v._pending = null;
  try { v.currentTime = t; } catch (e) { v._seeking = false; }
}
function setupVideo(m, v) {
  v.addEventListener('seeked', () => {
    v._seeking = false; if (v._pending != null) { const t = v._pending; v._pending = null; seekTo(v, t); }
    if (!v.requestVideoFrameCallback) { shownK[m] = Math.round(v.currentTime * FPS); dirty = true; }
  });
  v.addEventListener('loadedmetadata', () => { v._seeking = false; v._pending = null; });
  // the frame on screen (the AR layer follows the picture, frame for frame)
  if (v.requestVideoFrameCallback) {
    const cb = (now, md) => { const k = Math.round(md.mediaTime * FPS); if (k !== shownK[m]) { shownK[m] = k; dirty = true; } v.requestVideoFrameCallback(cb); };
    v.requestVideoFrameCallback(cb);
  }
}
function loadVideos() {
  const f = narrow() ? 'sq' : 'wide';
  for (const m of SIDES) {
    const v = vids[m], base = `assets/footage/dex_${m}_${f}`;
    v.poster = `${base}.jpg`;
    v.preload = st.visible ? 'auto' : 'metadata';
    if (!v.src.endsWith(`${base}.mp4`)) { v.src = `${base}.mp4`; v._seeking = false; v._pending = null; }
  }
}
const runningSide = m => st.playing && !st.dragging && st.visible && st.u < RUN[m].end;
// the clock's speed: the chosen speed to the end (each run holds its last frame there, as in section 1)
const rate = () => st.speed;
function ready() { return SIDES.every(m => runningSide(m) ? vids[m].readyState >= 3 && !vids[m]._seeking : true); }
function syncVideos() {
  for (const m of SIDES) {
    const v = vids[m]; if (v.readyState < 1) continue;
    const ct = Math.min(st.u, RUN[m].end);
    if (runningSide(m)) {
      if (v.paused && !v._seeking) v.play().catch(() => {});
      const drift = ct - v.currentTime;
      if (Math.abs(drift) > 0.25 + 0.1 * st.speed) seekTo(v, ct);
      else { const pr = clamp(rate() * (1 + clamp(drift * 1.6, -0.3, 0.3)), 0.0625, 8); if (Math.abs(v.playbackRate - pr) > 0.02) v.playbackRate = pr; }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - ct) > 0.02) seekTo(v, ct);
    }
  }
}

// ---------------------------------------------------------------- transport
const tr = {};
function buildMarks() {
  tr.marks.innerHTML = '';
  if (st.view === 'trials') { trialMarks(); return; }
  for (const m of SIDES) for (const u of RUN[m].succ) {
    const e = document.createElement('span'); e.className = `tk ${m}`; e.style.left = `${u / L * 100}%`; tr.marks.appendChild(e);
  }
  const d = RUN.js.drop;
  if (d) { const e = document.createElement('span'); e.className = 'mk bad'; e.style.left = `${d.u / L * 100}%`; e.title = 'Joint\u2011Space drops the cube'; tr.marks.appendChild(e); }
  const sk = RUN.ours.stuckAt;
  if (sk != null) { const e = document.createElement('span'); e.className = 'mk stuck'; e.style.left = `${sk / L * 100}%`; e.title = 'EigenDEXplore gets stuck: no further success'; tr.marks.appendChild(e); }
}
// More trials: each clip's successes, its sped-up stretches (2x for the best trials, the 8x idle tail) and where it
// ends, on the clip's own timeline (its plan: clip frame -> trial frame), against the longer clip's length
function trialMarks() {
  const D = SIDES.map(m => TRIALS?.[trialName(m)]); if (D.some(d => !d)) return;
  const T = Math.max(...D.map(d => d.n / d.fps)), at = x => `${clamp(x / T, 0, 1) * 100}%`;
  const mk = (cls, left, title, width) => { const e = document.createElement('span'); e.className = cls; e.style.left = left; if (width) e.style.width = width; if (title) e.title = title; tr.marks.appendChild(e); };
  const fast = [];
  D.forEach((d, i) => d.segments.forEach(g => { if (g.step > 1 && g.n) fast.push([g.i0 / d.fps, (g.i0 + g.n) / d.fps, NAME[SIDES[i]], g.step]); }));
  fast.sort((a, b) => a[0] - b[0]);
  for (const [a, b, who, x] of fast) mk('fast', at(a), `${who} at ${x}x`, `${(b - a) / T * 100}%`);
  D.forEach((d, i) => {
    const m = SIDES[i], g = d.segments[0], clipT = t => (t * d.fps - g.k0) / g.step / d.fps;
    for (const t of d.goal_times) mk(`tk ${m}`, at(clipT(t)));
    const end = d.segments[d.segments.length - 1];
    mk('mk stuck', at(end.i0 / d.fps), `${NAME[m]}: no success for 80 s, the trial ends`);
  });
}
function setTransport(p, clock, total, playing, ended) {
  tr.fill.style.width = `${p * 100}%`; tr.knob.style.left = `${p * 100}%`;
  tr.scrub.setAttribute('aria-valuenow', Math.round(p * 100));
  const c = `${clock}<span class="tot"> / ${total}</span>`;
  if (tr.clockHTML !== c) { tr.clockHTML = c; tr.clock.innerHTML = c; }
  tr.play.classList.toggle('playing', playing); tr.play.classList.toggle('ended', !playing && ended);
  tr.play.setAttribute('aria-label', playing ? 'Pause' : ended ? 'Replay' : 'Play');
}
function updateTransport() {
  if (st.view === 'trials') {
    const T = TC.dur() || 1;
    setTransport(clamp(TC.st.t / T, 0, 1), msc(TC.st.t), msc(T), TC.st.playing, TC.st.ended); return;
  }
  setTransport(clamp(st.u / L, 0, 1), msc(st.u), msc(L), st.playing, st.ended);
}
function scrubTo(x) {
  const r = tr.rail.getBoundingClientRect(), p = clamp((x - r.left) / r.width, 0, 1);
  if (st.view === 'trials') { TC.seek(p * TC.dur()); return; }
  st.u = p * L; st.ended = false; dirty = true;
}
function setSpeed(v) {
  st.speed = v;
  document.querySelectorAll('#dSpeed button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.speed === v));
}

// ---------------------------------------------------------------- views
// switching views: each card keeps a still of what it showed (the footage and its cube layer, or the trial clip) until
// the new view's picture is there, then lets it go in .3 s: never a blank card, never a cut
function snapOf(m) { return cardEl[m].querySelector('canvas.d-snap') || cardEl[m].insertBefore(Object.assign(document.createElement('canvas'), { className: 'd-snap' }), ov[m]); }
function takeSnap(from) {
  for (const m of SIDES) {
    const c = snapOf(m), card = cardEl[m], D = Math.min(devicePixelRatio || 1, 2), w = card.clientWidth, h = card.clientHeight, v = from === 'trials' ? tvids[m] : vids[m];
    c.width = Math.round(w * D); c.height = Math.round(h * D);
    const g = c.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0);
    let ok = false;
    if (v.readyState >= 2 && v.style.opacity !== '0') {
      const r = v.getBoundingClientRect(), cr = card.getBoundingClientRect();
      try { g.drawImage(v, r.left - cr.left, r.top - cr.top, r.width, r.height); ok = true; } catch (e) { /* no frame */ }
      if (ok && from === 'filmed') g.drawImage(cv[m].el, 0, 0, w, h);
    }
    c._fading = false; Object.assign(c.style, { transition: 'none', opacity: ok ? 1 : 0 });
    void getComputedStyle(c).opacity;           // committed now, so the fade below starts from it
  }
}
function releaseSnap(ready) {
  const t0 = performance.now();
  const step = () => {
    let wait = 0;
    for (const m of SIDES) {
      const c = cardEl[m].querySelector('canvas.d-snap'); if (!c || c._fading || c.style.opacity === '0') continue;
      if (ready(m) || performance.now() - t0 > 1500) { c._fading = true; c.style.transition = 'opacity .3s ease'; c.style.opacity = 0; } else wait++;
    }
    if (wait) requestAnimationFrame(step);
  };
  requestAnimationFrame(() => requestAnimationFrame(step));     // the still is on screen for at least a frame first
}
const clipReady = m => tvids[m].readyState >= 2 && tvids[m].style.opacity !== '0';
async function setView(view) {
  const prev = st.view; if (view === prev) return;
  if (prev === 'trials' || (prev === 'filmed' && view === 'trials')) takeSnap(prev);      // (3D dissolves on its own)
  st.view = view;
  document.querySelectorAll('#dView button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
  $('#dCards').classList.toggle('trials', view === 'trials');
  $('#dTrial').hidden = view !== 'trials';
  if (prev === 'trials') TC.stop();
  if (view === 'trials') { st.playing = false; SIDES.forEach(m => vids[m].pause()); loadTrials(true); }
  noteFor(); markScore(); buildMarks(); updateTransport(); dirty = true;
  if (view === 'trials') releaseSnap(clipReady);
  else if (view === 'filmed' && prev === 'trials') releaseSnap(m => vids[m].readyState >= 2);
  if (prev === '3d') leave3d(view === 'trials');
  if (view === '3d') { if (prev === 'trials') releaseSnap(() => $('#dCards').classList.contains('shown')); await enter3d(); }
}
// the 3D replay is made ready in a quiet moment once the section has started (its files fetched, its scene built and
// its programs compiled while hidden), so the button opens it at once
function buildReplay() {
  if (replayLoading) return replayLoading;
  replayLoading = import('./dex3d.js').then(m => m.createReplay($('#dReplay'), $('#dCards'), { mobile: phone() }));
  replayLoading.then(async r => { await breathe(); const hidden = () => st.view !== '3d' && !leaving3d; if (hidden()) await r.warm(states(), VIEW, hidden); })
    .catch(e => console.error('3D replay', e));
  return replayLoading;
}
async function enter3d() {
  const cards = $('#dCards');
  leaving3d = false;
  cards.classList.add('three');
  if (!replay) {
    cards.classList.add('r3d-loading');
    try { replay = await buildReplay(); }
    catch (e) { console.error('3D replay', e); cards.classList.remove('r3d-loading', 'three'); return; }
    replay.onChange(orbited => { $('#dReset').classList.toggle('on', orbited); });     // fades in / out
    demo3d = orbitDemo({ key: 'eg-orbit-demo-s4' });
    $('#dReplay').addEventListener('pointerdown', () => { const y = demo3d.stop(performance.now(), true); if (y) replay.absorb(y); }, true);
  }
  cards.classList.remove('r3d-loading');
  if (st.view !== '3d') return;
  render3d(true);
  requestAnimationFrame(() => { if (st.view === '3d') cards.classList.add('shown'); });     // dissolve in, pixel aligned
  demoAt = performance.now() + 900;
}
function leave3d(now) {
  demoAt = 0; demo3d?.stop(performance.now(), false);
  if (!replay) { $('#dCards').classList.remove('three', 'r3d-loading'); return; }
  replay.reset();
  if (now) {                                        // to More trials: the 3D stays until the clips have their first frames
    leaving3d = false; const t0 = performance.now();
    const go = () => { if (st.view === '3d') return; if (SIDES.every(clipReady) || performance.now() - t0 > 1500) finishLeave3d(); else requestAnimationFrame(go); };
    requestAnimationFrame(go); return;
  }
  leaving3d = true;                                 // back to the filmed camera first (tick), then dissolve out
}
function finishLeave3d() {
  leaving3d = false;
  const cards = $('#dCards');
  cards.classList.remove('shown');
  setTimeout(() => { if (st.view !== '3d') cards.classList.remove('three'); }, 650);
}
// the replay canvas spans both cards: clipped to their rounded shapes
let clipKey = '';
function clipCanvas() {
  const c = $('#dReplay'), cr = c.getBoundingClientRect();
  const parts = SIDES.map(m => {
    const r = cardEl[m].getBoundingClientRect(), rad = parseFloat(getComputedStyle(cardEl[m]).borderTopLeftRadius) || 0;
    const x = r.left - cr.left, y = r.top - cr.top, w = r.width, h = r.height, k = Math.min(rad, w / 2, h / 2);
    return `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`;
  }).join('');
  if (parts !== clipKey) { clipKey = parts; c.style.clipPath = `path('${parts}')`; }
}
const states = () => Object.fromEntries(SIDES.map(m => [m, replayState(m)]));
let busy3d = false;
function render3d(force) {
  clipCanvas();
  if (!replay) return;
  const S = states();
  busy3d = S.js.busy || S.ours.busy;
  const key = `${st.u.toFixed(4)}|${st.speed}`, shadow = busy3d ? key : `${S.js.k}|${S.ours.k}`;
  if (force) replay.invalidate();
  replay.render(S, VIEW, key, shadow);
}
const NOTE = {
  filmed: "Two runs filmed in a separate session. The goal and the successes come from the robot's log.",
  '3d': "The same two runs in the video's 3D scene of the lab, the hand by its logged joints and the cube by its tracked pose.",
  trials: k => `The robot's own camera in the paper's evaluation: the ${RANK[k]} of the 40 trials per method${k === 'best' ? ', at 2x' : ''}. After the last success it runs at 8x to the trial's end.`,
};
function fitNote() {
  const n = $('#dNote'), c = n.cloneNode(false);
  Object.assign(c.style, { position: 'absolute', visibility: 'hidden', minHeight: '0', width: `${n.clientWidth}px`, left: '-9999px' });
  n.parentNode.appendChild(c);
  let h = 0; for (const t of [NOTE.filmed, NOTE['3d'], ...Object.keys(RANK).map(NOTE.trials)]) { c.textContent = t; h = Math.max(h, c.offsetHeight); }
  c.remove(); n.style.minHeight = `${h}px`;
}
function noteFor() {
  $('#dNote').textContent = st.view === 'trials' ? NOTE.trials(trialK) : NOTE[st.view];
}
// ---------------------------------------------------------------- more trials
// The reviewer site's clips of the picked trials (the same cut, timing and cube overlay: tools/render_dex_trials_web.py
// renders them without their text), cropped to the card around the hand. The counter, the speed (2x for the best
// trials, 8x once no success is left), the notes and the goal are the page's own glass, from each clip's timeline.
const TRIAL_DIR = 'assets/s4/trials/';
let TRIALS = null, trialsLoading = null;
const trialName = m => `dextreme_${m === 'js' ? 'jabs' : 'eignoise'}_${trialK}`;
function loadTrialData() { return trialsLoading ??= fetch(`${TRIAL_DIR}trials.json`).then(r => { if (!r.ok) throw r.status; return r.json(); }).then(d => { TRIALS = d; }).catch(e => { console.warn('trials', e); TRIALS = {}; }); }
// the clip frame on screen -> the trial's own frame (its plan: from the start, then the idle stretch, then the hold)
function trialState(m) {
  const d = TRIALS?.[trialName(m)], v = tvids[m]; if (!d) return null;
  const i = clamp(Math.round((v.currentTime || 0) * d.fps), 0, d.n - 1);
  const g = d.segments.find(x => i < x.i0 + x.n) || d.segments[d.segments.length - 1];
  const t = (g.k0 + (i - g.i0) * g.step) / d.fps, hold = g.step === 0, idle = g === d.segments[1] && g.n > 0;
  let goal = d.goals[0]; for (const x of d.goals) if (x.t <= t + 1e-6) goal = x;
  return { d, t, step: g.step, hold, idle, n: d.goal_times.filter(x => x <= t + 1e-6).length, goal };
}
// the goal cube as the reviewer clips' inset shows it: seen from the camera, its six colours, lit from the camera
function drawMini(c, q, pal) {
  const ctx = c.getContext('2d'), W = c.width, f = W * 3.2, z = 0.065 * 3.2 / 0.45, h = 0.0325, R = qmat(q);
  ctx.clearRect(0, 0, W, W);
  const P = BOX.map(b => { const x = R[0] * b[0] * h + R[1] * b[1] * h + R[2] * b[2] * h, y = R[3] * b[0] * h + R[4] * b[1] * h + R[5] * b[2] * h, zz = R[6] * b[0] * h + R[7] * b[1] * h + R[8] * b[2] * h + z; return [W / 2 + f * x / zz, W / 2 + f * y / zz]; });
  const AX = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
  AX.forEach((ax, i) => {
    const n = FN[ax], nc = [R[0] * n[0] + R[1] * n[1] + R[2] * n[2], R[3] * n[0] + R[4] * n[1] + R[5] * n[2], R[6] * n[0] + R[7] * n[1] + R[8] * n[2]];
    const cen = [nc[0] * h, nc[1] * h, nc[2] * h + z];
    if (nc[0] * cen[0] + nc[1] * cen[1] + nc[2] * cen[2] >= 0) return;          // facing away
    const k = 0.42 + 0.58 * Math.max(0, -(nc[0] * cen[0] + nc[1] * cen[1] + nc[2] * cen[2]) / Math.hypot(...cen));
    const [r, gg, b] = pal[i];
    ctx.beginPath(); const ix = FACES[ax]; ctx.moveTo(...P[ix[0]]); for (let j = 1; j < 4; j++) ctx.lineTo(...P[ix[j]]); ctx.closePath();
    ctx.fillStyle = `rgb(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(b * k)})`; ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,.55)'; ctx.lineWidth = W / 64; ctx.lineJoin = 'round'; ctx.stroke();
  });
}
// the clip covers the card, centred on the hand (the camera looks down on it: a little left of and below the middle)
function placeTrial(m) {
  const v = tvids[m], c = cardEl[m]; if (!v.videoWidth) return;
  const W = v.videoWidth, H = v.videoHeight, cw = c.clientWidth, ch = c.clientHeight, s = Math.max(cw / W, ch / H);
  const x0 = clamp(0.48 * W * s - cw / 2, 0, W * s - cw), y0 = clamp(0.52 * H * s - ch / 2, 0, H * s - ch);
  const k = `${cw}|${ch}|${W}`; if (v._place === k) return; v._place = k;
  const box = { left: `${(-x0).toFixed(1)}px`, top: `${(-y0).toFixed(1)}px`, width: `${(W * s).toFixed(1)}px`, height: `${(H * s).toFixed(1)}px` };
  Object.assign(v.style, box);
  const hold = c.querySelector('canvas.tv-hold'); if (hold) Object.assign(hold.style, box);
}
function updateTrials() {
  for (const m of SIDES) {
    placeTrial(m);
    const S = trialState(m), o = ov[m]; if (!S) continue;
    setCount(m, S.n, TC.st.playing);
    const chip = o.chip, sp = S.hold ? 'end' : `${S.step * st.speed}x`;
    if (chip.sp.textContent !== sp) chip.sp.textContent = sp;
    const tm = mmss(S.t); if (chip.tm.textContent !== tm) chip.tm.textContent = tm;
    chip.el.classList.toggle('fast', !S.hold && S.step > 1);
    // the idle stretch after the last success, and how the trial ended (all the picked trials end on the 80 s timeout)
    const idle = Math.floor(S.t - S.d.last_goal), cap = S.d.timeout ? ' / 80 s' : '';
    setEnd(m, S.hold ? `<i class="stuck"></i><span class="l">Trial over: no success for ${S.d.timeout ? '80' : idle} s</span><span class="s">No success, ${S.d.timeout ? '80' : idle} s</span>`
      : S.idle ? `<i class="stuck"></i><span class="l">No success for ${idle} s${cap}</span><span class="s">No success ${idle} s · ${S.step * st.speed}x</span>` : null);
    if (o.tgoalQ !== S.goal) { o.tgoalQ = S.goal; drawMini(o.tgoal, S.goal.q, S.d.palette); }
  }
}
// switching clips: the frame on screen is held until the next clip has its first frame (no empty card)
function holdFrame(m) {
  const v = tvids[m], c = cardEl[m].querySelector('canvas.tv-hold') || v.parentNode.insertBefore(Object.assign(document.createElement('canvas'), { className: 'tv-hold' }), v.nextSibling);
  if (v.readyState >= 2 && v.videoWidth && st.view === 'trials') {
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    Object.assign(c.style, { transition: 'none', opacity: 1, left: v.style.left, top: v.style.top, width: v.style.width, height: v.style.height });
  } else c.style.opacity = 0;
  v.style.opacity = 0;
  const show = () => { v.removeEventListener('loadeddata', show); v._place = ''; placeTrial(m); v.style.opacity = 1; requestAnimationFrame(() => { c.style.transition = 'opacity .28s ease'; c.style.opacity = 0; }); };
  v.addEventListener('loadeddata', show);
}
async function loadTrials(play) {
  await loadTrialData();
  for (const m of SIDES) {
    const v = tvids[m], url = new URL(`${TRIAL_DIR}${trialName(m)}.mp4`, location.href).href;
    if (v.src !== url) { holdFrame(m); v.preload = 'auto'; v.src = url; ov[m].tgoalQ = null; }
  }
  document.querySelectorAll('#dTrial button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === trialK));
  markScore(); noteFor(); buildMarks();
  TC.restart(play && st.view === 'trials');
}

// ---------------------------------------------------------------- the paper's 40 trials per method
function buildScore() {
  const box = $('#dScore'), top = Math.max(SCORES.js.max, SCORES.ours.max);
  const gain = Math.round((SCORES.ours.mean / SCORES.js.mean - 1) * 100);
  box.innerHTML = SIDES.map(m => `<div class="sc" data-side="${m}"><div class="sc-head"><span class="lbl">${NAME[m]}</span>`
    + `<span class="num ${m}-c">${SCORES[m].mean.toFixed(2)}${m === 'ours' ? `<small>+${gain}%</small>` : ''}</span></div><div class="trk"><i class="mean ${m}-bg"></i></div></div>`).join('')
    + `<p class="fine score-note">Successes in each of 40 evaluation trials per method, sorted, with the mean dashed.</p>`;
  for (const m of SIDES) {
    const trk = box.querySelector(`.sc[data-side="${m}"] .trk`), d = SCORES[m];
    const pickOf = {}; for (const [k, p] of Object.entries(d.picks)) pickOf[p.ordinal] = k;
    for (const t of d.trials) {
      const k = pickOf[t.ordinal], b = document.createElement(k ? 'button' : 'span');
      b.className = `col${k ? ' pick' : ''}`; b.innerHTML = '<i></i>';
      b.firstChild.style.height = `${Math.max(t.score / top * 100, 1.5)}%`;
      const what = `${t.score} success${t.score === 1 ? '' : 'es'} (${Math.round(t.dur)} s, ${t.stop})`;
      if (k) { b.dataset.k = k; b.type = 'button'; b.title = `The ${RANK[k]} trial: ${what}. Play it`; b.setAttribute('aria-label', b.title); }
      else b.title = what;
      trk.appendChild(b);
    }
    trk.querySelector('.mean').style.bottom = `${d.mean / top * 100}%`;
    trk.addEventListener('click', e => { const b = e.target.closest('.col.pick'); if (!b) return; trialK = b.dataset.k; if (st.view === 'trials') loadTrials(true); else setView('trials'); });
  }
  markScore();
}
function markScore() { document.querySelectorAll('#dScore .col.pick').forEach(c => c.classList.toggle('on', st.view === 'trials' && c.dataset.k === trialK)); }

// ---------------------------------------------------------------- init
export async function init() {
  await load();
  for (const m of SIDES) {
    cardEl[m] = document.querySelector(`#dCards .card[data-side="${m}"]`);
    vids[m] = cardEl[m].querySelector('video.fv'); setupVideo(m, vids[m]);
    tvids[m] = cardEl[m].querySelector('video.tv');
    const o = ov[m] = cardEl[m].querySelector('.ov'), ch = o.querySelector('[data-chip]'), cnt = o.querySelector('[data-count]');
    o.chip = { el: ch, sp: ch.querySelector('.sp'), tm: ch.querySelector('.tm') };
    o.count = { el: cnt, r: cnt.querySelector('.r'), w: cnt.querySelector('.w'), end: cnt.querySelector('.end'), n: null };
    o.goal = o.querySelector('.d-goal');
    o.tgoal = o.querySelector('.d-tgoal canvas');
    const el = cardEl[m].querySelector('canvas.d-ar'); cv[m] = { el, ctx: el.getContext('2d') };
  }
  L = Math.max(...SIDES.map(m => RUN[m].end));
  Object.assign(tr, { scrub: $('#dScrub'), rail: $('#dScrub .rail'), fill: $('#dScrub .fill'), knob: $('#dScrub .knob'), marks: $('#dScrub .marks'), clock: $('#dClock'), play: $('#dPlay') });
  layout(); loadVideos(); buildMarks(); buildScore(); updateOverlays(); updateTransport(); fitNote();
  window.__s4 = { st, RUN, VIEW, setView, setSpeed, get L() { return L; }, shownK, get replay() { return replay; }, get AR() { return AR; }, set AR(v) { AR = v; dirty = true; } };

  $('#dView').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
  $('#dReset').addEventListener('click', () => replay?.reset());
  // the paper's Fig. 4 (all four methods in simulation), opened under the score as section 3 opens its Fig. 3: drawn while
  // still shut, measured in one task, then a gentle glide (the panel's spacing is inside it, so nothing snaps)
  const more = $('#dMore'), paper = $('#dPaper'), GLIDE = 'cubic-bezier(.45, 0, .2, 1)';
  let built = null, panim = null;
  more.addEventListener('click', async () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', open);
    const h0 = paper.hidden ? 0 : paper.getBoundingClientRect().height;
    panim?.cancel();
    if (open) {
      const m0 = paper.hidden ? 0 : parseFloat(getComputedStyle(paper).marginTop) || 0;
      paper.hidden = false; paper.style.height = `${h0}px`; paper.style.marginTop = `${m0}px`; paper.style.overflow = 'hidden';
      built ??= import('./fig3panel.js').then(m => m.initFig4(paper.querySelector('.t-paper-in')));
      await built;
      if (more.getAttribute('aria-expanded') !== 'true') return;
      paper.style.height = ''; const h1 = paper.scrollHeight; paper.style.height = `${h0}px`;
      panim = paper.animate([{ height: `${h0}px`, marginTop: `${m0}px`, opacity: 0.2 }, { height: `${h1}px`, marginTop: '14px', opacity: 1 }], { duration: reduced ? 0 : clamp(h1 * 1.1, 380, 620), easing: GLIDE });
      paper.style.height = ''; paper.style.marginTop = '14px';
      panim.onfinish = () => { panim = null; paper.style.overflow = ''; };
    } else {
      paper.style.overflow = 'hidden';
      panim = paper.animate([{ height: `${h0}px`, marginTop: '14px', opacity: 1 }, { height: '0px', marginTop: '0px', opacity: 0 }], { duration: reduced ? 0 : clamp(h0 * 1.0, 340, 560), easing: GLIDE });
      panim.onfinish = () => { panim = null; paper.hidden = true; paper.style.overflow = ''; paper.style.marginTop = '0px'; };
    }
  });
  if (!LITE) quiet(() => import('./fig3panel.js').then(m => m.loadFig4()), { after: 2500 });
  // the video's 3D cube for the cards, then (quietly, near the section) the 3D replay
  const arOn = () => { dirty = true; SIDES.forEach(m => cv[m].el.classList.add('on')); };
  quiet(() => import('./dex3d.js').then(m => m.createAR({ js: RUN.js.K, ours: RUN.ours.K })).then(async a => { await a.warm(); AR = a; arOn(); })
    .catch(e => { console.error('AR cube', e); arFailed = true; arOn(); }).then(() => LITE || quiet(buildReplay, { after: 1500 })), { after: 150 });
  $('#dSpeed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });
  $('#dTrial').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; trialK = b.dataset.k; loadTrials(true); });
  tr.play.addEventListener('click', () => {
    if (st.view === 'trials') { TC.toggle(); return; }
    if (st.playing) st.playing = false;
    else { if (st.ended || st.u >= L - 0.02) st.u = 0; st.ended = false; st.playing = true; }
  });
  let wasPlaying = false;
  tr.scrub.addEventListener('pointerdown', e => { tr.scrub.setPointerCapture(e.pointerId); st.dragging = true; wasPlaying = st.playing; scrubTo(e.clientX); });
  tr.scrub.addEventListener('pointermove', e => { if (st.dragging) scrubTo(e.clientX); });
  const endDrag = () => { if (!st.dragging) return; st.dragging = false; st.playing = wasPlaying && st.u < L; };
  tr.scrub.addEventListener('pointerup', endDrag); tr.scrub.addEventListener('pointercancel', endDrag);
  tr.scrub.addEventListener('keydown', e => {
    const d = { ArrowLeft: -2, ArrowRight: 2, ArrowDown: -2, ArrowUp: 2 }[e.key];
    if (st.view === 'trials') {
      if (d != null) { TC.seek(TC.st.t + d * 2); e.preventDefault(); }
      else if (e.key === ' ') { tr.play.click(); e.preventDefault(); }
      return;
    }
    if (d != null) { st.u = clamp(st.u + d, 0, L); dirty = true; e.preventDefault(); }
    else if (e.key === 'Home') { st.u = 0; dirty = true; e.preventDefault(); }
    else if (e.key === 'End') { st.u = L; dirty = true; e.preventDefault(); }
    else if (e.key === ' ') { tr.play.click(); e.preventDefault(); }
  });

  // visibility: the runs play once the first time the stage is in view
  let played = false;
  const cardsBox = $('#dCards');
  function checkVisible() {
    const vis = engaged(cardsBox, st.visible); if (vis === st.visible) return;
    st.visible = vis;
    if (vis) { loadVideos(); if (!played && !reduced && st.view === 'filmed') { played = true; st.playing = true; } }
    else SIDES.forEach(m => { vids[m].pause(); tvids[m].pause(); });          // the clocks hold while unseen (tick stops)
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { SIDES.forEach(m => { vids[m].pause(); tvids[m].pause(); }); st.visible = false; } });
  let wasNarrow = narrow(), rk = '';
  const relayout = () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); loadVideos(); } fitNote(); layout(); SIDES.forEach(m => { ov[m].goalKey = ''; }); replay?.invalidate(); };
  $('.s4').addEventListener('stagefit', relayout);
  new ResizeObserver(() => { const k = SIDES.map(m => `${cardEl[m].clientWidth}x${cardEl[m].clientHeight}`).join('|'); if (k !== rk) { rk = k; relayout(); } }).observe(cardsBox);

  let last = performance.now(), lastTick = 0, busy = false, lastDraw = 0, last3d = 0;
  const frame = now => { requestAnimationFrame(frame); tick(now); };
  const tick = now => {
    lastTick = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    checkVisible();
    if (!st.visible) return;
    if (st.view !== 'trials') {
      if (st.playing && !st.dragging && ready()) {
        st.u += dt * rate();
        if (st.u >= L) { st.u = L; st.playing = false; st.ended = true; }
      }
      syncVideos(); updateOverlays();
      // the AR layer: redrawn when the picture changes, the clock moves while something animates, or the layout changes
      if ((dirty || busy || st.dragging) && now - lastDraw > 12.5) { dirty = false; lastDraw = now; busy = SIDES.map(draw).some(Boolean); }
    } else { TC.st.dragging = st.dragging; TC.tick(dt, st.visible); updateTrials(); }
    if (replay && (st.view === '3d' || leaving3d) && now - last3d > 12.5) {
      last3d = now;
      if (demo3d) { if (demoAt && now >= demoAt && st.view === '3d') { demo3d.start(now); demoAt = 0; } replay.setPeek(demo3d.yaw(now)); }
      render3d();
      if (leaving3d && replay.settled()) finishLeave3d();
    }
    updateTransport();
  };
  requestAnimationFrame(frame);
  pump(() => lastTick, tick);
  glassify(document);
}
