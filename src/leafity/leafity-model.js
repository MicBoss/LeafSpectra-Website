// Leafity — low-poly mascot model. Pure geometry + named pivots, no animation logic.
// createLeafity(THREE, opts) -> { root, parts, rest, setOutline(on), setFaceSmooth(on), dispose() }
//
// Rig hierarchy (every group is a pivot the animation system drives):
//   Leafity (root)      position / heading / size — owned by the movement controller
//   └─ rig              in-place animation offsets (hop, step back, grow)
//      ├─ footL, footR  pivot on the ground
//      └─ body          pivot at the pot base (tilt, lean, twist, squash)
//         ├─ armL, armR pivot at the shoulder
//         ├─ eyeL, eyeR open / happy / sleep variants, pupil + glint
//         ├─ browL, browR, mouth (smile + "o")
//         └─ sprout     pivot on the soil → leafL, leafR pivot at the stem tip
export const LEAFITY_COLORS = {
  pot: '#c3e1a6', rim: '#a3cb7f', soil: '#74492a', leaf: '#8fcf3e', stem: '#6eaa2e',
  cream: '#fdf2d3', limb: '#fdeecb', pink: '#f7b2aa', brown: '#5b3a1e', white: '#fffaf0', mouth: '#e5566b',
};

export function createLeafity(THREE, opts = {}) {
  const C = LEAFITY_COLORS;
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const mats = {};
  const faceted = (name, color) => mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ name, color, roughness: 0.92, metalness: 0, flatShading: true, vertexColors: true }));
  const flat = (name, color) => mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ name, color, roughness: 0.8, metalness: 0 }));
  const outlineMat = new THREE.MeshBasicMaterial({ name: 'outline', color: C.brown, side: THREE.BackSide });
  const outlines = [];

  // Jitter shared vertices, split faces, give each triangle a slight brightness shift.
  const facet = (geo, jitter = 0, variance = 0.1) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = r3(p.getX(i)), y = r3(p.getY(i)), z = r3(p.getZ(i));
      p.setXYZ(i, x + (hash(x, y, z) - 0.5) * jitter, y + (hash(y, z, x) - 0.5) * jitter, z + (hash(z, x, y) - 0.5) * jitter);
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) {
      const v = 1 + (hash(f * 1.7, f * 0.31, 9.1) - 0.5) * variance;
      for (let k = 0; k < 9; k++) col[f * 9 + k] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const outline = (mesh, t = 0.024) => {
    const g = mesh.geometry.clone();
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), s = g.boundingBox.getSize(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    g.scale(1 + 2 * t / s.x, 1 + 2 * t / s.y, 1 + 2 * t / s.z);
    g.translate(c.x, c.y, c.z);
    const o = new THREE.Mesh(g, outlineMat);
    o.name = mesh.name + '_outline';
    mesh.add(o);
    outlines.push(o);
  };
  const mesh = (name, geo, material, parent, ol = true) => {
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    parent.add(m);
    if (ol) outline(m);
    return m;
  };
  const group = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const blob = (sx, sy, sz, tx = 0, ty = 0, tz = 0, detail = 2) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.scale(sx, sy, sz);
    g.translate(tx, ty, tz);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'Leafity';
  const rig = group('rig', root);

  // Feet — pivot on the ground, tucked a little into the pot base
  const rest = { arm: -0.35, leaf: 0.5, armX: 0.64, armY: 0.34, armZ: 0.12, footX: 0.3, footZ: 0.07 };
  const footL = group('footL', rig, -rest.footX, 0, rest.footZ);
  const footR = group('footR', rig, rest.footX, 0, rest.footZ);
  const footGeo = () => facet(blob(0.175, 0.125, 0.205, 0, 0.12, 0), 0.007, 0.05);
  mesh('footL_mesh', footGeo(), faceted('limb', C.limb), footL);
  mesh('footR_mesh', footGeo(), faceted('limb', C.limb), footR);

  // Body — pivot at pot base so squash/stretch stays grounded.
  // Rounded base corner, softer shoulder, bevelled rim; still flat-shaded facets.
  const body = group('body', rig, 0, 0.16, 0);
  mesh('pot', facet(lathe([[0, 0], [0.43, 0], [0.55, 0.025], [0.63, 0.09], [0.685, 0.22], [0.712, 0.4], [0.72, 0.6], [0.705, 0.76], [0.675, 0.88]], 12).rotateY(Math.PI / 12), 0.02, 0.12), faceted('pot', C.pot), body);
  mesh('rim', facet(lathe([[0.62, 0.85], [0.735, 0.85], [0.775, 0.875], [0.795, 0.925], [0.797, 1.02], [0.78, 1.07], [0.745, 1.1], [0.62, 1.1]], 12), 0.012, 0.1), faceted('rim', C.rim), body);
  mesh('soil', facet(lathe([[0.68, 1.07], [0.5, 1.15], [0.26, 1.21], [0, 1.23]], 12), 0.018, 0.14), faceted('soil', C.soil), body, false);

  // Face patch + features
  const F = { cx: 0, cy: 0.44, cz: 0.5, rx: 0.54, ry: 0.4, rz: 0.3 };
  const faceShape = (w, h) => { const g = new THREE.SphereGeometry(1, w, h); g.scale(F.rx, F.ry, F.rz); g.translate(F.cx, F.cy, F.cz); return g; };
  // Two versions of the face patch: a soft, smooth-shaded one (default) and the earlier
  // faceted one, so the look can be compared with setFaceSmooth(). The body stays low-poly.
  const smoothGeo = faceShape(36, 20), sp = smoothGeo.attributes.position, sn = smoothGeo.attributes.normal, nv = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    nv.set((sp.getX(i) - F.cx) / (F.rx * F.rx), (sp.getY(i) - F.cy) / (F.ry * F.ry), (sp.getZ(i) - F.cz) / (F.rz * F.rz)).normalize();
    sn.setXYZ(i, nv.x, nv.y, nv.z);
  }
  smoothGeo.deleteAttribute('uv');
  const faceSmooth = mesh('face', smoothGeo, flat('creamSoft', C.cream), body, false);
  const faceFaceted = mesh('face_faceted', facet(faceShape(16, 9), 0, 0.02), faceted('cream', C.cream), body, false);
  faceFaceted.visible = false;
  const onFace = (obj, x, y, lift = 0.02) => {
    const u = x / F.rx, v = (y - F.cy) / F.ry, w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const n = new THREE.Vector3(u / F.rx, v / F.ry, w / F.rz).normalize();
    obj.position.set(x + n.x * lift, y + n.y * lift, F.cz + F.rz * w + n.z * lift);
    obj.rotation.order = 'YXZ';
    obj.rotation.y = Math.atan2(n.x, n.z);
    obj.rotation.x = -Math.asin(n.y);
    return obj;
  };
  const disc = (name, r, material, parent, x = 0, y = 0, z = 0, a0 = 0, len = Math.PI * 2) => {
    const m = mesh(name, new THREE.CircleGeometry(r, 28, a0, len), material, parent, false);
    m.position.set(x, y, z);
    return m;
  };
  const eyes = [];
  [['eyeL', -0.21], ['eyeR', 0.21]].forEach(([name, x]) => {
    const eye = onFace(group(name, body), x, 0.5);
    const open = group(name + '_open', eye);
    disc(name + '_ring', 0.108, flat('brown', C.brown), open);
    disc(name + '_white', 0.09, flat('eyeWhite', C.white), open, 0, 0, 0.004);
    const pupil = disc(name + '_pupil', 0.063, flat('brown', C.brown), open, 0.008 * Math.sign(-x), -0.004, 0.008);
    const glint = disc(name + '_glint', 0.022, flat('eyeWhite', C.white), open, -0.02, 0.026, 0.012);
    pupil.userData.base = pupil.position.clone();
    glint.userData.base = glint.position.clone();
    const arc = () => new THREE.TorusGeometry(0.072, 0.017, 5, 12, Math.PI);
    const happy = mesh(name + '_happy', arc(), flat('brown', C.brown), eye, false); // ∩ smiling eyes
    happy.position.set(0, -0.03, 0.006);
    happy.visible = false;
    const sleep = mesh(name + '_sleep', arc(), flat('brown', C.brown), eye, false); // ∪ closed eyes
    sleep.rotation.z = Math.PI;
    sleep.position.set(0, 0.02, 0.006);
    sleep.visible = false;
    eyes.push({ group: eye, open, happy, sleep, pupil, glint });
  });
  // Eyebrows — hidden at rest (the 2D mascot has none); they only appear for expressions.
  const brows = [['browL', -0.21], ['browR', 0.21]].map(([name, x]) => {
    const b = onFace(group(name, body), x, 0.665, 0.018);
    const g = new THREE.CircleGeometry(0.056, 12);
    g.scale(1, 0.3, 1);
    mesh(name + '_mesh', g, flat('brown', C.brown), b, false);
    b.visible = false;
    return b;
  });
  [['cheekL', -0.39], ['cheekR', 0.39]].forEach(([name, x]) => {
    const c = onFace(disc(name, 0.074, flat('pink', C.pink), body), x, 0.35, 0.016);
    c.scale.y = 0.7;
  });
  const mouth = onFace(group('mouth', body), 0, 0.37);
  const mouthSmile = group('mouth_smile', mouth);
  disc('mouth_line', 0.056, flat('brown', C.brown), mouthSmile, 0, 0, 0, Math.PI, Math.PI);
  disc('mouth_inner', 0.036, flat('mouthRed', C.mouth), mouthSmile, 0, -0.008, 0.004, Math.PI, Math.PI);
  const mouthO = group('mouth_o', mouth, 0, -0.02, 0);
  disc('mouth_o_ring', 0.046, flat('brown', C.brown), mouthO);
  disc('mouth_o_inner', 0.028, flat('mouthRed', C.mouth), mouthO, 0, 0, 0.004);
  mouthO.scale.setScalar(0.001);

  // Arms — pivot at the shoulder, set slightly into the pot; local +x points outward on both sides
  const armGeo = () => facet(blob(0.2, 0.115, 0.125, 0.16, 0, 0), 0.007, 0.05);
  const armR = group('armR', body, rest.armX, rest.armY, rest.armZ);
  const armL = group('armL', body, -rest.armX, rest.armY, rest.armZ);
  armL.rotation.y = Math.PI;
  mesh('armR_mesh', armGeo(), faceted('limb', C.limb), armR);
  mesh('armL_mesh', armGeo(), faceted('limb', C.limb), armL);

  // Sprout — stem + two leaves pivoting at the stem tip
  const sprout = group('sprout', body, 0, 1.2, 0);
  const stemGeo = new THREE.CylinderGeometry(0.034, 0.05, 0.34, 7);
  stemGeo.translate(0, 0.17, 0);
  mesh('stem', facet(stemGeo, 0, 0.1), faceted('stem', C.stem), sprout, true);
  const leafGeo = (roll) => {
    const g = new THREE.SphereGeometry(1, 8, 5);
    g.rotateZ(-Math.PI / 2);
    // Taper toward the tip so leaves read as pointed sprout leaves, not ovals
    const lp = g.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i), f = x > 0 ? 1 - 0.5 * x : 1 - 0.15 * -x;
      lp.setY(i, lp.getY(i) * f);
      lp.setZ(i, lp.getZ(i) * f);
    }
    g.scale(0.3, 0.072, 0.25);
    g.rotateX(roll);
    g.translate(0.3, 0, 0);
    return facet(g, 0.014, 0.2);
  };
  const leafR = group('leafR', sprout, 0, 0.31, 0);
  const leafL = group('leafL', sprout, 0, 0.31, 0);
  leafL.rotation.y = Math.PI;
  leafL.scale.setScalar(0.92);
  mesh('leafR_mesh', leafGeo(0.95), faceted('leaf', C.leaf), leafR);
  mesh('leafL_mesh', leafGeo(-0.95), faceted('leaf', C.leaf), leafL);

  armL.rotation.z = armR.rotation.z = rest.arm;
  leafL.rotation.z = leafR.rotation.z = rest.leaf;

  const setOutline = (on) => outlines.forEach((o) => { o.visible = !!on; });
  if (opts.outline === false) setOutline(false);
  const setFaceSmooth = (on) => { faceSmooth.visible = !!on; faceFaceted.visible = !on; };
  if (opts.smoothFace === false) setFaceSmooth(false);
  const dispose = () => {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    Object.values(mats).forEach((m) => m.dispose());
    outlineMat.dispose();
    if (root.parent) root.parent.remove(root);
  };

  return {
    root, rest, setOutline, setFaceSmooth, dispose,
    parts: { root, rig, body, footL, footR, armL, armR, sprout, leafL, leafR, eyes, brows, mouth, mouthSmile, mouthO },
  };
}
