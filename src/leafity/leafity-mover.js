// Leafity movement controller — moves the character through the scene and coordinates
// that travel with the in-place clips from leafity-animations.js.
//
//   walking    = 'walk' clip  + position travelling at the clip's stride speed
//   climbing   = 'climb' clip + position following a path in pulses, one per arm pull
//   peeking    = a pose clip  + position measured from an edge of the bounds (see edge())
//
// It only writes root.position, root.rotation.y (heading, 0 = facing the camera),
// root.rotation.z (roll in the screen plane, used when leaning in from an edge) and
// root.scale. Every move returns Promise<boolean>: true = arrived, false = interrupted
// by a newer move. Positions are world units on the scene; screenToWorld / worldToScreen /
// anchorFromRect map between CSS pixels of the canvas and the character's plane, so a
// page can place explicit anchors (it never treats DOM elements as physical surfaces).
export function createMover(THREE, model, animator, { camera, viewport } = {}) {
  const root = model.root;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lerp = (a, b, u) => a + (b - a) * u;
  const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  const outCubic = (u) => 1 - (1 - u) ** 3, inCubic = (u) => u ** 3, inOut = (u) => u * u * (3 - 2 * u);
  const outBack = (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
  const EASE = { in: inCubic, out: outCubic, back: outBack, smooth: inOut };
  // outward direction of each edge / corner of the bounds
  const DIRS = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1], 'top-left': [-1, 1], 'top-right': [1, 1], 'bottom-left': [-1, -1], 'bottom-right': [1, -1] };
  const FACE_Z = 0.6; // how far in front of the centre the face sits, × size
  const anchors = new Map();
  let token = 0, motion = null, turn = null, rollT = null, boundsFn = null;
  root.rotation.order = 'ZYX'; // heading first, then roll about the view axis

  const begin = () => { token += 1; if (motion) { const m = motion; motion = null; m.res(false); } return token; };
  const alive = (k) => k === token;
  const run = (dur, step) => new Promise((res) => {
    if (motion) { const m = motion; motion = null; m.res(false); }
    motion = { t: 0, dur: Math.max(dur, 1e-3), step, res };
  });
  const size = () => root.scale.x;
  const resolve = (t) => {
    if (typeof t === 'string') t = anchors.get(t);
    if (typeof t === 'function') t = t();
    t = t || {};
    return V(t.x ?? root.position.x, t.y ?? root.position.y, t.z ?? root.position.z);
  };
  const vp = () => (viewport ? viewport() : { width: 1, height: 1 });

  const api = {
    get moving() { return !!motion; },
    get position() { return root.position; },
    get heading() { return root.rotation.y; },
    get roll() { return root.rotation.z; },
    get scale() { return root.scale.x; },

    // ---- coordinate mapping -----------------------------------------------------------
    screenToWorld(px, py, planeZ = 0) {
      const { width, height } = vp();
      camera.updateMatrixWorld();
      const o = camera.position, d = V((px / width) * 2 - 1, -(py / height) * 2 + 1, 0.5).unproject(camera).sub(o).normalize();
      const k = Math.abs(d.z) < 1e-6 ? 0 : (planeZ - o.z) / d.z;
      return V(o.x + d.x * k, o.y + d.y * k, planeZ);
    },
    worldToScreen(v) {
      const { width, height } = vp();
      camera.updateMatrixWorld();
      const p = V(v.x, v.y, v.z).project(camera);
      return { x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height };
    },
    // World x of the left / right edge of the visible area at depth z.
    edgeX(side, z = 0) { const { width, height } = vp(); return api.screenToWorld(side === 'left' ? 0 : width, height / 2, z).x; },
    // rect = { left, top, width, height } in CSS px relative to the canvas → a world point on its edge.
    anchorFromRect(rect, { align = 'top', z = 0 } = {}) {
      const x = rect.left + rect.width * (align === 'left' ? 0 : align === 'right' ? 1 : 0.5);
      const y = rect.top + rect.height * (align === 'top' ? 0 : align === 'bottom' ? 1 : 0.5);
      return api.screenToWorld(x, y, z);
    },
    // ---- edges ------------------------------------------------------------------------
    // The area Leafity is visible in. fn() → { left, top, right, bottom } in CSS px of the
    // canvas (e.g. a section or container); null = the whole canvas.
    setBounds(fn) { boundsFn = fn; },
    rectToWorld(rect, z = 0) {
      const a = api.screenToWorld(rect.left, rect.top, z), c = api.screenToWorld(rect.right ?? rect.left + rect.width, rect.bottom ?? rect.top + rect.height, z);
      return { left: a.x, right: c.x, top: a.y, bottom: c.y };
    },
    boundsPx() { const { width, height } = vp(); return (boundsFn && boundsFn()) || { left: 0, top: 0, right: width, bottom: height }; },
    bounds(z = 0) { return api.rectToWorld(api.boundsPx(), z); },
    // Describe an edge or corner Leafity can hide beyond: 'left' | 'right' | 'top' | 'bottom' |
    // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'. along = 0..1 position on a
    // top/bottom edge. rect (CSS px) overrides the bounds.
    edge(side = 'right', { along = 0.5, rect, z = 0 } = {}) {
      // The edge is measured in the plane of Leafity's face (in front of its centre), so that with
      // a perspective camera the face — not just the back of the pot — is what clears the edge.
      const r = api.rectToWorld(rect || api.boundsPx(), z + FACE_Z * size()), d = DIRS[side] || DIRS.right, n = Math.hypot(d[0], d[1]);
      return {
        side, z, turn: 0, dx: d[0] / n, dy: d[1] / n,
        x: d[0] < 0 ? r.left : d[0] > 0 ? r.right : lerp(r.left, r.right, along),
        y: d[1] < 0 ? r.bottom : d[1] > 0 ? r.top : null, // null: side edges keep the feet at a given height
        // side edges lean in by `lean` (null); corners lean gently so the face stays readable;
        // only the top edge hangs Leafity upside down (leaves and eyes come first)
        roll: d[1] === 0 ? null : d[0] !== 0 ? Math.sign(d[0]) * 0.45 : d[1] > 0 ? Math.PI : 0,
        extent: d[1] === 0 ? 0.8 : d[0] === 0 ? 0.95 : 1.05,
        bias: d[1] === 0 ? 0 : d[0] !== 0 ? 0.32 : d[1] < 0 ? 0.3 : 0.25, // the face sits low on the body, so vertical peeks show a bit more
      };
    },
    // An edge to hide BEHIND: the top edge of a panel (rect in CSS px) that is drawn in front of the canvas.
    edgeBehind(rect, { along = 0.5, z = 0 } = {}) {
      const r = api.rectToWorld(rect, z + FACE_Z * size());
      return { side: 'behind', z, turn: 0, dx: 0, dy: -1, x: lerp(r.left, r.right, along), y: r.top, roll: 0, extent: 0.95, bias: 0.25 };
    },
    // Where the root must be so that `reveal` (0 = just hidden, 0.5 = half, 1 = fully out;
    // negative = hidden with a margin) of the body shows past the edge.
    edgeAt(spec, reveal, { lean = 0.22, y = 0 } = {}) {
      const s = size(), cH = 0.95 * s, roll = spec.roll == null ? spec.dx * lean : spec.roll;
      const r = reveal < 0 ? reveal : Math.min(1, reveal + spec.bias), off = spec.extent * s * (1 - 2 * r);
      const cx = spec.x + spec.dx * off, cy = spec.y == null ? y + cH : spec.y + spec.dy * off;
      const pos = V(cx + Math.sin(roll) * cH, cy - Math.cos(roll) * cH, spec.z);
      // face the camera from wherever it is, plus spec.turn (a little extra toward the page)
      return { pos, roll, heading: api.headingToCamera(pos) + (spec.turn || 0) };
    },
    edgePlace(spec, reveal, { lean, y } = {}) {
      begin();
      if (rollT) { const t = rollT; rollT = null; t.res(false); }
      if (turn) { const t = turn; turn = null; t.res(false); }
      const t = api.edgeAt(spec, reveal, { lean, y });
      root.position.copy(t.pos);
      root.rotation.z = t.roll;
      root.rotation.y = t.heading;
    },
    edgeTo(spec, reveal, { dur = 0.8, ease = 'smooth', lean, y } = {}) {
      begin();
      if (turn) { const t = turn; turn = null; t.res(false); }
      const from = root.position.clone(), r0 = root.rotation.z, h0 = root.rotation.y, t = api.edgeAt(spec, reveal, { lean, y }), f = EASE[ease] || inOut;
      return run(dur, (u) => { const e = f(u); root.position.lerpVectors(from, t.pos, e); root.rotation.z = lerp(r0, t.roll, e); root.rotation.y = lerp(h0, t.heading, e); });
    },
    rollTo(angle, dur = 0.35) {
      if (rollT) { const t = rollT; rollT = null; t.res(false); }
      return new Promise((res) => { rollT = { from: root.rotation.z, to: angle, t: 0, dur: Math.max(dur, 1e-3), res }; });
    },

    setAnchor(name, pos) { anchors.set(name, pos); },
    anchor(name) { return resolve(name); },

    // ---- immediate placement ------------------------------------------------------------
    place(pos, { heading, scale, roll = 0 } = {}) {
      begin();
      if (turn) { const t = turn; turn = null; t.res(false); }
      if (rollT) { const t = rollT; rollT = null; t.res(false); }
      root.rotation.z = roll;
      if (scale != null) root.scale.setScalar(scale);
      root.position.copy(resolve(pos));
      if (heading != null) root.rotation.y = heading === 'camera' ? api.headingToCamera() : heading;
    },
    setScale(s) { root.scale.setScalar(s); },
    // Put Leafity back in a valid resting spot: upright, facing the camera, on the ground, inside the bounds.
    settle({ y = 0, z = 0, margin = 1.1 } = {}) {
      const b = api.bounds(z), s = size(), lo = b.left + margin * s, hi = b.right - margin * s;
      api.place({ x: lo > hi ? (b.left + b.right) / 2 : Math.min(hi, Math.max(lo, root.position.x)), y, z }, { heading: 'camera' });
    },
    stop() { begin(); },
    wait(sec) { return run(sec, () => {}); },

    // ---- turning ----------------------------------------------------------------------
    turnTo(angle, dur = 0.35) {
      if (turn) { const t = turn; turn = null; t.res(false); }
      return new Promise((res) => { turn = { from: root.rotation.y, to: angle, t: 0, dur: Math.max(dur, 1e-3), res }; });
    },
    // Heading that turns the face to the camera from a position (not simply 0: near the sides of a
    // perspective view a "straight ahead" character shows the side of its pot).
    headingToCamera(pos = root.position) { return camera ? Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z) : 0; },
    faceCamera(dur = 0.4) { return api.turnTo(api.headingToCamera(), dur); },
    // Heading that faces a world point (scaled so the face stays partly visible to the camera).
    headingToward(target, amount = 0.62) {
      const t = resolve(target);
      return Math.atan2(t.x - root.position.x, t.z - root.position.z) * amount;
    },

    // ---- travel -----------------------------------------------------------------------
    glideTo(target, dur = 0.6, ease = inOut) {
      begin();
      const from = root.position.clone(), to = resolve(target);
      return run(dur, (u) => root.position.lerpVectors(from, to, ease(u)));
    },
    // pace speeds the stride and the travel up together (useful for a small Leafity on a long path)
    // stretch lengthens the travel only (a little slide, for a livelier run)
    // slow eases to a stop over the last fifth of the way instead of halting dead
    async walkTo(target, { run: fast = false, face = true, pace = 1, stretch = 1, slow = false } = {}) {
      const k = begin(), from = root.position.clone(), to = resolve(target), dist = from.distanceTo(to);
      if (dist < 0.02) return true;
      // Turn toward the travel direction, but measured from the camera so the face stays in view
      // the whole way across (never a full side or back view).
      const name = fast ? 'run' : 'walk', side = 0.75 * (to.x - from.x) / dist, depth = (to.z - from.z) / dist;
      if (turn) { const t = turn; turn = null; t.res(false); }
      animator.play(name, { speed: pace });
      const speed = pace * stretch * animator.clips[name].travel * size() * (0.72 * Math.abs(side / 0.75) + Math.abs(depth) * 0.9 || 0.72);
      const kS = 2 / 1.8, glide = (u) => (u < 0.8 ? kS * u : 1 - (kS / 0.4) * (1 - u) ** 2);
      const ok = await run(dist / speed * (slow ? kS : 1), (u, t, dt) => {
        root.position.lerpVectors(from, to, slow ? glide(u) : u);
        root.rotation.y += (api.headingToCamera() + side - root.rotation.y) * (1 - Math.exp(-dt * 9));
      });
      if (!ok || !alive(k)) return false;
      animator.returnToIdle();
      if (face) await api.faceCamera();
      return alive(k);
    },
    async slideTo(target, { dur = 0.9 } = {}) {
      const k = begin(), from = root.position.clone(), to = resolve(target);
      api.faceCamera(0.2);
      animator.play('slide', { params: { dir: Math.sign(to.x - from.x) || 1 } });
      const ok = await run(dur, (u) => root.position.lerpVectors(from, to, outCubic(u)));
      if (!ok || !alive(k)) return false;
      return api.wait(0.6); // let the stop-bounce finish
    },
    async jumpTo(target, { height = 0.7 } = {}) {
      const k = begin(), from = root.position.clone(), to = resolve(target);
      animator.play('jump', { params: { height } });
      // the clip crouches for 0.34 s, is airborne for 0.66 s, then lands and settles
      // jumping up: gain height first so the feet clear the edge; jumping down: travel first, then drop
      const ok = await run(1.02, (u, t) => {
        const e = sm(0, 1, (t - 0.34) / 0.66);
        root.position.lerpVectors(from, to, e);
        root.position.y = lerp(from.y, to.y, to.y > from.y ? 1 - (1 - e) ** 2 : e * e);
      });
      if (!ok || !alive(k)) return false;
      return api.wait(0.66);
    },
    // Follow a polyline. stepped = advance in pulses (period = clip cycle, two pulses per cycle).
    followPath(points, { clip, speed = 0.8, stepped = false, period = 0.9, params } = {}) {
      begin();
      const pts = [root.position.clone(), ...points.map(resolve)], len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const total = len[len.length - 1];
      if (total < 0.01) return Promise.resolve(true);
      if (clip) animator.play(clip, { params });
      const v = speed * size();
      return run(total / v, (u, t) => {
        let s = v * t;
        if (stepped) s += v * period * Math.sin(4 * Math.PI * t / period) / (4 * Math.PI); // fastest as each arm pulls
        s = Math.min(total, Math.max(0, s));
        let i = 1;
        while (i < pts.length - 1 && len[i] < s) i++;
        root.position.lerpVectors(pts[i - 1], pts[i], (s - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]));
        if (u >= 1) root.position.copy(pts[pts.length - 1]);
      });
    },
    // Climb straight up or down to target.y (x/z optional). heading = which way the wall is.
    async climbTo(target, { heading = 1.1, speed = 0.75 } = {}) {
      const to = resolve(target), dir = to.y >= root.position.y ? 1 : -1;
      api.turnTo(heading, 0.3);
      return api.followPath([to], { clip: 'climb', speed, stepped: true, period: animator.clips.climb.duration, params: { dir } });
    },
    // Pull up and over an edge onto the surface at `to`.
    async mantle(target, { dur = 1.2 } = {}) {
      const k = begin(), from = root.position.clone(), to = resolve(target), s = size();
      animator.play('pullUp');
      const ok = await run(dur, (u) => {
        const a = sm(0, 0.55, u), b = sm(0.55, 1, u); // clear the edge before moving over it
        root.position.set(lerp(from.x, to.x, b), lerp(from.y, to.y, a) + 0.12 * s * Math.sin(Math.PI * b), lerp(from.z, to.z, b));
      });
      return ok && alive(k);
    },
    // Hang with the hands on `point` (the top front edge of a ledge).
    async hangAt(point, { dur = 0.5 } = {}) {
      const k = begin(), from = root.position.clone(), p = resolve(point), to = V(p.x, p.y - 1.26 * size(), p.z);
      api.faceCamera(0.3);
      animator.play('hang');
      const ok = await run(dur, (u) => root.position.lerpVectors(from, to, outCubic(u)));
      return ok && alive(k);
    },
    // Let go and fall to height y, then land.
    async dropTo(y = 0) {
      const k = begin(), y0 = root.position.y, h = y0 - y;
      if (h > 0.02) {
        const g = 16;
        animator.play('fall');
        const ok = await run(Math.sqrt(2 * h / g), (u, t) => { root.position.y = Math.max(y, y0 - 0.5 * g * t * t); });
        root.position.y = y;
        if (!ok || !alive(k)) return false;
      }
      api.faceCamera(0.3);
      const done = await animator.play('land');
      return done && alive(k);
    },
    // Advance all movement. Call once per frame from the single render loop.
    update(dt) {
      if (dt <= 0) return;
      if (turn) {
        turn.t += dt;
        const u = Math.min(1, turn.t / turn.dur);
        root.rotation.y = lerp(turn.from, turn.to, inOut(u));
        if (u >= 1) { const t = turn; turn = null; t.res(true); }
      }
      if (rollT) {
        rollT.t += dt;
        const u = Math.min(1, rollT.t / rollT.dur);
        root.rotation.z = lerp(rollT.from, rollT.to, inOut(u));
        if (u >= 1) { const t = rollT; rollT = null; t.res(true); }
      }
      if (motion) {
        const m = motion;
        m.t += dt;
        const u = Math.min(1, m.t / m.dur);
        m.step(u, m.t, dt);
        if (u >= 1 && motion === m) { motion = null; m.res(true); }
      }
    },
    dispose() { begin(); if (turn) { const t = turn; turn = null; t.res(false); } if (rollT) { const t = rollT; rollT = null; t.res(false); } anchors.clear(); },
  };
  return api;
}
