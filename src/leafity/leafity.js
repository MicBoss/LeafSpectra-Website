// Leafity — reusable 3D mascot component.
//
//   const leafity = createLeafityCharacter(THREE, { camera, viewport, canvasRect });
//   scene.add(leafity.object);
//   // in your ONE render loop:  leafity.update(deltaSeconds)
//
//   leafity.playAnimation('wave')            leafity.setExpression('happy')
//   leafity.moveTo({ x: 2 })                 leafity.moveTo({ x: 2 }, { mode: 'run' | 'slide' | 'jump' })
//   leafity.lookAt(worldPoint | null)        leafity.lookAtClient(clientX, clientY)
//   leafity.pointAt(worldPoint)              leafity.peekFrom('right', { reveal: 0.5, act: 'wave' })
//   leafity.followPointer(true)              leafity.setAmbient(true)   leafity.react()
//   leafity.edge.popIn() / dropIn() / …      leafity.setAddons(false)   leafity.showAddon('check')
//   leafity.returnToIdle()                   leafity.dispose()
//
// Layers, each usable on its own:
//   leafity.model     geometry + named pivots            (leafity-model.js)
//   leafity.animator  clips, blending, expressions       (leafity-animations.js)
//   leafity.mover     travel, paths, edges, mapping      (leafity-mover.js)
//   leafity.edge      peeks and other edge behaviours    (leafity-behaviors.js)
//   leafity.fx        optional add-on symbols and props  (leafity-fx.js)
//
// The component never starts its own render loop and does not depend on any page or app.
// Options: camera (required for viewport mapping), viewport() → { width, height } of the
// canvas in CSS px, canvasRect() → DOMRect of the canvas, outline, smoothFace, addons,
// reducedMotion, onChange.
import { createLeafity, LEAFITY_COLORS } from './leafity-model.js';
import { createAnimator, CLIPS, EXPRESSIONS, CHANNELS } from './leafity-animations.js';
import { createMover } from './leafity-mover.js';
import { createBehaviors } from './leafity-behaviors.js';
import { createFx } from './leafity-fx.js';

export { CLIPS, EXPRESSIONS, CHANNELS, LEAFITY_COLORS, createLeafity, createAnimator, createMover, createBehaviors, createFx };

// Library layout for a studio UI. Item types: 'clip' (fx: whether its add-on cues show),
// 'edge' (a routine that needs page edges — run it through leafity.edge), 'toggle'.
const c = (name) => ({ type: 'clip', name, label: CLIPS[name].label, fx: false });
const x = (name, label) => ({ type: 'clip', name, label, fx: true });
const e = (id, label) => ({ type: 'edge', id, label });
export const LIBRARY = [
  { title: 'Basic idle', items: ['idle', 'lookAround', 'curiousTilt', 'blink', 'sleepy', 'doze', 'wakeUp', 'bow'].map(c) },
  { title: 'Reactions and emotions', items: ['happyHop', 'wave', 'giggle', 'dance', 'celebrate', 'surprised', 'nod', 'think'].map(c) },
  { title: 'Website edge behaviors', items: [e('peek:left', 'Peek Left'), e('peek:right', 'Peek Right'), e('peek:top', 'Peek Top'), e('peek:bottom', 'Peek Bottom'), e('corner', 'Corner Peek'), e('leanIn', 'Side Lean-In'), e('popIn', 'Pop-In From Below'), e('dropIn', 'Drop-In From Top'), e('hideReappear', 'Hide and Reappear'), e('windowPeek', 'Window Peek'), e('edgeHang', 'Edge Hang'), e('shelfSit', 'Shelf Sit'), e('assistant', 'Slide-In Assistant')] },
  { title: 'Website movement', items: [c('walk'), c('run'), c('climb'), e('sideCrawl', 'Side Crawl'), c('slide'), c('jump'), c('hang')] },
  { title: 'Interactive', items: [{ type: 'toggle', id: 'followCursor', label: 'Follow Cursor' }, c('point'), c('inspect'), c('greeting')] },
  { title: 'Plant-themed', items: ['leafFlutter', 'growing', 'watering', 'sunshine', 'cheer'].map(c) },
  { title: 'Contextual add-ons', items: [x('curiousTilt', 'Curious + Question Mark'), x('think', 'Thinking + Question Mark'), x('discover', 'Discovery + Lightbulb'), x('inspect', 'Inspect + Magnifying Glass'), x('watering', 'Watering + Watering Can'), x('sunshine', 'Sunshine + Sun'), x('celebrate', 'Celebrate + Confetti'), x('success', 'Success + Check Mark'), x('doze', 'Sleep + Zzz'), x('surprised', 'Surprise + Exclamation'), x('love', 'Happy + Hearts'), x('leafFlutter', 'Breeze + Leaf Swirl')] },
];

const REACTIONS = ['happyHop', 'wave', 'giggle', 'nod', 'curiousTilt', 'surprised', 'cheer'];
const AMBIENT = ['lookAround', 'curiousTilt', 'leafFlutter', 'blink', 'lookAround'];

