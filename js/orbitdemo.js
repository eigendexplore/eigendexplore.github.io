// "This can be turned", said by the subject itself, once a visit: the view turns a little on its own and comes back,
// as if someone had nudged it. Nothing is drawn over it and nothing sits near Reset view. A touch during it takes over
// from where the view is (stop(now, true) returns the angle for the caller's own orbit, so nothing jumps).
// Reduced motion: never.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smoother = p => { p = Math.max(0, Math.min(1, p)); return p * p * p * (p * (6 * p - 15) + 10); };

export function orbitDemo({ key, amp = 0.58, dur = 3000 } = {}) {
  const seen = () => { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } };
  let t0 = 0, state = reduced || seen() ? 'done' : 'idle', leave = null;
  const yawAt = t => -amp * (1 - Math.cos(2 * Math.PI * smoother(t / dur))) / 2;      // out and back, eased at both ends
  return {
    get active() { return state === 'run' || state === 'leave'; },
    start(now) { if (state !== 'idle') return; state = 'run'; t0 = now; try { sessionStorage.setItem(key, '1'); } catch { /* shown again next visit */ } },
    yaw(now) {                                            // the angle to add to the view this frame
      if (state === 'run') { if (now - t0 >= dur) { state = 'done'; return 0; } return yawAt(now - t0); }
      if (state === 'leave') { const p = (now - leave.t) / 380; if (p >= 1) { state = 'done'; return 0; } return leave.y * (1 - smoother(p)); }
      return 0;
    },
    // the reader touched the view (absorb: their orbit takes over from here) or did something else (it eases back)
    stop(now, absorb) {
      if (state === 'idle') { state = 'done'; return 0; }
      if (state !== 'run') return 0;
      const y = yawAt(now - t0);
      if (absorb) { state = 'done'; return y; }
      state = 'leave'; leave = { t: now, y }; return 0;
    },
  };
}
