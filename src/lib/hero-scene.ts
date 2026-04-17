import * as THREE from "three";

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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function createSoftCircleTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.9)");
  g.addColorStop(0.7, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export async function createHeroScene(
  options: HeroSceneOptions
): Promise<HeroSceneController> {
  const { canvas, reducedMotion = false } = options;
  const isMobile = window.innerWidth < 650;

  const PARTICLE_COUNT = isMobile ? 3000 : 6000;
  const AMBIENT_COUNT = isMobile ? 0 : 120;

  // Wait for font to be available for text sampling
  await document.fonts.load("500 1em chillax").catch(() => {});

  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 18);

  const vFov = (camera.fov * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * camera.position.z;
  let visibleWidth = visibleHeight * camera.aspect;

  // --- Scene ---
  const scene = new THREE.Scene();

  // --- Text Sampling ---
  function sampleText(text: string): { x: number; y: number }[] {
    const offscreen = document.createElement("canvas");
    const ctx = offscreen.getContext("2d")!;
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
    count: number
  ): Float32Array {
    const out = new Float32Array(count * 3);

    // Scale so text spans a good portion of visible width
    const maxX = Math.max(1, ...pts.map((p) => Math.abs(p.x)));
    const targetWidth = isMobile ? 0.78 : 0.5;
    const scale = (visibleWidth * targetWidth) / (maxX * 2);

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

  // Sample all phrases and build target positions
  const phraseTargets = PHRASES.map((text) => {
    const pts = sampleText(text);
    return buildTargets(pts, PARTICLE_COUNT);
  });

  // --- Text Particles ---
  const textPositions = new Float32Array(PARTICLE_COUNT * 3);
  const textStartPositions = new Float32Array(PARTICLE_COUNT * 3);
  const scatterDirs = new Float32Array(PARTICLE_COUNT * 3);

  // Initialize to first phrase
  textPositions.set(phraseTargets[0]);

  const textGeom = new THREE.BufferGeometry();
  textGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(textPositions, 3)
  );

  // Per-particle colors: dark blue range (matches the brand dark background)
  const darkBase = new THREE.Color(0x0b1220);
  const darkStrong = new THREE.Color(0x16243a);
  const textColors = new Float32Array(PARTICLE_COUNT * 3);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    tmpColor.copy(darkBase).lerp(darkStrong, Math.random() * 0.5);
    textColors[i * 3] = tmpColor.r;
    textColors[i * 3 + 1] = tmpColor.g;
    textColors[i * 3 + 2] = tmpColor.b;
  }
  textGeom.setAttribute("color", new THREE.BufferAttribute(textColors, 3));

  const particleTexture = createSoftCircleTexture();
  const textMat = new THREE.PointsMaterial({
    size: isMobile ? 0.08 : 0.07,
    map: particleTexture,
    transparent: true,
    opacity: 1.0,
    vertexColors: true,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const textPoints = new THREE.Points(textGeom, textMat);
  scene.add(textPoints);

  // --- Position text particles to align with the HTML spacer ---
  function alignTextToSpacer() {
    const spacer = document.querySelector(".particle-text-spacer");
    const heroEl = canvas.closest(".hero");
    if (!spacer || !heroEl) return;
    const heroRect = heroEl.getBoundingClientRect();
    const spacerRect = spacer.getBoundingClientRect();
    const heroCenter = heroRect.top + heroRect.height / 2;
    const spacerCenter = spacerRect.top + spacerRect.height / 2;
    const pixelOffset = heroCenter - spacerCenter;
    textPoints.position.y = pixelOffset * (visibleHeight / heroRect.height);
  }
  // Align after layout settles
  requestAnimationFrame(alignTextToSpacer);

  // --- Ambient Particles ---
  const ambientPositions = new Float32Array(AMBIENT_COUNT * 3);
  const ambientSpeeds = new Float32Array(AMBIENT_COUNT * 3);
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const i3 = i * 3;
    ambientPositions[i3] = (Math.random() - 0.5) * visibleWidth * 1.8;
    ambientPositions[i3 + 1] = (Math.random() - 0.5) * visibleHeight * 1.8;
    ambientPositions[i3 + 2] = (Math.random() - 0.5) * 12 - 3;
    ambientSpeeds[i3] = (Math.random() - 0.5) * 0.004;
    ambientSpeeds[i3 + 1] = (Math.random() - 0.5) * 0.004;
    ambientSpeeds[i3 + 2] = (Math.random() - 0.5) * 0.001;
  }
  const ambientGeom = new THREE.BufferGeometry();
  ambientGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(ambientPositions, 3)
  );
  const ambientMat = new THREE.PointsMaterial({
    size: 0.05,
    color: 0x16243a,
    transparent: true,
    opacity: 0.2,
    map: particleTexture,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  const ambientPoints = new THREE.Points(ambientGeom, ambientMat);
  scene.add(ambientPoints);

  // --- Mouse parallax (desktop only) ---
  const mouse = { x: 0, y: 0 };
  function onMouseMove(e: MouseEvent) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }
  if (!isMobile) {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
  }

  // --- Resize ---
  const resizeObserver = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    visibleWidth = visibleHeight * camera.aspect;
    alignTextToSpacer();
  });
  resizeObserver.observe(canvas);

  // --- Transition State ---
  let currentPhrase = 0;
  let transitioning = false;
  let transitionProgress = 0;
  const TRANSITION_DURATION = 1.5;
  const HOLD_DURATION = 2.0;
  let holdTimer = 0;

  function startTransition(nextPhrase: number) {
    textStartPositions.set(textPositions);

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

    currentPhrase = nextPhrase;
    transitioning = true;
    transitionProgress = 0;
  }

  // --- Animation ---
  const clock = new THREE.Clock();
  let animId = 0;
  let paused = false;

  function animate() {
    if (paused) return;
    animId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    const posAttr = textGeom.getAttribute("position") as THREE.BufferAttribute;
    const target = phraseTargets[currentPhrase];

    if (transitioning) {
      transitionProgress += delta / TRANSITION_DURATION;
      if (transitionProgress >= 1) {
        transitionProgress = 1;
        transitioning = false;
        holdTimer = 0;
      }

      const eased = easeInOutCubic(transitionProgress);
      const scatter = Math.sin(transitionProgress * Math.PI);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        textPositions[i3] =
          textStartPositions[i3] +
          (target[i3] - textStartPositions[i3]) * eased +
          scatterDirs[i3] * scatter;
        textPositions[i3 + 1] =
          textStartPositions[i3 + 1] +
          (target[i3 + 1] - textStartPositions[i3 + 1]) * eased +
          scatterDirs[i3 + 1] * scatter;
        textPositions[i3 + 2] =
          textStartPositions[i3 + 2] +
          (target[i3 + 2] - textStartPositions[i3 + 2]) * eased +
          scatterDirs[i3 + 2] * scatter;
      }
    } else {
      // Hold — subtle particle shimmer
      holdTimer += delta;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const seed = i * 0.0037;
        textPositions[i3] =
          target[i3] + Math.sin(elapsed * 0.6 + seed) * 0.005;
        textPositions[i3 + 1] =
          target[i3 + 1] + Math.cos(elapsed * 0.5 + seed * 1.3) * 0.005;
        textPositions[i3 + 2] =
          target[i3 + 2] + Math.sin(elapsed * 0.4 + seed * 0.7) * 0.003;
      }

      if (holdTimer >= HOLD_DURATION) {
        startTransition((currentPhrase + 1) % PHRASES.length);
      }
    }
    posAttr.needsUpdate = true;

    // Ambient particles drift
    const aPosAttr = ambientGeom.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let i = 0; i < AMBIENT_COUNT; i++) {
      const i3 = i * 3;
      aPosAttr.array[i3] += ambientSpeeds[i3];
      aPosAttr.array[i3 + 1] += ambientSpeeds[i3 + 1];
      aPosAttr.array[i3 + 2] += ambientSpeeds[i3 + 2];
      for (let a = 0; a < 3; a++) {
        const bound =
          a === 2 ? 10 : a === 0 ? visibleWidth : visibleHeight;
        if (Math.abs(aPosAttr.array[i3 + a]) > bound) {
          aPosAttr.array[i3 + a] *= -0.9;
        }
      }
    }
    aPosAttr.needsUpdate = true;

    // Camera parallax
    if (!isMobile) {
      camera.position.x += (mouse.x * 3.0 - camera.position.x) * 0.03;
      camera.position.y += (mouse.y * 2.0 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
  }

  // Reduced motion: render one static frame
  if (reducedMotion) {
    renderer.render(scene, camera);
  } else {
    animate();
  }

  // --- Controller ---
  function pause() {
    if (paused) return;
    paused = true;
    cancelAnimationFrame(animId);
    clock.stop();
  }

  function resume() {
    if (!paused) return;
    paused = false;
    clock.start();
    animate();
  }

  function destroy() {
    pause();
    resizeObserver.disconnect();
    if (!isMobile) window.removeEventListener("mousemove", onMouseMove);
    textGeom.dispose();
    textMat.dispose();
    ambientGeom.dispose();
    ambientMat.dispose();
    particleTexture.dispose();
    renderer.dispose();
    const gl = renderer.getContext();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { destroy, pause, resume };
}
