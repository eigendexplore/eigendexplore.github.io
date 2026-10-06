// Liquid Glass refraction for small glass shapes (pills, chips, controls). Chromium can run an SVG filter in
// backdrop-filter, so there the backdrop is bent at the rounded edge (like the video's liquid_glass.py: a bevel
// whose displacement falls off as (1 - t)^2, clear at the rim, lightly frosted inside). Other browsers keep the
// CSS frost + specular rim, which already reads as glass.
import { breathe } from './idle.js';
const CHROMIUM = !!window.chrome && /Chrome\/\d+/.test(navigator.userAgent);
const defs = () => document.getElementById('lg-defs');
const made = new Map();
let n = 0;

function mapURL(w, h, r, bevel) {
  // displacement map at a reduced resolution (feImage stretches it), signed distance to a rounded rect
  const s = Math.min(1, 220 / Math.max(w, h));
  const W = Math.max(8, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const im = g.createImageData(W, H); const d = im.data;
  const hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const px = (i + .5) / W * w - hx, py = (j + .5) / H * h - hy;
      const qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
      let dist, nx, ny;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = rr - l; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
      else if (qx > qy) { dist = rr - qx; nx = Math.sign(px); ny = 0; }
      else { dist = rr - qy; nx = 0; ny = Math.sign(py); }
      const t = Math.min(1, Math.max(0, dist / bevel));
      const k = (1 - t) * (1 - t);
      // sample inward near the rim: the edge magnifies like a convex lens
      const o = (j * W + i) * 4;
      d[o] = 128 - nx * k * 127; d[o + 1] = 128 - ny * k * 127; d[o + 2] = 128; d[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

function filterFor(w, h, r) {
  const key = `${w}x${h}x${r}`;
  if (made.has(key)) return made.get(key);
  const id = `lg${n++}`;
  const bevel = Math.max(6, Math.min(18, Math.min(w, h) * .42));
  const scale = Math.max(6, Math.min(26, Math.min(w, h) * .55));
  const ns = 'http://www.w3.org/2000/svg';
  const f = document.createElementNS(ns, 'filter');
  f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0');
  f.setAttribute('width', w); f.setAttribute('height', h); f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const im = document.createElementNS(ns, 'feImage');
  im.setAttribute('href', mapURL(w, h, r, bevel)); im.setAttribute('x', '0'); im.setAttribute('y', '0');
  im.setAttribute('width', w); im.setAttribute('height', h); im.setAttribute('preserveAspectRatio', 'none'); im.setAttribute('result', 'm');
  const dm = document.createElementNS(ns, 'feDisplacementMap');
  dm.setAttribute('in', 'SourceGraphic'); dm.setAttribute('in2', 'm'); dm.setAttribute('scale', scale.toFixed(1));
  dm.setAttribute('xChannelSelector', 'R'); dm.setAttribute('yChannelSelector', 'G');
  f.append(im, dm); defs().append(f);
  made.set(key, id);
  return id;
}

// a map is made only for glass near the screen (making one is a pixel loop and a PNG encode): the rest keep the CSS
// frost until they come near
const queue = new Set(), near = new Set();
let raf = 0;
function apply(el) {
  if (!near.has(el)) return;
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 8 || h < 8 || w * h > 900 * 140) { el.style.removeProperty('backdrop-filter'); return; }
  const cs = getComputedStyle(el);
  const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
  const id = filterFor(w, h, Math.round(r));
  const blur = el.dataset.lgBlur || (h < 60 ? 3 : 6);
  el.style.backdropFilter = `url(#${id}) blur(${blur}px) saturate(175%) brightness(1.03)`;
}
const later = el => { queue.add(el); if (!raf) raf = requestAnimationFrame(() => { raf = 0; queue.forEach(apply); queue.clear(); }); };
const ro = CHROMIUM ? new ResizeObserver(es => { for (const e of es) later(e.target); }) : null;
// first maps are made ahead of the reader (within two screens), one per quiet slice, so arriving at a section never
// waits on a batch of them
const pending = new Set(); let pumping = false;
function ahead(el) {
  pending.add(el); if (pumping) return; pumping = true;
  (async () => { while (pending.size) { await breathe(); const e = pending.values().next().value; pending.delete(e); if (near.has(e)) apply(e); } pumping = false; })();
}
const io = CHROMIUM ? new IntersectionObserver(es => {
  for (const e of es) {
    if (!e.isIntersecting) { near.delete(e.target); continue; }
    near.add(e.target); const r = e.boundingClientRect;
    if (r.bottom > 0 && r.top < innerHeight) later(e.target); else ahead(e.target);    // on screen already: at once
  }
}, { rootMargin: '200% 0px' }) : null;

export function glassify(root = document) {
  if (!ro) return;
  root.querySelectorAll('.lg').forEach(el => { if (!el.dataset.lgOn) { el.dataset.lgOn = 1; ro.observe(el); io.observe(el); } });
}
export const chromium = CHROMIUM;

// Test aid (?pump in the URL): keep the frame loop running where rAF is suspended (a hidden preview pane).
export function pump(lastTick, tick) {
  if (!/[?&]pump\b/.test(location.search)) return;
  setInterval(() => { if (performance.now() - lastTick() > 120) tick(performance.now()); }, 33);
}
