// LeafSpectra website — page behaviour and "the director" for the shared 3D Leafity.
// This is the logic class of the LeafSpectra Website page from the Claude Design project,
// unchanged apart from module imports. index.html holds the page markup; main.js connects the two.
import { DCLogic, React } from './runtime.js';
// The page is ordinary HTML. This class adds the menu, the feature picker, and "the director":
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('leafity-debug');
// one shared 3D Leafity (leafity.js — the same model, animator, mover, edge behaviours and
// add-ons the character was developed with) drawn on a single fixed canvas. World units are
// page pixels / K and the camera scrolls with the page, so whatever Leafity does stays glued
// to the content.
//
// What Leafity does depends on the section in view:
//   home, features, leafity, download   stands in a marked spot and reacts
//   about      explores the row of cards: hops, runs, slides, hides and climbs between them
//   how        runs back and forth along the path under the steps
//   faq        a large side companion that watches the questions
//   footer     dozes
// Every few minutes it drops in from under the header, and now and then it makes a surprise
// appearance from the edge of the screen — usually small, now and then giant (see plan / visit).
const K = 100, FOV = 30;
const FEATURES = [
  { title: 'What Can I Grow?', screen: 'grow', clip: 'curiousTilt', desc: 'Suggestions for vegetables that may suit your location and home-growing setup.' },
  { title: 'Growing and Learning Guides', screen: 'guide', clip: 'discover', desc: 'Beginner-friendly instructions, with care guidance for each growth stage.' },
  { title: 'Care Records and Reminders', screen: 'care', clip: 'watering', desc: 'Log the care you give, keep each plant’s history, and get weather-aware reminders.' },
  { title: 'Guided Leaf Observations', screen: 'observe', clip: 'inspect', desc: 'Step-by-step help for photographing a leaf so it can be compared over time.' },
  { title: 'Visual Change Monitoring', screen: 'monitor', clip: 'success', desc: 'Leaf photos are analysed online to describe visible changes — never a confirmed diagnosis.' },
  { title: 'Ask Leafity', screen: 'leafity', clip: 'wave', desc: 'A bilingual English and Filipino companion that explains guidance in simple words.' },
];
// where Leafity stands in each "spot" section: [marker, share of the marker's height it fills]
const SPOTS = { home: ['hero-stage', 0.86], features: ['feat-spot', 0.9], leafity: ['meet-stage', 0.86], download: ['dl-spot', 0.9], faq: ['faq-stage', 0.86], footer: ['foot-spot', 0.9] };
// reactions to a click or tap while Leafity is busy with a routine
const TAPS = { how: ['happyHop', 'giggle', 'celebrate', 'wave', 'surprised', 'spin', 'slide'], about: ['giggle', 'wave', 'surprised', 'spin', 'happyHop', 'nod'] };
const rnd = (a, b) => a + Math.random() * (b - a);
const clampN = (x, a, b) => Math.min(b, Math.max(a, x));

export class Component extends DCLogic {
  state = { menu: false, feat: 0, noWebgl: false };
  rootRef = React.createRef();
  canvasRef = React.createRef();
  seq = 0;
  active = '';
  mode = 'idle'; // idle | moving | reacting | peeking | climbing | hanging | returning
  lastRun = {};
  lastPick = {};
  pauses = [];
  clock = 0;
  tween = null;
  groundY = null;
  anchor = null;
  activeAt = performance.now();

  componentDidMount() {
    // start the 3D layer after first paint so the text is never held up by it
    this.boot = setTimeout(() => this.start().catch((e) => { console.error(e); this.say(); if (!this.dead) this.setState({ noWebgl: true }); }), 150);
    // the hero speech bubble appears when Leafity "says" it (never later than 9 s, whatever happens)
    if (this.rootRef.current) this.rootRef.current.dataset.say = 'wait';
    this.sayT = setTimeout(() => this.say(), 9000);
  }

  componentWillUnmount() {
    this.dead = true;
    this.seq++;
    this.cancelPauses();
    clearTimeout(this.boot); clearTimeout(this.sayT); clearTimeout(this.settleT); clearTimeout(this.resizeT); clearTimeout(this.visitT);
    cancelAnimationFrame(this.raf);
    (this.off || []).forEach((f) => f());
    document.body.style.cursor = '';
    if (window.leafitySite === this.debug) delete window.leafitySite;
    if (this.ch) this.ch.dispose();
    if (this.blob) { this.blob.geometry.dispose(); this.blob.material.dispose(); }
    if (this.renderer) this.renderer.dispose();
  }

  q(name) { return this.rootRef.current.querySelector('[data-ls="' + name + '"]'); }
  // the menu shows where the visitor is, like the app's tab bar
  markNav(id) {
    this.rootRef.current.querySelectorAll('.ls-links a:not(.cta)').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
  }
  say() { const el = this.rootRef.current && this.q('hero-say'); if (el) el.classList.add('on'); }
  qa(name) { return Array.from(this.rootRef.current.querySelectorAll('[data-ls="' + name + '"]')); }
  // random choice that is never the same twice in a row for the same purpose
  pick(key, list) {
    let x;
    do { x = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && x === this.lastPick[key]);
    this.lastPick[key] = x;
    return x;
  }
  // a wait that follows the frame clock (so it stops while the tab is hidden) and can be cancelled
  pause(sec) { return new Promise((res) => this.pauses.push({ left: sec, res })); }
  cancelPauses() { const p = this.pauses; this.pauses = []; p.forEach((x) => x.res(false)); }

