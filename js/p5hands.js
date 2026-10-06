// Section 5's fold-outs: the result on every hand the method was run on, redrawn as one compact panel in the band's dark
// glass (the family of js/fig3panel.js). DexMachina: per hand, both training setups at once, "Task reward only" (as in
// the replay) and "+ Curriculum" (with the curriculum and helper rewards), mean ADD-AUC with 95% CIs, for the task the
// player shows. SPIDER: per hand, the retargeting cost of both methods, each hand drawn relative to its own Joint-Space
// cost (every hand has its own scale), and a "Δ cost" ribbon. The replay's hand is ringed. The hands (assets/s5/hands)
// are rendered in the video's own scene and look (113's stage, AgX MHC), transparent, at one physical scale and one camera
// for all six (real007 /local/real/harshgup/scratch/handthumbs: handthumbs.py, compose.py).
// Phones show both panels in one format: one row of hand columns, the bars on top, the hand under them, its name and DoF,
// then a ribbon (SPIDER: the cost saved per hand. DexMachina: EigenDEXplore's gain under each setup's pair, the two
// setups named once in a small key under the legend).
//
//   const panel = buildHands(container, { kind: 'dm' | 'sp', results, task: 'box' | 'notebook', hand: 'allegro' });
//   panel.update({ task, hand });     // bars and numbers glide to the new task, the ring moves to the new hand
//
// Plain DOM bars (a few flat boxes: cheap to raster while the fold-out opens); their sizes are percentages of fixed
// heights, so the panel lays out the same while it is still hidden and needs nothing on resize. Styles: css/s5hands.css.
const COL = { js: '#7098b7', ours: '#e1b84e' };
const COL2 = { js: 'rgba(112, 152, 183, .55)', ours: 'rgba(225, 184, 78, .55)' };     // a glass bar's foot (lit from above, as section 3's paper panel)
const NAME = { js: ['Joint‑Space', 'Joint‑Space'], ours: ['EigenDEXplore', 'Ours'] };   // (a non-breaking hyphen)
const SETUP = { objdex: ['Task reward only', 'Task only'], full: ['+ Curriculum', '+ Curric.'] };
const SETUP_ARIA = { objdex: 'Task reward only', full: 'With curriculum and helper rewards' };
const M = ['js', 'ours'];
const DUR = 550;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// a ribbon number's ink: white to gold the larger the gain (u in [0, 1]), a loss in dim grey
const inkOf = u => u < 0 ? 'rgba(255, 255, 255, .5)'
  : `rgb(${[205, 205, 210].map((w, j) => Math.round(w + ([236, 200, 101][j] - w) * clamp(u, 0, 1))).join(', ')})`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pct = x => `${(clamp(x, 0, 1) * 100).toFixed(3)}%`;

// cubic-bezier(.45, 0, .2, 1), the page's glide, for the numbers (the bars use the same curve in CSS)
const EASE = (() => {
  const x1 = 0.45, y1 = 0, x2 = 0.2, y2 = 1;
  const f = (t, a, b) => ((1 - 3 * b + 3 * a) * t * t + (3 * b - 6 * a) * t + 3 * a) * t;
  return x => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = f(t, x1, x2); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return f(t, y1, y2);
  };
})();

