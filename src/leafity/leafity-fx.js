// Leafity add-ons — optional, lightweight symbols and props that pop up around Leafity
// during some animations: question mark, thinking bubble, lightbulb, check mark, sparkles,
// confetti, hearts, Zzz, exclamation mark, sun, leaf breeze, watering can + water,
// magnifying glass.
//
// They are camera-facing sprites drawn on a small canvas (flat fills + Leafity's brown
// outline), kept in their own group beside the character. Nothing here is part of the
// model or of an export, and the whole layer can be switched off.
//
//   const fx = createFx(THREE, model);
//   fx.spawn('question');  fx.spawn('sun', { dur: 4 });   // kinds: Object.keys(FX_KINDS)
//   fx.setEnabled(false);  fx.fadeAll();  fx.update(dt);  fx.dispose();
const BROWN = '#5b3a1e', TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const outBack = (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
const outCubic = (u) => 1 - (1 - u) ** 3;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- icon drawings (128 × 128) -------------------------------------------------------
const glyph = (c, ch, fill, size = 104) => {
  c.font = `900 ${size}px "Baloo 2", "Nunito", system-ui, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = 16; c.strokeStyle = BROWN; c.strokeText(ch, 64, 70);
  c.fillStyle = fill; c.fillText(ch, 64, 70);
};
const ink = (c, fill, w = 7) => { c.lineJoin = 'round'; c.lineCap = 'round'; c.fillStyle = fill; c.fill(); c.lineWidth = w; c.strokeStyle = BROWN; c.stroke(); };
const star = (c, n, r1, r2, rot = -Math.PI / 2) => {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; c[i ? 'lineTo' : 'moveTo'](64 + r * Math.cos(a), 64 + r * Math.sin(a)); }
  c.closePath();
};
const DRAW = {
  question: (c) => glyph(c, '?', '#ffd95a'),
  exclaim: (c) => glyph(c, '!', '#ff9a5c'),
  zzz: (c) => glyph(c, 'Z', '#ffffff', 92),
  ellipsis(c) {
    c.beginPath(); c.roundRect(12, 26, 104, 62, 30); ink(c, '#fffaf0');
    c.beginPath(); c.moveTo(34, 84); c.lineTo(26, 108); c.lineTo(54, 86); ink(c, '#fffaf0');
    c.fillStyle = '#fffaf0'; c.fillRect(34, 76, 20, 9);
    c.fillStyle = BROWN; [40, 64, 88].forEach((x) => { c.beginPath(); c.arc(x, 57, 7.5, 0, TAU); c.fill(); });
  },
  bulb(c) {
    c.strokeStyle = '#ffb938'; c.lineWidth = 7; c.lineCap = 'round';
    [-1.15, -0.55, 0, 0.55, 1.15].forEach((a) => { c.beginPath(); c.moveTo(64 + 47 * Math.sin(a), 54 - 47 * Math.cos(a)); c.lineTo(64 + 58 * Math.sin(a), 54 - 58 * Math.cos(a)); c.stroke(); });
    c.beginPath(); c.roundRect(50, 84, 28, 26, 6); ink(c, '#b9c0c4');
    c.beginPath(); c.arc(64, 54, 34, 0, TAU); ink(c, '#ffd95a');
    c.strokeStyle = '#fff6c9'; c.lineWidth = 6; c.beginPath(); c.arc(64, 54, 22, -2.6, -1.7); c.stroke();
  },
  check(c) {
    c.beginPath(); c.arc(64, 64, 48, 0, TAU); ink(c, '#8ecb3c');
    c.strokeStyle = '#fffaf0'; c.lineWidth = 15; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(41, 66); c.lineTo(57, 82); c.lineTo(88, 48); c.stroke();
  },
  sparkle(c) {
    c.beginPath(); c.moveTo(64, 8);
    c.quadraticCurveTo(70, 58, 120, 64); c.quadraticCurveTo(70, 70, 64, 120);
    c.quadraticCurveTo(58, 70, 8, 64); c.quadraticCurveTo(58, 58, 64, 8);
    ink(c, '#ffe27a', 5);
  },
  star(c) { star(c, 5, 52, 23); ink(c, '#ffd95a'); },
  heart(c) {
    c.beginPath(); c.moveTo(64, 108);
    c.bezierCurveTo(8, 70, 14, 22, 44, 22); c.bezierCurveTo(56, 22, 64, 32, 64, 40);
    c.bezierCurveTo(64, 32, 72, 22, 84, 22); c.bezierCurveTo(114, 22, 120, 70, 64, 108);
    ink(c, '#f47c8f');
  },
  sun(c) { star(c, 10, 58, 40); ink(c, '#ffb938', 6); c.beginPath(); c.arc(64, 64, 32, 0, TAU); ink(c, '#ffd95a', 6); },
  drop(c) { c.beginPath(); c.moveTo(64, 14); c.bezierCurveTo(100, 62, 100, 112, 64, 112); c.bezierCurveTo(28, 112, 28, 62, 64, 14); ink(c, '#7cc8f2', 8); },
  leaf(c) {
    c.beginPath(); c.moveTo(14, 98); c.quadraticCurveTo(20, 30, 110, 20); c.quadraticCurveTo(100, 104, 14, 98); ink(c, '#8fcf3e', 8);
    c.beginPath(); c.moveTo(24, 90); c.lineTo(82, 46); c.lineWidth = 5; c.stroke();
  },
  bit(c) { c.beginPath(); c.roundRect(22, 40, 84, 48, 12); c.fillStyle = '#ffffff'; c.fill(); },
  // watering can, spout to the left
  can(c) {
    c.lineWidth = 9; c.strokeStyle = BROWN; c.lineCap = 'round';
    c.beginPath(); c.ellipse(101, 76, 17, 21, 0, -1.9, 1.9); c.stroke(); // handle
    c.beginPath(); c.moveTo(56, 78); c.lineTo(22, 44); c.lineTo(12, 54); c.lineTo(52, 98); c.closePath(); ink(c, '#74c2cf'); // spout
    c.beginPath(); c.ellipse(15, 46, 15, 8, -0.8, 0, TAU); ink(c, '#b9e3ea', 6); // rose
    c.beginPath(); c.roundRect(48, 52, 54, 58, 12); ink(c, '#8fd3e0');
    c.beginPath(); c.roundRect(54, 40, 42, 14, 6); ink(c, '#74c2cf', 6);
  },
  // magnifying glass
  glass(c) {
    c.strokeStyle = BROWN; c.lineWidth = 16; c.lineCap = 'round';
    c.beginPath(); c.moveTo(78, 78); c.lineTo(110, 110); c.stroke();
    c.beginPath(); c.arc(50, 50, 34, 0, TAU); c.fillStyle = 'rgba(200, 235, 255, 0.6)'; c.fill(); c.lineWidth = 10; c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)'; c.lineWidth = 6; c.beginPath(); c.arc(50, 50, 22, -2.7, -1.8); c.stroke();
  },
};
const CONFETTI = ['#f47c8f', '#ffd95a', '#8ecb3c', '#7cc8f2', '#ff9a5c'];

export function createFx(THREE, model) {
  const root = model.root;
  const group = new THREE.Group();
  group.name = 'LeafityFx';
  const textures = new Map();
  const head = new THREE.Vector3(), feet = new THREE.Vector3(), tmp = new THREE.Vector3();
  let parts = [], enabled = true, owner = '', placed = false;

  const texture = (kind) => {
    let t = textures.get(kind);
    if (!t) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      DRAW[kind](cv.getContext('2d'));
      t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      textures.set(kind, t);
    }
    return t;
  };
  // One sprite with a life. tick(p, t, u) places it each frame (t = seconds alive, u = 0..1).
  const add = (kind, { life = 1.5, delay = 0, color, tick }) => {
    const mat = new THREE.SpriteMaterial({ map: texture(kind), transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    if (color) mat.color.set(color);
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 10;
    sprite.visible = false;
    group.add(sprite);
    const p = { sprite, mat, age: -delay, life, tick, owner };
    parts.push(p);
    return p;
  };
  const pop = (t, life) => (t < 0.22 ? outBack(t / 0.22) : 1) * (0.7 + 0.3 * clamp((life - t) / 0.25));
  const fade = (t, life, tail = 0.25) => clamp(t / 0.08) * clamp((life - t) / tail);
  // A symbol that pops in near the head, bobs, and fades out. (0, 0) = top of the sprout.
  const symbol = (kind, { x = 0, y = 0.3, size = 0.6, dur = 1.8, delay = 0, bounce = false, shake = false, spin = 0 }) => add(kind, {
    life: dur, delay,
    tick(p, t) {
      const s = size * pop(t, dur);
      p.sprite.scale.set(s, s, 1);
      p.sprite.position.set(
        x + (shake ? 0.035 * Math.sin(42 * t) * Math.exp(-6 * t) : 0),
        y + 0.03 * Math.sin(3 * t) + (bounce ? 0.2 * Math.abs(Math.sin(Math.PI * t / 0.42)) * Math.exp(-3.2 * t) : 0), 0);
      p.mat.rotation = spin * t;
      p.mat.opacity = fade(t, dur);
    },
  });
  const sparkles = ({ n = 7, x = 0, y = -0.2, r = 1.0, size = 0.26, delay = 0 } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = (i + rnd(0, 0.6)) / n * TAU, d = r * rnd(0.7, 1.1), sz = size * rnd(0.7, 1.2), life = rnd(0.7, 1.0);
      add('sparkle', { life, delay: delay + rnd(0, 0.15), tick(p, t, u) {
        const k = outCubic(u), s = sz * Math.sin(Math.PI * u);
        p.sprite.position.set(x + Math.cos(a) * d * k, y + Math.sin(a) * d * 0.8 * k, 0);
        p.sprite.scale.set(s, s, 1);
        p.mat.rotation = t * 2;
        p.mat.opacity = 1;
      } });
    }
  };
  const handPoint = (out) => {
    const s = root.scale.x || 1;
    model.parts.armR.localToWorld(out.set(0.36, 0, 0)).sub(group.position).divideScalar(s);
    return out;
  };

  const KINDS = {
    question: (o) => symbol('question', { x: o.x ?? 0.45, y: 0.32, size: 0.62, dur: o.dur ?? 2, delay: o.delay ?? 0, bounce: true }), // o.x: -0.45 puts it on the left
    exclaim: (o) => { symbol('exclaim', { x: 0, y: 0.5, size: 0.72, dur: o.dur ?? 1.1, shake: true }); sparkles({ n: 5, y: 0.45, r: 0.6, size: 0.18 }); },
    ellipsis: (o) => symbol('ellipsis', { x: 0.52, y: 0.3, size: 0.66, dur: o.dur ?? 1.6 }),
    bulb: (o) => { symbol('bulb', { x: 0, y: 0.55, size: 0.74, dur: o.dur ?? 1.7, bounce: true }); sparkles({ n: 6, y: 0.55, r: 0.75, size: 0.2, delay: 0.05 }); },
    check: (o) => symbol('check', { x: 0.5, y: 0.32, size: 0.56, dur: o.dur ?? 1.4, bounce: true }),
    star: (o) => symbol('star', { x: 0, y: 0.5, size: 0.6, dur: o.dur ?? 1.2, bounce: true, spin: 1.5 }),
    sun: (o) => symbol('sun', { x: 0.95, y: 0.75, size: 0.95, dur: o.dur ?? 4, spin: 0.35 }),
    sparkles: (o) => sparkles(o),
    confetti(o) {
      const n = o.n ?? 18;
      for (let i = 0; i < n; i++) {
        const vx = rnd(-1.3, 1.3), vy = rnd(1.6, 3), sz = rnd(0.09, 0.15), spin = rnd(-7, 7), life = rnd(1.2, 1.7), x0 = rnd(-0.3, 0.3);
        add('bit', { life, delay: rnd(0, 0.12), color: CONFETTI[i % CONFETTI.length], tick(p, t) {
          p.sprite.position.set(x0 + vx * t, -0.5 + vy * t - 2.4 * t * t, 0);
          p.sprite.scale.set(sz, sz * (0.55 + 0.45 * Math.abs(Math.cos(spin * t))), 1);
          p.mat.rotation = spin * t;
          p.mat.opacity = fade(t, life, 0.4);
        } });
      }
    },
    hearts(o) {
      const n = o.n ?? 4;
      for (let i = 0; i < n; i++) {
        const x0 = (i % 2 ? 1 : -1) * rnd(0.25, 0.6), sz = rnd(0.24, 0.36), life = 1.6;
        add('heart', { life, delay: i * 0.3, tick(p, t) {
          const s = sz * pop(t, life);
          p.sprite.position.set(x0 + 0.08 * Math.sin(3 * t + i), 0.05 + 0.5 * t, 0);
          p.sprite.scale.set(s, s, 1);
          p.mat.opacity = fade(t, life, 0.5);
        } });
      }
    },
    zzz() {
      for (let i = 0; i < 3; i++) {
        const life = 1.8, sz = 0.26 + 0.1 * i;
        add('zzz', { life, delay: i * 0.55, tick(p, t) {
          const s = sz * (0.6 + 0.4 * clamp(t / 0.4));
          p.sprite.position.set(0.4 + 0.2 * t + 0.05 * Math.sin(4 * t), 0.05 + 0.32 * t, 0);
          p.sprite.scale.set(s, s, 1);
          p.mat.rotation = -0.2;
          p.mat.opacity = fade(t, life, 0.6);
        } });
      }
    },
    // a few leaves carried round Leafity by a breeze
    breeze() {
      for (let i = 0; i < 6; i++) {
        const a0 = i / 6 * TAU, y0 = -1.5 + i * 0.22, life = 1.95, sz = rnd(0.16, 0.24);
        add('leaf', { life, delay: i * 0.05, tick(p, t) {
          const a = a0 + 2.8 * t, depth = Math.sin(a);
          p.sprite.position.set(Math.cos(a) * 1.05, y0 + 0.35 * t + 0.06 * Math.sin(5 * t + i), depth);
          const s = sz * (0.85 + 0.15 * depth);
          p.sprite.scale.set(s, s, 1);
          p.mat.rotation = a;
          p.mat.opacity = fade(t, life, 0.5) * (0.6 + 0.4 * (depth > 0 ? 1 : 0.5));
        } });
      }
    },
    // watering can tips over and pours onto the leaves
    water(o) {
      const life = o.dur ?? 3.2, cx = 0.82, cy = 0.5, size = 0.82, tilt = 0.65;
      add('can', { life, tick(p, t) {
        const s = size * pop(t, life);
        p.sprite.position.set(cx, cy + 0.03 * Math.sin(3 * t), 0);
        p.sprite.scale.set(s, s, 1);
        p.mat.rotation = tilt * ss(0.45, 0.9, t) * (1 - ss(life - 0.6, life - 0.25, t));
        p.mat.opacity = fade(t, life);
      } });
      // spout tip once tipped: the can's local (-0.4, 0.12) rotated by `tilt`
      const tx = cx + size * (-0.4 * Math.cos(tilt) - 0.12 * Math.sin(tilt)), ty = cy + size * (-0.4 * Math.sin(tilt) + 0.12 * Math.cos(tilt));
      const drops = Math.round((life - 1.55) / 0.085);
      for (let i = 0; i < drops; i++) {
        const x1 = rnd(-0.32, 0.2), y1 = rnd(-0.32, -0.12), dl = 0.5;
        add('drop', { life: dl, delay: 0.95 + i * 0.085, tick(p, t, u) {
          p.sprite.position.set(tx + (x1 - tx) * u, ty + (y1 - ty) * u * u, 0);
          p.sprite.scale.set(0.13, 0.13, 1);
          p.mat.rotation = 0.35;
          p.mat.opacity = clamp(u / 0.15) * clamp((1 - u) / 0.2);
        } });
      }
    },
    // magnifying glass held in the right hand
    glass(o) {
      const life = o.dur ?? 2.5;
      add('glass', { life, tick(p, t) {
        const s = 0.6 * pop(t, life);
        handPoint(tmp);
        p.sprite.position.set(tmp.x - 0.12, tmp.y + 0.2, 0);
        p.sprite.scale.set(s, s, 1);
        p.mat.rotation = 0.1 * Math.sin(2 * t);
        p.mat.opacity = fade(t, life);
      } });
    },
  };

  const remove = (p) => { group.remove(p.sprite); p.mat.dispose(); };
  const api = {
    group,
    kinds: Object.keys(KINDS),
    get enabled() { return enabled; },
    setEnabled(on) { enabled = !!on; if (!enabled) api.fadeAll(); },
    // by = name of the animation the add-on belongs to (so it can be cleared with it)
    spawn(kind, opts = {}, by = '') {
      if (!enabled || !KINDS[kind] || typeof document === 'undefined') return false;
      owner = by;
      KINDS[kind](opts);
      owner = '';
      return true;
    },
    // Fade the add-ons that belong to one animation (called when it ends or is interrupted).
    fade(by) {
      parts = parts.filter((p) => { if (p.owner !== by) return true; if (p.age < 0) { remove(p); return false; } p.life = Math.min(p.life, p.age + 0.25); return true; });
    },
    // Let whatever is showing finish quickly (called when a new animation starts).
    fadeAll() {
      parts = parts.filter((p) => { if (p.age < 0) { remove(p); return false; } p.life = Math.min(p.life, p.age + 0.25); return true; });
    },
    update(dt) {
      if (!parts.length) { group.visible = false; placed = false; return; }
      if (root.parent && group.parent !== root.parent) root.parent.add(group);
      group.visible = true;
      // Anchor above Leafity's highest point: the sprout tip, which follows hops and growth, or
      // the feet when it hangs upside down. Eased slightly so symbols float rather than jitter.
      root.updateMatrixWorld();
      model.parts.rig.localToWorld(head.set(0, 1.75, 0));
      root.localToWorld(feet.set(0, 0, 0));
      if (feet.y > head.y) head.copy(feet);
      if (placed) group.position.lerp(head, 1 - Math.exp(-dt * 16)); else group.position.copy(head);
      placed = true;
      group.scale.setScalar(root.scale.x || 1);
      parts = parts.filter((p) => {
        p.age += dt;
        if (p.age < 0) return true;
        if (p.age >= p.life) { remove(p); return false; }
        p.sprite.visible = true;
        p.tick(p, p.age, p.age / p.life);
        return true;
      });
    },
    dispose() {
      parts.forEach(remove);
      parts = [];
      textures.forEach((t) => t.dispose());
      textures.clear();
      if (group.parent) group.parent.remove(group);
    },
  };
  return api;
}
