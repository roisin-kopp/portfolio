import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createRoomBackground } from './room-background.js?v=6';
import { getLanguage, setLanguage, translate } from './language.js?v=3';

// =====================================
// SCENE + LIGHTING
// =====================================
const scene = new THREE.Scene();
scene.background = null;
const coolAmbientColor = new THREE.Color(0x9295ff);
const warmAmbientColor = new THREE.Color(0xffbd7a);
const coolHemisphereColor = new THREE.Color(0x8292ff);
const warmHemisphereColor = new THREE.Color(0xffcf91);
const coolGroundColor = new THREE.Color(0x2a194b);
const warmGroundColor = new THREE.Color(0x593348);
const coolCharacterLightColor = new THREE.Color(0x527eff);
const coolCharacterPinkColor = new THREE.Color(0xff47c8);
const warmCharacterLightColor = new THREE.Color(0x9a8bad);
const warmCharacterPinkColor = new THREE.Color(0xb17ca8);
const characterHoverColor = new THREE.Color(0xffffff);
const warmLavaBubbleColor = new THREE.Color(0xffeedf);
const warmLavaBubbleEmissive = new THREE.Color(0xffc9a6);
const ambientLight = new THREE.AmbientLight(coolAmbientColor, 0.46);
const hemisphereLight = new THREE.HemisphereLight(coolHemisphereColor, coolGroundColor, 0.28);
scene.add(ambientLight, hemisphereLight);
const warmPinkLightColor = new THREE.Color(0xff9858);
let roomLightingScale = 100;
let lavaGlowLight = null;
let characterRoomLight = null;
let characterPinkLight = null;
const starLampColor = new THREE.Color(0xFFB3F5);
const roomWarmHue = 0.1;
const roomWarmHueStrength = 0.65;
let roomWarmth = 0;
let roomWarmthTarget = 0;
const roomWarmMaterials = [];
const roomWarmMaterialByMaterial = new Map();
const characterWarmMaterials = [];
const lavaBubbleWarmMaterials = [];
const lavaBubbleWarmMaterialSet = new Set();
const lavaLampRaycaster = new THREE.Raycaster();
const lavaLampPointer = new THREE.Vector2();
const lavaLampClickTargets = [];
let lavaLampPivot = null;
let lavaBubbleRoot = null;
let isLavaLampHovered = false;

function attachLavaBubblesToPivot() {
  if (lavaLampPivot && lavaBubbleRoot && lavaBubbleRoot.parent !== lavaLampPivot) {
    lavaLampPivot.attach(lavaBubbleRoot);
  }
}

function addPinkKeyLight(roomCenter, maxSize) {
  const pinkKeyLight = new THREE.DirectionalLight(0xff3acb, 0.4);

  pinkKeyLight.position
    .copy(roomCenter)
    .add(new THREE.Vector3(-maxSize * 0.7, maxSize, maxSize * 0.8));
  pinkKeyLight.target.position.copy(roomCenter);
  pinkKeyLight.castShadow = true;
  pinkKeyLight.shadow.mapSize.set(1024, 1024);
  pinkKeyLight.shadow.camera.left = -maxSize * 0.7;
  pinkKeyLight.shadow.camera.right = maxSize * 0.7;
  pinkKeyLight.shadow.camera.top = maxSize * 0.7;
  pinkKeyLight.shadow.camera.bottom = -maxSize * 0.7;
  pinkKeyLight.shadow.camera.near = maxSize * 0.1;
  pinkKeyLight.shadow.camera.far = maxSize * 3;
  pinkKeyLight.shadow.bias = -0.0001;

  scene.add(pinkKeyLight, pinkKeyLight.target);
}

function updateCharacterRoomLight(characterRoot) {
  if (!characterRoot) return;

  const torsoBone = vrm?.humanoid?.getNormalizedBoneNode('chest')
    ?? vrm?.humanoid?.getNormalizedBoneNode('head');

  if (!torsoBone) return;

  torsoBone.updateWorldMatrix(true, false);
  const characterCenter = torsoBone.getWorldPosition(new THREE.Vector3());
  const cameraDirection = camera.position.clone().sub(characterCenter).normalize();

  if (!characterRoomLight) {
    characterRoomLight = new THREE.SpotLight(
      0x527eff,
      roomLightingScale * roomLightingScale * 0.12,
      roomLightingScale * 1.4,
      Math.PI / 3,
      0.9,
      2
    );
    characterPinkLight = new THREE.PointLight(
      0xff47c8,
      roomLightingScale * roomLightingScale * 0.16,
      roomLightingScale * 0.9,
      2
    );
    scene.add(
      characterRoomLight,
      characterRoomLight.target,
      characterPinkLight
    );
  }

  characterRoomLight.position
    .copy(characterCenter)
    .addScaledVector(cameraDirection, roomLightingScale * 0.45);
  characterRoomLight.position.y += roomLightingScale * 0.12;
  characterRoomLight.target.position.copy(characterCenter);

  const cameraSide = new THREE.Vector3(cameraDirection.z, 0, -cameraDirection.x).normalize();
  characterPinkLight.position
    .copy(characterCenter)
    .addScaledVector(cameraDirection, roomLightingScale * 0.28)
    .addScaledVector(cameraSide, roomLightingScale * 0.28);
  characterPinkLight.position.y += roomLightingScale * 0.08;
}

function createBlueEyeTexture(texture) {
  if (!texture?.image) return texture;

  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    pixels[index] = Math.round(luminance * 0.6);
    pixels[index + 1] = Math.round(luminance * 0.72);
    pixels[index + 2] = Math.round(luminance);
  }

  context.putImageData(imageData, 0, 0);
  const blueTexture = texture.clone();
  blueTexture.image = canvas;
  blueTexture.needsUpdate = true;
  return blueTexture;
}

function createEyeOverlayMask(texture) {
  if (!texture?.image) return texture;

  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    pixels[index] = luminance;
    pixels[index + 1] = luminance;
    pixels[index + 2] = luminance;
  }

  context.putImageData(imageData, 0, 0);
  const mask = texture.clone();
  mask.image = canvas;
  mask.needsUpdate = true;
  return mask;
}

const eyeDetailColors = {
  iris: 0xFB00FF,
  eyelash: 0x8d1fad,
  eyeliner: 0x8d1fad
};

function applyEyeColorOverlay(material, color) {
  const uniforms = material.uniforms;
  if (!uniforms?.map?.value || !uniforms.emissive?.value || !uniforms.emissiveMap) return;

  uniforms.emissiveMap.value = createEyeOverlayMask(uniforms.map.value);
  uniforms.emissive?.value.set(color);
  if (uniforms.emissiveIntensity) uniforms.emissiveIntensity.value = 1.2;
  if (uniforms.mapTransform?.value && uniforms.emissiveMapTransform?.value) {
    uniforms.emissiveMapTransform.value.copy(uniforms.mapTransform.value);
  }
  material.color?.set(0x3a3a3a);
  material.needsUpdate = true;
}

function tintCharacterBlue(materials) {
  const blueTint = new THREE.Color(0x8954ff);
  const eyeWhiteTint = new THREE.Color(0xb2c5ff);

  for (const material of materials ?? []) {
    if (/eyeiris/i.test(material.name)) {
      applyEyeColorOverlay(material, eyeDetailColors.iris);
      continue;
    }
    if (/eyelash/i.test(material.name)) {
      applyEyeColorOverlay(material, eyeDetailColors.eyelash);
      continue;
    }
    if (/eyeline/i.test(material.name)) {
      applyEyeColorOverlay(material, eyeDetailColors.eyeliner);
      continue;
    }

    const tint = /eyewhite/i.test(material.name) ? eyeWhiteTint : blueTint;
    material.color?.multiply(tint);
    material.shadeColorFactor?.multiply(tint);

    if (/eyewhite/i.test(material.name)) {
      material.map = createBlueEyeTexture(material.map);

      const shadeTexture = material.uniforms?.shadeMultiplyTexture;
      if (shadeTexture?.value) {
        shadeTexture.value = createBlueEyeTexture(shadeTexture.value);
      }

      material.emissiveMap = null;
      material.emissive?.set(0x607dff);
      material.emissiveIntensity = 0.35;
    }

    material.needsUpdate = true;
  }
}

function addWindowLight(room, roomCenter, maxSize) {
  const glassBounds = new THREE.Box3();

  room.traverse((object) => {
    if (object.isMesh && /window|glass/i.test(object.name)) {
      glassBounds.union(new THREE.Box3().setFromObject(object));
    }
  });

  if (glassBounds.isEmpty()) {
    console.warn('No window or glass mesh found for the window light.');
    return;
  }

  const glassCenter = glassBounds.getCenter(new THREE.Vector3());
  const inwardDirection = roomCenter.clone().sub(glassCenter).normalize();
  const windowLight = new THREE.SpotLight(
    0xff36c9,
    maxSize * maxSize * 0.012,
    maxSize * 1.6,
    Math.PI / 4,
    0.85,
    2
  );

  windowLight.position
    .copy(glassCenter)
    .addScaledVector(inwardDirection, maxSize * 0.16);
  windowLight.target.position.copy(roomCenter);
  windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(1024, 1024);
  windowLight.shadow.camera.near = Math.max(maxSize * 0.005, 0.1);
  windowLight.shadow.camera.far = maxSize * 1.5;
  windowLight.shadow.bias = -0.0001;

  const windowGlowLight = new THREE.PointLight(
    0xff36c9,
    maxSize * maxSize * 0.01,
    maxSize * 1.3,
    2
  );
  windowGlowLight.position.copy(windowLight.position);

  scene.add(windowLight, windowLight.target, windowGlowLight);
}

function addLavaGlowLight(lavaRoot) {
  const lavaBounds = new THREE.Box3().setFromObject(lavaRoot);

  if (lavaBounds.isEmpty()) return;

  const lavaCenter = lavaBounds.getCenter(new THREE.Vector3());
  const lavaSize = lavaBounds.getSize(new THREE.Vector3());

  lavaGlowLight = new THREE.PointLight(
    0xff2bd6,
    roomLightingScale * roomLightingScale * 0.0025,
    roomLightingScale * 0.14,
    2
  );
  lavaGlowLight.position.copy(lavaCenter);
  lavaGlowLight.position.y += lavaSize.y * 0.15;
  scene.add(lavaGlowLight);
}

// =====================================
// CAMERA
// =====================================
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  5000
);

// =====================================
// RENDERER
// =====================================
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#100713';
renderer.domElement.classList.add('room-canvas');
document.body.appendChild(renderer.domElement);
const roomBackground = createRoomBackground(
  document.getElementById('room-background'),
  renderer.domElement
);

const lavaBloomLayer = 1;
const lavaBloomLayers = new THREE.Layers();
lavaBloomLayers.set(lavaBloomLayer);
const bloomOccluderMaterials = new WeakMap();
const savedBloomMaterials = new Map();
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
bloomComposer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.25,
  0.12,
  0.8
));

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(new RenderPass(scene, camera));
const bloomComposite = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: bloomComposer.renderTarget2.texture }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { vec4 base = texture2D(baseTexture, vUv); vec3 bloom = texture2D(bloomTexture, vUv).rgb; gl_FragColor = vec4(base.rgb + bloom, base.a); }`
}), 'baseTexture');
finalComposer.addPass(bloomComposite);
finalComposer.addPass(new OutputPass());

// Liquid twist + blur for site panels and room artwork.
const liquifyPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uWarpAmount: { value: 0 },
    uWarpScale: { value: 1 },
    uAspect: { value: window.innerWidth / window.innerHeight }
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uWarpAmount;
    uniform float uWarpScale;
    uniform float uAspect;
    varying vec2 vUv;

    vec2 liquify(vec2 uv) {
      vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
      float r = length(p);
      float angle = uWarpAmount * 0.10 * sin(uTime * 0.35) * (1.0 - smoothstep(0.0, 1.0, r / uWarpScale));
      float s = sin(angle);
      float c = cos(angle);
      p = mat2(c, -s, s, c) * p;
      p /= vec2(uAspect, 1.0);
      uv = p + 0.5;
      vec2 flow = p / uWarpScale;
      vec2 displacement = vec2(
        sin(flow.y * 7.0 + flow.x * 3.0 + uTime * 0.55) +
          0.5 * sin(flow.y * 10.0 - flow.x * 6.0 - uTime * 0.39),
        sin(flow.x * 6.0 - flow.y * 3.0 - uTime * 0.48) +
          0.5 * cos(flow.x * 9.0 + flow.y * 7.0 + uTime * 0.33)
      );
      uv += uWarpAmount * 0.009 * displacement * vec2(1.0 / uAspect, 1.0);
      return clamp(uv, 0.001, 0.999);
    }

    void main() {
      vec2 uv = liquify(vUv);
      float radius = uAmount * 0.014;
      vec4 sum = vec4(0.0);
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float a = fi * 2.399963;
        vec2 offset = vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 16.0) * radius;
        sum += texture2D(tDiffuse, clamp(uv + offset * vec2(1.0 / uAspect, 1.0), 0.0, 1.0));
      }
      vec4 color = sum / 16.0;
      color.rgb *= 1.0 - 0.3 * uAmount;
      gl_FragColor = color;
    }
  `
}));
liquifyPass.enabled = false;
finalComposer.addPass(liquifyPass);
let aboutLiquify = 0;
let aboutLiquifyTarget = 0;
let liquifyWarp = 0;
let liquifyWarpScale = 1;

function darkenNonBloomed(object) {
  if (!object.isMesh || lavaBloomLayers.test(object.layers)) return;

  const original = object.material;
  savedBloomMaterials.set(object, original);
  const makeOccluder = (material) => {
    if (!bloomOccluderMaterials.has(material)) {
      bloomOccluderMaterials.set(material, new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        depthTest: material.depthTest,
        side: material.side,
        alphaTest: material.alphaTest
      }));
    }
    return bloomOccluderMaterials.get(material);
  };

  object.material = Array.isArray(original)
    ? original.map(makeOccluder)
    : makeOccluder(original);
}

function restoreBloomMaterials(object) {
  if (!savedBloomMaterials.has(object)) return;
  object.material = savedBloomMaterials.get(object);
  savedBloomMaterials.delete(object);
}

// =====================================
// CAMERA CONTROLS
// =====================================
const controls = new OrbitControls(camera, renderer.domElement);
// Set to false when the site is ready to welcome everyone without a password.
const previewPasswordRequired = true;
let previewGateActive = true;
controls.enabled = !previewGateActive;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enableZoom = true;
controls.enablePan = true;
controls.minPolarAngle = 1.1;
controls.maxPolarAngle = 2.2;

// =====================================
// CLOCKS + LOADERS
// =====================================
const clock = new THREE.Clock();
const lavaAnimations = [];

let vrm = null;
const headRestRotation = new THREE.Euler();
let headRestRotationCaptured = false;
const characterBasePosition = new THREE.Vector3();
const characterScaleAnchor = new THREE.Vector3();
const characterHeadHoverSphere = new THREE.Sphere();
let characterBaseScale = 1;
let characterHoverAmount = 0;

let blinkTimer = 0;
let blinkValue = 0;
let blinkPhase = 'waiting';
let nextBlinkIn = 2.5 + Math.random() * 2.5;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  './node_modules/three/examples/jsm/libs/draco/'
);

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const characterLoader = new GLTFLoader();
characterLoader.register(
  (parser) => new VRMLoaderPlugin(parser)
);

const startupAssets = new Map([
  ['room', 0],
  ['character', 0],
  ['lava', 0]
]);
const startupCompletedAssets = new Set();
const startupScreen = document.getElementById('startup-screen');
const previewGate = document.getElementById('preview-gate');
const previewForm = document.getElementById('preview-form');
const previewPassword = document.getElementById('preview-password');
const previewError = document.getElementById('preview-error');
const previewSubmit = previewForm.querySelector('button');
document.getElementById('preview-coming-soon').hidden = !previewPasswordRequired;
document.getElementById('preview-welcome').hidden = previewPasswordRequired;
document.querySelector('.preview-description').hidden = !previewPasswordRequired;
document.getElementById('preview-teaser').hidden = !previewPasswordRequired;
document.getElementById('preview-password-description').hidden = !previewPasswordRequired;
document.getElementById('preview-password-label').hidden = !previewPasswordRequired;
previewPassword.hidden = !previewPasswordRequired;
previewPassword.required = previewPasswordRequired;
let languageAnimations = [];
document.querySelectorAll('input[name="language"]').forEach((input) => {
  input.addEventListener('change', () => {
    setLanguage(input.value);
    if (previewError.textContent) previewError.textContent = translate(previewError.dataset.message);
    renderPortfolioCards();
    languageAnimations.forEach((animation) => animation.cancel());
    languageAnimations = [];
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const translatedElements = [
        document.getElementById('preview-welcome'),
        document.querySelector('.preview-description'),
        document.getElementById('preview-password-label'),
        previewSubmit,
        previewError
      ];
      languageAnimations = translatedElements
        .filter((element) => element.offsetParent !== null && element.textContent.trim())
        .map((element) => element.animate(
          [{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 260, easing: 'ease-out' }
        ));
    }
  });
});
setLanguage('de');
let startupReady = false;
let startupScreenDismissed = false;

previewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  previewSubmit.disabled = true;
  previewError.textContent = '';
  try {
    if (previewPasswordRequired) {
      if (!window.crypto?.subtle) throw new Error('Password check requires HTTPS');
      const bytes = new TextEncoder().encode(previewPassword.value);
      const digest = await window.crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== '81366d623470b6905c10929a704b256ede343c30e35c195c3e2746c7b1f65dd3') {
        previewError.dataset.message = 'Das Passwort stimmt leider nicht. Versuch es noch einmal.';
        previewError.textContent = translate(previewError.dataset.message);
        previewPassword.select();
        return;
      }
    }
    previewPassword.value = '';
    previewGate.hidden = true;
    previewGateActive = false;
  } catch (error) {
    console.error('Preview password check failed:', error);
    previewError.dataset.message = 'Die Prüfung funktioniert gerade nicht. Bitte verwende eine sichere HTTPS-Verbindung.';
    previewError.textContent = translate(previewError.dataset.message);
  } finally {
    previewSubmit.disabled = false;
  }
});

function updateStartupProgress(asset, progress, completed = false) {
  if (completed) startupCompletedAssets.add(asset);
  startupAssets.set(
    asset,
    Math.max(startupAssets.get(asset), THREE.MathUtils.clamp(progress, 0, 1))
  );

  startupReady = startupCompletedAssets.size === startupAssets.size;
}

function dismissStartupScreen() {
  if (!startupReady || startupScreenDismissed || !startupScreen) return;

  startupScreenDismissed = true;
  window.setTimeout(() => {
    if (previewGateActive) previewGate.hidden = false;
    startupScreen.classList.add('is-hidden');
    startupScreen.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      startupScreen.remove();
      if (previewGateActive) (previewPasswordRequired ? previewPassword : previewSubmit).focus();
    }, 650);
  }, 1000);
}

const introGuide = document.getElementById('intro-guide');
const introCaption = document.getElementById('intro-caption');
const introCaptionMeasure = document.getElementById('intro-caption-measure');
const introContinue = document.getElementById('intro-continue');
const introSkipButton = document.getElementById('intro-skip');
const siteHeader = document.getElementById('site-header');
const aboutRoomBack = document.getElementById('about-room-back');
const sitePanels = [
  { toggle: document.getElementById('about-toggle'), overlay: document.getElementById('about-overlay') },
  { toggle: document.getElementById('contact-toggle'), overlay: document.getElementById('contact-overlay') },
  { toggle: document.getElementById('portfolio-toggle'), overlay: document.getElementById('portfolio-overlay') }
].filter((panel) => panel.toggle && panel.overlay);
let panelCloseTimer = null;
const mascotImage = document.querySelector('.portfolio-mascot');
mascotImage?.decode?.().catch(() => {});

const setPanelOpen = (panel, open) => {
  panel.toggle.setAttribute('aria-expanded', String(open));

  if (open) {
    panel.overlay.hidden = false;
    if (panel.overlay.id === 'about-overlay') panel.overlay.scrollTop = 0;
    window.requestAnimationFrame(() => panel.overlay.classList.add('is-open'));
  } else {
    panel.overlay.classList.remove('is-open');
    window.setTimeout(() => {
      if (!panel.toggle.matches('[aria-expanded="true"]')) {
        panel.overlay.hidden = true;
        if (panel.overlay.id === 'portfolio-overlay') resetPortfolioView();
      }
    }, 500);
  }
};

const aboutOverlayElement = document.getElementById('about-overlay');
const aboutScrollHint = document.getElementById('about-scroll-hint');
aboutOverlayElement.addEventListener('scroll', () => {
  aboutScrollHint.classList.toggle('is-hidden', aboutOverlayElement.scrollTop > 24);
}, { passive: true });

const showSitePanel = (activePanel, { fromCharacter = false } = {}) => {
  window.clearTimeout(panelCloseTimer);
  if (activePanel) isCharacterHovered = false;
  if (characterAboutView && !fromCharacter) {
    returnFromCharacterAbout();
  }
  const characterView = fromCharacter && activePanel?.overlay.id === 'about-overlay';
  document.getElementById('about-overlay').classList.toggle('is-character-view', characterView);
  siteHeader.classList.toggle('is-character-about', characterView);
  aboutRoomBack.hidden = !characterView;
  for (const panel of sitePanels) {
    const open = panel === activePanel;
    if (open !== (panel.toggle.getAttribute('aria-expanded') === 'true')) {
      setPanelOpen(panel, open);
    }
  }
  aboutLiquifyTarget = activePanel ? 1 : 0;
};

for (const panel of sitePanels) {
  panel.toggle.addEventListener('click', () => {
    if (panel.overlay.id === 'about-overlay' && siteHeader.classList.contains('is-character-about')) {
      showSitePanel(panel);
      return;
    }
    showSitePanel(panel.toggle.getAttribute('aria-expanded') === 'true' ? null : panel);
  });
}
aboutRoomBack.addEventListener('click', () => showSitePanel(null));
document.getElementById('site-header-name')?.addEventListener('click', () => showSitePanel(null));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('artwork-viewer')?.open) showSitePanel(null);
});

const revealSiteHeader = () => {
  if (!siteHeader || !siteHeader.hidden) return;
  siteHeader.hidden = false;
  window.requestAnimationFrame(() => siteHeader.classList.add('is-visible'));
};

const roomCameraPosition = new THREE.Vector3();
const roomCameraTarget = new THREE.Vector3();
const introCameraTarget = new THREE.Vector3();
const characterFrontDirection = new THREE.Vector3();
let introCameraFramingReady = false;
let characterAboutView = null;
let characterAboutTransition = null;
const introLines = [
  'Hallo, ich bin Roisin!',
  'Willkommen in meiner Welt.',
  'Mit der Maus oder dem Trackpad kannst du klicken und ziehen, um dich umzusehen.',
  'Mit dem Mausrad kannst du zoomen, oder am Trackpad mit zwei Fingern spreizen oder zusammenziehen.',
  'Du kannst auf die Zeichnungen am Boden oder die Poster an der Wand klicken, um sie anzusehen.',
  'Du kannst auch mich anklicken, um mehr über mich herauszufinden.',
  "Das war's. Viel Spass!"
];
const introVoiceEnabled = false;
const introMouthPresets = ['aa', 'ih', 'ou', 'ee', 'oh'];
const introVowelPreset = {
  a: 'aa',
  e: 'ee',
  i: 'ih',
  o: 'oh',
  u: 'ou',
  y: 'ih',
  ä: 'aa',
  ö: 'oh',
  ü: 'ih'
};
const introFallbackVisemes = ['aa', 'ee', 'ih', 'oh', 'ou', 'ee'];
const introMouthWeights = Object.fromEntries(
  introMouthPresets.map((preset) => [preset, 0])
);
let introHappyWeight = 0;
let isCharacterHovered = false;
let characterHoverBlink = 0;
let roomCameraReady = false;
let introState = 'waiting';
let introTransition = null;
let introLineIndex = 0;
let introLineToken = 0;
let introSpeechTimer = null;
let introLineStartedAt = 0;
let introWordVisemes = [];
let introWordStartedAt = 0;
let introWordDuration = 0.3;
let introCurrentLine = '';
let introLineDuration = 1;
let introTextTargetIndex = 0;
let introTextVisibleIndex = 0;

function isCharacterHoverActive() {
  return introState === 'exploring' && isCharacterHovered &&
    !characterAboutView && !artworkViewer?.open && !aboutLiquifyTarget;
}

function moveIntroCamera(state, targetPosition, targetLookAt, duration) {
  introState = state;
  introTransition = {
    fromPosition: camera.position.clone(),
    toPosition: targetPosition.clone(),
    fromLookAt: controls.target.clone(),
    toLookAt: targetLookAt.clone(),
    startTime: clock.elapsedTime,
    duration
  };
}

function startCharacterAboutTransition(position, target, returning) {
  characterAboutTransition = {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: position.clone(),
    toTarget: target.clone(),
    startTime: clock.elapsedTime,
    duration: returning ? 1.4 : 1.25,
    returning
  };
}

function openCharacterAbout() {
  if (!introCameraFramingReady || characterAboutView || introState !== 'exploring') return;
  controls.update();
  characterAboutView = {
    position: camera.position.clone(),
    target: controls.target.clone()
  };
  controls.enabled = false;
  const closePosition = introCameraTarget.clone().addScaledVector(
    characterFrontDirection, Math.max(roomLightingScale * 0.25, 8)
  );
  closePosition.y -= roomLightingScale * 0.04;
  isCharacterHovered = false;
  setHoveredDrawing(null);
  isLavaLampHovered = false;
  renderer.domElement.style.cursor = 'grab';
  startCharacterAboutTransition(closePosition, introCameraTarget, false);
}

function returnFromCharacterAbout() {
  if (!characterAboutView || characterAboutTransition?.returning) return;
  startCharacterAboutTransition(characterAboutView.position, characterAboutView.target, true);
}

function updateCharacterAboutCamera() {
  if (!characterAboutTransition) return;
  const transition = characterAboutTransition;
  const progress = THREE.MathUtils.clamp(
    (clock.elapsedTime - transition.startTime) / transition.duration, 0, 1
  );
  const eased = progress * progress * (3 - 2 * progress);
  camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
  controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
  camera.lookAt(controls.target);
  if (!transition.returning && progress >= 0.75) {
    const aboutPanel = sitePanels.find((panel) => panel.overlay.id === 'about-overlay');
    if (aboutPanel && aboutPanel.toggle.getAttribute('aria-expanded') !== 'true') {
      showSitePanel(aboutPanel, { fromCharacter: true });
    }
  }
  if (progress === 1) {
    characterAboutTransition = null;
    if (transition.returning) {
      characterAboutView = null;
      controls.enabled = true;
    }
  }
}

function beginIntroduction() {
  if (
    introState !== 'waiting' ||
    previewGateActive ||
    !startupReady ||
    !roomCameraReady ||
    !vrm?.humanoid
  ) return;

  controls.enabled = false;
  setHoveredDrawing(null);
  vrm.scene.updateMatrixWorld(true);

  const head = vrm.humanoid.getNormalizedBoneNode('head');
  if (!head) {
    introState = 'exploring';
    controls.enabled = true;
    revealSiteHeader();
    return;
  }

  if (headRestRotationCaptured) {
    head.rotation.copy(headRestRotation);
    headLookX = 0;
    headLookY = 0;
    vrm.scene.updateMatrixWorld(true);
  }

  const closeLookAt = head.getWorldPosition(new THREE.Vector3());
  closeLookAt.y += roomLightingScale * 0.025;

  const characterForward = new THREE.Vector3(0, 0, 1)
    .transformDirection(head.matrixWorld);
  characterFrontDirection.set(characterForward.x, 0, characterForward.z).normalize();
  const closeDistance = Math.max(roomLightingScale * 0.4, 12);
  const closePosition = closeLookAt.clone().addScaledVector(characterForward, closeDistance);
  closePosition.y += roomLightingScale * 0.1;

  introCameraTarget.copy(closeLookAt);
  introCameraFramingReady = true;
  moveIntroCamera('zooming-in', closePosition, closeLookAt, 1.25);
}

function beginIntroSpeech() {
  if (introState !== 'zooming-in') return;

  introState = 'speaking';
  introLineIndex = 0;
  if (introGuide) introGuide.hidden = false;
  if (introContinue) introContinue.hidden = true;
  speakNextIntroLine();
}

function speakNextIntroLine() {
  if (introState !== 'speaking') return;

  if (introLineIndex >= introLines.length) {
    returnToRoomView();
    return;
  }

  const line = translate(introLines[introLineIndex++]);
  const spokenLine = line.replace(/\bRoisin\b/g, 'Ro-schien');
  introCurrentLine = line;
  introTextTargetIndex = 0;
  introTextVisibleIndex = 0;
  if (introCaptionMeasure) introCaptionMeasure.textContent = line;
  if (introCaption) introCaption.textContent = '';
  introLineStartedAt = clock.elapsedTime;
  introWordVisemes = [];
  const lineToken = ++introLineToken;
  const lineDuration = introVoiceEnabled
    ? Math.max(1800, line.split(/\s+/).length * 350 + 500)
    : Math.max(1200, line.split(/\s+/).length * 220 + 300);
  introLineDuration = lineDuration / 1000;

  const advanceLine = () => {
    if (introState !== 'speaking' || lineToken !== introLineToken) return;

    if (introSpeechTimer !== null) {
      window.clearTimeout(introSpeechTimer);
      introSpeechTimer = null;
    }

    closeIntroVisemes();
    introTextTargetIndex = line.length;
    introWordVisemes = [];
    introState = 'finishing-line';
  };

  introSpeechTimer = window.setTimeout(() => {
    if (introState !== 'speaking' || lineToken !== introLineToken) return;
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    advanceLine();
  }, lineDuration);

  if (
    !introVoiceEnabled ||
    typeof window.speechSynthesis === 'undefined' ||
    typeof window.SpeechSynthesisUtterance === 'undefined'
  ) return;

  const utterance = new SpeechSynthesisUtterance(spokenLine);
  utterance.lang = getLanguage() === 'en' ? 'en-US' : 'de-DE';
  utterance.rate = 1.18;
  utterance.pitch = 1.05;
  utterance.onboundary = (event) => {
    if (typeof event.charIndex !== 'number') return;

    const wordMatch = spokenLine.slice(event.charIndex).match(/^[^\p{L}]*([\p{L}']+)/u);
    const word = wordMatch?.[1] ?? '';
    if (wordMatch) {
      introTextTargetIndex = Math.max(
        introTextTargetIndex,
        Math.min(line.length, event.charIndex + wordMatch[0].length)
      );
    }

    const vowels = word.toLowerCase().match(/[aeiouyäöü]/g) ?? [];
    introWordVisemes = vowels.map((vowel) => introVowelPreset[vowel]);

    if (introWordVisemes.length === 0) introWordVisemes = ['aa'];
    introWordStartedAt = clock.elapsedTime;
    introWordDuration = Math.max(0.14, word.length * 0.055);
  };
  utterance.onend = advanceLine;
  utterance.onerror = advanceLine;
  window.speechSynthesis.speak(utterance);
}

function returnToRoomView() {
  if (
    introState !== 'speaking' &&
    introState !== 'finishing-line' &&
    introState !== 'waiting-for-click'
  ) return;

  introState = 'zooming-out';
  closeIntroVisemes();
  if (introContinue) introContinue.hidden = true;
  introLineToken += 1;
  if (introSpeechTimer !== null) {
    window.clearTimeout(introSpeechTimer);
    introSpeechTimer = null;
  }
  if (typeof window.speechSynthesis !== 'undefined') {
    window.speechSynthesis.cancel();
  }

  moveIntroCamera(
    'zooming-out',
    roomCameraPosition,
    roomCameraTarget,
    1.4
  );
}

function continueIntroduction(event) {
  if (event?.target?.closest?.('#intro-skip')) return;

  if (introState === 'speaking' || introState === 'finishing-line') {
    introLineToken += 1;
    if (introSpeechTimer !== null) {
      window.clearTimeout(introSpeechTimer);
      introSpeechTimer = null;
    }
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
    }
    closeIntroVisemes();
    introWordVisemes = [];
    introTextTargetIndex = introCurrentLine.length;
    introTextVisibleIndex = introCurrentLine.length;
    if (introCaption) introCaption.textContent = introCurrentLine;
    introState = 'waiting-for-click';
    if (introContinue) introContinue.hidden = false;
    return;
  }
  if (introState !== 'waiting-for-click') return;

  if (introLineIndex >= introLines.length) {
    returnToRoomView();
    return;
  }

  introState = 'speaking';
  if (introContinue) introContinue.hidden = true;
  speakNextIntroLine();
}

window.addEventListener('pointerdown', continueIntroduction);

function updateIntroMouth(delta) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return;

  let activeViseme = null;

  if (introState === 'speaking') {
    const wordBoundaryIsFresh =
      introWordVisemes.length > 0 &&
      clock.elapsedTime - introWordStartedAt <= introWordDuration + 0.12;

    if (wordBoundaryIsFresh) {
      const progress = THREE.MathUtils.clamp(
        (clock.elapsedTime - introWordStartedAt) / introWordDuration,
        0,
        0.999
      );
      activeViseme = introWordVisemes[
        Math.floor(progress * introWordVisemes.length)
      ];
    } else {
      const fallbackIndex = Math.floor(
        (clock.elapsedTime - introLineStartedAt) * 4.6
      ) % introFallbackVisemes.length;
      activeViseme = introFallbackVisemes[fallbackIndex];
    }
  }

  for (const preset of introMouthPresets) {
    const mouthTarget = preset === activeViseme
      ? 1
      : (preset === 'aa' && isCharacterHoverActive() ? 0.3 : 0);
    introMouthWeights[preset] = THREE.MathUtils.damp(
      introMouthWeights[preset],
      mouthTarget,
      24,
      delta
    );
    expressionManager.setValue(preset, introMouthWeights[preset]);
  }

  const smileTarget = introState === 'exploring'
    ? (isCharacterHoverActive() ? 0.8 : 0)
    : (introState !== 'waiting' ? 0.3 : 0);
  introHappyWeight = THREE.MathUtils.damp(
    introHappyWeight,
    smileTarget,
    5,
    delta
  );
  expressionManager.setValue('happy', introHappyWeight);
}

function closeIntroMouth() {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return;

  closeIntroVisemes();
  introHappyWeight = 0;
  expressionManager.setValue('happy', 0);
}

function closeIntroVisemes() {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return;

  for (const preset of introMouthPresets) {
    introMouthWeights[preset] = 0;
    expressionManager.setValue(preset, 0);
  }
}

function updateIntroCaption(delta) {
  if (
    !introCaption ||
    (introState !== 'speaking' && introState !== 'finishing-line')
  ) return;

  if (introState === 'speaking') {
    const progress = THREE.MathUtils.clamp(
      (clock.elapsedTime - introLineStartedAt) / introLineDuration,
      0,
      1
    );
    introTextTargetIndex = Math.max(
      introTextTargetIndex,
      Math.floor(introCurrentLine.length * progress)
    );
  }

  introTextVisibleIndex = Math.min(
    introTextTargetIndex,
    introTextVisibleIndex + delta * 120
  );
  introCaption.textContent = introCurrentLine.slice(
    0,
    Math.floor(introTextVisibleIndex)
  );

  if (
    introState === 'finishing-line' &&
    introTextVisibleIndex >= introCurrentLine.length
  ) {
    introState = 'waiting-for-click';
    if (introContinue) introContinue.hidden = false;
  }
}

function updateIntroduction(delta) {
  if (introState === 'waiting') beginIntroduction();
  updateIntroCaption(delta);
  updateIntroMouth(delta);

  if (!introTransition) return;

  const rawProgress = THREE.MathUtils.clamp(
    (clock.elapsedTime - introTransition.startTime) / introTransition.duration,
    0,
    1
  );
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);

  camera.position.lerpVectors(
    introTransition.fromPosition,
    introTransition.toPosition,
    progress
  );
  controls.target.lerpVectors(
    introTransition.fromLookAt,
    introTransition.toLookAt,
    progress
  );
  camera.lookAt(controls.target);

  if (rawProgress < 1) return;

  const completedState = introState;
  introTransition = null;

  if (completedState === 'zooming-in') {
    beginIntroSpeech();
  } else if (completedState === 'zooming-out') {
    introState = 'exploring';
    controls.enabled = true;
    closeIntroMouth();
    if (introGuide) introGuide.hidden = true;
    revealSiteHeader();
  }
}

