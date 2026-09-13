/**
 * Hero particle scene in plain WebGL.
 *
 * Replaces the earlier Three.js implementation (≈500 KB of JavaScript and a
 * per-frame CPU loop over every particle). All particle motion now runs in
 * the vertex shader; the main thread only updates a handful of uniforms per
 * frame and uploads new buffers once per phrase transition.
 */

export interface HeroSceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion?: boolean;
}

export interface HeroSceneController {
  destroy: () => void;
  pause: () => void;
  resume: () => void;
}

const PHRASES = [
  "Built With Simplicity",
  "Architected For Scale",
  "Performance Driven",
];

const CAMERA_FOV = 60;
const CAMERA_Z = 18;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 100;

const TRANSITION_DURATION = 1.5;
const HOLD_DURATION = 2.0;

const VERTEX_SHADER = `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec3 aScatter;
attribute vec3 aColor;
attribute float aSeed;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uProgress;
uniform float uScatter;
uniform float uTime;
uniform float uShimmer;
uniform float uOffsetY;
uniform float uSize;
uniform float uScale;

varying vec3 vColor;

void main() {
  vec3 p = mix(aStart, aTarget, uProgress) + aScatter * uScatter;
  p += vec3(
    sin(uTime * 0.6 + aSeed) * 0.005,
    cos(uTime * 0.5 + aSeed * 1.3) * 0.005,
    sin(uTime * 0.4 + aSeed * 0.7) * 0.003
  ) * uShimmer;
  p.y += uOffsetY;

  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProjection * mv;
  gl_PointSize = uSize * (uScale / -mv.z);
  vColor = aColor;
}
`;

// Soft round sprite: same falloff as the old radial-gradient canvas texture.
const FRAGMENT_SHADER = `
precision mediump float;

uniform float uOpacity;
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a;
  if (d < 0.45) {
    a = mix(1.0, 0.9, d / 0.45);
  } else if (d < 0.7) {
    a = mix(0.9, 0.2, (d - 0.45) / 0.25);
  } else {
    a = mix(0.2, 0.0, (d - 0.7) / 0.3);
  }
  gl_FragColor = vec4(vColor, a * uOpacity);
}
`;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// --- Minimal matrix helpers (column-major, like WebGL expects) ---

