// Reset view sits at the top centre of every 3D stage, level with the stage's two names: its centre on theirs (the
// names scale with the card, the button does not). Where the stage's centre is too close to a name (section 1's long
// "Standard Exploration" on phones) it moves to the middle of the gap between the names, and where even that gap is
// too narrow (the smallest phones) just under them. Sets --rvTop / --rvDX on the element it places (css/site.css).
const STAGES = [['#cards', '#r3dReset', '#r3dUi'], ['#mstage', '#mReset'], ['#tStage', '#tReset'],
                ['#dCards', '#dReset', '#dR3d'], ['#hDM .h-stage', '.h-reset'], ['#hSP .h-stage', '.h-reset']];
const PAD = 8;                                                // clear of each name by at least this much

export function levelResets() {
  for (const [s, b, h] of STAGES) {
    const stage = document.querySelector(s), btn = stage?.querySelector(b) || document.querySelector(b);
    const pills = stage ? [stage.querySelector('.pill.js'), stage.querySelector('.pill.ours')] : [];
    if (!stage || !btn || !pills[0]) continue;
    const host = h ? document.querySelector(h) : btn, twoNames = s !== '#mstage';    // section 2's names ride the moving cards
    const fit = () => {
      const S = stage.getBoundingClientRect(), P = pills.map(p => p?.getBoundingClientRect());
      if (!P[0].height || !S.width) return;
      const cs = getComputedStyle(btn), bh = parseFloat(cs.minHeight) || 34, bw = btn.offsetWidth || 100;
      let top = P[0].top - S.top + P[0].height / 2 - bh / 2, dx = 0;
      if (twoNames && P[1]?.width) {
        const l = P[0].right - S.left + PAD, r = P[1].left - S.left - PAD, mid = S.width / 2;
        if (mid - bw / 2 < l || mid + bw / 2 > r) {
          if (r - l >= bw) dx = Math.min(Math.max(mid, l + bw / 2), r - bw / 2) - mid;          // the gap's middle, clear of both
          else top = Math.max(P[0].bottom, P[1].bottom) - S.top + 6;                           // under the names
        }
      }
      host.style.setProperty('--rvTop', `${Math.max(4, top).toFixed(1)}px`);
      host.style.setProperty('--rvDX', `${dx.toFixed(1)}px`);
    };
    const ro = new ResizeObserver(fit); ro.observe(stage); ro.observe(btn); fit(); document.fonts?.ready.then(fit);   // the button: shown (section 1's 3D)
  }
}
