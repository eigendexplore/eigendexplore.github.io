// Two clips on one clock (the More trials views of sections 1 and 4). The clock advances only while every clip that
// still has frames ahead can play (a clip that stalls on the network holds the other, so the pair never drifts apart);
// each clip follows the clock (its rate nudged, re-seeked if it drifts); a clip past its end holds its last frame. The
// transport, the scrubber and the play button read and set the clock, not the clips.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function pairClock(videos, { speed = () => 1 } = {}) {
  const st = { t: 0, playing: false, ended: false, dragging: false };
  const dur = () => Math.max(0, ...videos().map(v => v.duration || 0));
  const has = v => v.duration > 0 && v.readyState >= 1;
  // ready to move on: every clip known, and the ones still playing have their next frames
  const ready = () => videos().every(v => has(v) && (st.t >= v.duration - 0.05 ? v.readyState >= 2 : v.readyState >= 3 && !v.seeking));
  function tick(dt, visible) {
    if (st.playing && !st.dragging && visible && ready()) {
      st.t += dt * speed();
      const T = dur(); if (T && st.t >= T) { st.t = T; st.playing = false; st.ended = true; }
    }
    for (const v of videos()) {
      if (!has(v)) continue;
      const end = v.duration - 0.04, ct = Math.min(st.t, end), run = st.playing && !st.dragging && visible && st.t < end;
      if (run) {
        if (v.paused && !v.seeking) v.play().catch(() => {});
        const drift = ct - v.currentTime;
        if (Math.abs(drift) > 0.3 + 0.1 * speed()) { if (!v.seeking) v.currentTime = ct; }
        else { const r = clamp(speed() * (1 + clamp(drift * 1.6, -0.3, 0.3)), 0.0625, 16); if (Math.abs(v.playbackRate - r) > 0.02) v.playbackRate = r; }
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - ct) > 0.05 && !v.seeking) v.currentTime = ct;
      }
    }
  }
  return {
    st, tick, dur,
    restart(play) { st.t = 0; st.ended = false; st.playing = !!play; },
    toggle() {
      if (st.playing) { st.playing = false; return; }
      if (st.ended || st.t >= dur() - 0.05) st.t = 0;
      st.ended = false; st.playing = true;
    },
    seek(t) { st.t = clamp(t, 0, dur()); st.ended = false; },
    stop() { st.playing = false; videos().forEach(v => v.pause()); },
  };
}
