// The 3D close-up: the character at a press scrum, mics in front, step-and-repeat behind.
// Characters come from a pack: one GLB per expression (generated), swapped behind a camera
// flash. If no GLB loads, a hand-built caricature bust with moving brows and mouth stands in.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const FACES = ["neutral", "smug", "nervous", "shocked", "angry", "sad", "triumphant"];

const REACTION = {
  neutral: "nod",
  smug: "tilt",
  nervous: "tremble",
  shocked: "recoil",
  angry: "shake",
  sad: "droop",
  triumphant: "bounce",
};

export class Stage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#d9d1bf");
    // soft studio reflections so PBR materials from generated models don't go black
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
    this.camera.position.set(0, 1.55, 3.4);
    this.lookTarget = new THREE.Vector3(0, 1.38, 0);
    this.camBase = this.camera.position.clone();

    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2();
    this.anim = null;
    this.face = "neutral";
    this.models = {};
    this.usingFallback = false;

    this._lights();
    this._backdrop();
    this._mics();

    this.rig = new THREE.Group(); // reaction motion
    this.scene.add(this.rig);

    window.addEventListener("pointermove", (e) => {
      const r = container.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    });
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _lights() {
    const hemi = new THREE.HemisphereLight("#fff6e8", "#2a2420", 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight("#fff1dc", 2.4);
    key.position.set(1.6, 2.6, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.5;
    key.shadow.camera.right = 1.5;
    key.shadow.camera.top = 1.5;
    key.shadow.camera.bottom = -1.5;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#9fc4ff", 1.6);
    rim.position.set(-2, 2.2, -1.5);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight("#ffd9b0", 0.5);
    fill.position.set(-1.8, 1.2, 2);
    this.scene.add(fill);
    // camera-flash light, spiked on reactions
    this.flashLight = new THREE.PointLight("#ffffff", 0, 8, 1.5);
    this.flashLight.position.set(0.6, 1.6, 2.2);
    this.scene.add(this.flashLight);
  }

  _backdrop() {
    // Step-and-repeat wall: cream board with small ink logos on an even, staggered grid.
    // Drawn on a canvas once the web fonts are ready, and measured so marks never overlap.
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 1024;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const g = c.getContext("2d");
      g.fillStyle = "#ece5d4";
      g.fillRect(0, 0, c.width, c.height);
      const cellW = 300;
      const cellH = 120;
      const mark = (x, y) => {
        g.font = "800 26px Unbounded, Geist, system-ui, sans-serif";
        const w1 = g.measureText("PRESS").width;
        const w2 = g.measureText("CYCLE").width;
        const dot = 10;
        const gap = 8;
        let total = w1 + gap + dot * 2 + gap + w2;
        const k = Math.min(1, (cellW - 70) / total);
        g.save();
        g.translate(x, y);
        g.scale(k, k);
        total *= 1;
        let cx = -total / 2;
        g.textBaseline = "middle";
        g.textAlign = "left";
        g.globalAlpha = 0.5;
        g.fillStyle = "#1b1a18";
        g.fillText("PRESS", cx, 0);
        cx += w1 + gap + dot;
        g.fillStyle = "#e8352b";
        g.beginPath();
        g.arc(cx, 1, dot, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffc93c";
        g.beginPath();
        g.arc(cx, 1, dot, -Math.PI / 2, 0);
        g.lineTo(cx, 1);
        g.fill();
        cx += dot + gap;
        g.fillStyle = "#1b1a18";
        g.fillText("CYCLE", cx, 0);
        g.font = "600 13px 'Geist Mono', ui-monospace, monospace";
        g.textAlign = "center";
        g.fillStyle = "rgba(27,26,24,0.45)";
        g.font = "600 11px 'Geist Mono', ui-monospace, monospace";
        g.fillText("P A R O D Y   N E W S", 0, 28);
        g.restore();
      };
      for (let row = -1; row < c.height / cellH + 1; row++) {
        for (let col = -1; col < c.width / cellW + 1; col++) {
          mark(col * cellW + (row % 2 ? cellW / 2 : 0) + cellW / 2, row * cellH + cellH / 2);
        }
      }
      // soft pool of light behind the head, falling off to the edges
      const v = g.createRadialGradient(c.width / 2, c.height * 0.45, 60, c.width / 2, c.height * 0.45, c.width * 0.62);
      v.addColorStop(0, "rgba(255,248,232,0.35)");
      v.addColorStop(1, "rgba(60,50,40,0.28)");
      g.fillStyle = v;
      g.fillRect(0, 0, c.width, c.height);
      tex.needsUpdate = true;
    };
    draw();
    document.fonts?.ready.then(draw);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4.5),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    wall.position.set(0, 1.6, -2.4);
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.wall = wall;
  }

  _mics() {
    const brands = [
      ["THE WIRE", "#e8352b", "#fff"],
      ["TICKR", "#ffc93c", "#111"],
      ["NEWS9", "#f2eee3", "#111"],
      ["GLOBAL", "#2f6fed", "#fff"],
      ["POD", "#111", "#ffc93c"],
    ];
    this.mics = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: "#2a2a2a", metalness: 0.7, roughness: 0.35 });
    const foam = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 1 });
    brands.forEach(([label, bg, fg], i) => {
      const m = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.55, 16), metal);
      handle.position.y = -0.28;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), foam);
      head.scale.set(1, 1.25, 1);
      head.position.y = 0.04;
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 128);
      g.fillStyle = fg;
      g.font = "800 44px Unbounded, Geist, system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 128, 66, 236);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const flagMats = [
        new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
      ];
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.1), flagMats);
      flag.position.y = -0.1;
      m.add(handle, head, flag);
      const spread = i - (brands.length - 1) / 2;
      m.position.set(spread * 0.17, 1.02 + Math.abs(spread) * -0.035, 0.95 - Math.abs(spread) * 0.06);
      m.rotation.set(-0.35, spread * -0.18, spread * -0.12);
      m.traverse((o) => o.isMesh && (o.castShadow = true));
      this.mics.add(m);
    });
    this.scene.add(this.mics);
  }

  // ---- characters ----------------------------------------------------------

  async loadCharacter(character, onFirst = () => {}) {
    const urls = character?.models || {};
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const load = (url) =>
      new Promise((resolve) => {
        if (!url) return resolve(null);
        loader.load(url, (g) => resolve(g.scene), undefined, () => resolve(null));
      });

    // Neutral first so the stage is never empty for long.
    const forceFallback = new URLSearchParams(location.search).has("fallback");
    const neutral = forceFallback ? null : await load(urls.neutral);
    if (!neutral) {
      this._buildFallback(character?.fallback || {});
      this.usingFallback = true;
      onFirst();
      return { fallback: true };
    }
    this.rotY = THREE.MathUtils.degToRad(Number(new URLSearchParams(location.search).get("rot")) || character.rotationY || 0);
    const frame = this._fit(neutral, null, character.scale || 1);
    this.models.neutral = neutral;
    this.rig.add(neutral);
    this.setFace("neutral", { flash: false });
    onFirst();

    // The rest stream in; any that fail just reuse neutral with a reaction.
    await Promise.all(
      FACES.filter((f) => f !== "neutral").map(async (f) => {
        const m = await load(urls[f]);
        if (!m) return;
        this._fit(m, frame, character.scale || 1);
        m.visible = false;
        this.models[f] = m;
        this.rig.add(m);
      }),
    );
    return { fallback: false, loaded: Object.keys(this.models) };
  }

  // Scale + centre a generated bust so its head sits in the same place as the others.
  _fit(obj, frame, scale) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.side = THREE.FrontSide;
          // Caricatures read as painted clay: no metal, never glossy.
          if ("metalness" in o.material) o.material.metalness = 0;
          if ("roughness" in o.material) o.material.roughness = Math.max(o.material.roughness ?? 0.6, 0.55);
        }
      }
    });
    obj.rotation.y = this.rotY || 0;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = frame ? frame.s : (1.15 / Math.max(size.y, 1e-3)) * scale;
    obj.scale.setScalar(s);
    // bottom of the bust at y=0.82 (just under the mics), centred on x/z
    obj.position.set(-center.x * s, 0.82 - box.min.y * s, -center.z * s);
    return frame || { s };
  }

  _buildFallback(p) {
    const skin = new THREE.MeshStandardMaterial({ color: p.skin || "#e9b98f", roughness: 0.62 });
    const hairM = new THREE.MeshStandardMaterial({ color: p.hair || "#cfd2d6", roughness: 0.55 });
    const jacketM = new THREE.MeshStandardMaterial({ color: p.jacket || "#17181a", roughness: 0.32, metalness: 0.1 });
    const shirtM = new THREE.MeshStandardMaterial({ color: p.shirt || "#0d0d0e", roughness: 0.9 });
    const ink = new THREE.MeshStandardMaterial({ color: p.glasses || "#0b0b0b", roughness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: "#fbfaf7", roughness: 0.3 });
    const mouthM = new THREE.MeshStandardMaterial({ color: "#5a1d1a", roughness: 0.7 });
    const waterM = new THREE.MeshStandardMaterial({ color: "#bfe3ff", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85 });

    const bust = new THREE.Group();
    // shoulders + jacket
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), jacketM);
    torso.scale.set(1.15, 0.62, 0.62);
    torso.position.y = 0.86;
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.28, 24), shirtM);
    shirt.position.set(0, 1.08, 0.02);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.04), jacketM);
      lapel.position.set(side * 0.12, 1.0, 0.33);
      lapel.rotation.set(-0.5, 0, side * -0.45);
      bust.add(lapel);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 20), skin);
    neck.position.y = 1.2;

    const head = new THREE.Group();
    head.position.y = 1.62;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 48, 32), skin);
    skull.scale.set(1, 1.08, 0.95);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 24), skin);
    jaw.scale.set(1.08, 0.75, 0.9);
    jaw.position.set(0, -0.17, 0.04);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), skin);
    nose.scale.set(1, 0.9, 1.15);
    nose.position.set(0, -0.03, 0.34);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), skin);
      ear.scale.set(0.5, 1, 0.7);
      ear.position.set(side * 0.36, -0.02, 0);
      head.add(ear);
    }
    // swept silver hair: big pompadour slabs
    const hair = new THREE.Group();
    const slabs = [
      [0, 0.24, -0.02, 0.37, 0.18, 0.4, -0.25],
      [0, 0.3, 0.1, 0.3, 0.13, 0.28, -0.6],
      [-0.2, 0.18, -0.05, 0.2, 0.15, 0.36, -0.2],
      [0.2, 0.18, -0.05, 0.2, 0.15, 0.36, -0.2],
      [0, 0.1, -0.22, 0.34, 0.24, 0.24, 0.1],
    ];
    for (const [x, y, z, sx, sy, sz, rx] of slabs) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), hairM);
      h.scale.set(sx, sy, sz);
      h.position.set(x, y, z);
      h.rotation.x = rx;
      hair.add(h);
    }
    // glasses
    const glasses = new THREE.Group();
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 10, 4), ink);
      rim.rotation.z = Math.PI / 4;
      rim.scale.set(1.25, 0.85, 1);
      rim.position.set(side * 0.13, 0.05, 0.31);
      glasses.add(rim);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), ink);
      arm.position.set(side * 0.33, 0.06, 0.15);
      glasses.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.014), ink);
    bridge.position.set(0, 0.07, 0.33);
    glasses.add(bridge);
    // eyes
    const eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), ink);
      pupil.position.z = 0.03;
      eye.add(ball, pupil);
      eye.position.set(side * 0.13, 0.05, 0.28);
      head.add(eye);
      eyes.push(eye);
    }
    // brows
    const brows = [-1, 1].map((side) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.026, 0.03), hairM);
      b.position.set(side * 0.13, 0.16, 0.3);
      head.add(b);
      return b;
    });
    // mouth: a torus arc we rotate/scale per expression, plus an "O"
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 10, 24, Math.PI), mouthM);
    smile.position.set(0, -0.15, 0.31);
    smile.rotation.z = Math.PI;
    const ooh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), mouthM);
    ooh.scale.set(0.8, 1.1, 0.4);
    ooh.position.set(0, -0.17, 0.3);
    ooh.visible = false;
    const sweat = new THREE.Group();
    for (const [x, y] of [
      [0.27, 0.22],
      [-0.3, 0.12],
    ]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), waterM);
      d.scale.set(0.7, 1.2, 0.7);
      d.position.set(x, y, 0.22);
      sweat.add(d);
    }
    sweat.visible = false;
    const tear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), waterM);
    tear.scale.set(0.8, 1.3, 0.8);
    tear.position.set(0.14, -0.04, 0.3);
    tear.visible = false;

    head.add(skull, jaw, nose, hair, glasses, smile, ooh, sweat, tear);
    bust.add(torso, shirt, neck, head);
    bust.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    this.rig.add(bust);
    this.fb = { bust, head, brows, smile, ooh, sweat, tear, eyes, skin, skinBase: skin.color.clone() };
    this._fallbackFace("neutral");
  }

  _fallbackFace(face) {
    const f = this.fb;
    if (!f) return;
    const [l, r] = f.brows;
    l.rotation.z = r.rotation.z = 0;
    l.position.y = r.position.y = 0.16;
    f.smile.visible = true;
    f.ooh.visible = false;
    f.sweat.visible = false;
    f.tear.visible = false;
    f.smile.rotation.z = Math.PI;
    f.smile.scale.set(1, 1, 1);
    f.smile.position.y = -0.15;
    f.skin.color.copy(f.skinBase);
    switch (face) {
      case "smug":
        l.position.y = 0.22;
        l.rotation.z = 0.2;
        r.rotation.z = 0.1;
        f.smile.scale.set(0.8, 0.45, 1);
        f.smile.rotation.z = Math.PI + 0.25;
        break;
      case "nervous":
        l.rotation.z = -0.35;
        r.rotation.z = 0.35;
        f.smile.scale.set(1.2, 0.25, 1);
        f.sweat.visible = true;
        break;
      case "shocked":
        l.position.y = r.position.y = 0.24;
        f.smile.visible = false;
        f.ooh.visible = true;
        break;
      case "angry":
        l.rotation.z = -0.45;
        r.rotation.z = 0.45;
        l.position.y = r.position.y = 0.14;
        f.smile.rotation.z = 0;
        f.smile.position.y = -0.2;
        f.smile.scale.set(0.9, 0.5, 1);
        f.skin.color.set("#e59a7c");
        break;
      case "sad":
        l.rotation.z = 0.35;
        r.rotation.z = -0.35;
        f.smile.rotation.z = 0;
        f.smile.position.y = -0.21;
        f.smile.scale.set(0.8, 0.6, 1);
        f.tear.visible = true;
        break;
      case "triumphant":
        l.position.y = r.position.y = 0.22;
        f.smile.scale.set(1.25, 1.2, 1);
        break;
    }
  }

  setFace(face, { flash = true } = {}) {
    if (!FACES.includes(face)) face = "neutral";
    this.face = face;
    if (flash) this.flash();
    if (this.usingFallback) {
      this._fallbackFace(face);
    } else {
      const show = this.models[face] || this.models.neutral;
      for (const m of Object.values(this.models)) m.visible = m === show;
    }
    this.anim = { type: flash ? REACTION[face] : null, t: 0 };
  }

  flash() {
    this.flashT = 0;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens: pull back a little so the head and shoulders still fit.
    const portrait = w / h < 0.9;
    this.camBase.set(0, portrait ? 1.48 : 1.5, portrait ? 4.6 : 4.1);
    this.camera.updateProjectionMatrix();
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    // idle: breathe, sway, follow the cursor a little
    const rig = this.rig;
    rig.position.set(0, Math.sin(t * 1.6) * 0.006, 0);
    rig.rotation.set(this.pointer.y * 0.05, this.pointer.x * 0.18 + Math.sin(t * 0.5) * 0.03, 0);
    rig.scale.setScalar(1);

    const a = this.anim;
    if (a && a.type) {
      a.t += dt;
      const k = Math.min(a.t / 1.1, 1);
      const env = Math.sin(k * Math.PI) * (1 - k * 0.3);
      switch (a.type) {
        case "nod":
          rig.rotation.x += Math.sin(a.t * 14) * 0.06 * env;
          break;
        case "tilt":
          rig.rotation.z = 0.12 * env;
          rig.rotation.y += 0.15 * env;
          break;
        case "tremble":
          rig.position.x = Math.sin(a.t * 70) * 0.012 * (1 - k);
          rig.rotation.z = Math.sin(a.t * 55) * 0.02 * (1 - k);
          break;
        case "recoil":
          rig.position.z = -0.22 * env;
          rig.rotation.x = -0.18 * env;
          rig.scale.setScalar(1 + 0.05 * env);
          break;
        case "shake":
          rig.rotation.y += Math.sin(a.t * 22) * 0.16 * env;
          rig.position.x = Math.sin(a.t * 40) * 0.01 * env;
          break;
        case "droop":
          rig.position.y = -0.06 * env;
          rig.rotation.x = 0.16 * env;
          break;
        case "bounce":
          rig.position.y = Math.abs(Math.sin(a.t * 9)) * 0.06 * (1 - k);
          rig.scale.set(1 + 0.03 * env, 1 - 0.02 * env, 1);
          break;
      }
      if (k >= 1) a.type = null;
    }

    // camera: slow push-in drift + recoil on flash
    const cam = this.camera;
    cam.position.lerp(
      new THREE.Vector3(this.camBase.x + Math.sin(t * 0.3) * 0.05, this.camBase.y + Math.sin(t * 0.21) * 0.02, this.camBase.z),
      0.05,
    );
    cam.lookAt(this.lookTarget);

    if (this.flashT !== undefined) {
      this.flashT += dt;
      this.flashLight.intensity = Math.max(0, 40 * (1 - this.flashT / 0.25));
      if (this.flashT > 0.3) this.flashT = undefined;
    }
    this.renderer.render(this.scene, cam);
  }
}
