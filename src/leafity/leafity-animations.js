// Leafity animation system — independent of the model's geometry and of any renderer.
//
// A clip is { label, duration, loop?, overlay?, fade?, idleMix?, travel?, fx?, sample(t, pose, ctx) }.
// fx = [[time, kind, opts]] cues for optional add-on symbols (drawn by leafity-fx.js, never part of the model).
// sample() ADDS offsets from the rest pose into a pose of named channels, so clips can be
// layered and cross-faded by weight without ever snapping. On top of the clip layers the
// animator adds: an expression, automatic blinking, an eye/body look target, and spring
// follow-through on the sprout and leaves.
//
// Clips only move Leafity in place. Travelling through the scene (walking somewhere,
// climbing a path, peeking from an edge) is the movement controller's job: leafity-mover.js.
const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, abs = Math.abs;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const win = (t, a, b, f = 0.12) => ss(a, a + f, t) * (1 - ss(b - f, b, t));
const bump = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const kf = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * ss(a[0], b[0], t); }
  }
  return keys[keys.length - 1][1];
};

export const CHANNELS = [
  // whole character, in place
  'rootX', 'rootY', 'rootZ', 'turn', 'scale',
  // body
  'tilt', 'lean', 'twist', 'squash',
  // arms: raise, swing forward, shoulder reach, both shoulders up
  'armL', 'armR', 'armLFwd', 'armRFwd', 'armLOut', 'armROut', 'shrug',
  // feet: both up, each up, each forward
  'feet', 'footLY', 'footRY', 'footLZ', 'footRZ',
  // sprout and leaves
  'sprout', 'sproutX', 'leafL', 'leafR', 'flutL', 'flutR',
  // face
  'blink', 'lid', 'wide', 'happy', 'sleep', 'lookX', 'lookY', 'mouth', 'mouthO', 'browL', 'browR',
];
const SOFTEN = ['rootX', 'rootY', 'rootZ', 'tilt', 'lean', 'twist', 'squash', 'sprout', 'sproutX', 'leafL', 'leafR'];
const zero = () => { const p = {}; CHANNELS.forEach((c) => { p[c] = 0; }); return p; };

// ---- reusable motion blocks ---------------------------------------------------------
// Crouch → jump → soft landing. 1.6 s. h = jump height.
const hopB = (t, p, h = 0.6, face = true) => {
  p.squash += kf(t, [[0, 0], [0.22, -0.2], [0.34, 0.14], [0.6, 0.03], [0.92, 0.1], [1.02, -0.2], [1.2, 0.07], [1.36, -0.02], [1.6, 0]]);
  const u = clamp((t - 0.3) / 0.66);
  p.rootY += h * 4 * u * (1 - u);
  const a = kf(t, [[0, 0], [0.22, -0.15], [0.5, 0.95], [0.9, 0.8], [1.1, 0.2], [1.3, 0.05], [1.6, 0]]);
  p.armL += a; p.armR += a;
  const l = kf(t, [[0, 0], [0.22, 0.15], [0.4, -0.4], [0.7, 0.25], [0.98, 0.3], [1.08, -0.3], [1.25, 0.15], [1.4, -0.05], [1.6, 0]]);
  p.leafL += l; p.leafR += l;
  p.feet += 0.04 * win(t, 0.3, 0.96, 0.1);
  if (face) {
    p.happy += t > 0.18 && t < 1.3 ? 1 : 0;
    p.mouth += 0.35 * win(t, 0.2, 1.4);
  }
};
// Jump for travelling: longer anticipation (crouch, arms back), 0.66 s in the air from 0.34 s,
// then one soft landing squash that settles without a second bounce. 1.7 s.
const jumpB = (t, p, h = 0.7) => {
  p.squash += kf(t, [[0, 0], [0.2, -0.2], [0.3, -0.24], [0.4, 0.16], [0.66, 0.04], [0.94, 0.1], [1.04, -0.17], [1.24, 0.05], [1.42, -0.015], [1.7, 0]]);
  const u = clamp((t - 0.34) / 0.66);
  p.rootY += h * 4 * u * (1 - u);
  const a = kf(t, [[0, 0], [0.28, -0.3], [0.52, 1.0], [0.9, 0.85], [1.1, 0.3], [1.4, 0.05], [1.7, 0]]);
  p.armL += a; p.armR += a;
  p.lean += 0.08 * bump(t, 0.24, 0.14) - 0.05 * bump(t, 0.6, 0.2);
  const l = kf(t, [[0, 0], [0.28, 0.18], [0.46, -0.4], [0.76, 0.22], [1.0, 0.3], [1.1, -0.26], [1.3, 0.1], [1.5, -0.03], [1.7, 0]]);
  p.leafL += l; p.leafR += l;
  p.feet += 0.05 * win(t, 0.36, 0.98, 0.1);
  p.mouth += 0.25 * win(t, 0.3, 1.3, 0.2);
};
// Raise an arm (right by default) and wave three times. 2.8 s.
const waveB = (t, p, left = false) => {
  const raise = win(t, 0.1, 2.65, 0.35), arm = 1.05 * raise + 0.3 * sin(TAU * (t - 0.45) / 0.6) * win(t, 0.45, 2.25, 0.15);
  if (left) { p.armLOut += raise; p.armL += arm; p.armR += 0.1 * raise; } else { p.armROut += raise; p.armR += arm; p.armL += 0.1 * raise; }
  p.tilt += (left ? 0.1 : -0.1) * raise;
  p.mouth += 0.3 * raise;
  p.leafL += 0.08 * sin(TAU * t / 0.6) * raise;
  p.leafR += 0.08 * sin(TAU * t / 0.6 + 1) * raise;
};
// Waddle cycle: each foot is planted for half the cycle and slides back at constant speed
// (so a mover travelling at clip.travel does not make the feet skate), then swings forward.
const gait = (t, p, T, A, h) => {
  const ph = t / T;
  const foot = (u) => {
    u -= Math.floor(u);
    if (u < 0.5) return [A * (1 - 4 * u), 0];
    const s = (u - 0.5) * 2;
    return [-A + 2 * A * ss(0, 1, s), h * sin(PI * s)];
  };
  const l = foot(ph), r = foot(ph + 0.5);
  p.footLZ += l[0]; p.footLY += l[1]; p.footRZ += r[0]; p.footRY += r[1];
  return TAU * ph;
};

