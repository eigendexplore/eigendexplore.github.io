// Background work (warm-ups, the collision guard, prefetching) waits for a quiet moment so it never lands on a tap: no
// touch, click, key, wheel or scroll for a while and the tab visible, then an idle slice where the browser has one
// (requestIdleCallback: Chromium, Firefox) or the start of a fresh frame (Safari has none, so a plain timer would fire
// in the middle of whatever the reader is doing). Long jobs are cut into slices of a few milliseconds: breathe() between
// slices hands the main thread back to input and frames.
let lastInput = -1e9;
const mark = () => { lastInput = performance.now(); };
for (const t of ['pointerdown', 'pointerup', 'keydown', 'wheel', 'touchstart', 'touchmove', 'scroll']) addEventListener(t, mark, { passive: true, capture: true });

export function quiet(cb, { after = 700, timeout = 12000, delay = 0 } = {}) {
  const t0 = performance.now();
  const check = () => {
    const now = performance.now();
    if (now - t0 < delay) { setTimeout(check, delay - (now - t0)); return; }
    if (!document.hidden && (now - lastInput >= after || now - t0 >= timeout)) {
      if (window.requestIdleCallback) requestIdleCallback(() => cb(), { timeout: 800 });
      else requestAnimationFrame(() => setTimeout(cb, 0));      // just after a frame: the most room before the next one
    } else setTimeout(check, Math.max(60, after - (now - lastInput)));
  };
  check();
}
// between slices of background work: back soon when the page is quiet, later while the reader is touching or scrolling
export const breathe = () => new Promise(r => quiet(r, { after: 300, timeout: 5000 }));
// between steps of work the reader is waiting for: just let pending input and frames through
export const yieldTask = () => new Promise(r => setTimeout(r, 0));
// a slice budget: call tick() inside a loop; it returns a promise to await when the slice is used up, else null
export function budget(ms = 6, pause = breathe) {
  let t = performance.now();
  return () => { if (performance.now() - t < ms) return null; return pause().then(() => { t = performance.now(); }); };
}
