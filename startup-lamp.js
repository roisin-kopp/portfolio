import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = document.getElementById('startup-lamp');
const screen = document.getElementById('startup-screen');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(45, 4, 0);
camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 10);
scene.add(light);

const draco = new DRACOLoader();
draco.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let lamp = null;
let frame = null;
let stopped = false;

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);

function render(time) {
  if (stopped) return;
  if (lamp) lamp.rotation.y = reducedMotion.matches ? 0 : time * 0.0028;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(render);
}

const removalObserver = new MutationObserver(() => {
  if (screen.isConnected) return;
  stopped = true;
  if (frame !== null) cancelAnimationFrame(frame);
  resizeObserver.disconnect();
  removalObserver.disconnect();
  draco.dispose();
  if (lamp) {
    lamp.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    });
  }
  renderer.dispose();
});
removalObserver.observe(document.body, { childList: true });

loader.load('./assets/star_lamp_loading.glb', (gltf) => {
  if (stopped) return;
  const object = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(object);
  object.position.sub(bounds.getCenter(new THREE.Vector3()));
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.emissive?.set(0xffb3f5);
      material.emissiveIntensity = 1.4;
      material.toneMapped = false;
    }
  });
  lamp = new THREE.Group();
  lamp.add(object);
  scene.add(lamp);
}, undefined, (error) => console.error('Loading screen lamp failed to load:', error));

resize();
frame = requestAnimationFrame(render);
