// Section 1 fits one screen. The column keeps the page width; the card height comes from the small viewport height
// (100svh, so mobile browser bars never push the stage off screen) minus everything else in the section, measured,
// not guessed. Cards stay between square and the footage's own 16:9. Phones: two square cards side by side.
// Also: the "What differs" disclosure opens and closes with an animated height and a soft fade.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const phone = () => document.documentElement.clientWidth < 600;

// Anything that plays by itself starts only when most of it is on screen: 60 % of its height (or of the screen, when it
// is taller than the screen); it stops again when less than 30 % is left (the gap keeps it from flickering at the edge).
export function engaged(el, was) {
  const r = el.getBoundingClientRect(), vh = innerHeight, vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  const f = vis / Math.max(1, Math.min(r.height, vh));
  return was ? f > 0.3 : f >= 0.6;
}

export function fitStage() {
  const s1 = document.querySelector('.s1'), inner = document.getElementById('s1in'), cards = document.getElementById('cards');
  if (!s1 || !inner || !cards) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const card = cards.querySelector('.card');
  const set = (H, W) => {
    s1.style.setProperty('--H', `${Math.round(H)}px`);
    s1.style.setProperty('--k', clamp(Math.min(W, H) / 420, 0.72, 1.15).toFixed(3));
  };
  function fit() {
    const W = card.getBoundingClientRect().width;
    if (phone()) { set(W, W); return; }
    const vh = probe.getBoundingClientRect().height || innerHeight;
    let H = W;
    for (let i = 0; i < 3; i++) {                   // the text above can rewrap as nothing else changes width: converge
      set(H, W);
      const other = inner.getBoundingClientRect().height - card.getBoundingClientRect().height;
      H = clamp(vh - other - 28, W / (16 / 9), W);
    }
    set(H, W);
    s1.dispatchEvent(new Event('stagefit'));
  }
  fit();
  document.fonts?.ready.then(fit);
  let last = [innerWidth, innerHeight];
  addEventListener('resize', () => {
    if (innerWidth === last[0] && Math.abs(innerHeight - last[1]) < 1) return;
    last = [innerWidth, innerHeight]; fit();
  });
  return fit;
}

export function animateDisclosure(d) {
  if (!d) return;
  const body = d.querySelector('.why-body'), sum = d.querySelector('summary');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anim = null;
  sum.addEventListener('click', e => {
    e.preventDefault();
    if (reduced) { d.open = !d.open; return; }
    const opening = !d.open || d.classList.contains('closing');
    // closed, the body still reports its laid-out height in current Chrome (::details-content keeps the layout): from 0
    const from = d.open ? body.getBoundingClientRect().height : 0;
    anim?.cancel();
    if (opening) { d.classList.remove('closing'); d.open = true; }
    else d.classList.add('closing');
    const to = opening ? body.scrollHeight : 0;
    anim = body.animate([{ height: `${from}px`, opacity: opening ? 0.2 : 1, transform: `translateY(${opening ? -4 : 0}px)` },
                         { height: `${to}px`, opacity: opening ? 1 : 0, transform: `translateY(${opening ? 0 : -4}px)` }],
                        { duration: clamp(Math.abs(to - from) * 2.6, 320, 540), easing: 'cubic-bezier(.45, 0, .2, 1)' });   // gentle start, soft landing
    anim.onfinish = () => { anim = null; if (!opening) { d.open = false; d.classList.remove('closing'); } };
  });
}

