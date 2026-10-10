/* Onside hero scenes — three.js (global THREE r128). Exposes window.OnsideScenes */
(function () {
  const INK = 0x12120f, PAPER = 0xf1eee6, ACID = 0xc9f135, LIVE = 0xe8320c;

  function makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.ONSIDE_PRESERVE_BUFFER });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.setClearColor(0x000000, 0);
    return r;
  }
  function fit(renderer, camera, canvas) {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function disposeAll(scene, renderer) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
  }
  function cloud(pos, col, size, opacity) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity, sizeAttenuation: true, depthWrite: false }));
  }

  /* ---------- textures ---------- */
  function stripeTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f1eee6' : '#e8320c'; g.fillRect(i * 32, 0, 32, 64); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.x = 1.5; return t;
  }
  function signTexture(name) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 112; const g = c.getContext('2d');
    g.fillStyle = '#12120f'; g.fillRect(0, 0, 640, 112);
    g.fillStyle = '#f1eee6'; g.font = '700 74px Anton, "Arial Narrow", Impact, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(name.toUpperCase(), 320, 60, 560);
    g.fillStyle = '#e8320c'; g.fillRect(596, 74, 22, 22);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  /* ---------- boteco model ---------- */
  const SHARED = {};
  function shared() {
    if (SHARED.ready) return SHARED;
    SHARED.wall = new THREE.MeshLambertMaterial({ color: 0xd9d2c1 });
    SHARED.wallDark = new THREE.MeshLambertMaterial({ color: 0xbfb8a6 });
    SHARED.ink = new THREE.MeshLambertMaterial({ color: 0x1a1a16 });
    SHARED.roof = new THREE.MeshLambertMaterial({ color: 0x5c5950 });
    SHARED.walk = new THREE.MeshLambertMaterial({ color: 0x2c2c27 });
    SHARED.table = new THREE.MeshLambertMaterial({ color: 0xe7e3db });
    SHARED.chair = new THREE.MeshLambertMaterial({ color: 0xe8320c });
    SHARED.chair2 = new THREE.MeshLambertMaterial({ color: 0xc9f135 });
    SHARED.stripe = new THREE.MeshLambertMaterial({ map: stripeTexture() });
    SHARED.box = new THREE.BoxGeometry(1, 1, 1);
    SHARED.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
    SHARED.head = new THREE.SphereGeometry(0.5, 22, 16);
    SHARED.ring = new THREE.RingGeometry(0.5, 0.9, 40);
    // O pino do app (map-icons.ts): gota 36×46 com contorno ink e círculo paper, extrudada. Ponta na origem.
    const k = 0.056, P = (x, y) => [(x - 18) * k, (45.5 - y) * k];
    function drop(scale) {
      const s = new THREE.Shape(); const q = (x, y) => { const [a, b] = P(x, y); return [a * scale, b * scale]; };
      s.moveTo(...q(18, 1));
      s.bezierCurveTo(...q(26.8, 1), ...q(34, 8.1), ...q(34, 16.9));
      s.bezierCurveTo(...q(34, 28.3), ...q(19.8, 43.3), ...q(19, 44.1));
      s.bezierCurveTo(...q(19, 45.4), ...q(17, 45.4), ...q(17, 44.1));
      s.bezierCurveTo(...q(16.2, 43.3), ...q(2, 28.3), ...q(2, 16.9));
      s.bezierCurveTo(...q(2, 8.1), ...q(9.2, 1), ...q(18, 1));
      return s;
    }
    const body = drop(1); const hole = new THREE.Path(); const [hx, hy] = P(18, 17); hole.absarc(hx, hy, 6.5 * k, 0, Math.PI * 2, true); body.holes.push(hole);
    SHARED.pinBody = new THREE.ExtrudeGeometry(body, { depth: 0.16, bevelEnabled: false });
    SHARED.pinOutline = new THREE.ExtrudeGeometry(drop(1.09), { depth: 0.1, bevelEnabled: false });
    SHARED.pinDisc = new THREE.CylinderGeometry(6.4 * k, 6.4 * k, 0.1, 28);
    SHARED.pinCenter = [hx, hy];
    SHARED.ready = true; return SHARED;
  }
  function box(mat, w, h, d, x, y, z) { const m = new THREE.Mesh(shared().box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
  function cyl(mat, r, h, x, y, z) { const m = new THREE.Mesh(shared().cyl, mat); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); return m; }

  function makeBar(cfg, rnd) {
    const S = shared();
    const g = new THREE.Group(); g.position.set(cfg.x, 0, cfg.z);
    // sidewalk slab + body
    g.add(box(S.walk, 8.2, 0.14, 7.4, 0, 0.07, 0.9));
    g.add(box(S.wall, 5.4, 2.5, 4.4, 0, 1.39, 0));
    g.add(box(S.wallDark, 5.4, 0.28, 4.4, 0, 0.28, 0));           // rodapé
    g.add(box(S.roof, 5.2, 0.12, 4.2, 0, 2.7, 0));                  // laje
    g.add(box(S.ink, 5.7, 0.42, 4.7, 0, 2.86, 0));                  // platibanda
    g.add(box(S.wallDark, 0.9, 0.7, 0.9, -1.6, 3.35, -1.2));        // caixa d'água
    g.add(box(S.ink, 0.5, 0.7, 0.5, 1.9, 3.3, -1.4));               // chaminé/duto
    // facade (front = +z)
    g.add(box(S.ink, 0.95, 1.95, 0.1, -1.75, 1.12, 2.22));          // porta
    g.add(box(S.ink, 2.8, 1.6, 0.08, 0.75, 1.62, 2.21));            // moldura vitrine
    const tvMat = new THREE.MeshBasicMaterial({ color: 0x6a86c4 });
    const tv = box(tvMat, 2.55, 1.35, 0.06, 0.75, 1.62, 2.25); g.add(tv);
    const spillMat = new THREE.MeshBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), spillMat); spill.rotation.x = -Math.PI / 2; spill.position.set(0.75, 0.16, 3.6); g.add(spill);
    // toldo listrado
    const awn = box(S.stripe, 3.4, 0.07, 1.35, 0.75, 2.42, 2.9); awn.rotation.x = 0.42; g.add(awn);
    g.add(cyl(S.ink, 0.04, 2.1, -0.85, 1.05, 3.5)); g.add(cyl(S.ink, 0.04, 2.1, 2.35, 1.05, 3.5));
    // letreiro
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(cfg.name), color: 0x9a9a9a });
    const sign = box(signMat, 4.8, 0.84, 0.14, 0, 3.55, 2.05); g.add(sign);
    // mesinhas na calçada
    const tables = [];
    [[-2.6, 3.4], [-0.4, 4.1], [2.3, 3.5]].forEach(([tx, tz], i) => {
      const top = cyl(S.table, 0.48, 0.06, tx, 0.82, tz); g.add(top);
      g.add(cyl(S.ink, 0.04, 0.7, tx, 0.45, tz));
      g.add(cyl(S.ink, 0.22, 0.04, tx, 0.14, tz));
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, r = 0.78;
        const ch = box(k % 2 ? S.chair2 : S.chair, 0.36, 0.36, 0.36, tx + Math.cos(a) * r, 0.32, tz + Math.sin(a) * r);
        ch.rotation.y = -a; g.add(ch);
      }
      tables.push(top);
    });
    // marcador = o pino do app, em 3D, ancorado pela ponta no telhado e sempre de frente para a câmera
    const col = cfg.live ? LIVE : ACID;
    const pin = new THREE.Group(); pin.position.set(0, 3.1, -0.4);
    const face = new THREE.Mesh(S.pinBody, new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 })); face.position.z = 0.02;
    const outline = new THREE.Mesh(S.pinOutline, new THREE.MeshBasicMaterial({ color: 0x12120f })); outline.position.set(0, -0.11, -0.06);
    const disc = new THREE.Mesh(S.pinDisc, new THREE.MeshBasicMaterial({ color: 0xf1eee6 })); disc.rotation.x = Math.PI / 2; disc.position.set(S.pinCenter[0], S.pinCenter[1], 0.1);
    const ring = new THREE.Mesh(S.ring, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.scale.set(0.9, 0.5, 1);
    pin.add(outline, face, disc, ring); g.add(pin);
    const head = face, tip = outline, halo = disc, beam = ring;
    // hitbox for hover
    const hit = box(new THREE.MeshBasicMaterial({ visible: false }), 8.4, 6.2, 8, 0, 3, 0.8); hit.userData.bar = cfg.index; g.add(hit);
    g.userData = { cfg, tvMat, spillMat, signMat, pin, head, tip, halo, ring, beam, hit, glow: 0, target: 0, phase: rnd() * 6.28, flick: 1 };
    return g;
  }

  /* ---------- CIDADE / BAIRRO ---------- */
  const B = 9, S = 2, PITCH = B + S, X0 = -68, X1 = 75, Z0 = -70, Z1 = 32;
  const BARS = [
    { index: 0, name: 'Bar do Zé', x: 4.5, z: -9.8 },
    { index: 1, name: 'Sports Central', x: 15.5, z: -20.8, live: true },
    { index: 2, name: 'The Red Lion', x: 26.5, z: -9.8 },
    { index: 3, name: 'Casa da Torcida', x: 15.5, z: 1.2 },
    { index: 4, name: 'Espaço Central', x: 37.5, z: -20.8 },
    { index: 5, name: 'Bar Exemplo', x: -6.5, z: -20.8, live: true }
  ];
  const PARKS = new Set(['-11:-24', '22:-35', '33:-2', '-22:-2', '0:-46']);

  function mapa(canvas, opts) {
    opts = opts || {};
    const orbit = !!opts.orbit;
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(INK, orbit ? 36 : 40, orbit ? 100 : 105);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
    // camera orbits the neighbourhood (framing of the approved shot: cam (18,22,26) → target (13,.5,-9); drag adds yaw)
    const target = new THREE.Vector3(13, 0.5, -9);
    const cam = { yaw: 0.142, yawT: 0.142, pitch: 0.546, radius: 41.4 };
    function placeCamera(dx, dy) {
      const r = cam.radius, p = cam.pitch + (dy || 0), y = cam.yaw + (dx || 0);
      camera.position.set(target.x + r * Math.sin(y) * Math.cos(p), target.y + r * Math.sin(p), target.z + r * Math.cos(y) * Math.cos(p));
      camera.lookAt(target);
    }
    placeCamera(0, 0);
    function adjustForAspect() {
      // only portrait/narrow frames pull back; wide frames keep the approved framing
      const k = camera.aspect < 1.3 ? Math.min(1.6, 1.3 / camera.aspect) : 1;
      cam.radius = 41.4 * k;
    }

    scene.add(new THREE.AmbientLight(0x6b6a62, 0.55));
    scene.add(new THREE.HemisphereLight(0x8d8a7c, 0x0a0a08, 0.7));
    const key = new THREE.DirectionalLight(0xf1eee6, 0.75); key.position.set(-24, 40, 30); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9f135, 0.12); fill.position.set(30, 20, -20); scene.add(fill);

    const city = new THREE.Group(); scene.add(city);
    const rnd = seeded(opts.seed || 11);

    /* ground: roads + empty blocks + parks */
    const TEX = 1024, cnv = document.createElement('canvas'); cnv.width = cnv.height = TEX; const g2 = cnv.getContext('2d');
    const W = X1 - X0, D = Z1 - Z0, tx = x => ((x - X0) / W) * TEX, tz = z => ((z - Z0) / D) * TEX;
    g2.fillStyle = '#1c1c18'; g2.fillRect(0, 0, TEX, TEX);
    const parkBlocks = [];
    for (let x = X0; x < X1; x += PITCH) for (let z = Z0; z < Z1; z += PITCH) {
      const bx = x + S, bz = z + S, isPark = PARKS.has(`${bx}:${bz}`);
      if (isPark) parkBlocks.push([bx, bz]);
      g2.fillStyle = isPark ? '#1b2313' : '#131311';
      g2.fillRect(tx(bx), tz(bz), (B / W) * TEX, (B / D) * TEX);
      if (!isPark && rnd() < 0.5) { g2.fillStyle = '#161613'; g2.fillRect(tx(bx + 0.6), tz(bz + 0.6), ((B - 1.2) / W) * TEX, ((B - 1.2) / D) * TEX); }
    }
    // faixas centrais das ruas
    g2.strokeStyle = '#2a2a24'; g2.lineWidth = 1; g2.setLineDash([6, 6]);
    for (let x = X0 + S / 2; x < X1; x += PITCH) { g2.beginPath(); g2.moveTo(tx(x), 0); g2.lineTo(tx(x), TEX); g2.stroke(); }
    for (let z = Z0 + S / 2; z < Z1; z += PITCH) { g2.beginPath(); g2.moveTo(0, tz(z)); g2.lineTo(TEX, tz(z)); g2.stroke(); }
    const groundTex = new THREE.CanvasTexture(cnv); groundTex.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); city.add(ground);

    /* street lights + trees */
    const warm = new THREE.Color(0xe9dcae);
    const sl = [], slC = [];
    for (let x = X0 + S / 2; x <= X1; x += PITCH) for (let z = Z0; z <= Z1; z += 2.6) { sl.push(x + (rnd() < .5 ? -1.15 : 1.15), 0.2, z); slC.push(warm.r, warm.g, warm.b); }
    for (let z = Z0 + S / 2; z <= Z1; z += PITCH) for (let x = X0; x <= X1; x += 2.6) { sl.push(x, 0.2, z + (rnd() < .5 ? -1.15 : 1.15)); slC.push(warm.r, warm.g, warm.b); }
    city.add(cloud(sl, slC, 0.18, 0.75));
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x3e5a1e }), trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
    const treeGeo = new THREE.SphereGeometry(0.6, 10, 8);
    parkBlocks.forEach(([bx, bz]) => {
      for (let k = 0; k < 9; k++) {
        const x = bx + 0.8 + rnd() * (B - 1.6), z = bz + 0.8 + rnd() * (B - 1.6), s = 0.7 + rnd() * 0.7;
        const t = new THREE.Mesh(treeGeo, treeMat); t.scale.setScalar(s); t.position.set(x, 0.9 * s + 0.3, z); city.add(t);
        city.add(cyl(trunkMat, 0.07, 0.6, x, 0.3, z));
      }
    });

    /* cars */
    const NC = 110, carPos = new Float32Array(NC * 3), carCol = new Float32Array(NC * 3), cars = [];
    const cool = new THREE.Color(PAPER), red = new THREE.Color(LIVE);
    for (let i = 0; i < NC; i++) {
      const axisX = rnd() < 0.5, dir = rnd() < 0.5 ? 1 : -1;
      const lane = (axisX ? Z0 : X0) + Math.floor(rnd() * ((axisX ? D : W) / PITCH)) * PITCH + S / 2 + dir * 0.45;
      cars.push({ axisX, lane, dir, pos: (axisX ? X0 : Z0) + rnd() * (axisX ? W : D), speed: 3.5 + rnd() * 6 });
      const c = (axisX ? dir > 0 : dir < 0) ? cool : red; carCol.set([c.r, c.g, c.b], i * 3);
    }
    const carGeo = new THREE.BufferGeometry();
    carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3));
    carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
    city.add(new THREE.Points(carGeo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })));

    /* bars */
    const bars = BARS.map(cfg => { const b = makeBar(cfg, rnd); city.add(b); return b; });
    const hitboxes = bars.map(b => b.userData.hit);
    const cards = opts.cards || [];

    /* interaction */
    let active = -1, hover = -1, lastHover = -Infinity, cycleAt = 0;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const mouse = { x: 0, y: 0 }, smooth = { x: 0, y: 0 };
    let running = true, paused = false, t0 = performance.now(), lastNow = t0, pointerInside = false;
    let dragging = false, dragX = 0, dragMoved = 0;
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width - .5) * 2; mouse.y = ((e.clientY - r.top) / r.height - .5) * 2;
      pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (dragging) { const dx = e.clientX - dragX; dragX = e.clientX; dragMoved += Math.abs(dx); cam.yawT = Math.max(-0.7, Math.min(0.9, cam.yawT - dx * 0.004)); return; }
      if (!pointerInside || (e.target && e.target.closest && e.target.closest('a,button,input'))) { hover = -1; canvas.style.cursor = ''; return; }
      ndc.set(mouse.x, -mouse.y); ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hitboxes, false)[0];
      hover = hit ? hit.object.userData.bar : -1;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (hit) lastHover = performance.now();
    }
    function onDown(e) { dragging = true; dragX = e.clientX; dragMoved = 0; canvas.style.cursor = 'grabbing'; }
    function onUp() { if (!dragging) return; dragging = false; canvas.style.cursor = 'grab'; lastHover = performance.now(); }
    function onLeave() { hover = -1; if (!dragging) canvas.style.cursor = ''; }
    if (!orbit) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.style.touchAction = 'pan-y';
    }
    const ro = new ResizeObserver(() => { fit(renderer, camera, canvas); adjustForAspect(); }); ro.observe(canvas); fit(renderer, camera, canvas); adjustForAspect();

    const V = new THREE.Vector3(), WP = new THREE.Vector3(), tvBase = new THREE.Color(0x4d6390), tvHot = new THREE.Color(0xdbe7ff), tmp = new THREE.Color();
    const signDim = new THREE.Color(0x8a8a8a), signHot = new THREE.Color(0xffffff);
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (paused) { lastNow = now; return; }
      const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
      const t = (now - t0) / 1000;

      // which bar is lit: hover wins; otherwise auto-cycle (only bars whose card lands on the map side)
      if (hover >= 0) { active = hover; cycleAt = now + 3400; }
      else if (now - lastHover > 3500 && now > cycleAt) {
        let next = active, tries = 0;
        do { next = (next + 1) % bars.length; tries++; } while (!bars[next].userData.eligible && tries < bars.length);
        active = next; cycleAt = now + 3400;
      }

      if (orbit) {
        const a = t * 0.07;
        camera.position.set(target.x + Math.sin(a) * 34, 19 + Math.sin(t * 0.11) * 1.5, target.z + Math.cos(a) * 34);
        camera.lookAt(target);
      } else {
        smooth.x += (mouse.x - smooth.x) * 0.04; smooth.y += (mouse.y - smooth.y) * 0.04;
        cam.yaw += (cam.yawT - cam.yaw) * 0.08;
        placeCamera(smooth.x * 0.06 + Math.sin(t * 0.09) * 0.02, -smooth.y * 0.03);
      }
      // cars
      for (let i = 0; i < NC; i++) {
        const c = cars[i]; c.pos += c.dir * c.speed * dt;
        if (c.axisX) { if (c.pos > X1) c.pos = X0; if (c.pos < X0) c.pos = X1; carPos[i * 3] = c.pos; carPos[i * 3 + 1] = 0.14; carPos[i * 3 + 2] = c.lane; }
        else { if (c.pos > Z1) c.pos = Z0; if (c.pos < Z0) c.pos = Z1; carPos[i * 3] = c.lane; carPos[i * 3 + 1] = 0.14; carPos[i * 3 + 2] = c.pos; }
      }
      carGeo.attributes.position.needsUpdate = true;
      // bars
      const w = canvas.clientWidth, h = canvas.clientHeight;
      bars.forEach((b, i) => {
        const u = b.userData;
        u.target = orbit ? 0.55 : (i === active ? 1 : 0);
        u.glow += (u.target - u.glow) * 0.08;
        if (Math.random() < 0.08) u.flick = 0.82 + Math.random() * 0.25;       // TV flicker
        const tvMix = 0.25 + 0.75 * u.glow;
        tmp.copy(tvBase).lerp(tvHot, tvMix).multiplyScalar(u.flick); u.tvMat.color.copy(tmp);
        u.spillMat.opacity = (0.08 + 0.3 * u.glow) * u.flick;
        u.signMat.color.copy(signDim).lerp(signHot, u.glow);
        // the app pin: grows 42/36 on highlight (like map-icons.ts), hovers a touch, always faces the camera
        const ps = 1 + (42 / 36 - 1) * u.glow; u.pin.scale.set(ps, ps, ps);
        const bob = Math.sin(t * 1.4 + u.phase) * 0.1 + 0.12;
        u.pin.position.y = 3.1 + bob;
        WP.setFromMatrixPosition(u.pin.matrixWorld);
        u.pin.rotation.y = Math.atan2(camera.position.x - WP.x, camera.position.z - WP.z) - b.rotation.y;
        u.ring.position.y = -bob + 0.02; const rs = (0.75 - bob * 0.6) * ps; u.ring.scale.set(rs, rs * 0.55, 1); u.ring.material.opacity = 0.3 - bob * 0.4;
        u.head.material.emissiveIntensity = 0.25 + 0.4 * u.glow;
        // card anchored above pin head — only when it lands on the map side, clear of copy and header
        V.set(0, 2.6, 0); u.pin.localToWorld(V); V.project(camera);
        const x = (V.x * 0.5 + 0.5) * w, y = (-V.y * 0.5 + 0.5) * h;
        u.eligible = orbit || (x > w * 0.5 && x < w - 30 && y > 165 && y < h - 110 && V.z < 1);
        const el = cards[i];
        if (el) {
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          el.style.opacity = (!orbit && i === active && u.glow > 0.5 && (u.eligible || hover === i) && V.z < 1) ? '1' : '0';
        }
      });
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);

    return {
      setIntensity() {},
      pause() { paused = true; }, resume() { paused = false; },
      dispose() { running = false; ro.disconnect(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerleave', onLeave); disposeAll(scene, renderer); }
    };
  }

  /* ---------- TELÃO (parede de TVs) ---------- */
  function telao(canvas) {
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(INK, 18, 60);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, -1.2, 22);
    const wall = new THREE.Group(); scene.add(wall);
    const rnd = seeded(3);
    const COLS = 11, ROWS = 6, W = 4.2, H = 2.36, GAP = 0.32, R = 30;
    const palette = [0x1c1c18, 0x1c1c18, 0x1c1c18, 0x24241f, ACID, LIVE, PAPER];
    const screens = [];
    const frameMat = new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.22 });
    const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const dark = rnd() < 0.78;
      const col = dark ? palette[Math.floor(rnd() * 4)] : palette[4 + Math.floor(rnd() * 3)];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: col }));
      const ang = ((c - (COLS - 1) / 2) * (W + GAP)) / R;
      m.position.set(Math.sin(ang) * R, (r - (ROWS - 1) / 2) * (H + GAP), R - Math.cos(ang) * R);
      m.rotation.y = -ang;
      m.add(new THREE.LineSegments(edges, frameMat));
      m.userData = { from: new THREE.Color(col), to: new THREE.Color(col), t: 1 };
      wall.add(m); screens.push(m);
    }
    wall.position.z = -R + 6;
    const mouse = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }; let running = true, last = 0, t0 = performance.now();
    function onMove(e) { const b = canvas.getBoundingClientRect(); mouse.x = ((e.clientX - b.left) / b.width - .5) * 2; mouse.y = ((e.clientY - b.top) / b.height - .5) * 2; }
    window.addEventListener('pointermove', onMove, { passive: true });
    const ro = new ResizeObserver(() => fit(renderer, camera, canvas)); ro.observe(canvas); fit(renderer, camera, canvas);
    function frame(now) {
      if (!running) return;
      const t = (now - t0) / 1000;
      smooth.x += (mouse.x - smooth.x) * 0.05; smooth.y += (mouse.y - smooth.y) * 0.05;
      wall.rotation.y = smooth.x * 0.08 + Math.sin(t * 0.1) * 0.02; wall.rotation.x = -smooth.y * 0.04;
      if (now - last > 420) {
        last = now;
        const m = screens[Math.floor(Math.random() * screens.length)];
        const lit = Math.random() < 0.35;
        const col = lit ? palette[4 + Math.floor(Math.random() * 3)] : palette[Math.floor(Math.random() * 4)];
        m.userData.from.copy(m.material.color); m.userData.to.set(col); m.userData.t = 0;
      }
      for (const m of screens) { const u = m.userData; if (u.t < 1) { u.t = Math.min(1, u.t + 0.06); m.material.color.copy(u.from).lerp(u.to, u.t); } }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { setIntensity() {}, pause() {}, resume() {}, dispose() { running = false; ro.disconnect(); window.removeEventListener('pointermove', onMove); disposeAll(scene, renderer); } };
  }

  /* ---------- BOTECO (um bar em destaque, girando devagar) ---------- */
  function marca(canvas) {
    const renderer = makeRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 7.5, 21); camera.lookAt(0, 2.2, 0);
    scene.add(new THREE.AmbientLight(0x6b6a62, 0.5));
    scene.add(new THREE.HemisphereLight(0x9a968a, 0x0a0a08, 0.75));
    const key = new THREE.DirectionalLight(0xf1eee6, 0.9); key.position.set(-10, 16, 12); scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9f135, 0.25); rim.position.set(10, 6, -10); scene.add(rim);

    const rnd = seeded(9);
    const g = new THREE.Group(); scene.add(g);
    const bar = makeBar({ index: 0, name: 'O jogo é aqui', x: 0, z: 0, live: true }, rnd);
    bar.position.set(0, 0, -0.9);
    g.add(bar);
    const u = bar.userData;
    // street slab under the bar
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9.5, 64), new THREE.MeshLambertMaterial({ color: 0x1c1c18 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; g.add(ground);
    const kerb = new THREE.Mesh(new THREE.RingGeometry(9.3, 9.5, 64), new THREE.MeshBasicMaterial({ color: 0xf1eee6, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    kerb.rotation.x = -Math.PI / 2; kerb.position.y = 0.01; g.add(kerb);

    const mouse = { x: 0, y: 0 }, smooth = { x: 0, y: 0 }, WP = new THREE.Vector3();
    let progress = 0, running = true, paused = false, t0 = performance.now();
    const tvBase = new THREE.Color(0x4d6390), tvHot = new THREE.Color(0xdbe7ff), tmp = new THREE.Color();
    function onMove(e) { mouse.x = (e.clientX / window.innerWidth - .5) * 2; mouse.y = (e.clientY / window.innerHeight - .5) * 2; }
    window.addEventListener('pointermove', onMove, { passive: true });
    const ro = new ResizeObserver(() => fit(renderer, camera, canvas)); ro.observe(canvas); fit(renderer, camera, canvas);

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (paused) return;
      const t = (now - t0) / 1000;
      smooth.x += (mouse.x - smooth.x) * 0.05; smooth.y += (mouse.y - smooth.y) * 0.05;
      // turntable: slow idle spin + scroll-driven turn + pointer nudge
      g.rotation.y = -0.55 + t * 0.12 + progress * Math.PI * 0.6 + smooth.x * 0.25;
      g.rotation.x = smooth.y * 0.05;
      // the bar is always "on": TV flicker, warm sign, floating marker
      if (Math.random() < 0.08) u.flick = 0.85 + Math.random() * 0.22;
      tmp.copy(tvBase).lerp(tvHot, 0.9).multiplyScalar(u.flick); u.tvMat.color.copy(tmp);
      u.spillMat.opacity = 0.3 * u.flick;
      u.signMat.color.setScalar(1);
      const bob = Math.sin(t * 1.4) * 0.1 + 0.12;
      u.pin.position.y = 3.1 + bob; u.pin.scale.setScalar(42 / 36);
      WP.setFromMatrixPosition(u.pin.matrixWorld);
      u.pin.rotation.y = Math.atan2(camera.position.x - WP.x, camera.position.z - WP.z) - g.rotation.y;
      u.ring.position.y = -bob + 0.02; const rs = 0.9 - bob * 0.6; u.ring.scale.set(rs, rs * 0.55, 1); u.ring.material.opacity = 0.3 - bob * 0.4;
      u.head.material.emissiveIntensity = 0.6;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    return {
      setProgress(p) { progress = Math.max(0, Math.min(1, p)); },
      setIntensity() {}, pause() { paused = true; }, resume() { paused = false; },
      dispose() { running = false; ro.disconnect(); window.removeEventListener('pointermove', onMove); disposeAll(scene, renderer); }
    };
  }

  window.OnsideScenes = { mapa, telao, marca };

})();
