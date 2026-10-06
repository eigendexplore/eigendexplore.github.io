// Section 5's live plot band: the overview video's part-5 slab (video/scripts/method/p5_plot.py) in section 3's exact
// plot format (js/s3.js buildBand / drawBand: its pads, grid, ticks, 2.4 px curves with their 7 px halos and fading
// fills, the reveal up to the playhead, the glass knobs on the curve heads, the title and the readout where and as s3
// draws them). The video's own content on top: the title's "(ADD-AUC)" tag and "lower is better", the gold verdict
// capsule once both runs are done (ours shining, the gap between the curves striped gold), the dropped object.
//
//   const P = createPlot(host)                host: the band's plot container (position: relative)
//   P.setRun({ kind: 'dm' | 'sp', json, L })  L = the run's length on the page clock (s)
//   P.draw(u)                                 every frame (cheap: attributes only, nothing when u is unchanged)
//   P.uAt(clientX)                            page-clock time under a pointer x (for scrubbing)
//   P.resize()                                rebuild for a new size (also run by its own diffed ResizeObserver)
//
// The x axis is the episode's own time, as the video's slab. DexMachina ('dm'): the page clock is episode seconds;
// json.methods.{jspace, ours}.err = per-frame object tracking error (1 - ADD-AUC score) at json.rate (60 Hz).
// SPIDER ('sp'): the page clock is the video's (u s -> frame u * fps of json.frames = [{ph, r, tau}]); the axis is
// tau (0..4 s), which only advances in 'execute' frames, so during a sampling round the playhead holds;
// json.arms.{iid, pca}.cost = retargeting cost per cost_dt of tau.
const NS = 'http://www.w3.org/2000/svg';
const SIDES = ['js', 'ours'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DROP = 0.98;                                       // the error at the top of its scale ...
const DROP_MIN_S = 0.25;                                 // ... and staying there to the end (at least this long)
const SPEC = {
  dm: { title: 'Object tracking error', short: 'Tracking error', tag: '(ADD-AUC)', sub: 'lower is better', unit: 'error', m: { js: 'jspace', ours: 'ours' } },
  sp: { title: 'Retargeting cost', short: 'Cost', tag: '', sub: 'lower is better', unit: 'cost', m: { js: 'iid', ours: 'pca' } },
};
const SP_Y = { pencil: [0.2, [0, 0.1, 0.2]], spoon: [0.08, [0, 0.04, 0.08]] };     // the video's axes
let UID = 0;

const tickFmt = v => (v ? String(+v.toFixed(3)) : '0');
const sec = s => `${Math.max(0, s).toFixed(1)} s`;
function niceAxis(max) {                                // a fallback for a task the video had no axis for
  const p = 10 ** Math.floor(Math.log10(max)), m = [1, 2, 2.5, 4, 5, 8, 10].find(k => k * p >= max) * p;
  return [m, [0, m / 2, m]];
}
// value of a series sampled at (i + 1) * dt, at time t (held before the first sample and after the last)
function sampleAt(a, dt, t) {
  const x = t / dt - 1;
  if (x <= 0) return a[0];
  const i = Math.min(Math.floor(x), a.length - 2), f = Math.min(x - i, 1);
  return a[i] * (1 - f) + a[i + 1] * f;
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
function verdictText(mj, mo, unit) {
  const p = Math.round(100 * (1 - mo / mj));
  return `${p >= 0 ? '−' : '+'}${Math.abs(p)}% ${unit}`;
}
// the series' own samples between 0 and xmax (and both ends)
function samples(dt, n, xmax) { const out = [0]; for (let i = 0; i < n && (i + 1) * dt < xmax; i++) out.push((i + 1) * dt); out.push(xmax); return out; }

// ---------------------------------------------------------------- a run, prepared once (independent of the size)
// a run: xmax (axis length, episode s), axisAt(u) (axis time at page time u), uOf(a) (page time of axis time a),
// val[side](a), xs (the curves' sample times), events, verdict
function prepDM(json, L) {
  const S = SPEC.dm, rate = json.rate || 60, dt = 1 / rate, M = {};
  for (const s of SIDES) M[s] = json.methods[S.m[s]];
  L = L || Math.max(...SIDES.map(s => M[s].s_end)) / rate;
  const val = {}; for (const s of SIDES) { const e = M[s].err; val[s] = a => sampleAt(e, dt, a); }
  // the dropped object: from the first sample after which the error never leaves the top of its scale
  const events = [];
  for (const s of SIDES) {
    const e = M[s].err; let last = -1;
    for (let i = 0; i < e.length; i++) if (e[i] < DROP) last = i;
    const t = (last + 2) * dt;
    if (last + 1 < e.length && t < L - DROP_MIN_S) events.push({ side: s, a: t, text: 'Dropped' });
  }
  const mj = M.js.err_raw_mean ?? mean(M.js.err), mo = M.ours.err_raw_mean ?? mean(M.ours.err);
  return { kind: 'dm', L, xmax: L, ymax: 1, yticks: [0, 0.5, 1], val, events, axisAt: u => clamp(u, 0, L), uOf: a => clamp(a, 0, L),
    xs: samples(dt, Math.max(M.js.err.length, M.ours.err.length), L), verdict: verdictText(mj, mo, S.unit) };
}
function prepSP(json, L) {
  const S = SPEC.sp, fps = json.fps || json.timeline?.fps || 30000 / 1001, A = {};
  for (const s of SIDES) A[s] = json.arms[S.m[s]];
  const ep = json.episode_s || A.js.cost.length * A.js.cost_dt;
  let fr = json.frames;
  if (!fr?.length) {                                     // no timeline in the data: one plain execution over L
    const n = Math.max(2, Math.round((L || ep) * fps));
    fr = Array.from({ length: n }, (_, i) => ({ ph: 'execute', r: 0, tau: ep * i / (n - 1) }));
  }
  const N = fr.length; L = L || N / fps;
  // tau at page time u (it holds through the hold and the sampling rounds)
  const axisAt = u => { const x = clamp(u * fps, 0, N - 1), i = Math.min(Math.floor(x), N - 2), f = x - i; return N < 2 ? fr[0].tau : fr[i].tau + (fr[i + 1].tau - fr[i].tau) * f; };
  // the page time at which tau first reaches a in an executed frame (0 at the axis start, the run's end at its end)
  const uOf = a => {
    if (a <= 1e-6) return 0;
    if (a >= ep - 1e-6) return L;
    for (let i = 1; i < N; i++) {
      if (fr[i].ph !== 'execute' || fr[i].tau < a) continue;
      const t0 = fr[i - 1].tau, t1 = fr[i].tau;
      return (i - 1 + (t1 > t0 ? clamp((a - t0) / (t1 - t0), 0, 1) : 1)) / fps;
    }
    return L;
  };
  const val = {}; for (const s of SIDES) { const c = A[s].cost, dt = A[s].cost_dt || 0.02; val[s] = a => sampleAt(c, dt, a); }
  const [ymax, yticks] = SP_Y[json.task] || niceAxis(Math.max(...SIDES.map(s => Math.max(...A[s].cost))));
  const mj = A.js.cost_mean ?? mean(A.js.cost), mo = A.ours.cost_mean ?? mean(A.ours.cost);
  return { kind: 'sp', L, xmax: ep, ymax, yticks, val, events: [], axisAt, uOf,
    xs: samples(A.js.cost_dt || 0.02, A.js.cost.length, ep), verdict: verdictText(mj, mo, S.unit) };
}

// ---------------------------------------------------------------- the plot
export function createPlot(host, opts = {}) {
  const root = document.createElement('div'); root.className = 'p5p';
  host.appendChild(root);
  let run = null, spec = null, G = null, layer = null, lastU = NaN, sizeKey = '', fadeNext = false;
  const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
  const narrow = () => document.documentElement.clientWidth < 760;     // = s3.js narrow()

  function build() {
    const W = host.clientWidth, H = host.clientHeight;
    sizeKey = `${W}x${H}`;
    if (!run || W < 40 || H < 40) { G = null; return; }
    const id = `p5p${++UID}`, nar = narrow(), S = spec;
    const lay = document.createElement('div'); lay.className = fadeNext ? 'p5p-run enter' : 'p5p-run';
    if (layer?.isConnected) layer.replaceWith(lay); else root.appendChild(lay);   // attached first: text is measured below
    layer = lay;
    const svg = el('svg', { class: 'p5p-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }, lay);
    // = s3.js buildBand's pads; the one exception: the left pad grows (by 2 px, on phones) when a y label is longer
    // than s3's ("0.08"), so it never touches the band's edge
    const probe = el('text', {}, svg), yw = Math.max(...run.yticks.map(v => { probe.textContent = tickFmt(v); return probe.getComputedTextLength(); })); probe.remove();
    const px0 = Math.max(nar ? 34 : 50, Math.ceil(yw + 9 + 4)), px1 = W - (nar ? 14 : 22), py0 = nar ? 40 : 48, py1 = H - (nar ? 24 : 28);
    const XM = run.xmax, X = a => px0 + (px1 - px0) * clamp(a, 0, XM) / XM, Yv = v => py1 - (py1 - py0) * clamp(v, 0, run.ymax) / run.ymax;
    const defs = el('defs', {}, svg);
    for (const s of SIDES) {
      const g = el('linearGradient', { id: `${id}-f-${s}`, x1: 0, y1: py0, x2: 0, y2: py1, gradientUnits: 'userSpaceOnUse' }, defs);
      el('stop', { offset: 0, class: `st ${s}`, 'stop-opacity': s === 'ours' ? 0.26 : 0.18 }, g); el('stop', { offset: 1, class: `st ${s}`, 'stop-opacity': 0 }, g);
    }
    // the verdict's stripes (p5_plot.gap_stripes): strongest at our line, fading toward theirs (ours runs low)
    const pat = el('pattern', { id: `${id}-stripe`, width: nar ? 6 : 7.5, height: 20, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: nar ? 1.8 : 2.4, height: 20, class: 'stripe' }, pat);
    const gm = el('linearGradient', { id: `${id}-gf`, x1: 0, y1: py0, x2: 0, y2: py1, gradientUnits: 'userSpaceOnUse' }, defs);
    el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.3 }, gm); el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 1 }, gm);
    const mask = el('mask', { id: `${id}-gm`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-gf)` }, mask);
    const clip = el('clipPath', { id: `${id}-reveal` }, defs), reveal = el('rect', { x: 0, y: 0, width: px0, height: H }, clip);

    // grid, axes, ticks: s3's
    for (const v of run.yticks) {
      el('line', { x1: px0, x2: px1, y1: Yv(v), y2: Yv(v), stroke: '#fff', 'stroke-opacity': v ? 0.09 : 0.28, 'stroke-width': v ? 1 : 1.5 }, svg);
      el('text', { x: px0 - 9, y: Yv(v) + 4, 'text-anchor': 'end' }, svg).textContent = tickFmt(v);
    }
    el('line', { x1: px0, x2: px0, y1: py0 - 6, y2: py1, stroke: '#fff', 'stroke-opacity': 0.28, 'stroke-width': 1.5 }, svg);
    let lastR = -1e9;
    for (let k = 0; k <= XM + 1e-6; k++) {
      const x = X(k);
      el('line', { x1: x, x2: x, y1: py1, y2: py1 + 5, stroke: '#fff', 'stroke-opacity': 0.4 }, svg);
      const tx = el('text', { x, y: py1 + (nar ? 16 : 19), 'text-anchor': 'middle' }, svg); tx.textContent = `${k} s`;
      const w = tx.getComputedTextLength();
      if (x - w / 2 < lastR + 6 || x + w / 2 > W - 1) tx.remove(); else lastR = x + w / 2;   // never crowded, never clipped
    }

    // the dropped object (s3's tolerance event): marked on the axis from the start; the line, its glow, the zone after
    // it and the capsule once the playhead is past
    const evs = run.events.map(e => {
      const x = X(e.a);
      const zone = el('rect', { class: 'ev-zone', x: x.toFixed(1), y: py0 - 6, width: 0, height: py1 - py0 + 6 }, svg);
      const glow = el('line', { class: 'ev-glow', x1: x, x2: x, y1: py0 - 6, y2: py1 }, svg);
      const line = el('line', { class: 'ev-line', x1: x, x2: x, y1: py0 - 6, y2: py1 }, svg);
      return { e, x, zone, glow, line, past: false };
    });

    // the curves, whole, revealed up to the playhead (s3): fill, halo, line; the gold stripes in the gap and ours' core
    // (the verdict)
    const xs = run.xs, yy = {}, D = {};
    for (const s of SIDES) {
      yy[s] = xs.map(a => Yv(run.val[s](a)));
      D[s] = xs.map((a, i) => `${i ? 'L' : 'M'}${X(a).toFixed(1)} ${yy[s][i].toFixed(1)}`).join('');
    }
    const gap = xs.map((a, i) => `${i ? 'L' : 'M'}${X(a).toFixed(1)} ${Math.min(yy.js[i], yy.ours[i]).toFixed(1)}`).join('')
      + xs.map((a, i) => `L${X(xs[xs.length - 1 - i]).toFixed(1)} ${yy.ours[xs.length - 1 - i].toFixed(1)}`).join('') + 'Z';
    const curves = el('g', { 'clip-path': `url(#${id}-reveal)` }, svg);
    for (const s of SIDES) el('path', { d: `${D[s]}L${X(XM).toFixed(1)} ${py1}L${px0} ${py1}Z`, fill: `url(#${id}-f-${s})` }, curves);
    el('path', { d: gap, class: 'gap', fill: `url(#${id}-stripe)`, mask: `url(#${id}-gm)` }, curves);
    for (const s of SIDES) {
      el('path', { d: D[s], class: `halo ${s}` }, curves);
      el('path', { d: D[s], class: `ln ${s}` }, curves);
    }
    el('path', { d: D.ours, class: 'core' }, curves);
    const head = el('line', { class: 'head', x1: px0, x2: px0, y1: py0 - 6, y2: py1 }, svg);
    for (const e of evs) el('circle', { class: 'ev-dot', cx: e.x, cy: py1, r: nar ? 3 : 3.5 }, svg);
    const knobs = Object.fromEntries(SIDES.map(s => [s, el('circle', { class: `knob ${s}`, r: nar ? 5.5 : 7, cx: px0, cy: Yv(run.val[s](0)) }, svg)]));

    // the title (s3's place and type, the video's tag and "lower is better") | the readout (s3's: the key left of the
    // value, the key only from 400 px) or, at the end, the verdict in its place
    const hd = el('text', { class: 'hd', x: nar ? 14 : 22, y: nar ? 24 : 29 }, svg);
    const tt = el('tspan', { class: 'tt' }, hd), tg = el('tspan', { class: 'tg', dx: nar ? 5 : 7 }, hd), sb = el('tspan', { class: 'sb', dx: nar ? 7 : 10 }, hd);
    const ry = nar ? 25 : 30;
    const rv = el('text', { x: px1, y: ry, class: 'rv', 'text-anchor': 'end' }, svg), rk = el('text', { x: px1, y: ry, class: 'rk', 'text-anchor': 'end' }, svg);
    const vd = document.createElement('span'); vd.className = 'p5p-vd'; vd.textContent = run.verdict; lay.appendChild(vd);
    const tags = evs.map(e => { const t = document.createElement('span'); t.className = 'p5p-tag'; t.textContent = e.e.text; lay.appendChild(t); return t; });
    // widths, once: the value's (tabular digits, so one width per length), the key's, the title's parts, the verdict's
    const value = a => `${sec(a)} / ${sec(XM)}`;
    rv.textContent = value(0); const valW = rv.getComputedTextLength();
    rk.textContent = 'episode'; const keyW = rk.getComputedTextLength() + 10;
    const vdW = vd.offsetWidth, vdH = vd.offsetHeight;
    tt.textContent = S.title; const tW = tt.getComputedTextLength();
    tt.textContent = S.short; const shW = tt.getComputedTextLength();
    tg.textContent = S.tag; const tgW = S.tag ? tg.getComputedTextLength() + (nar ? 5 : 7) : 0;
    sb.textContent = S.sub; const sbW = sb.getComputedTextLength() + (nar ? 7 : 10);
    // fit: what the title and the readout need, dropping the least needed first (the key, "lower is better", the tag)
    const room = px1 - (nar ? 14 : 22) - (nar ? 10 : 16);
    const headW = p => (p.title ? tW : shW) + (p.tag ? tgW : 0) + (p.sub ? sbW : 0);
    const keyOk = W >= 400;                                // = s3: the smallest phones show the value alone
    const plans = [{ title: 1, tag: 1, sub: 1, key: keyOk }, { title: 1, tag: 1, sub: 1, key: 0 }, { title: 1, tag: 1, sub: 0, key: 0 },
      { title: 1, tag: 0, sub: 0, key: 0 }, { title: 0, tag: 1, sub: 0, key: 0 }, { title: 0, tag: 0, sub: 0, key: 0 }];
    const fit = plans.find(p => headW(p) + valW + (p.key ? keyW : 0) <= room) || plans[plans.length - 1];
    // at the end the verdict takes the readout's place: the title's parts it has no room for step back while it shows
    const dfit = [fit, { ...fit, sub: 0 }, { ...fit, sub: 0, tag: 0 }].find(p => headW(p) + vdW <= room) || { ...fit, sub: 0, tag: 0 };
    tt.textContent = fit.title ? S.title : S.short;
    if (!fit.tag || !S.tag) tg.remove(); else if (!dfit.tag) tg.classList.add('vh');
    if (!fit.sub) sb.remove(); else if (!dfit.sub) sb.classList.add('vh');
    if (fit.key) rk.setAttribute('x', (px1 - valW - 10).toFixed(1)); else rk.textContent = '';
    vd.style.right = `${W - px1}px`; vd.style.top = `${Math.round(ry - 5 - vdH / 2)}px`;
    // the dropped capsule: s3's offset from its line (10 px), in the plot's free middle (the dropped curve runs along
    // the top); to the line's left if the right has no room
    tags.forEach((t, i) => {
      const e = evs[i], w = t.offsetWidth, h = t.offsetHeight;
      if (e.x + 10 + w <= W - 8) { t.style.left = `${Math.round(e.x + 10)}px`; t.style.right = ''; } else { t.style.right = `${Math.round(W - e.x + 10)}px`; t.style.left = ''; }
      t.style.top = `${Math.round((py0 + py1) / 2 - h / 2 - 1)}px`;
    });
    G = { W, H, px0, px1, X, Yv, reveal, head, knobs, evs, tags, rv, rk, vd, lay, value, last: { rv: '', done: null } };
    lastU = NaN;
    if (fadeNext) { fadeNext = false; void getComputedStyle(lay).opacity; lay.classList.remove('enter'); }   // committed, then faded in
  }

  function draw(u) {
    if (!G || !run) return;
    if (u === lastU) return; lastU = u;
    const a = run.axisAt(u), x = G.X(a), xs = x.toFixed(1), Lt = G.last;
    // = s3.js drawBand: the reveal, the playhead, the knobs on the curve heads
    G.reveal.setAttribute('width', xs); G.head.setAttribute('x1', xs); G.head.setAttribute('x2', xs);
    for (const s of SIDES) { const k = G.knobs[s]; k.setAttribute('cx', xs); k.setAttribute('cy', G.Yv(run.val[s](a)).toFixed(1)); }
    const v = G.value(a);
    if (v !== Lt.rv) { Lt.rv = v; G.rv.textContent = v; }
    G.evs.forEach((e, i) => {
      const past = a >= e.e.a;
      if (past !== e.past) { e.past = past; e.line.classList.toggle('on', past); e.glow.classList.toggle('on', past); e.zone.classList.toggle('on', past); G.tags[i].classList.toggle('on', past); }
      if (past) e.zone.setAttribute('width', Math.max(0, x - e.x).toFixed(1));
    });
    const done = u >= run.L - 1e-3;                       // both runs done: the verdict
    if (done !== Lt.done) { Lt.done = done; G.lay.classList.toggle('done', done); }
  }

  // the page time under a pointer: the axis time there, then (SPIDER) the page time the episode first reaches it
  function uAt(clientX) {
    if (!G || !run) return 0;
    const r = host.getBoundingClientRect(), k = r.width ? G.W / r.width : 1;
    return run.uOf(clamp(((clientX - r.left) * k - G.px0) / (G.px1 - G.px0), 0, 1) * run.xmax);
  }

  function setRun({ kind, json, L }) {
    spec = SPEC[kind];
    run = kind === 'sp' ? prepSP(json, L) : prepDM(json, L);
    // the outgoing plot fades out under the incoming one (never a blank band between runs)
    const old = layer;
    if (old) { old.classList.add('out'); old.addEventListener('transitionend', e => { if (e.target === old) old.remove(); }); setTimeout(() => old.remove(), 700); layer = null; }
    fadeNext = !opts.instant;
    build();
    lastU = NaN;
  }

  function resize() {
    if (`${host.clientWidth}x${host.clientHeight}` === sizeKey && G) return false;
    const u = lastU; build(); if (!Number.isNaN(u)) draw(u);
    return true;
  }
  const ro = new ResizeObserver(() => { if (`${host.clientWidth}x${host.clientHeight}` !== sizeKey) resize(); });
  ro.observe(host);

  return { setRun, draw, uAt, resize, get L() { return run?.L ?? 0; }, destroy() { ro.disconnect(); root.remove(); } };
}
