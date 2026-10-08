// Section 5: the overview video's last results section as two compact live A/B players, one after the other: DexMachina
// (reference-guided RL; the Allegro box, the Schunk notebook) and SPIDER (sampling-based trajectory optimization; the
// Wuji with a pencil, a spoon). Each player's cards are the video's own 3D scenes (js/p5_3d.js, its own renderer),
// driven by the shown rollouts at their native rates on one clock; under them the live plot the video had (the object
// tracking error against the demonstration, the retargeting cost) and, folded away, the paper's result on every hand the
// method was run on (Fig. 5: both training setups at once; Fig. 6), the replay's hand marked.
import { glassify, pump } from './glass.js';
import { phone, engaged } from './stage.js';
import { quiet, breathe, yieldTask } from './idle.js';
import { LITE } from './lite.js';
import { buildHands } from './p5hands.js';
import { createPlot } from './p5plot.js';

const $ = (s, r = document) => r.querySelector(s);
const SIDES = ['js', 'ours'];
const DATA = new URL('../assets/s5/', import.meta.url).href;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const GLIDE = 'cubic-bezier(.45, 0, .2, 1)';
const KIND = {
  dm: { shots: ['box', 'notebook'], js: 'Joint\u2011Space', unit: 'error', title: 'Object tracking error', key: 'eg-orbit-demo-s5dm' },
  sp: { shots: ['pencil', 'spoon'], js: 'Joint\u2011Space', unit: 'cost', title: 'Retargeting cost', key: 'eg-orbit-demo-s5sp' },
};
const SHOT = {
  box: { kind: 'dm', label: 'Box', sub: 'Allegro', hand: 'allegro', task: 'box', data: 'dm_box', m: { js: 'jspace', ours: 'ours' } },
  notebook: { kind: 'dm', label: 'Notebook', sub: 'Schunk', hand: 'schunk', task: 'notebook', data: 'dm_notebook', m: { js: 'jspace', ours: 'ours' } },
  pencil: { kind: 'sp', label: 'Pencil', sub: 'Wuji', hand: 'wuji', data: 'sp_pencil', m: { js: 'iid', ours: 'pca' }, ymax: 0.2 },
  spoon: { kind: 'sp', label: 'Spoon', sub: 'Wuji', hand: 'wuji', data: 'sp_spoon', m: { js: 'iid', ours: 'pca' }, ymax: 0.08 },
};
let RES = null;

// ---------------------------------------------------------------- data (shared by both players)
const data = {};
function decode(meta, buf) {
  const out = {};
  for (const [name, Ly] of Object.entries(meta.layout)) {
    const n = Ly.shape.reduce((a, b) => a * b, 1), a = new Int16Array(buf, Ly.offset, n), f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = a[i] * Ly.step;
    out[name] = f; f.shape = Ly.shape;
  }
  return out;
}
function getData(id) {
  return (data[id] ??= Promise.all([fetch(`${DATA}data/${SHOT[id].data}.json`).then(r => r.json()), fetch(`${DATA}data/${SHOT[id].data}.bin`).then(r => r.arrayBuffer())])
    .then(([json, buf]) => ({ json, arr: decode(json, buf) })));
}
const lengthOf = (id, json) => SHOT[id].kind === 'dm' ? Math.max(...SIDES.map(s => json.methods[SHOT[id].m[s]].s_end)) / 60 : json.frames.length / json.fps;

