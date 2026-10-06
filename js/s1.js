// Section 1: the overview video's opening, rebuilt as a live A/B player.
// Two cinematic takes per task play on one shared task clock u. By default the clock follows the opening's own time map
// (video/scripts/opening/opening.py master(): per-robot speed-ups with eased 0.3 s ramps, holds), so both runs reach
// their key moments together, and the opening's callouts appear as glass tags at their exact times. "Real time" plays
// both at 1x. Three views share the cards: the footage, the 3D replay (the video's own transition scenes, from the same
// fitted camera, dissolving in place) and more trials (the robot-camera recordings of the evaluation runs).
import { glassify, pump } from './glass.js';
import { animateDisclosure, phone, engaged } from './stage.js';
import { breathe, quiet } from './idle.js';
import { orbitDemo } from './orbitdemo.js';
import { pairClock } from './pairclock.js';

const $ = (s, r = document) => r.querySelector(s);
const SIDES = ['js', 'ours'];
const LINE = { hammer: 'Hammer the nails', wipe: 'Wipe the drawing off the board', brush: 'Sweep the crumbs into the pan', scoop: 'Scoop the food into the bowl' };
// from video/scripts/opening/common.py: timer zero (ref), drawing position (wipe), label spots (source px)
const REF = { hammer: { js: 2.65, ours: 657.05 }, brush: { js: 11.2, ours: 243.9 }, wipe: { js: 291.0, ours: 19.0 }, scoop: { js: 18.6, ours: 496.6 } };
const SMILEY = { js: [1461, 186, 43], ours: [1451, 194, 31] };
const MAG_OFF = [-370 / 0.87, 280 / 0.87];         // the opening's magnifier offset (card px at zoom 0.87) in source px
// the action's centre column per take (source px): the square crops' centres (tools/encode_footage.sh x0 + 540)
const CROPX = { hammer_js: 180, hammer_ours: 200, brush_js: 540, brush_ours: 460, wipe_js: 600, wipe_ours: 540, scoop_js: 310, scoop_ours: 280 };
const TOOL = { hammer: 'claw_hammer', wipe: 'handle_eraser', brush: 'red_brush', scoop: 'spoon_spatula' };
const NOUN = { hammer: 'hammering', wipe: 'wiping', brush: 'brushing', scoop: 'scooping' };
const RANK = { lq: 'lower quartile', median: 'median', uq: 'upper quartile', best: 'best' };
const POL = { js: 'joint_abs_s13', ours: 'eigendex_s202' };
const RAMP = 0.3, FAST = 1.5;                      // speed-ups are shown (chip, scrub bar) from 1.5x up, as the chip reads
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const S1 = p => { p = clamp(p, 0, 1); return p ** 3 - p ** 4 / 2; };
const edge = (x, c, r) => x <= c - r / 2 ? 0 : x >= c + r / 2 ? r / 2 + (x - (c + r / 2)) : r * S1((x - (c - r / 2)) / r);
const stp = (x, c, r) => { const p = clamp((x - (c - r / 2)) / r, 0, 1); return p * p * (3 - 2 * p); };
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const msc = s => { s = Math.max(0, Math.floor(s + 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const showSpeed = v => Math.max(1, Math.floor(v * 2 + 0.1) / 2);

let FOOT, PICKS, REACH, SCORES;
const OUTL = {};                                   // outline masks per id (assets/data/outlines, from video/masks)
const st = { task: 'hammer', mode: 'video', view: 'footage', u: 0, playing: false, dragging: false, visible: false, ended: false, k: null };
const vids = {}, tvids = {}, cardEl = {}, ov = {};
// More trials: both recordings on one clock (a clip that stalls holds the other)
const TC = pairClock(() => SIDES.map(s => tvids[s]));
let replay = null, replayLoading = null, leaving3d = false, demo3d = null, demoAt = 0, leaveT = 0;

function buildTask(task) {
  const tl = FOOT[task].timeline;
  const k = { task, start: tl.start, len: tl.length, speedups: [...tl.speedups].sort((a, b) => a.from - b.from), hold: tl.hold || {},
    dims: tl.dims || [], outlines: tl.outlines || [], labels: tl.labels || [], magnifier: !!tl.magnifier, magFrom: tl.magnifier_from || {}, clip: {} };
  for (const s of SIDES) { const f = FOOT[`${task}_${s}`]; const last = f.source_start + f.duration - 0.04; k.clip[s] = { src: f.source_start, dur: f.duration, end: Math.min(k.hold[s] ?? 1e9, last), last }; }
  k.u0 = Math.max(0, ...SIDES.map(s => k.clip[s].src - REF[task][s]));      // real time starts where both have footage
  // each mode's timeline lasts until both runs have ended (the synced one continues past the video's cut at 1x)
  k.L = {};
  for (const mode of ['video', 'real']) k.L[mode] = Math.max(...SIDES.map(s => uOf(k, s, (mode === 'video' ? k.clip[s].end : k.clip[s].last) - 1e-3, mode, 400))) + 0.25;
  return k;
}
function master(k, side, u, mode = st.mode) {
  let m, sp = 1;
  if (mode === 'video') {
    u = Math.max(0, u); m = k.start[side] + u;
    for (const w of k.speedups) {
      const v = w[side] ?? 1, a = w.from, b = w.to, r = Math.min(RAMP, Math.max(b - a, 1e-3));
      m += (v - 1) * (edge(u, a, r) - edge(u, b, r));
      sp += (v - 1) * (stp(u, a, r) - stp(u, b, r));
    }
  } else { m = REF[k.task][side] + k.u0 + Math.max(0, u); }
  const end = mode === 'video' ? k.clip[side].end : k.clip[side].last;
  if (m >= end) return [end, 0];
  return [m, sp];
}
const lengthOf = (k, mode = st.mode) => k.L[mode];
// the timeline ends once both runs have ended and the last outcome has fully appeared
const fullLength = () => Math.max(lengthOf(st.k), ...EV.map(e => e.u + 0.7));
const clockOf = u => st.mode === 'video' ? u : st.k.u0 + u;          // real time: the clock reads what both chips read
function uOf(k, side, mt, mode = st.mode, hi = lengthOf(k, mode)) {
  let lo = 0;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (master(k, side, mid, mode)[0] < mt) lo = mid; else hi = mid; }
  return hi;
}
function events(k) {
  const ev = [];
  for (const o of k.outlines) {
    if (!o.label) continue;
    ev.push({ side: o.side, label: o.label, kind: o.bad ? 'bad' : 'good', u: uOf(k, o.appear_side || o.side, o.appear_t ?? o.t), mask: o.mask, place: o.place });
  }
  for (const lb of k.labels) ev.push({ side: lb.side, label: lb.label, kind: lb.good ? 'good' : lb.bad ? 'bad' : 'good', u: uOf(k, lb.side, lb.t), mag: lb.at === 'magnifier' });
  return ev.sort((a, b) => a.u - b.u);
}
function dimWindows(k) {
  if (st.mode !== 'video') return [];
  return k.dims.map(d => ({ side: d.side, from: d.u_from ?? (d.from != null ? uOf(k, d.watch, d.from) : 0), to: d.u_to ?? 99 }));
}

// ---------------------------------------------------------------- geometry: source px (1920x1080 Sony frame) -> card px
// Desktop plays the full frame, phones a 1080-wide square crop at CROPX; either way the frame covers the card, centred
// on the take's action column. The video element, the callouts, the magnifier and the 3D camera all use this one map.
function cardMap(side) {
  const el = cardEl[side], w = el.clientWidth, h = el.clientHeight;
  const sq = useSquare(), x0 = sq ? CROPX[`${st.task}_${side}`] : 0, sw = sq ? 1080 : 1920;
  const s = Math.max(w / sw, h / 1080);
  const cx = CROPX[`${st.task}_${side}`] + 540 - x0;
  const ox = clamp(w / 2 - cx * s, w - sw * s, 0), oy = (h - 1080 * s) * 0.4;
  return { w, h, s, ox, oy, x0, f: (sx, sy) => [ox + (sx - x0) * s, oy + sy * s], inv: (px, py) => [(px - ox) / s + x0, (py - oy) / s] };
}
const useSquare = () => phone();
function placeVideo(side) {
  const m = cardMap(side), v = vids[side];
  const p = `${m.ox.toFixed(1)}px ${m.oy.toFixed(1)}px`;
  if (v.style.objectPosition !== p) v.style.objectPosition = p;
}

// ---------------------------------------------------------------- DOM per task
let EV = [], DIMS = [], L = 1;
function buildOverlays() {
  for (const s of SIDES) {
    ov[s].querySelectorAll('.tagx,.ring,.lens,.leader,.olay').forEach(e => e.remove());
    ov[s].tags = []; ov[s].mag = null;
    ov[s].svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov[s].svg.setAttribute('class', 'olay');
    ov[s].prepend(ov[s].svg);
  }
  for (const e of EV) {
    if (e.mag) continue;
    const t = document.createElement('span'); t.className = `tagx lg ${e.kind}`; t.innerHTML = `<i></i>${e.label}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', e.kind);
    ov[e.side].svg.appendChild(path);
    ov[e.side].appendChild(t); ov[e.side].tags.push({ el: t, ev: e, path });
    loadOutline(e.mask);
  }
  if (st.k.magnifier) {
    for (const s of SIDES) {
      const ring = document.createElement('span'); ring.className = 'ring';
      const leader = document.createElement('span'); leader.className = 'leader';
      const lens = document.createElement('div'); lens.className = 'lens'; lens.setAttribute('aria-label', 'Magnifier. Drag to move.');
      const c = document.createElement('canvas'); c.width = c.height = 220; lens.appendChild(c);
      ov[s].append(ring, leader, lens);
      const lab = EV.find(e => e.mag && e.side === s);
      let tag = null;
      if (lab) { tag = document.createElement('span'); tag.className = `tagx lg ${lab.kind}`; tag.innerHTML = `<i></i>${lab.label}`; ov[s].appendChild(tag); }
      const m = { ring, leader, lens, c, ctx: c.getContext('2d'), tag, lab, custom: null };
      ov[s].mag = m;
      dragLens(s, m);
    }
  }
  glassify(document);
}
function dragLens(side, m) {
  m.lens.addEventListener('pointerdown', e => {
    e.preventDefault(); m.lens.setPointerCapture(e.pointerId); m.lens.style.cursor = 'grabbing';
    const r = cardEl[side].getBoundingClientRect();
    const move = ev => { m.custom = [clamp(ev.clientX - r.left, 0, r.width), clamp(ev.clientY - r.top, 0, r.height)]; };
    move(e);
    const up = () => { m.lens.removeEventListener('pointermove', move); m.lens.removeEventListener('pointerup', up); m.lens.style.cursor = ''; };
    m.lens.addEventListener('pointermove', move); m.lens.addEventListener('pointerup', up);
  });
}

function updateOverlays() {
  const k = st.k, u = st.u;
  for (const s of SIDES) {
    const [m, sp] = master(k, s, u);
    const chip = ov[s].chip;
    const shown = showSpeed(sp || 1);
    const txt = sp === 0 && m >= k.clip[s].end - 1e-3 && st.mode === 'video' && k.hold[s] != null ? 'paused' : sp === 0 ? 'ended' : `${shown}x`;
    if (chip.sp.textContent !== txt) chip.sp.textContent = txt;
    const tm = mmss(m - REF[k.task][s]); if (chip.tm.textContent !== tm) chip.tm.textContent = tm;
    chip.el.classList.toggle('fast', sp > 0 && shown >= FAST);
    const dim = DIMS.some(d => d.side === s && u >= d.from && u < d.to) && st.view === 'footage';
    cardEl[s].classList.toggle('dim', dim);
    placeVideo(s);
    const map = cardMap(s);
    const pill = ov[s].querySelector('.pill').getBoundingClientRect(), cr = cardEl[s].getBoundingClientRect();
    const top = pill.bottom - cr.top + 8, bot = map.h - (cardEl[s].querySelector('.auto').offsetHeight || 0) - 18, gap = 10 + 6 * (map.h / 600);
    for (const { el, ev, path } of ov[s].tags) {
      const a = appear(u, ev.u);
      const polys = a > 0 ? outlineAt(ev.mask, m) : null;
      if (!polys) { el.classList.remove('on'); path.style.opacity = 0; continue; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, d = '';
      for (const poly of polys) {
        for (let i = 0; i < poly.length; i += 2) {
          const [x, y] = map.f(poly[i], poly[i + 1]);
          d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        d += 'Z';
      }
      path.setAttribute('d', d); path.style.opacity = a;
      const tw = el.offsetWidth || 150, th = el.offsetHeight || 32, pad = 10;
      const cx = clamp((x0 + x1) / 2, pad + tw / 2, map.w - pad - tw / 2);
      let x = cx, y;
      if (ev.place === 'below' && y1 + gap + th < bot) y = y1 + gap;
      else if (y0 - gap - th > top) y = y0 - gap - th;
      else if (y1 + gap + th < bot) y = y1 + gap;
      else if (x1 + gap + tw < map.w - pad) { x = x1 + gap + tw / 2; y = (y0 + y1) / 2 - th / 2; }
      else { x = x0 - gap - tw / 2; y = (y0 + y1) / 2 - th / 2; }
      el.style.left = `${x}px`; el.style.top = `${clamp(y, top, bot - th)}px`;
      el.classList.add('on'); el.style.opacity = a;
    }
    const mg = ov[s].mag;
    if (mg) drawMag(s, mg, map, u);
  }
}
// the video's appear curve for an outcome (opening.py appear_alpha): fades in over 0.55 s around its moment
function appear(u, ue) { const p = clamp((u - (ue - 0.1)) / 0.55, 0, 1); return p * p * (3 - 2 * p); }
function loadOutline(id) {
  if (!id || OUTL[id]) return;
  OUTL[id] = { frames: null };
  fetch(`assets/data/outlines/${id}.json`).then(r => r.json()).then(d => { OUTL[id] = { frames: d.frames, ts: d.frames.map(f => f[0]) }; });
}
function outlineAt(id, t) {
  const o = OUTL[id]; if (!o?.frames) return null;
  const ts = o.ts; t = clamp(t, ts[0], ts[ts.length - 1]);          // held at the ends: the objects are at rest there
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] < t) lo = mid; else hi = mid; }
  return o.frames[Math.abs(ts[lo] - t) < Math.abs(ts[hi] - t) ? lo : hi][1];
}
function drawMag(s, mg, map, u) {
  const k = st.k, [sx, sy, sr] = SMILEY[s];
  const t0 = k.magFrom[s] ?? 0.2;
  const on = u >= t0, grow = u >= t0 + 0.15;
  const done = mg.lab && u >= mg.lab.u;
  const [rx, ry] = map.f(sx, sy); const rr = sr * 1.35 * map.s + 6;
  mg.ring.style.left = `${rx}px`; mg.ring.style.top = `${ry}px`; mg.ring.style.width = mg.ring.style.height = `${2 * rr}px`;
  mg.ring.classList.toggle('on', on && !mg.custom); mg.ring.classList.toggle('good', !!done);
  let lx, ly;
  const lensD = mg.lens.offsetWidth || 150;
  if (mg.custom) [lx, ly] = mg.custom;
  else { [lx, ly] = map.f(sx + MAG_OFF[0], sy + MAG_OFF[1]); lx = clamp(lx, lensD / 2 + 10, map.w - lensD / 2 - 10); ly = clamp(ly, lensD / 2 + map.h * 0.12, map.h - lensD / 2 - map.h * 0.14); }
  mg.lens.style.left = `${lx}px`; mg.lens.style.top = `${ly}px`;
  mg.lens.classList.toggle('on', grow); mg.lens.classList.toggle('done', !!done);
  const dx = lx - rx, dy = ly - ry, dn = Math.hypot(dx, dy) || 1;
  mg.leader.style.left = `${rx + dx / dn * rr}px`; mg.leader.style.top = `${ry + dy / dn * rr}px`;
  mg.leader.style.width = `${Math.max(0, dn - rr - lensD / 2)}px`; mg.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  mg.leader.classList.toggle('on', grow && !mg.custom);
  if (mg.tag) {
    mg.tag.classList.toggle('on', !!done);
    mg.tag.style.left = `${lx}px`; mg.tag.style.top = `${ly + lensD / 2 + 12}px`;
  }
  // lens content: the drawing (or whatever is under a moved lens), live from the video frame
  const v = vids[s];
  if (grow && v.readyState >= 2 && v.videoWidth) {
    const vs = v.videoWidth / (useSquare() ? 1080 : 1920);
    let cx, cy, half;
    if (mg.custom) { [cx, cy] = map.inv(mg.custom[0], mg.custom[1]); half = lensD / 2 / map.s / 2.2; }
    else { cx = sx; cy = sy; half = sr * 1.35; }
    try { mg.ctx.drawImage(v, (cx - map.x0 - half) * vs, (cy - half) * vs, 2 * half * vs, 2 * half * vs, 0, 0, 220, 220); } catch (e) { /* frame not ready */ }
  }
}

// ---------------------------------------------------------------- footage videos
function seekTo(v, t) {
  if (v._seeking) { v._pending = t; return; }
  v._seeking = true; v._pending = null;
  try { v.currentTime = t; } catch (e) { v._seeking = false; }
}
function setupVideo(v) {
  v.addEventListener('seeked', () => { v._seeking = false; if (v._pending != null) { const t = v._pending; v._pending = null; seekTo(v, t); } });
  v.addEventListener('loadedmetadata', () => { v._seeking = false; v._pending = null; });
}
function loadVideos() {
  for (const s of SIDES) {
    const v = vids[s];
    const base = `assets/footage/${st.task}_${s}_${useSquare() ? '480' : 'wide'}`;
    v.poster = `${base}.jpg`;
    v.preload = st.visible ? 'auto' : 'metadata';
    if (!v.src.endsWith(`${base}.mp4`)) { v.src = `${base}.mp4`; v._seeking = false; v._pending = null; }
  }
}
function ready() {
  return SIDES.every(s => { const v = vids[s], [, sp] = master(st.k, s, st.u); return sp === 0 ? v.readyState >= 2 : v.readyState >= 3 && !v._seeking; });
}
function syncVideos() {
  for (const s of SIDES) {
    const v = vids[s];
    if (v.readyState < 1) continue;
    const [m, sp] = master(st.k, s, st.u);
    const ct = m - st.k.clip[s].src;
    if (st.playing && !st.dragging && sp > 0 && st.visible) {
      if (v.paused && !v._seeking) v.play().catch(() => {});
      const drift = ct - v.currentTime;
      if (Math.abs(drift) > 0.3) seekTo(v, ct);
      else {
        const rate = clamp(sp * (1 + clamp(drift * 1.6, -0.3, 0.3)), 0.25, 8);
        if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
      }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - ct) > 0.02) seekTo(v, ct);
    }
  }
}

// ---------------------------------------------------------------- transport
const tr = {};
// the stretches where either run plays at 1.5x or more, sampled from the same speed curve the chips read
function fastStretches() {
  const out = []; let cur = null;
  for (let u = 0; u <= L + 1e-6; u += 0.02) {
    const sp = SIDES.map(s => master(st.k, s, u)[1]);
    const fast = sp.some(v => v > 0 && showSpeed(v) >= FAST);
    if (fast) {
      cur ??= { from: u, top: { js: 1, ours: 1 } };
      cur.to = u; SIDES.forEach((s, i) => { cur.top[s] = Math.max(cur.top[s], showSpeed(sp[i] || 1)); });
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
function buildMarks() {
  const mk = tr.marks; mk.innerHTML = '';
  if (st.view === 'trials') {                     // each recording's waypoints, as it reaches them, on the longer one's length
    const T = TC.dur(); if (!T) return;
    for (const s of SIDES) {
      const r = REACH?.[`${TOOL[st.task]}/${POL[s]}/${trialK}`]; if (!r) continue;
      for (const t of r.reach) { const e = document.createElement('span'); e.className = `tk ${s}`; e.style.left = `${clamp(t / T, 0, 1) * 100}%`; mk.appendChild(e); }
    }
    return;
  }
  if (st.mode === 'video') for (const w of fastStretches()) {
    const e = document.createElement('span'); e.className = 'fast';
    e.style.left = `${w.from / L * 100}%`; e.style.width = `${(w.to - w.from) / L * 100}%`;
    e.title = `Sped up: ${SIDES.map(s => `${s === 'js' ? 'Standard Exploration' : 'EigenDEXplore'} ${w.top[s]}x`).join(', ')}`;
    mk.appendChild(e);
  }
  for (const e of EV) {
    const d = document.createElement('span'); d.className = `mk ${e.kind}`; d.style.left = `${clamp(e.u / L, 0, 1) * 100}%`;
    d.title = `${e.side === 'js' ? 'Standard Exploration' : 'EigenDEXplore'}: ${e.label}`; mk.appendChild(d);
  }
}
function setTransport(p, clock, total, playing, ended) {
  tr.fill.style.width = `${p * 100}%`;
  tr.knob.style.left = `${p * 100}%`;
  tr.scrub.setAttribute('aria-valuenow', Math.round(p * 100));
  const c = `${clock}<span class="tot"> / ${total}</span>`;
  if (tr.clockHTML !== c) { tr.clockHTML = c; tr.clock.innerHTML = c; }
  tr.play.classList.toggle('playing', playing);
  tr.play.classList.toggle('ended', !playing && ended);
  tr.play.setAttribute('aria-label', playing ? 'Pause' : ended ? 'Replay' : 'Play');
}
function updateTransport() {
  if (st.view === 'trials') {
    const T = TC.dur() || 1;
    setTransport(clamp(TC.st.t / T, 0, 1), msc(TC.st.t), msc(T), TC.st.playing, TC.st.ended);
    return;
  }
  setTransport(clamp(st.u / L, 0, 1), msc(clockOf(st.u)), msc(clockOf(L)), st.playing, st.ended);
}
function scrubTo(x) {
  const r = tr.rail.getBoundingClientRect(), p = clamp((x - r.left) / r.width, 0, 1);
  if (st.view === 'trials') {
    TC.seek(p * TC.dur());
    return;
  }
  st.u = p * L; st.ended = false;
}

function setTask(task, { play = false } = {}) {
  st.task = task; st.k = buildTask(task); EV = events(st.k); L = fullLength(); DIMS = dimWindows(st.k);
  st.u = 0; st.ended = false; st.playing = play && st.view !== 'trials';
  document.querySelectorAll('#taskSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.task === task));
  moveThumb($('#taskSeg'));
  $('#taskLine').textContent = LINE[task];
  loadVideos(); buildOverlays(); buildMarks(); buildScore(); updateTransport();
  if (st.view === 'trials') loadTrials(play);
  if (replay) replay.setTask(task, cropOf);
}
function setMode(mode) {
  st.mode = mode; EV = events(st.k); L = fullLength(); DIMS = dimWindows(st.k);
  st.u = 0; st.ended = false; st.playing = true;              // a new timing starts the task from the beginning
  buildOverlays(); buildMarks();
  document.querySelectorAll('#timingSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.timing === mode));
}
function moveThumb(seg) {
  const th = seg.querySelector('.seg-thumb'); const b = seg.querySelector('[aria-selected="true"]');
  if (!th || !b) return;
  th.style.width = `${b.offsetWidth}px`; th.style.transform = `translateX(${b.offsetLeft}px)`;
}
function onEnd() { st.playing = false; st.ended = true; }

// ---------------------------------------------------------------- views
// the 3D camera's crop of the Sony frame for a card: the same map as the footage (cardMap)
function cropOf(side) {
  const m = cardMap(side);
  return { x: -m.ox / m.s + m.x0, y: -m.oy / m.s, w: m.w / m.s, h: m.h / m.s };
}
// switching between the footage and the recordings: each card keeps a still of what it showed until the new picture
// is there, then lets it go in .3 s (never a blank card, never a cut); the 3D replay dissolves on its own
function drawVideo(g, v, cr) {
  if (!(v.readyState >= 2 && v.videoWidth) || v.style.opacity === '0') return false;
  const r = v.getBoundingClientRect(), cs = getComputedStyle(v), x = r.left - cr.left, y = r.top - cr.top, w = r.width, h = r.height;
  try {
    if (cs.objectFit === 'cover') {
      const k = Math.max(w / v.videoWidth, h / v.videoHeight), dw = v.videoWidth * k, dh = v.videoHeight * k, [px, py] = cs.objectPosition.split(' ');
      const off = (p, room) => (p.endsWith('%') ? room * parseFloat(p) / 100 : parseFloat(p));
      g.drawImage(v, x + off(px, w - dw), y + off(py, h - dh), dw, dh);
    } else g.drawImage(v, x, y, w, h);
    return true;
  } catch (e) { return false; }
}
function takeSnap(from) {
  for (const s of SIDES) {
    const card = cardEl[s], c = card.querySelector('canvas.v-snap') || card.insertBefore(Object.assign(document.createElement('canvas'), { className: 'v-snap' }), ov[s]);
    const D = Math.min(devicePixelRatio || 1, 2), w = card.clientWidth, h = card.clientHeight;
    c.width = Math.round(w * D); c.height = Math.round(h * D);
    const g = c.getContext('2d'); g.setTransform(D, 0, 0, D, 0, 0);
    const ok = drawVideo(g, from === 'trials' ? tvids[s] : vids[s], card.getBoundingClientRect());
    c._fading = false; Object.assign(c.style, { transition: 'none', opacity: ok ? 1 : 0 }); void getComputedStyle(c).opacity;
  }
}
function releaseSnap(ready) {
  const t0 = performance.now();
  const step = () => {
    let wait = 0;
    for (const s of SIDES) {
      const c = cardEl[s].querySelector('canvas.v-snap'); if (!c || c._fading || c.style.opacity === '0') continue;
      if (ready(s) || performance.now() - t0 > 1500) { c._fading = true; c.style.transition = 'opacity .3s ease'; c.style.opacity = 0; } else wait++;
    }
    if (wait) requestAnimationFrame(step);
  };
  requestAnimationFrame(() => requestAnimationFrame(step));
}
const clipReady = s => tvids[s].readyState >= 2 && tvids[s].style.opacity !== '0';
async function setView(view) {
  const prev = st.view; if (view === prev) return;
  if (prev === 'trials' || (prev === 'footage' && view === 'trials')) takeSnap(prev);
  st.view = view;
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
  const cards = $('#cards');
  cards.classList.toggle('trials', view === 'trials');
  $('#timingSeg').hidden = view === 'trials';
  $('#trialSeg').hidden = view !== 'trials';
  if (prev === 'trials') TC.stop();
  if (view === 'trials') { st.playing = false; loadTrials(true); releaseSnap(clipReady); }
  else if (view === 'footage' && prev === 'trials') releaseSnap(s => vids[s].readyState >= 2);
  markScore();
  if (prev === '3d') leave3d();
  if (view === '3d') { if (prev === 'trials') releaseSnap(() => $('#cards').classList.contains('shown')); await enter3d(); }
  buildMarks(); updateTransport();
}
// the 3D replay is made ready in a quiet moment once the rest of the page has warmed up (main.js): its files fetched,
// its scene built and its programs compiled while it is still hidden, so the button opens it at once, without a stall
export function prewarm3d() {
  if (replayLoading || navigator.connection?.saveData) return;
  // only while the reader is at (or near) section 1, in a quiet moment: building it while another section plays would
  // stall that section's frames
  const io = new IntersectionObserver(es => { if (!es.some(e => e.isIntersecting)) return; io.disconnect(); quiet(buildReplay, { after: 1200 }); }, { rootMargin: '50% 0px' });
  io.observe($('#cards'));
}
function buildReplay() {
  if (replayLoading) return;
  replayLoading = import('./replay3d.js').then(m => m.createReplay($('#replay'), $('#cards'), { mobile: phone() }));
  replayLoading.then(async r => { await breathe(); await r.setTask(st.task, cropOf); await breathe(); const hidden = () => st.view !== '3d' && !leaving3d; if (hidden()) await r.warm(hidden); })
    .catch(e => console.error('3D replay', e));
}
async function enter3d() {
  const cards = $('#cards');
  leaving3d = false;
  cards.classList.add('three');
  $('#r3dUi').hidden = false;
  if (!replay) {
    cards.classList.add('r3d-loading');
    replayLoading ??= import('./replay3d.js').then(m => m.createReplay($('#replay'), cards, { mobile: phone() }));
    try { replay = await replayLoading; }
    catch (e) { console.error('3D replay', e); cards.classList.remove('r3d-loading', 'three'); return; }
    replay.onChange(orbited => { $('#r3dReset').classList.toggle('on', orbited); });     // fades in / out
    // the hint that the scene can be turned (once a visit): it turns a little on its own and back; a touch takes over
    demo3d = orbitDemo({ key: 'eg-orbit-demo-s1' });
    $('#replay').addEventListener('pointerdown', () => { const y = demo3d.stop(performance.now(), true); if (y) replay.absorb(y); }, true);
  }
  await replay.setTask(st.task, cropOf);
  cards.classList.remove('r3d-loading');
  if (st.view !== '3d') return;
  render3d();
  requestAnimationFrame(() => { if (st.view === '3d') cards.classList.add('shown'); });     // dissolve in, pixel aligned
  demoAt = performance.now() + 900;                       // after the dissolve
}
function leave3d() {
  demoAt = 0; demo3d?.stop(performance.now(), false);
  $('#r3dUi').hidden = true;
  if (!replay) { $('#cards').classList.remove('three', 'r3d-loading'); return; }
  leaving3d = true;                                 // fly back to the footage camera first (tick), then dissolve out
  replay.reset();
}
function finishLeave3d() {
  leaving3d = false;
  const cards = $('#cards');
  cards.classList.remove('shown');
  setTimeout(() => { if (st.view !== '3d') cards.classList.remove('three'); }, 650);
}
// the replay canvas spans both cards: clip it to their rounded shapes
let clipKey = '';
function clipCanvas() {
  const c = $('#replay'), cr = c.getBoundingClientRect();
  const parts = SIDES.map(s => {
    const r = cardEl[s].getBoundingClientRect(), rad = parseFloat(getComputedStyle(cardEl[s]).borderTopLeftRadius) || 0;
    const x = r.left - cr.left, y = r.top - cr.top, w = r.width, h = r.height, k = Math.min(rad, w / 2, h / 2);
    return `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`;
  }).join('');
  if (parts !== clipKey) { clipKey = parts; c.style.clipPath = `path('${parts}')`; }
}
function render3d() {
  clipCanvas();
  if (!replay) return;
  const times = {};
  for (const s of SIDES) times[s] = master(st.k, s, st.u)[0];
  replay.render(times, cropOf);
}

// ---------------------------------------------------------------- more trials (robot camera, evaluation runs)
// Same card shape as the footage: the recording is cropped from the left (the lab monitor and the clip's own counter,
// up to x = 240 of 768) and, on wide cards, a little from the bottom; a live glass counter replaces the clip's one.
let trialK = 'median';
const TRIAL_XL = 240 / 768;
function placeTrial(side) {
  const v = tvids[side], c = cardEl[side];
  if (!v.videoWidth) return;
  const W = v.videoWidth, H = v.videoHeight, xl = TRIAL_XL * W, cw = c.clientWidth, ch = c.clientHeight;
  let sc, x0;
  if ((W - xl) / H >= cw / ch) { sc = ch / H; x0 = W - cw / sc; } else { sc = cw / (W - xl); x0 = xl; }
  const st_ = v.style, w = `${(W * sc).toFixed(1)}px`;
  if (st_.width !== w) Object.assign(st_, { width: w, height: `${(H * sc).toFixed(1)}px`, left: `${(-x0 * sc).toFixed(1)}px`, top: '0px' });
}
function updateCounters() {
  for (const s of SIDES) {
    const r = REACH?.[`${TOOL[st.task]}/${POL[s]}/${trialK}`], w = ov[s].wp; if (!r) continue;
    const n = r.reach.filter(t => t <= tvids[s].currentTime + 1e-3).length;
    if (w.n !== n || w.total !== r.total) {
      w.n = n; w.total = r.total;
      w.b.textContent = n; w.tot.textContent = r.total; w.bar.style.width = `${n / r.total * 100}%`;
      w.el.classList.toggle('done', n === r.total);
    }
  }
}
// switching clips: the frame on screen is held (a canvas over the card) until the next clip has its first frame, then
// it fades away, so a switch never shows an empty card
function holdFrame(s) {
  const v = tvids[s], c = cardEl[s].querySelector('canvas.tv-hold') || v.parentNode.insertBefore(Object.assign(document.createElement('canvas'), { className: 'tv-hold' }), v.nextSibling);
  if (v.readyState >= 2 && v.videoWidth && st.view === 'trials') {
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    Object.assign(c.style, { left: v.style.left, top: v.style.top, width: v.style.width, height: v.style.height, transition: 'none', opacity: 1 });
  } else c.style.opacity = 0;
  v.style.opacity = 0;
  const show = () => {
    v.removeEventListener('loadeddata', show); placeTrial(s); v.style.opacity = 1;
    requestAnimationFrame(() => { c.style.transition = 'opacity .28s ease'; c.style.opacity = 0; });
  };
  v.addEventListener('loadeddata', show);
}
function loadTrials(play) {
  if (!PICKS) return;
  for (const s of SIDES) {
    const v = tvids[s];
    const url = `https://eigendexplore.github.io/videos/tool_${TOOL[st.task]}_${POL[s]}_${trialK}.mp4`;
    if (v.dataset.src !== url) { holdFrame(s); v.dataset.src = url; v.preload = 'auto'; v.style.width = ''; v.src = url; }
  }
  document.querySelectorAll('#trialSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === trialK));
  markScore();
  TC.restart(play && st.view === 'trials');
}

// ---------------------------------------------------------------- the score: the current task's 10 trials per method
function buildScore() {
  if (!SCORES) return;
  const sc = SCORES[st.task];
  for (const s of SIDES) {
    const box = document.querySelector(`.sc[data-side="${s}"]`), d = sc[s];
    box.querySelector('.num').textContent = `${Math.round(d.mean)}%`;
    const trk = box.querySelector('.trk');
    let cols = [...trk.querySelectorAll('.col')];
    if (!cols.length) {
      trk.querySelector('.dots')?.remove();
      for (let i = 0; i < 10; i++) { const b = document.createElement('button'); b.className = 'col'; b.innerHTML = '<i></i>'; trk.appendChild(b); }
      cols = [...trk.querySelectorAll('.col')];
      trk.addEventListener('click', e => { const b = e.target.closest('.col.pick'); if (!b) return; trialK = b.dataset.k; setView('trials').then(() => loadTrials(true)); });
    }
    d.trials.forEach((t, i) => {
      const c = cols[i];
      c.firstChild.style.height = `${Math.max(t.pct, 1.5)}%`;
      c.classList.toggle('pick', !!t.pick);
      if (t.pick) { c.dataset.k = t.pick; c.tabIndex = 0; } else { delete c.dataset.k; c.tabIndex = -1; }
      const when = t.time_s != null ? (t.pct === 100 ? `, done in ${t.time_s.toFixed(1)} s` : `, last one at ${t.time_s.toFixed(1)} s`) : '';
      c.title = `${t.pct.toFixed(0)}% task progress (${t.goals} of ${t.total} waypoints${when})${t.pick ? `. The ${RANK[t.pick]} trial: play it` : ''}`;
      c.setAttribute('aria-label', c.title);
    });
    trk.querySelector('.mean').style.bottom = `${d.mean}%`;
  }
  $('#scoreNote').textContent = 'Ten trials per method, sorted. Task progress is the fraction of demonstrated waypoints the robot reaches.';
  markScore();
}
function markScore() {
  document.querySelectorAll('.trk .col').forEach(c => c.classList.toggle('on', st.view === 'trials' && c.dataset.k === trialK));
}

// ---------------------------------------------------------------- init
export async function init() {
  [FOOT, PICKS, REACH, SCORES] = await Promise.all([
    fetch('assets/data/footage.json').then(r => r.json()),
    fetch('assets/data/trial_picks.json').then(r => r.json()),
    fetch('assets/data/trial_reach.json').then(r => r.json()),
    fetch('assets/data/task_scores.json').then(r => r.json()),
  ]);
  for (const s of SIDES) {
    cardEl[s] = document.querySelector(`.card[data-side="${s}"]`);
    vids[s] = cardEl[s].querySelector('video.fv'); setupVideo(vids[s]);
    tvids[s] = cardEl[s].querySelector('video.tv');
    ov[s] = cardEl[s].querySelector('.ov');
    const ch = ov[s].querySelector('[data-chip]');
    ov[s].chip = { el: ch, sp: ch.querySelector('.sp'), tm: ch.querySelector('.tm') };
    const wp = ov[s].querySelector('[data-wp]');
    ov[s].wp = { el: wp, b: wp.querySelector('b'), tot: wp.querySelector('.wp-n'), bar: wp.querySelector('.wp-bar i'), n: -1 };
    tvids[s].addEventListener('loadedmetadata', () => { placeTrial(s); if (st.view === 'trials') buildMarks(); });
  }
  Object.assign(tr, { scrub: $('#scrub'), rail: $('#scrub .rail'), fill: $('#scrub .fill'), knob: $('#scrub .knob'), marks: $('#scrub .marks'), clock: $('#clock'), play: $('#playBtn') });
  animateDisclosure($('#why'));

  setTask('hammer');
  window.__s1 = { st, setTask, setView, get L() { return L; }, get replay() { return replay; } };

  $('#taskSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTask(b.dataset.task, { play: true }); });
  $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
  $('#timingSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.timing !== st.mode) setMode(b.dataset.timing); });
  $('#trialSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; trialK = b.dataset.k; loadTrials(true); });
  $('#r3dReset').addEventListener('click', () => replay?.reset());
  tr.play.addEventListener('click', () => {
    if (st.view === 'trials') { TC.toggle(); return; }
    if (st.playing) st.playing = false;
    else { if (st.ended || st.u >= L - 0.02) st.u = 0; st.ended = false; st.playing = true; }
  });

  let wasPlaying = false;
  tr.scrub.addEventListener('pointerdown', e => {
    tr.scrub.setPointerCapture(e.pointerId); st.dragging = true; wasPlaying = st.playing; scrubTo(e.clientX);
  });
  tr.scrub.addEventListener('pointermove', e => { if (st.dragging) scrubTo(e.clientX); });
  const endDrag = () => { if (!st.dragging) return; st.dragging = false; st.playing = wasPlaying && st.u < L; };
  tr.scrub.addEventListener('pointerup', endDrag); tr.scrub.addEventListener('pointercancel', endDrag);
  tr.scrub.addEventListener('keydown', e => {
    const d = { ArrowLeft: -0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowUp: 0.5 }[e.key];
    if (st.view === 'trials') {
      if (d != null) { TC.seek(TC.st.t + d * 4); e.preventDefault(); }
      else if (e.key === ' ') { tr.play.click(); e.preventDefault(); }
      return;
    }
    if (d != null) { st.u = clamp(st.u + d, 0, L); e.preventDefault(); }
    else if (e.key === 'Home') { st.u = 0; e.preventDefault(); }
    else if (e.key === 'End') { st.u = L; e.preventDefault(); }
    else if (e.key === ' ') { tr.play.click(); e.preventDefault(); }
  });

  // visibility: play the current task once the first time the stage is in view (no auto-advance to the next task)
  let played = false;
  const cardsBox = $('#cards');
  function checkVisible() {
    const vis = engaged(cardsBox, st.visible);             // most of the stage on screen (js/stage.js)
    if (vis === st.visible) return;
    st.visible = vis;
    if (vis) { loadVideos(); if (!played && !reduced && st.view === 'footage') { played = true; st.playing = true; } }
    else { SIDES.forEach(s => { vids[s].pause(); tvids[s].pause(); }); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { SIDES.forEach(s => { vids[s].pause(); tvids[s].pause(); }); st.visible = false; } });
  let wasPhone = phone();
  addEventListener('resize', () => {
    moveThumb($('#taskSeg'));
    if (phone() !== wasPhone) { wasPhone = phone(); loadVideos(); }
    updateOverlays(); replay?.invalidate();
  });
  $('.s1').addEventListener('stagefit', () => { updateOverlays(); replay?.invalidate(); });
  moveThumb($('#taskSeg'));

  let last = performance.now(), lastTick = 0;
  const frame = now => { requestAnimationFrame(frame); tick(now); };
  const tick = now => {
    lastTick = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    checkVisible();
    if (!st.visible) return;
    if (st.view !== 'trials' && st.playing && !st.dragging && ready()) {
      st.u += dt;
      if (st.u >= L) { st.u = L; onEnd(); }
    }
    if (st.view !== 'trials') { syncVideos(); updateOverlays(); }
    else { TC.st.dragging = st.dragging; TC.tick(dt, st.visible); SIDES.forEach(placeTrial); updateCounters(); }
    updateTransport();
    if (replay && (st.view === '3d' || leaving3d)) {
      if (demo3d) { if (demoAt && now >= demoAt && st.view === '3d') { demo3d.start(now); demoAt = 0; } replay.setPeek(demo3d.yaw(now)); }
      render3d();
      if (leaving3d && replay.settled() && (st.view !== 'trials' || SIDES.every(clipReady) || (leaveT ||= now) && now - leaveT > 1500)) { leaveT = 0; finishLeave3d(); }
    }
  };
  requestAnimationFrame(frame);
  pump(() => lastTick, tick);
  glassify(document);
}