function perspective(
  fovDeg: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function lookAt(
  eye: [number, number, number],
  target: [number, number, number],
): Float32Array {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;

  // x = up × z, with up = (0, 1, 0)
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xz /= len;

  // y = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

function hexToRgb(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Hero shader failed to compile: ${log}`);
  }
  return shader;
}

export async function createHeroScene(
  options: HeroSceneOptions,
): Promise<HeroSceneController> {
  const { canvas, reducedMotion = false } = options;
  const isMobile = window.innerWidth < 650;

  const PARTICLE_COUNT = isMobile ? 3000 : 6000;
  const AMBIENT_COUNT = isMobile ? 0 : 120;

  // Wait for font to be available for text sampling
  await document.fonts.load("500 1em chillax").catch(() => {});

  // --- Context ---
  const gl = (canvas.getContext("webgl", {
    alpha: true,
    antialias: !isMobile,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  }) ||
    canvas.getContext("experimental-webgl", {
      alpha: true,
    })) as WebGLRenderingContext | null;
  if (!gl) {
    throw new Error("WebGL not available");
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  // --- Program ---
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(
    program,
    compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER),
  );
  gl.linkProgram(program);

  // Let the driver compile off the main thread where supported and poll for
  // completion, instead of blocking on the first status query.
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  if (parallel) {
    await new Promise<void>((resolve) => {
      const poll = () => {
        if (gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
          resolve();
        } else {
          requestAnimationFrame(poll);
        }
      };
      poll();
    });
  }

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Hero program failed to link: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);

  const attr = {
    start: gl.getAttribLocation(program, "aStart"),
    target: gl.getAttribLocation(program, "aTarget"),
    scatter: gl.getAttribLocation(program, "aScatter"),
    color: gl.getAttribLocation(program, "aColor"),
    seed: gl.getAttribLocation(program, "aSeed"),
  };
  const uni = {
    projection: gl.getUniformLocation(program, "uProjection"),
    view: gl.getUniformLocation(program, "uView"),
    progress: gl.getUniformLocation(program, "uProgress"),
    scatter: gl.getUniformLocation(program, "uScatter"),
    time: gl.getUniformLocation(program, "uTime"),
    shimmer: gl.getUniformLocation(program, "uShimmer"),
    offsetY: gl.getUniformLocation(program, "uOffsetY"),
    size: gl.getUniformLocation(program, "uSize"),
    scale: gl.getUniformLocation(program, "uScale"),
    opacity: gl.getUniformLocation(program, "uOpacity"),
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
  gl.clearColor(0, 0, 0, 0);

  // --- Camera ---
  const vFov = (CAMERA_FOV * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * CAMERA_Z;
  let visibleWidth = visibleHeight;
  let projection = perspective(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  const cameraPos: [number, number, number] = [0, 0, CAMERA_Z];

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const bw = Math.floor(w * pixelRatio);
    const bh = Math.floor(h * pixelRatio);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    gl.viewport(0, 0, bw, bh);
    const aspect = w / h;
    visibleWidth = visibleHeight * aspect;
    projection = perspective(CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR);
    gl.uniformMatrix4fv(uni.projection, false, projection);
    // Point size attenuation works in CSS pixels; the device pixel ratio is
    // already folded into uSize.
    gl.uniform1f(uni.scale, h * 0.5);
  }
  resize();

  // --- Text Sampling ---
  function sampleText(text: string): { x: number; y: number }[] {
    const offscreen = document.createElement("canvas");
    const ctx = offscreen.getContext("2d", { willReadFrequently: true })!;
    const fontSize = isMobile ? 90 : 100;
    const font = `500 ${fontSize}px chillax, sans-serif`;

    ctx.font = font;
    const metrics = ctx.measureText(text);
    offscreen.width = Math.ceil(metrics.width) + 20;
    offscreen.height = Math.ceil(fontSize * 1.4);

    // Re-set font after canvas resize
    ctx.font = font;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 10, offscreen.height / 2);

    const img = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const pts: { x: number; y: number }[] = [];
    const step = isMobile ? 3 : 2;

    for (let y = 0; y < offscreen.height; y += step) {
      for (let x = 0; x < offscreen.width; x += step) {
        if (img.data[(y * offscreen.width + x) * 4 + 3] > 128) {
          pts.push({
            x: x - offscreen.width / 2,
            y: -(y - offscreen.height / 2),
          });
        }
      }
    }
    return pts;
  }

  function buildTargets(
    pts: { x: number; y: number }[],
    count: number,
  ): Float32Array {
    const out = new Float32Array(count * 3);

    // Size the text relative to the rendered h1 above it, so it grows and
    // stops growing together with the heading (which clamps at 6rem) and
    // never runs wider than the canvas on small screens.
    let maxX = 1;
    for (const p of pts) maxX = Math.max(maxX, Math.abs(p.x));
    const canvasWidth = Math.max(canvas.clientWidth, 1);
    const heading = canvas.closest(".hero")?.querySelector("h1");
    const headingWidth = heading
      ? heading.getBoundingClientRect().width
      : canvasWidth * 0.6;
    const targetPx = Math.min(headingWidth * 0.8, canvasWidth * 0.9);
    const unitsPerPx = visibleHeight / Math.max(canvas.clientHeight, 1);
    const scale = (targetPx * unitsPerPx) / (maxX * 2);

    // Shuffle for random particle-to-point assignment
    const shuffled = [...pts].sort(() => Math.random() - 0.5);

    for (let i = 0; i < count; i++) {
      if (i < shuffled.length) {
        out[i * 3] = shuffled[i].x * scale;
        out[i * 3 + 1] = shuffled[i].y * scale;
        out[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      } else {
        // Excess particles — stack on existing text points with tiny offset
        const src = i % shuffled.length;
        out[i * 3] = shuffled[src].x * scale + (Math.random() - 0.5) * 0.04;
        out[i * 3 + 1] =
          shuffled[src].y * scale + (Math.random() - 0.5) * 0.04;
        out[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
    }
    return out;
  }

  // Sampled once; only the scale depends on the viewport, so a resize just
  // rebuilds the targets from these points.
  const phrasePoints = PHRASES.map(sampleText);
  let phraseTargets = phrasePoints.map((pts) =>
    buildTargets(pts, PARTICLE_COUNT),
  );

  // --- Buffers ---
  function makeBuffer(data: Float32Array, usage: number): WebGLBuffer {
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return buffer;
  }

  // Per-particle colors: dark blue range (matches the brand dark background)
  const darkBase = hexToRgb(0x0b1220);
  const darkStrong = hexToRgb(0x16243a);
  const textColors = new Float32Array(PARTICLE_COUNT * 3);
  const textSeeds = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const t = Math.random() * 0.5;
    textColors[i * 3] = darkBase[0] + (darkStrong[0] - darkBase[0]) * t;
    textColors[i * 3 + 1] = darkBase[1] + (darkStrong[1] - darkBase[1]) * t;
    textColors[i * 3 + 2] = darkBase[2] + (darkStrong[2] - darkBase[2]) * t;
    textSeeds[i] = i * 0.0037;
  }

  const scatterDirs = new Float32Array(PARTICLE_COUNT * 3);

  const text = {
    start: makeBuffer(phraseTargets[0], gl.DYNAMIC_DRAW),
    target: makeBuffer(phraseTargets[0], gl.DYNAMIC_DRAW),
    scatter: makeBuffer(scatterDirs, gl.DYNAMIC_DRAW),
    color: makeBuffer(textColors, gl.STATIC_DRAW),
    seed: makeBuffer(textSeeds, gl.STATIC_DRAW),
    count: PARTICLE_COUNT,
  };

  // --- Ambient particles (slow drift, updated on the CPU: only 120 points) ---
  const ambientPositions = new Float32Array(AMBIENT_COUNT * 3);
  const ambientSpeeds = new Float32Array(AMBIENT_COUNT * 3);
  const ambientColors = new Float32Array(AMBIENT_COUNT * 3);
  const ambientSeeds = new Float32Array(AMBIENT_COUNT);
  const ambientColor = hexToRgb(0x16243a);
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const i3 = i * 3;
    ambientPositions[i3] = (Math.random() - 0.5) * visibleWidth * 1.8;
    ambientPositions[i3 + 1] = (Math.random() - 0.5) * visibleHeight * 1.8;
    ambientPositions[i3 + 2] = (Math.random() - 0.5) * 12 - 3;
    ambientSpeeds[i3] = (Math.random() - 0.5) * 0.004;
    ambientSpeeds[i3 + 1] = (Math.random() - 0.5) * 0.004;
    ambientSpeeds[i3 + 2] = (Math.random() - 0.5) * 0.001;
    ambientColors[i3] = ambientColor[0];
    ambientColors[i3 + 1] = ambientColor[1];
    ambientColors[i3 + 2] = ambientColor[2];
  }
  const ambientZeros = new Float32Array(AMBIENT_COUNT * 3);
  const ambient = {
    start: makeBuffer(ambientPositions, gl.DYNAMIC_DRAW),
    target: makeBuffer(ambientPositions, gl.DYNAMIC_DRAW),
    scatter: makeBuffer(ambientZeros, gl.STATIC_DRAW),
    color: makeBuffer(ambientColors, gl.STATIC_DRAW),
    seed: makeBuffer(ambientSeeds, gl.STATIC_DRAW),
    count: AMBIENT_COUNT,
  };

  type PointSet = typeof text;

  function bindSet(set: PointSet) {
    const bind = (buffer: WebGLBuffer, location: number, size: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    bind(set.start, attr.start, 3);
    bind(set.target, attr.target, 3);
    bind(set.scatter, attr.scatter, 3);
    bind(set.color, attr.color, 3);
    bind(set.seed, attr.seed, 1);
  }

  // --- Position text particles to align with the HTML spacer ---
  let offsetY = 0;
  function alignTextToSpacer() {
    const spacer = document.querySelector(".particle-text-spacer");
    const heroEl = canvas.closest(".hero");
    if (!spacer || !heroEl) return;
    const heroRect = heroEl.getBoundingClientRect();
    const spacerRect = spacer.getBoundingClientRect();
    const heroCenter = heroRect.top + heroRect.height / 2;
    const spacerCenter = spacerRect.top + spacerRect.height / 2;
    const pixelOffset = heroCenter - spacerCenter;
    offsetY = pixelOffset * (visibleHeight / heroRect.height);
  }
  // Align after layout settles
  requestAnimationFrame(alignTextToSpacer);

  // --- Mouse parallax (desktop only) ---
  const mouse = { x: 0, y: 0 };
  function onMouseMove(e: MouseEvent) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }
  if (!isMobile) {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
  }

  // --- Transition State ---
  let currentPhrase = 0;
  let previousPhrase = 0;
  let transitioning = false;
  let transitionProgress = 0;
  let holdTimer = 0;

  // --- Resize ---
  // Re-scale the text to the new heading/canvas size (debounced) so it never
  // overflows after the window is resized or rotated.
  let rebuildTimer = 0;
  function rebuildTargets() {
    phraseTargets = phrasePoints.map((pts) => buildTargets(pts, PARTICLE_COUNT));
    gl.bindBuffer(gl.ARRAY_BUFFER, text.target);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, phraseTargets[currentPhrase]);
    gl.bindBuffer(gl.ARRAY_BUFFER, text.start);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      phraseTargets[transitioning ? previousPhrase : currentPhrase],
    );
    if (reducedMotion) render();
  }
  const resizeObserver = new ResizeObserver(() => {
    resize();
    alignTextToSpacer();
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuildTargets, 150);
  });
  resizeObserver.observe(canvas);

  function startTransition(nextPhrase: number) {
    // Particles currently sit on the old phrase; that becomes the start.
    gl.bindBuffer(gl.ARRAY_BUFFER, text.start);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, phraseTargets[currentPhrase]);
    gl.bindBuffer(gl.ARRAY_BUFFER, text.target);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, phraseTargets[nextPhrase]);

    // Random scatter directions per particle (smaller on mobile)
    const scatterRadius = isMobile ? 2.0 : 2.5;
    const scatterRange = isMobile ? 3.0 : 4.5;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = scatterRadius + Math.random() * scatterRange;
      scatterDirs[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      scatterDirs[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      scatterDirs[i * 3 + 2] = r * Math.cos(phi) * 0.25;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, text.scatter);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, scatterDirs);

    previousPhrase = currentPhrase;
    currentPhrase = nextPhrase;
    transitioning = true;
    transitionProgress = 0;
  }

  // --- Animation ---
  let animId = 0;
  let paused = false;
  let lastTime = 0;
  let elapsed = 0;

  function render() {
    // Camera parallax
    if (!isMobile) {
      cameraPos[0] += (mouse.x * 3.0 - cameraPos[0]) * 0.03;
      cameraPos[1] += (mouse.y * 2.0 - cameraPos[1]) * 0.03;
    }
    const view = lookAt(cameraPos, [0, 0, 0]);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(uni.view, false, view);
    gl.uniform1f(uni.time, elapsed);

    // Text particles
    bindSet(text);
    gl.uniform1f(uni.progress, transitioning ? easeInOutCubic(transitionProgress) : 1);
    gl.uniform1f(uni.scatter, transitioning ? Math.sin(transitionProgress * Math.PI) : 0);
    gl.uniform1f(uni.shimmer, transitioning ? 0 : 1);
    gl.uniform1f(uni.offsetY, offsetY);
    gl.uniform1f(uni.size, (isMobile ? 0.08 : 0.07) * pixelRatio);
    gl.uniform1f(uni.opacity, 1);
    gl.drawArrays(gl.POINTS, 0, text.count);

    // Ambient particles
    if (AMBIENT_COUNT > 0) {
      bindSet(ambient);
      gl.uniform1f(uni.progress, 0);
      gl.uniform1f(uni.scatter, 0);
      gl.uniform1f(uni.shimmer, 0);
      gl.uniform1f(uni.offsetY, 0);
      gl.uniform1f(uni.size, 0.05 * pixelRatio);
      gl.uniform1f(uni.opacity, 0.2);
      gl.drawArrays(gl.POINTS, 0, ambient.count);
    }
  }

  function step(now: number) {
    if (paused) return;
    animId = requestAnimationFrame(step);

    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
    lastTime = now;
    elapsed += delta;

    if (transitioning) {
      transitionProgress += delta / TRANSITION_DURATION;
      if (transitionProgress >= 1) {
        transitionProgress = 1;
        transitioning = false;
        holdTimer = 0;
      }
    } else {
      holdTimer += delta;
      if (holdTimer >= HOLD_DURATION) {
        startTransition((currentPhrase + 1) % PHRASES.length);
      }
    }

    // Ambient drift
    for (let i = 0; i < AMBIENT_COUNT; i++) {
      const i3 = i * 3;
      for (let a = 0; a < 3; a++) {
        ambientPositions[i3 + a] += ambientSpeeds[i3 + a];
        const bound = a === 2 ? 10 : a === 0 ? visibleWidth : visibleHeight;
        if (Math.abs(ambientPositions[i3 + a]) > bound) {
          ambientPositions[i3 + a] *= -0.9;
        }
      }
    }
    if (AMBIENT_COUNT > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, ambient.start);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ambientPositions);
    }

    render();
  }

  // Reduced motion: render one static frame
  if (reducedMotion) {
    requestAnimationFrame(() => {
      alignTextToSpacer();
      render();
    });
  } else {
    animId = requestAnimationFrame(step);
  }

  // --- Controller ---
  function pause() {
    if (paused) return;
    paused = true;
    cancelAnimationFrame(animId);
    lastTime = 0;
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (!reducedMotion) animId = requestAnimationFrame(step);
  }

  function destroy() {
    pause();
    window.clearTimeout(rebuildTimer);
    resizeObserver.disconnect();
    if (!isMobile) window.removeEventListener("mousemove", onMouseMove);
    for (const set of [text, ambient]) {
      gl.deleteBuffer(set.start);
      gl.deleteBuffer(set.target);
      gl.deleteBuffer(set.scatter);
      gl.deleteBuffer(set.color);
      gl.deleteBuffer(set.seed);
    }
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { destroy, pause, resume };
}