introSkipButton?.addEventListener('click', returnToRoomView);

// =====================================
// ROOM MATERIALS
// =====================================
function configureRoomMaterials(root, bakedLighting = false) {
  root.traverse((object) => {
    if (!object.isMesh) return;

    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!material) continue;

      const isGlass = /glass|window/i.test(
        `${object.name} ${material.name}`
      );

      if (material.name === 'Glass') {
        material.color.set(0xffffff);
        material.roughness = 0.08;
        material.metalness = 0;
        material.transmission = 0.98;
        material.ior = 1.1;
        material.transparent = false;
        material.opacity = 1;
      } else if (material.name === 'metal') {
        material.needsUpdate = true;
      } else if (material.name === 'name light') {
        material.color.set(0xAA00DE);
        material.emissive?.set(0xFFB3F5);
        material.emissiveIntensity = 1.4;
        material.toneMapped = false;
      } else if (/^(star light|name light\.001)$/i.test(material.name)) {
        material.emissive?.copy(starLampColor);
        material.emissiveIntensity = 1.4;
        material.toneMapped = false;
      }

      if (isGlass && material.transmission > 0) {
        material.depthWrite = false;
        material.transparent = false;
        material.opacity = 1;
        material.needsUpdate = true;
      } else if (
        material.transparent ||
        material.opacity < 1 ||
        material.transmission > 0
      ) {
        material.depthWrite = false;

        if (isGlass && material.transmission === 0) {
          material.transparent = true;
          material.opacity = Math.min(material.opacity, 0.35);
        }

        material.needsUpdate = true;
      }
    }

    if (bakedLighting) {
      const bakedMaterials = materials.map((material) => {
        if (/^(star light|name light\.001)$/i.test(material.name)) return material;
        if (!material.map && !material.emissiveMap) return material;

        const baked = new THREE.MeshBasicMaterial().copy(material);
        baked.toneMapped = false;
        return baked;
      });
      object.material = Array.isArray(object.material) ? bakedMaterials : bakedMaterials[0];
    }
  });
}

function getWarmShiftColor(baseColor) {
  const warmColor = new THREE.Color(
    baseColor.r * 0.393 + baseColor.g * 0.769 + baseColor.b * 0.189,
    baseColor.r * 0.349 + baseColor.g * 0.686 + baseColor.b * 0.168,
    baseColor.r * 0.272 + baseColor.g * 0.534 + baseColor.b * 0.131
  );
  const luminance = baseColor.r * 0.2126 + baseColor.g * 0.7152 + baseColor.b * 0.0722;
  const warmLuminance = warmColor.r * 0.2126 + warmColor.g * 0.7152 + warmColor.b * 0.0722;
  return warmColor.multiplyScalar(luminance / Math.max(warmLuminance, 0.0001));
}

function getMutedPurpleColor(baseColor) {
  const purpleColor = baseColor.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  purpleColor.getHSL(hsl);
  purpleColor.setHSL(0.74, hsl.s * 0.55, hsl.l);
  return purpleColor;
}

function captureRoomWarmMaterials(root) {
  roomWarmMaterials.length = 0;
  roomWarmMaterialByMaterial.clear();

  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];

    for (const material of materials) {
      if (!material?.color || roomWarmMaterialByMaterial.has(material)) continue;

      const baseColor = material.color.clone();
      const warmColor = getWarmShiftColor(baseColor);
      const baseEmissive = material.emissive?.clone() ?? null;
      const warmEmissive = baseEmissive ? getWarmShiftColor(baseEmissive) : null;

      const entry = { material, baseColor, warmColor, baseEmissive, warmEmissive, warmUniform: null };
      if (material.map) {
              entry.warmUniform = { value: roomWarmth };
              const previousOnBeforeCompile = material.onBeforeCompile;
              material.onBeforeCompile = function (shader, rendererInstance) {
                previousOnBeforeCompile.call(this, shader, rendererInstance);
                shader.uniforms.roomWarmth = entry.warmUniform;
                shader.uniforms.roomWarmHue = { value: roomWarmHue };
                shader.uniforms.roomWarmHueStrength = { value: roomWarmHueStrength };
                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <common>',
                  `#include <common>
                  uniform float roomWarmth;
                  uniform float roomWarmHue;
                  uniform float roomWarmHueStrength;
                  vec3 roomRgbToHsl(vec3 color) {
                    float maxColor = max(max(color.r, color.g), color.b);
                    float minColor = min(min(color.r, color.g), color.b);
                    float delta = maxColor - minColor;
                    float hue = 0.0;
                    float saturation = 0.0;
                    float lightness = (maxColor + minColor) * 0.5;
                    if (delta > 0.00001) {
                      saturation = delta / (1.0 - abs(2.0 * lightness - 1.0));
                      if (maxColor == color.r) hue = mod((color.g - color.b) / delta, 6.0);
                      else if (maxColor == color.g) hue = (color.b - color.r) / delta + 2.0;
                      else hue = (color.r - color.g) / delta + 4.0;
                      hue /= 6.0;
                      if (hue < 0.0) hue += 1.0;
                    }
                    return vec3(hue, saturation, lightness);
                  }
                  float roomHueChannel(float p, float q, float t) {
                    if (t < 0.0) t += 1.0;
                    if (t > 1.0) t -= 1.0;
                    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
                    if (t < 1.0 / 2.0) return q;
                    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
                    return p;
                  }
                  vec3 roomHslToRgb(vec3 hsl) {
                    if (hsl.y < 0.0001) return vec3(hsl.z);
                    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
                    float p = 2.0 * hsl.z - q;
                    return vec3(
                      roomHueChannel(p, q, hsl.x + 1.0 / 3.0),
                      roomHueChannel(p, q, hsl.x),
                      roomHueChannel(p, q, hsl.x - 1.0 / 3.0)
                    );
                  }`
                );
                shader.fragmentShader = shader.fragmentShader.replace(
                  '#include <map_fragment>',
                  `#include <map_fragment>
                  if (roomWarmth > 0.0) {
                    vec3 originalColor = diffuseColor.rgb;
                    vec3 warmColor = vec3(
                      dot(originalColor, vec3(0.393, 0.769, 0.189)),
                      dot(originalColor, vec3(0.349, 0.686, 0.168)),
                      dot(originalColor, vec3(0.272, 0.534, 0.131))
                    );
                    float originalLuminance = dot(originalColor, vec3(0.2126, 0.7152, 0.0722));
                    float warmLuminance = dot(warmColor, vec3(0.2126, 0.7152, 0.0722));
                    warmColor *= originalLuminance / max(warmLuminance, 0.0001);
                    diffuseColor.rgb = mix(originalColor, warmColor, roomWarmth * 0.82);
                  }`
                );
              };
              const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
              material.customProgramCacheKey = () => `${previousProgramCacheKey()}:room-warm-hue`;
              material.needsUpdate = true;
            }
      roomWarmMaterials.push(entry);
      roomWarmMaterialByMaterial.set(material, entry);
    }
  });
}

function captureCharacterWarmMaterials(materials) {
  characterWarmMaterials.length = 0;
  for (const material of materials ?? []) {
    if (!material?.color) continue;
    characterWarmMaterials.push({
      material,
      baseColor: material.color.clone(),
      warmColor: getMutedPurpleColor(material.color),
      baseEmissive: material.emissive?.clone() ?? null,
      warmEmissive: material.emissive ? getMutedPurpleColor(material.emissive) : null
    });
  }
}

function updateLavaLampHover(event) {
  if (introState !== 'exploring' || lavaLampClickTargets.length === 0) {
    isLavaLampHovered = false;
    return;
  }

  const bounds = renderer.domElement.getBoundingClientRect();
  lavaLampPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  lavaLampPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  lavaLampRaycaster.setFromCamera(lavaLampPointer, camera);
  isLavaLampHovered = lavaLampRaycaster.intersectObjects(lavaLampClickTargets, true).length > 0;
  renderer.domElement.style.cursor = isLavaLampHovered ? 'pointer' : 'grab';
}

function isLavaLampAtPointer(event) {
  if (introState !== 'exploring' || lavaLampClickTargets.length === 0) return false;

  const bounds = renderer.domElement.getBoundingClientRect();
  lavaLampPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  lavaLampPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  lavaLampRaycaster.setFromCamera(lavaLampPointer, camera);
  return lavaLampRaycaster.intersectObjects(lavaLampClickTargets, true).length > 0;
}

function isOriginalBubble(name) {
  return /^Mball(?:\.\d+)?$/i.test(name);
}

const ipadGalleryItems = [
  {
    type: 'video',
    title: 'Stargirl Rough Animation',
    detail: 'Mit IbisPaint X Erstellt',
    src: './stargirl_rough_animation_web.mp4'
  },
  {
    type: 'video',
    title: 'Stargirl Final Animation',
    detail: 'Mit IbisPaint X Erstellt',
    src: './models/stargirl_final_web.mp4'
  },
  {
    type: 'video',
    title: 'Red Pikmin Idle Animation',
    detail: 'Mit Alight Motion & IbisPaint X Erstellt',
    src: './red_pikmin_idle_web.mp4',
    chromaKey: [0, 81, 198]
  },
  {
    type: 'video',
    title: 'Yellow Pikmin Idle Animation',
    detail: 'Mit Alight Motion & IbisPaint X Erstellt',
    src: './yellow_pikmin_idle_web.mp4',
    chromaKey: [0, 81, 198]
  },
  {
    type: 'video',
    title: 'Blue Pikmin Idle Animation',
    detail: 'Mit Alight Motion & IbisPaint X Erstellt',
    src: './models/blue_pikmin_idle_web.mp4',
    chromaKey: [255, 216, 0],
    chromaErode: 1.5,
    chromaCrop: [0.1, 0, 0.02, 0],
    chromaScale: 1.05
  },
  {
    type: 'video',
    title: 'Essen Animation',
    detail: 'Mit Alight Motion & IbisPaint X Erstellt',
    src: './models/roisin_essen_animation_web.mp4'
  },
  {
    type: 'video',
    title: 'Walk Cycle Animation',
    detail: 'Mit IbisPaint X & CapCut Erstellt',
    src: './models/roisin_walk_cycle_web.mp4'
  },
  {
    type: 'video',
    title: '3D Charakter Animation',
    detail: 'Mit Blender, Vroid & CapCut Erstellt',
    src: './models/roisin_runaway_mars_argo_web.mp4'
  },
  {
    type: 'video',
    title: 'Wind 3d Animation',
    detail: 'Mit Blender & Vroid Erstellt',
    src: './models/roisin_wind_3d_animation_web.mp4'
  }
];

const sketchbookGalleryItems = [
  { type: 'image', title: 'Stillleben Aquarell', detail: 'Aquarell', image: './models/roisin_stilleben_auqarell.png' },
  { type: 'image', title: 'Charakterzeichnung', detail: 'Zeichnung', image: './WEB_PORTFOLIO/ANALOG/roisin_charakterzeichnung.jpg' },
  { type: 'image', title: 'Digitale Charakterzeichnung', detail: 'Digitale Zeichnung', image: './models/roisin_digitale_charakterzeichnung.png' },
  { type: 'image', title: 'Farbstiftzeichnung', detail: 'Zeichnung', image: './models/roisin_farbstiftzeichnung.png' },
  { type: 'image', title: 'Hände Zeichnung', detail: 'Zeichnung', image: './WEB_PORTFOLIO/ANALOG/roisin_haende_zeichnung.jpg' },
  { type: 'image', title: 'Robot Katze', detail: 'Zeichnung', image: './WEB_PORTFOLIO/ANALOG/roisin_robot_katze.jpg' },
  { type: 'image', title: 'Stillleben', detail: 'Mit Procreate erstellt', image: './WEB_PORTFOLIO/DIGITAL/roisin_stilleben_digital.jpg' },
  { type: 'image', title: 'Chappell Roan', detail: 'Bleistiftzeichnung', image: './WEB_PORTFOLIO/ANALOG/chappellroan_pencil.png' },
  { type: 'image', title: 'Girl with Crocodile', detail: 'Bleistiftzeichnung', image: './isometric_room_starterfile.fbm/girl_drawing_pencil.png' },
  { type: 'image', title: 'Perspective Zeichnung', detail: 'Bleistiftzeichnung', image: './WEB_PORTFOLIO/ANALOG/roisin_perpsektive_zeichnung.jpg' },
  { type: 'image', title: 'Hina Luna', detail: 'Mit IbisPaint X erstellt', image: './isometric_room_starterfile.fbm/hina_luna_drawing_final.png' },
  { type: 'image', title: 'Beasteater Plakat', detail: 'Mit IbisPaint X erstellt', image: './isometric_room_starterfile.fbm/beasteater_poster.png' },
  { type: 'image', title: 'Beasteater Plakat', detail: 'Mit IbisPaint X erstellt', image: './isometric_room_starterfile.fbm/beasteater_poster_02.png' },
  { type: 'image', title: 'Beasteater Plakat', detail: 'Mit IbisPaint X erstellt', image: './isometric_room_starterfile.fbm/beasteater_poster_03.png' }
];

