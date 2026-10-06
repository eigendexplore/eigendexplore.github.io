// Fig. 1's hands, rendered live: the nine MANO poses the paper figure was made from (tools/export_fig1_hands.py), seen
// through the figure's own camera (fixed orthographic, 480 x 560 frame, each hand's crop as in the SVG) in the figure's
// look (render.py): a white matte surface under its key / fill / rim lights, whose brightness is mapped through the
// ramp to the method's colour (shadows take the colour, light parts stay white), with dark contours. Being live, each
// hand sways a little and turns toward the pointer. One canvas over the row draws every visible hand in its own box;
// a hand follows its panel's build (the box's scale and opacity), and the figure's PNG stays underneath until this runs.
// Click or tap a hand: it grows in place over its own plot (the plot fades back), turns slowly and can be dragged to
// orbit; a tap, the close button or Esc puts it back.
import * as THREE from 'three';
import { quiet, yieldTask } from './idle.js';

const PAD = 0.3;                                          // draw this much beyond the crop, so a turned hand is not clipped
const clamp1 = (x, a, b) => Math.max(a, Math.min(b, x));
const NAMES = { joint: 'Joint-Space', eigen: 'Eigen-Space', residual: 'Eigen-Residual', eigendex: 'EigenDEXplore' };
const COL = { joint: '#7098B7', eigen: '#A08BAB', residual: '#87A08B', eigendex: '#E1B84E' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function initHands3d(root) {
  const grid = root.querySelector('.fig1-grid');
  const [J, buf] = await Promise.all([fetch('assets/fig1/hands3d.json').then(r => r.json()), fetch('assets/fig1/hands3d.bin').then(r => r.arrayBuffer())]);
  const canvas = document.createElement('canvas'); canvas.className = 'f1-gl'; canvas.setAttribute('aria-hidden', 'true'); grid.appendChild(canvas);
  let renderer;
  // premultiplied alpha (the default): a hand fading in or out keeps its colour instead of darkening
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch { canvas.remove(); return; }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the shader writes display (sRGB) values itself
  renderer.setClearColor(0x000000, 0); renderer.autoClear = false;

  // geometry: one face list, nine position sets
  const faces = new Uint16Array(buf, 0, J.faces_bytes / 2), q = new Int16Array(buf, J.faces_bytes, J.pos_bytes / 2), NV = J.verts;
  const baked = new Uint8Array(buf, J.faces_bytes + J.pos_bytes);         // per vertex: occlusion, key, fill, rim visibility
  const cam = new THREE.OrthographicCamera(1, 1, 1, 1, 0.01, 5), [RW, RH] = J.camera.resolution, oh = J.camera.ortho_height, ow = oh * RW / RH;
  Object.assign(cam, { left: -ow / 2, right: ow / 2, top: oh / 2, bottom: -oh / 2 });
  cam.position.fromArray(J.camera.position); cam.up.set(0, 1, 0); cam.lookAt(new THREE.Vector3(...J.camera.target)); cam.updateMatrixWorld();
  const pxPerM = RH / oh;                                 // render px per metre
  const lights = J.lights.map(l => new THREE.Vector3(...l.pos)), tgt = new THREE.Vector3(...J.camera.target), toCam = cam.position.clone().sub(tgt).normalize();
  // Blender disk lights: radiance off a white surface ~ P cos / (pi^2 d^2) at the target, times a gain matched to the
  // figure's PNGs side by side (its Principled surface adds a sheen and Cycles adds bounce light; tools: gain sweep)
  const GAIN = 1.2, lw = J.lights.map((l, i) => GAIN * l.power / (Math.PI ** 2 * lights[i].distanceToSquared(tgt)));
  const scene = new THREE.Scene(), hands = {};
  // the ramp's darkest stop goes below 0 for dark channels: keep Blender's (unclamped sRGB -> linear) value for those
  const stopsRaw = hex => { const c = new THREE.Color(hex), s = J.ramp.map(([, w]) => [c.r, c.g, c.b].map(v => w + (1 - w) * v)); return s.map(v => new THREE.Vector3(...v.map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)))); };
  const VS = `attribute vec4 bake; varying vec3 vN; varying vec3 vP; varying vec4 vB; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vB = bake; gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const FS = `uniform vec3 uL[3]; uniform float uW[3]; uniform vec3 uS[5]; uniform float uP[5]; uniform float uOp; uniform vec3 uV; uniform float uHead; uniform float uFree;
    varying vec3 vN; varying vec3 vP; varying vec4 vB;
    vec3 srgb(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      // Cycles' look, baked where it is about shape: occlusion in the creases (vB.x) and each disk light's soft shadow
      // (vB.yzw); large disk lights wrap around the form, and the surface's sheen lifts grazing angles
      float ao = vB.x, L = (.06 + .3 * pow(1. - max(dot(n, uV), 0.), 3.)) * ao;
      vec3 vis = mix(vB.yzw, vec3(1.), uFree);          // turned freely (zoomed), the shadows baked for the figure's view step aside
      for (int i = 0; i < 3; i++) L += uW[i] * vis[i] * max((dot(n, normalize(uL[i] - vP)) + .3) / 1.3, 0.) * mix(.55, 1., ao);
      L += uHead * max(dot(n, uV), 0.) * ao;               // the large view adds a soft light from the viewer (every side reads)
      vec3 c = uS[0];
      for (int i = 0; i < 4; i++) { if (L >= uP[i]) { float t = clamp((L - uP[i]) / (uP[i + 1] - uP[i]), 0., 1.); c = mix(uS[i], uS[i + 1], t * t * (3. - 2. * t)); } }
      gl_FragColor = vec4(srgb(c) * uOp, uOp); }`;
  // the contour: the back faces pushed out along the normal in screen space, so the line is the same width everywhere
  const HULL_VS = `uniform float uT; uniform vec2 uRes; void main(){ vec4 c = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.);
    vec4 nc = projectionMatrix * viewMatrix * vec4(normalize(mat3(modelMatrix) * normal), 0.); c.xy += normalize(nc.xy + 1e-6) * uT * 2. / uRes * c.w; gl_Position = c; }`;
  const HULL_FS = `uniform vec3 uC; uniform float uOp; void main(){ gl_FragColor = vec4(uC * uOp, uOp); }`;
  for (const [i, name] of J.names.entries()) {
    await yieldTask();                                    // one hand per step: taps elsewhere get through
    const pos = new Float32Array(NV * 3);
    for (let v = 0; v < NV * 3; v++) pos[v] = J.lo[v % 3] + (q[i * NV * 3 + v] + 32768) * J.scale[v % 3];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('bake', new THREE.BufferAttribute(baked.subarray(i * NV * 4, (i + 1) * NV * 4), 4, true)); g.setIndex(new THREE.BufferAttribute(faces, 1)); g.computeVertexNormals(); g.computeBoundingBox();
    const centre = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-centre.x, -centre.y, -centre.z); g.computeBoundingSphere();
    const method = name.split('-')[0], st = stopsRaw(COL[method]);
    // the contours: Freestyle's dark line (.06) went through the same ramp, so they are the ramp's colour at .06
    const mc = new THREE.Color(COL[method]), dark = new THREE.Vector3(...[mc.r, mc.g, mc.b].map(v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, premultipliedAlpha: true, side: THREE.DoubleSide,
      uniforms: { uL: { value: lights }, uW: { value: lw }, uS: { value: st }, uP: { value: J.ramp.map(r => r[0]) }, uOp: { value: 1 }, uV: { value: toCam }, uHead: { value: 0 }, uFree: { value: 0 } } });
    const hullMat = new THREE.ShaderMaterial({ vertexShader: HULL_VS, fragmentShader: HULL_FS, transparent: true, premultipliedAlpha: true, side: THREE.BackSide, uniforms: { uT: { value: 0.9 }, uRes: { value: new THREE.Vector2(1, 1) }, uC: { value: dark }, uOp: { value: 1 } } });
    const grp = new THREE.Group(); grp.position.copy(centre);
    const mesh = new THREE.Mesh(g, mat), hull = new THREE.Mesh(g, hullMat); hull.renderOrder = -1; grp.add(hull, mesh); grp.visible = false; scene.add(grp);
    hands[name] = { grp, mat, hullMat, radius: g.boundingSphere.radius, phase: i * 1.7, yaw: 0, tyaw: 0, pitch: 0, tpitch: 0 };
  }

  // the boxes: every nested <svg> holding a hand image; the figure's PNG stays as the fallback until the first frame
  const boxes = [...grid.querySelectorAll('.hand svg, .res-hand svg')].map(svg => {
    const img = svg.querySelector('image'), name = (img.getAttribute('href') || '').match(/hands\/([\w-]+)\.webp/)?.[1], vb = svg.viewBox.baseVal;
    return { svg, img, name, crop: [vb.x, vb.y, vb.width, vb.height], fig: svg.closest('.f1p') };
  }).filter(b => hands[b.name]);
  // the crop window on screen: the nested <svg>'s own x, y, width, height through its parent's transform (its
  // getBoundingClientRect is the bounds of the whole image inside, not the window)
  const winOf = svg => { const m = svg.parentNode.getScreenCTM(), x = svg.x.baseVal.value, y = svg.y.baseVal.value, p0 = new DOMPoint(x, y).matrixTransform(m), p1 = new DOMPoint(x + svg.width.baseVal.value, y + svg.height.baseVal.value).matrixTransform(m);
    return { left: p0.x, top: p0.y, right: p1.x, bottom: p1.y, width: p1.x - p0.x, height: p1.y - p0.y }; };
  const opacityOf = el => { let o = 1; for (let e = el; e && !e.classList?.contains('f1p'); e = e.parentElement || e.parentNode) { const cs = getComputedStyle(e); o *= +cs.opacity; if (cs.display === 'none') return 0; } return o; };

  let pointer = null;                                     // hover: the hand under the pointer turns toward it
  const handAt = (x, y) => boxes.find(b => { if (!b.fig.offsetParent) return false; const r = winOf(b.svg), m = r.width * 0.12; return x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m; });
  grid.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; pointer = [e.clientX, e.clientY]; const b = handAt(e.clientX, e.clientY); grid.style.cursor = b && b !== zoom.b ? 'zoom-in' : ''; });
  grid.addEventListener('pointerleave', () => { pointer = null; });
  let press = null;                                       // a click / tap (not a scroll) on a hand opens it
  grid.addEventListener('pointerdown', e => { press = [e.clientX, e.clientY]; });
  grid.addEventListener('pointerup', e => {
    if (!press || Math.hypot(e.clientX - press[0], e.clientY - press[1]) > 8) return; press = null;
    const b = handAt(e.clientX, e.clientY);
    if (b && b !== zoom.b && opacityOf(b.svg.parentNode) > 0.5) openView(b); else if (zoom.b) closeView();
  });

  // ---------------------------------------------------------------- a hand, large, in its own card
  const zl = Object.assign(document.createElement('div'), { className: 'f1-zoom', innerHTML: '<span class="f1-zh">Drag to orbit</span><button class="f1-zx" type="button" aria-label="Back to the figure">×</button>' });
  const zoom = { b: null, e: 0, target: 0, yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, auto: true, drag: null };
  function openView(b) {
    if (zoom.b && zoom.b !== b) { hands[zoom.b.name].yaw = hands[zoom.b.name].pitch = 0; zoom.e = 0; }
    Object.assign(zoom, { b, target: 1, yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, auto: !reduced });
    b.fig.appendChild(zl); zl.setAttribute('aria-label', `${NAMES[b.name.split('-')[0]]}: the hand in 3D`); grid.style.cursor = '';
  }
  function closeView() { zoom.target = 0; zoom.tyaw = zoom.tpitch = 0; zoom.auto = false; }
  zl.querySelector('.f1-zx').addEventListener('click', e => { e.stopPropagation(); closeView(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeView(); });
  zl.addEventListener('pointerdown', e => { if (e.target.closest('.f1-zx')) return; if (e.pointerType === 'mouse') e.preventDefault(); zoom.drag = { x: e.clientX, y: e.clientY, moved: 0 }; zl.setPointerCapture(e.pointerId); e.stopPropagation(); });
  zl.addEventListener('pointermove', e => {
    if (!zoom.drag) return; const dx = e.clientX - zoom.drag.x, dy = e.clientY - zoom.drag.y; zoom.drag.x = e.clientX; zoom.drag.y = e.clientY; zoom.drag.moved += Math.abs(dx) + Math.abs(dy);
    zoom.auto = false; zoom.tyaw += dx * 0.012; zoom.tpitch = clamp1(zoom.tpitch + dy * 0.01, -1.2, 1.2);
  });
  zl.addEventListener('pointerup', e => { e.stopPropagation(); if (zoom.drag && zoom.drag.moved < 6) closeView(); zoom.drag = null; });   // a tap puts it back
  zl.addEventListener('pointercancel', () => { zoom.drag = null; });
  // where it grows to: the card's plot, inset, at the crop's shape
  const zoomRect = b => { const R = b.fig.querySelector('.f1-svg').getBoundingClientRect(), [, , cw, ch] = b.crop, m = 10, mb = 26, w = R.width - 2 * m, h = R.height - m - mb, k = Math.min(w / cw, h / ch);
    return { left: R.left + m + (w - cw * k) / 2, top: R.top + m + (h - ch * k) / 2, width: cw * k, height: ch * k }; };   // mb: room for the hint

  // the two programs (surface, contour) are compiled in a quiet moment while the row is still off screen (a first
  // compile stalls its frame): in parallel where the browser can (compileAsync), then one hand drawn into a 1 px window
  quiet(async () => {
    await renderer.compileAsync(scene, cam); if (live) return;
    for (const n in hands) hands[n].grp.visible = n === J.names[0];
    renderer.setScissorTest(true); renderer.setViewport(0, 0, 1, 1); renderer.setScissor(0, 0, 1, 1); renderer.render(scene, cam); hands[J.names[0]].grp.visible = false; });
  let live = false, first = true, last = performance.now(), lastDraw = 0;
  new IntersectionObserver(es => { live = es.some(e => e.isIntersecting); if (live) requestAnimationFrame(frame); }, { rootMargin: '100px 0px' }).observe(grid);
  function frame(now) {
    if (!live) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (now - lastDraw < 12.5) return;                   // at most ~60 frames a second (even pacing on 120 Hz screens)
    lastDraw = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const gr = grid.getBoundingClientRect(), pr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(gr.width), H = Math.round(gr.height);
    if (canvas._w !== W || canvas._h !== H || canvas._pr !== pr) { renderer.setPixelRatio(pr); renderer.setSize(W, H, false); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`; canvas._w = W; canvas._h = H; canvas._pr = pr; }
    renderer.setScissorTest(false); renderer.clear();
    renderer.setScissorTest(true);
    for (const b of boxes) {
      if (!b.fig.offsetParent) continue;                  // its panel is not shown (phones show one at a time)
      const h = hands[b.name], z = zoom.b === b ? zoom.e : 0;
      let r = winOf(b.svg);
      if (z > 0.001) { const T = zoomRect(b), e = z * z * (3 - 2 * z); r = { left: r.left + (T.left - r.left) * e, top: r.top + (T.top - r.top) * e, width: r.width + (T.width - r.width) * e, height: r.height + (T.height - r.height) * e }; r.right = r.left + r.width; r.bottom = r.top + r.height; }
      if (r.width < 2 || r.bottom < gr.top || r.top > gr.bottom) continue;
      const op = opacityOf(b.svg.parentNode) * (zoom.b && zoom.b !== b && zoom.b.fig === b.fig ? 1 - zoom.e : 1); if (op < 0.01) continue;   // its card's other hands step back
      // pose: a slow sway, or toward the pointer when it is over this hand
      const over = pointer && pointer[0] > r.left - r.width * 0.2 && pointer[0] < r.right + r.width * 0.2 && pointer[1] > r.top - r.height * 0.2 && pointer[1] < r.bottom + r.height * 0.2;
      if (z > 0.001) { h.tyaw = zoom.tyaw; h.tpitch = zoom.tpitch; }
      else if (over) { h.tyaw = ((pointer[0] - (r.left + r.right) / 2) / r.width) * 1.1; h.tpitch = ((pointer[1] - (r.top + r.bottom) / 2) / r.height) * 0.6; }
      else { h.tyaw = reduced ? 0 : 0.14 * Math.sin(now / 1000 * 0.6 + h.phase); h.tpitch = 0; }
      const k = 1 - Math.exp(-dt * (z > 0.001 ? 9 : 6)); h.yaw += (h.tyaw - h.yaw) * k; h.pitch += (h.tpitch - h.pitch) * k;
      h.grp.rotation.set(h.pitch, h.yaw, 0);
      // the box (crop) plus a margin, in canvas px; the camera window = that crop plus the same margin, in render px
      const [cx, cy, cw, ch] = b.crop, px = r.width / cw, mx = cw * PAD, my = ch * PAD;
      const x0 = r.left - gr.left - mx * px, y0 = r.top - gr.top - my * px, w = (cw + 2 * mx) * px, hh = (ch + 2 * my) * px;
      cam.setViewOffset(RW, RH, cx - mx, cy - my, cw + 2 * mx, ch + 2 * my); cam.updateProjectionMatrix();
      renderer.setViewport(x0, H - y0 - hh, w, hh);
      if (z > 0.001) { const F = b.fig.querySelector('.f1-svg').getBoundingClientRect(), sx = Math.max(x0, F.left - gr.left), sy = Math.max(y0, F.top - gr.top), ex = Math.min(x0 + w, F.right - gr.left), ey = Math.min(y0 + hh, F.bottom - gr.top);
        renderer.setScissor(sx, H - ey, Math.max(0, ex - sx), Math.max(0, ey - sy)); }                  // grown, it stays inside its card's plot
      else renderer.setScissor(x0, H - y0 - hh, w, hh);
      h.mat.uniforms.uHead.value = 0.3 * z; h.mat.uniforms.uFree.value = z;   // zoomed: a soft light from the viewer, so every side reads
      // the outline shell (drawn behind the hand) fades faster than the hand, so it never shows through a half-faded hand
      h.mat.uniforms.uOp.value = op; h.hullMat.uniforms.uOp.value = op * op * op;
      h.hullMat.uniforms.uT.value = clamp1(0.55 + px * 2.2, 0.7, 1.7); h.hullMat.uniforms.uRes.value.set(w, hh);   // css px, a little bolder when large
      for (const n in hands) hands[n].grp.visible = n === b.name;
      renderer.render(scene, cam);
      if (first) { first = false; root.classList.add('live3d'); }
    }
    // the zoom's own pace, and its layer over the plot (fades with it)
    if (zoom.b) {
      if (zoom.auto) zoom.tyaw += dt * 0.4;
      zoom.e += (zoom.target - zoom.e) * (1 - Math.exp(-dt * 7));
      const F = zoom.b.fig.querySelector('.f1-svg').getBoundingClientRect(), C = zoom.b.fig.getBoundingClientRect();
      Object.assign(zl.style, { left: `${F.left - C.left}px`, top: `${F.top - C.top}px`, width: `${F.width}px`, height: `${F.height}px`, opacity: (zoom.e * zoom.e).toFixed(3), pointerEvents: zoom.target ? 'auto' : 'none' });
      if (!zoom.target && zoom.e < 0.004) { zoom.e = 0; zoom.b = null; zl.remove(); }
    }
  }
}
