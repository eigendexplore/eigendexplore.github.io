// Smooth wheel scrolling on desktop (mouse and trackpad), as on ndstudio.gov: Lenis eases the page toward each wheel
// step (lerp 0.1 per frame). Touch keeps the phone's own scrolling, and Lenis turns itself off for reduced motion.
// The 3D stages' ctrl/⌘ + wheel zoom marks its events (lenisStopPropagation) so the page does not scroll as well.
import Lenis from './vendor/lenis.mjs';

export function initSmoothScroll() {
  return new Lenis({ lerp: 0.1, autoRaf: true });
}
