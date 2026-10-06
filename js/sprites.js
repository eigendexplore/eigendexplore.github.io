// The end card's pixel sprites (the video's credits): six tiny 16-bit loops about the paper, ping-pong at 12 fps,
// drawn at a whole number of device pixels per sprite pixel so they stay crisp. They pop in one by one like the end
// card (half size, then full), animate only while the hero is on screen, and hold their first frame for reduced motion.
const ORDER = ['s1_human_prior', 's2_explore', 's3_dextreme', 's4_dexmachina', 's5_spider', 's6_any_hand'];

export async function initSprites(root = document) {
  const els = [...root.querySelectorAll('.spr')];
  if (!els.length) return;
  const meta = await fetch('assets/sprites/sprites.json').then(r => r.json());

  // CSS px per sprite px, snapped to whole device pixels. DeXtreme is drawn at 2/3 of the others, as in the video.
  const snap = (t, dpr) => Math.max(1, Math.round(t * dpr)) / dpr;
  const hero = root.querySelector('.hero'), content = root.querySelector('.hero-c');
  const COLS = { left: ['s1_human_prior', 's5_spider', 's3_dextreme'], right: ['s2_explore', 's6_any_hand', 's4_dexmachina'] };
  const rel = name => (name === 's3_dextreme' ? 2 / 3 : 1);
  function scale() {
    const dpr = window.devicePixelRatio || 1, w = window.innerWidth;
    let t;
    if (getComputedStyle(hero).display === 'grid') {
      // the largest scale whose sprites fit the side columns (width) and the content's height (all three stacked)
      const cols = getComputedStyle(hero).gridTemplateColumns.split(' ').map(parseFloat);
      const side = Math.min(cols[0], cols[2]), H = content.offsetHeight;
      t = 1;
      for (const c of [2.5, 2, 1.75, 1.5, 1.25]) {
        const fitsW = ORDER.every(n => meta[n].w * snap(c * rel(n), dpr) <= side * 0.98);
        const fitsH = Object.values(COLS).every(col => col.reduce((a, n) => a + meta[n].h * snap(c * rel(n), dpr), 0) + 32 <= H * 1.1);
        if (fitsW && fitsH) { t = c; break; }
      }
    } else t = w >= 600 ? 1.5 : 1;
    const rows = getComputedStyle(hero).display !== 'grid';      // narrow screens: every sprite at the same scale
    for (const el of els) el.style.setProperty('--s', snap(t * (rows ? 1 : rel(el.dataset.spr)), dpr));
  }

  await Promise.all(els.map(el => new Promise(res => {
    const m = meta[el.dataset.spr];
    el.style.setProperty('--w', m.w); el.style.setProperty('--h', m.h); el.style.setProperty('--n', m.frames);
    el.style.setProperty('--t', `${(m.frames / m.fps).toFixed(3)}s`);
    el.style.setProperty('--d', `${(0.35 + 0.15 * ORDER.indexOf(el.dataset.spr)).toFixed(2)}s`);
    const im = new Image();
    im.onload = im.onerror = res;
    im.src = `assets/sprites/${el.dataset.spr}.png`;
    el.style.backgroundImage = `url(${im.src})`;
  })));
  scale();
  document.fonts?.ready.then(scale);
  addEventListener('resize', scale, { passive: true });
  matchMedia('(resolution: 1dppx)').addEventListener?.('change', scale);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  els.forEach(el => el.classList.add('in'));
  if (reduce) return;
  new IntersectionObserver(([e]) => els.forEach(el => el.classList.toggle('run', e.isIntersecting)), { rootMargin: '80px' }).observe(hero);
}
