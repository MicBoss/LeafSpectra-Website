// Leafity's gardening moments — the ONE definition shared by the Hand-Drawn Garden Concept
// website experiment and the Leafity Animation Studio, so both always play the same thing.
//
//   registerFarmClips(ch.animator);                  // adds the farmer clips (carry, water, …)
//   const farmer = createFarmer(ch, garden, env);    // garden = createGarden(THREE, ch)
//   await farmer.run('water', 'tomato');             // → true when it finished, false if cut short
//
// `env` tells the farmer where things are on the page or stage (all x/y in world units):
//   alive()               false once the moment must stop (visitor left, another demo started)
//   pause(sec)            a cancellable wait
//   go(x, hop)            walk (or hop) along the ground to x; resolves true when it got there
//   home()                walk back to Leafity's home spot and make it the standing spot again
//   face(x, amount)       a three-quarter turn toward x (never a full side view)
//   target(plant)         { left, px, near, water, soil } for 'tomato' | 'eggplant'
//   tray()                { stand, mid, x0, x1, soilY } or null when there is no seed tray
//   nudge(name, kind)     a small reaction of a drawing: ('tomato'|'eggplant', 'perk'|'rustle'), ('tray', 'wiggle')
//   calm()                back to the resting idle (ambient motion, pointer following)
//
// Every moment ends the same way, also when it is interrupted: tools put away, hat off,
// expression and gaze reset, Leafity walked back home and calm. Only one runs at a time.

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const win = (t, a, b, f = 0.12) => ss(a, a + f, t) * (1 - ss(b - f, b, t));
const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const kf = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * ss(a[0], b[0], t); }
  return keys[keys.length - 1][1];
};
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- clips ------------------------------------------------------------------------------------
// ctx.left: the tool is in the hand on the viewer's left (the plant/tray is on the left).
// ctx.tool(angle): sets the held tool's angle on screen — called every frame.
// ctx.onPour() / ctx.onHit(i): water drops while pouring / soil puffs at each hoe stroke.
export const FARM_CLIPS = {
  carry: {
    label: 'Carry Tool', duration: 2.4, loop: true, overlay: true, fade: [0.3, 0.3],
    sample(t, p, ctx) {
      const sw = 0.05 * Math.sin(TAU * t / 1.2), lift = ctx.lift ?? 0.95; // hand up at the side: a can hanging from its handle stays clear of the ground
      if (ctx.left) { p.armL += lift + sw; p.armLFwd += 0.3; } else { p.armR += lift + sw; p.armRFwd += 0.3; }
      ctx.tool && ctx.tool(ctx.angle ?? 0.05);
    },
  },
  water: {
    label: 'Water a Plant', duration: 4.3, idleMix: 1,
    sample(t, p, ctx) {
      const sg = ctx.left ? -1 : 1, up = win(t, 0.1, 3.9, 0.45), pour = win(t, 0.8, 3.0, 0.35);
      if (ctx.left) { p.armL += 0.95 + 0.25 * up + 0.1 * pour; p.armLFwd += 0.3; p.armLOut += 0.3 * up; p.armR += 0.15 * up; }
      else { p.armR += 0.95 + 0.25 * up + 0.1 * pour; p.armRFwd += 0.3; p.armROut += 0.3 * up; p.armL += 0.15 * up; }
      p.tilt += -sg * 0.07 * up;
      p.lean += 0.06 * up;
      p.lookX += sg * 0.55 * up; p.lookY += -0.35 * up;
      p.mouth += 0.3 * up; p.wide += 0.25 * pour;
      p.happy += win(t, 3.25, 4.25, 0.2);
      p.leafL += 0.09 * Math.sin(TAU * t / 0.8) * pour; p.leafR += 0.09 * Math.sin(TAU * t / 0.8 + 1) * pour;
      p.squash += 0.04 * bump(t, 3.55, 0.12);
      ctx.tool && ctx.tool(0.05 - 0.2 * up - 0.72 * pour);
      if (ctx.onPour) {
        if (pour > 0.6) { ctx.acc = (ctx.acc || 0) + Math.max(0, t - (ctx.pt ?? t)); while (ctx.acc > 0.055) { ctx.acc -= 0.055; ctx.onPour(); } }
        ctx.pt = t;
      }
    },
  },
  hoeWork: {
    label: 'Tend the Soil', duration: 3.8, idleMix: 1,
    sample(t, p, ctx) {
      const sg = ctx.left ? -1 : 1, e = win(t, 0.05, 3.6, 0.3);
      const r = kf(t, [[0, 1], [0.4, 1], [0.85, 0.26], [1.25, 1], [1.7, 0.26], [2.1, 1], [2.55, 0.26], [3.1, 0.7], [3.8, 1]]);
      const hit = bump(t, 0.85, 0.07) + bump(t, 1.7, 0.07) + bump(t, 2.55, 0.07);
      const A0 = ctx.armBase ?? 0.95; // hand high enough that the blade meets the tray soil, not the shelf
      if (ctx.left) { p.armL += A0 * e + 0.55 * r; p.armLFwd += 0.3 * e; p.armR += 0.1 * e; } else { p.armR += A0 * e + 0.55 * r; p.armRFwd += 0.3 * e; p.armL += 0.1 * e; }
      p.lean += 0.06 * e + 0.02 * hit;
      p.tilt += -sg * (0.05 * e + 0.04 * hit);
      p.squash += -0.07 * hit + 0.03 * r;
      p.lookX += sg * 0.6 * e; p.lookY += -0.45 * e;
      p.browL += 0.45 * e; p.browR += 0.45 * e; p.mouth += 0.35 * e; p.wide += 0.15 * e;
      p.leafL += 0.18 * hit; p.leafR += 0.18 * hit;
      ctx.tool && ctx.tool(0.8 + 0.7 * r - TAU); // one turn down: same pose, but the blend from the upright carry (-2.55) swings over the top, never through 'blade down'
      if (ctx.onHit) { [0.85, 1.7, 2.55].forEach((h, i) => { if ((ctx.ph ?? 0) < h && t >= h) ctx.onHit(i); }); ctx.ph = t; }
    },
  },
  farmerJoy: {
    label: 'Joyful Farmer', duration: 2.9, idleMix: 1, fx: [[0.35, 'sparkles', { n: 7, y: 0.1, r: 1.1 }]],
    sample(t, p, ctx) {
      const up = win(t, 0.1, 2.6, 0.35), b = Math.abs(Math.sin(Math.PI * t / 0.62)) * win(t, 0.25, 2.2, 0.15);
      if (ctx.left) { p.armL += 1.25 * up + 0.15 * Math.sin(TAU * t / 0.5) * up; p.armLOut += 0.4 * up; p.armR += 0.7 * up; }
      else { p.armR += 1.25 * up + 0.15 * Math.sin(TAU * t / 0.5) * up; p.armROut += 0.4 * up; p.armL += 0.7 * up; }
      p.rootY += 0.16 * b;
      p.squash += 0.06 * b - 0.05 * bump(t, 2.3, 0.1);
      p.tilt += 0.06 * Math.sin(TAU * t / 1.24) * up;
      p.happy += up > 0.3 ? 1 : 0; p.mouth += 0.5 * up;
      p.leafL += 0.25 * b; p.leafR += 0.25 * b;
      p.feet += 0.04 * b;
      ctx.tool && ctx.tool(-2.75 + 0.25 * Math.sin(TAU * t / 0.5) * up);
    },
  },
  proud: {
    label: 'Proud Gardener', duration: 3.1, idleMix: 1, fx: [[2.15, 'sparkles', { n: 5, y: 0.2, r: 0.9, size: 0.2 }]],
    sample(t, p, ctx) {
      const e = win(t, 0.1, 2.9, 0.4), u = clamp((t - 2.05) / 0.5), hop = 4 * u * (1 - u);
      p.lean += -0.07 * e; p.lookY += 0.25 * e; p.lookX += (ctx.left ? -0.25 : 0.25) * e;
      p.happy += t > 0.4 && t < 2.85 ? 1 : 0; p.mouth += 0.45 * e;
      if (ctx.left) { p.armR += -0.12 * e; p.armROut += 0.35 * e; p.armL += 0.95; p.armLFwd += 0.3; } else { p.armL += -0.12 * e; p.armLOut += 0.35 * e; p.armR += 0.95; p.armRFwd += 0.3; }
      p.leafL += 0.22 * e + 0.2 * hop; p.leafR += 0.22 * e + 0.2 * hop; p.sprout += 0.05 * Math.sin(TAU * t / 1.5) * e;
      p.rootY += 0.22 * hop; p.squash += 0.05 * hop - 0.06 * bump(t, 2.58, 0.07);
      ctx.tool && ctx.tool(0.05);
    },
  },
};