// ---------------------------------------------------------------- one player
function player(blk) {
  const kind = blk.dataset.kind, K = KIND[kind];
  const q = s => blk.querySelector(s);
  const st = { shot: K.shots[0], u: 0, playing: false, ended: false, dragging: false, visible: false, speed: 0.5 };
  const cards = q('.h-stage'), cardEl = {}, tr = {};
  for (const s of SIDES) cardEl[s] = q(`.t-card[data-side="${s}"]`);
  Object.assign(tr, { pw: q('.h-band'), play: q('.h-play') });
  let L = 1, D = null, R3 = null, r3Loading = null, token = 0;

  // ---- the band: section 3's plot band with the video's slab content (js/p5plot.js); its time axis is the scrubber.
  // SPIDER's axis is the episode's time: while it samples, the playhead holds
  const host = q('.h-pw'); host.innerHTML = '';
  const plot = createPlot(host);
  function buildPlot() { plot.setRun({ kind, json: D.json, L }); plot.draw(st.u); }
  function drawPlot() { plot.draw(st.u); }
  function updateTransport() {
    const p = clamp(st.u / L, 0, 1);
    tr.pw.setAttribute('aria-valuenow', Math.round(p * 100));
    tr.play.classList.toggle('playing', st.playing); tr.play.classList.toggle('ended', !st.playing && st.ended);
    tr.play.setAttribute('aria-label', st.playing ? 'Pause' : st.ended ? 'Replay' : 'Play');
  }

  // ---- the fold-out's content: the paper's result on every hand (js/p5hands.js: Fig. 5 with both training setups at
  // once, or Fig. 6), the replay's hand ringed
  let hands = null;
  function buildRow() { hands = buildHands(q('.h-paper .t-paper-in'), { kind, results: RES, task: SHOT[st.shot].task, hand: SHOT[st.shot].hand }); }
  function updateRow() { hands?.update({ task: SHOT[st.shot].task, hand: SHOT[st.shot].hand }); }
  // the fold-out, opened as sections 3 and 4 open their paper figures: a glide, its spacing inside it (nothing snaps)
  function setupMore() {
    const more = q('.h-more'), paper = q('.h-paper');
    let panim = null;
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', open);
      const h0 = paper.hidden ? 0 : paper.getBoundingClientRect().height;
      panim?.cancel();
      if (open) {
        const m0 = paper.hidden ? 0 : parseFloat(getComputedStyle(paper).marginTop) || 0;
        paper.hidden = false; paper.style.overflow = 'hidden';
        paper.style.height = ''; const h1 = paper.scrollHeight;
        panim = paper.animate([{ height: `${h0}px`, marginTop: `${m0}px`, opacity: 0.2 }, { height: `${h1}px`, marginTop: '12px', opacity: 1 }], { duration: reduced ? 0 : clamp(h1 * 1.1, 380, 620), easing: GLIDE });
        paper.style.marginTop = '12px';
        panim.onfinish = () => { panim = null; paper.style.overflow = ''; };
      } else {
        paper.style.overflow = 'hidden';
        panim = paper.animate([{ height: `${h0}px`, marginTop: '12px', opacity: 1 }, { height: '0px', marginTop: '0px', opacity: 0 }], { duration: reduced ? 0 : clamp(h0 * 1.0, 340, 560), easing: GLIDE });
        panim.onfinish = () => { panim = null; paper.hidden = true; paper.style.overflow = ''; paper.style.marginTop = '0px'; };
      }
    });
  }

  // ---- shots
  function shotSeg() { q('.h-shot').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.shot === st.shot)); }
  async function show(id, { play = true } = {}) {
    const my = ++token;
    st.shot = id; shotSeg(); updateRow();
    const d = await getData(id); if (my !== token) return;
    D = d; L = lengthOf(id, d.json); st.u = 0; st.ended = false; st.playing = play && !reduced && st.visible;
    buildPlot(); updateTransport();
    if (R3?.shot) {
      snapshot();
      await R3.setShot(id, d); if (my !== token) return;
      R3.render(st.u, true); releaseSnap();
    }
  }
  // the outgoing picture held until the new shot has drawn its first frame, then let go (never a blank card)
  function snapshot() {
    const c = q('.h-snap'), src = q('.h-canvas');
    if (!cards.classList.contains('ready')) return;
    const Dp = Math.min(devicePixelRatio || 1, 2); c.width = Math.round(src.clientWidth * Dp); c.height = Math.round(src.clientHeight * Dp);
    R3.render(st.u, true);
    try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); } catch { return; }
    Object.assign(c.style, { transition: 'none', opacity: 1 }); void getComputedStyle(c).opacity;
  }
  function releaseSnap() {
    const c = q('.h-snap'); if (c.style.opacity !== '1') return;
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = 'opacity .3s ease'; c.style.opacity = 0; }));
  }

  // ---- 3D (its own renderer): the shown shot first, its programs compiled before it shows; the other shot quietly
  async function start3d() {
    if (r3Loading) return r3Loading;
    r3Loading = (async () => {
      try {
        const m = await import('./p5_3d.js');
        m.loadModels(st.shot).catch(() => {}); getData(st.shot);      // the downloads start now: only the build waits
        R3 = await m.createP5(q('.h-canvas'), cards, { mobile: phone(), key: K.key });
      } catch (e) { console.error('section 5 3D', e); cards.classList.add('failed'); return; }
      R3.onChange(o => q('.h-reset').classList.toggle('on', o));
      let id = st.shot, d = await getData(id);
      // the reader is at the stage: build at once (a task's yield); still on the way there: in a quiet moment
      const r = cards.getBoundingClientRect();
      await (r.bottom > -200 && r.top < innerHeight + 200 ? yieldTask() : breathe());
      await R3.setShot(id, d);
      if (st.shot !== id) { id = st.shot; d = await getData(id); await R3.setShot(id, d); }   // switched while it loaded
      clipKey = ''; maskCanvas(); R3.render(st.u, true); paintStudio();
      requestAnimationFrame(() => cards.classList.add('ready'));
      R3.peek(performance.now() + 1200);
    })();
    return r3Loading;
  }
  // the other task, once both players show theirs (js: init), so it never shares the bandwidth with a shot on screen
  function prepareRest() {
    if (LITE || !R3) return;
    for (const o of K.shots) if (o !== st.shot) quiet(async () => { try { await R3.prepare(o, await getData(o)); } catch (e) { console.error('section 5 shot', o, e); } }, { after: 800 });
  }

  // ---- wiring
  q('.h-shot').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.shot !== st.shot) { R3?.stopDemo(); show(b.dataset.shot); } });
  q('.h-speed').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.speed = +b.dataset.speed; q('.h-speed').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  q('.h-reset').addEventListener('click', () => R3?.reset());
  tr.play.addEventListener('click', () => {
    if (st.playing) st.playing = false;
    else { if (st.ended || st.u >= L - 1e-3) st.u = 0; st.ended = false; st.playing = true; }
  });
  const scrubTo = x => { st.u = clamp(plot.uAt(x), 0, L); st.ended = false; };
  let wasPlaying = false;
  tr.pw.addEventListener('pointerdown', e => { tr.pw.setPointerCapture(e.pointerId); st.dragging = true; wasPlaying = st.playing; scrubTo(e.clientX); });
  tr.pw.addEventListener('pointermove', e => { if (st.dragging) scrubTo(e.clientX); });
  const endDrag = () => { if (!st.dragging) return; st.dragging = false; st.playing = wasPlaying && st.u < L; };
  tr.pw.addEventListener('pointerup', endDrag); tr.pw.addEventListener('pointercancel', endDrag);
  tr.pw.addEventListener('keydown', e => {
    const d = { ArrowLeft: -0.25, ArrowRight: 0.25, ArrowDown: -0.25, ArrowUp: 0.25 }[e.key];
    if (d != null) { st.u = clamp(st.u + d, 0, L); e.preventDefault(); }
    else if (e.key === 'Home') { st.u = 0; e.preventDefault(); }
    else if (e.key === 'End') { st.u = L; e.preventDefault(); }
    else if (e.key === ' ') { tr.play.click(); e.preventDefault(); }
  });
  setupMore();
  let played = false;
  function checkVisible() {
    const vis = engaged(cards, st.visible); if (vis === st.visible) return;
    st.visible = vis;
    if (vis && !played && !reduced && D) { played = true; st.playing = true; }
  }
  let rk = '';
  // the cards' shapes (section 3's clip): the canvas and the outgoing still draw only inside the two rounded cards
  let clipKey = '';
  function maskCanvas() {
    const sr = cards.getBoundingClientRect(); if (!sr.width) return;
    if (SIDES.some(s => cardEl[s].offsetHeight < 8)) return;          // not laid out yet: the observer calls again
    const parts = SIDES.map(s => { const r = cardEl[s].getBoundingClientRect(), x = r.left - sr.left, y = r.top - sr.top, w = r.width, h = r.height;
      const k = Math.min(parseFloat(getComputedStyle(cardEl[s]).borderTopLeftRadius) || 22, w / 2, h / 2);
      return `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`; }).join('');
    if (parts === clipKey) return; clipKey = parts;
    for (const el of [q('.h-canvas'), q('.h-snap')]) el.style.clipPath = `path('${parts}')`;
  }
  // the page is the studio (as section 3): the gradient the render shows at the card edges, sampled once from the
  // player's default task, painted behind the stage across the page; the bleeds take its top and floor colours. It does
  // not change with the task
  let painted = false, paintGen = 0;
  async function paintStudio() {
    const layer = blk.querySelector('.h-bg');
    layer.style.setProperty('--stTop', `${Math.round(cards.offsetTop)}px`); layer.style.setProperty('--stH', `${Math.round(cards.offsetHeight)}px`);
    if (painted || st.shot !== K.shots[0] || !R3?.shot || R3.shot !== K.shots[0]) return;
    // the default frame is drawn and its pixels queued, then the reader's frame is put straight back (the pixels were
    // copied in GPU order, so the redraw does not change them); a re-layout meanwhile makes this sample stale
    const gen = ++paintGen, pending = R3.sampleEdges(0);
    R3.render(st.u, true);
    const stops = await pending;
    if (!stops || gen !== paintGen || painted) return;
    painted = true;
    const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`, N = stops.length, tg = `linear-gradient(180deg, ${stops.map((c, i) => `${rgb(c)} ${(i / (N - 1) * 100).toFixed(1)}%`).join(', ')})`;
    layer.style.setProperty('--tg', tg); for (const s of SIDES) cardEl[s].style.setProperty('--tg', tg);
    const root = document.documentElement.style, k = kind === 'dm' ? 'dm' : 'sp';
    root.setProperty(`--${k}Top`, rgb(stops[0])); root.setProperty(`--${k}Bot`, rgb(stops[N - 1]));
  }
  const relayout = () => { clipKey = ''; maskCanvas(); R3?.invalidate(); if (R3?.shot) requestAnimationFrame(() => { painted = false; paintStudio(); }); };
  const ro = new ResizeObserver(() => { const k = SIDES.map(s => `${cardEl[s].offsetWidth}x${cardEl[s].offsetHeight}`).join('|'); if (k !== rk) { rk = k; relayout(); } });
  [cards, ...SIDES.map(s => cardEl[s])].forEach(e => ro.observe(e));
  let last3d = 0, drawnU = NaN;
  function tick(now, dt) {
    checkVisible();
    if (st.visible && st.playing && !st.dragging) { st.u += dt * (kind === 'sp' ? st.speed / 0.5 : st.speed); if (st.u >= L) { st.u = L; st.playing = false; st.ended = true; } }   // SPIDER: the video's clock ran its episode at 0.5x
    // the band follows a drag or a key even while the cards are scrolled away (the 3D waits for them)
    if (st.visible || st.u !== drawnU) { drawnU = st.u; if (D) drawPlot(); updateTransport(); }
    if (!st.visible) return;
    if (R3 && now - last3d > 12.5) {
      last3d = now;
      R3.render(st.u);
    }
  }
  return { st, tick, show, start3d, prepareRest, buildRow, relayout, get L() { return L; }, get R3() { return R3; }, blk };
}

// ---------------------------------------------------------------- init
export async function init() {
  RES = await fetch(`${DATA}results.json`).then(r => r.json());
  const P = [...document.querySelectorAll('.s5 .h-blk')].map(player);
  // each player's 3D quietly, the first one first, then the other tasks; coming near one starts it at once. Set up
  // before any data wait, so DexMachina never waits for SPIDER's
  quiet(() => P[0].start3d().then(() => LITE || quiet(() => P[1].start3d().then(() => P.forEach(p => p.prepareRest())), { after: 800 })), { after: 200 });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) P.find(p => p.blk === e.target)?.start3d(); }), { rootMargin: '400px 0px' });
  P.forEach(p => io.observe(p.blk));
  P.forEach(p => p.buildRow());
  await Promise.all(P.map(p => p.show(p.st.shot, { play: false })));
  window.__s5 = { P, dm: P[0], sp: P[1], data };
  // the studios' blends: one gradient from DexMachina's stage to SPIDER's, one from SPIDER's stage into the footer,
  // each element it crosses given its slice (css .s5 .h-bg, .bleed.b5m.span, .bleed.b5f.span)
  const sec = $('.s5'), b5m = $('.bleed.b5m'), b5f = $('.bleed.b5f'), foot = $('.foot');
  b5m?.classList.add('span'); b5f?.classList.add('span');
  const els = [...sec.querySelectorAll('.h-bg'), b5m, b5f].filter(Boolean), was = new Map();
  function diffuse() {
    const st = P.map(p => p.blk.querySelector('.h-stage').getBoundingClientRect()), ft = foot?.getBoundingClientRect();
    if (!st[0].height || !st[1].height) return;
    const s1 = [st[0].bottom, st[1].top - st[0].bottom], s2 = [st[1].bottom, (ft ? ft.top : st[1].bottom + 400) - st[1].bottom];
    for (const el of els) {
      const r = el.getBoundingClientRect(), v = [s1[0] - r.top, s1[1], s2[0] - r.top, s2[1]].map(x => `${Math.round(x)}px`), k = v.join();
      if (was.get(el) === k) continue;                         // unchanged: no style write, no repaint
      was.set(el, k);
      ['--s1y', '--s1h', '--s2y', '--s2h'].forEach((n, i) => el.style.setProperty(n, v[i]));
    }
  }
  diffuse();
  new ResizeObserver(diffuse).observe(sec);                  // before the frame paints: the slices never lag a frame behind
  sec.addEventListener('stagefit', () => requestAnimationFrame(diffuse));
  $('.s5').addEventListener('stagefit', () => P.forEach(p => p.relayout()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) P.forEach(p => { p.st.visible = false; }); });
  let last = performance.now(), lastTick = 0;
  const tick = now => { lastTick = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; P.forEach(p => p.tick(now, dt)); };
  const frame = now => { requestAnimationFrame(frame); tick(now); };
  requestAnimationFrame(frame);
  pump(() => lastTick, tick);
  glassify(document);
}
