// Self-collision guard for the live Sharpa hand (the video's method shots were made collision-free by a mesh check,
// 84_method_v2_blender.py safe: the noise scale is lowered per sample until no two hand links intersect; this is the
// same rule, live, with sphere proxies fitted to each link's real mesh).
//   build(robot): a chain of spheres along each link's long axis (in the link's own frame, spaced under a radius apart,
//   radius = the mesh's 80th percentile distance from that axis in that stretch), grouped by the movable link that
//   carries them (fingertip pads ride on the distal link). Pairs that never count, as in the video: links within two
//   joints of each other (a joint's own knuckle, a finger's base links against the palm).
//   calibrate(poses, set): spheres cannot be exact, so each pair may overlap as deeply as it does in poses the video's
//   mesh check passed (the reference pose and the S1b noise shots); only deeper overlaps count.
//   collides(): any pair overlapping more than that (plus a small tolerance).
//   safeScale(apply, c0): the largest noise fraction c <= c0 that is collision-free (bisection), apply(c) poses it.
// Building and calibrating take a while on a phone, so both run in slices: slice() (js/idle.js budget) returns a promise
// to await when a slice is used up. The hand may be re-posed between slices (it is on screen), so the reference pose is
// set again (refPose) right before the reference overlaps are measured.
import * as THREE from 'three';

const FIXED = /^(left_\w+?)_(elastomer|fingertip)$/;          // fixed to the distal link
const TOL = 0.0012;                                            // m: margin over the calibrated overlaps (poses between frames)

export async function buildCollider(robot, slice = () => null, refPose = () => {}) {
  const links = {}; robot.traverse(o => { if (o.name.startsWith('L_left_')) links[o.name.slice(2)] = o; });
  const owner = name => { const m = name.match(FIXED); return m ? `${m[1]}_DP` : name; };
  robot.updateMatrixWorld(true);
  const pts = {};
  for (const [name, node] of Object.entries(links)) {
    const w = slice(); if (w) { await w; robot.updateMatrixWorld(true); }
    const own = owner(name), ownNode = links[own] || node, inv = new THREE.Matrix4().copy(ownNode.matrixWorld).invert();
    node.children.filter(ch => !ch.name.startsWith('J_')).forEach(ch => ch.traverse(o => {      // this link's own meshes only
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, v = new THREE.Vector3(), M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 1500));
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(M); (pts[own] ??= []).push(v.clone()); }
    }));
  }
  const groups = [];
  for (const [name, P] of Object.entries(pts)) {
    const w = slice(); if (w) await w;
    if (P.length < 10 || !links[name]) continue;
    const c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length);
    // principal axis (power iteration on the covariance)
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j]; }
    let ax = new THREE.Vector3(1, 0.3, 0.2).normalize();
    for (let it = 0; it < 30; it++) ax = new THREE.Vector3(C[0] * ax.x + C[1] * ax.y + C[2] * ax.z, C[3] * ax.x + C[4] * ax.y + C[5] * ax.z, C[6] * ax.x + C[7] * ax.y + C[8] * ax.z).normalize();
    const t = P.map(p => p.clone().sub(c).dot(ax)), t0 = Math.min(...t), t1 = Math.max(...t);
    const rad = P.map((p, i) => p.clone().sub(c).addScaledVector(ax, -t[i]).length()).sort((a, b) => a - b);
    const r0 = rad[Math.floor(rad.length * 0.8)];
    const n = Math.max(1, Math.min(10, Math.ceil((t1 - t0) / (0.75 * r0))));
    const spheres = [];
    for (let k = 0; k < n; k++) {
      const a = t0 + (t1 - t0) * k / n, b = t0 + (t1 - t0) * (k + 1) / n;
      const seg = P.map((p, i) => [p, t[i]]).filter(([, ti]) => ti >= a && ti <= b);
      if (!seg.length) continue;
      const mid = (a + b) / 2, cen = c.clone().addScaledVector(ax, mid);
      const r = seg.map(([p]) => p.clone().sub(c).addScaledVector(ax, -p.clone().sub(c).dot(ax)).length()).sort((x, y) => x - y);
      const half = (b - a) / 2;
      spheres.push({ local: cen, r: Math.max(r[Math.floor(r.length * 0.8)], half), world: new THREE.Vector3() });
    }
    groups.push({ name, node: links[name], spheres, finger: (name.match(/^left_(thumb|index|middle|ring|pinky)_/) || [])[1] || 'palm' });
  }
  // kinematic distance between movable links (scene graph: L_ -> J_ -> L_)
  const parentLink = n => { let o = links[n]?.parent; while (o && !(o.name.startsWith('L_') && groups.some(g => g.name === o.name.slice(2)))) o = o.parent; return o ? o.name.slice(2) : null; };
  const chain = n => { const c = []; for (let x = n; x; x = parentLink(x)) c.push(x); return c; };
  const dist = (a, b) => { const ca = chain(a), cb = chain(b); for (let i = 0; i < ca.length; i++) { const j = cb.indexOf(ca[i]); if (j >= 0) return i + j; } return 99; };
  const pairs = [];
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const A = groups[i], B = groups[j];
    if (dist(A.name, B.name) > 2) pairs.push({ A, B, allow: 0 });      // closer links: a joint's knuckle, a finger's base vs the palm
  }
  const col = { groups, pairs, collides, calibrate };
  refPose(); updateWorld(col);
  for (const P of pairs) P.allow = Math.max(0, overlap(P.A, P.B));       // this (reference) pose is the mesh design
  return col;
}

function updateWorld(col) { for (const g of col.groups) for (const s of g.spheres) s.world.copy(s.local).applyMatrix4(g.node.matrixWorld); }
function overlap(A, B) {                                                   // deepest sphere overlap of two links (m), < 0 = apart
  let m = -1;
  for (const a of A.spheres) for (const b of B.spheres) { const o = a.r + b.r - a.world.distanceTo(b.world); if (o > m) m = o; }
  return m;
}
async function calibrate(poses, set, slice = () => null) {
  for (const q of poses) {
    const w = slice(); if (w) await w;
    set(q); updateWorld(this); for (const P of this.pairs) P.allow = Math.max(P.allow, overlap(P.A, P.B));
  }
}
function collides() {
  updateWorld(this);
  for (const P of this.pairs) if (overlap(P.A, P.B) > P.allow + TOL) return true;
  return false;
}

// largest c in [0, c0] with apply(c) collision-free; apply must pose the hand and update its matrices
export function safeScale(col, apply, c0 = 1) {
  apply(c0); if (!col.collides()) return c0;
  let lo = 0, hi = c0;
  for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; apply(m); if (col.collides()) hi = m; else lo = m; }
  apply(lo); return lo;
}