export const CLIPS = {
  // ---- A. Basic idle -----------------------------------------------------------------
  idle: {
    label: 'Idle Breathing', duration: 7.2, loop: true,
    sample(t, p) {
      p.squash += 0.02 * sin(TAU * t / 3.6);
      p.tilt += 0.035 * sin(TAU * t / 7.2);
      p.leafL += 0.07 * sin(TAU * t / 2.4);
      p.leafR += 0.07 * sin(TAU * t / 2.4 + 1.3);
      p.sprout += 0.045 * sin(TAU * t / 3.6 + 0.6);
      p.armL += 0.05 * sin(TAU * t / 3.6 + 0.4) + 0.2 * bump(t, 5.2, 0.22);
      p.armR += 0.05 * sin(TAU * t / 3.6 + 2) + 0.16 * bump(t, 2.1, 0.25);
    },
  },
  lookAround: {
    label: 'Look Around', duration: 5.2,
    sample(t, p) {
      const L = (x) => kf(x, [[0.2, 0], [1.0, -1], [1.9, -1], [3.0, 1], [3.9, 1], [4.8, 0]]);
      const eye = L(t), bod = L(t - 0.18), lag = L(t - 0.45);
      p.lookX += eye;
      p.twist += 0.32 * bod;
      p.tilt += -0.04 * bod;
      p.sprout += 0.24 * (bod - lag);
      p.leafL += 0.12 * (bod - lag);
      p.leafR += -0.12 * (bod - lag);
      p.armL += 0.06 * abs(bod);
      p.armR += 0.06 * abs(bod);
    },
  },
  curiousTilt: {
    label: 'Curious Tilt', duration: 2.6, fx: [[0.45, 'question', { dur: 1.9 }]],
    sample(t, p) {
      const e = win(t, 0.1, 2.45, 0.4);
      p.tilt += 0.2 * e;
      p.squash += 0.025 * sin(TAU * (t - 0.2) / 1.1) * e;
      p.wide += 0.6 * e;
      p.browR += e; p.browL += 0.3 * e;
      p.leafR += -0.5 * e; p.leafL += 0.12 * e;
      p.sprout += -0.06 * e;
      p.mouth += -0.3 * e;
      p.lookX += -0.3 * e; p.lookY += 0.2 * e;
      p.armL += 0.16 * e;
    },
  },
  blink: {
    label: 'Blinking', duration: 0.9, overlay: true,
    sample(t, p) { p.blink += Math.max(bump(t, 0.2, 0.055), bump(t, 0.5, 0.055)); },
  },
  doze: {
    label: 'Doze', duration: 5, loop: true, fade: [1.5, 0.5], idleMix: 1, fx: [[0.9, 'zzz']],
    sample(t, p) {
      const b = sin(TAU * t / 5), nod = bump(t, 3.6, 0.35);
      p.lid += 0.7; p.sleep += 1;
      p.lean += 0.09 + 0.03 * b + 0.07 * nod;
      p.tilt += 0.08;
      p.squash += 0.035 * b - 0.03;
      p.leafL += -0.6 + 0.04 * b;
      p.leafR += -0.5 + 0.04 * sin(TAU * t / 5 + 0.8);
      p.sprout += 0.1; p.sproutX += 0.12 + 0.05 * nod;
      p.armL += -0.12; p.armR += -0.12;
      p.mouth += -0.35;
    },
  },
  wakeUp: {
    label: 'Wake Up', duration: 2.8,
    sample(t, p) {
      const st = win(t, 1.0, 2.25, 0.35), yawn = win(t, 1.1, 1.95, 0.25);
      p.lid += kf(t, [[0, 0.75], [0.35, 0.5], [0.55, 0.75], [0.9, 0.1], [1.1, 0]]) + 0.45 * yawn;
      p.lean += kf(t, [[0, 0.09], [0.9, 0]]) - 0.07 * st;
      p.squash += 0.16 * st - 0.05 * bump(t, 2.4, 0.12);
      p.armL += 1.35 * st; p.armR += 1.35 * st;
      p.armLOut += 0.6 * st; p.armROut += 0.6 * st;
      const l = kf(t, [[0, -0.5], [0.6, -0.4], [0.95, 0.4], [1.4, 0.3], [2.3, 0.1], [2.8, 0]]);
      p.leafL += l; p.leafR += l;
      p.mouthO += 0.8 * yawn;
    },
  },

  // ---- B. Reactions and emotions -----------------------------------------------------
  happyHop: { label: 'Happy Hop', duration: 1.6, events: [[0.98, 'land']], sample(t, p) { hopB(t, p, 0.6); } },
  wave: { label: 'Wave', duration: 2.8, sample(t, p, ctx) { waveB(t, p, !!ctx.left); } },
  giggle: {
    label: 'Giggle', duration: 2.0,
    sample(t, p) {
      const e = win(t, 0.1, 1.85, 0.2), w = TAU * (t - 0.1) / 0.25;
      p.rootY += 0.07 * abs(sin(w / 2)) * e;
      p.squash += 0.05 * sin(w) * e;
      p.tilt += 0.05 * sin(w / 2) * e;
      p.leafL += 0.2 * sin(w) * e;
      p.leafR += 0.2 * sin(w + 2) * e;
      p.sprout += 0.08 * sin(w + 1) * e;
      p.armL += 0.55 * e + 0.08 * sin(w) * e;
      p.armR += 0.55 * e + 0.08 * sin(w) * e;
      p.happy += t > 0.14 && t < 1.75 ? 1 : 0;
      p.mouth += 0.35 * e;
    },
  },
  dance: {
    label: 'Dance', duration: 2.4, loop: true, idleMix: 1, fade: [0.25, 0.3],
    sample(t, p) {
      const b = t / 0.6, s = sin(PI * b);
      p.rootX += 0.09 * s;
      p.tilt += -0.12 * s;
      p.twist += 0.12 * s;
      p.rootY += 0.07 * abs(s);
      p.squash += 0.05 * Math.cos(TAU * b);
      p.footLY += 0.09 * Math.max(0, s);
      p.footRY += 0.09 * Math.max(0, -s);
      p.armL += 0.5 + 0.35 * s; p.armR += 0.5 - 0.35 * s;
      p.armLFwd += 0.3; p.armRFwd += 0.3;
      p.leafL += 0.2 * sin(TAU * b); p.leafR += 0.2 * sin(TAU * b + 1);
      p.sprout += 0.1 * sin(PI * b - 0.6);
      p.mouth += 0.35;
    },
  },
  celebrate: {
    label: 'Celebrate', duration: 2.3, events: [[1.14, 'land']], fx: [[0.5, 'confetti'], [0.55, 'sparkles']],
    sample(t, p) {
      p.squash += kf(t, [[0, 0], [0.24, -0.26], [0.36, 0.18], [0.7, 0.04], [1.06, 0.12], [1.16, -0.21], [1.36, 0.07], [1.56, -0.02], [1.9, 0]]);
      const u = clamp((t - 0.32) / 0.82);
      p.rootY += 0.9 * 4 * u * (1 - u);
      const up = kf(t, [[0, 0], [0.24, -0.12], [0.5, 1], [1.7, 1], [2.2, 0]]), shake = win(t, 0.5, 1.7, 0.1);
      p.armL += 1.5 * up + 0.12 * sin(TAU * t / 0.22) * shake;
      p.armR += 1.5 * up + 0.12 * sin(TAU * t / 0.22 + 1.5) * shake;
      p.armLOut += 0.8 * Math.max(0, up); p.armROut += 0.8 * Math.max(0, up);
      const l = kf(t, [[0, 0], [0.24, 0.2], [0.45, -0.45], [0.8, 0.3], [1.1, 0.35], [1.2, -0.4], [1.4, 0.2], [1.6, -0.08], [1.9, 0]]);
      p.leafL += l; p.leafR += l;
      p.happy += t > 0.2 && t < 1.9 ? 1 : 0;
      p.mouth += 0.5 * win(t, 0.2, 2.05);
      p.feet += 0.06 * win(t, 0.34, 1.1, 0.1);
    },
  },
  surprised: {
    label: 'Surprised', duration: 1.6, fx: [[0.06, 'exclaim']],
    sample(t, p) {
      const e = ss(0.02, 0.12, t) * (1 - ss(1.1, 1.55, t));
      const u = clamp((t - 0.05) / 0.36);
      p.rootY += 0.16 * 4 * u * (1 - u);
      p.rootZ += -0.18 * ss(0.05, 0.3, t) * (1 - ss(1.1, 1.6, t));
      p.squash += 0.1 * bump(t, 0.14, 0.09) - 0.1 * bump(t, 0.45, 0.08);
      p.lean += -0.07 * e;
      p.wide += e; p.mouthO += e; p.browL += e; p.browR += e;
      const spring = 0.55 * e + 0.25 * Math.exp(-4 * Math.max(0, t - 0.12)) * sin(TAU * (t - 0.12) / 0.28) * ss(0.08, 0.14, t);
      p.leafL += spring; p.leafR += spring;
      p.armL += 0.7 * e; p.armR += 0.7 * e;
      p.armLOut += 0.5 * e; p.armROut += 0.5 * e;
    },
  },
  nod: {
    label: 'Nod', duration: 1.5,
    sample(t, p) {
      const N = (x) => kf(x, [[0, 0], [0.25, 0.16], [0.5, -0.03], [0.75, 0.13], [1.05, 0]]);
      p.lean += N(t);
      p.squash += -0.2 * N(t);
      p.sproutX += -0.9 * (N(t) - N(t - 0.12));
      p.leafL += -0.5 * (N(t) - N(t - 0.14)); p.leafR += -0.5 * (N(t) - N(t - 0.14));
      p.blink += bump(t, 0.3, 0.06);
      p.mouth += 0.2 * win(t, 0.1, 1.3, 0.2);
    },
  },

  // ---- C. Website movement (in-place cycles; the mover adds the travel) -----------------
  walk: {
    label: 'Walking', duration: 0.6, loop: true, idleMix: 1, fade: [0.18, 0.22], travel: 0.13 * 4 / 0.6,
    events: [[0.01, 'step'], [0.31, 'step']],
    sample(t, p) {
      const w = gait(t, p, 0.6, 0.13, 0.07);
      p.tilt += 0.07 * sin(w);
      p.twist += 0.07 * sin(w + 1.2);
      p.rootY += 0.03 * abs(sin(w));
      p.lean += 0.04;
      p.armLFwd += -0.45 * Math.cos(w); p.armRFwd += 0.45 * Math.cos(w);
      p.armL += 0.1; p.armR += 0.1;
      p.leafL += 0.07 * sin(2 * w); p.leafR += 0.07 * sin(2 * w + 0.8);
      p.sprout += 0.05 * sin(w + 0.5);
    },
  },
  run: {
    label: 'Running', duration: 0.4, loop: true, idleMix: 1, fade: [0.15, 0.22], travel: 0.17 * 4 / 0.4,
    events: [[0.01, 'step'], [0.21, 'step']],
    sample(t, p) {
      const w = gait(t, p, 0.4, 0.17, 0.11);
      p.tilt += 0.05 * sin(w);
      p.twist += 0.1 * sin(w + 1.2);
      p.rootY += 0.06 * abs(sin(w));
      p.lean += 0.17;
      p.armL += 0.35; p.armR += 0.35;
      p.armLFwd += -0.9 * Math.cos(w); p.armRFwd += 0.9 * Math.cos(w);
      p.sproutX += -0.22;
      p.leafL += -0.18 + 0.1 * sin(2 * w); p.leafR += -0.18 + 0.1 * sin(2 * w + 0.8);
      p.mouth += 0.3;
    },
  },
  climb: {
    label: 'Climbing', duration: 0.9, loop: true, idleMix: 1, fade: [0.2, 0.25],
    sample(t, p, ctx) {
      const w = TAU * (ctx.dir < 0 ? 0.9 - t : t) / 0.9, r = 0.5 + 0.5 * sin(w), l = 1 - r;
      // one arm reaches up and out while the other pulls down; the opposite foot steps up with the reach
      p.armR += 0.45 + 0.95 * r; p.armL += 0.45 + 0.95 * l;
      p.armRFwd += 1.35; p.armLFwd += 1.35;
      p.armROut += 0.25 + 0.55 * r; p.armLOut += 0.25 + 0.55 * l;
      p.footLY += 0.14 * r; p.footRY += 0.14 * l;
      p.footLZ += 0.06 + 0.07 * r; p.footRZ += 0.06 + 0.07 * l;
      p.lean += 0.1 + 0.03 * sin(2 * w);
      p.tilt += 0.07 * sin(w); p.twist += 0.1 * sin(w);
      p.squash += 0.035 * sin(2 * w + 0.6);
      p.leafL += 0.06 * sin(2 * w); p.leafR += 0.06 * sin(2 * w + 1);
      p.lookY += ctx.dir < 0 ? -0.6 : 0.6;
    },
  },
  slide: {
    label: 'Sliding', duration: 1.5,
    sample(t, p, ctx) {
      const d = ctx.dir < 0 ? -1 : 1; // direction of travel along x
      const lean = kf(t, [[0, 0], [0.15, 1], [0.8, 1], [1.0, -0.5], [1.2, 0.2], [1.4, 0]]);
      p.tilt += 0.2 * d * lean;
      p.sprout += 0.25 * d * lean;
      p.squash += kf(t, [[0, 0], [0.15, -0.08], [0.8, -0.06], [0.98, -0.14], [1.15, 0.06], [1.3, -0.02], [1.5, 0]]);
      p.rootY += 0.08 * bump(t, 1.08, 0.08);
      const a = 0.7 * win(t, 0.05, 1.15, 0.2);
      p.armL += a; p.armR += a;
      p.leafL += -0.15 * Math.max(0, lean); p.leafR += -0.15 * Math.max(0, lean);
      p.mouth += 0.35 * win(t, 0.05, 1.3, 0.2);
    },
  },
  jump: {
    label: 'Jump to Position', duration: 1.7, events: [[1.0, 'land']],
    sample(t, p, ctx) { jumpB(t, p, ctx.height ?? 0.7); },
  },
  hang: {
    label: 'Hang From Edge', duration: 3.2, loop: true, idleMix: 1, fade: [0.25, 0.25],
    sample(t, p) {
      const w = TAU * t / 3.2;
      p.armL += 1.9; p.armR += 1.9; p.shrug += 1;
      p.tilt += 0.06 * sin(w);
      p.squash += 0.05;
      p.footLY += -0.07; p.footRY += -0.07;
      p.footLZ += 0.09 * sin(2 * w); p.footRZ += -0.09 * sin(2 * w);
      p.leafL += -0.85 + 0.05 * sin(w + 1); p.leafR += -0.85 + 0.05 * sin(w + 2.2);
      p.sprout += 0.08 * sin(w - 0.6);
      p.lookY += -0.5 + 0.9 * bump(t, 2.2, 0.4);
      p.mouth += -0.3;
      p.browL += 0.6; p.browR += 0.6;
    },
  },
  // ---- Edge behaviours (poses held while the mover does the peeking / shuffling) --------
  peekIdle: {
    label: 'Peeking', duration: 3, loop: true, idleMix: 0.7, fade: [0.2, 0.25],
    sample(t, p) {
      const w = TAU * t / 3;
      p.wide += 0.3; p.browL += 0.4; p.browR += 0.4;
      p.mouth += -0.2;
      p.squash += 0.02 * sin(w);
      p.armL += 0.2; p.armR += 0.2;
      p.leafL += 0.08 * sin(2 * w); p.leafR += 0.08 * sin(2 * w + 1.1);
    },
  },
  edgeGrip: {
    label: 'Edge Hang', duration: 3.2, loop: true, idleMix: 1, fade: [0.25, 0.25],
    sample(t, p) {
      const w = TAU * t / 3.2;
      p.armL += 0.95; p.armR += 0.95;
      p.armLFwd += 1.25; p.armRFwd += 1.25;
      p.armLOut += 0.3; p.armROut += 0.3;
      p.rootY += 0.03 * sin(w);
      p.wide += 0.25; p.browL += 0.3; p.browR += 0.3;
      p.lookX += 0.7 * sin(w);
      p.blink += bump(t, 1.6, 0.06);
      p.leafL += 0.08 * sin(2 * w); p.leafR += 0.08 * sin(2 * w + 1.3);
    },
  },
  sideCrawl: {
    label: 'Side Crawl', duration: 0.8, loop: true, idleMix: 1, fade: [0.2, 0.25],
    sample(t, p, ctx) {
      const d = ctx.dir < 0 ? -1 : 1, w = TAU * t / 0.8, r = 0.5 + 0.5 * sin(w), l = 1 - r;
      p.armL += 0.95 + 0.25 * l; p.armR += 0.95 + 0.25 * r;
      p.armLFwd += 1.25; p.armRFwd += 1.25;
      p.armLOut += 0.3 + 0.8 * l; p.armROut += 0.3 + 0.8 * r;
      p.tilt += 0.07 * sin(w);
      p.rootY += 0.04 * abs(sin(w));
      p.lookX += 0.7 * d;
      p.wide += 0.2;
      p.leafL += 0.1 * sin(2 * w); p.leafR += 0.1 * sin(2 * w + 1);
    },
  },
  sit: {
    label: 'Shelf Sit', duration: 6, loop: true, idleMix: 1, fade: [0.3, 0.3],
    sample(t, p, ctx) {
      // sitting down (ctx.age = seconds since the clip started): the feet first slide forward
      // over the edge, then the pot base lowers onto the surface with a soft settle.
      // ctx.flat: legs stay level and stick straight out (for a ledge drawn in front of the canvas,
      // where dangling feet would be hidden)
      const age = ctx.age ?? 9, k1 = ss(0, 0.4, age), k2 = ss(0.3, 0.75, age);
      const w = TAU * t / 3, hi = bump(t, 4.2, 0.45);
      p.rootY += -0.14 * k2;
      p.squash += (-0.04 + 0.02 * sin(w)) * k2 - 0.05 * bump(age, 0.74, 0.1);
      p.lean += -0.05 * k2;
      p.footLZ += (0.5 + 0.05 * sin(w)) * k1; p.footRZ += (0.5 - 0.05 * sin(w)) * k1;
      p.footLY += 0.03 * Math.max(0, sin(w)) + (ctx.flat ? 0.14 * k2 : 0); p.footRY += 0.03 * Math.max(0, -sin(w)) + (ctx.flat ? 0.14 * k2 : 0);
      p.armL += -0.12; p.armR += -0.12 + 1.2 * hi + 0.25 * sin(TAU * t / 0.5) * hi;
      p.armROut += hi;
      p.tilt += 0.04 * sin(w / 2) - 0.06 * hi;
      p.mouth += 0.2 + 0.2 * hi;
      p.leafL += 0.08 * sin(w + 0.5); p.leafR += 0.08 * sin(w + 1.7);
      p.sprout += 0.04 * sin(w / 2);
    },
  },

  // ---- Add-on moods (the symbols come from the fx cues) ------------------------------------
  love: {
    label: 'Very Happy', duration: 3.2, fx: [[0.4, 'hearts']],
    sample(t, p) {
      const e = win(t, 0.1, 3.0, 0.4);
      p.happy += t > 0.35 && t < 2.8 ? 1 : 0;
      p.mouth += 0.45 * e;
      p.tilt += 0.09 * sin(TAU * t / 1.4) * e;
      p.squash += 0.03 * sin(TAU * t / 0.7) * e;
      p.rootY += 0.04 * abs(sin(TAU * t / 1.4)) * e;
      p.armL += 0.75 * e; p.armR += 0.75 * e;
      p.armLFwd += 1.1 * e; p.armRFwd += 1.1 * e;
      p.leafL += 0.3 * e + 0.1 * sin(TAU * t / 0.5) * e; p.leafR += 0.3 * e + 0.1 * sin(TAU * t / 0.5 + 1.4) * e;
    },
  },
  discover: {
    label: 'Discovery', duration: 3.2, fx: [[0.25, 'ellipsis', { dur: 0.95 }], [1.25, 'bulb']],
    sample(t, p) {
      const th = win(t, 0.1, 1.3, 0.3), ah = ss(1.2, 1.4, t) * (1 - ss(2.7, 3.15, t)), u = clamp((t - 1.2) / 0.45);
      // hmm… → aha!
      p.tilt += -0.07 * th; p.lookX += -0.8 * th; p.lookY += 0.8 * th + 0.5 * ah;
      p.mouth += -0.35 * th + 0.5 * ah;
      p.browL += 0.6 * th + ah; p.browR += ah;
      p.armRFwd += 1.1 * th;
      p.armR += 0.9 * th + 1.6 * ah; p.armROut += 0.8 * ah;
      p.armL += 0.5 * ah;
      p.rootY += 0.14 * 4 * u * (1 - u);
      p.squash += -0.08 * bump(t, 1.15, 0.07) + 0.08 * bump(t, 1.35, 0.1);
      p.wide += 0.8 * ah;
      const l = 0.45 * ah + 0.2 * Math.exp(-4 * Math.max(0, t - 1.3)) * sin(TAU * (t - 1.3) / 0.3) * ss(1.25, 1.35, t);
      p.leafL += l; p.leafR += l;
    },
  },
  success: {
    label: 'Success', duration: 1.9, fx: [[0.35, 'check'], [0.4, 'sparkles', { n: 5 }]],
    sample(t, p) {
      const N = (x) => kf(x, [[0, 0], [0.25, 0.16], [0.5, -0.03], [0.75, 0.13], [1.05, 0]]), e = win(t, 0.15, 1.7, 0.25);
      p.lean += N(t);
      p.squash += -0.2 * N(t);
      p.sproutX += -0.9 * (N(t) - N(t - 0.12));
      p.armR += 1.2 * e; p.armROut += 0.6 * e;
      p.happy += t > 0.3 && t < 1.45 ? 1 : 0;
      p.mouth += 0.4 * e;
      p.leafL += 0.2 * e; p.leafR += 0.2 * e;
    },
  },

  // one full turn on the spot with a little hop (the turn ends where it began)
  spin: {
    label: 'Spin', duration: 1.4,
    sample(t, p) {
      const a = clamp((t - 0.28) / 0.7), e = win(t, 0.2, 1.15, 0.15);
      p.turn += TAU * ss(0.25, 1.0, t);
      p.rootY += 0.3 * 4 * a * (1 - a);
      p.squash += kf(t, [[0, 0], [0.2, -0.14], [0.34, 0.1], [0.9, 0.06], [1.02, -0.12], [1.2, 0.04], [1.4, 0]]);
      p.armL += 0.9 * e; p.armR += 0.9 * e;
      p.leafL += 0.25 * e; p.leafR += 0.25 * e;
      p.happy += t > 0.3 && t < 1.1 ? 1 : 0;
      p.mouth += 0.35 * e;
    },
  },
  // plays over 'hang': lets go with the right hand, waves, and takes hold again
  hangWave: {
    label: 'Hanging Wave', duration: 2.6, overlay: true,
    sample(t, p) {
      const w = win(t, 0.2, 2.4, 0.3);
      p.armR += -0.75 * w + 0.3 * sin(TAU * (t - 0.6) / 0.5) * win(t, 0.6, 2.1, 0.15);
      p.armROut += 0.6 * w;
      p.tilt += 0.1 * w;
      p.mouth += 0.6 * w;
      p.browL += -0.6 * w; p.browR += -0.6 * w;
      p.lookY += 0.5 * w;
    },
  },

  // Support clips used by the mover (not listed in the library)
  pullUp: {
    label: 'Pull Up', duration: 1.3,
    sample(t, p) {
      const a = kf(t, [[0, 1.9], [0.5, 1.2], [0.9, 0.1], [1.3, 0]]);
      p.armL += a; p.armR += a;
      p.shrug += kf(t, [[0, 1], [0.6, 0.4], [1.0, 0]]);
      p.squash += kf(t, [[0, 0.05], [0.3, -0.1], [0.7, 0.12], [1.0, -0.08], [1.3, 0]]);
      p.feet += 0.05 * win(t, 0.2, 0.9);
      p.lid += 0.4 * win(t, 0.1, 0.75, 0.15);
      const l = kf(t, [[0, -0.6], [0.6, -0.2], [0.95, 0.25], [1.3, 0]]);
      p.leafL += l; p.leafR += l;
    },
  },
  fall: {
    label: 'Fall', duration: 1, loop: true, idleMix: 1, fade: [0.1, 0.08],
    sample(t, p) {
      p.armL += 1.2; p.armR += 1.2; p.armLOut += 0.5; p.armROut += 0.5;
      p.wide += 0.7; p.mouthO += 0.8;
      p.leafL += 0.3; p.leafR += 0.3;
      p.feet += 0.03;
    },
  },
  land: {
    label: 'Land', duration: 0.9, events: [[0.02, 'land']],
    sample(t, p) {
      p.squash += kf(t, [[0, 0.08], [0.1, -0.19], [0.34, 0.05], [0.56, -0.015], [0.9, 0]]);
      const a = kf(t, [[0, 1.0], [0.25, 0.5], [0.9, 0]]);
      p.armL += a; p.armR += a;
      const l = kf(t, [[0, 0.3], [0.14, -0.35], [0.36, 0.15], [0.6, -0.05], [0.9, 0]]);
      p.leafL += l; p.leafR += l;
      p.wide += 0.5 * (1 - ss(0.1, 0.5, t));
    },
  },

  // ---- D. Interactive website behaviour -------------------------------------------------
  point: {
    label: 'Point at Something', duration: 2.8,
    sample(t, p, ctx) {
      const x = ctx.x ?? 1, y = ctx.y ?? 0.3, s = x >= 0 ? 1 : -1, e = win(t, 0.1, 2.6, 0.35);
      const raise = (clamp(Math.atan2(y, Math.max(0.25, abs(x))), -0.5, 1.2) + 0.35) * e
        + 0.08 * sin(TAU * (t - 0.6) / 0.45) * win(t, 0.6, 1.5, 0.1);
      if (s > 0) { p.armR += raise; p.armROut += 0.8 * e; } else { p.armL += raise; p.armLOut += 0.8 * e; }
      p.twist += 0.3 * s * e;
      p.tilt += -0.06 * s * e;
      p.sprout += -0.08 * s * e;
      // look at the target, back at the viewer, then at the target again
      const g = kf(t, [[0.1, 0], [0.5, 1], [1.2, 1], [1.5, 0], [2.0, 0], [2.3, 0.6], [2.7, 0]]);
      p.lookX += s * g * Math.min(1, abs(x) + 0.4);
      p.lookY += clamp(y, -1, 1) * g;
      p.lean += 0.08 * bump(t, 1.75, 0.12);
      p.mouth += 0.25 * e;
    },
  },
  think: {
    label: 'Thinking', duration: 3.6, fx: [[0.5, 'question', { dur: 2.5 }]],
    sample(t, p) {
      const e = win(t, 0.15, 3.35, 0.5);
      const tap = sin(TAU * (t - 1.1) / 0.55) * win(t, 1.1, 2.2, 0.15);
      const perk = bump(t, 2.7, 0.14);
      p.tilt += -0.08 * e;
      p.lean += 0.07 * e;
      p.squash += 0.02 * sin(TAU * (t - 0.3) / 1.2) * e;
      p.armR += 1.0 * e + 0.09 * tap;
      p.armRFwd += 1.2 * e;
      p.armROut += 0.3 * e;
      p.armL += -0.08 * e;
      p.lookX += -1 * e;
      p.lookY += 0.9 * e;
      p.browL += 0.7 * e;
      p.mouth += -0.4 * e;
      p.sprout += 0.09 * e + 0.035 * sin(TAU * t / 1.2) * e;
      p.leafL += (0.1 * sin(TAU * t / 1.8) - 0.08) * e + 0.3 * perk;
      p.leafR += (0.1 * sin(TAU * t / 1.8 + 1.4) + 0.04) * e + 0.3 * perk;
      p.rootY += 0.04 * perk;
    },
  },
  inspect: {
    label: 'Inspect', duration: 3.2, fx: [[0.35, 'glass', { dur: 2.5 }]],
    sample(t, p) {
      const e = win(t, 0.1, 3.0, 0.45);
      p.lean += 0.2 * e;
      p.rootZ += 0.1 * e;
      p.squash += -0.05 * e;
      p.tilt += kf(t, [[0, 0], [0.6, 0.09], [1.6, 0.09], [2.0, -0.1], [2.8, -0.08], [3.2, 0]]);
      p.lookY += -0.7 * e;
      p.lookX += 0.4 * sin(TAU * t / 2.2) * e;
      p.wide += 0.35 * e;
      p.browL += 0.6 * e; p.browR += 0.6 * e;
      p.blink += Math.max(bump(t, 1.25, 0.06), bump(t, 1.6, 0.06));
      p.armR += 0.75 * e; p.armRFwd += 1.0 * e;
      p.mouth += -0.35 * e;
      p.sproutX += 0.1 * e;
      p.leafL += 0.06 * sin(TAU * t / 1.4) * e; p.leafR += 0.06 * sin(TAU * t / 1.4 + 1) * e;
    },
  },
  greeting: {
    label: 'Greeting', duration: 4.8,
    sample(t, p) {
      // glance away → notice → turn to camera → wave → small happy hop
      const a0 = ss(0, 0.35, t), away = 1 - ss(0.75, 1.1, t), pop = bump(t, 0.72, 0.12), seen = win(t, 0.55, 1.3, 0.12);
      p.twist += -0.38 * a0 * away;
      p.lookX += -0.9 * a0 * (1 - ss(0.5, 0.7, t));
      p.wide += 0.8 * seen; p.browL += seen; p.browR += seen;
      p.leafL += 0.4 * pop; p.leafR += 0.4 * pop;
      p.squash += 0.07 * pop;
      if (t > 0.9) waveB(t - 0.9, p);
      if (t > 3.2) hopB(t - 3.2, p, 0.5);
    },
  },

  // ---- E. Plant-themed ------------------------------------------------------------------
  leafFlutter: {
    label: 'Leaf Flutter', duration: 2.4, overlay: true, fx: [[0.05, 'breeze']],
    sample(t, p) {
      const e = win(t, 0, 2.4, 0.4), f = TAU * t / 0.17;
      p.flutL += 0.38 * sin(f) * e; p.flutR += 0.38 * sin(f + 1.7) * e;
      p.leafL += 0.1 * sin(TAU * t / 0.6) * e; p.leafR += 0.1 * sin(TAU * t / 0.6 + 2) * e;
      p.sprout += 0.1 * sin(TAU * t / 1.2) * e;
      p.sproutX += 0.06 * sin(TAU * t / 0.8) * e;
    },
  },
  growing: {
    label: 'Growing', duration: 4.2,
    sample(t, p) {
      const cr = win(t, 0.05, 1.15, 0.35), up = ss(1.0, 2.3, t) * (1 - ss(3.5, 4.1, t)), joy = win(t, 2.45, 3.45, 0.15);
      p.squash += -0.2 * cr + 0.2 * up + 0.04 * sin(TAU * (t - 2.4) / 0.5) * joy;
      p.scale += -0.05 * cr + 0.1 * up;
      p.leafL += -0.55 * cr + 0.42 * up; p.leafR += -0.55 * cr + 0.42 * up;
      const fl = win(t, 1.2, 2.4, 0.3);
      p.flutL += 0.25 * sin(TAU * t / 0.3) * fl; p.flutR += -0.25 * sin(TAU * t / 0.3) * fl;
      p.armL += -0.1 * cr + 0.75 * up; p.armR += -0.1 * cr + 0.75 * up;
      p.armLOut += 0.5 * up; p.armROut += 0.5 * up;
      p.lookY += 0.6 * win(t, 1.0, 2.4, 0.3);
      p.happy += t > 2.45 && t < 3.5 ? 1 : 0;
      p.mouth += 0.4 * win(t, 2.3, 3.7, 0.2);
      p.rootY += 0.08 * abs(sin(TAU * (t - 2.5) / 0.8)) * joy;
    },
  },
  watering: {
    label: 'Watering Reaction', duration: 3.6, fx: [[0.1, 'water']],
    sample(t, p) {
      const e = win(t, 0.1, 3.4, 0.4);
      p.lookY += kf(t, [[0.1, 0], [0.6, 1], [1.1, 1], [1.4, 0.3], [3.2, 0.2], [3.6, 0]]);
      p.wide += 0.4 * win(t, 0.4, 1.1, 0.15);
      p.happy += t > 1.1 && t < 3.0 ? 1 : 0;
      p.mouth += 0.45 * win(t, 0.9, 3.2, 0.2);
      let d = 0, dl = 0, dr = 0; // imaginary droplets landing on alternate leaves
      [1.2, 1.55, 1.9, 2.25, 2.6].forEach((c, i) => { const b = bump(t, c, 0.09); d += b; if (i % 2) dl += b; else dr += b; });
      p.squash += -0.05 * d;
      p.leafL += 0.4 * e - 0.3 * dl; p.leafR += 0.4 * e - 0.3 * dr;
      p.rootY += 0.05 * abs(sin(TAU * (t - 1.1) / 0.7)) * win(t, 1.1, 3.0, 0.2);
      p.armL += 0.85 * e; p.armR += 0.85 * e;
      p.armLOut += 0.6 * e; p.armROut += 0.6 * e;
      p.lean += -0.07 * e;
    },
  },
  sunshine: {
    label: 'Sunshine', duration: 5.2, fx: [[0.3, 'sun', { dur: 4.4 }]],
    sample(t, p) {
      const e = win(t, 0.1, 5.0, 0.8);
      p.lookY += 0.8 * win(t, 0.1, 1.2, 0.3);
      p.lid += 0.3 * win(t, 0.5, 4.8, 0.3);
      p.sleep += t > 0.9 && t < 4.5 ? 1 : 0;
      p.lean += -0.1 * e;
      p.tilt += 0.07 * sin(TAU * (t - 0.5) / 2.6) * e;
      p.squash += 0.03 * e + 0.03 * sin(TAU * t / 2.6) * e;
      p.leafL += 0.45 * e + 0.05 * sin(TAU * t / 1.3) * e; p.leafR += 0.45 * e + 0.05 * sin(TAU * t / 1.3 + 1.2) * e;
      p.sprout += 0.06 * sin(TAU * (t - 0.9) / 2.6) * e;
      p.armL += 0.45 * e; p.armR += 0.45 * e;
      p.mouth += 0.25 * e;
    },
  },
  cheer: {
    label: 'Cheering', duration: 2.6,
    sample(t, p) {
      const e = win(t, 0.05, 2.5, 0.25), b = (t - 0.2) / 0.55, on = t > 0.2 && t < 2.4;
      const j = on ? abs(sin(PI * b)) : 0;
      p.rootY += 0.3 * j;
      p.squash += on ? 0.1 * (j - 0.45) : 0;
      p.feet += 0.05 * j;
      p.armL += 1.45 * e + 0.1 * sin(TAU * t / 0.275) * e; p.armR += 1.45 * e + 0.1 * sin(TAU * t / 0.275 + 1.4) * e;
      p.armLOut += 0.7 * e; p.armROut += 0.7 * e;
      p.leafL += 0.22 * sin(TAU * b) * e; p.leafR += 0.22 * sin(TAU * b + 0.9) * e;
      p.wide += 0.35 * e;
      p.mouth += 0.5 * e;
    },
  },
};