export function buildHands(container, { kind, results: R, task = 'box', hand = null }) {
  const dm = kind === 'dm';
  const hands = R.hands.filter(h => !dm || R.dexmachina[h.id]);
  const conds = dm ? ['objdex', 'full'] : ['all'];
  const YMAX = dm ? 1 : 1.25;                                  // SPIDER: relative to the baseline (1), its CIs reach 1.21
  const GRID = dm ? [0.25, 0.5, 0.75, 1] : [0.5, 1];
  const TICK = dm ? [[0, '0'], [0.5, '.5'], [1, '1']] : [[0, '0'], [0.5, '.5'], [1, '1×']];
  const imgBase = new URL('../assets/s5/hands/', import.meta.url).href;
  const st = { task: dm && R.dexmachina[hands[0].id][task] ? task : 'box', hand };

  // one bar's numbers: its height, its CI and its label, all in the panel's units
  const num = (h, c, m) => {
    if (dm) { const r = R.dexmachina[h][st.task][c][m]; return { v: r.mean, lo: r.mean - r.err[0], hi: r.mean + r.err[1], t: r.mean, d: 2 }; }
    const r = R.spider[h], b = r.js.mean, x = r[m];
    return { v: x.mean / b, lo: (x.mean - x.ci) / b, hi: (x.mean + x.ci) / b, t: x.mean, d: 3 };
  };
  const ariaOf = h => {
    const H = R.hands.find(x => x.id === h);
    if (dm) return `${H.name}, ${H.dof} DoF, ${st.task} task. ` + conds.map(c => `${SETUP_ARIA[c]}: ${NAME.js[0]} ${num(h, c, 'js').t.toFixed(2)}, ${NAME.ours[0]} ${num(h, c, 'ours').t.toFixed(2)}`).join('. ') + '.';
    const r = R.spider[h];
    return `${H.name}, ${H.dof} DoF. Retargeting cost ${NAME.js[0]} ${r.js.mean.toFixed(3)}, ${NAME.ours[0]} ${r.ours.mean.toFixed(3)}, ${r.delta.toFixed(1)}% lower.`;
  };

  const legend = M.map(m => `<button type="button" data-m="${m}" aria-pressed="false" style="--c:${COL[m]}"><i></i><span class="l">${NAME[m][0]}</span><span class="s">${NAME[m][1]}</span></button>`).join('')
    + `<span class="p5h-key" aria-hidden="true"><i></i><span class="l">The replay's hand</span><span class="s">Replay</span></span>`;
  const grid = GRID.map(v => `<i class="p5h-gl${v === 1 && !dm ? ' one' : ''}" style="bottom:${pct(v / YMAX)}"></i>`).join('') + '<i class="p5h-gl base" style="bottom:0"></i>';
  const ticks = TICK.map(([v, t]) => `<span class="p5h-tk${v ? '' : ' z0'}" style="bottom:${pct(v / YMAX)}">${t}</span>`).join('');
  const pair = c => `<div class="p5h-pair" data-c="${c}">
      <div class="p5h-bb">${M.map(m => `<span class="p5h-b" data-m="${m}" style="--c:${COL[m]};--c2:${COL2[m]}"><i class="bar"></i><i class="ci"></i></span>`).join('')}</div>
      <div class="p5h-vv">${M.map(m => `<span data-m="${m}"><i></i><b></b></span>`).join('')}</div>
      ${dm ? `<div class="p5h-sl"><span class="l">${SETUP[c][0]}</span><span class="s">${SETUP[c][1]}</span></div>` : ''}
    </div>`;
  const group = H => `<div class="p5h-g" data-hand="${H.id}">
      <div class="p5h-chip"><div class="p5h-tile"><img src="${imgBase}${H.id}.webp" alt="" width="227" height="272" decoding="async" draggable="false"></div><div class="p5h-hn"><b>${H.name}</b><span>${H.dof} DoF</span></div></div>
      <div class="p5h-plot" role="img"><div class="p5h-scale">${grid}${ticks}</div>${conds.map(pair).join('')}</div>
    </div>`;
  const deltaMax = Math.max(...hands.map(H => R.spider[H.id].delta));
  const ribbon = dm ? '' : (() => {
    // the "Δ cost" ribbon: one glass band under the hands, each hand's saving brighter (gold) the larger it is
    const ink = d => inkOf(d / deltaMax);
    return `<div class="p5h-rib" aria-hidden="true"><em>Δ cost</em>${hands.map(H => `<span style="color:${ink(R.spider[H.id].delta)}"><b>↓</b>${R.spider[H.id].delta.toFixed(1)}%</span>`).join('')}</div>`;
  })();
  // DexMachina on phones: the same ribbon, holding EigenDEXplore's gain under each setup's pair (the per-bar numbers are
  // off there), and the key that names the two pairs once
  const gainRow = dm ? `<div class="p5h-rib p5h-gain" aria-hidden="true">${hands.map(H => `<div class="p5h-rc">${conds.map(c => `<span data-hand="${H.id}" data-c="${c}"></span>`).join('')}</div>`).join('')}</div>` : '';
  const setupKey = dm ? `<div class="p5h-sk" aria-hidden="true">${conds.map(c => `<span><i class="${c}"></i>${SETUP[c][0]}</span>`).join('')}</div>` : '';
  // the title says what the panel shows: shorter on phones, DexMachina's shortest on the smallest
  const title = dm ? `<span class="l">Object tracking on four hands</span><span class="s p5h-t2">Tracking on four hands</span><span class="p5h-t3">Four hands</span> · <span class="p5h-task">${st.task}</span> task`
                   : `<span class="l">Retargeting cost on six hands</span><span class="s">Retargeting on six hands</span>`;
  const axis = dm ? `<span class="l">ADD-AUC ↑</span><span class="s">ADD-AUC ↑</span>`
                  : `<span class="l">Relative to ${NAME.js[0]} ↓</span><span class="s">Relative cost ↓</span>`;
  const cap = dm
    ? `<span class="l">Five seeds, about 2B frames each. Mean ADD-AUC, 95% CIs. With the task reward alone EigenDEXplore gains most on high-DoF hands. With the curriculum and helper rewards the two perform similarly in most settings, since that guidance already does most of the exploring.</span><span class="s">Five seeds, about 2B frames each. Mean ADD-AUC, 95% CIs. Gains over ${NAME.js[0]} under the hands. With the curriculum the two are mostly similar.</span>`
    : `<span class="l">Ten tasks × ten seeds, cold start. Cost relative to ${NAME.js[0]} per hand, 95% CIs. The reduction grows with the hand's DoF. Raw costs under the bars.</span><span class="s">Ten tasks × ten seeds, cold start. Cost relative to ${NAME.js[0]}, 95% CIs.</span>`;
  container.innerHTML = `<div class="p5h p5h-${dm ? 'dm' : 'sp'}" style="--n:${hands.length}">
      <div class="p5h-head"><h3>${title}</h3><span class="p5h-axis">${axis}</span><div class="p5h-legend" role="group" aria-label="Methods">${legend}</div>${setupKey}</div>
      <div class="p5h-grid">${hands.map(group).join('')}</div>
      ${ribbon}${gainRow}
      <p class="p5h-cap">${cap}</p>
    </div>`;
  const root = container.firstElementChild;
  const G = [...root.querySelectorAll('.p5h-g')];
  for (const img of root.querySelectorAll('.p5h-tile img')) {             // each hand fades in once decoded (empty space before)
    const on = () => img.classList.add('on');
    if (img.complete && img.naturalWidth) on(); else img.addEventListener('load', on, { once: true });
  }

  // tap a method to bring it forward (as section 3's paper panel legend)
  const btns = [...root.querySelectorAll('.p5h-legend button')];
  btns.forEach(b => b.addEventListener('click', () => {
    const f = root.dataset.focus === b.dataset.m ? '' : b.dataset.m;
    if (f) root.dataset.focus = f; else delete root.dataset.focus;
    btns.forEach(x => x.setAttribute('aria-pressed', x.dataset.m === f));
  }));

  // the bars, their CIs and their numbers for the current task; numbers count along with the bars
  const cells = G.flatMap(g => conds.flatMap(c => M.map(m => {
    const p = g.querySelector(`.p5h-pair[data-c="${c}"]`);
    return { h: g.dataset.hand, c, m, bar: p.querySelector(`.p5h-b[data-m="${m}"] .bar`), ci: p.querySelector(`.p5h-b[data-m="${m}"] .ci`), int: p.querySelector(`.p5h-vv [data-m="${m}"] i`), frac: p.querySelector(`.p5h-vv [data-m="${m}"] b`), shown: null };
  })));
  // DexMachina's gains (EigenDEXplore minus Joint-Space, of the two-decimal means the bars are labelled with), inked
  // against the largest gain over both tasks so a task switch keeps their brightness comparable
  const r2 = x => Math.round(x * 100) / 100;
  const gainOf = (h, c) => { const r = R.dexmachina[h][st.task][c]; return r2(r2(r.ours.mean) - r2(r.js.mean)); };
  const gains = dm ? [...root.querySelectorAll('.p5h-gain span')].map(el => ({ el, h: el.dataset.hand, c: el.dataset.c, shown: null })) : [];
  const gainMax = dm ? Math.max(...hands.flatMap(H => Object.values(R.dexmachina[H.id]).flatMap(T => conds.map(c => T[c].ours.mean - T[c].js.mean)))) : 1;
  const gainText = v => { const q = r2(v); return `${q < 0 ? '−' : '+'}${Math.abs(q).toFixed(2).slice(1)}`; };
  let raf = 0;
  function apply(animate) {
    const t0 = performance.now(), from = cells.map(x => x.shown), gfrom = gains.map(x => x.shown);
    cells.forEach(x => {
      const n = num(x.h, x.c, x.m);
      x.bar.style.height = pct(n.v / YMAX);
      x.ci.style.bottom = pct(n.lo / YMAX); x.ci.style.height = pct((n.hi - n.lo) / YMAX);
      x.target = n.t; x.d = n.d;
    });
    gains.forEach(x => { x.target = gainOf(x.h, x.c); x.el.style.color = inkOf(x.target / gainMax); });
    G.forEach(g => g.querySelector('.p5h-plot').setAttribute('aria-label', ariaOf(g.dataset.hand)));
    cancelAnimationFrame(raf);
    const write = u => {
      cells.forEach((x, i) => {
        const a = from[i] ?? x.target, v = a + (x.target - a) * u, s = v.toFixed(x.d), k = s.indexOf('.');
        x.shown = v;
        if (x.s !== s) { x.s = s; x.int.textContent = s.slice(0, k); x.int.className = s.slice(0, k) === '0' ? 'z' : ''; x.frac.textContent = s.slice(k); }
      });
      gains.forEach((x, i) => {
        const a = gfrom[i] ?? x.target, v = a + (x.target - a) * u, s = gainText(v);
        x.shown = v;
        if (x.s !== s) { x.s = s; x.el.textContent = s; }
      });
    };
    if (!animate || reduced() || (from.every((a, i) => a === cells[i].target) && gfrom.every((a, i) => a === gains[i].target))) { write(1); return; }
    const step = now => { const u = clamp((now - t0) / DUR, 0, 1); write(EASE(u)); if (u < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  function mark() { G.forEach(g => g.classList.toggle('cur', g.dataset.hand === st.hand)); }
  apply(false); mark();

  return {
    update({ task: t = st.task, hand: h = st.hand } = {}) {
      if (h !== st.hand) { st.hand = h; mark(); }
      if (dm && t !== st.task && R.dexmachina[hands[0].id][t]) {
        st.task = t;
        // the task's name in the title: a quick fade through it; the axis name after the title glides to its new place
        const el = root.querySelector('.p5h-task'), ax = root.querySelector('.p5h-axis');
        el.getAnimations().forEach(a => a.cancel());
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced() ? 0 : 140, easing: 'ease' }).onfinish = () => {
          const x0 = ax.getBoundingClientRect().left;
          el.textContent = st.task;
          const dx = x0 - ax.getBoundingClientRect().left;
          if (Math.abs(dx) > 0.5 && !reduced()) ax.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.45, 0, .2, 1)' });
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced() ? 0 : 220, easing: 'ease' });
        };
        apply(true);
      }
    },
  };
}
