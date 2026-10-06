// The paper's Fig. 3 (SimToolReal) under the training band, drawn like the band itself (dark glass, glowing curves, glass
// bars): all four methods, the figure's own numbers (site_lab/tools/export_fig3_web.py). The same charts draw the
// paper's Fig. 4 (DeXtreme in simulation, site_lab/tools/export_fig4_web.py) on section 4's light page (initFig4). (a) Early training, 9B frames:
// mean consecutive successes with 95% CIs, reward with +/-1 SE across seeds. (b) The extended run with the
// success-tolerance curriculum, one median run per method. Tap a method to bring it forward; move along a plot to read
// every method's value there. Phones: one header row, one legend row, each panel's bars and curves side by side.
// The charts are painted once on canvases (vector charts would be rasterised bit by bit while the panel opens, which
// stutters); only the read-out (a line and four dots) is live SVG.
const M = ['jabs', 'eajr', 'jaer', 'ours'];
const SHORT = { jabs: 'Joint', eajr: 'Eigen', jaer: 'Residual', ours: 'Ours' };
const NS = 'http://www.w3.org/2000/svg';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const k = v => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`);
const narrow = () => document.documentElement.clientWidth < 760;

// the figure's numbers, fetched once (s3.js asks for them in a quiet moment, so the first opening only draws)
let data = null, data4 = null;
export const loadFig3 = () => (data ??= fetch(new URL('../assets/s3/fig3.json', import.meta.url)).then(r => r.json()));
export const loadFig4 = () => (data4 ??= fetch(new URL('../assets/s4/fig4.json', import.meta.url)).then(r => r.json()));
// ink on the dark band (section 3) or on the light page (section 4)
const DARK = { ink: a => `rgba(255,255,255,${a})`, rim: 'rgba(255,255,255,.28)', whisker: 'rgba(255,255,255,.85)', band: 0.18, glow: 0.2 };
const LIGHT = { ink: a => `rgba(29,29,31,${Math.min(1, a * 1.02)})`, rim: 'rgba(255,255,255,.55)', whisker: 'rgba(29,29,31,.7)', band: 0.2, glow: 0.16 };

export async function initFig3(box) {
  const D = await loadFig3();
  panel(box, D, DARK, () => `
    <div class="f3-head"><h3>All four methods · SimToolReal</h3>
      <div class="f3-legend" role="group" aria-label="Methods">${legendHTML(D)}</div></div>
    <div class="f3-groups">
      <section class="f3-g" data-g="a"><h4><b>(a)</b> Early training · 9B<span class="l"> frames, across seeds</span></h4><div class="f3-row"><div class="f3-c bars" role="img" aria-label="Mean consecutive successes at 9B frames: ${M.map(m => `${D.names[m]} ${D.a.bars[m].mean.toFixed(1)}`).join(', ')}"></div><div class="f3-c lines" role="img" aria-label="Reward over the first 9B frames, mean and standard error across seeds"></div></div></section>
      <section class="f3-g" data-g="b"><h4><b>(b)</b> Extended run<span class="l"> · with curriculum</span><span class="s"> · curriculum</span></h4><div class="f3-row"><div class="f3-c bars" role="img" aria-label="Consecutive successes of the median runs (each run's highest): ${M.map(m => `${D.names[m]} ${D.b.bars[m].toFixed(1)}`).join(', ')}"></div><div class="f3-c lines" role="img" aria-label="Reward of the median runs from 10B to 60B frames"></div></div></section>
    </div>
    <p class="f3-cap"><span class="l">Left: mean over seeds, 95% CIs and ±1 SE shading. Right: one median run per method with a success-tolerance curriculum, the runs replayed above.</span><span class="s">Left: mean over seeds, 95% CIs, ±1 SE. Right: one median run per method, replayed above.</span></p>`,
  ({ bars, lines }, nar) => {
    const [ga, gb] = box.querySelectorAll('.f3-g');
    return [
      bars(ga.querySelector('.bars'), Object.fromEntries(M.map(m => [m, D.a.bars[m].mean])), 12, [0, 4, 8, 12], nar ? 'Successes ↑' : 'Consecutive successes ↑', Object.fromEntries(M.map(m => [m, D.a.bars[m].ci]))),
      lines(ga.querySelector('.lines'), D.a.curves, { ymax: 12000, yt: [0, 4000, 8000, 12000], title: 'Reward ↑', xt: [0, 3, 6, 9], x0: 0, x1: 9 }),
      bars(gb.querySelector('.bars'), D.b.bars, 15, [0, 5, 10, 15], nar ? 'Successes ↑' : 'Consecutive successes ↑'),     // as the paper labels it
      lines(gb.querySelector('.lines'), D.b.curves, { ymax: 15000, yt: [0, 5000, 10000, 15000], title: 'Reward ↑', xt: nar ? [10, 30, 60] : [10, 20, 30, 40, 50, 60], x0: 10, x1: 60 }),
    ];
  });
}

// The paper's Fig. 4: DeXtreme in simulation, mean consecutive successes over the selected seeds (95% CIs) and how
// far each method gets through the domain-randomization curriculum (NPD, mean +/- 1 SE) over 2B frames.
export async function initFig4(box) {
  const D = await loadFig4();
  panel(box, D, LIGHT, () => `
    <div class="f3-head"><h3>All four methods · DeXtreme in simulation</h3>
      <div class="f3-legend" role="group" aria-label="Methods">${legendHTML(D)}</div></div>
    <div class="f3-groups one">
      <section class="f3-g" data-g="a"><div class="f3-row"><div class="f3-c bars" role="img" aria-label="Mean consecutive successes: ${M.map(m => `${D.names[m]} ${D.bars[m].mean.toFixed(1)}`).join(', ')}"></div><div class="f3-c lines" role="img" aria-label="Domain randomization level (NPD) over 2B frames, mean and standard error across seeds"></div></div></section>
    </div>
    <p class="f3-cap"><span class="l">Five seeds per method, 2B frames each with automatic domain randomization. Left: mean consecutive successes under shared randomization, with 95% confidence intervals. Right: the randomization level each method reaches (nats per dimension, higher is further along), ±1 standard error.</span><span class="s">Five seeds, 2B frames. Left: mean successes, 95% CIs. Right: randomization level reached (NPD), ±1 SE.</span></p>`,
  ({ bars, lines }, nar) => {
    const g = box.querySelector('.f3-g');
    return [
      bars(g.querySelector('.bars'), Object.fromEntries(M.map(m => [m, D.bars[m].mean])), 16, [0, 4, 8, 12, 16], nar ? 'Successes ↑' : 'Consecutive successes ↑', Object.fromEntries(M.map(m => [m, D.bars[m].ci]))),
      lines(g.querySelector('.lines'), D.curves, { ymin: -3.2, ymax: -0.5, yt: [-3, -2, -1], title: nar ? 'DR level (NPD) ↑' : 'Domain randomization level (NPD) ↑', xt: [0, 0.5, 1, 1.5, 2], x0: 0, x1: 2, fmt: v => v.toFixed(2).replace('-', '−') }),
    ];
  });
}

const legendHTML = D => M.map(m => `<button type="button" data-m="${m}" aria-pressed="false" style="--c:${D.colors[m]}"><i></i><span class="l">${D.names[m]}</span><span class="s">${SHORT[m]}</span></button>`).join('');

// one panel: its legend (tap a method to bring it forward), its charts on canvases, the live read-out, repainted on a
// width change
function panel(box, D, TH, html, makePainters) {
  const FONT = getComputedStyle(document.body).fontFamily;
  box.innerHTML = html();
  let focus = null;
  const legend = [...box.querySelectorAll('.f3-legend button')];
  legend.forEach(b => b.addEventListener('click', () => { focus = focus === b.dataset.m ? null : b.dataset.m; legend.forEach(x => x.setAttribute('aria-pressed', x.dataset.m === focus)); paint(); }));
  const alphaOf = m => (focus && focus !== m ? 0.16 : 1);
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

  // a chart's canvas, its scales and its axes (title, grid, tick labels)
  function frame(host, { ymax, ymin = 0, yt, title, xt, x0, x1, bars }) {
    host.textContent = '';
    const nar = narrow(), W = host.clientWidth, H = host.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const cv = document.createElement('canvas'); cv.className = 'f3-cv'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); host.appendChild(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const L = nar ? 24 : 32, R = 6, T = nar ? 17 : 22, B = bars ? (nar ? 15 : 19) : (nar ? 15 : 20);
    const X = x0 == null ? null : v => L + (W - L - R) * (v - x0) / (x1 - x0), Y = v => H - B - (H - B - T) * (clamp(v, ymin, ymax) - ymin) / (ymax - ymin);
    const axes = () => {
      g.clearRect(0, 0, W, H);
      g.font = `600 ${nar ? 10.5 : 12}px ${FONT}`; g.fillStyle = TH.ink(.82); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText(title, 0, nar ? 10 : 12);
      g.font = `500 ${nar ? 9.5 : 11}px ${FONT}`; g.textAlign = 'right';
      for (const v of yt) { g.fillStyle = v === ymin ? TH.ink(.3) : TH.ink(.08); g.fillRect(L, Math.round(Y(v)) - 0.5, W - R - L, 1); g.fillStyle = TH.ink(.5); g.fillText(k(v).replace('-', '−'), L - 5, Y(v) + 3.5); }
      if (X) for (const v of xt) {                           // the last label ends at the edge (a canvas clips what overflows)
        g.fillStyle = TH.ink(.3); g.fillRect(Math.round(X(v)) - 0.5, H - B, 1, 3); g.fillStyle = TH.ink(.5);
        const t = v ? `${v}B` : '0', w = g.measureText(t).width; g.textAlign = 'left'; g.fillText(t, Math.min(X(v) - w / 2, W - w), H - B + (nar ? 12 : 15));
      }
    };
    return { host, cv, g, W, H, L, R, T, B, X, Y, nar, axes };
  }
  // glass bars: the colour lit from above, a bright rim, the CI whisker, the value under it
  function bars(host, vals, ymax, yt, title, ci) {
    const f = frame(host, { ymax, yt, title, bars: true }), n = M.length, slot = (f.W - f.L - f.R) / n, bw = Math.min(f.nar ? 18 : 26, slot * 0.58), g = f.g;
    return () => {
      f.axes();
      M.forEach((m, i) => {
        g.globalAlpha = alphaOf(m);
        const cx = f.L + slot * (i + 0.5), v = vals[m], y = f.Y(v), h = f.Y(0) - y, r = Math.min(5, bw / 3);
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(D.colors[m], 1)); gr.addColorStop(1, rgba(D.colors[m], 0.55));
        g.fillStyle = gr; g.beginPath(); g.roundRect(cx - bw / 2, y, bw, h, r); g.fill();
        g.strokeStyle = TH.rim; g.lineWidth = 1; g.beginPath(); g.roundRect(cx - bw / 2 + 1, y + 1, bw - 2, Math.max(0, h - 2), Math.max(0, r - 1)); g.stroke();
        if (ci?.[m]) { const [lo, hi] = ci[m]; g.strokeStyle = TH.whisker; g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx, f.Y(lo)); g.lineTo(cx, f.Y(hi)); g.moveTo(cx - 4, f.Y(lo)); g.lineTo(cx + 4, f.Y(lo)); g.moveTo(cx - 4, f.Y(hi)); g.lineTo(cx + 4, f.Y(hi)); g.stroke(); }
        g.font = `650 ${f.nar ? 9.5 : 11}px ${FONT}`; g.textAlign = 'center'; g.fillStyle = TH.ink(.88); g.fillText(v.toFixed(1), cx, f.H - (f.nar ? 4 : 5));
      });
      g.globalAlpha = 1;
    };
  }
  // glowing curves over a soft band (as the training band draws them), and the live read-out over the canvas
  function lines(host, cur, opt) {
    const f = frame(host, opt), g = f.g;
    const draw = () => {
      f.axes();
      for (const m of M) {
        const c = cur[m], ys = c.mean || c.y; g.globalAlpha = alphaOf(m);
        if (c.lo) { g.beginPath(); c.x.forEach((x, i) => g.lineTo(f.X(x), f.Y(c.hi[i]))); for (let i = c.x.length - 1; i >= 0; i--) g.lineTo(f.X(c.x[i]), f.Y(c.lo[i])); g.closePath(); g.fillStyle = rgba(D.colors[m], TH.band); g.fill(); }
        g.beginPath(); c.x.forEach((x, i) => g.lineTo(f.X(x), f.Y(ys[i]))); g.lineJoin = g.lineCap = 'round';
        g.strokeStyle = rgba(D.colors[m], TH.glow); g.lineWidth = 6; g.stroke();
        g.strokeStyle = D.colors[m]; g.lineWidth = 1.8; g.stroke();
      }
      g.globalAlpha = 1;
    };
    const ov = document.createElementNS(NS, 'svg'); ov.setAttribute('class', 'f3-ov'); ov.setAttribute('viewBox', `0 0 ${f.W} ${f.H}`); host.appendChild(ov);
    const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const key in a) e.setAttribute(key, a[key]); ov.appendChild(e); return e; };
    const rule = mk('line', { y1: f.T, y2: f.H - f.B, class: 'f3-rule' }), dots = M.map(m => mk('circle', { r: 3.5, fill: D.colors[m], class: 'f3-dot' }));
    const tip = document.createElement('div'); tip.className = 'f3-tip'; host.appendChild(tip);
    const at = (c, x) => { const xs = c.x, ys = c.mean || c.y; if (x < xs[0] || x > xs[xs.length - 1]) return null; let i = 1; while (i < xs.length - 1 && xs[i] < x) i++; const u = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + (ys[i] - ys[i - 1]) * clamp(u, 0, 1); };
    const show = e => {
      const r = ov.getBoundingClientRect(), px = clamp(e.clientX - r.left, f.L, f.W - f.R), x = opt.x0 + (px - f.L) / (f.W - f.L - f.R) * (opt.x1 - opt.x0);
      rule.setAttribute('x1', px); rule.setAttribute('x2', px); host.classList.add('reading');
      const rows = M.map((m, i) => { const v = at(cur[m], x); if (v == null) { dots[i].setAttribute('r', 0); return ''; } dots[i].setAttribute('r', 3.5); dots[i].setAttribute('cx', px); dots[i].setAttribute('cy', f.Y(v)); return `<span style="--c:${D.colors[m]}"><i></i>${(opt.fmt || (x => Math.round(x).toLocaleString('en-US')))(v)}</span>`; });
      tip.innerHTML = `<b>${x.toFixed(1)}B</b>${rows.join('')}`;
      const tw = tip.offsetWidth; tip.style.left = `${px + 10 + tw > f.W ? px - 10 - tw : px + 10}px`;      // stays inside the chart
    };
    ov.addEventListener('pointermove', show); ov.addEventListener('pointerdown', show); ov.addEventListener('pointerleave', () => host.classList.remove('reading'));
    return draw;
  }
  let painters = [];
  function build() { painters = makePainters({ bars, lines }, narrow()); paint(); }
  const paint = () => painters.forEach(p => p());
  build();
  let lastW = innerWidth; addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; build(); } });
}
