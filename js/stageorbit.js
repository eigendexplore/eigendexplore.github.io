// The reader's hold on a two-card 3D stage, section 3's (js/s3.js "orbit (both cards together), hover lean, reset"),
// shared so every stage behaves the same: the view leans a little toward the mouse (it invites the drag); a drag past
// 4 px turns both cards about the subject (the lean folded in, nothing jumps) and holds the video's camera where it was
// (the view is the reader's: nothing moves it on its own); Reset or a double click glides back onto the video's camera
// over 0.9 s; once a visit, the view turns a little on its own (js/orbitdemo.js).
//   const O = stageOrbit(stage, { key, now: () => u });   now(): the stage's clock, held while the reader orbits
//   O.tick(dt, t)          every frame (eases the lean and the turn)
//   O.angles()             { yaw, pitch } to apply about the subject
//   O.camT(u)              the clock the video's camera should show: the held moment, gliding back after a Reset
//   O.orbited(), O.reset(), O.peek(t)
import { orbitDemo } from './orbitdemo.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoother = x => { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function stageOrbit(stage, { key, now }) {
  const st = { orb: { az: 0, el: 0, taz: 0, tel: 0 }, hov: { x: 0, y: 0, tx: 0, ty: 0 }, peekYaw: 0, peekAt: 0, orbBack: null, hold: null, release: null };
  const demo = orbitDemo({ key });
  const orbited = () => st.hold != null || !!st.orbBack || Math.abs(st.orb.taz) + Math.abs(st.orb.tel) >= 0.02;
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    const dy = demo.stop(performance.now(), true); if (dy) { st.orb.az += dy; st.orb.taz += dy; st.peekYaw = 0; }
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag && e.pointerType === 'mouse' && !reduced && !orbited()) {
      const r = stage.getBoundingClientRect(); st.hov.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1); st.hov.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4 && !drag.real) {
      drag.real = true;
      if (st.orbBack) { st.orbBack = null; st.orb.taz = st.orb.az; st.orb.tel = st.orb.el; }
      if (st.hold == null) {
        st.hold = now();
        if (st.release) { const k = smoother((performance.now() - st.release.t0) / 900); if (k < 0.5) st.hold = st.release.from; st.release = null; }
        st.orb.az -= 0.2 * st.hov.x; st.orb.taz = st.orb.az; st.orb.el -= 0.1 * st.hov.y; st.orb.tel = st.orb.el;
      }
      st.hov.x = st.hov.y = st.hov.tx = st.hov.ty = 0;
    }
    if (!drag.real) return;
    st.orb.taz -= dx * 0.0065; if (e.pointerType !== 'touch') st.orb.tel = clamp(st.orb.tel + dy * 0.0045, -0.25, 0.75);
  });
  const endDrag = () => { drag = null; stage.classList.remove('grabbing'); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { st.hov.tx = st.hov.ty = 0; });
  // Reset: the turn and the camera glide back together, on one 0.9 s curve
  function reset() {
    const t = performance.now();
    st.orbBack = { az: st.orb.az, el: st.orb.el, t0: t }; st.orb.taz = st.orb.tel = 0;
    if (st.hold != null) { st.release = { from: st.hold, t0: t }; st.hold = null; }
  }
  stage.addEventListener('dblclick', reset);
  function tick(dt, t) {
    if (st.peekAt && t >= st.peekAt) { demo.start(t); st.peekAt = 0; }
    st.peekYaw = demo.yaw(t);
    { const h = st.hov, k = 1 - Math.exp(-dt * 3.5); h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k; }
    if (st.orbBack) { const e = smoother((t - st.orbBack.t0) / 900); st.orb.az = st.orbBack.az * (1 - e); st.orb.el = st.orbBack.el * (1 - e); if (e >= 1) st.orbBack = null; }
    else { const o = st.orb, k = 1 - Math.exp(-dt * 10); o.az += (o.taz - o.az) * k; o.el += (o.tel - o.el) * k; }
    if (orbited()) st.hov.tx = st.hov.ty = 0;
  }
  // the video's camera: at the held moment while orbited, blending back onto the live one over the Reset's 0.9 s
  function camT(u) {
    if (st.hold != null) return { u: st.hold, w: 0 };
    if (st.release) { const e = smoother((performance.now() - st.release.t0) / 900); if (e >= 1) { st.release = null; return { u, w: 1 }; } return { u: st.release.from, live: u, w: e }; }
    return { u, w: 1 };
  }
  const angles = () => ({ yaw: st.orb.az + st.peekYaw - 0.2 * st.hov.x, pitch: clamp(st.orb.el - 0.1 * st.hov.y, -0.25, 0.75) });
  const key_ = () => { const a = angles(); return `${a.yaw.toFixed(4)}|${a.pitch.toFixed(4)}|${st.hold ?? ''}|${st.release ? 1 : 0}`; };
  return { st, tick, angles, camT, orbited, reset, key: key_, peek: t => { st.peekAt = t; }, stopDemo: () => demo.stop(performance.now(), false) };
}
