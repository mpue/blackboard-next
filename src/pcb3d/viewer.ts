// WebGL side of the 3D board view: renderer, z-up camera with orbit controls,
// environment and lights, board and part meshes. Frames are only rendered on
// demand (interaction, resize, texture upload, camera animation); dispose()
// releases every GPU resource and the context.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Doc } from '../model/types.ts';
import { buildBoard, viewPose, type ViewName } from './board.ts';
import { BOARD_THICKNESS, componentBody, disposeModelCache } from './models.ts';
import { boardTextures, type BoardTextures } from './textures.ts';

export interface Viewer {
  /** rebuilds the scene; resolves once the board textures are applied */
  setBoard(doc: Doc, zoneFills?: Map<string, string>): Promise<void>;
  setPartsVisible(visible: boolean): void;
  view(name: ViewName, animate?: boolean): void;
  dispose(): void;
}

function disposeTree(root: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    geos.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
  });
  const texs = new Set<THREE.Texture>();
  for (const m of mats) {
    if (m instanceof THREE.MeshStandardMaterial) for (const t of [m.map, m.roughnessMap, m.metalnessMap]) if (t) texs.add(t);
    m.dispose();
  }
  for (const t of texs) t.dispose();
  for (const g of geos) g.dispose();
}

const disposeTextures = (t: BoardTextures) => {
  t.map.dispose();
  t.orm.dispose();
};

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createViewer(host: HTMLElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', outline: 'none' });
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.6;
  // the room is modelled y-up, the scene is z-up
  scene.environmentRotation.set(Math.PI / 2, 0, 0);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = 2;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4048, 0.55);
  hemi.position.set(0, 0, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.radius = 2;
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  scene.add(hemi, key, key.target, fill, fill.target);

  const content = new THREE.Group();
  scene.add(content);
  let parts: THREE.Group | null = null;
  let partsVisible = true;
  let board = { width: 100, height: 80 };
  let bounds = new THREE.Box3();
  let fitted = false;
  let token = 0;
  let disposed = false;
  let frame = 0;
  let anim = 0;

  const render = () => {
    frame = 0;
    if (disposed) return;
    if (!anim) controls.update();
    renderer.render(scene, camera);
  };
  const request = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };
  const stopAnim = () => {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  };
  controls.addEventListener('change', request);
  controls.addEventListener('start', stopAnim);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const fitLights = () => {
    const c = new THREE.Vector3(board.width / 2, -board.height / 2, 0);
    const R = Math.max(10, bounds.isEmpty() ? Math.hypot(board.width, board.height) / 2 : bounds.getBoundingSphere(new THREE.Sphere()).radius);
    key.position.copy(c).addScaledVector(new THREE.Vector3(-0.35, -0.55, 1).normalize(), R * 3);
    key.target.position.copy(c);
    const sc = key.shadow.camera;
    sc.left = -R;
    sc.right = R;
    sc.top = R;
    sc.bottom = -R;
    sc.near = R * 0.5;
    sc.far = R * 5.5;
    sc.updateProjectionMatrix();
    key.shadow.normalBias = (2 * R) / 2048;
    fill.position.copy(c).addScaledVector(new THREE.Vector3(0.4, 0.5, -1).normalize(), R * 3);
    fill.target.position.copy(c);
    key.target.updateMatrixWorld();
    fill.target.updateMatrixWorld();
  };

  const view = (name: ViewName, animate = true) => {
    const pose = viewPose(name, bounds, board, camera.fov, camera.aspect);
    const dist = pose.position.distanceTo(pose.target);
    camera.near = Math.max(0.05, dist / 500);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.maxDistance = dist * 6;
    stopAnim();
    if (!animate || reducedMotion()) {
      camera.position.copy(pose.position);
      controls.target.copy(pose.target);
      controls.update();
      request();
      return;
    }
    // spherical interpolation around the moving target: never through the board
    const sph = (o: THREE.Vector3) => {
      const r = Math.max(1e-6, o.length());
      return { r, polar: Math.acos(THREE.MathUtils.clamp(o.z / r, -1, 1)), az: Math.atan2(o.y, o.x) };
    };
    const t0 = controls.target.clone();
    const from = sph(camera.position.clone().sub(t0));
    const to = sph(pose.position.clone().sub(pose.target));
    const dAz = ((to.az - from.az + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const start = performance.now();
    const target = new THREE.Vector3();
    const step = (now: number) => {
      if (disposed) return;
      const k = Math.min(1, (now - start) / 450);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const r = THREE.MathUtils.lerp(from.r, to.r, e);
      const polar = THREE.MathUtils.lerp(from.polar, to.polar, e);
      const az = from.az + dAz * e;
      target.lerpVectors(t0, pose.target, e);
      camera.position.set(target.x + r * Math.sin(polar) * Math.cos(az), target.y + r * Math.sin(polar) * Math.sin(az), target.z + r * Math.cos(polar));
      camera.lookAt(target);
      controls.target.copy(target);
      renderer.render(scene, camera);
      if (k < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        camera.position.copy(pose.position);
        controls.update();
        request();
      }
    };
    anim = requestAnimationFrame(step);
  };

  const clearContent = () => {
    for (const child of [...content.children]) {
      content.remove(child);
      disposeTree(child);
    }
    parts = null;
    disposeModelCache();
  };

  const apply = (m: THREE.MeshStandardMaterial, t: BoardTextures) => {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.map.anisotropy = aniso;
    t.orm.anisotropy = aniso;
    m.map = t.map;
    m.roughnessMap = t.orm;
    m.metalnessMap = t.orm;
    m.color.set(0xffffff);
    m.roughness = 1;
    m.metalness = 1;
    m.needsUpdate = true;
  };

  return {
    async setBoard(doc, zoneFills) {
      const my = ++token;
      clearContent();
      const b = buildBoard(doc, BOARD_THICKNESS);
      content.add(b.group);
      parts = new THREE.Group();
      parts.name = 'parts';
      for (const it of doc.items) if (it.kind === 'footprint') parts.add(componentBody(it, BOARD_THICKNESS));
      parts.visible = partsVisible;
      content.add(parts);
      board = { width: b.width, height: b.height };
      bounds = new THREE.Box3().setFromObject(content);
      fitLights();
      if (!fitted) {
        fitted = true;
        view('iso', false);
      } else request();
      const [top, bottom] = await Promise.all([boardTextures(doc, 'top', zoneFills), boardTextures(doc, 'bottom', zoneFills)]);
      if (my !== token || disposed) {
        disposeTextures(top);
        disposeTextures(bottom);
        return;
      }
      apply(b.top, top);
      apply(b.bottom, bottom);
      request();
    },
    setPartsVisible(visible) {
      partsVisible = visible;
      if (parts) parts.visible = visible;
      request();
    },
    view,
    dispose() {
      if (disposed) return;
      disposed = true;
      token++;
      if (frame) cancelAnimationFrame(frame);
      stopAnim();
      ro.disconnect();
      controls.removeEventListener('change', request);
      controls.removeEventListener('start', stopAnim);
      controls.dispose();
      clearContent();
      env.dispose();
      key.dispose();
      fill.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