// Expressions are partial poses blended on top of whatever clip is playing.
export const EXPRESSIONS = {
  neutral: {},
  happy: { mouth: 0.45, lid: 0.16, leafL: 0.14, leafR: 0.14, armL: 0.1, armR: 0.1 },
  curious: { tilt: 0.08, browR: 1, browL: 0.35, wide: 0.45, mouth: -0.35, leafR: -0.22, lookY: 0.25 },
  sleepy: { lid: 0.5, leafL: -0.38, leafR: -0.32, mouth: -0.3, lean: 0.05, tilt: 0.04, armL: -0.08, armR: -0.08 },
  surprised: { wide: 1, mouthO: 1, browL: 1, browR: 1, leafL: 0.3, leafR: 0.3 },
};

// Maps pose channels onto the model's pivots.
export function applyPose(model, p) {
  const { parts: m, rest } = model;
  m.rig.position.set(p.rootX, p.rootY, p.rootZ);
  m.rig.rotation.y = p.turn;
  m.rig.scale.setScalar(1 + p.scale);
  m.body.rotation.set(p.lean, p.twist, p.tilt);
  m.body.scale.set(1 - p.squash * 0.5, 1 + p.squash, 1 - p.squash * 0.5);
  m.armL.rotation.z = rest.arm + p.armL;
  m.armR.rotation.z = rest.arm + p.armR;
  m.armL.rotation.y = PI + p.armLFwd;
  m.armR.rotation.y = -p.armRFwd;
  m.armL.position.set(-rest.armX - 0.12 * p.armLOut - 0.2 * p.shrug, rest.armY + 0.1 * p.armLOut + 0.42 * p.shrug, rest.armZ + 0.1 * p.armLOut);
  m.armR.position.set(rest.armX + 0.12 * p.armROut + 0.2 * p.shrug, rest.armY + 0.1 * p.armROut + 0.42 * p.shrug, rest.armZ + 0.1 * p.armROut);
  m.footL.position.set(-rest.footX, p.feet + p.footLY, rest.footZ + p.footLZ);
  m.footR.position.set(rest.footX, p.feet + p.footRY, rest.footZ + p.footRZ);
  m.sprout.rotation.z = p.sprout;
  m.sprout.rotation.x = p.sproutX;
  m.leafL.rotation.z = rest.leaf + p.leafL;
  m.leafR.rotation.z = rest.leaf + p.leafR;
  m.leafL.rotation.x = p.flutL;
  m.leafR.rotation.x = p.flutR;
  const o = clamp(p.mouthO);
  m.mouthSmile.scale.setScalar(Math.max(0.001, clamp(1 + p.mouth, 0.3, 1.8) * (1 - o)));
  m.mouthO.scale.setScalar(Math.max(0.001, o));
  const happy = p.happy > 0.5, sleep = !happy && p.sleep > 0.5;
  const wide = 1 + 0.16 * clamp(p.wide), lx = clamp(p.lookX, -1, 1), ly = clamp(p.lookY, -1, 1);
  m.eyes.forEach((e) => {
    e.open.visible = !happy && !sleep;
    e.happy.visible = happy;
    e.sleep.visible = sleep;
    e.open.scale.set(wide, wide * Math.max(0.08, 1 - p.blink - p.lid), 1);
    [e.pupil, e.glint].forEach((d) => {
      d.position.x = d.userData.base.x + 0.024 * lx;
      d.position.y = d.userData.base.y + 0.024 * ly;
    });
  });
  m.brows.forEach((b, i) => {
    const v = clamp(i ? p.browR : p.browL);
    b.visible = v > 0.04;
    b.scale.setScalar(Math.max(0.001, Math.min(1, v * 1.5)));
    b.children[0].position.y = 0.035 * v;
  });
}