// Section 2's tour fits one screen too: the steps row, the caption and the stage (the heading may scroll away above).
// Phones: a fixed share of the small viewport, the step's panel follows below the stage.
export function fitS2() {
  const s2 = document.querySelector('.s2'), top = document.querySelector('.s2-top'), scene = document.getElementById('mstage');
  if (!s2 || !top || !scene) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  function fit() {
    const vh = probe.getBoundingClientRect().height || innerHeight;
    let H;
    if (document.documentElement.clientWidth < 760) H = clamp(vh * 0.6, 360, 580);      // the caption and the step text sit under it
    else {
      const above = scene.getBoundingClientRect().top - top.getBoundingClientRect().top;
      // the video's card shape (1864 x 1024), so every layer sits where the video put it; shorter if the screen is
      H = clamp(Math.min(scene.clientWidth * 1024 / 1864, vh - above - 72), 400, 780);
    }
    s2.style.setProperty('--s2H', `${Math.round(H)}px`);
  }
  fit();
  document.fonts?.ready.then(fit);
  let last = [innerWidth, innerHeight];
  addEventListener('resize', () => { if (innerWidth === last[0] && Math.abs(innerHeight - last[1]) < 1) return; last = [innerWidth, innerHeight]; fit(); });
}

// Section 3 fits one screen too: the checkpoints row, the two cards, the curve band and the paper button. Desktop:
// the cards take what is left (no taller than a little over their width); phones: a share of the small viewport.
// sections 3 and 5 share one stage fit (the video's card: 922 x 752 above its band, two cards side by side)
function fitVideoStage(sec, stage, band, prop) {
  if (!sec || !stage || !band) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  function fit() {
    const vh = probe.getBoundingClientRect().height || innerHeight;
    let H;
    if (document.documentElement.clientWidth < 760) H = clamp(Math.min(vh * 0.6, vh - 266), 320, 580);   // 266: the controls, the band, the paper button
    else {
      const cardW = (stage.clientWidth - 14) / 2;
      H = clamp(Math.min(vh - 40 - 12 - band.offsetHeight - 12 - 54 - 26, cardW * 0.82), 340, 680);   // 0.82: the video's card (922 x 752 above its band)
    }
    sec.style.setProperty(prop, `${Math.round(H)}px`);
    sec.dispatchEvent(new Event('stagefit'));
  }
  fit();
  document.fonts?.ready.then(fit);
  let last = [innerWidth, innerHeight];
  addEventListener('resize', () => { if (innerWidth === last[0] && Math.abs(innerHeight - last[1]) < 1) return; last = [innerWidth, innerHeight]; fit(); });
}
export function fitS3() { fitVideoStage(document.querySelector('.s3'), document.getElementById('tStage'), document.getElementById('tBand'), '--H3'); }

// Section 4 fits one screen too: the controls row, the two cards and the transport (the heading may scroll away above).
// Desktop: the cards take what is left, between 1.15:1 and 1.5:1 (the hand, the cube and the goal cube above it; wider
// would show past the filmed frame). Phones: two square cards, as in section 1.
export function fitS4() {
  const s4 = document.querySelector('.s4'), cards = document.getElementById('dCards'), top = document.querySelector('.d-top'), tr = document.querySelector('.d-transport');
  if (!s4 || !cards || !top || !tr) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const card = cards.querySelector('.card');
  const set = (H, W) => {
    s4.style.setProperty('--H', `${Math.round(H)}px`);
    s4.style.setProperty('--k', clamp(Math.min(W, H) / 420, 0.72, 1.15).toFixed(3));
  };
  function fit() {
    const W = card.getBoundingClientRect().width;
    if (document.documentElement.clientWidth < 760) set(W, W);          // narrow: square cards (js/s4.js uses the square cut)
    else {
      const vh = probe.getBoundingClientRect().height || innerHeight;
      set(clamp(vh - top.offsetHeight - 18 - 12 - tr.offsetHeight - 10 - 36, W / 1.5, W / 1.15), W);
    }
    s4.dispatchEvent(new Event('stagefit'));
  }
  fit();
  document.fonts?.ready.then(fit);
  let last = [innerWidth, innerHeight];
  addEventListener('resize', () => { if (innerWidth === last[0] && Math.abs(innerHeight - last[1]) < 1) return; last = [innerWidth, innerHeight]; fit(); });
}

export function fitS5() { fitVideoStage(document.querySelector('.s5'), document.querySelector('.s5 .h-stage'), document.querySelector('.s5 .h-band'), '--H5'); }
