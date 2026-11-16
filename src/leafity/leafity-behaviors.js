// Leafity edge behaviours — reusable "website mascot" routines built from the mover's
// edge primitives and the animator's clips. Leafity hides beyond an edge of the bounds
// (the screen, a section, or behind a panel) and shows only part of its body.
//
//   const edge = createBehaviors(leafity);          // leafity.edge is created for you
//   edge.peek({ side: 'left', reveal: 0.5, act: 'wave', then: 'retreat' })
//   edge.leanIn / popIn / dropIn / hideAndReappear / windowPeek / edgeHang /
//        sideCrawl / assistant / shelfSit
//
// Every routine returns Promise<boolean>: true = finished, false = interrupted by a
// newer move or animation. Options shared by the peeks:
//   side    'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
//   reveal  0..1 — how much of the body shows (0.5 = half)
//   style   'curious' (a sliver first, then leans out) | 'smooth' | 'quick' (pop out and hide)
//   act     'look' | 'wave' | 'blink' | 'surprised' | 'content' (gaze at the page) | 'stare' (at the
//           visitor) | 'curious' (tilt, with the question mark) | 'inspect' (magnifying glass) | 'hop'
//   then    'retreat' | 'enter' (come fully into view) | 'stay'
//   along   0..1 position along a top/bottom edge;  y  feet height for side edges
//   lean    how far side peeks tilt inward (radians)
//   hide    how far beyond the edge the hidden position is (default -0.8; closer to 0 = just out of sight,
//           for a low panel that cannot cover a deeper hiding place)
const HID = -0.8; // fully hidden, with a margin for the leaves and for the back of the pot under perspective

