// Leafity's section behaviours for the hand-drawn LeafSpectra site — ONE implementation, shared by the
// "LeafSpectra — Hand-Drawn Garden Concept" page and the "Leafity Animation Studio" (which lists every
// entry of SECTION_ACTIONS under "Website sections — Leafity"). The page and the Studio only provide
// the surroundings through `env`; everything Leafity does lives here.
//
//   const acts = createSectionActs(leafity, env);
//   await acts.run('cardCornerPeek');        // resolves true when it played to the end
//   await acts.run('markerHop', { dir: 1, keepHeading: true });   // keepHeading: carry on running afterwards
//
// env (all positions in world units):
//   alive()            → false once the caller has moved on (the act stops at its next step)
//   pause(sec)         → Promise, resolves after sec (true) or false when cancelled
//   step(promise)      → optional: the caller's own step (may return false for "interrupted, end quietly")
//   card()             → { x, top, half, cy, plant: {x,y}, detail: {x,y} } — the card Leafity is on
//   path()             → { y, L, R, markers: [x…], steps: [{x, y}…] } — the How it works strip
//   home()             → optional: Promise, walk back to the resting spot (the Studio uses it)
//
// Every act ends in a safe state: upright (no roll), no look target, idle clip, standing on the
// card top (card acts) or on the path (path acts). Cancelled acts leave that cleanup to run().
export const SECTION_ACTIONS = [
  // What is LeafSpectra? — on the journal cards
  ['cardClimb', 'Climb onto a Card', 'card'],
  ['cardSit', 'Sit on a Card', 'card'],
  ['cardDuck', 'Duck Behind a Card', 'card'],
  ['cardPeekOver', 'Peek Over a Card Edge', 'card'],
  ['cardCornerPeek', 'Peek Around a Card Corner', 'card'],
  ['cardInspect', 'Inspect a Card Plant', 'card'],
  ['cardPoint', 'Point at a Card Detail', 'card'],
  ['cardHop', 'Tiny Celebration Hop', 'card'],
  // How it works — along the garden path
  ['markerHop', 'Hop Over a Garden Marker', 'path'],
  ['stepLook', 'Stop and Look at a Step', 'path'],
  ['pathWave', 'Wave on the Path', 'path'],
  ['pathRest', 'Rest on the Path', 'path'],
  ['journeyCheer', 'Journey Celebration', 'path'],
  // FAQ, Features, Download — reactions in place
  ['faqThink', 'FAQ Thinking', 'spot'],
  ['featurePick', 'Feature Pick Reaction', 'spot'],
  ['downloadCheer', 'Download Cheer', 'spot'],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export function createSectionActs(ch, env) {
  const A = ch.animator, mv = ch.mover, o = ch.object;
  const STOP = { stopped: true };
  let running = null;
  // the caller's step when given (it may answer a tap and return false), else a plain one
  const step = async (p) => { const r = env.step ? await env.step(p) : await p; if (!env.alive()) throw STOP; return r; };
  const s = () => o.scale.x;
  const at = (x, y) => ({ x, y, z: 0 });

  // ---- cards -------------------------------------------------------------------------------
  const GRIP = () => 0.45 * s(), DEEP = () => 2.15 * s(); // eyes and hands over the edge / fully hidden behind the card
  const climbUp = async (x) => {
    const c = env.card();
    A.play('climb', { params: { dir: 1 } });
    if (!(await step(mv.followPath([at(x, c.top - GRIP())], { speed: 1.5, stepped: true, period: 0.9 })))) return false;
    return step(mv.mantle(at(x, c.top), { dur: 1.0 }));
  };
  const climbDown = (depth) => { const c = env.card(); A.play('climb', { params: { dir: -1 } }); return step(mv.followPath([at(o.position.x, c.top - depth)], { speed: 1.6, stepped: true, period: 0.9 })); };
  const onTop = () => Math.abs(o.position.y - env.card().top) < 0.02;
  // back up onto the card if an act left Leafity below its top edge
  const remount = async () => { if (!onTop()) { const c = env.card(), x = clamp(o.position.x, c.x - c.half + 0.6 * s(), c.x + c.half - 0.6 * s()); if (Math.abs(o.position.x - x) > 0.01) mv.place(at(x, o.position.y), { heading: 'camera' }); await climbUp(x); } };
  const walkOnCard = async (x) => { const c = env.card(), t = clamp(x, c.x - c.half + 0.7 * s(), c.x + c.half - 0.7 * s()); if (Math.abs(t - o.position.x) < 0.15 * s()) return true; const ok = await step(mv.walkTo(at(t, c.top), { face: false })); return ok; };

  const ACTS = {
    // from out of sight behind the card, up its face and over the edge
    async cardClimb() {
      const c = env.card(), x = o.position.x;
      if (onTop() && !(await climbDown(DEEP()))) return false;
      await step(env.pause(0.4));
      return climbUp(clamp(x, c.x - c.half + 0.6 * s(), c.x + c.half - 0.6 * s()));
    },
    async cardSit() {
      A.play('sit', { params: { flat: true } });
      await step(env.pause(rnd(3, 4.5)));
      A.returnToIdle();
      return step(env.pause(0.45));
    },
    // slip down behind the card, stay hidden a moment, come back up a little further along
    async cardDuck() {
      const c = env.card(), x0 = o.position.x;
      if (!(await climbDown(DEEP()))) return false;
      await step(env.pause(rnd(1.2, 2)));
      const m = Math.max(0, c.half - 1.1 * s());
      const x = clamp(x0 + (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 0.7) * m, c.x - m, c.x + m);
      mv.place(at(x, o.position.y), { heading: 'camera' });
      return climbUp(x);
    },
    // hang from the front edge, eyes over the top
    async cardPeekOver() {
      if (!(await climbDown(GRIP()))) return false;
      A.play('edgeGrip');
      await step(env.pause(rnd(1.4, 2.2)));
      return climbUp(o.position.x);
    },
    // to the nearer corner, down behind the card, then peek out over the corner, leaning out
    async cardCornerPeek() {
      const c = env.card(), dir = o.position.x >= c.x ? 1 : -1;
      if (!(await walkOnCard(c.x + dir * c.half))) return false;
      if (!(await climbDown(DEEP()))) return false;
      const px = c.x + dir * (c.half - 0.32 * s());
      mv.place(at(px, c.top - DEEP()), { heading: 'camera' });
      A.play('climb', { params: { dir: 1 } });
      if (!(await step(mv.followPath([at(px, c.top - 0.62 * s())], { speed: 1.4, stepped: true, period: 0.9 })))) return false;
      A.play('peekIdle');
      await step(mv.rollTo(-dir * 0.32, 0.35));
      A.setLook(dir * 0.35, 0.05, 0.5);
      await step(env.pause(rnd(1.4, 2)));
      A.clearLook();
      if (Math.random() < 0.5) await step(A.play('giggle'));
      await step(mv.rollTo(0, 0.3));
      if (!(await climbDown(DEEP()))) return false;
      const back = c.x + dir * (c.half - 0.9 * s());
      mv.place(at(back, o.position.y), { heading: 'camera' });
      return climbUp(back);
    },
    // walk over to the card's plant drawing, look down at it through the magnifying glass, nod
    async cardInspect() {
      const c = env.card(), p = c.plant || at(c.x, c.cy), dir = p.x >= o.position.x ? 1 : -1;
      if (!(await walkOnCard(p.x - dir * 0.5 * s()))) return false;
      await step(mv.turnTo(mv.headingToward(at(p.x, o.position.y), 0.3), 0.4));
      A.setLook(dir * 0.35, -0.9, 0.4);
      await step(A.play('inspect'));
      A.clearLook();
      await step(A.play('nod', { fx: false }));
      return step(mv.faceCamera());
    },
    async cardPoint() {
      const c = env.card(), d = c.detail || at(c.x, c.cy);
      return step(ch.pointAt(d));
    },
    async cardHop() {
      await step(A.play('happyHop'));
      if (Math.random() < 0.4) await step(A.play('leafFlutter', { fx: false }));
      return true;
    },

    // ---- How it works: the garden path --------------------------------------------------
    // run toward the next marker, hop clean over it, and land running on the other side
    async markerHop(opt = {}) {
      const P = env.path(), x = o.position.x, sc = s();
      const dir = opt.dir || (x < (P.L + P.R) / 2 ? 1 : -1);
      const ahead = P.markers.filter((m) => (m - x) * dir > 1.2 * sc && m > P.L + 0.9 * sc && m < P.R - 0.9 * sc).sort((a, b) => (a - b) * dir);
      if (!ahead.length) return false;
      const m = ahead[0];
      if (!(await step(mv.walkTo(at(m - dir * 0.95 * sc, P.y), { run: true, pace: 1.6, face: false })))) return false;
      return step(mv.jumpTo(at(m + dir * 0.95 * sc, P.y), { height: 0.75 * sc }));
    },
    // stop under a step, look up at it, a thoughtful nod
    async stepLook(opt = {}) {
      const P = env.path(), x = o.position.x;
      const i = opt.step ?? P.steps.reduce((b, st, j) => (Math.abs(st.x - x) < Math.abs(P.steps[b].x - x) ? j : b), 0);
      const st = P.steps[i];
      if (Math.abs(st.x - x) > 0.3 * s() && !(await step(mv.walkTo(at(clamp(st.x, P.L, P.R), P.y), { face: false })))) return false;
      await step(mv.faceCamera());
      A.setLook(0, 0.85, 0.45);
      await step(A.play(Math.random() < 0.5 ? 'curiousTilt' : 'think', { fx: false }));
      A.clearLook();
      return step(A.play('nod', { fx: false }));
    },
    async pathWave() { await step(mv.faceCamera()); return step(A.play('wave')); },
    async pathRest() {
      await step(mv.faceCamera());
      A.play('sit');
      await step(env.pause(rnd(3.5, 5)));
      A.returnToIdle();
      return step(env.pause(0.5));
    },
    // at the end of the journey (the last step): a little cheer
    async journeyCheer() {
      const P = env.path(), last = P.steps[P.steps.length - 1];
      const x = clamp(last ? last.x : P.R, P.L, P.R);
      if (Math.abs(x - o.position.x) > 0.3 * s() && !(await step(mv.walkTo(at(x, P.y), { run: true, pace: 1.6, face: false })))) return false;
      await step(mv.faceCamera());
      await step(A.play('cheer'));
      return step(A.play('happyHop'));
    },

    // ---- reactions in place ------------------------------------------------------------
    async faqThink() {
      await step(A.play('think'));
      return step(A.play('nod', { fx: false }));
    },
    async featurePick(opt = {}) { return step(A.play(opt.clip || 'curiousTilt')); },
    async downloadCheer() {
      A.play('leafFlutter', { fx: false });
      return step(A.play('cheer'));
    },
  };

  const GROUP = Object.fromEntries(SECTION_ACTIONS.map(([id, , g]) => [id, g]));
  return {
    acts: Object.keys(ACTS),
    get running() { return running; },
    async run(id, opt) {
      if (running || !ACTS[id]) return false;
      running = id;
      let ok = true;
      ch.followPointer(false); A.clearLook();
      try { const r = await ACTS[id](opt || {}); ok = r !== false; } catch (e) { ok = false; if (e && e !== STOP) console.error(e); } // (a caller's step may throw null when it moves on)
      finally {
        // the same ending every time: upright, eyes free, idle; card acts end standing on the card
        mv.rollTo(0, 0.2);
        A.clearLook();
        if (['peekIdle', 'edgeGrip', 'sit', 'climb'].includes(A.current)) A.returnToIdle();
        if (env.alive()) {
          try {
            if (GROUP[id] === 'card') await remount();
            if (env.home && env.alive()) await env.home(GROUP[id]);
            if (env.alive() && !(opt && opt.keepHeading)) await mv.faceCamera();
          } catch (e) { if (e && e !== STOP) console.error(e); }
        }
        running = null;
      }
      return ok && env.alive();
    },
    // the pieces the page's own card loop is built from (so it shares this implementation)
    climbUp, climbDown, remount, GRIP, DEEP,
  };
}