const floorArtworkByName = new Map([
  ['page', {
    title: 'Still Leben',
    detail: 'Mit Procreate Erstellt',
    image: './WEB_PORTFOLIO/DIGITAL/roisin_stilleben_digital.jpg'
  }],
  ['page008', {
    title: 'Chappell Roan Zeichnung',
    detail: 'Bleistiftzeichnung',
    image: './WEB_PORTFOLIO/ANALOG/chappellroan_pencil.png'
  }],
  ['page009', {
    title: 'Girl with Crocodile',
    detail: 'Bleistiftzeichnung',
    image: './isometric_room_starterfile.fbm/girl_drawing_pencil.png'
  }],
  ['page010', {
    title: 'Girl with Crocodile',
    detail: 'Bleistiftzeichnung',
    image: './isometric_room_starterfile.fbm/girl_drawing_pencil.png'
  }],
  ['page011', {
    title: 'Perspective Zeichnung',
    detail: 'Bleistiftzeichnung',
    image: './WEB_PORTFOLIO/ANALOG/roisin_perpsektive_zeichnung.jpg'
  }],
  ['page013', {
    title: 'Charakterzeichnung',
    detail: 'mit IbisPaint X Erstellt',
    image: './isometric_room_starterfile.fbm/hina_luna_drawing_final.png'
  }],
  ['Plane003', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster_03.png',
    hoverAxis: [1, 0, 0],
    hoverDistance: 0.18
  }],
  ['Plane004', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster_02.png',
    hoverAxis: [1, 0, 0],
    hoverDistance: 0.18
  }],
  ['Plane005', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster.png',
    hoverAxis: [1, 0, 0],
    hoverDistance: 0.18
  }],
  ['beasteater_poster_01', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster_03.png',
    hoverAxis: [1, 0, 0]
  }],
  ['beasteater_poster_02', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster_02.png',
    hoverAxis: [1, 0, 0]
  }],
  ['Plane.005', {
    title: 'Plakat',
    detail: 'Mit Ibispaint X Erstellt',
    image: './isometric_room_starterfile.fbm/beasteater_poster.png',
    hoverAxis: [1, 0, 0]
  }],
  ['cat_page', {
    title: 'Robot Katze',
    detail: 'Bleistiftzeichnung',
    image: './WEB_PORTFOLIO/ANALOG/roisin_robot_katze.jpg'
  }],
  ['cat_page001', {
    title: 'Farbstiftzeichnung',
    detail: 'Zeichnung',
    image: './models/roisin_farbstiftzeichnung.png'
  }],
  ['cat_page002', {
    title: 'Charakterzeichnung',
    detail: 'Zeichnung',
    image: './WEB_PORTFOLIO/ANALOG/roisin_charakterzeichnung.jpg'
  }],
  ['Sketchbook', {
    title: 'Skizzenbuch',
    detail: 'Zeichnungen',
    gallery: sketchbookGalleryItems
  }],
  ['ipad', {
    title: 'Digital Portfolio',
    detail: 'Art & Animation',
    hoverDistance: 0.5,
    gallery: ipadGalleryItems
  }]
]);

const artworkImageLoads = new Map();
let artworkRequestId = 0;

function preloadArtworkImage(imagePath) {
  if (!artworkImageLoads.has(imagePath)) {
    const image = new Image();
    image.src = imagePath;

    const load = typeof image.decode === 'function'
      ? image.decode().then(() => image)
      : new Promise((resolve, reject) => {
          image.addEventListener('load', () => resolve(image), { once: true });
          image.addEventListener('error', reject, { once: true });
        });

    artworkImageLoads.set(imagePath, load);
  }

  return artworkImageLoads.get(imagePath);
}

for (const artwork of new Set(floorArtworkByName.values())) {
  const imagePaths = artwork.gallery
    ? artwork.gallery.filter((item) => item.type === 'image').map((item) => item.image)
    : artwork.image ? [artwork.image] : [];

  for (const imagePath of imagePaths) {
    preloadArtworkImage(imagePath).catch((error) => {
      console.error('Artwork preload failed:', error);
    });
  }
}

const interactiveDrawings = [];
const artworkRaycaster = new THREE.Raycaster();
const artworkPointer = new THREE.Vector2();
const artworkViewer = document.getElementById('artwork-viewer');
const artworkViewerImage = document.getElementById('artwork-viewer-image');
const artworkViewerVideo = document.getElementById('artwork-viewer-video');
const artworkViewerKeyed = document.getElementById('artwork-viewer-keyed');
const artworkViewerTitle = document.getElementById('artwork-viewer-title');
const artworkViewerDetail = document.getElementById('artwork-viewer-detail');
const artworkViewerCount = document.getElementById('artwork-viewer-count');
const artworkViewerPrevious = document.getElementById('artwork-viewer-previous');
const artworkViewerNext = document.getElementById('artwork-viewer-next');
const artworkViewerFigure = document.getElementById('artwork-viewer-figure');
const artworkProject = document.getElementById('artwork-project');
const artworkProjectTitle = document.getElementById('artwork-project-title');
const artworkProjectDescription = document.getElementById('artwork-project-description');
const artworkProjectItems = document.getElementById('artwork-project-items');
const artworkProjectBack = document.getElementById('artwork-project-back');
const artworkProjectPrevious = document.getElementById('artwork-project-previous');
const artworkProjectNext = document.getElementById('artwork-project-next');
const artworkProjectCount = document.getElementById('artwork-project-count');
let hoveredDrawing = null;
artworkViewerVideo?.addEventListener('loadedmetadata', () => {
  if (artworkViewerVideo.videoWidth) {
    const ratio = artworkViewerVideo.videoWidth / artworkViewerVideo.videoHeight;
    artworkViewerVideo.style.setProperty('--video-ratio', ratio);
    artworkViewerKeyed.style.setProperty('--video-ratio', ratio);
  }
});
const tiltTarget = new THREE.Quaternion();
let pointerDownPosition = null;
let activeArtworkItems = [];
let activeArtworkIndex = 0;
let projectTransition = null;
let projectVideoObserver = null;

function initializeFloorArtwork(room) {
  const artworkNodes = [];
  room.traverse((object) => {
    const artwork = floorArtworkByName.get(object.name);
    if (artwork) artworkNodes.push({ object, artwork });
  });

  for (const { object, artwork } of artworkNodes) {
    const outlineTargets = object.isMesh ? [object] : [];

    if (outlineTargets.length === 0) {
      object.traverse((child) => {
        if (child.isMesh) outlineTargets.push(child);
      });
    }

    if (outlineTargets.length === 0) continue;

    // Cloned so brightening one artwork doesn't affect meshes sharing the material.
    const brightMaterials = [];
    for (const target of outlineTargets) {
      const materials = Array.isArray(target.material) ? target.material : [target.material];
      const cloned = materials.map((material) => {
        if (!material.color || material.name === 'screen') return material;
        const copy = material.clone();
        brightMaterials.push({ material: copy, base: copy.color.clone() });
        return copy;
      });
      target.material = Array.isArray(target.material) ? cloned : cloned[0];
    }
    object.userData.artworkBrightMaterials = brightMaterials;
    object.userData.artworkBrightness = 1;

    if (artwork.gallery) {
      const glowMaterials = [];
      object.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        child.material = materials.map((material) => {
          if (material.name !== 'screen') return material;
          const glow = material.clone();
          glow.color?.set(0xff7ad9);
          glow.emissive?.set(0xff4fc8);
          glow.emissiveIntensity = 1.6;
          glow.toneMapped = false;
          glowMaterials.push(glow);
          return glow;
        });
        if (child.material.length === 1) child.material = child.material[0];
      });

      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object);
      const lightWorldPosition = bounds.getCenter(new THREE.Vector3());
      lightWorldPosition.y += bounds.getSize(new THREE.Vector3()).length() * 0.5;

      const screenLight = new THREE.PointLight(
        0xff4fc8,
        roomLightingScale * roomLightingScale * 0.012,
        roomLightingScale * 0.25,
        2
      );
      screenLight.position.copy(object.worldToLocal(lightWorldPosition));
      object.add(screenLight);

      object.userData.artworkGlowMaterials = glowMaterials;
      object.userData.artworkGlowLight = screenLight;
      object.userData.artworkGlowLightBase = screenLight.intensity;
    }

    const pivot = createArtworkHoverPivot(object);
    pivot.name = object.name;
    pivot.userData.artwork = artwork;
    pivot.userData.artworkBasePosition = pivot.position.clone();
    pivot.userData.artworkHoverAxis = new THREE.Vector3(
      ...(artwork.hoverAxis ?? [0, 1, 0])
    ).normalize().transformDirection(pivot.parent.matrixWorld.clone().invert());
    pivot.userData.artworkTiltAxis = new THREE.Vector3(
      ...(artwork.tiltAxis ?? artwork.hoverAxis ?? [0, 1, 0])
    ).normalize().transformDirection(pivot.parent.matrixWorld.clone().invert());
    pivot.userData.artworkHoverDistance = artwork.hoverDistance
      ?? (artwork.hoverAxis ? 0.18 : 0.32);
    pivot.userData.artworkTargetPosition = new THREE.Vector3();
    pivot.userData.artworkBaseScale = pivot.scale.clone();
    pivot.userData.artworkBaseQuaternion = pivot.quaternion.clone();
    pivot.userData.artworkBrightMaterials = object.userData.artworkBrightMaterials;
    pivot.userData.artworkBrightness = 1;
    pivot.userData.artworkGlowMaterials = object.userData.artworkGlowMaterials;
    pivot.userData.artworkGlowLight = object.userData.artworkGlowLight;
    pivot.userData.artworkGlowLightBase = object.userData.artworkGlowLightBase;
    interactiveDrawings.push(pivot);
  }

  window.floorArtworks = interactiveDrawings;
}

function createArtworkHoverPivot(object) {
  const parent = object.parent;
  if (!parent) return object;

  object.updateWorldMatrix(true, true);
  const objectWorldMatrix = object.matrixWorld.clone();
  const worldCenter = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  parent.updateWorldMatrix(true, false);

  const pivot = new THREE.Group();
  pivot.name = `${object.name}_hoverPivot`;
  pivot.position.copy(parent.worldToLocal(worldCenter));
  parent.add(pivot);
  pivot.updateWorldMatrix(true, false);

  const objectLocalMatrix = pivot.matrixWorld.clone().invert().multiply(objectWorldMatrix);
  parent.remove(object);
  pivot.add(object);
  objectLocalMatrix.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrix();
  pivot.updateWorldMatrix(true, true);

  return pivot;
}

function getFloorArtworkAtPointer(event) {
  if (introState !== 'exploring') return null;

  const bounds = renderer.domElement.getBoundingClientRect();
  artworkPointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  artworkPointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  artworkRaycaster.setFromCamera(artworkPointer, camera);

  const hit = artworkRaycaster.intersectObjects(interactiveDrawings, true)[0]?.object;
  let drawing = hit;

  while (drawing && !drawing.userData.artwork) {
    drawing = drawing.parent;
  }

  return drawing ?? null;
}

function setHoveredDrawing(drawing) {
  if (hoveredDrawing === drawing) return;

  hoveredDrawing = drawing;

  renderer.domElement.style.cursor = hoveredDrawing ? 'pointer' : 'grab';
}

async function showFloorArtwork(drawing) {
  if (!drawing?.userData.artwork || !artworkViewer) return;

  isCharacterHovered = false;
  const artwork = drawing.userData.artwork;
  activeArtworkItems = artwork.gallery ?? [{ ...artwork, type: 'image' }];
  activeArtworkIndex = 0;

  setHoveredDrawing(null);
  await showArtworkSlide(activeArtworkIndex);
}

const keyedContext = artworkViewerKeyed?.getContext('2d', { willReadFrequently: true });
let keyedFrame = 0;

function stopKeyedVideo() {
  cancelAnimationFrame(keyedFrame);
  artworkViewerKeyed.hidden = true;
  artworkViewerVideo.classList.remove('is-keyed');
}

function drawKeyedVideoFrame(video, canvas, context, key, erode = 0, crop = [0, 0, 0, 0]) {
  if (video.readyState < 2 || !video.videoWidth) return;
  const [kr, kg, kb] = key;
  const inner = 40;
  const outer = 95;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;

  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - kr, data[i + 1] - kg, data[i + 2] - kb);
    const alpha = Math.min(1, Math.max(0, (distance - inner) / (outer - inner)));
    if (alpha < 1 && alpha > 0) {
      // Subtract the background colour mixed into edge pixels so no coloured fringe remains.
      data[i] = Math.min(255, Math.max(0, (data[i] - (1 - alpha) * kr) / alpha));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - (1 - alpha) * kg) / alpha));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - (1 - alpha) * kb) / alpha));
    }
    data[i + 3] = alpha * 255;
  }

  const width = canvas.width;
  const height = canvas.height;

  // Crop is [top, right, bottom, left] as fractions of the frame.
  const cropTop = Math.round(height * crop[0]);
  const cropRight = Math.round(width * crop[1]);
  const cropBottom = Math.round(height * crop[2]);
  const cropLeft = Math.round(width * crop[3]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (y < cropTop || y >= height - cropBottom || x < cropLeft || x >= width - cropRight) {
        data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }

  // Shrinks the matte so leftover background-tinted edge pixels disappear.
  for (let pass = 0; pass < erode; pass += 1) {
    const alphas = new Uint8Array(width * height);
    for (let p = 0; p < alphas.length; p += 1) alphas[p] = data[p * 4 + 3];

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        data[p * 4 + 3] = Math.min(
          alphas[p], alphas[p - 1], alphas[p + 1], alphas[p - width], alphas[p + width]
        );
      }
    }
  }

  context.putImageData(frame, 0, 0);
}