export function createBehaviors(ch) {
  const mv = ch.mover, A = ch.animator, CANCEL = {};
  const ok = async (p) => { if (!(await p)) throw CANCEL; };
  const guard = (fn) => async (o = {}) => {
    try { A.clearLook(); await fn(o); return true; } catch (e) { if (e === CANCEL) return false; throw e; }
  };
  // Look toward the content (inward from the edge), in Leafity's own rolled frame.
  const lookIn = (spec) => {
    const r = mv.roll, wx = -spec.dx, wy = -spec.dy;
    A.setLook(wx * Math.cos(r) + wy * Math.sin(r), -wx * Math.sin(r) + wy * Math.cos(r), 0);
  };
  const groundY = (z) => { const b = mv.bounds(z); return b.bottom <= 0 && b.top > 0 ? 0 : b.bottom + 0.1; };
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  // Come fully into view: walk in from a side edge, hop in from anywhere else.
  const enter = async (spec, o) => {
    const s = mv.scale;
    if (spec.roll == null) {
      mv.rollTo(0, 0.3);
      await ok(mv.walkTo({ x: o.enterX ?? spec.x - spec.dx * 1.9 * s, y: o.y ?? 0, z: spec.z }));
      return;
    }
    const b = mv.bounds(spec.z), x = o.enterX ?? Math.min(b.right - 1.2 * s, Math.max(b.left + 1.2 * s, spec.x - spec.dx * 1.6 * s));
    if (Math.abs(spec.roll) > 1.5) {
      // upside down at the top edge: pull back up, then drop in upright — no mid-air flip
      await ok(mv.edgeTo(spec, HID, { dur: 0.45, ease: 'in' }));
      mv.place({ x, y: b.top + 0.3 * s, z: spec.z }, { heading: 'camera' });
      await ok(mv.dropTo(groundY(spec.z)));
      return;
    }
    mv.rollTo(0, 0.5);
    await ok(mv.jumpTo({ x, y: groundY(spec.z), z: spec.z }, { height: 0.4 }));
  };

  const peek = guard(async (o) => {
    const spec = o.edge || mv.edge(o.side || 'right', o), reveal = o.reveal ?? 0.6, style = o.style || 'curious', act = o.act || 'look';
    const hid = o.hide ?? HID, P = { lean: o.lean, y: o.y }, pose = o.pose || 'peekIdle', side = spec.roll == null;
    // face the camera, turned a little further toward the page, so an eye is the first thing past the edge
    spec.turn = -Math.sign(spec.dx) * (side ? 0.22 : 0.15);
    mv.edgePlace(spec, hid, P);
    A.play(pose, { fx: false });
    if (style === 'quick') {
      await ok(mv.edgeTo(spec, reveal, { ...P, dur: 0.3, ease: 'out' }));
      if (o.act === 'surprised') { A.play('surprised', { fx: false }); await ok(mv.wait(1.1)); A.play(pose, { fx: false }); } // wide eyes, tiny "o"
      A.play('blink');
      await ok(mv.wait(0.6));
      await ok(mv.edgeTo(spec, hid, { ...P, dur: 0.22, ease: 'in' }));
      A.returnToIdle();
      return;
    }
    if (style === 'curious') {
      await ok(mv.edgeTo(spec, Math.min(reveal, side ? Math.max(0.3, reveal * 0.5) : reveal * 0.45), { ...P, dur: 0.9 })); // one eye and one leaf
      await ok(mv.wait(0.55));
      await ok(mv.edgeTo(spec, reveal, { ...P, dur: 0.8 }));
    } else await ok(mv.edgeTo(spec, reveal, { ...P, dur: 1.0 }));
    lookIn(spec);
    if (act === 'wave') await ok(A.play('wave', { params: { left: spec.dx > 0 } }));
    else if (act === 'blink') { A.play('blink'); await ok(mv.wait(1.3)); }
    else if (act === 'surprised') await ok(A.play('surprised'));
    else if (act === 'inspect') await ok(A.play('inspect'));
    else if (act === 'content') await ok(mv.wait(2.2));
    else if (act === 'stare') { A.clearLook(); await ok(mv.wait(o.hold ?? 2.2)); }
    else if (act === 'curious') {
      A.clearLook();
      // symbolX: which side of the head the question mark goes (e.g. toward the page when peeking from the right)
      if (o.symbolX != null) { const tilt = A.play('curiousTilt', { fx: false }); ch.showAddon('question', { x: o.symbolX, delay: 0.45, dur: 1.9 }); await ok(tilt); } // (after play: starting a clip clears pending add-ons)
      else await ok(A.play('curiousTilt'));
    }
    else if (act === 'hop') await ok(mv.wait(0.5));
    else { A.play('blink'); await ok(mv.wait(0.9)); A.clearLook(); await ok(A.play('lookAround')); }
    A.clearLook();
    const then = o.then || (act === 'hop' ? 'enter' : 'retreat');
    if (then === 'stay') return;
    if (then === 'enter') {
      await enter(spec, o);
      if (act === 'hop') await ok(A.play('happyHop'));
      return;
    }
    A.play(pose, { fx: false });
    await ok(mv.edgeTo(spec, hid, { ...P, dur: 0.55, ease: 'in' }));
    A.returnToIdle();
  });

  return {
    peek,
    // A. Leans into view from a side edge without entering.
    leanIn: (o = {}) => peek({ lean: 0.7, reveal: 0.45, style: 'smooth', act: 'content', ...o }),
    // D. Diagonal peek from a corner.
    cornerPeek: (o = {}) => peek({ side: 'bottom-right', style: 'smooth', act: 'blink', ...o }),
    // J. Rises from behind a panel (rect in CSS px of the canvas) that is drawn in front of the canvas.
    windowPeek: (o = {}) => peek({ style: 'smooth', act: 'wave', ...o, edge: mv.edgeBehind(o.rect, o) }),
    // B. Pops up from the bottom edge, looks around, drops back down.
    popIn: guard(async (o) => {
      const spec = mv.edge('bottom', { along: o.along ?? 0.7 });
      mv.edgePlace(spec, HID);
      A.play('peekIdle', { fx: false });
      await ok(mv.edgeTo(spec, o.reveal ?? 0.7, { dur: 0.45, ease: 'out' }));
      await ok(A.play('lookAround'));
      A.play('peekIdle', { fx: false });
      await ok(mv.edgeTo(spec, HID, { dur: 0.3, ease: 'in' }));
      A.returnToIdle();
    }),
    // C. Lowers itself from the top edge, hanging by its hands (which stay beyond the edge), then lifts back up.
    dropIn: guard(async (o) => {
      // o.rect: hang from the top of another area (e.g. the space below a sticky header); o.act: 'wave'
      const spec = { ...mv.edge('top', { along: o.along ?? 0.5, rect: o.rect }), roll: 0, bias: 0 };
      mv.edgePlace(spec, HID);
      A.play('hang');
      await ok(mv.edgeTo(spec, o.reveal ?? 0.67, { dur: 1.1 }));
      if (o.act === 'wave') { await ok(mv.wait(0.4)); A.play('hangWave'); await ok(mv.wait(A.clips.hangWave.duration + 0.2)); }
      else await ok(mv.wait(o.hold ?? 2.6));
      await ok(mv.edgeTo(spec, HID, { dur: 0.8, ease: 'in' }));
      A.returnToIdle();
    }),
    // G. Peeks, ducks away, then pops back out from the opposite (or the same) side and waves.
    hideAndReappear: guard(async (o) => {
      const first = o.side || 'right', a = mv.edge(first, o), b = mv.edge(o.same ? first : opposite[first] || 'left', o);
      a.turn = -a.dx * 0.22; b.turn = -b.dx * 0.22;
      mv.edgePlace(a, HID);
      A.play('peekIdle', { fx: false });
      await ok(mv.edgeTo(a, 0.55, { dur: 0.9 }));
      lookIn(a);
      await ok(mv.wait(0.9));
      A.play('blink');
      await ok(mv.wait(0.5));
      await ok(mv.edgeTo(a, HID, { dur: 0.25, ease: 'in' }));
      A.clearLook();
      await ok(mv.wait(0.7));
      mv.edgePlace(b, HID);
      await ok(mv.edgeTo(b, 0.6, { dur: 0.36, ease: 'out' }));
      lookIn(b);
      await ok(A.play('wave', { params: { left: b.dx > 0 } }));
      A.clearLook();
      A.play('peekIdle', { fx: false });
      await ok(mv.edgeTo(b, HID, { dur: 0.5, ease: 'in' }));
      A.returnToIdle();
    }),
    // E. Holds onto the top edge of a panel from behind: hands and eyes show, the rest is hidden.
    edgeHang: guard(async (o) => {
      const spec = mv.edgeBehind(o.rect, o);
      mv.edgePlace(spec, HID);
      A.play('edgeGrip');
      await ok(mv.edgeTo(spec, 0.47, { dur: 0.9 }));
      await ok(mv.wait(o.hold ?? 4));
      await ok(mv.edgeTo(spec, HID, { dur: 0.6, ease: 'in' }));
      A.returnToIdle();
    }),
    // F. Shuffles hand over hand along the top edge of a panel, half hidden behind it.
    sideCrawl: guard(async (o) => {
      // stay within the panel's width so no part of the body shows past its sides
      const cw = mv.rectToWorld(o.rect), m = Math.min(0.5, 1.08 * mv.scale / Math.max(1e-6, cw.right - cw.left));
      const from = o.from ?? m, to = o.to ?? 1 - m, a = mv.edgeBehind(o.rect, { along: from }), b = mv.edgeBehind(o.rect, { along: to });
      mv.edgePlace(a, HID);
      A.play('edgeGrip');
      await ok(mv.edgeTo(a, 0.47, { dur: 0.8 }));
      A.play('sideCrawl', { params: { dir: to > from ? 1 : -1 } });
      await ok(mv.followPath([mv.edgeAt(b, 0.47).pos], { speed: 0.55, stepped: true, period: A.clips.sideCrawl.duration }));
      A.play('edgeGrip');
      await ok(mv.wait(0.7));
      await ok(mv.edgeTo(b, HID, { dur: 0.6, ease: 'in' }));
      A.returnToIdle();
    }),
    // H. Slides in from off-screen, stops near the content, points at it, nods, and runs back out.
    assistant: guard(async (o) => {
      const b = mv.bounds(), s = mv.scale, dir = o.from === 'right' ? 1 : -1, y = o.y ?? 0;
      const out = { x: (dir < 0 ? b.left : b.right) + dir * 1.6 * s, y, z: 0 };
      mv.place(out, { heading: 'camera' });
      await ok(mv.slideTo({ x: o.stopX ?? (b.left + b.right) / 2, y, z: 0 }));
      await ok(o.target ? ch.pointAt(o.target) : A.play('point'));
      await ok(A.play('nod'));
      await ok(mv.walkTo(out, { run: true, face: false }));
    }),
    // I. Hops up onto a shelf and sits with its feet over the front edge. seat = world point on the
    // shelf top, 0.12 × Leafity's size behind the front edge, so the pot base is fully supported.
    shelfSit: guard(async (o) => {
      await ok(mv.jumpTo(o.seat, { height: 0.5 }));
      mv.faceCamera(0.3);
      A.play('sit');
    }),
  };
}