// Animation state machine.
//   play(name, { loop, speed, params }) → Promise<boolean>  true = ran to the end, false = interrupted
//   returnToIdle(), replay(), pause(), resume(), reset(), setSpeed(x), setLoop(on)
//   setExpression(name | partialPose), setLook(x, y) / clearLook(), setAutoBlink(on), setIntensity(0..1)
//   on('start' | 'end' | 'loop' | 'event' | 'fx', fn) → unsubscribe   ('fx' = a clip's add-on cue; play(name, { fx: false }) mutes them)
export function createAnimator(model, { onChange } = {}) {
  const clips = { ...CLIPS };
  const listeners = {};
  const fire = (type, data) => (listeners[type] || []).slice().forEach((fn) => fn(data));
  let idleT = 0, layers = [], paused = false, speed = 1, current = 'idle', forceLoop = false, intensity = 1, autoBlink = true;
  const pose = zero(), tmp = zero(), expr = zero();
  let exprName = 'neutral', exprTarget = {};
  const look = { on: false, tx: 0, ty: 0, ex: 0, ey: 0, bx: 0, by: 0, body: 1 };
  const bl = { wait: 1.5 + Math.random() * 2, t: -1, n: 1 };
  const spr = { leaf: { x: 0, v: 0 }, side: { x: 0, v: 0 }, fwd: { x: 0, v: 0 }, px: null, py: 0, pz: 0 };
  const emit = () => onChange && onChange({ current, paused });
  const stepSpring = (s, target, dt) => {
    for (let left = dt; left > 1e-5; left -= 1 / 90) {
      const h = Math.min(left, 1 / 90);
      s.v += (160 * (target - s.x) - 7 * s.v) * h;
      s.x += s.v * h;
    }
  };
  const settle = (l, ok) => { if (l.resolve) { const r = l.resolve; l.resolve = null; r(ok); } };

  const render = () => {
    CHANNELS.forEach((c) => { pose[c] = 0; });
    let cover = 0;
    layers.forEach((l) => {
      CHANNELS.forEach((c) => { tmp[c] = 0; });
      l.ctx.age = l.age;
      l.clip.sample(Math.min(l.t, l.clip.duration), tmp, l.ctx);
      CHANNELS.forEach((c) => { pose[c] += tmp[c] * l.w; });
      if (!l.overlay) cover += l.w * (l.clip.idleMix ?? 0.8);
    });
    const iw = 1 - clamp(cover);
    CHANNELS.forEach((c) => { tmp[c] = 0; });
    clips.idle.sample(idleT, tmp, {});
    CHANNELS.forEach((c) => { pose[c] += tmp[c] * iw; });
    if (intensity !== 1) SOFTEN.forEach((c) => { pose[c] *= intensity; });
    CHANNELS.forEach((c) => { pose[c] += expr[c]; });
    pose.lookX += look.ex; pose.lookY += look.ey;
    pose.twist += 0.2 * look.bx; pose.tilt += -0.03 * look.bx; pose.lean += -0.05 * look.by;
    pose.sprout += 0.12 * (look.bx - look.ex);
    pose.blink += bl.t < 0 ? 0 : Math.max(bump(bl.t, 0.09, 0.05), bl.n > 1 ? bump(bl.t, 0.35, 0.05) : 0);
    pose.leafL += spr.leaf.x; pose.leafR += spr.leaf.x;
    pose.sprout += spr.side.x; pose.sproutX += spr.fwd.x;
    applyPose(model, pose);
  };

  const api = {
    clips,
    names: () => Object.keys(clips),
    register(name, clip) { clips[name] = clip; },
    get current() { return current; },
    get paused() { return paused; },
    get speed() { return speed; },
    get expression() { return exprName; },
    get loop() { return forceLoop; },
    setSpeed(s) { speed = s; },
    setLoop(on) { forceLoop = !!on; },
    setIntensity(x) { intensity = x; },
    setAutoBlink(on) { autoBlink = !!on; },
    on(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
      return () => { listeners[type] = listeners[type].filter((f) => f !== fn); };
    },
    play(name, opts = {}) {
      const clip = clips[name];
      if (!clip) return Promise.resolve(false);
      return new Promise((resolve) => {
        const layer = { clip, name, t: 0, w: 0, out: false, overlay: !!clip.overlay, loop: opts.loop ?? !!clip.loop, speed: opts.speed ?? 1, ctx: { ...(opts.params || {}) }, age: 0, fx: opts.fx !== false, resolve };
        if (layer.overlay) { layers.push(layer); return; }
        layers.forEach((l) => { if (!l.overlay) { l.out = true; settle(l, false); } });
        if (name === 'idle') resolve(true); else layers.push(layer);
        current = name;
        paused = false;
        emit();
        fire('start', { name });
      });
    },
    replay() { return api.play(current); },
    // stop a playing layer by name (e.g. an overlay such as the farmer's 'carry'); it fades out
    stop(name) { layers.forEach((l) => { if (l.name === name && !l.out) { l.out = true; settle(l, false); } }); },
    returnToIdle() { return api.play('idle'); },
    pause() { paused = true; emit(); },
    resume() { paused = false; emit(); },
    setExpression(e) {
      if (typeof e === 'string') { exprName = EXPRESSIONS[e] ? e : 'neutral'; exprTarget = EXPRESSIONS[exprName]; } else { exprName = 'custom'; exprTarget = e || {}; }
    },
    // x, y in -1..1 in Leafity's own frame (+x = its left / viewer's right when facing the camera)
    setLook(x, y, bodyFollow = 1) { look.on = true; look.tx = clamp(x, -1, 1); look.ty = clamp(y, -1, 1); look.body = bodyFollow; },
    clearLook() { look.on = false; look.tx = look.ty = 0; },
    reset() {
      layers.forEach((l) => settle(l, false));
      layers = []; idleT = 0; current = 'idle'; paused = false;
      CHANNELS.forEach((c) => { expr[c] = 0; });
      exprName = 'neutral'; exprTarget = {};
      look.on = false; look.tx = look.ty = look.ex = look.ey = look.bx = look.by = 0;
      [spr.leaf, spr.side, spr.fwd].forEach((s) => { s.x = s.v = 0; });
      spr.px = null;
      render(); emit();
    },
    rest() { applyPose(model, zero()); },
    progress() {
      const l = layers.find((x) => !x.out && !x.overlay);
      return l ? clamp(l.t / l.clip.duration) : idleT / clips.idle.duration;
    },
    update(dt) {
      if (paused) return;
      dt = Math.min(dt, 0.1) * speed;
      if (dt <= 0) return;
      idleT = (idleT + dt) % clips.idle.duration;
      let ended = false;
      layers.forEach((l) => {
        const before = l.t;
        l.t += dt * l.speed;
        l.age += dt * l.speed;
        (l.clip.events || []).forEach((ev) => { if (before < ev[0] && l.t >= ev[0]) fire('event', { clip: l.name, name: ev[1] }); });
        if (l.fx && !l.out) (l.clip.fx || []).forEach((c) => { if (before < c[0] && l.t >= c[0]) fire('fx', { clip: l.name, kind: c[1], opts: c[2] || {} }); });
        if (!l.out && l.t >= l.clip.duration) {
          if (l.loop || (forceLoop && !l.overlay)) { l.t %= l.clip.duration; fire('loop', { name: l.name }); } else {
            l.dead = true;
            if (!l.overlay) ended = true;
            fire('end', { name: l.name });
            settle(l, true);
          }
        }
        const f = l.clip.fade || [0.14, 0.2];
        l.w = l.out ? Math.max(0, l.w - dt / f[1]) : Math.min(1, l.w + dt / f[0]);
        if (l.out && l.w <= 0) l.dead = true;
      });
      layers = layers.filter((l) => !l.dead);
      if (ended && current !== 'idle') { current = 'idle'; emit(); }

      // expression blend
      const ke = 1 - Math.exp(-dt * 7);
      CHANNELS.forEach((c) => { expr[c] += ((exprTarget[c] || 0) - expr[c]) * ke; });
      // eyes lead, body follows late
      const kEye = 1 - Math.exp(-dt * 12), kBody = 1 - Math.exp(-dt * 2.5);
      look.ex += (look.tx - look.ex) * kEye; look.ey += (look.ty - look.ey) * kEye;
      look.bx += (look.tx * look.body - look.bx) * kBody; look.by += (look.ty * look.body - look.by) * kBody;
      // automatic blinking, with the occasional double blink
      if (bl.t < 0) {
        if (autoBlink && (bl.wait -= dt) <= 0) { bl.t = 0; bl.n = Math.random() < 0.25 ? 2 : 1; }
      } else if ((bl.t += dt) > (bl.n > 1 ? 0.52 : 0.26)) { bl.t = -1; bl.wait = 2.2 + Math.random() * 3.5; }
      // follow-through: sprout and leaves trail the character's actual motion
      const r = model.root, x = r.position.x, y = r.position.y + pose.rootY * r.scale.y, z = r.position.z;
      if (spr.px !== null) {
        const vx = (x - spr.px) / dt, vy = (y - spr.py) / dt, vz = (z - spr.pz) / dt;
        if (abs(vx) + abs(vy) + abs(vz) < 40) { // ignore teleports
          const h = r.rotation.y, c = Math.cos(h), s = Math.sin(h), sc = r.scale.x || 1;
          stepSpring(spr.leaf, clamp(-0.05 * vy / sc, -0.3, 0.3), dt);
          stepSpring(spr.side, clamp(0.07 * (vx * c - vz * s) / sc, -0.3, 0.3), dt);
          stepSpring(spr.fwd, clamp(-0.07 * (vx * s + vz * c) / sc, -0.3, 0.3), dt);
        }
      }
      spr.px = x; spr.py = y; spr.pz = z;
      render();
    },
    dispose() { layers.forEach((l) => settle(l, false)); layers = []; Object.keys(listeners).forEach((k) => { delete listeners[k]; }); },
  };
  render();
  return api;
}