  async start() {
    const THREE = this.THREE = await import('three');
    const L = await import('./leafity/leafity.js');
    if (this.dead) return;
    const canvas = this.canvasRef.current;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const scene = this.scene = new THREE.Scene();
    const cam = this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0), new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    key.position.set(4, 7, 5);
    scene.add(key);
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ch = this.ch = L.createLeafityCharacter(THREE, {
      camera: cam,
      viewport: () => ({ width: this.vw, height: this.vh }),
      canvasRect: () => ({ left: 0, top: 0 }),
    });
    scene.add(ch.object);
    // soft contact shadow (no shadow maps: cheaper on phones)
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x5b3a1e, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(this.blob);
    this.ray = new THREE.Raycaster();
    this.v2 = new THREE.Vector2();
    this.frameCamera(true);
    this.hide();

    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); return () => t.removeEventListener(ev, fn, o); };
    let down = null, lastHover = 0;
    this.off = [
      on(window, 'scroll', () => { this.scrolledAt = this.activeAt = performance.now(); this.watch(); }, { passive: true, capture: true }),
      on(document, 'keydown', () => { this.activeAt = performance.now(); }),
      on(document, 'click', (e) => { if (e.target.closest && e.target.closest('a[download]')) this.cheer(); }),
      on(this.rootRef.current, 'toggle', (e) => { if (e.target.tagName === 'DETAILS' && e.target.open) this.faqReact(e.target); }, true),
      on(window, 'resize', () => { clearTimeout(this.resizeT); this.resizeT = setTimeout(() => { this.frameCamera(true); this.enter(this.active); }, 250); }),
      on(document, 'visibilitychange', () => this.plan(true)),
      on(document, 'pointerdown', (e) => { this.activeAt = performance.now(); down = { x: e.clientX, y: e.clientY }; }, { passive: true }),
      on(document, 'pointerup', (e) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
        if (e.target.closest && e.target.closest('a,button,summary,input,label')) return;
        if (this.hit(e.clientX, e.clientY)) this.tapLeafity();
      }),
      on(document, 'pointermove', (e) => {
        this.activeAt = performance.now();
        if (e.pointerType === 'touch' || performance.now() - lastHover < 120) return;
        lastHover = performance.now();
        const over = this.hit(e.clientX, e.clientY);
        document.body.style.cursor = over ? 'pointer' : '';
        if (over && !this.hovering && this.active === 'leafity' && ch.animator.current === 'idle') ch.playAnimation('curiousTilt');
        this.hovering = over;
      }, { passive: true }),
    ];
    let last = performance.now();
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick); // the only loop; the browser pauses it while the tab is hidden
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(tick);
    this.debug = { director: () => this, state: () => this.mode, headerVisit: (v) => this.visit('header', v, true), surprise: (v, size) => this.visit('surprise', v, true, size), last: () => this.lastSurprise, visiting: () => !!this.visiting, character: ch };
    if (DEBUG) window.leafitySite = this.debug; // test hooks: only with ?leafity-debug in the URL
    this.watch(true);
    this.plan(true);
  }

  // Camera: straight on, scrolled with the page, sized so 1 world unit = K page pixels at z = 0.
  // While Leafity hangs from the sticky header the scroll position is frozen (this.pin), which
  // keeps it fixed to the viewport instead of the page.
  frameCamera(resize) {
    const cam = this.cam, vw = window.innerWidth, vh = window.innerHeight;
    if (resize || vw !== this.vw || vh !== this.vh) {
      this.vw = vw; this.vh = vh;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (vw * vh)));
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(vw, vh, false);
      cam.aspect = vw / vh;
      cam.updateProjectionMatrix();
    }
    const r = this.pin || this.rootRef.current.getBoundingClientRect(); // page origin in the viewport, whatever element scrolls
    cam.position.set((vw / 2 - r.left) / K, (r.top - vh / 2) / K, (vh / K) / (2 * Math.tan(FOV * Math.PI / 360)));
    cam.updateMatrixWorld();
  }

  frame(dt) {
    const ch = this.ch, o = ch.object;
    this.clock += dt;
    this.frameCamera();
    if (this.pauses.length) this.pauses = this.pauses.filter((p) => { if ((p.left -= dt) > 0) return true; p.res(true); return false; });
    if (this.tween) {
      const t = this.tween;
      t.t += dt;
      const u = Math.min(1, t.t / t.dur), e = t.back ? 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2 : u * u;
      ch.mover.setScale(Math.max(0.001, t.from + (t.to - t.from) * e));
      if (u >= 1) { this.tween = null; t.res(true); }
    }
    // standing in a spot: stay on it even if the layout shifts (sticky column, an answer opening)
    if (this.anchor && !ch.mover.moving) {
      const r = this.anchor.getBoundingClientRect();
      if (r.width) { const p = ch.mover.screenToWorld(r.left + r.width / 2, r.bottom, 0); o.position.x = p.x; o.position.y = p.y; this.groundY = p.y; }
    }
    ch.update(dt);
    // contact shadow under the feet while standing
    const s = o.scale.x, up = this.groundY == null ? 9 : (o.position.y - this.groundY) / s;
    const show = this.groundY != null && s > 0.2 && Math.abs(o.rotation.z) < 0.5;
    this.blob.material.opacity = show ? 0.16 * Math.max(0, 1 - Math.abs(up) / 1.6) : 0;
    this.blob.position.set(o.position.x, (this.groundY || 0) + 0.03 * s, o.position.z - 0.3 * s);
    this.blob.scale.set(0.8 * s, 0.11 * s, 1);
    // skip drawing while Leafity is nowhere near the viewport
    const p = ch.mover.worldToScreen({ x: o.position.x, y: o.position.y + 0.9 * s, z: 0 }), m = 2.4 * s * K;
    const visible = s > 0.01 && p.x > -m && p.x < this.vw + m && p.y > -m && p.y < this.vh + m;
    if (visible || this.drawn) this.renderer.render(this.scene, this.cam);
    this.drawn = visible;
  }

  hit(x, y) {
    if (!this.ch || this.visiting || this.ch.object.scale.x < 0.05) return false; // a visiting Leafity takes no clicks
    this.ray.setFromCamera(this.v2.set((x / this.vw) * 2 - 1, -(y / this.vh) * 2 + 1), this.cam);
    return this.ray.intersectObject(this.ch.object, true).length > 0;
  }

  // ---- clicks and taps on Leafity ---------------------------------------------------------
  tapLeafity() {
    const ch = this.ch, id = this.active;
    if (!ch || this.visiting) return;
    if (id === 'how' && this.howJump) return; // mid-air over the pebble: let it land
    if (id === 'how' || id === 'about') {
      // one reaction at a time; extra taps while it reacts (or while one is waiting) are ignored
      if (this.tapBusy || this.tapQueued) return;
      if (id === 'about' && ch.mover.moving) { this.tapQueued = true; return; } // finish the hop or climb first
      this.tapBusy = true;
      ch.mover.stop();
      this.cancelPauses();
      this.tapPromise = this.tapReact(id).catch(() => {}).then(() => { this.tapBusy = false; this.tapPromise = null; });
      return;
    }
    if (ch.mover.moving) return;
    if (id === 'footer') { ch.playAnimation('wakeUp').then((ok) => ok && ch.playAnimation('wave')); return; }
    if (id === 'home') { if (this.mode !== 'sleepy') ch.playAnimation('happyHop'); return; }
    if (id === 'leafity') { this.flip = !this.flip; ch.playAnimation(this.flip ? 'wave' : 'happyHop'); return; }
    ch.react();
  }
  async tapReact(id) {
    const ch = this.ch, name = this.pick('tap-' + id, TAPS[id]);
    this.mode = 'reacting';
    ch.animator.clearLook();
    if (name === 'slide') {
      const g = this.howGeom(), x = clampN(ch.object.position.x + (this.howDir || 1) * 1.8 * g.s, g.L, g.R);
      await ch.mover.slideTo({ x, y: g.y, z: 0 }, { dur: 0.7 });
    } else await ch.playAnimation(name);
  }

  // Which section is the visitor looking at? Acts only once the scroll has settled there.
  watch(now) {
    if (!this.ch) return;
    const secs = Array.from(this.rootRef.current.querySelectorAll('[data-ls-sec]')), line = this.vh * 0.5;
    let id = secs.length ? secs[0].getAttribute('data-ls-sec') : '';
    secs.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top <= line && r.bottom > line) id = el.getAttribute('data-ls-sec'); });
    const foot = secs[secs.length - 1];
    if (foot && foot.getBoundingClientRect().top < this.vh * 0.8) id = 'footer';
    if (id === this.pending) return;
    this.pending = id;
    clearTimeout(this.settleT);
    this.settleT = setTimeout(() => { if (this.dead) return; this.markNav(id); if (id !== this.active) this.enter(id); }, now ? 0 : 350);
  }

  // ---- placement helpers ------------------------------------------------------------------
  hide() {
    this.groundY = null; this.anchor = null;
    if (this.tween) { const t = this.tween; this.tween = null; t.res(false); }
    this.ch.mover.place({ x: -60, y: this.cam.position.y, z: 0 }, { scale: 0.001, heading: 0 });
    this.ch.followPointer(false); this.ch.setAmbient(false); this.ch.animator.clearLook();
  }
  // Stand at the bottom centre of an element, sized to fit it, and stay attached to it.
  stand(el, frac = 0.9, grow = true) {
    this.frameCamera();
    const r = el.getBoundingClientRect(), s = Math.min(r.height * frac, r.width * 0.9) / (1.9 * K);
    const p = this.ch.mover.screenToWorld(r.left + r.width / 2, r.bottom, 0);
    this.ch.mover.place({ x: p.x, y: p.y, z: 0 }, { scale: grow ? 0.001 : s, heading: 'camera' });
    this.groundY = p.y; this.anchor = el;
    return s;
  }
  scaleTo(to, dur, back) {
    if (this.tween) this.tween.res(false);
    return new Promise((res) => { this.tween = { from: this.ch.object.scale.x, to, t: 0, dur, back, res }; });
  }
  onScreen() {
    const o = this.ch.object, p = this.ch.mover.worldToScreen({ x: o.position.x, y: o.position.y + 0.9 * o.scale.x, z: 0 });
    return o.scale.x > 0.05 && p.x > 0 && p.x < this.vw && p.y > 0 && p.y < this.vh;
  }
  // The running strip under the steps: Leafity's size, the ground line, and how far it may go.
  howGeom() {
    const mv = this.ch.mover, r = this.q('how-path').getBoundingClientRect(), s = Math.min(0.85, r.height * 0.8 / (1.9 * K)), m = 1.05 * s * K + 6;
    return { s, y: mv.screenToWorld(0, r.bottom - 15, 0).y, L: mv.screenToWorld(r.left + m, 0, 0).x, R: mv.screenToWorld(r.right - m, 0, 0).x };
  }
  // The cards Leafity can stand on: those in the top row, which have open space above them.
  aboutGeom() {
    const mv = this.ch.mover, cards = this.qa('about-card').map((e) => e.getBoundingClientRect());
    if (!cards.length || !cards[0].width) return null;
    const vine = this.q('about-vine'), roof = vine ? vine.getBoundingClientRect().bottom + 12 : this.q('about-head').getBoundingClientRect().bottom;
    const row = cards.filter((c) => Math.abs(c.top - cards[0].top) < 20), space = row[0].top - roof; // Leafity's head and leaves stay below the vine
    const s = clampN(Math.min(space / (2.3 * K), row[0].width * 0.7 / (2.1 * K)), 0.4, 0.62);
    return { s, stops: row.map((c) => { const p = mv.screenToWorld(c.left + c.width / 2, c.top, 0); return { x: p.x, y: p.y, half: c.width / 2 / K, cy: p.y - c.height / 2 / K }; }) };
  }

  // Quietly put Leafity where it belongs, with no entrance and no roaming (reduced motion).
  rest(id) {
    const ch = this.ch, fine = matchMedia('(pointer: fine)').matches;
    if (id === 'home') this.say();
    ch.returnToIdle();
    this.hide();
    if (id === 'how') { const g = this.howGeom(); ch.mover.place({ x: (g.L + g.R) / 2, y: g.y, z: 0 }, { scale: g.s, heading: 'camera' }); this.groundY = g.y; return; }
    if (id === 'about') { const g = this.aboutGeom(); if (g) { ch.mover.place({ x: g.stops[0].x, y: g.stops[0].y, z: 0 }, { scale: g.s, heading: 'camera' }); this.groundY = g.stops[0].y; } return; }
    const spot = SPOTS[id], el = spot && this.q(spot[0]);
    if (!el || !el.getBoundingClientRect().width) return;
    this.stand(el, spot[1], false);
    ch.followPointer(fine && (id === 'home' || id === 'leafity'));
  }

  // ---- section behaviour ------------------------------------------------------------------
  async enter(id) {
    const ch = this.ch;
    if (!ch || !id) return;
    const prev = this.active;
    if (id !== prev) this.enteredAt = performance.now();
    this.active = id;
    if (this.visiting) return; // busy hanging from the header; it returns to the current section afterwards
    const k = ++this.seq, mv = ch.mover, A = ch.animator;
    this.cancelPauses();
    this.tapQueued = false;
    if (this.reduced) { this.rest(id); return; }
    const fresh = !this.lastRun[id] || performance.now() - this.lastRun[id] > 25000;
    if (fresh) this.lastRun[id] = performance.now();
    const ok = async (p) => { const r = await p; if (!r || k !== this.seq || this.dead) throw null; return r; };
    const fine = matchMedia('(pointer: fine)').matches;
    try {
      // leave the previous spot: shrink away if still in view, otherwise just move
      this.mode = 'returning';
      A.returnToIdle();
      ch.followPointer(false); ch.setAmbient(false); A.clearLook();
      if (prev && this.onScreen()) await ok(this.scaleTo(0.001, 0.16));
      this.hide();
      this.mode = 'idle';
      if (id === 'about') { await this.aboutLoop(k); return; }
      if (id === 'how') { await this.howLoop(k); return; }
      const spot = SPOTS[id], el = spot && this.q(spot[0]);
      if (!el || !el.getBoundingClientRect().width) return;
      await ok(this.scaleTo(this.stand(el, spot[1]), 0.3, true));
      if (id === 'home') {
        if (fresh) {
          await ok(A.play('lookAround')); await ok(A.play('greeting'));
          // "says" the bubble, then glances up at it with a little nod
          this.say();
          A.setLook(0.75, 0.55, 0.6); await ok(A.play('nod')); await ok(this.pause(0.5)); A.clearLook();
        } else this.say();
        ch.setAmbient(true); ch.followPointer(fine);
        await this.homeIdle(k);
      } else if (id === 'features') {
        if (fresh) await ok(A.play(FEATURES[this.state.feat].clip));
        await this.benchLoop(k, id);
      } else if (id === 'leafity') {
        if (fresh) await ok(A.play(this.pick('meet-hello', ['bow', 'wave'])));
        ch.setAmbient(true); ch.followPointer(fine);
      } else if (id === 'download') {
        if (fresh) await ok(A.play(this.props.apkUrl && !(this.props.apkIsTest ?? true) ? 'celebrate' : 'wave'));
        await this.benchLoop(k, id);
      } else if (id === 'faq') {
        await this.faqLoop(k);
      } else if (id === 'footer') {
        A.play('doze');
      }
    } catch (e) { if (e) console.error(e); }
  }

  // Hero: after a long quiet spell (no pointer, key or scroll activity) Leafity gets sleepy —
  // heavy eyelids, nodding off — and wakes up with a stretch as soon as the visitor is back.
  async homeIdle(k) {
    const ch = this.ch, A = ch.animator, fine = matchMedia('(pointer: fine)').matches;
    const after = Math.max(15, +(this.props.sleepyAfterSeconds ?? 40) || 40) * 1000;
    const alive = () => k === this.seq && !this.dead;
    while (alive()) {
      await this.pause(2);
      if (!alive()) return;
      if (performance.now() - this.activeAt < after || ch.mover.moving || A.current !== 'idle') continue;
      const since = this.activeAt;
      this.mode = 'sleepy';
      ch.followPointer(false); ch.setAmbient(false); A.clearLook();
      A.play('sleepy');
      while (alive() && this.activeAt === since) await this.pause(0.4);
      if (!alive()) return;
      this.mode = 'idle';
      await A.play('wakeUp');
      if (!alive()) return;
      ch.setAmbient(true); ch.followPointer(fine);
    }
  }
  // Features and Download: Leafity keeps the bench company — now and then it sits on the edge
  // for a while, sways its leaves, inspects the preview or glances around. One thing at a time.
  async benchLoop(k, id) {
    const ch = this.ch, A = ch.animator, alive = () => k === this.seq && !this.dead;
    while (alive()) {
      await this.pause(rnd(6, 11));
      if (!alive()) return;
      if (this.cheering || ch.mover.moving || A.current !== 'idle') continue;
      const what = this.pick('bench-' + id, ['sit', 'flutter', 'inspect', 'glance', 'sit']);
      this.mode = what === 'sit' ? 'sitting' : 'idle';
      if (what === 'sit') {
        A.play('sit', { params: { flat: true } });
        await this.pause(rnd(6, 10));
        if (alive() && A.current === 'sit') A.returnToIdle();
      } else if (what === 'flutter') await A.play('leafFlutter', { fx: false });
      else if (what === 'inspect') await A.play('inspect');
      else { A.setLook(id === 'download' ? -0.8 : 0.8, rnd(-0.2, 0.3), 0.6); await this.pause(1.6); A.clearLook(); }
      this.mode = 'idle';
    }
  }
  // A download click: a short celebratory dance (Download section) or a cheer (hero). 8 s cooldown.
  async cheer() {
    const ch = this.ch, now = performance.now();
    if (!ch || this.visiting || this.reduced || this.cheering || now - (this.cheerAt || 0) < 8000) return;
    if ((this.active !== 'download' && this.active !== 'home') || ch.mover.moving || ch.object.scale.x < 0.05) return;
    this.cheerAt = now; this.cheering = true;
    const k = this.seq, A = ch.animator;
    try {
      this.mode = 'reacting';
      if (this.active === 'download') { A.play('dance'); await this.pause(2.4); if (k !== this.seq) return; }
      await A.play('celebrate');
      if (k === this.seq) { A.returnToIdle(); this.mode = 'idle'; }
    } finally { this.cheering = false; }
  }
  // FAQ: opening a question gets a small reaction from the companion (one at a time, 3.5 s apart).
  faqReact(d) {
    const ch = this.ch, now = performance.now();
    if (!ch || this.active !== 'faq' || this.visiting || this.reduced || now - (this.faqAt || 0) < 3500) return;
    if (ch.mover.moving || ch.object.scale.x < 0.05) return;
    this.faqAt = now;
    const q = (d.querySelector('summary') || d).textContent;
    ch.playAnimation(/diagnose/i.test(q) ? 'think' : /download|install|android/i.test(q) ? 'discover' : this.pick('faq-react', ['nod', 'curiousTilt', 'love', 'nod']));
  }

  // FAQ: a large, calm companion. Watches the questions, tilts, sways its leaves, glances at the visitor.
  async faqLoop(k) {
    const A = this.ch.animator;
    const soft = async (p) => { await p; if (k !== this.seq || this.dead) throw null; };
    const watchList = () => {
      const st = this.q('faq-stage').getBoundingClientRect(), li = this.q('faq-list').getBoundingClientRect(), beside = li.right < st.left + 20;
      A.setLook(beside ? -0.8 : 0, beside ? -0.15 : -0.8, 0.5);
    };
    watchList();
    while (k === this.seq) {
      await soft(this.pause(rnd(3.5, 7)));
      const what = this.pick('faq', ['tilt', 'flutter', 'glance', 'blink']);
      if (what === 'tilt') await soft(A.play('curiousTilt', { fx: false }));
      else if (what === 'flutter') A.play('leafFlutter', { fx: false });
      else if (what === 'glance') { A.clearLook(); await soft(this.pause(1.6)); }
      else A.play('blink');
      watchList();
    }
  }

  // How it works: runs to the other end of the path, eases to a stop, rests there for 5–10 s
  // (breathing, blinking, a glance or two, now and then a small reaction), then turns and runs
  // back. A tap gives a reaction and Leafity goes back to whatever it was doing.
  async howLoop(k) {
    const ch = this.ch, mv = ch.mover, A = ch.animator, o = ch.object;
    const alive = () => k === this.seq && !this.dead;
    // false = interrupted by a tap (already reacted); throws if the section was left
    const step = async (p) => { const r = await p; if (!alive()) throw null; if (this.tapPromise) { await this.tapPromise; if (!alive()) throw null; return false; } return r; };
    let g = this.howGeom(), fails = 0;
    mv.place({ x: clampN(this.howX == null ? g.L : this.howX, g.L, g.R), y: g.y, z: 0 }, { scale: 0.001, heading: 'camera' });
    this.groundY = g.y;
    await step(this.scaleTo(g.s, 0.3, true));
    if (this.howX != null) await this.loiter(step, alive, rnd(2, 4), 0, ['nod']); // coming back: don't dash off at once
    while (alive()) {
      g = this.howGeom();
      const dir = this.howDir || 1;
      this.mode = 'moving';
      const arrived = await this.howRun(step, g, dir);
      this.howX = o.position.x;
      if (!arrived) { if (!this.tapBusy && ++fails > 5) break; continue; } // tapped: carry on toward the same end
      fails = 0;
      this.howDir = -dir;
      await this.loiter(step, alive, rnd(5, 10), 0.4, ['nod', 'happyHop', 'wave', 'tilt', 'inspect']);
    }
  }

  // Run to the far end of the path, hopping over the pebble when it lies on the way.
  async howRun(step, g, dir) {
    const mv = this.ch.mover, o = this.ch.object, rock = this.q('how-rock'), rr = rock && rock.getBoundingClientRect();
    const end = { x: dir > 0 ? g.R : g.L, y: g.y, z: 0 };
    if (rr && rr.width) {
      const rx = mv.screenToWorld(rr.left + rr.width / 2, 0, 0).x, m = rr.width / 2 / K + 0.85 * g.s;
      const before = rx - dir * m, after = rx + dir * m;
      if ((before - o.position.x) * dir > 0.05 && (end.x - after) * dir > 0.2) {
        if (!(await step(mv.walkTo({ x: before, y: g.y, z: 0 }, { run: true, pace: 2, stretch: 1.25 })))) return false;
        this.howJump = true;
        let ok;
        try { ok = await step(mv.jumpTo({ x: after, y: g.y, z: 0 }, { height: 0.55 })); } finally { this.howJump = false; }
        if (!ok) return false;
        this.mode = 'moving';
      }
    }
    return step(mv.walkTo(end, { run: true, pace: 2, stretch: 1.25, slow: true }));
  }

  // Rest in place for `secs`: idle breathing and blinking throughout, with quiet beats that are
  // sometimes a glance or a leaf sway, and (with probability `chance`) one short reaction.
  // settle() is called before each beat to get back into the resting pose (e.g. sit down again).
  async loiter(step, alive, secs, chance, reactions, settle) {
    const A = this.ch.animator, until = this.clock + secs, reactAt = this.clock + rnd(0.3, 0.6) * secs;
    let react = Math.random() < chance;
    while (alive() && this.clock < until) {
      if (settle && !(await settle())) continue;
      this.mode = 'idle';
      if (react && this.clock >= reactAt) {
        react = false;
        this.mode = 'reacting';
        const r = this.pick('loiter', reactions);
        if (typeof r === 'function') await r(); else await step(A.play(r === 'tilt' ? 'curiousTilt' : r, { fx: r !== 'tilt' }));
        continue;
      }
      const beat = Math.max(0.3, Math.min(until - this.clock, rnd(2, 4))), q = Math.random();
      if (q < 0.3) { A.setLook(Math.random() < 0.5 ? 0.8 : -0.8, rnd(-0.2, 0.3), 0.6); await step(this.pause(Math.min(beat, 1.8))); A.clearLook(); }
      else if (q < 0.45) { A.play('leafFlutter', { fx: false }); await step(this.pause(beat)); }
      else await step(this.pause(beat));
    }
    A.clearLook();
  }

  // What is LeafSpectra: explores the top row of cards, resting 8–15 s on each one before it
  // moves on. Everything is measured from the cards as they are laid out now, so it adapts to
  // four, two or one card in the row.
  async aboutLoop(k) {
    const ch = this.ch, mv = ch.mover, A = ch.animator, o = ch.object, g = this.aboutGeom();
    if (!g) return;
    const alive = () => k === this.seq && !this.dead;
    const step = async (p) => { const r = await p; if (!alive()) throw null; if (this.tapPromise) { await this.tapPromise; if (!alive()) throw null; return false; } return r; };
    const { s, stops } = g, DEEP = 2.15 * s, GRIP = 0.45 * s; // fully hidden behind the card / eyes and hands over its edge
    const on = (i) => { const st = stops[i], m = Math.max(0, st.half - 1.1 * s) * 0.6; return { x: st.x + rnd(-m, m), y: st.y, z: 0 }; };
    const climbUp = async (i, x) => {
      this.mode = 'climbing';
      A.play('climb', { params: { dir: 1 } });
      if (!(await step(mv.followPath([{ x, y: stops[i].y - GRIP, z: 0 }], { speed: 1.5, stepped: true, period: 0.9 })))) return false;
      return step(mv.mantle({ x, y: stops[i].y, z: 0 }, { dur: 1.0 }));
    };
    const climbDown = (y) => { A.play('climb', { params: { dir: -1 } }); return step(mv.followPath([{ x: o.position.x, y, z: 0 }], { speed: 1.6, stepped: true, period: 0.9 })); };
    let cur = Math.min(this.aboutAt == null ? Math.floor(Math.random() * stops.length) : this.aboutAt, stops.length - 1);
    const first = on(cur);
    mv.place({ x: first.x, y: first.y - DEEP, z: 0 }, { scale: s, heading: 'camera' });
    await climbUp(cur, first.x);
    while (alive()) {
      const st = stops[cur];
      this.aboutAt = cur;
      const sitting = Math.random() < 0.45;
      // before every quiet beat: be standing (or sitting) on the card, and answer a tap that was waiting
      const settle = async () => {
        if (Math.abs(o.position.y - st.y) > 0.02 && !(await step(mv.mantle({ x: o.position.x, y: st.y, z: 0 }, { dur: 0.9 })))) return false;
        this.groundY = st.y;
        if (this.tapQueued) { this.tapQueued = false; this.tapBusy = true; await this.tapReact('about').catch(() => {}); this.tapBusy = false; if (!alive()) throw null; }
        if (sitting && A.current === 'idle') A.play('sit', { params: { flat: true } });
        return true;
      };
      const peekOver = async () => {
        this.mode = 'peeking';
        this.groundY = null;
        if (await climbDown(st.y - GRIP)) { A.play('edgeGrip'); await step(this.pause(rnd(1.4, 2.2))); }
      };
      // ducks right down behind the card, then peeks back over the edge before climbing up again
      const duck = async () => {
        this.mode = 'peeking';
        this.groundY = null;
        A.returnToIdle();
        if (!(await step(mv.followPath([{ x: o.position.x, y: st.y - DEEP, z: 0 }], { speed: 4.5 })))) return;
        await step(this.pause(rnd(0.8, 1.4)));
        if (await step(mv.followPath([{ x: o.position.x, y: st.y - GRIP, z: 0 }], { speed: 2.2 }))) { A.play('edgeGrip'); await step(this.pause(rnd(1, 1.6))); }
      };
      const lookDown = async () => { A.setLook(0, -0.9, 0.5); await step(this.pause(1.7)); A.clearLook(); };
      const pointAt = () => step(ch.pointAt({ x: st.x, y: st.cy }));
      await this.loiter(step, alive, rnd(8, 15), 0.6, ['wave', 'giggle', 'tilt', lookDown, pointAt, peekOver, duck, 'inspect'], settle);
      if (!alive()) return;
      if (!(await settle())) continue;
      if (A.current === 'sit') { A.returnToIdle(); await step(this.pause(0.45)); }
      if (stops.length < 2) continue;
      // travel to a different card
      let next;
      do { next = Math.floor(Math.random() * stops.length); } while (next === cur);
      const to = on(next), far = Math.abs(next - cur) > 1;
      const how = far ? this.pick('about-far', ['hide', 'hops', 'hide']) : this.pick('about-near', ['hop', 'run', 'slide']);
      this.mode = how === 'hide' ? 'peeking' : 'moving';
      let done = false;
      if (how === 'hop') done = await step(mv.jumpTo(to, { height: 0.28 })); // low hops: the vine is just above
      else if (how === 'run') done = await step(mv.walkTo(to, { run: true, pace: 1.3, slow: true }));
      else if (how === 'slide') done = await step(mv.slideTo(to, { dur: 0.8 }));
      else if (how === 'hops') {
        const d = Math.sign(next - cur);
        done = true;
        for (let i = cur + d; done && i !== next + d; i += d) { done = await step(mv.jumpTo(i === next ? to : on(i), { height: 0.28 })); if (done) cur = i; }
      } else {
        // out of sight behind this card, then up from behind the other one
        this.groundY = null;
        if (await climbDown(st.y - DEEP)) {
          mv.place({ x: to.x, y: to.y - DEEP, z: 0 }, { heading: 'camera' });
          cur = next;
          done = await climbUp(next, to.x);
        }
      }
      if (done) cur = next;
    }
  }

  // ---- occasional visits: hanging from the header, and surprise peeks ------------------------
  // One scheduler for both, so they never overlap: each kind has its own random interval, the
  // earlier one goes first, and after any visit the other is pushed at least 45 s away. Nothing
  // is scheduled under reduced motion or while the tab is hidden.
  plan(fresh) {
    clearTimeout(this.visitT);
    if (!this.ch || this.reduced || document.hidden || this.dead) { this.due = null; return; }
    const p = this.props, now = performance.now();
    this.every = { header: [p.headerMinSeconds ?? 120, p.headerMaxSeconds ?? 240], surprise: [p.surpriseMinSeconds ?? 50, p.surpriseMaxSeconds ?? 110] };
    const next = (kind) => now + rnd(this.every[kind][0], Math.max(this.every[kind][0], this.every[kind][1])) * 1000;
    if (fresh || !this.due) this.due = { header: next('header'), surprise: next('surprise') };
    const kind = this.due.header <= this.due.surprise ? 'header' : 'surprise';
    this.visitT = setTimeout(() => this.visit(kind), Math.max(500, this.due[kind] - now));
  }
  // A free stretch of the header between the wordmark and the menu, wide enough for a small Leafity.
  headerSpot() {
    const root = this.rootRef.current, nav = root.querySelector('.ls-nav'), mark = root.querySelector('.ls-mark');
    const btn = root.querySelector('.ls-menu'), links = root.querySelector('.ls-links a');
    const next = btn && btn.getBoundingClientRect().width ? btn : links;
    if (!nav || !mark || !next || this.state.menu) return null;
    const a = mark.getBoundingClientRect().right, b = next.getBoundingClientRect().left, s = Math.min(0.55, (b - a - 16) / (2.1 * K));
    return s < 0.34 ? null : { s, x: (a + b) / 2, bottom: nav.getBoundingClientRect().bottom };
  }
  // ---- surprise peeks: size, place, variation -------------------------------------------------
  // Each surprise first draws a size — small, medium or (rarely) giant, with configurable odds —
  // then looks for a screen edge where Leafity, at that size and pose, would cover nothing that
  // matters. The test is exact: Leafity is posed where it would end up, its outline is projected
  // onto the screen, and that area is checked against what is actually there. If the drawn size
  // fits nowhere, the next smaller one is tried; if nothing fits, the surprise is skipped.
  surpriseSize() {
    const p = this.props, w = [p.peekSmallPercent ?? 45, p.peekMediumPercent ?? 35, p.peekGiantPercent ?? 20].map((x) => Math.max(0, +x || 0));
    let r = Math.random() * (w[0] + w[1] + w[2] || 1);
    return r < w[0] ? 'small' : (r -= w[0]) < w[1] ? 'medium' : 'giant';
  }
  // Where Leafity's silhouette would be on screen at this edge: Leafity is posed where the peek
  // would hold, and a sample of its vertices is projected to the screen. Also reports how many eyes
  // would be in view, so a peek that hides the whole face is never chosen.
  peekPoints(side, s, reveal, lean, feet, symbol) {
    const ch = this.ch, mv = ch.mover, o = ch.object, T = this.THREE;
    const keep = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.x };
    mv.setScale(s);
    const spec = mv.edge(side), t = mv.edgeAt(spec, reveal, { lean, y: feet == null ? undefined : mv.screenToWorld(0, feet, 0).y });
    o.position.copy(t.pos); o.rotation.set(0, t.heading - Math.sign(spec.dx) * 0.2, t.roll);
    o.updateMatrixWorld(true);
    const pts = [], v = new T.Vector3(), seen = new Set();
    o.traverse((m) => {
      if (!m.isMesh || m.name.endsWith('_outline')) return;
      for (let q = m; q; q = q.parent) if (!q.visible) return;
      const a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i += 3) {
        const p = mv.worldToScreen(v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)), key = Math.round(p.x / 12) + ',' + Math.round(p.y / 12);
        if (!seen.has(key)) { seen.add(key); pts.push(p); }
      }
    });
    // the question mark appears above and beside the sprout: its square must be free too
    // (symbol = +1 / -1: right or left of the head; it must be fully on screen as well as clear)
    let symbolPts = null;
    if (symbol) {
      const head = ch.model.parts.rig.localToWorld(v.set(0, 1.75, 0)), sq = 0.34 * s;
      symbolPts = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) symbolPts.push(mv.worldToScreen({ x: head.x + symbol * 0.45 * s - sq + 2 * sq * i / 4, y: head.y + 0.32 * s - sq + 2 * sq * j / 4, z: head.z }));
      pts.push(...symbolPts);
    }
    let eyes = 0;
    const em = 0.3 * s * K; // the whole eye, with a little face around it, must be on screen
    ch.model.parts.eyes.forEach((e) => { const q = mv.worldToScreen(e.group.getWorldPosition(v)); if (q.x > em && q.x < this.vw - em && q.y > em && q.y < this.vh - em) eyes++; });
    o.position.copy(keep.p); o.rotation.copy(keep.r); mv.setScale(keep.s); o.updateMatrixWorld(true);
    return { pts, eyes, symbolPts };
  }
  surpriseSpot(size, corner, symbol) {
    const nav = this.rootRef.current.querySelector('.ls-nav'), top = (nav ? nav.getBoundingClientRect().bottom : 0) + 8, vw = this.vw, vh = this.vh;
    // things Leafity must not cover (decorative background shapes don't count)
    const busy = 'a,button,summary,details,p,h1,h2,h3,ol,ul,svg:not(.ls-deco):not(.ls-scene svg),img,input,.ls-card,.ls-bubble,.ls-say,.ls-hphone,.ls-phone,.ls-fact,.ls-nav,.ls-note,.ls-eyebrow,.ls-chip,.ls-fbtn,.pm';
    let m = 12; // clearance around the silhouette, px (more for giants: they sway further)
    const clear = (r) => {
      if (r.eyes < 1) return null;
      if (r.symbolPts && r.symbolPts.some((p) => p.x < 4 || p.x > vw - 4 || p.y < top || p.y > vh - 4)) return null;
      let shown = 0;
      for (const p of r.pts) {
        if (p.x < -m || p.x > vw + m || p.y < -m || p.y > vh + m) continue;
        if (p.x >= 0 && p.x < vw && p.y >= 0 && p.y < vh) shown++;
        if (p.y < top && p.x > -2 && p.x < vw + 2) return null; // under the header
        for (const [dx, dy] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]]) {
          const x = p.x + dx, y = p.y + dy;
          if (x < 0 || x >= vw || y < 0 || y >= vh) continue;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest(busy)) return null;
        }
      }
      return shown;
    };
    const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const cap = Math.min(0.85, vw / (5.5 * K)), phone = vw < 600, H = 1.95 * K; // H: body height in px at scale 1
    // giant: 50–65 % of the viewport height on desktop (a little less if that's all the room there is),
    // about a third on phones; never wider than ~45 % of the screen
    const giant = (phone ? [0.36, 0.3] : [0.65, 0.58, 0.5, 0.45]).map((f) => Math.min(f * vh / H, 0.45 * vw / (1.1 * K)));
    const sizes = { giant, medium: [cap, cap * 0.85], small: [cap * 0.62, cap * 0.5] };
    const order = { giant: ['giant', 'medium', 'small'], medium: ['medium', 'small'], small: ['small'] }[size];
    for (const cls of order) {
      const big = cls === 'giant', lean = big ? 0.08 : 0.22;
      m = big ? 30 : 12;
      for (const s of sizes[cls]) {
        if (big && s * H < 0.25 * vh) continue; // too small to count as giant
        const sides = shuffle(['left', 'right']), corners = shuffle(['bottom-left', 'bottom-right']);
        for (const side of corner ? [...corners, ...(big ? sides : [])] : [...sides, ...(big ? corners : [])]) {
          // giants show less of themselves: only part of the face, from well beyond the edge
          const isCorner = side.startsWith('bottom'), reveal = big ? (isCorner ? 0.3 : 0.36) : 0.6;
          if (isCorner) {
            const r = this.peekPoints(side, s, reveal, lean, undefined, symbol && (side.endsWith('right') ? -1 : 1)), n = clear(r);
            if (n > 20) return { size: cls, s, side, reveal, lean, shown: n };
            continue;
          }
          // side edges: feet anywhere from mid-screen to below the bottom (giants are cropped there)
          const lo = Math.max(top + 0.95 * s * H, 0.45 * vh), hi = vh + (big ? 0.3 * s * K : -6);
          for (const f of shuffle([0, 0.2, 0.4, 0.6, 0.8, 1])) {
            const feet = lo + (hi - lo) * f;
            if (hi < lo && f > 0) continue;
            const r = this.peekPoints(side, s, reveal, lean, feet, symbol && (side.endsWith('right') ? -1 : 1)), n = clear(r);
            if (n > 20) return { size: cls, s, side, feet, reveal, lean, shown: n };
          }
        }
      }
    }
    return null;
  }
  // kind: 'header' (hang, wave, peek, surprise) or 'surprise'.
  //   small and medium: slow (one eye first), wave, question, glass, stare, pop
  //   giant:            slow, curious (question mark), wave, pop (surprised), corner (stare), grip (hands on the edge)
  async visit(kind, variant, force, forceSize) {
    const ch = this.ch, now = performance.now();
    if (!ch || this.visiting || this.dead) return;
    const later = (sec) => { if (this.due) this.due[kind] = performance.now() + sec * 1000; this.plan(); };
    // stay quiet while the visitor is scrolling, has only just arrived in a section, or is playing with Leafity
    if (!force && (document.hidden || this.tapBusy || now - (this.scrolledAt || 0) < 1500 || now - (this.enteredAt || 0) < 12000)) { later(15); return; }
    if (kind === 'surprise' && !force && !['about', 'features', 'how', 'download'].includes(this.active)) { later(25); return; }
    const VARS = { giant: ['slow', 'curious', 'wave', 'pop', 'corner', 'grip'], normal: ['slow', 'wave', 'question', 'glass', 'stare', 'pop'] };
    let v, spot = null;
    if (kind === 'header') {
      v = variant || this.pick('header', ['peek', 'hang', 'wave', 'surprise']);
      spot = this.headerSpot();
    } else {
      const size = forceSize || this.surpriseSize();
      v = variant || this.pick('surprise-' + (size === 'giant' ? 'giant' : 'normal'), VARS[size === 'giant' ? 'giant' : 'normal']);
      spot = this.surpriseSpot(size, v === 'stare' || v === 'pop' || v === 'corner', v === 'curious' || v === 'question');
      // fell back to a smaller size: use a variation that suits it
      if (spot && spot.size !== 'giant' && !VARS.normal.includes(v)) v = variant && VARS.normal.includes(variant) ? variant : this.pick('surprise-normal', VARS.normal);
    }
    if (!spot) { later(30); return; }
    this.lastSurprise = kind === 'surprise' ? { size: spot.size, variant: v, side: spot.side, s: +spot.s.toFixed(2) } : null;
    this.visiting = true;
    const k = ++this.seq, canvas = this.canvasRef.current, E = ch.edge, mv = ch.mover;
    this.cancelPauses();
    try {
      ch.animator.returnToIdle();
      if (this.onScreen()) await this.scaleTo(0.001, 0.16);
      this.hide();
      if (k !== this.seq) return;
      // fixed to the viewport for the length of the visit (the header is sticky; screen edges don't scroll)
      const r = this.rootRef.current.getBoundingClientRect();
      this.pin = { left: r.left, top: r.top };
      this.frameCamera();
      mv.setScale(spot.s); // full size before it comes into view: it never grows while visible
      if (kind === 'header') {
        canvas.style.zIndex = 15; // in front of the page, still behind the header it hangs from
        this.mode = 'hanging';
        const rect = { left: 0, top: spot.bottom, right: this.vw, bottom: this.vh }, along = spot.x / this.vw;
        if (v === 'peek') await E.peek({ side: 'top', rect, along, style: 'smooth', act: 'blink', reveal: 0.5 });
        else if (v === 'surprise') await E.peek({ side: 'top', rect, along, style: 'smooth', act: 'surprised', reveal: 0.55 });
        else if (v === 'wave') await E.dropIn({ rect, along, act: 'wave' });
        else await E.dropIn({ rect, along, hold: 2.2 });
      } else {
        // emerges from beyond the edge of the screen, behind the page content
        this.mode = 'peeking';
        const o = { side: spot.side, reveal: spot.reveal, lean: spot.lean, y: spot.feet == null ? undefined : mv.screenToWorld(0, spot.feet, 0).y, symbolX: spot.side.endsWith('right') ? -0.45 : 0.45 };
        if (spot.size === 'giant') {
          // slower, grander entrances; held 3–5 s
          if (v === 'slow') await E.peek({ ...o, style: 'curious', act: 'blink' }); // one eye, then part of the face, a look, a blink
          else if (v === 'curious') await E.peek({ ...o, lean: spot.side.startsWith('bottom') ? o.lean : 0.16, style: 'smooth', act: 'curious' }); // leans in, question mark, tilt
          else if (v === 'wave') await E.peek({ ...o, style: 'smooth', act: 'wave' });
          else if (v === 'pop') await E.peek({ ...o, style: 'quick', act: 'surprised' }); // pops in, looks surprised, blinks, gone
          else if (v === 'corner') await E.peek({ ...o, style: 'smooth', act: 'stare', hold: rnd(2.6, 3.4) }); // from a lower corner, holds the visitor's gaze
          else await E.peek({ ...o, pose: 'edgeGrip', style: 'smooth', act: 'stare', hold: rnd(3, 4) }); // grip: tiny hands on the edge
        } else if (v === 'slow') await E.peek({ ...o, style: 'curious', act: 'blink' }); // one eye, then the face
        else if (v === 'wave') await E.peek({ ...o, style: 'smooth', act: 'wave' });
        else if (v === 'question') await E.peek({ ...o, style: 'smooth', act: 'curious' });
        else if (v === 'glass') await E.peek({ ...o, style: 'smooth', act: 'inspect' });
        else if (v === 'stare') await E.peek({ ...o, style: 'smooth', act: 'stare', hold: 2.4 });
        else await E.peek({ ...o, style: 'quick' });
      }
    } catch (e) { console.error(e); } finally {
      if (k === this.seq) this.hide(); // back to normal size happens in enter(), out of sight
      this.pin = null;
      canvas.style.zIndex = '';
      this.visiting = false;
      this.mode = 'returning';
      if (this.due) { const t = performance.now(), other = kind === 'header' ? 'surprise' : 'header'; this.due[kind] = t + rnd(this.every[kind][0], this.every[kind][1]) * 1000; this.due[other] = Math.max(this.due[other], t + 45000); }
      this.plan();
      if (!this.dead && k === this.seq) this.enter(this.active);
    }
  }

  // Meet Leafity buttons and the feature picker
  play(name) {
    const ch = this.ch;
    if (!ch || this.visiting) return;
    if (this.active !== 'leafity' && this.active !== 'features') return;
    ch.mover.stop();
    ch.playAnimation(name);
  }

  renderVals() {
    const { menu, feat, noWebgl } = this.state;
    const p = this.props, tba = 'To be announced', apkUrl = p.apkUrl ?? 'apk.txt';
    return {
      rootRef: this.rootRef,
      canvasRef: this.canvasRef,
      noWebgl,
      menuOpen: menu,
      menuLabel: menu ? 'Close menu' : 'Menu',
      menuCls: menu ? 'open' : '',
      toggleMenu: () => this.setState({ menu: !menu }),
      closeMenu: () => this.setState({ menu: false }),
      feats: FEATURES.map((f, i) => ({ num: 'Feature ' + (i + 1), title: f.title, desc: f.desc, on: i === feat, pick: () => { this.setState({ feat: i }); if (this.active === 'features') this.play(f.clip); } })),
      featScreen: FEATURES[feat].screen,
      featDesc: FEATURES[feat].desc,
      two: 2,
      minusTwo: -2,
      heroTilt: -4,
      doWave: () => this.play('wave'),
      doHop: () => this.play('happyHop'),
      doCurious: () => this.play('curiousTilt'),
      doHappy: () => this.play('love'),
      doBow: () => this.play('bow'),
      // The download: change apkUrl and apkFileName (e.g. /LeafSpectra.apk) and switch apkIsTest off
      // when the real installer is ready. An empty apkUrl shows "coming soon" instead of a button.
      hasApk: !!apkUrl,
      noApk: !apkUrl,
      apkUrl,
      apkName: p.apkFileName ?? 'apk.txt',
      apkTest: !!apkUrl && (p.apkIsTest ?? true),
      appVersion: p.appVersion || tba,
      minAndroid: p.minAndroid || tba,
      apkSize: p.apkSize || tba,
    };
  }
}