export function createLeafityCharacter(THREE, opts = {}) {
  const model = createLeafity(THREE, opts);
  const animator = createAnimator(model, { onChange: opts.onChange });
  const mover = createMover(THREE, model, animator, { camera: opts.camera, viewport: opts.viewport });
  const fx = createFx(THREE, model);
  if (opts.addons === false) fx.setEnabled(false);
  // Clips carry cues for add-ons; whatever is showing fades when the next animation starts.
  animator.on('fx', (ev) => fx.spawn(ev.kind, ev.opts, ev.clip));
  animator.on('end', (ev) => fx.fade(ev.name));
  animator.on('start', () => fx.fadeAll());
  const root = model.root;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = opts.reducedMotion ?? (mq ? mq.matches : false);
  let ambient = false, ambientClips = AMBIENT, ambientIn = 6, lastReaction = '', pointerOff = null, touchTimer = 0, disposed = false;
  const applyReduced = () => animator.setIntensity(reduced ? 0.45 : 1);
  const onMq = (e) => { if (opts.reducedMotion == null) { reduced = e.matches; applyReduced(); } };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);
  applyReduced();

  const api = {
    object: root, model, animator, mover, fx,
    get reducedMotion() { return reduced; },
    setReducedMotion(on) { reduced = !!on; applyReduced(); },

    playAnimation(name, o) { return animator.play(name, o); },
    returnToIdle() { return animator.returnToIdle(); },
    setExpression(name) { animator.setExpression(name); },

    // Look toward a world point (null = look straight ahead again).
    lookAt(target) {
      if (!target) { animator.clearLook(); return; }
      const s = root.scale.x, h = root.rotation.y, c = Math.cos(h), sn = Math.sin(h);
      const dx = target.x - root.position.x, dy = target.y - (root.position.y + 0.75 * s), dz = (target.z ?? 0) - root.position.z;
      animator.setLook((dx * c - dz * sn) / (2.2 * s), dy / (1.6 * s), reduced ? 0 : 1);
    },
    // Look toward a point given in client (page) pixels, e.g. a pointer event or an element's centre.
    lookAtClient(clientX, clientY) {
      const r = opts.canvasRect ? opts.canvasRect() : { left: 0, top: 0 };
      api.lookAt(mover.screenToWorld(clientX - r.left, clientY - r.top, root.position.z + 1.5 * root.scale.x));
    },
    // Turn, raise an arm toward a world point, glance at it and back at the viewer.
    pointAt(target) {
      const s = root.scale.x;
      const x = (target.x - root.position.x) / (2 * s), y = (target.y - (root.position.y + 0.5 * s)) / (2 * s);
      return animator.play('point', { params: { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) } });
    },
    // Eyes follow the mouse; body and leaves adjust late and only a little. Touch: looks at taps.
    followPointer(on, target = typeof window !== 'undefined' ? window : null) {
      if (pointerOff) { pointerOff(); pointerOff = null; }
      if (!on || !target) { animator.clearLook(); return; }
      const move = (e) => { if (e.pointerType !== 'touch') api.lookAtClient(e.clientX, e.clientY); };
      const down = (e) => {
        if (e.pointerType !== 'touch') return;
        api.lookAtClient(e.clientX, e.clientY);
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => animator.clearLook(), 1600);
      };
      target.addEventListener('pointermove', move, { passive: true });
      target.addEventListener('pointerdown', down, { passive: true });
      pointerOff = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerdown', down); clearTimeout(touchTimer); };
    },
    // Occasional gentle idle behaviour (look around, tilt, leaf flutter). Off under reduced motion.
    // clips: optional list of animation names to choose from.
    setAmbient(on, clips) { ambient = !!on; ambientClips = clips || AMBIENT; ambientIn = 4 + Math.random() * 4; },
    // A random friendly reaction, never the same twice in a row.
    react() {
      let name;
      do { name = REACTIONS[Math.floor(Math.random() * REACTIONS.length)]; } while (name === lastReaction);
      lastReaction = name;
      return animator.play(name);
    },

    moveTo(target, { mode = 'walk', ...rest } = {}) {
      if (mode === 'run') return mover.walkTo(target, { ...rest, run: true });
      if (mode === 'slide') return mover.slideTo(target, rest);
      if (mode === 'jump') return mover.jumpTo(target, rest);
      if (mode === 'glide') return mover.glideTo(target, rest.dur);
      return mover.walkTo(target, rest);
    },
    peekFrom(side, o) { return api.edge.peek({ side, ...o }); },
    // Add-ons (question mark, watering can, sparkles…): switch the layer on/off, or show one directly.
    get addons() { return fx.enabled; },
    setAddons(on) { fx.setEnabled(on); },
    showAddon(kind, o) { return fx.spawn(kind, o); },
    setFaceSmooth(on) { model.setFaceSmooth(on); },
    // Back to a valid resting spot (upright, on the ground, inside the bounds) — use before playing
    // an in-place animation if Leafity may be hidden, hanging or mid-move.
    settle(o) { mover.settle(o); },
    climbTo(target, o) { return mover.climbTo(target, o); },
    hangAt(point, o) { return mover.hangAt(point, o); },
    setSpeed(x) { animator.setSpeed(x); },

    // Advance movement, then animation. dt in seconds.
    update(dt) {
      if (disposed) return;
      const d = animator.paused ? 0 : Math.min(dt, 0.1) * animator.speed;
      mover.update(d);
      animator.update(dt);
      fx.update(d);
      if (ambient && !reduced && d > 0 && animator.current === 'idle' && !mover.moving && (ambientIn -= d) <= 0) {
        ambientIn = 6 + Math.random() * 6;
        animator.play(ambientClips[Math.floor(Math.random() * ambientClips.length)]);
      }
    },
    dispose() {
      disposed = true;
      if (pointerOff) { pointerOff(); pointerOff = null; }
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      mover.dispose();
      animator.dispose();
      fx.dispose();
      model.dispose();
    },
  };
  api.edge = createBehaviors(api);
  return api;
}
