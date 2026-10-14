import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { PieceSkinDef } from '../meta/catalog';
import { createPiece, createPieceMaterials, disposePiece, disposePieceMaterials } from './pieces';

/**
 * Fotografa um conjunto de peças em 3D para a prévia da loja
 * (rei e cavalo brancos, rainha e peão pretos). Usa um único renderizador
 * pequeno e guarda as imagens em cache.
 */
let renderer: THREE.WebGLRenderer | null = null;
let env: THREE.Texture | null = null;
const cache = new Map<string, string>();
const W = 360;
const H = 220;

function setup() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

export function renderSkinThumbnail(skin: PieceSkinDef): string {
  const hit = cache.get(skin.id);
  if (hit) return hit;
  const r = setup();
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 0.8));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight(skin.glow, 1.6);
  rim.position.set(-4, 3, -4);
  scene.add(key, rim);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.35, metalness: 0.4 }));
  plinth.position.y = -0.06;
  scene.add(plinth);
  const mats = createPieceMaterials(skin);
  const pieces = [
    createPiece('k', 'w', mats, false),
    createPiece('n', 'w', mats, false),
    createPiece('q', 'b', mats, false),
    createPiece('p', 'b', mats, false),
  ];
  const xs = [-1.05, -0.35, 0.4, 1.05];
  pieces.forEach((p, i) => {
    p.position.set(xs[i], 0, i % 2 ? 0.25 : -0.15);
    p.rotation.y = p.userData.color === 'b' ? Math.PI - 0.5 : -0.4;
    (p.userData.ring.material as THREE.MeshBasicMaterial).opacity = 0.25;
    scene.add(p);
  });
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  cam.position.set(0, 1.35, 5.2);
  cam.lookAt(0, 0.62, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  pieces.forEach(disposePiece);
  disposePieceMaterials(mats);
  plinth.geometry.dispose();
  (plinth.material as THREE.Material).dispose();
  cache.set(skin.id, url);
  return url;
}