// Removes a flat background colour by drawing video frames to a canvas with soft-edged alpha.
function startKeyedVideo(key, erode = 0, crop = [0, 0, 0, 0], scale = 1) {
  const video = artworkViewerVideo;
  const canvas = artworkViewerKeyed;
  video.classList.add('is-keyed');
  canvas.style.setProperty('--keyed-scale', scale);
  canvas.hidden = false;

  const draw = () => {
    keyedFrame = requestAnimationFrame(draw);
    if (video.readyState < 2 || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    drawKeyedVideoFrame(video, canvas, keyedContext, key, erode, crop);
  };

  keyedFrame = requestAnimationFrame(draw);
}

async function showArtworkSlide(index, direction = 1) {
  if (activeArtworkItems.length === 0 || !artworkViewer) return;

  const nextIndex = Math.min(Math.max(index, 0), activeArtworkItems.length - 1);
  if (artworkViewer.open && nextIndex === activeArtworkIndex && index !== nextIndex) return;

  activeArtworkIndex = nextIndex;
  const item = activeArtworkItems[activeArtworkIndex];
  const requestId = ++artworkRequestId;

  const outgoing = [artworkViewerImage, artworkViewerKeyed, artworkViewerVideo].find((element) => !element.hidden);
  const switching = artworkViewer.open && Boolean(outgoing);
  artworkViewer.classList.toggle('is-switching', switching);
  const slideIn = (element) => {
    if (!switching) return;
    element.animate(
      [
        { transform: `translateX(${22 * direction}vw)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 }
      ],
      { duration: 320, easing: 'cubic-bezier(0.15, 0.8, 0.3, 1)' }
    );
  };

  if (switching) {
    const slideOut = outgoing.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${-22 * direction}vw)`, opacity: 0 }
      ],
      { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)', fill: 'forwards' }
    );
    await slideOut.finished.catch(() => {});
    outgoing.hidden = true;
    slideOut.cancel();
    if (requestId !== artworkRequestId) return;
  }

  artworkViewerImage.style.opacity = '0';
  artworkViewerImage.hidden = true;
  artworkViewerImage.style.opacity = '0';
  artworkViewerImage.removeAttribute('src');
  stopKeyedVideo();
  artworkViewerVideo.pause();
  artworkViewerVideo.removeAttribute('src');
  artworkViewerVideo.load();
  artworkViewerVideo.hidden = true;
  artworkViewerVideo.style.opacity = '0';

  artworkViewerTitle.textContent = translate(item.title);
  artworkViewerDetail.textContent = translate(item.detail);
  artworkViewerCount.textContent = `${activeArtworkIndex + 1} / ${activeArtworkItems.length}`;
  artworkViewerCount.hidden = activeArtworkItems.length < 2;
  artworkViewerPrevious.hidden = activeArtworkItems.length < 2;
  artworkViewerNext.hidden = activeArtworkItems.length < 2;
  artworkViewerPrevious.disabled = activeArtworkIndex === 0;
  artworkViewerNext.disabled = activeArtworkIndex === activeArtworkItems.length - 1;

  if (!artworkViewer.open) artworkViewer.showModal();

  try {
    if (item.type === 'video') {
      artworkViewerVideo.hidden = false;
      artworkViewerVideo.style.opacity = '1';
      if (item.chromaKey) startKeyedVideo(item.chromaKey, item.chromaErode, item.chromaCrop, item.chromaScale);
      slideIn(item.chromaKey ? artworkViewerKeyed : artworkViewerVideo);
      artworkViewerVideo.src = item.src;
      artworkViewerVideo.load();

      try {
        await artworkViewerVideo.play();
      } catch {
        artworkViewerVideo.controls = true;
      }

      if (requestId !== artworkRequestId || !artworkViewer.open) {
        artworkViewerVideo.pause();
      }
      return;
    }

    const readyImage = await preloadArtworkImage(item.image);
    if (requestId !== artworkRequestId || !artworkViewer.open) return;

    artworkViewerImage.hidden = false;
    artworkViewerImage.alt = `${translate(item.title)}, ${translate(item.detail)}`;
    artworkViewerImage.src = readyImage.src;
    artworkViewerImage.style.opacity = '1';
    slideIn(artworkViewerImage);
  } catch (error) {
    if (requestId === artworkRequestId) {
      artworkViewerDetail.textContent = getLanguage() === 'en' ? 'Media could not be loaded' : 'Medium konnte nicht geladen werden';
      console.error('Artwork gallery item failed to load:', error);
    }
  }
}

function clearArtworkViewerImage() {
  artworkRequestId += 1;
  projectTransition?.cancel();
  projectTransition = null;
  projectVideoObserver?.disconnect();
  projectVideoObserver = null;
  artworkProjectItems.querySelectorAll('video').forEach((video) => video.pause());
  artworkViewer.classList.remove('is-project', 'is-switching', 'is-project-opening', 'is-project-closing');
  artworkProject.hidden = true;
  artworkViewerFigure.hidden = false;
  artworkProjectItems.replaceChildren();
  stopKeyedVideo();
  artworkViewerImage.style.opacity = '0';
  artworkViewerImage.hidden = true;
  artworkViewerImage.removeAttribute('src');
  artworkViewerVideo.pause();
  artworkViewerVideo.removeAttribute('src');
  artworkViewerVideo.load();
  artworkViewerVideo.hidden = true;
  activeArtworkItems = [];
  activeArtworkIndex = 0;
}

function closeArtworkViewer() {
  if (!artworkViewer.open || artworkViewer.classList.contains('is-project-closing')) return;
  if (artworkViewer.classList.contains('is-project')) {
    projectTransition?.cancel();
    projectTransition = null;
    projectVideoObserver?.disconnect();
    projectVideoObserver = null;
    artworkProjectItems.querySelectorAll('video').forEach((video) => video.pause());
    artworkViewer.classList.remove('is-project-opening');
    artworkViewer.classList.add('is-project-closing');
    return;
  }
  clearRoomArtworkBlur();
  artworkViewer.close();
}

function clearRoomArtworkBlur() {
  if (aboutLiquifyTarget) return;
  aboutLiquify = 0;
  liquifyWarp = 0;
  liquifyPass.uniforms.uAmount.value = 0;
  liquifyPass.uniforms.uWarpAmount.value = 0;
  liquifyPass.enabled = false;
}

const portfolioRoot = './WEB_PORTFOLIO';
const dogProject = {
  title: 'Hund Skulptur',
  items: [
    { type: 'image', src: `${portfolioRoot}/3D/hund_skulptur_final_01.jpeg`, label: 'Ansicht 1' },
    { type: 'image', src: `${portfolioRoot}/3D/hund_skulptur_final_02.jpg`, label: 'Ansicht 2' },
    { type: 'image', src: `${portfolioRoot}/3D/hund_skulptur_detail.jpeg`, label: 'Detail' },
    { type: 'image', src: `${portfolioRoot}/3D/hund_skulptur_prozess_01.jpeg`, label: 'Prozess 1' },
    { type: 'image', src: `${portfolioRoot}/3D/hund_skulptur_prozess_02.jpeg`, label: 'Prozess 2' },
    { type: 'pdf', src: `${portfolioRoot}/3D/roisin_skulptur_v01.pdf`, label: 'Projektdokumentation' }
  ]
};

const portfolioProjects = {
  'beasteater_poster_web.jpg': {
    items: [
      { type: 'image', src: `${portfolioRoot}/DIGITAL/beasteater_poster_web.jpg`, label: 'Plakat' },
      { type: 'image', src: `${portfolioRoot}/DIGITAL/beasteater_poster_02_web.jpg`, label: 'Plakat',
        description: 'Das ist ein weiteres Plakat, diesmal mit einer Figur und senkrechter Schrift in Grüntönen.' },
      { type: 'image', src: `${portfolioRoot}/DIGITAL/beasteater_poster_03_web.jpg`, label: 'Plakat',
        description: 'Für dieses Plakat habe ich Figuren, Schrift und grafische Elemente in Gelb und Grün kombiniert.' }
    ]
  },
  './assets/roisin_greyscale_v15_web.webp': {
    items: [
      { type: 'image', src: `${portfolioRoot}/DIGITAL/roisin_grayscale_skizze.jpeg`, label: 'Skizze' },
      { type: 'image', src: `${portfolioRoot}/DIGITAL/roisin_grayscale_lineart.png`, label: 'Lineart', background: '#fff' },
      { type: 'image', src: './assets/roisin_greyscale_grey_web.webp', label: 'Graustufen' }
    ]
  },
  'roisin_tiger_final_digital.jpg': {
    title: 'Tiger',
    items: [
      { type: 'image', src: './assets/roisin_tiger_skizze_web.webp', label: 'Skizze' },
      { type: 'image', src: './assets/roisin_tiger_farbe_web.webp', label: 'Farbe' },
      { type: 'image', src: './assets/roisin_tiger_schatten_web.webp', label: 'Schatten' }
    ]
  },
  'roisin_charakterdesign_final.png': {
    title: 'Charakterdesign',
    items: [
      { type: 'image', src: `${portfolioRoot}/DIGITAL/roisin_charakterdesign.png`, label: 'Weitere Version' }
    ]
  },
  'stargirl_final_colour_web.mp4': {
    title: 'Stargirl Animation',
    items: [
      { type: 'video', src: `${portfolioRoot}/DIGITAL/stargirl_rough_animation_web.mp4`, label: 'Rohanimation' },
      { type: 'video', src: './models/stargirl_final_web.mp4', label: 'Weitere Version' }
    ]
  },
  './red_pikmin_idle_web.mp4': {
    items: [
      { type: 'video', src: './red_pikmin_idle_web.mp4', label: 'Roter Pikmin' },
      { type: 'video', src: './yellow_pikmin_idle_web.mp4', label: 'Gelber Pikmin' },
      { type: 'video', src: './models/blue_pikmin_idle_web.mp4', label: 'Blauer Pikmin' }
    ]
  },
  'women_portrait_four_web.png': {
    items: [
      { type: 'image', src: `${portfolioRoot}/ANALOG/woman_portrait_left_web.png`, label: 'Einzelzeichnung 1' },
      { type: 'image', src: `${portfolioRoot}/ANALOG/woman_portrait_right_web.png`, label: 'Einzelzeichnung 2' }
    ]
  },
  './assets/pikmin_lampe_cover.jpg': {
    items: [
      { type: 'image', src: './assets/pikmin_lampe_cover.jpg', label: 'Titelbild' },
      { type: 'image', src: `${portfolioRoot}/3D/WhatsApp Image 2026-09-27 at 22.29.40.jpeg`, label: 'Prozess 1' },
      { type: 'image', src: `${portfolioRoot}/3D/pikmin_prozess03 copy.jpeg`, label: 'Prozess 2' },
      { type: 'image', src: `${portfolioRoot}/3D/pikmin_prozess05 copy.jpeg`, label: 'Prozess 3' },
      { type: 'pdf', src: `${portfolioRoot}/3D/roisin_papierlampe_v01.pdf`, label: 'Projektdokumentation' }
    ]
  },
  'hund_skulptur_final_02.jpg': dogProject
};

const digital3DAnimations = [
  ['./models/roisin_runaway_mars_argo_web.mp4', '3D Charakter Animation', '3D Animation',
    'Diese 3D-Charakteranimation habe ich mit Blender, VRoid und CapCut erstellt.'],
  ['./models/roisin_wind_3d_animation_web.mp4', 'Wind Animation', '3D Animation',
    'Für diese 3D-Animation mit Wind habe ich Blender und VRoid benutzt.']
];

const portfolioCategories = [
  {
    key: 'digital',
    name: 'Digital',
    subtitle: 'Illustration · Poster · Animation',
    items: [
      ['roisin_charakterdesign_final.png', 'Charakterdesign', 'Digitale Zeichnung',
        'Für dieses Charakterdesign habe ich meine Figur von vorne und von der Seite gezeichnet. Hier ist auch eine andere Farbversion zu sehen.'],
      ['roisin_tiger_final_digital.jpg', 'Tiger', 'Digitale Zeichnung',
        'Hier habe ich einen Tiger digital gezeichnet. Neben dem fertigen Bild sieht man auch meine Skizze und die Schritte mit Farbe und Schatten.'],
      ['./assets/roisin_greyscale_v15_web.webp', 'Greyscale', 'Digitale Zeichnung',
        'Bei dieser digitalen Zeichnung habe ich eine Figur und ihre Umgebung gestaltet. Hier sieht man den Weg von der Skizze über die Lineart und Graustufen bis zum fertigen Bild.'],
      ['roisin_digitale_charakterzeichnung_web.jpg', 'Digitale Charakterzeichnung', 'Digitale Zeichnung',
        'Diese Figur habe ich digital in Grüntönen gezeichnet. Sie sitzt und hat einen gestreiften Schwanz.'],
      ['roisin_stilleben_digital.jpg', 'Stillleben', 'Mit Procreate erstellt',
        'Für diese Zeichnung habe ich verschiedene Gegenstände aus meinem Zimmer in Procreate gezeichnet.'],
      ['hina_luna_drawing_final_web.jpg', 'Charakterzeichnung', 'Mit IbisPaint X erstellt',
        'Diese beiden Figuren habe ich in Ibis Paint X gezeichnet und dabei vor allem Blau- und Violetttöne verwendet.'],
      ['beasteater_poster_web.jpg', 'Beasteater Plakat', 'Mit IbisPaint X erstellt',
        'Für dieses Plakat habe ich eine Zeichnung mit sich wiederholender Schrift kombiniert und Grün und Schwarz verwendet.'],
      ['stargirl_final_colour_web.mp4', 'Stargirl Animation', 'Mit IbisPaint X erstellt',
        'Für diese Animation habe ich einen Charakter und einen leuchtenden Stern gestaltet. Hier sieht man auch die Rohanimation und eine weitere Version.'],
      ['./red_pikmin_idle_web.mp4', 'Pikmin Animationen', 'Animation',
        'Ich habe für den roten, gelben und blauen Pikmin jeweils eine Idle-Animation mit Ibis Paint X und Alight Motion erstellt.'],
      ['./models/roisin_essen_animation_web.mp4', 'Essen Animation', 'Animation',
        'Diese Animation mit Essen und einem Teller habe ich mit Ibis Paint X und Alight Motion erstellt.'],
      ['./models/roisin_walk_cycle_web.mp4', 'Walk Cycle', 'Animation',
        'Für diesen Walk Cycle habe ich eine Figur vor einem nächtlichen Hintergrund animiert.'],
      ...digital3DAnimations
    ]
  },
  {
    key: 'analog',
    name: 'Analog',
    subtitle: 'Zeichnung · Aquarell · Bleistift',
    items: [
      ['roisin_stilleben_auqarell_web.jpg', 'Stillleben Aquarell', 'Aquarell',
        'Dieses Stillleben habe ich mit Aquarellfarben gemalt. Die verschiedenen Gegenstände stehen vor einem pinken Hintergrund.'],
      ['roisin-wasserfarbe-zeichnung-01.jpg', 'Wasserfarbe', 'Aquarell',
        'Hier habe ich eine sitzende Figur mit Wasserfarbe in verschiedenen Blautönen gemalt.'],
      ['roisin_charakterzeichnung.jpg', 'Charakterzeichnung', 'Zeichnung',
        'Für diese Charakterzeichnung habe ich eine Figur im Profil mit einer Kopfbedeckung und technischen Details gezeichnet.'],
      ['roisin_farbstiftzeichnung_web.jpg', 'Farbstiftzeichnung', 'Farbstift',
        'Hier habe ich zwei Figuren mit Farbstiften gezeichnet und hauptsächlich Gelb-, Orange- und Rottöne verwendet.'],
      ['roisin_haende_zeichnung.jpg', 'Hände', 'Zeichnung',
        'Für diese Zeichnung habe ich zwei Hände gezeichnet, die sich berühren. Dabei habe ich mit Linien und Schattierungen gearbeitet.'],
      ['roisin_robot_katze.jpg', 'Robot Katze', 'Zeichnung',
        'Hier habe ich eine Katze mit mechanischen Details gezeichnet und sie so mit einem Roboter verbunden.'],
      ['chappellroan_pencil.png', 'Chappell Roan', 'Bleistiftzeichnung',
        'Das ist meine Bleistiftzeichnung von Chappell Roan. Ich habe viele Details in die Figur und ihre Kleidung gezeichnet.'],
      ['girl_drawing_pencil.jpeg', 'Girl with Crocodile', 'Bleistiftzeichnung',
        'Hier habe ich eine Figur mit einem Krokodil in Bleistift gezeichnet und Kleidung, Haare und Gesicht ausgearbeitet.'],
      ['roisin_perpsektive_zeichnung.jpg', 'Perspektive', 'Bleistiftzeichnung',
        'In dieser Bleistiftzeichnung habe ich eine sitzende Figur in einem Raum gezeichnet und mit Perspektive gearbeitet.'],
      ['roisin-hund-zeichnung-01.jpg', 'Hund', 'Zeichnung',
        'Für diese Zeichnung habe ich einen sitzenden Hund mit Flügeln gezeichnet und die Federn ausgearbeitet.'],
      ['roisin-lippen-zeichnung-01.jpg', 'Lippen', 'Zeichnung',
        'Hier habe ich Lippen gezeichnet und mit Licht und Schatten an ihrer Form gearbeitet.'],
      ['roisin-nase-zeichnung-01.jpg', 'Nase', 'Zeichnung',
        'Bei dieser Zeichnung habe ich eine Nase gezeichnet und mich auf ihre Form und Schattierung konzentriert.'],
      ['women_portrait_four_web.png', 'Portraits', 'Portrait',
        'Hier habe ich Figuren in verschiedenen sitzenden Posen und aus unterschiedlichen Perspektiven gezeichnet.']
    ]
  },
  {
    key: '3D',
    name: '3D',
    subtitle: 'Skulptur · Ton · Fimo',
    items: [
      ['hund_skulptur_final_02.jpg', 'Hund Skulptur', 'Skulptur',
        'Für dieses Projekt habe ich eine Skulptur von einem sitzenden Hund mit Flügeln gestaltet. Hier sieht man sie aus verschiedenen Blickwinkeln, Bilder vom Prozess und meine Projektdokumentation.'],
      ['./assets/pikmin_lampe_cover.jpg', 'Pikmin Lampe', 'Papierlampe',
        'Für dieses Projekt habe ich eine Papierlampe in Form eines Pikmin gestaltet. Hier sieht man Bilder vom Prozess und meine Projektdokumentation.'],
      ['roisin_ton_figur_3D.webp', 'Tonfigur', 'Ton',
        'Diese kleine Figur habe ich aus Ton gestaltet und bemalt. Sie hat einen weit geöffneten Mund und streckt die Zunge heraus.'],
      ['fimo_stars_3D.jpeg', 'Fimo Sterne', 'Fimo',
        'Diese Sterne habe ich aus Fimo gemacht und bemalt. Jeder hat seinen eigenen Gesichtsausdruck.']
    ]
  }
].map((category) => ({
  ...category,
  gallery: category.items.map(([file, title, detail, description]) => {
    const path = file.startsWith('./') ? file : `${portfolioRoot}/${category.key.toUpperCase()}/${file}`;
    const project = { title, description, items: [], ...portfolioProjects[file] };
    const videoConfig = ipadGalleryItems.find((entry) => entry.src === path && entry.chromaKey);
    return file.endsWith('.mp4')
      ? { type: 'video', title, detail, src: path, project, chromaKey: videoConfig?.chromaKey, chromaCrop: videoConfig?.chromaCrop, chromaErode: videoConfig?.chromaErode }
      : { type: 'image', title, detail, image: path, project };
  })
}));

function setupKeyedPortfolioVideo(video, canvas, entry) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create canvas for transparent animation');
  let frameId = 0;
  const render = () => {
    if (!video.isConnected) {
      video.pause();
      return;
    }
    if (video.readyState >= 2 && video.videoWidth) {
      const width = Math.min(video.videoWidth, 480);
      const height = Math.round(width * video.videoHeight / video.videoWidth);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawKeyedVideoFrame(video, canvas, context, entry.chromaKey, entry.chromaErode, entry.chromaCrop);
    }
    if (!video.paused) frameId = requestAnimationFrame(render);
  };
  video.addEventListener('loadeddata', () => { if (video.paused) render(); });
  video.addEventListener('seeked', () => { if (video.paused) render(); });
  video.addEventListener('play', () => {
    cancelAnimationFrame(frameId);
    render();
  });
  video.addEventListener('pause', () => cancelAnimationFrame(frameId));
}

