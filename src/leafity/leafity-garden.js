// Leafity's gardening costume and props — EXPERIMENT (Hand-Drawn Garden Concept only).
//
// Everything here is temporary and sits on top of the unchanged Leafity model:
//   • the straw-yellow farmer hat (3D, faceted like the pot, woven triangle pattern) — child of the
//     body, so it follows every hop, lean and tilt; the sprout grows up through its crown
//   • hand-held tools drawn in the app's illustration style (watering can, hoe) — flat
//     hand-drawn pictures on a plane that is a child of the holding arm, so they follow the hand;
//     their angle is set by the animation, not by the arm's own rotation
//   • water drops and soil puffs — small hand-drawn sprites in the scene that fly to a point
//     on the page (the soil of a pot or the seed tray)
//
//   const g = createGarden(THREE, character);
//   g.hat(true);  g.hold('can', 'left');  g.tool(-0.7);  g.pour(from, to);  g.clear();  g.dispose();
//
// Nothing here creates objects per frame; textures and geometry are made once and reused.
const BROWN = 0x45392a;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const outBack = (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// tools: picture, size (model units, Leafity is ~1.9 tall), where the hand holds it and where
// the business end is — all in the picture's own pixel coordinates
const TOOLS = {
  can: { src: 'watering-can.svg', w: 200, h: 140, size: 0.86, grip: [97, 18], tip: [186, 52] },
  hoe: { src: 'hoe.svg', w: 68, h: 200, size: 1.15, grip: [34, 62], tip: [18, 192] },
};

export function createGarden(THREE, ch) {
  const model = ch.model, parts = model.parts;
  // (website build) the hat and tool pictures are served from public/hand-drawn-garden/assets
  const url = (f) => '/hand-drawn-garden/assets/' + f;
  const disposables = [];

  // ---- the green farmer hat -----------------------------------------------------------------
  // A shallow faceted straw cone resting on the pot's rim, with a hole at the crown for the stem.
  // Colours per facet: light straw crown, a band of alternating (woven) triangles, a darker brim.
  const hatGroup = new THREE.Group();
  hatGroup.name = 'farmerHat';
  {
    const prof = [[0.07, 1.5], [0.2, 1.44], [0.42, 1.33], [0.66, 1.21], [0.9, 1.11], [1.04, 1.05], [1.03, 1.01], [0.9, 1.04], [0.74, 1.09], [0.68, 1.1]];
    const seg = 14;
    let geo = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg).toNonIndexed();
    geo.rotateY(Math.PI / seg);
    const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3);
    const C = { crown: new THREE.Color('#f6e3a1'), light: new THREE.Color('#f8e9b4'), mid: new THREE.Color('#e2c26e'), brim: new THREE.Color('#d2ae5c'), under: new THREE.Color('#bf9a4c') };
    for (let f = 0; f < n; f += 3) {
      let y = 0, ang = 0, r = 0;
      for (let k = 0; k < 3; k++) { y += pos.getY(f + k) / 3; const x = pos.getX(f + k), z = pos.getZ(f + k); ang += Math.atan2(z, x) / 3; r += Math.hypot(x, z) / 3; }
      const sector = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * seg * 2);
      const tri = (f / 3) % 2;
      let c;
      if (r < 0.95 && y < 1.1) c = C.under;          // underside of the brim
      else if (r > 0.93) c = C.brim;                  // brim edge
      else if (y > 1.36) c = C.crown;                 // crown
      else c = tri ? C.mid : C.light;               // triangle pattern band
      const v = 1 + (Math.sin(f * 12.9898) * 43758.5453 % 1) * 0.05;
      for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r * v; col[(f + k) * 3 + 1] = c.g * v; col[(f + k) * 3 + 2] = c.b * v; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const hat = new THREE.Mesh(geo, mat);
    // brown outline like the rest of Leafity: the same shape pushed out a little, back faces only
    const og = geo.clone(), op = og.attributes.position, on = og.attributes.normal;
    for (let i = 0; i < op.count; i++) op.setXYZ(i, op.getX(i) + on.getX(i) * 0.022, op.getY(i) + on.getY(i) * 0.022, op.getZ(i) + on.getZ(i) * 0.022);
    const omat = new THREE.MeshBasicMaterial({ color: BROWN, side: THREE.BackSide });
    const outline = new THREE.Mesh(og, omat);
    hat.add(outline);
    hatGroup.add(hat);
    disposables.push(geo, og, mat, omat);
  }
  hatGroup.visible = false;
  parts.body.add(hatGroup);
  const hatState = { on: false, k: 0 };

  // ---- tool pictures ------------------------------------------------------------------------
  const texCache = {};
  const texture = (name) => texCache[name] || (texCache[name] = new Promise((res) => {
    const t = TOOLS[name] || { src: name };
    const img = new Image();
    img.onload = () => {
      const s = 3, cv = document.createElement('canvas');
      cv.width = (t.w || img.naturalWidth) * s; cv.height = (t.h || img.naturalHeight) * s;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const tx = new THREE.CanvasTexture(cv);
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.anisotropy = 4;
      disposables.push(tx);
      res(tx);
    };
    img.onerror = () => res(null);
    img.src = url(t.src || name);
  }));
  const holders = {};
  const makeTool = (name) => {
    const t = TOOLS[name], k = t.size / Math.max(t.w, t.h);
    const geo = new THREE.PlaneGeometry(t.w * k, t.h * k);
    geo.translate((t.w / 2 - t.grip[0]) * k, (t.grip[1] - t.h / 2) * k, 0); // grip at the origin
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, opacity: 0, visible: false });
    texture(name).then((tx) => { if (tx) { mat.map = tx; mat.visible = true; mat.needsUpdate = true; } });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 30;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.visible = false;
    disposables.push(geo, mat);
    return { name, t, k, holder, mesh, mat, arm: null, angle: 0, target: 0, k01: 0, on: false };
  };
  const tools = { can: makeTool('can'), hoe: makeTool('hoe') };
  const tipLocal = (tool) => new THREE.Vector3((tool.t.tip[0] - tool.t.grip[0]) * tool.k, (tool.t.grip[1] - tool.t.tip[1]) * tool.k, 0);

  // ---- particles: water drops and soil puffs ------------------------------------------------
  const fxGroup = new THREE.Group();
  fxGroup.name = 'gardenFx';
  const pool = [];
  let particles = [];
  const spriteMat = {};
  ['water-drop.svg', 'soil-puff.svg'].forEach((f) => texture(f).then((tx) => { spriteMat[f] = tx; }));
  const sprite = (file) => {
    let p = pool.pop();
    if (!p) { const m = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }); p = new THREE.Sprite(m); p.renderOrder = 31; disposables.push(m); }
    p.material.map = spriteMat[file] || null; p.material.needsUpdate = true; p.material.opacity = 0; p.material.rotation = 0;
    p.visible = true;
    fxGroup.add(p);
    return p;
  };
  const free = (q) => { q.s.visible = false; fxGroup.remove(q.s); pool.push(q.s); };

  const tmp = new THREE.Vector3();
  const api = {
    hat(on) { hatState.on = !!on; if (on) hatGroup.visible = true; },
    get hatOn() { return hatState.on; },
    // put a tool in Leafity's hand ('left' = the hand on the viewer's left)
    hold(name, side = 'right') {
      const tool = tools[name];
      if (!tool) return;
      const arm = side === 'left' ? parts.armL : parts.armR;
      if (tool.holder.parent !== arm) arm.add(tool.holder);
      tool.holder.position.set(0.34, -0.02, 0.06);
      tool.arm = arm; tool.on = true; tool.holder.visible = true;
    },
    drop(name) { const t = tools[name]; if (t) t.on = false; },
    // tool angle on screen, radians: + = counter-clockwise for the right hand (mirrored for the left)
    tool(name, angle, snap) { const t = tools[name]; if (!t) return; t.target = angle; if (snap) t.angle = angle; },
    tip(name, out = new THREE.Vector3()) { const t = tools[name]; return t.mesh.localToWorld(out.copy(tipLocal(t))); },
    holding(name) { return !!tools[name] && tools[name].on; },
    // one water drop from the can's spout to a world point (arc, then a tiny splash)
    drop1(to, scale) {
      const from = api.tip('can', new THREE.Vector3()), s = sprite('water-drop.svg'), dur = rnd(0.42, 0.55);
      const end = to.clone().add(new THREE.Vector3(rnd(-0.12, 0.12) * scale, 0, 0));
      particles.push({ s, t: 0, dur, kind: 'drop', from, end, size: 0.17 * scale, lift: 0.18 * scale });
    },
    puff(at, scale, n = 3) {
      for (let i = 0; i < n; i++) {
        const s = sprite('soil-puff.svg'), dur = rnd(0.5, 0.75), dir = rnd(-1, 1);
        particles.push({ s, t: 0, dur, kind: 'puff', from: at.clone().add(new THREE.Vector3(dir * 0.06 * scale, 0, 0)), vx: dir * 0.35 * scale, vy: rnd(0.35, 0.6) * scale, size: rnd(0.09, 0.14) * scale });
      }
    },
    // take everything off: hat, tools, particles (fades quickly; safe to call any time)
    clear() { hatState.on = false; Object.values(tools).forEach((t) => { t.on = false; }); },
    busy() { return hatState.on || hatState.k > 0.01 || Object.values(tools).some((t) => t.on || t.k01 > 0.01) || particles.length > 0; },
    update(dt) {
      if (ch.object.parent && fxGroup.parent !== ch.object.parent) ch.object.parent.add(fxGroup);
      // hat: pops on with a little drop and a squash, goes off quickly
      hatState.k = hatState.on ? Math.min(1, hatState.k + dt / 0.38) : Math.max(0, hatState.k - dt / 0.22);
      if (hatState.k <= 0) hatGroup.visible = false;
      else {
        const e = hatState.on ? outBack(hatState.k) : hatState.k;
        hatGroup.scale.set(e, e * (0.85 + 0.15 * clamp(hatState.k * 1.4)), e);
        hatGroup.position.y = 0.35 * (1 - clamp(hatState.k * 1.3)) * (hatState.on ? 1 : 0);
      }
      // tools follow the hand; the angle on screen is the animation's, whatever the arm does
      Object.values(tools).forEach((t) => {
        t.k01 = t.on ? Math.min(1, t.k01 + dt / 0.25) : Math.max(0, t.k01 - dt / 0.2);
        if (t.k01 <= 0) { t.holder.visible = false; if (t.holder.parent) t.holder.parent.remove(t.holder); return; }
        t.angle += (t.target - t.angle) * (1 - Math.exp(-dt * 14));
        t.holder.rotation.z = t.angle - (t.arm ? t.arm.rotation.z : 0);
        const e = t.on ? outBack(t.k01) : t.k01;
        t.mesh.scale.setScalar(Math.max(0.001, e));
        t.mat.opacity = clamp(t.k01 * 2);
      });
      // particles
      fxGroup.scale.set(1, 1, 1);
      particles = particles.filter((q) => {
        q.t += dt;
        const u = clamp(q.t / q.dur);
        if (q.kind === 'drop') {
          tmp.lerpVectors(q.from, q.end, u);
          tmp.y = q.from.y + (q.end.y - q.from.y) * u * u + q.lift * 4 * u * (1 - u) * 0.35;
          q.s.position.copy(tmp);
          q.s.scale.set(q.size * 0.85, q.size, 1);
          q.s.material.rotation = -0.5 * (q.end.x - q.from.x > 0 ? 1 : -1) * (1 - u);
          q.s.material.opacity = clamp(u / 0.12) * clamp((1 - u) / 0.15 + 0.2);
        } else {
          q.s.position.set(q.from.x + q.vx * q.t, q.from.y + q.vy * q.t - 0.9 * q.t * q.t * q.vy, q.from.z);
          const g = q.size * (0.6 + 0.6 * u);
          q.s.scale.set(g, g * 0.8, 1);
          q.s.material.opacity = clamp((1 - u) / 0.5) * 0.95;
        }
        if (u >= 1) { free(q); return false; }
        return true;
      });
    },
    dispose() {
      particles.forEach(free); particles = [];
      if (hatGroup.parent) hatGroup.parent.remove(hatGroup);
      Object.values(tools).forEach((t) => { if (t.holder.parent) t.holder.parent.remove(t.holder); });
      if (fxGroup.parent) fxGroup.parent.remove(fxGroup);
      disposables.forEach((d) => d.dispose && d.dispose());
    },
  };
  return api;
}
