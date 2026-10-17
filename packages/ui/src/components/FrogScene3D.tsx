import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  CapsuleGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  BoxGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FrogPose } from './FrogScene';

/** Reads the theme's CSS variables so the 3D frog recolours with the theme, like the SVG one. */
function themeColors(el: Element) {
  const cs = getComputedStyle(el);
  const get = (name: string, fallback: string) => new Color(cs.getPropertyValue(name).trim() || fallback);
  return {
    frog: get('--frog', '#c3e88d'),
    belly: get('--belly', '#f4f8be'),
    cheek: get('--cheek', '#f8b6cc'),
    pad: get('--pad', '#a8d890'),
    glow: get('--glow', '#fff2c2'),
    ink: get('--foreground', '#34405e'),
    petal: get('--petal', '#f8b6cc'),
    tertiary: get('--tertiary', '#c3d3f2'),
  };
}

const CONFETTI = 36;
const REACT_SECONDS = 1.9;

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** One continuous chubby body: a rounded-box blob with welded vertices, so shading has no creases. */
function bodyGeometry(): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(1, 5);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position');
  const n = 2.7; // super-ellipsoid exponent: 2 is a sphere, higher is boxier
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (Math.abs(x) ** n + Math.abs(y) ** n + Math.abs(z) ** n) ** (1 / n);
    pos.setXYZ(i, (x / k) * 1.28, (y / k) * 1.15 + 1.15, (z / k) * 1.12);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new Float32BufferAttribute(new Float32Array(pos.count * 3), 3));
  return g;
}