const projectVideoIcons = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
  sound: '<path d="M4 10v4h4l5 4V6l-5 4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  muted: '<path d="M4 10v4h4l5 4V6l-5 4H4z"/><path d="m17 10 4 4m0-4-4 4"/>'
};

function setProjectVideoIcon(button, icon, label) {
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${projectVideoIcons[icon]}</svg>`;
  button.setAttribute('aria-label', translate(label));
  button.title = translate(label);
}

function createProjectVideo(entry) {
  const container = document.createElement('div');
  container.className = 'artwork-project-video';
  const video = document.createElement('video');
  video.loop = true;
  video.playsInline = true;
  video.muted = true;
  video.preload = entry.chromaKey ? 'auto' : 'metadata';
  video.setAttribute('aria-label', translate(entry.label));
  if (entry.chromaKey) {
    video.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', translate(entry.label));
    setupKeyedPortfolioVideo(video, canvas, entry);
    container.append(canvas);
  }
  const controls = document.createElement('div');
  controls.className = 'artwork-project-video-controls';
  const play = document.createElement('button');
  play.type = 'button';
  setProjectVideoIcon(play, 'play', 'Abspielen');
  const mute = document.createElement('button');
  mute.type = 'button';
  setProjectVideoIcon(mute, 'muted', 'Ton an');
  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '0';
  seek.step = '0.01';
  seek.value = '0';
  seek.setAttribute('aria-label', translate('Position im Video'));
  const error = document.createElement('span');
  error.setAttribute('role', 'status');
  video.addEventListener('loadedmetadata', () => { seek.max = String(video.duration); });
  video.addEventListener('timeupdate', () => { seek.value = String(video.currentTime); });
  video.addEventListener('play', () => {
    error.textContent = '';
    setProjectVideoIcon(play, 'pause', 'Pause');
  });
  video.addEventListener('pause', () => setProjectVideoIcon(play, 'play', 'Abspielen'));
  video.addEventListener('volumechange', () => {
    const silent = video.muted || video.volume === 0;
    setProjectVideoIcon(mute, silent ? 'muted' : 'sound', silent ? 'Ton an' : 'Ton aus');
  });
  video.addEventListener('error', () => { error.textContent = translate('Video konnte nicht geladen werden.'); });
  play.addEventListener('click', () => {
    if (!video.paused) {
      container.dataset.userPaused = 'true';
      video.pause();
    } else {
      delete container.dataset.userPaused;
      video.play().catch((err) => {
        error.textContent = translate('Video konnte nicht abgespielt werden.');
        console.error('Portfolio video playback failed:', err);
      });
    }
  });
  mute.addEventListener('click', () => {
    video.muted = !video.muted;
  });
  seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
  video.src = entry.src;
  controls.append(play, seek, mute, error);
  container.append(video, controls);
  return container;
}

function showArtworkProject(index) {
  if (artworkViewer.classList.contains('is-project-closing')) return;
  const item = activeArtworkItems[index];
  if (!item?.project) {
    console.error('Cannot open portfolio project:', index);
    return;
  }
  activeArtworkIndex = index;

  const currentSrc = item.type === 'video' ? item.src : item.image;
  const items = [
    { type: item.type, src: currentSrc, label: item.project.items.find((entry) => entry.src === currentSrc)?.label ?? 'Final', chromaKey: item.chromaKey, chromaCrop: item.chromaCrop, chromaErode: item.chromaErode },
    ...item.project.items.filter((entry) => entry.src !== currentSrc).map((entry) => {
      const config = ipadGalleryItems.find((video) => video.src === entry.src && video.chromaKey);
      return config ? { ...entry, chromaKey: config.chromaKey, chromaCrop: config.chromaCrop, chromaErode: config.chromaErode } : entry;
    })
  ];
  artworkProjectTitle.textContent = translate(item.project.title);
  artworkProjectDescription.textContent = translate(item.project.description);
  projectVideoObserver?.disconnect();
  artworkProjectItems.querySelectorAll('video').forEach((video) => video.pause());
  artworkProjectItems.replaceChildren(...items.map((entry) => {
    const section = document.createElement('section');
    section.className = 'artwork-project-item';
    const heading = document.createElement('h3');
    heading.textContent = translate(entry.label);
    section.append(heading);

    if (entry.description) {
      const description = document.createElement('p');
      description.className = 'artwork-project-item-description';
      description.textContent = translate(entry.description);
      section.append(description);
    }

    if (entry.type === 'pdf') {
      const frame = document.createElement('iframe');
      frame.src = entry.src;
      frame.title = `${translate(item.project.title)}: ${translate(entry.label)}`;
      frame.loading = 'lazy';
      const link = document.createElement('a');
      link.href = entry.src;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = translate('PDF in neuem Tab öffnen');
      section.append(frame, link);
    } else if (entry.type === 'video') {
      section.append(createProjectVideo(entry));
    } else {
      const media = document.createElement('img');
      media.src = entry.src;
      media.alt = `${translate(item.project.title)}: ${translate(entry.label)}`;
      media.loading = 'lazy';
      if (entry.background) media.style.backgroundColor = entry.background;
      section.append(media);
    }
    return section;
  }));
  artworkViewerFigure.hidden = true;
  artworkProject.hidden = false;
  artworkViewer.classList.add('is-project');
  artworkProjectPrevious.disabled = index === 0;
  artworkProjectNext.disabled = index === activeArtworkItems.length - 1;
  artworkProjectCount.textContent = `${index + 1} / ${activeArtworkItems.length}`;
  if (!artworkViewer.open) {
    artworkViewer.classList.add('is-project-opening');
    artworkViewer.showModal();
  }
  artworkViewer.scrollTop = 0;
  artworkProjectBack.focus();
  projectVideoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const container = entry.target;
      const video = container.querySelector('video');
      if (entry.isIntersecting && !container.dataset.userPaused) {
        video.play().catch((error) => {
          if (!container.isConnected || artworkViewer.classList.contains('is-project-closing')) return;
          container.querySelector('[role="status"]').textContent = translate('Automatische Wiedergabe nicht möglich. Bitte auf Abspielen klicken.');
          console.warn('Portfolio video autoplay failed:', error);
        });
      } else if (!entry.isIntersecting) {
        video.pause();
      }
    }
  }, { root: artworkViewer, threshold: 0.1 });
  artworkProjectItems.querySelectorAll('.artwork-project-video').forEach((container) => projectVideoObserver.observe(container));
}

function switchArtworkProject(index) {
  if (projectTransition || artworkViewer.classList.contains('is-project-closing') ||
      index < 0 || index >= activeArtworkItems.length || index === activeArtworkIndex) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showArtworkProject(index);
    return;
  }

  const direction = index > activeArtworkIndex ? 1 : -1;
  artworkViewer.classList.remove('is-project-opening');
  const outgoing = artworkProject.animate(
    [
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: `translateX(${-direction * 36}px)` }
    ],
    { duration: 200, easing: 'ease-in', fill: 'forwards' }
  );
  projectTransition = outgoing;
  outgoing.onfinish = () => {
    showArtworkProject(index);
    outgoing.cancel();
    const incoming = artworkProject.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 36}px)` },
        { opacity: 1, transform: 'translateX(0)' }
      ],
      { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
    projectTransition = incoming;
    incoming.onfinish = () => { projectTransition = null; };
  };
}

artworkProjectBack.addEventListener('click', closeArtworkViewer);
artworkProjectPrevious.addEventListener('click', () => switchArtworkProject(activeArtworkIndex - 1));
artworkProjectNext.addEventListener('click', () => switchArtworkProject(activeArtworkIndex + 1));

const portfolioOverlay = document.getElementById('portfolio-overlay');
const portfolioCards = document.getElementById('portfolio-cards');
const portfolioGallery = document.getElementById('portfolio-gallery');
const portfolioGrid = document.getElementById('portfolio-grid');
const portfolioTitle = portfolioOverlay?.querySelector('.portfolio-title');

function renderPortfolioCards() {
  portfolioCards.replaceChildren(
    ...portfolioCategories.map((category, index) => {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'portfolio-card';
      link.style.setProperty('--i', index + 1);

      const parts = [
        ['portfolio-card-number', String(index + 1).padStart(2, '0')],
        ['portfolio-card-name', category.name],
        ['portfolio-card-arrow', '\u2197'],
        ['portfolio-card-sub', category.subtitle]
      ].map(([className, text]) => {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = translate(text);
        return span;
      });

      link.append(...parts);
      link.addEventListener('click', () => showPortfolioCategory(category));
      return link;
    })
  );
}

function showPortfolioCategory(category) {
  const inGallery = Boolean(category);
  const wasGallery = portfolioOverlay.classList.contains('is-gallery');
  portfolioOverlay.classList.toggle('is-gallery', inGallery);
  portfolioOverlay.classList.toggle('is-returning', !inGallery && wasGallery);
  portfolioCards.hidden = inGallery;
  portfolioGallery.hidden = !inGallery;
  portfolioTitle.textContent = inGallery ? translate(category.name) : 'Portfolio';
  portfolioOverlay.scrollTop = 0;

  if (!inGallery) {
    portfolioGrid.replaceChildren();
    if (wasGallery) {
      portfolioOverlay.classList.add('is-reentering');
      void portfolioOverlay.offsetWidth;
      portfolioOverlay.classList.remove('is-reentering');
    }
    return;
  }

  portfolioGrid.replaceChildren(
    ...category.gallery.map((item, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'portfolio-tile';
      tile.style.setProperty('--i', Math.min(index, 12));
      tile.setAttribute('aria-label', `${translate(item.title)}, ${translate(item.detail)}`);

      let media;
      if (item.type === 'video' && item.chromaKey) {
        const video = document.createElement('video');
        video.hidden = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        media = document.createElement('canvas');
        media.width = 360;
        media.height = 450;
        media.setAttribute('aria-hidden', 'true');
        setupKeyedPortfolioVideo(video, media, item);
        video.src = item.src;
        tile.append(video);
        tile.addEventListener('pointerenter', () => {
          video.play().catch((error) => console.warn('Portfolio preview could not play:', error));
        });
        tile.addEventListener('pointerleave', () => video.pause());
      } else if (item.type === 'video') {
        media = document.createElement('video');
        media.src = `${item.src}#t=0.5`;
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        tile.addEventListener('pointerenter', () => media.play().catch(() => {}));
        tile.addEventListener('pointerleave', () => media.pause());
      } else {
        media = document.createElement('img');
        media.src = item.image;
        media.alt = translate(item.title);
        media.loading = 'lazy';
      }
      tile.append(media);

      tile.addEventListener('click', () => {
        activeArtworkItems = category.gallery;
        activeArtworkIndex = index;
        showArtworkProject(index);
      });
      return tile;
    })
  );
}

function resetPortfolioView() {
  showPortfolioCategory(null);
}

document.getElementById('portfolio-back')?.addEventListener('click', resetPortfolioView);
renderPortfolioCards();

const halftoneCanvas = document.getElementById('about-halftone');
const halftoneCtx = halftoneCanvas?.getContext('2d');
const contactHalftoneCanvas = document.getElementById('contact-halftone');
const contactHalftoneCtx = contactHalftoneCanvas?.getContext('2d');
const introHalftoneCanvas = document.getElementById('intro-halftone');
const introHalftoneCtx = introHalftoneCanvas?.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const HALFTONE_SPACING = 18;

