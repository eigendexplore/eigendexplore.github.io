// Figure 1 of the paper, alive. The panels are the figure's own drawing (tools/export_fig1_web.py runs the paper's
// generator: the seed-47 sample clouds, the hand renders, every layout constant). When the row comes into view each
// panel builds itself in the order you would read it: the axes, the command, the noise samples falling in one by one,
// the hands at their sample points (Eigen-Residual: its sum, piece by piece), then the verdict. Afterwards a fresh
// sample keeps lighting up in each cloud. The hands are rendered live in 3D (fig1hands.js).
import { engaged } from './stage.js';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function initFig1() {
  const root = document.getElementById('fig1');
  if (!root) return;
  const panels = await fetch('assets/fig1/panels.json').then(r => r.json());
  const figs = [...root.querySelectorAll('.f1p')];
  figs.forEach(fig => { fig.querySelector('.f1-svg').innerHTML = panels[fig.dataset.k]; });
  import('./fig1hands.js').then(m => m.initHands3d(root)).catch(e => console.error('fig 1 hands', e));   // the hands, live (the PNGs until then)
  // narrow screens: each plot is cropped to the plot frame and its hands (the header and verdict are HTML beside it)
  const crop = () => {
    const narrow = document.documentElement.clientWidth < 760;
    figs.forEach(f => {
      const svg = f.querySelector('.f1-svg svg'); svg._vb ??= svg.getAttribute('viewBox');
      if (!narrow) { svg.setAttribute('viewBox', svg._vb); return; }
      svg.setAttribute('viewBox', svg._vb);
      const R = svg.getBoundingClientRect(), [vx, vy, vw] = svg._vb.split(' ').map(Number), k = vw / R.width;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      svg.querySelectorAll('.axes path:not([aria-label]), .callout .hand, .callout .mk, .res-hand, .op, .cmd').forEach(e => {
        const r = e.getBoundingClientRect(); if (!r.width && !r.height) return;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      });
      // a margin that keeps the axis arrowheads (markers, outside the paths' bounds) whole: left/top 7, right 10, bottom 2
      const L = 7, T = 9, Rm = 11, B = 2;
      svg.setAttribute('viewBox', `${(vx + (x0 - R.left) * k - L).toFixed(1)} ${(vy + (y0 - R.top) * k - T).toFixed(1)} ${((x1 - x0) * k + L + Rm).toFixed(1)} ${((y1 - y0) * k + T + B).toFixed(1)}`);
    });
  };
  crop(); let lastW = innerWidth; addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; crop(); } });
  if (reduced) return;
  root.classList.add('anim');
  const io = new IntersectionObserver(() => {
    if (!engaged(root.querySelector('.fig1-grid'), false)) return;   // most of the row on screen (js/stage.js)
    io.disconnect();
    figs.forEach((f, i) => setTimeout(() => f.classList.add('go'), i * 70));
    setTimeout(() => { figs.forEach(f => f.classList.add('done')); spark(figs); }, 600 + figs.length * 70);
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
  io.observe(root.querySelector('.fig1-grid'));
}

// after the entrance: one sample at a time lights up, cycling through the clouds, like fresh draws of the noise. Only while
// the row is on screen, and as a Web Animation (restarting a CSS animation needs a forced layout every time)
const SPARK = [{ transform: 'scale(1)', easing: 'ease-out' }, { transform: 'scale(2.8)', offset: 0.28, easing: 'ease-out' }, { transform: 'scale(1)' }];
function spark(figs) {
  const clouds = figs.map(f => [...f.querySelectorAll('.cloud circle')]).filter(c => c.length);
  let k = 0, onScreen = true;
  new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }).observe(figs[0].parentElement);
  setInterval(() => {
    if (document.hidden || !onScreen) return;
    const cs = clouds[k++ % clouds.length], c = cs[Math.floor(Math.random() * cs.length)];
    c.animate(SPARK, { duration: 900 });
  }, 260);
}