// What a studio or test panel can offer: [id, option, label]
export const FARM_ACTIONS = [
  ['water', 'tomato', 'Water Tomato'],
  ['water', 'eggplant', 'Water Eggplant'],
  ['hoe', null, 'Joyful Farmer with Hoe'],
  ['inspect', 'tomato', 'Farmer Inspection'],
  ['proud', null, 'Proud Gardener'],
  ['rustle', 'eggplant', 'Plant Surprise'],
  ['rest', null, 'Resting Farmer'],
  ['visit', 'tomato', 'Visit Tomato'],
  ['visit', 'eggplant', 'Visit Eggplant'],
  ['joy', null, 'Joyful Farmer Pose'],
];

export function registerFarmClips(animator) {
  Object.entries(FARM_CLIPS).forEach(([name, clip]) => animator.register(name, clip));
  if (!animator.stop) throw new Error('leafity-farm: the animator needs stop(name)');
}

export function createFarmer(ch, garden, env) {
  const A = ch.animator, mv = ch.mover, G = garden;
  const STOP = { stopped: true };
  let running = null;
  const lastPick = {};
  const pick = (key, list) => { let x; do { x = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && x === lastPick[key]); lastPick[key] = x; return x; };
  const step = async (p) => { const r = await p; if (!env.alive()) throw STOP; return r; };
  const tool = (name) => (a) => G.tool(name, a);

  const MOMENTS = {
    // notice the plant → hat and can → walk over → pour into its pot → it perks up → proud
    async water(plant) {
      let T = env.target(plant);
      const left = T.left;
      A.setLook(left ? -0.7 : 0.7, 0.1, 0.4);
      await step(env.pause(0.6));
      await hatOn();
      G.hold('can', left ? 'left' : 'right'); G.tool('can', 0.05, true);
      A.play('carry', { params: { left, tool: tool('can') } });
      A.clearLook();
      if (!(await step(env.go(T.water)))) return;
      T = env.target(plant);
      await step(env.face(T.px, 0.28));
      A.stop('carry');
      const soil = T.soil, s = ch.object.scale.x;
      await step(A.play('water', { params: { left, tool: tool('can'), onPour: () => G.drop1(soil, s) } }));
      env.nudge(plant, 'perk');
      A.play('carry', { params: { left, tool: tool('can') } });
      await step(mv.faceCamera());
      await step(A.play('proud', { params: { left, tool: tool('can') } }));
      if (Math.random() < 0.3) await rest();
      await step(env.home());
    },
    // hat and hoe (over the shoulder) → beside the seed tray → three small strokes → look → joy
    async hoe() {
      let T = env.tray();
      if (!T) return;
      await hatOn();
      G.hold('hoe', 'left'); G.tool('hoe', -2.55, true);
      A.setExpression('happy');
      A.play('carry', { params: { left: true, tool: tool('hoe'), angle: -2.55, lift: 0.75 } });
      if (!(await step(env.go(T.stand)))) return;
      T = env.tray();
      await step(env.face(T.mid, 0.3));
      A.stop('carry');
      const s = ch.object.scale.x;
      const hit = () => { const tip = G.tip('hoe'); G.puff(tip.set(Math.min(T.x1, Math.max(T.x0, tip.x)), T.soilY, 0), s, 3); env.nudge('tray', 'wiggle'); };
      await step(A.play('hoeWork', { params: { left: true, tool: tool('hoe'), onHit: hit } }));
      A.play('carry', { params: { left: true, tool: tool('hoe'), angle: -2.55, lift: 0.75 } }); // lift the hoe clear before the nod
      A.setLook(-0.6, -0.45, 0.3); await step(A.play('nod')); A.clearLook();
      await step(mv.faceCamera());
      await step(A.play('farmerJoy', { params: { left: true, tool: tool('hoe') } }));
      A.play('carry', { params: { left: true, tool: tool('hoe'), angle: -2.55, lift: 0.75 } });
      await step(env.pause(0.4));
      if (Math.random() < 0.3) await rest();
      await step(env.home());
    },
    // in the hat, with the magnifying glass
    async inspect(plant) {
      await hatOn();
      await look(plant, 'inspect');
      await step(A.play(pick('happy', ['happyHop', 'love'])));
      await step(env.home());
    },
    async proud() {
      await hatOn();
      G.hold('can', 'right'); G.tool('can', 0.05, true);
      A.play('carry', { params: { left: false, tool: tool('can') } });
      await step(env.pause(0.5));
      await step(A.play('proud', { params: { left: false, tool: tool('can') } }));
    },
    // a plant rustles; Leafity notices, and sometimes goes to see (no costume)
    async rustle(plant) {
      const T = env.target(plant);
      env.nudge(plant, 'rustle');
      await step(env.pause(0.35));
      await step(env.face(T.px, 0.3));
      A.setLook(T.left ? -0.7 : 0.7, 0, 0.3);
      await step(A.play(pick('notice', ['curiousTilt', 'surprised'])));
      A.clearLook();
      if (Math.random() < 0.5) { await look(plant, 'nod'); await step(env.home()); }
    },
    async rest() { await hatOn(); await rest(); },
    // Meet Leafity: hat on, hoe over the shoulder, the joyful farmer pose in place (no walking, no tray)
    async joy() {
      await hatOn();
      G.hold('hoe', 'left'); G.tool('hoe', -2.55, true);
      A.setExpression('happy');
      A.play('carry', { params: { left: true, tool: tool('hoe'), angle: -2.55, lift: 0.75 } });
      await step(env.pause(0.5));
      await step(A.play('farmerJoy', { params: { left: true, tool: tool('hoe') } }));
      A.play('carry', { params: { left: true, tool: tool('hoe'), angle: -2.55, lift: 0.75 } });
      await step(env.pause(0.4));
    },
    // the everyday plant visit (no costume): curious look or the magnifying glass, a happy reaction
    async visit(plant) {
      await look(plant, pick('visit', ['inspect', 'curiousTilt', 'inspect']));
      await step(A.play(pick('visit-happy', ['happyHop', 'love', 'nod'])));
      await step(env.home());
    },
  };
  async function hatOn() { G.hat(true); A.play('nod', { fx: false }); await step(env.pause(0.55)); }
  async function rest() { A.play('sit'); await step(env.pause(rnd(3.5, 5))); A.returnToIdle(); await step(env.pause(0.5)); }
  async function look(plant, clip) {
    let T = env.target(plant);
    if (!(await step(env.go(T.near)))) return;
    T = env.target(plant);
    await step(env.face(T.px, 0.3));
    A.setLook(T.left ? -0.6 : 0.6, -0.1, 0.3);
    await step(A.play(clip));
    A.clearLook();
    await step(mv.faceCamera());
  }

  return {
    moments: Object.keys(MOMENTS),
    get running() { return running; },
    // Runs one moment; resolves true when it played to the end, false when it was cut short.
    async run(what, opt) {
      if (running || !MOMENTS[what]) return false;
      running = what;
      const plant = opt || pick('plant', ['tomato', 'eggplant']);
      let ok = true;
      ch.followPointer(false); ch.setAmbient(false); A.clearLook();
      try { await MOMENTS[what](plant); } catch (e) { ok = false; if (e !== STOP) console.error(e); }
      finally {
        // the same ending every time: tools away, hat off, neutral face, home, calm
        G.drop('can'); G.drop('hoe');
        A.stop('carry');
        A.setExpression('neutral'); A.clearLook();
        if (env.alive()) {
          await env.pause(0.3);
          G.hat(false);
          if (env.alive()) await env.home();
          if (env.alive()) env.calm();
        } else G.clear();
        running = null;
      }
      return ok && env.alive();
    },
  };
}
