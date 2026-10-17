import { useEffect, useRef } from 'react';
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from 'three';
import type { GargantuaState } from './Gargantua';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Per-pixel ray tracing of a Schwarzschild black hole (horizon radius 1). Each ray is bent by the standard
 * photon-geodesic acceleration -1.5 h^2 x / r^5; every crossing of the equatorial plane between the inner and
 * outer disk radii adds emission, so the lensed image of the far side of the disk arches over and under the
 * shadow and the photon ring appears by itself. The disk rotates differentially and is Doppler-beamed.
 */
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uSpinTime, uElev, uAz, uFlare, uShock, uDim;
uniform vec3 uDisk, uCore;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Turbulent gas that shears with radius (omega ~ r^-1.5).
float density(vec2 xz, float rr) {
  float om = uSpinTime * 1.4 / (rr * sqrt(rr));
  float c = cos(om), s = sin(om);
  vec2 q = mat2(c, -s, s, c) * xz;
  float n = vnoise(q * 1.6) * 0.55 + vnoise(q * 3.9) * 0.3 + vnoise(q * 9.0) * 0.15;
  float bands = 0.5 + 0.5 * sin(rr * 6.5 + n * 5.0);
  return 0.45 + 0.95 * (n * 0.65 + bands * 0.35);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;

  const float D = 26.0;
  vec3 ro = D * vec3(-sin(uAz) * cos(uElev), sin(uElev), -cos(uAz) * cos(uElev));
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 v = normalize(fwd + (uv.x * right + uv.y * up) * 0.27);

  const float RIN = 2.7;
  const float ROUT = 9.5;
  vec3 p = ro;
  vec3 col = vec3(0.0);
  float hit = 0.0;
  float escaped = 0.0;
  float minR = 1e9;
  float shockR = 2.7 + uShock * 9.5; // radius of the shockwave ring in the disk plane

  for (int i = 0; i < 260; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    minR = min(minR, r);
    if (r < 1.0) { hit = 1.0; break; }
    if (r > 36.0 && dot(p, v) > 0.0) { escaped = 1.0; break; }

    vec3 h = cross(p, v);
    float dt = clamp(0.06 * r, 0.05, 1.0);
    vec3 acc = -1.5 * dot(h, h) * p / (r2 * r2 * r);
    vec3 pn = p + v * dt;
    v = normalize(v + acc * dt);

    if (p.y * pn.y < 0.0) {
      vec3 hp = mix(p, pn, p.y / (p.y - pn.y));
      float rr = length(hp.xz);
      // Supernova shockwave: a ring racing outward through the disk plane, so it is lensed and foreshortened like the disk.
      if (uShock >= 0.0 && rr > 1.5) {
        float ring = exp(-pow((rr - shockR) / (0.22 + 0.04 * shockR), 2.0)) * (1.0 - uShock);
        col += uCore * ring * 3.2;
      }
      if (rr > RIN && rr < ROUT) {
        float edge = smoothstep(RIN, RIN + 0.3, rr) * (1.0 - smoothstep(ROUT - 3.0, ROUT, rr));
        float beta = sqrt(0.5 / (rr - 1.0));
        vec3 tang = normalize(vec3(-hp.z, 0.0, hp.x));
        float dop = 1.0 / (sqrt(1.0 - beta * beta) * (1.0 - beta * dot(tang, -v)));
        float beam = clamp(pow(dop, 1.8), 0.3, 2.4);
        float heat = pow(RIN / rr, 1.7) * beam * density(hp.xz, rr) * 2.1;
        col += mix(uDisk, uCore, smoothstep(1.1, 3.6, heat)) * heat * edge;
      }
    }
    p = pn;
  }

  // Rays that ran out of steps are orbiting at the photon sphere: treat them as captured.
  if (escaped < 0.5) hit = 1.0;

  // Warm haze from rays that graze the photon sphere without hitting anything.
  col += uDisk * exp(-max(minR - 2.55, 0.0) * 1.2) * 0.35 * (1.0 - hit);
  col *= uFlare * uDim;

  col = col / (1.0 + 0.6 * max(col.r, max(col.g, col.b))); // hue-preserving tone map keeps the amber from washing out to white
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  if (hit > 0.5) a = 1.0;
  gl_FragColor = vec4(col, a);
}
`;

/** Resolves any CSS colour (including oklch, which three.js cannot parse) to sRGB 0..1 via a 2D canvas. */
function cssRgb(value: string, fallback: string): Vector3 {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Vector3(1, 0.65, 0.3);
  ctx.fillStyle = fallback;
  ctx.fillStyle = value.trim() || fallback;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new Vector3((r ?? 255) / 255, (g ?? 160) / 255, (b ?? 70) / 255);
}

const SHOCK_SECONDS = 2.6;
const SHOCK_REPEATS = 2;
const FRAME_MS = 1000 / 30; // 30 fps cap keeps the idle cost low
const MIN_QUALITY = 0.75;
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="combobox"],[role="tab"],[role="switch"],[role="checkbox"]';

/**
 * Interstellar's backdrop: a ray-traced black hole drawn in a fragment shader. Disk colours come from the theme's
 * --disk variables; `state` speeds the disk up while running, flares it with a shockwave on success and cools it on
 * failure. Throws if WebGL is unavailable, so mount it behind BlackHole's error boundary.
 */
export default function BlackHole3D({ className, state = 'idle' }: { className?: string; state?: GargantuaState }) {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    // Supersample by default (the shadow edge is not anti-aliased otherwise); the loop below drops the ratio if the GPU struggles.
    let quality = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
    renderer.setPixelRatio(quality);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    el.appendChild(renderer.domElement);

    const palette = () => {
      const cs = getComputedStyle(el);
      const v = (name: string) => cs.getPropertyValue(name);
      return {
        disk: cssRgb(v('--disk'), '#f0a64a'),
        core: cssRgb(v('--disk-core'), '#fff1d6'),
        failDisk: cssRgb(v('--destructive'), '#d4483b'),
        failCore: cssRgb(v('--warning'), '#d98a3a'),
      };
    };
    let colors = palette();

    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new Vector2(640, 400) },
        uSpinTime: { value: 0 },
        uElev: { value: 0.1 },
        uAz: { value: 0 },
        uFlare: { value: 1 },
        uShock: { value: -1 },
        uDim: { value: 1 },
        uDisk: { value: colors.disk.clone() },
        uCore: { value: colors.core.clone() },
      },
    });
    const u = material.uniforms as Record<string, { value: number | Vector2 | Vector3 }>;
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    const scene = new Scene();
    scene.add(quad);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let spin = 0;
    let dim = 1;
    let last = performance.now();
    let prevState = stateRef.current;
    let doneAt = 0;

    // Interaction: drag to orbit the camera (it eases back after a pause), click for a shockwave. The canvas ignores
    // pointer events so it never blocks the page, so hits are tested against a region around the black hole instead.
    const user = { az: 0, elev: 0, dragging: false, released: 0 };
    let clickAt = -1;
    let pid = -1;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    let cursorSet = false;
    const inRegion = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.4);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.3);
      return nx * nx + ny * ny <= 1 && !(e.target instanceof Element && e.target.closest(INTERACTIVE));
    };
    const setCursor = (value: string | null) => {
      if (value === null) {
        if (cursorSet) document.body.style.cursor = '';
        cursorSet = false;
      } else {
        document.body.style.cursor = value;
        cursorSet = true;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !inRegion(e)) return;
      Object.assign(user, { dragging: true });
      pid = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      moved = 0;
      document.body.style.userSelect = 'none';
      setCursor('grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (user.dragging) {
        if (e.pointerId !== pid) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        user.az -= dx * 0.008;
        user.elev = Math.max(-0.55, Math.min(1.25, user.elev + dy * 0.005));
      } else setCursor(inRegion(e) ? 'grab' : null);
    };
    const onUp = (e: PointerEvent) => {
      if (!user.dragging || e.pointerId !== pid) return;
      user.dragging = false;
      user.released = performance.now();
      if (moved < 6) clickAt = performance.now();
      document.body.style.userSelect = '';
      setCursor(inRegion(e) ? 'grab' : null);
    };
    if (!reduced) {
      window.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }

    const draw = (now: number) => {
      const s = stateRef.current;
      if (s !== prevState) {
        if (s === 'done') doneAt = now;
        prevState = s;
      }
      const failed = s === 'failed';
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!reduced) spin += dt * (s === 'running' ? 3 : failed ? 0.25 : 1);
      dim += ((failed ? 0.55 : 1) - dim) * Math.min(1, dt * 4);
      u.uSpinTime!.value = spin;
      if (!user.dragging && now - user.released > 1800) {
        user.az += (0 - user.az) * Math.min(1, dt * 1.4);
        user.elev += (0 - user.elev) * Math.min(1, dt * 1.4);
      }
      u.uElev!.value = 0.1 + (reduced ? 0 : Math.sin(now / 7000) * 0.025) + user.elev; // slow camera drift sells the perspective
      u.uAz!.value = user.az;
      u.uDim!.value = dim;
      (u.uDisk!.value as Vector3).copy(failed ? colors.failDisk : colors.disk);
      (u.uCore!.value as Vector3).copy(failed ? colors.failCore : colors.core);

      let flare = s === 'running' ? 1.25 : 1;
      let shock = -1;
      if (s === 'done') {
        const t = (now - doneAt) / 1000;
        flare = 1 + 1.3 * Math.exp(-t * 1.6);
        if (t < SHOCK_SECONDS * SHOCK_REPEATS && !reduced) shock = (t % SHOCK_SECONDS) / SHOCK_SECONDS;
      }
      if (clickAt >= 0) {
        // A click sends a small shockwave through the disk.
        const ct = (now - clickAt) / 1000;
        if (ct < SHOCK_SECONDS) {
          if (shock < 0) shock = ct / SHOCK_SECONDS;
          flare += 0.7 * (1 - ct / SHOCK_SECONDS);
        } else clickAt = -1;
      }
      u.uFlare!.value = flare;
      u.uShock!.value = shock;
      renderer.render(scene, camera);
    };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      (u.uRes!.value as Vector2).copy(renderer.getDrawingBufferSize(new Vector2()));
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const mo = new MutationObserver(() => {
      colors = palette();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    resize();

    let raf = 0;
    let lastFrame = 0;
    let slow = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const gap = now - lastFrame;
      if (document.hidden || gap < (user.dragging ? 0 : FRAME_MS)) return;
      // Sustained frame times well past the cap mean the GPU is struggling: trade resolution for smoothness.
      slow = gap > 50 && gap < 500 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 20 && quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.25);
        renderer.setPixelRatio(quality);
        resize();
        slow = 0;
      }
      lastFrame = now;
      draw(now);
    };
    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setCursor(null);
      document.body.style.userSelect = '';
      ro.disconnect();
      mo.disconnect();
      quad.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden="true" data-state={state} style={{ aspectRatio: '640 / 400' }} />;
}