function drawHalftonePattern(canvas, ctx, time, dotScale = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, height, width, 0);
  gradient.addColorStop(0, 'rgba(139, 92, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 71, 200, 0.4)');
  ctx.fillStyle = gradient;
  const t = time * 0.0004;
  for (let row = 0, y = HALFTONE_SPACING / 2; y < height; row++, y += HALFTONE_SPACING) {
    for (let x = (row % 2) * (HALFTONE_SPACING / 2); x < width; x += HALFTONE_SPACING) {
      const wave = Math.sin(x * 0.012 + t * 2) + Math.sin(y * 0.01 - t * 1.6) + Math.sin((x + y) * 0.008 + t);
      const radius = Math.max(0, (wave + 1.2) / 4.2) * HALFTONE_SPACING * 0.38 * dotScale;
      if (radius < 0.6) continue;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHalftone(time) {
  requestAnimationFrame(drawHalftone);
  if (halftoneCtx && document.getElementById('about-overlay').classList.contains('is-open')) {
    drawHalftonePattern(halftoneCanvas, halftoneCtx, time);
  }
  if (contactHalftoneCtx && document.getElementById('contact-overlay').classList.contains('is-open')) {
    drawHalftonePattern(contactHalftoneCanvas, contactHalftoneCtx, time);
  }
  if (introHalftoneCtx && introGuide && !introGuide.hidden) {
    drawHalftonePattern(introHalftoneCanvas, introHalftoneCtx, reducedMotion.matches ? 0 : time, 0.6);
  }
}
requestAnimationFrame(drawHalftone);
artworkViewerPrevious?.addEventListener('click', () => {
  showArtworkSlide(activeArtworkIndex - 1, -1);
});

artworkViewerNext?.addEventListener('click', () => {
  showArtworkSlide(activeArtworkIndex + 1, 1);
});

artworkViewer?.addEventListener('keydown', (event) => {
  if (activeArtworkItems.length < 2) return;
  if (!artworkProject.hidden) {
    if (event.target.closest('video, iframe, input')) return;
    if (event.key === 'ArrowLeft' && activeArtworkIndex > 0) {
      event.preventDefault();
      switchArtworkProject(activeArtworkIndex - 1);
    } else if (event.key === 'ArrowRight' && activeArtworkIndex < activeArtworkItems.length - 1) {
      event.preventDefault();
      switchArtworkProject(activeArtworkIndex + 1);
    }
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showArtworkSlide(activeArtworkIndex - 1, -1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    showArtworkSlide(activeArtworkIndex + 1, 1);
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (characterAboutView) return;
  setHoveredDrawing(getFloorArtworkAtPointer(event));
  updateLavaLampHover(event);
  updateCharacterHover(event);
  if (isCharacterHovered || hoveredDrawing || isLavaLampHovered) {
    renderer.domElement.style.cursor = 'pointer';
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  pointerDownPosition = null;
  setHoveredDrawing(null);
  isLavaLampHovered = false;
  isCharacterHovered = false;
  renderer.domElement.style.cursor = 'grab';
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || characterAboutView) return;
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  updateCharacterHover(event);
  if (!pointerDownPosition) return;

  const distance = Math.hypot(
    event.clientX - pointerDownPosition.x,
    event.clientY - pointerDownPosition.y
  );
  pointerDownPosition = null;

  if (distance > 6) return;

  if (isLavaLampAtPointer(event)) {
    roomWarmthTarget = roomWarmthTarget > 0.5 ? 0 : 1;
    return;
  }

  const drawing = getFloorArtworkAtPointer(event);
  if (drawing) {
    showFloorArtwork(drawing);
    return;
  }
  if (isCharacterHovered) openCharacterAbout();
});

document.getElementById('artwork-viewer-close')?.addEventListener('click', () => {
  closeArtworkViewer();
});

artworkViewer?.addEventListener('click', (event) => {
  if (event.target === artworkViewer) closeArtworkViewer();
});

artworkViewer?.addEventListener('cancel', (event) => {
  if (artworkViewer.classList.contains('is-project')) {
    event.preventDefault();
    closeArtworkViewer();
  }
});

artworkViewer?.addEventListener('animationend', (event) => {
  if (event.target !== artworkViewer) return;
  if (event.animationName === 'project-fade-in') {
    artworkViewer.classList.remove('is-project-opening');
  } else if (event.animationName === 'project-fade-out' && artworkViewer.open) {
    artworkViewer.close();
  }
});

artworkViewer?.addEventListener('close', () => {
  if (!artworkViewer.classList.contains('is-project')) clearRoomArtworkBlur();
  clearArtworkViewerImage();
});

// =====================================
// LOAD ROOM
// =====================================
loader.load(
  './models/roisin_website_room_07_baked.glb',

  (gltf) => {
    const room = gltf.scene;

    room.traverse((object) => {
      if (isOriginalBubble(object.name)) {
        object.visible = false;
        console.log('Hidden original bubble:', object.name);
      }
    });

    configureRoomMaterials(room, true);
    scene.add(room);
    initializeFloorArtwork(room);
    captureRoomWarmMaterials(room);
    
    const lavaLampParts = [];
    room.traverse((object) => {
      if (object.isMesh && /^(glass|Metal001)$/i.test(object.name)) {
        lavaLampClickTargets.push(object);
        lavaLampParts.push(object);
      }
    });

    room.updateMatrixWorld(true);

    // Parts are baked in world space, so pivot from the bottom centre of the lamp.
    if (lavaLampParts.length > 0) {
      const lampBounds = new THREE.Box3();
      for (const part of lavaLampParts) lampBounds.expandByObject(part);

      lavaLampPivot = new THREE.Group();
      lavaLampPivot.position.set(
        (lampBounds.min.x + lampBounds.max.x) / 2,
        lampBounds.min.y,
        (lampBounds.min.z + lampBounds.max.z) / 2
      );
      lavaLampPivot.userData.lampHeight = lampBounds.max.y - lampBounds.min.y;
      scene.add(lavaLampPivot);
      lavaLampPivot.updateMatrixWorld(true);
      for (const part of lavaLampParts) lavaLampPivot.attach(part);
      attachLavaBubblesToPivot();
    }

    const roomBounds = new THREE.Box3().setFromObject(room);
    const roomCenter = new THREE.Vector3();
    const roomSize = new THREE.Vector3();

    roomBounds.getCenter(roomCenter);
    roomBounds.getSize(roomSize);

    const maxSize = Math.max(
      roomSize.x,
      roomSize.y,
      roomSize.z
    );

    roomLightingScale = maxSize;
    updateCharacterRoomLight(vrm?.scene);

    if (lavaGlowLight) {
      lavaGlowLight.intensity = maxSize * maxSize * 0.0025;
      lavaGlowLight.distance = maxSize * 0.14;
    }

    const distance =
      (maxSize / 2) /
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      1.5;

    camera.position.set(
      roomCenter.x + distance * 0.65,
      roomCenter.y + roomSize.y * 0.25,
      roomCenter.z + distance
    );

    controls.target.copy(roomCenter);
    controls.maxDistance = camera.position.distanceTo(roomCenter) * 1.12;
    controls.update();

    camera.near = Math.max(maxSize / 1000, 0.01);
    camera.far = Math.max(maxSize * 100, 5000);
    camera.updateProjectionMatrix();
    roomCameraPosition.copy(camera.position);
    roomCameraTarget.copy(roomCenter);
    roomCameraReady = true;

    console.log('Room 06 loaded.');
    console.log('Room bounds:', roomBounds);
    updateStartupProgress('room', 1, true);
  },

  (progress) => {
    if (progress.total > 0) {
      updateStartupProgress('room', progress.loaded / progress.total);
      console.log(
        `Loading room: ${Math.round(
          progress.loaded / progress.total * 100
        )}%`
      );
    }
  },

  (error) => {
    console.error('Room failed to load:', error);
    updateStartupProgress('room', 1, true);
  }
);

// =====================================
// SITTING POSE
// =====================================
const sittingPose = {
  hips: [
    -2.1894266546309394e-8,
    1.5707963267948966,
    0
  ],

  spine: [
    1.0471975511965976,
    0,
    0
  ],

  chest: [
    0.3490658503988659,
    0,
    0
  ],

  upperChest: [
    0.3490658503988659,
    -1.9065901490061478e-8,
    0.005550147021341968
  ],

  neck: [0, 0, 0],

  leftShoulder: [
    -0.17453292519943295,
    -0.5235987755982988,
    0.17453292519943295
  ],

  leftUpperArm: [
    0.5235987755982988,
    -1.0471975511965976,
    -0.2617993877991494
  ],

  leftLowerArm: [
    0,
    -0.3490658503988659,
    1.2217304763960306
  ],

  leftHand: [
    -0.17453292519943295,
    0,
    -1.0557671178238899
  ],

  rightShoulder: [
    0.17453292519943295,
    0.5235987755982988,
    -0.17453292519943295
  ],

  rightUpperArm: [
    -0.3490658503988659,
    0.7853981633974483,
    0.26179938779943295
  ],

  rightLowerArm: [
    0.19198621771937624,
    1.8498744741887898,
    -0.08726646259971647
  ],

  rightHand: [
    -0.17453292519943295,
    0.3490658503988659,
    0.26179938779943295
  ],

  leftUpperLeg: [
    -1.0471975511965976,
    0,
    -0.06981317007977318
  ],

  leftLowerLeg: [
    1.5707963267948966,
    -0.2617993877991494,
    0
  ],

  leftFoot: [
    0.5235987755982988,
    -0.17453292519943295,
    0
  ],

  leftToes: [
    4.434041473147911e-10,
    4.390985094252513e-9,
    1.2981198451944932e-8
  ],

  rightUpperLeg: [
    -1.0471975511965976,
    0,
    0.05235987755982988
  ],

  rightLowerLeg: [
    1.7453292519943295,
    0,
    -0.17453292519943295
  ],

  rightFoot: [0, 0, 0],

  rightToes: [
    0.00014217266512815116,
    0.010428212579850854,
    -0.1336465630303155
  ]
};

function applySittingPose() {
  if (!vrm?.humanoid) return;

  for (const [boneName, angles] of Object.entries(sittingPose)) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);

    if (bone) {
      bone.rotation.set(...angles);
    } else {
      console.warn('Missing normalized VRM bone:', boneName);
    }
  }
}

let shoulderWorldMatrices = new Map();
const shoulderParentInverse = new THREE.Matrix4();
const shoulderLocalMatrix = new THREE.Matrix4();
const shoulderHoverTransform = new THREE.Matrix4();
const shoulderHoverWorldMatrix = new THREE.Matrix4();

function captureShoulderWorldMatrices() {
  shoulderWorldMatrices.clear();

  for (const boneName of ['leftShoulder', 'rightShoulder']) {
    const shoulder = getBone(boneName);

    if (shoulder?.parent) {
      shoulder.updateWorldMatrix(true, false);
      shoulderWorldMatrices.set(shoulder, shoulder.matrixWorld.clone());
    }
  }
}

function keepShouldersInPlace() {
  vrm.scene.updateMatrixWorld(true);

  const scale = 1 + characterHoverAmount * 0.04;
  shoulderHoverTransform.makeScale(scale, scale, scale);
  shoulderHoverTransform.setPosition(
    characterScaleAnchor.x * (1 - scale),
    characterScaleAnchor.y * (1 - scale),
    characterScaleAnchor.z * (1 - scale)
  );
  for (const [shoulder, worldMatrix] of shoulderWorldMatrices) {
    if (!shoulder.parent) continue;

    shoulderParentInverse.copy(shoulder.parent.matrixWorld).invert();
    shoulderHoverWorldMatrix.multiplyMatrices(shoulderHoverTransform, worldMatrix);
    shoulderLocalMatrix.multiplyMatrices(shoulderParentInverse, shoulderHoverWorldMatrix);
    shoulderLocalMatrix.decompose(
      shoulder.position,
      shoulder.quaternion,
      shoulder.scale
    );
  }

  vrm.scene.updateMatrixWorld(true);
}

const hairSpringBoneTuning = {
  stiffnessMultiplier: 5,
  gravityPowerMultiplier: 1.25,
  dragForceMultiplier: 0.3
};

function tuneHairSpringBones(springBoneManager) {
  const joints = [...(springBoneManager?.joints ?? [])];
  const hairJoints = joints.filter((joint) => /hair/i.test(joint.bone.name));

  if (hairJoints.length === 0) {
    console.warn(
      'No hair spring-bone joints matched. Available joints:',
      joints.map((joint) => joint.bone.name)
    );
    return;
  }

  for (const joint of hairJoints) {
    joint.settings.stiffness *= hairSpringBoneTuning.stiffnessMultiplier;
    joint.settings.gravityPower *= hairSpringBoneTuning.gravityPowerMultiplier;
    joint.settings.dragForce = THREE.MathUtils.clamp(
      joint.settings.dragForce * hairSpringBoneTuning.dragForceMultiplier,
      0,
      1
    );
  }

  console.log(
    'Tuned hair spring-bone joints:',
    hairJoints.map((joint) => joint.bone.name)
  );
}

function disableChestSpringBones(springBoneManager) {
  const chestJoints = [...(springBoneManager?.joints ?? [])]
    .filter((joint) => /^J_Sec_[LR]_Bust\d+$/i.test(joint.bone.name));

  for (const joint of chestJoints) {
    springBoneManager.deleteJoint(joint);
  }

  console.log(
    'Disabled chest spring-bone joints:',
    chestJoints.map((joint) => joint.bone.name)
  );
}

// =====================================
// LOAD VRM CHARACTER
// =====================================
characterLoader.load(
  './models/roisin_3d_model.vrm',

  (gltf) => {
    vrm = gltf.userData.vrm;

    if (!vrm) {
      console.error('No VRM was found in the loaded character file.');
      updateStartupProgress('character', 1, true);
      return;
    }

    tintCharacterBlue(vrm.materials);
    captureCharacterWarmMaterials(vrm.materials);

    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.removeUnnecessaryJoints(vrm.scene);

    vrm.scene.traverse((object) => {
      object.frustumCulled = false;

      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    // CHARACTER POSITION
    // Adjust these values later to line her up with the chair.
    vrm.scene.position.set ( 51.5, -5, -45);

    vrm.scene.rotation.set(
      0,
      0,
      1.4154668974121902
    );

    vrm.scene.scale.setScalar(41.082);
    disableChestSpringBones(vrm.springBoneManager);
    tuneHairSpringBones(vrm.springBoneManager);

    scene.add(vrm.scene);
    updateCharacterRoomLight(vrm.scene);

    // Apply the pose after loading the VRM.
    applySittingPose();
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    if (head) {
      headRestRotation.copy(head.rotation);
      headRestRotationCaptured = true;
    }
    vrm.scene.updateMatrixWorld(true);
    captureShoulderWorldMatrices();
    characterBasePosition.copy(vrm.scene.position);
    characterBaseScale = vrm.scene.scale.x;
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) hips.getWorldPosition(characterScaleAnchor);
    else characterScaleAnchor.copy(characterBasePosition);
    const neck = vrm.humanoid.getNormalizedBoneNode('neck');
    if (head && neck) {
      const headPosition = head.getWorldPosition(new THREE.Vector3());
      const neckPosition = neck.getWorldPosition(new THREE.Vector3());
      const headSize = headPosition.distanceTo(neckPosition);
      characterHeadHoverSphere.center.copy(headPosition).addScaledVector(
        headPosition.sub(neckPosition).normalize(), headSize * 0.7
      );
      characterHeadHoverSphere.radius = headSize * 2.8;
    }

    // This model uses the down range for upward cursor movement and vice versa.
    const eyeApplier = vrm.lookAt?.applier;
    if (eyeApplier?.rangeMapHorizontalInner) eyeApplier.rangeMapHorizontalInner.outputScale *= 2.5;
    if (eyeApplier?.rangeMapHorizontalOuter) eyeApplier.rangeMapHorizontalOuter.outputScale *= 2.5;
    if (eyeApplier?.rangeMapVerticalUp) eyeApplier.rangeMapVerticalUp.outputScale *= 3;
    if (eyeApplier?.rangeMapVerticalDown) eyeApplier.rangeMapVerticalDown.outputScale *= 1.5;
    // Keep these available for optional browser-console adjustments.
    window.vrmCharacter = vrm;
    window.sittingPose = sittingPose;
    window.applySittingPose = applySittingPose;
    window.characterArmature = {};

    for (const boneName of Object.keys(sittingPose)) {
      const bone = vrm.humanoid.getNormalizedBoneNode(boneName);

      if (bone) {
        window.characterArmature[boneName] = bone;
      }
    }

    vrm.scene.updateMatrixWorld(true);

    const characterBounds = new THREE.Box3().setFromObject(vrm.scene);
    const characterSize = new THREE.Vector3();

    characterBounds.getSize(characterSize);

    console.log('VRM character loaded with sitting pose.');
    console.log('Character armature:', window.characterArmature);
    console.log('CHARACTER SIZE:', characterSize);
    console.log('CHARACTER BOUNDS:', characterBounds);
    console.log('CHARACTER SCALE:', vrm.scene.scale);
    updateStartupProgress('character', 1, true);
  },

  (progress) => {
    if (progress.total > 0) {
      updateStartupProgress('character', progress.loaded / progress.total);
      console.log(
        `Loading character: ${Math.round(
          progress.loaded / progress.total * 100
        )}%`
      );
    }
  },

  (error) => {
    console.error('VRM character failed to load:', error);
    updateStartupProgress('character', 1, true);
  }
);

// =====================================
// MOUSE-FOLLOWING HEAD
// =====================================
const mouse = new THREE.Vector2(0, 0);
const lookTarget = new THREE.Vector3();
const mouseHeadPosition = new THREE.Vector3();
const mouseHeadNdc = new THREE.Vector3();
const characterHoverPointer = new THREE.Vector2();
const characterHoverRaycaster = new THREE.Raycaster();
const characterHoverSphere = new THREE.Sphere();
const cameraLookTarget = new THREE.Vector3();
let headLookX = 0;
let headLookY = 0;
let characterCameraLookWeight = 0;

function updateCharacterHover(event) {
  if (!vrm || introState !== 'exploring' || characterAboutView || event.buttons !== 0 || artworkViewer?.open || aboutLiquifyTarget) {
    isCharacterHovered = false;
    return;
  }

  const bounds = renderer.domElement.getBoundingClientRect();
  characterHoverPointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  characterHoverRaycaster.setFromCamera(characterHoverPointer, camera);
  characterHoverSphere.copy(characterHeadHoverSphere);
  characterHoverSphere.radius *= isCharacterHovered ? 1.2 : 1;
  isCharacterHovered = (characterHoverSphere.radius > 0 &&
    characterHoverRaycaster.ray.intersectsSphere(characterHoverSphere)) ||
    characterHoverRaycaster.intersectObject(vrm.scene, true).length > 0;
}

window.addEventListener('pointermove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

function getBone(name) {
  if (!vrm?.humanoid) return null;

  return vrm.humanoid.getNormalizedBoneNode(name);
}

function updateMouseLook(delta) {
  if (!vrm) return;
  const introCameraTracking = introState !== 'exploring';
  const cameraTracking = introCameraTracking || isCharacterHoverActive() ||
    (characterAboutView && !characterAboutTransition?.returning);
  const headBone = getBone('head');
  characterCameraLookWeight = THREE.MathUtils.damp(
    characterCameraLookWeight, cameraTracking ? 1 : 0, 7, delta
  );

  // Cursor offset from her head on screen sets the look angles, so over her face means straight ahead.
  let pointerYaw = 0;
  let pointerPitch = 0;

  if (!introCameraTracking && headBone) {
    headBone.getWorldPosition(mouseHeadPosition);
    mouseHeadNdc.copy(mouseHeadPosition).project(camera);

    pointerYaw = 2.1 * Math.tanh((mouse.x - mouseHeadNdc.x) * 1.2);
    const offsetY = mouse.y - mouseHeadNdc.y;
    // Keep the eye target's upward movement restrained.
    pointerPitch = Math.tanh(offsetY * 1.2) * (offsetY > 0 ? 0.55 : 1.1);

    const parentMatrix = headBone.parent?.matrixWorld;
    lookTarget.set(
      Math.sin(pointerYaw) * Math.cos(pointerPitch),
      Math.sin(pointerPitch),
      Math.cos(pointerYaw) * Math.cos(pointerPitch)
    );
    if (parentMatrix) lookTarget.transformDirection(parentMatrix);
    lookTarget.multiplyScalar(roomLightingScale).add(mouseHeadPosition);
  }

  // EYES
  if (vrm.lookAt) {
    if (introCameraTracking || !headBone) {
      lookTarget.copy(camera.position);
    } else {
      cameraLookTarget.copy(camera.position).sub(mouseHeadPosition)
        .setLength(roomLightingScale).add(mouseHeadPosition);
      lookTarget.lerp(cameraLookTarget, characterCameraLookWeight);
    }

    vrm.lookAt.lookAt(lookTarget);
  }

  // HEAD
  const head = getBone('head');

  if (!head) return;

  let targetHeadY;
  let targetHeadX;

  if (cameraTracking) {
    head.updateWorldMatrix(true, false);
    const direction = camera.position
      .clone()
      .sub(head.getWorldPosition(new THREE.Vector3()));

    if (head.parent) {
      direction.transformDirection(
        new THREE.Matrix4().copy(head.parent.matrixWorld).invert()
      );
    } else {
      direction.normalize();
    }

    targetHeadY = THREE.MathUtils.clamp(Math.atan2(direction.x, direction.z), -0.5, 0.5);
    targetHeadX = THREE.MathUtils.clamp(
      -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
      -0.35,
      0.35
    );
  } else {
    targetHeadY = pointerYaw * 0.6;
    targetHeadX = -pointerPitch * (pointerPitch > 0 ? 0.9 : 0.6);
  }
  const smoothness = 1 - Math.pow(0.001, delta);

  headLookX = THREE.MathUtils.lerp(
  headLookX,
  targetHeadX,
  smoothness
  );
  headLookY = THREE.MathUtils.lerp(
  headLookY,
  targetHeadY,
  smoothness
  );

  // The neck takes a share of the turn so the head doesn't pivot on its own.
  const neck = getBone('neck');
  const neckShare = neck ? 0.5 : 0;

  if (neck) {
    neck.rotation.x = headLookX * neckShare;
    neck.rotation.y = headLookY * neckShare;
  }

  head.rotation.x = headLookX * (1 - neckShare);
  head.rotation.y = headLookY * (1 - neckShare);
}

// =====================================
// IDLE ANIMATION
// =====================================
let idleTime = 0;
const breathingCycleDuration = 4.2;
const chestBreathingAmplitude = 0.018;
const upperChestBreathingAmplitude = 0.012;

function updateIdle(delta) {
  if (!vrm) return;

  idleTime += delta;

  const breathing = Math.sin(
    idleTime * (2 * Math.PI / breathingCycleDuration)
  );
  const chest = getBone('chest');
  const upperChest = getBone('upperChest');

  if (chest) {
    chest.rotation.x = sittingPose.chest[0] + breathing * chestBreathingAmplitude;
  }

  if (upperChest) {
    upperChest.rotation.x =
      sittingPose.upperChest[0] + breathing * upperChestBreathingAmplitude;
  }

  keepShouldersInPlace();
}

// =====================================
// AUTOMATIC BLINKING
// =====================================
function updateBlink(delta) {
  if (!vrm?.expressionManager) return;

  blinkTimer += delta;

  if (
    blinkPhase === 'waiting' &&
    blinkTimer >= nextBlinkIn
  ) {
    blinkPhase = 'closing';
    blinkTimer = 0;
  } else if (blinkPhase === 'closing') {
    blinkValue = Math.min(1, blinkValue + delta * 12);

    if (blinkValue >= 1) {
      blinkPhase = 'opening';
      blinkTimer = 0;
    }
  } else if (blinkPhase === 'opening') {
    blinkValue = Math.max(0, blinkValue - delta * 8);

    if (blinkValue <= 0) {
      blinkPhase = 'waiting';
      blinkTimer = 0;
      nextBlinkIn = 2.5 + Math.random() * 3.5;
    }
  }

  const hoverBlinkTarget = isCharacterHoverActive() ? 1 : 0;
  characterHoverBlink = THREE.MathUtils.damp(characterHoverBlink, hoverBlinkTarget, 8, delta);
  if (Math.abs(characterHoverBlink - hoverBlinkTarget) < 0.001) {
    characterHoverBlink = hoverBlinkTarget;
  }
  vrm.expressionManager.setValue('blink', THREE.MathUtils.lerp(blinkValue, 0.35, characterHoverBlink));
}

// =====================================
// LOAD LAVA BUBBLE ANIMATION FRAMES
// =====================================
loader.load(
  './models/roisin_lava_animation_compressed.glb',

  (gltf) => {
    const lavaRoot = gltf.scene;
    const frames = [];

    lavaRoot.traverse((object) => {
      const match = object.name.match(/^Lava_Mball_frame_(\d+)$/i);

      if (object.isMesh && match) {
        frames.push({
          number: Number(match[1]),
          object
        });
      }
    });

    frames.sort((a, b) => a.number - b.number);

    console.log('Lava animation frame count:', frames.length);

    if (frames.length === 0) {
      console.error(
        'No lava frames found. Mesh names in file:',
        lavaRoot.children.map((object) => object.name)
      );
      updateStartupProgress('lava', 1, true);
      return;
    }

    const frameObjects = new Set(
      frames.map((frame) => frame.object)
    );

    lavaRoot.traverse((object) => {
      if (object.isMesh && !frameObjects.has(object)) {
        object.visible = false;
      }
    });

    for (const frame of frames) {
      frame.object.visible = false;
      frame.object.frustumCulled = false;
      frame.object.receiveShadow = true;
      frame.object.layers.enable(lavaBloomLayer);

      const materials = Array.isArray(frame.object.material)
        ? frame.object.material
        : [frame.object.material];
      for (const material of materials) {
        if (!material?.color || lavaBubbleWarmMaterialSet.has(material)) continue;
        lavaBubbleWarmMaterialSet.add(material);
        const baseColor = material.color.clone();
        const baseEmissive = material.emissive?.clone() ?? null;
        lavaBubbleWarmMaterials.push({
          material,
          baseColor,
          warmColor: baseColor.clone().lerp(warmLavaBubbleColor, 0.92),
          baseEmissive,
          baseEmissiveIntensity: material.emissiveIntensity ?? 1,
          warmEmissive: baseEmissive?.clone().lerp(warmLavaBubbleEmissive, 0.75) ?? null,
          warmEmissiveIntensity: Math.min(material.emissiveIntensity ?? 1, 0.4)
        });
      }
    }

    scene.add(lavaRoot);
    addLavaGlowLight(lavaRoot);
    lavaBubbleRoot = lavaRoot;
    attachLavaBubblesToPivot();

    let currentFrameIndex = 0;
    frames[0].object.visible = true;

    const animationDuration = 10.4;
    const fps = frames.length / animationDuration;
    let elapsed = 0;

    lavaAnimations.push((delta) => {
      elapsed += delta;

      const lastIndex = frames.length - 1;

      if (lastIndex <= 0) return;

      const cycleLength = lastIndex * 2;
      const step = Math.floor(elapsed * fps) % cycleLength;

      const nextFrameIndex =
        step <= lastIndex
          ? step
          : cycleLength - step;

      if (nextFrameIndex === currentFrameIndex) return;

      frames[currentFrameIndex].object.visible = false;
      frames[nextFrameIndex].object.visible = true;

      currentFrameIndex = nextFrameIndex;
    });

    console.log('Ping-pong lava animation started.');
    updateStartupProgress('lava', 1, true);
  },

  (progress) => {
    if (progress.total > 0) {
      updateStartupProgress('lava', progress.loaded / progress.total);
      console.log(
        `Loading lava animation: ${Math.round(
          progress.loaded / progress.total * 100
        )}%`
      );
    }
  },

  (error) => {
    console.error('Lava animation failed to load:', error);
    updateStartupProgress('lava', 1, true);
  }
);

// =====================================
// MAIN ANIMATION LOOP
// =====================================
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  roomBackground.update(delta);
  updateIntroduction(delta);
  updateCharacterAboutCamera();

  for (const updateLava of lavaAnimations) {
    updateLava(delta);
  }

  roomWarmth = THREE.MathUtils.damp(roomWarmth, roomWarmthTarget, 1.8, delta);
  ambientLight.color.copy(coolAmbientColor).lerp(warmAmbientColor, roomWarmth);
  hemisphereLight.color.copy(coolHemisphereColor).lerp(warmHemisphereColor, roomWarmth);
  hemisphereLight.groundColor.copy(coolGroundColor).lerp(warmGroundColor, roomWarmth);
  characterRoomLight?.color.copy(coolCharacterLightColor).lerp(warmCharacterLightColor, roomWarmth);
  characterPinkLight?.color.copy(coolCharacterPinkColor).lerp(warmCharacterPinkColor, roomWarmth);

  for (const { material, baseColor, warmColor, baseEmissive, warmEmissive, warmUniform } of roomWarmMaterials) {
    if (warmUniform) {
      warmUniform.value = roomWarmth;
      material.color.copy(baseColor);
    } else {
      material.color.copy(baseColor).lerp(warmColor, roomWarmth);
    }
    if (baseEmissive && material.emissive) {
      material.emissive.copy(baseEmissive).lerp(warmEmissive, roomWarmth);
    }
  }

  for (const entry of characterWarmMaterials) {
    entry.material.color.copy(entry.baseColor).lerp(entry.warmColor, roomWarmth);
    entry.material.color.lerp(characterHoverColor, characterHoverAmount * 0.12);
    if (entry.baseEmissive && entry.material.emissive) {
      entry.material.emissive.copy(entry.baseEmissive).lerp(entry.warmEmissive, roomWarmth);
    }
  }

  for (const entry of lavaBubbleWarmMaterials) {
    entry.material.color.copy(entry.baseColor).lerp(entry.warmColor, roomWarmth);
    if (entry.baseEmissive && entry.material.emissive) {
      entry.material.emissive.copy(entry.baseEmissive).lerp(entry.warmEmissive, roomWarmth);
    }
    entry.material.emissiveIntensity = THREE.MathUtils.lerp(
      entry.baseEmissiveIntensity,
      entry.warmEmissiveIntensity,
      roomWarmth
    );
  }

  for (const drawing of interactiveDrawings) {
    const hoverOffset = drawing === hoveredDrawing
      ? drawing.userData.artworkHoverDistance + Math.sin(clock.elapsedTime * 4) * 0.025
      : 0;
    const targetPosition = drawing.userData.artworkTargetPosition
      .copy(drawing.userData.artworkBasePosition)
      .addScaledVector(drawing.userData.artworkHoverAxis, hoverOffset);

    drawing.position.x = THREE.MathUtils.damp(drawing.position.x, targetPosition.x, 10, delta);
    drawing.position.y = THREE.MathUtils.damp(drawing.position.y, targetPosition.y, 10, delta);
    drawing.position.z = THREE.MathUtils.damp(drawing.position.z, targetPosition.z, 10, delta);

    const brightness = THREE.MathUtils.damp(
      drawing.userData.artworkBrightness,
      drawing === hoveredDrawing ? 1.8 : 1,
      10,
      delta
    );
    drawing.userData.artworkBrightness = brightness;
    for (const { material, base } of drawing.userData.artworkBrightMaterials) {
      const roomColor = roomWarmMaterialByMaterial.get(material);
      if (roomColor?.warmUniform) {
        roomColor.warmUniform.value = roomWarmth;
        material.color.copy(roomColor.baseColor).multiplyScalar(brightness);
      } else if (roomColor) {
        material.color.copy(roomColor.baseColor)
          .lerp(roomColor.warmColor, roomWarmth)
          .multiplyScalar(brightness);
      } else {
        material.color.copy(base).multiplyScalar(brightness);
      }
    }

    {
      const hovered = drawing === hoveredDrawing;
      const scale = THREE.MathUtils.damp(drawing.scale.x / drawing.userData.artworkBaseScale.x, hovered ? 1.12 : 1, 10, delta);
      drawing.scale.copy(drawing.userData.artworkBaseScale).multiplyScalar(scale);

      const tilt = hovered ? 0.1 + Math.sin(clock.elapsedTime * 3) * 0.02 : 0;
      const tiltAxis = drawing.userData.artworkTiltAxis;
      tiltTarget.setFromAxisAngle(tiltAxis, tilt).multiply(drawing.userData.artworkBaseQuaternion);
      drawing.quaternion.slerp(tiltTarget, 1 - Math.exp(-10 * delta));
    }

    const glowLight = drawing.userData.artworkGlowLight;
    if (glowLight) {
      const boost = THREE.MathUtils.damp(
        drawing.userData.artworkGlowBoost ?? 1,
        drawing === hoveredDrawing ? 1.8 : 1,
        10,
        delta
      );
      drawing.userData.artworkGlowBoost = boost;

      const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.4;
      glowLight.intensity = drawing.userData.artworkGlowLightBase * boost * pulse;
      for (const glow of drawing.userData.artworkGlowMaterials) {
        glow.emissiveIntensity = 6 * boost * pulse;
      }
    }
  }

  if (lavaLampPivot) {
    const targetScale = isLavaLampHovered ? 1.15 : 1;
    const scale = THREE.MathUtils.damp(lavaLampPivot.scale.x, targetScale, 8, delta);
    lavaLampPivot.scale.setScalar(scale);
    lavaLampPivot.userData.hoverLift = THREE.MathUtils.damp(
      lavaLampPivot.userData.hoverLift ?? 0,
      isLavaLampHovered ? lavaLampPivot.userData.lampHeight * 0.06 : 0,
      8,
      delta
    );
    lavaLampPivot.position.y = (lavaLampPivot.userData.baseY ??= lavaLampPivot.position.y)
      + lavaLampPivot.userData.hoverLift;
  }

  if (vrm) {
    characterHoverAmount = THREE.MathUtils.damp(characterHoverAmount, isCharacterHoverActive() ? 1 : 0, 7, delta);
    const hoverScale = 1 + characterHoverAmount * 0.04;
    vrm.scene.scale.setScalar(characterBaseScale * hoverScale);
    vrm.scene.position.copy(characterBasePosition).sub(characterScaleAnchor)
      .multiplyScalar(hoverScale - 1).add(characterBasePosition);
    // Keep the sitting pose from being overwritten by an animation clip.
    applySittingPose();
    updateIdle(delta);

    updateMouseLook(delta);
    updateBlink(delta);

    // Updates look-at, expressions and spring bones.
    vrm.update(delta);
  }

  const roomArtworkOpen = artworkViewer?.open && !artworkViewer.classList.contains('is-project');
  const liquifyTarget = Math.max(aboutLiquifyTarget, roomArtworkOpen || previewGateActive ? 1 : 0);
  const characterAboutActive = characterAboutView && !characterAboutTransition?.returning;
  const warpTarget = Math.max(aboutLiquifyTarget * (characterAboutActive ? 0.5 : 1), roomArtworkOpen ? 0.2 : 0, previewGateActive ? 1 : 0);
  aboutLiquify = THREE.MathUtils.damp(aboutLiquify, liquifyTarget, 1.4, delta);
  liquifyWarp = THREE.MathUtils.damp(liquifyWarp, warpTarget, 1.4, delta);
  liquifyWarpScale = THREE.MathUtils.damp(
    liquifyWarpScale, characterAboutActive ? 0.6 : 1, 1.4, delta
  );
  liquifyPass.enabled = aboutLiquify > 0.003;
  liquifyPass.uniforms.uAmount.value = aboutLiquify;
  liquifyPass.uniforms.uWarpAmount.value = liquifyWarp;
  liquifyPass.uniforms.uWarpScale.value = liquifyWarpScale;
  liquifyPass.uniforms.uTime.value = clock.elapsedTime;

  if (controls.enabled) controls.update();
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreBloomMaterials);
  finalComposer.render();
  dismissStartupScreen();
}

animate();

// =====================================
// WINDOW RESIZE
// =====================================
window.addEventListener('resize', () => {
  roomBackground.resize();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
  bloomComposer.setSize(window.innerWidth, window.innerHeight);
  finalComposer.setSize(window.innerWidth, window.innerHeight);
  liquifyPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;

  for (const drawing of interactiveDrawings) {

  }
});