/** Belly and cheeks are painted as soft vertex colours instead of separate meshes, so there are no seams. */
function paintBody(g: BufferGeometry, frog: Color, belly: Color, cheek: Color) {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = (x / 0.66) ** 2 + ((y - 0.72) / 0.62) ** 2;
    const wBelly = smooth(1, 0.7, u) * smooth(0.3, 0.7, z);
    const dc = Math.min((Math.abs(x) - 0.82) ** 2 / 0.26 ** 2 + (y - 1.18) ** 2 / 0.17 ** 2, 9);
    const wCheek = smooth(1, 0.2, dc) * smooth(0.2, 0.6, z) * 0.85;
    c.copy(frog).lerp(belly, wBelly).lerp(cheek, wCheek);
    c.multiplyScalar(0.84 + 0.16 * smooth(0, 1.1, y)); // gently darker toward the pad
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
const damp = (cur: number, target: number, dt: number, rate = 9) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * Lilypad's 3D mascot: the same frog as FrogScene, built from primitives (no model file) and drawn with
 * three.js. Colours come from the theme variables, motion from `pose`. Throws if WebGL is unavailable,
 * so callers should mount it behind an error/feature check and fall back to the SVG frog.
 */
export default function FrogScene3D({ className, world, pose }: { className?: string; world: 'dusk' | 'meadow'; pose: FrogPose }) {
  const host = useRef<HTMLDivElement>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    // Always render at 2x or better and let the browser scale down: supersampling keeps edges smooth on 1x screens too.
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 2), 3));
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 424 / 354, 0.1, 50);
    camera.position.set(0, 4.2, 10.5);
    camera.lookAt(0, 1.25, 0);
    scene.add(new HemisphereLight('#ffffff', '#b9c4d8', 1.25), new AmbientLight('#ffffff', 0.35));
    const sun = new DirectionalLight('#ffffff', 1.6);
    sun.position.set(-3, 6, 5);
    scene.add(sun);

    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const geo = <T extends BufferGeometry>(g: T) => (geometries.push(g), g);
    const lit = (color: Color, roughness = 0.75) => {
      const m = new MeshStandardMaterial({ color, roughness, metalness: 0 });
      materials.push(m);
      return m;
    };
    const flat = (color: Color) => {
      const m = new MeshBasicMaterial({ color });
      materials.push(m);
      return m;
    };
    const unit = geo(new SphereGeometry(1, 36, 24));
    const blob = (parent: Object3D, material: Material, pos: [number, number, number], scale: [number, number, number]) => {
      const m = new Mesh(unit, material);
      m.position.set(...pos);
      m.scale.set(...scale);
      parent.add(m);
      return m;
    };

    const c = themeColors(el);
    const frogMat = lit(new Color('#ffffff'), 0.85);
    frogMat.vertexColors = true;
    const limbMat = lit(c.frog.clone().multiplyScalar(0.93), 0.85);
    const bodyGeo = geo(bodyGeometry());
    paintBody(bodyGeo, c.frog, c.belly, c.cheek);
    const padMat = lit(c.pad, 0.9);
    const inkMat = flat(c.ink);
    const petalMat = lit(c.petal, 0.9);
    const glowMat = flat(c.glow);
    const dropMat = lit(c.tertiary, 0.4);
    const shadowMat = new MeshBasicMaterial({ color: c.ink, transparent: true, opacity: 0.16, depthWrite: false });
    materials.push(shadowMat);
    const whiteMat = flat(new Color('#ffffff'));

    // Scenery: a lily pad, a shadow, two flowers and the sky body.
    const pad = new Mesh(geo(new CylinderGeometry(3.1, 3.1, 0.22, 48)), padMat);
    pad.position.y = -0.11;
    scene.add(pad);
    const shadow = new Mesh(geo(new CircleGeometry(1.35, 40)), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.15, 0.8, 1);
    shadow.position.set(0.35, 0.02, 0.1);
    scene.add(shadow);
    const flower = (x: number, z: number, s: number) => {
      const g = new Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        blob(g, petalMat, [Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], [0.22, 0.12, 0.22]);
      }
      blob(g, lit(new Color('#fff6dc')), [0, 0.12, 0], [0.14, 0.1, 0.14]);
      g.position.set(x, 0.05, z);
      g.scale.setScalar(s);
      scene.add(g);
    };
    flower(-2.25, 1.15, 1.25);
    flower(2.3, 1.35, 1);
    const sky = new Mesh(geo(new CircleGeometry(0.75, 36)), glowMat);
    sky.position.set(3.1, 4.7, -2);
    scene.add(sky);
    void world; // dusk and meadow differ only by theme colours, which already drive every material here

    // The frog.
    const root = new Group();
    scene.add(root);
    const body = new Group();
    root.add(body);
    body.add(new Mesh(bodyGeo, frogMat));
    blob(body, whiteMat, [-0.45, 1.85, 0.45], [0.36, 0.14, 0.2]).material = (() => {
      const m = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false });
      materials.push(m);
      return m;
    })();
    for (const x of [-0.58, 0.58]) blob(root, limbMat, [x, 0.15, 0.6], [0.38, 0.19, 0.44]);
    const arms = [-1, 1].map((side) => {
      const pivot = new Group();
      pivot.position.set(side * 1.12, 1.02, 0.12);
      blob(pivot, limbMat, [side * 0.1, -0.34, 0], [0.22, 0.44, 0.24]); // mostly tucked into the body

      body.add(pivot);
      return pivot;
    });
    const eyes = new Group();
    body.add(eyes);
    const eyeParts = [-1, 1].map((side) => {
      const e = new Group();
      e.position.set(side * 0.5, 1.5, 1.02);
      blob(e, inkMat, [0, 0, 0], [0.15, 0.17, 0.08]);
      blob(e, whiteMat, [0.04, 0.06, 0.07], [0.045, 0.045, 0.03]);
      eyes.add(e);
      return e;
    });
    const happyEyes = new Group();
    for (const side of [-1, 1]) {
      const arc = new Mesh(geo(new TorusGeometry(0.17, 0.035, 8, 20, Math.PI)), inkMat);
      arc.position.set(side * 0.5, 1.46, 1.04);
      happyEyes.add(arc);
    }
    happyEyes.visible = false;
    body.add(happyEyes);
    const mouth = new Mesh(geo(new CapsuleGeometry(0.025, 0.2, 4, 8)), inkMat);
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(0, 1.2, 1.1);
    body.add(mouth);
    const smile = new Mesh(geo(new TorusGeometry(0.2, 0.04, 8, 20, Math.PI)), inkMat);
    smile.rotation.z = Math.PI;
    smile.position.set(0, 1.28, 1.08);
    smile.visible = false;
    body.add(smile);
    const drop = blob(body, dropMat, [1.0, 2.0, 0.85], [0.1, 0.15, 0.1]);
    drop.visible = false;

    // Confetti for the `done` pose.
    const confettiMesh = new InstancedMesh(geo(new BoxGeometry(0.16, 0.1, 0.02)), lit(new Color('#ffffff'), 0.6), CONFETTI);
    const palette = ['#f6a5be', '#7cc4ff', '#ffd36e', '#b69cff', '#8fe0a8', '#ff9d7a'].map((h) => new Color(h));
    const seeds = Array.from({ length: CONFETTI }, (_, i) => ({
      x: ((i * 0.6180339) % 1) * 6 - 3,
      z: ((i * 0.3819660) % 1) * 2 - 0.4,
      delay: ((i * 0.7548776) % 1) * 2.2,
      spin: 2 + ((i * 0.5698402) % 1) * 5,
    }));
    seeds.forEach((_, i) => confettiMesh.setColorAt(i, palette[i % palette.length]!));
    confettiMesh.visible = false;
    scene.add(confettiMesh);
    const dummy = new Object3D();

    // Pose state, eased every frame.
    const s = { arm: 0, lookX: 0, squash: 1, tilt: 0 };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w && h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const recolor = () => {
      const n = themeColors(el);
      limbMat.color.copy(n.frog).multiplyScalar(0.93);
      paintBody(bodyGeo, n.frog, n.belly, n.cheek);
      padMat.color.copy(n.pad);
      inkMat.color.copy(n.ink);
      shadowMat.color.copy(n.ink);
      petalMat.color.copy(n.petal);
      glowMat.color.copy(n.glow);
      dropMat.color.copy(n.tertiary);
    };
    const mo = new MutationObserver(recolor);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Interaction: the frog watches the pointer, spins when dragged (springing back on release) and hops with
    // confetti when clicked.
    const gaze = { x: 0, y: 0 };
    const smoothGaze = { x: 0, y: 0 };
    const drag = { active: false, id: -1, lastX: 0, moved: 0 };
    let spinY = 0;
    let react = -1; // seconds (scene time) when the click reaction started, -1 when idle
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const t0 = performance.now();
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      gaze.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 420));
      gaze.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.4)) / 300));
      if (drag.active && e.pointerId === drag.id) {
        spinY += (e.clientX - drag.lastX) * 0.012;
        drag.moved += Math.abs(e.clientX - drag.lastX);
        drag.lastX = e.clientX;
      }
    };
    const onDown = (e: PointerEvent) => {
      Object.assign(drag, { active: true, id: e.pointerId, lastX: e.clientX, moved: 0 });
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      el.style.cursor = 'grab';
      if (drag.moved >= 6) return; // it was a drag, not a click
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.intersectObject(root, true).length > 0) react = (performance.now() - t0) / 1000;
    };
    if (!reduced) {
      el.style.cursor = 'grab';
      el.style.touchAction = 'pan-y';
      window.addEventListener('pointermove', onMove);
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }

    let raf = 0;
    let last = t0;
    let acc = 0;
    let blinkAt = 3;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (document.hidden) return;
      acc += dt;
      if (acc < 1 / 30 && !reduced) return; // 30 fps cap keeps the idle cost low
      const step = acc;
      acc = 0;
      const t = reduced ? 0 : (now - t0) / 1000;
      const base = poseRef.current;
      const rt = react >= 0 ? t - react : -1;
      if (rt >= REACT_SECONDS) react = -1;
      const reacting = rt >= 0 && rt < REACT_SECONDS;
      const p: FrogPose = reacting ? 'done' : base; // a click makes the frog cheer, whatever it was doing
      const happy = p === 'done';
      const worried = p === 'error';

      let y = 0;
      let sq = 1;
      if (p === 'idle') {
        y = Math.sin(t * 1.4) * 0.06;
        sq = 1 + Math.sin(t * 1.4) * 0.012;
      } else if (p === 'curious') {
        y = Math.sin(t * 1.1) * 0.03;
      } else if (p === 'working') {
        y = Math.abs(Math.sin(t * 5)) * 0.08;
        sq = 1 + Math.sin(t * 10) * 0.015;
      } else if (happy) {
        const hop = Math.abs(Math.sin((base === 'done' ? t : rt) * 3.4));
        y = hop * 0.95;
        sq = 1 + (0.5 - hop) * 0.09;
      } else if (worried) {
        sq = 0.94;
      }
      s.squash = damp(s.squash, sq, step);
      s.arm = damp(s.arm, happy ? 2.5 : worried ? 0.1 : p === 'working' ? Math.sin(t * 10) * 0.18 : 0, step);
      s.lookX = damp(s.lookX, p === 'working' ? 0.05 : p === 'curious' ? -0.06 : 0, step);
      s.tilt = damp(s.tilt, p === 'curious' ? Math.sin(t * 1.1) * 0.05 : worried ? Math.sin(t * 30) * 0.004 : 0, step);

      smoothGaze.x = damp(smoothGaze.x, gaze.x, step, 8);
      smoothGaze.y = damp(smoothGaze.y, gaze.y, step, 8);
      if (!drag.active) {
        spinY -= Math.round(spinY / (Math.PI * 2)) * Math.PI * 2;
        spinY = damp(spinY, 0, step, 3);
      }
      root.position.y = y;
      root.rotation.y = spinY + smoothGaze.x * 0.35;
      body.scale.set(1 / Math.sqrt(s.squash), s.squash, 1 / Math.sqrt(s.squash));
      root.rotation.z = s.tilt;
      arms[0]!.rotation.z = -s.arm * 0.7;
      arms[1]!.rotation.z = s.arm * 0.7;
      eyeParts.forEach((e) => {
        e.position.x += (Math.sign(e.position.x) * 0.5 + s.lookX + smoothGaze.x * 0.1 - e.position.x) * 0.5;
        e.position.y = 1.5 - smoothGaze.y * 0.06;
      });
      const blink = t > blinkAt && t < blinkAt + 0.12 ? 0.1 : 1;
      if (t > blinkAt + 0.12) blinkAt = t + 3 + Math.random() * 3;
      eyeParts.forEach((e) => (e.scale.y = blink)); // scale each eye about its own centre, not the group origin (which would drag them down to the feet)
      eyes.visible = !happy;
      happyEyes.visible = happy;
      smile.visible = happy;
      mouth.visible = !happy;
      mouth.rotation.z = worried ? Math.PI / 2 + 0.25 : Math.PI / 2;
      drop.visible = worried;
      if (worried) drop.position.y = 2.0 + Math.sin(t * 2.5) * 0.06;
      shadow.scale.set(1.15 - y * 0.2, 0.8 - y * 0.15, 1);
      shadowMat.opacity = 0.16 - y * 0.05;

      confettiMesh.visible = happy;
      if (happy) {
        seeds.forEach((sd, i) => {
          if (base === 'done') {
            const k = ((t - sd.delay) % 2.6 + 2.6) % 2.6;
            dummy.position.set(sd.x, 5.2 - k * 2.2, sd.z);
            dummy.rotation.set(k * sd.spin, k * sd.spin * 0.7, k * sd.spin * 0.4);
            dummy.scale.setScalar(1);
          } else {
            // One burst from the frog's head that arcs up and falls back to the pad.
            const k = rt - sd.delay * 0.2;
            dummy.position.set(sd.x * 0.66 * Math.max(k, 0), 2.4 + 4 * k - 3.3 * k * k, sd.z * 0.6 + 0.4);
            dummy.rotation.set(k * sd.spin, k * sd.spin * 0.7, k * sd.spin * 0.4);
            dummy.scale.setScalar(k < 0 || 2.4 + 4 * k - 3.3 * k * k < 0 ? 0 : 1);
          }
          dummy.updateMatrix();
          confettiMesh.setMatrixAt(i, dummy.matrix);
        });
        confettiMesh.instanceMatrix.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      ro.disconnect();
      mo.disconnect();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      confettiMesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [world]);

  return <div ref={host} className={className} aria-hidden="true" data-pose={pose} style={{ aspectRatio: '424 / 354' }} />;
}
