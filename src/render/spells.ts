import * as THREE from 'three';
import type { Fx } from './fx';
import { ease, type Tweens } from './tween';

/**
 * Feitiços: pequenas cenas mágicas temporárias (1 a 2 s) usadas nas capturas e
 * nos poderes. Cada função cria seus objetos, anima e os remove/libera no final.
 * Elas só ilustram resultados já validados pelo motor.
 */
export interface SpellCtx {
  scene: THREE.Scene;
  fx: Fx;
  tweens: Tweens;
}

function glowMat(color: number, opacity = 0.9) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

export function disposeTree(obj: THREE.Object3D) {
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat?.dispose();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Natureza (peão): raízes que brotam e viram uma árvore encantada      */
/* ------------------------------------------------------------------ */

/** Raízes brilhantes sobem em espiral do chão ao redor de um ponto. */
export async function roots(ctx: SpellCtx, at: THREE.Vector3, color = 0x7dff9a, height = 1.1, ms = 520): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  const bark = new THREE.MeshStandardMaterial({ color: 0x3b2614, roughness: 0.8, emissive: new THREE.Color(color), emissiveIntensity: 0.55 });
  const tubes: THREE.TubeGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const a = a0 + t * 2.2;
      const r = 0.48 - t * 0.28;
      pts.push(new THREE.Vector3(Math.cos(a) * r, t * height, Math.sin(a) * r));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 6, false);
    geo.setDrawRange(0, 0);
    tubes.push(geo);
    group.add(new THREE.Mesh(geo, bark));
  }
  ctx.scene.add(group);
  ctx.fx.burst(new THREE.Vector3(at.x, 0.05, at.z), { count: 24, color: 0x9a7a4a, speed: 1.2, life: 0.6, size: 0.08, spread: 'ring', gravity: -2 });
  await ctx.tweens.run(ms, (t) => {
    for (const g of tubes) g.setDrawRange(0, Math.floor((g.index?.count ?? 0) * t));
  }, ease.out);
  return group;
}

/** Árvore encantada que cresce, floresce e se desfaz em pétalas. */
export async function enchantedTree(ctx: SpellCtx, at: THREE.Vector3, leaf = 0x5cff8a, blossom = 0xffa8e0, hold = 450) {
  const tree = new THREE.Group();
  tree.position.set(at.x, 0, at.z);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.85, emissive: new THREE.Color(0x2a6a30), emissiveIntensity: 0.3 });
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.14, 1.4, 8);
  trunkGeo.translate(0, 0.7, 0);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  tree.add(trunk);
  const branches: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.CylinderGeometry(0.025, 0.06, 0.7, 6);
    g.translate(0, 0.35, 0);
    const b = new THREE.Mesh(g, barkMat);
    b.position.y = 0.75 + (i % 3) * 0.2;
    b.rotation.set(0.9, (i / 5) * Math.PI * 2, 0, 'YXZ');
    b.scale.setScalar(0);
    branches.push(b);
    tree.add(b);
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: leaf, emissive: new THREE.Color(leaf), emissiveIntensity: 0.7, roughness: 0.5, transparent: true });
  const leafGeo = new THREE.IcosahedronGeometry(0.2, 0);
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(leafGeo, leafMat);
    const a = Math.random() * Math.PI * 2;
    const r = 0.25 + Math.random() * 0.45;
    m.position.set(Math.cos(a) * r, 1.3 + Math.random() * 0.6, Math.sin(a) * r);
    m.scale.setScalar(0);
    m.userData.s = 0.7 + Math.random() * 0.7;
    leaves.push(m);
    tree.add(m);
  }
  ctx.scene.add(tree);
  trunk.scale.set(1, 0.001, 1);
  await ctx.tweens.run(380, (t) => trunk.scale.set(0.6 + 0.4 * t, Math.max(0.001, t), 0.6 + 0.4 * t), ease.out);
  await ctx.tweens.run(260, (t) => branches.forEach((b) => b.scale.setScalar(t)), ease.back);
  await ctx.tweens.run(280, (t) => leaves.forEach((l, i) => l.scale.setScalar(l.userData.s * ease.back(Math.min(1, t * 1.4 - i * 0.02)))));
  ctx.fx.burst(new THREE.Vector3(at.x, 1.6, at.z), { count: 30, color: blossom, speed: 0.9, life: 1.2, size: 0.1, gravity: -0.4, drag: 1 });
  await ctx.tweens.wait(hold);
  // Pétalas se soltam e a árvore volta para a terra.
  ctx.fx.burst(new THREE.Vector3(at.x, 1.5, at.z), { count: 50, color: blossom, speed: 1.8, life: 1.4, size: 0.1, gravity: -0.8, drag: 0.8 });
  ctx.fx.burst(new THREE.Vector3(at.x, 1.4, at.z), { count: 30, color: leaf, speed: 1.6, life: 1.1, size: 0.09, gravity: -1.2 });
  await ctx.tweens.run(380, (t) => {
    tree.scale.set(1 - 0.3 * t, 1 - t * 0.999, 1 - 0.3 * t);
    leafMat.opacity = 1 - t;
  }, ease.in);
  disposeTree(tree);
}

/* ------------------------------------------------------------------ */
/* Terra (torre): pilares de pedra rúnica                               */
/* ------------------------------------------------------------------ */

export async function stonePillars(ctx: SpellCtx, spots: THREE.Vector3[], rune = 0x5fa0ff, hold = 350) {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6a6a78, roughness: 0.9, emissive: new THREE.Color(rune), emissiveIntensity: 0.25 });
  const geo = new THREE.CylinderGeometry(0.16, 0.26, 1.1, 6);
  geo.translate(0, 0.55, 0);
  const tipGeo = new THREE.ConeGeometry(0.17, 0.35, 6);
  tipGeo.translate(0, 1.27, 0);
  const pillars = spots.map((p, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, stone), new THREE.Mesh(tipGeo, stone));
    g.position.set(p.x + (Math.random() - 0.5) * 0.2, -1.3, p.z + (Math.random() - 0.5) * 0.2);
    g.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 3, (Math.random() - 0.5) * 0.3);
    g.userData.delay = i * 0.05;
    group.add(g);
    return g;
  });
  ctx.scene.add(group);
  for (const p of spots) ctx.fx.burst(new THREE.Vector3(p.x, 0.05, p.z), { count: 10, color: 0xb0a080, speed: 1.4, life: 0.6, size: 0.09, spread: 'ring', gravity: -2 });
  await ctx.tweens.run(320, (t) => pillars.forEach((g) => (g.position.y = -1.3 + 1.3 * ease.back(Math.max(0, Math.min(1, (t - g.userData.delay) / (1 - g.userData.delay)))))));
  stone.emissiveIntensity = 1.2;
  await ctx.tweens.run(hold, (t) => (stone.emissiveIntensity = 1.2 - 0.9 * t));
  await ctx.tweens.run(320, (t) => pillars.forEach((g) => (g.position.y = -1.3 * t)), ease.in);
  disposeTree(group);
}

/* ------------------------------------------------------------------ */
/* Luz (bispo): olho místico                                           */
/* ------------------------------------------------------------------ */

let eyeTexture: THREE.Texture | null = null;
function getEyeTexture() {
  if (eyeTexture) return eyeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.strokeStyle = '#bff4ff';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-110, 0);
  g.quadraticCurveTo(0, -95, 110, 0);
  g.quadraticCurveTo(0, 95, -110, 0);
  g.stroke();
  const grad = g.createRadialGradient(0, 0, 4, 0, 0, 46);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, '#7ae0ff');
  grad.addColorStop(1, 'rgba(40,120,255,0.2)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#04101c';
  g.beginPath();
  g.ellipse(0, 0, 9, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(191,244,255,0.7)';
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 112, Math.sin(a) * 112);
    g.lineTo(Math.cos(a) * 124, Math.sin(a) * 124);
    g.stroke();
  }
  eyeTexture = new THREE.CanvasTexture(c);
  eyeTexture.colorSpace = THREE.SRGBColorSpace;
  return eyeTexture;
}

export async function mysticEye(ctx: SpellCtx, at: THREE.Vector3, targets: THREE.Vector3[] = [], hold = 500) {
  const mat = new THREE.MeshBasicMaterial({ map: getEyeTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  eye.position.set(at.x, 2.6, at.z);
  eye.rotation.x = -Math.PI / 2;
  ctx.scene.add(eye);
  await ctx.tweens.run(300, (t) => {
    eye.scale.set(0.4 + 0.6 * t, Math.max(0.02, ease.back(t)), 1);
    eye.rotation.z = t * 0.6;
  });
  const beams: THREE.Mesh[] = [];
  for (const target of targets.slice(0, 6)) {
    const from = eye.position.clone();
    const to = target.clone().setY(0.4);
    const len = from.distanceTo(to);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, len, 6, 1, true), glowMat(0x7ae0ff, 0.8));
    b.position.copy(from).add(to).multiplyScalar(0.5);
    b.lookAt(to);
    b.rotateX(Math.PI / 2);
    ctx.scene.add(b);
    beams.push(b);
    ctx.fx.burst(to, { count: 10, color: 0xff8a2a, speed: 0.8, life: 0.6, size: 0.08 });
  }
  await ctx.tweens.run(hold, (t) => {
    eye.rotation.z = 0.6 + t * 0.8;
    beams.forEach((b) => ((b.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t * 0.5)));
  });
  await ctx.tweens.run(260, (t) => {
    eye.scale.y = Math.max(0.02, 1 - t);
    mat.opacity = 1 - t;
    beams.forEach((b) => ((b.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - t)));
  });
  mat.map = null; // a textura é compartilhada
  disposeTree(eye);
  beams.forEach(disposeTree);
}

/* ------------------------------------------------------------------ */
/* Realeza (rei): coroa de lâminas douradas                             */
/* ------------------------------------------------------------------ */

export async function royalCrown(ctx: SpellCtx, at: THREE.Vector3, color = 0xffd27a) {
  const crown = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.2, emissive: new THREE.Color(color), emissiveIntensity: 0.6 });
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), gold));
  (crown.children[0] as THREE.Mesh).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 6), gold);
    spike.position.set(Math.cos(a) * 0.62, 0.2, Math.sin(a) * 0.62);
    crown.add(spike);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), glowMat(i % 2 ? 0x5fc8ff : 0xff5a8a, 1));
    gem.position.set(Math.cos(a) * 0.62, 0.42, Math.sin(a) * 0.62);
    crown.add(gem);
  }
  crown.position.set(at.x, 3.2, at.z);
  ctx.scene.add(crown);
  await ctx.tweens.run(520, (t) => {
    crown.position.y = 3.2 - 1.9 * ease.out(t);
    crown.rotation.y = t * 4;
    crown.scale.setScalar(0.4 + 0.6 * t);
  });
  ctx.fx.flash(at, color, 9);
  ctx.fx.burst(new THREE.Vector3(at.x, 1.3, at.z), { count: 50, color, speed: 2.4, life: 0.9, size: 0.12, spread: 'ring', gravity: 0 });
  ctx.fx.shockwave(at, color, 2.6, 0.7);
  await ctx.tweens.run(320, (t) => {
    crown.rotation.y += 0.25;
    crown.scale.setScalar(1 + t * 0.6);
    gold.opacity = 1 - t;
    gold.transparent = true;
  });
  disposeTree(crown);
}

/* ------------------------------------------------------------------ */
/* Cosmos (rainha): vórtice de estrelas                                 */
/* ------------------------------------------------------------------ */

export function starVortex(ctx: SpellCtx, at: THREE.Vector3, color = 0x9a7bff, ms = 900, radius = 1.1): Promise<void> {
  const n = 220;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) seeds[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.07, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.1, radius, 48), glowMat(color, 0.25));
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(at.x, 0.03, at.z);
  ctx.scene.add(disk);
  return ctx.tweens
    .run(ms, (t) => {
      for (let i = 0; i < n; i++) {
        const s = seeds[i];
        const r = radius * (1 - ((t * 1.6 + s) % 1));
        const a = s * 40 + t * 9 + (1 - r) * 4;
        pos[i * 3] = at.x + Math.cos(a) * r;
        pos[i * 3 + 1] = 0.1 + (1 - r / radius) * 1.4 * s;
        pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      }
      geo.attributes.position.needsUpdate = true;
      disk.rotation.z = t * 6;
      (disk.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.sin(t * Math.PI);
      (pts.material as THREE.PointsMaterial).opacity = Math.sin(t * Math.PI);
    })
    .then(() => {
      disposeTree(pts);
      disposeTree(disk);
    });
}

/** Constelação: estrelas ligadas por linhas entre dois pontos (rastro do teleporte). */
export async function constellation(ctx: SpellCtx, from: THREE.Vector3, to: THREE.Vector3, color = 0xbfa8ff) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const p = from.clone().lerp(to, t);
    p.y = 0.5 + Math.sin(t * Math.PI) * 1.6 + (Math.random() - 0.5) * 0.3;
    p.x += (Math.random() - 0.5) * 0.3;
    p.z += (Math.random() - 0.5) * 0.3;
    pts.push(p);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  lineGeo.setDrawRange(0, 0);
  ctx.scene.add(line);
  for (const p of pts) ctx.fx.burst(p, { count: 6, color: 0xffffff, speed: 0.3, life: 0.9, size: 0.12, gravity: 0 });
  await ctx.tweens.run(380, (t) => lineGeo.setDrawRange(0, Math.ceil(pts.length * t)));
  await ctx.tweens.run(420, (t) => ((line.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - t)));
  line.parent?.remove(line);
  lineGeo.dispose();
  (line.material as THREE.Material).dispose();
}

/* ------------------------------------------------------------------ */
/* Espectro (cavalo): imagens fantasmas                                 */
/* ------------------------------------------------------------------ */

/** Deixa cópias fantasmas da peça pelo caminho enquanto `durationMs` durar. */
export function ghostTrail(ctx: SpellCtx, piece: THREE.Object3D, color = 0x5fc8ff, durationMs = 560, everyMs = 70) {
  let acc = 0;
  let last = 0;
  void ctx.tweens.run(durationMs, (t) => {
    const now = t * durationMs;
    acc += now - last;
    last = now;
    if (acc < everyMs) return;
    acc = 0;
    const ghost = piece.clone(true);
    const mat = glowMat(color, 0.45);
    ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    ghost.position.copy(piece.position);
    ghost.rotation.copy(piece.rotation);
    ctx.scene.add(ghost);
    void ctx.tweens.run(450, (k) => {
      mat.opacity = 0.45 * (1 - k);
      ghost.scale.setScalar(1 + k * 0.25);
      ghost.position.y += 0.004;
    }).then(() => {
      ghost.parent?.remove(ghost);
      mat.dispose();
    });
  }, ease.linear);
}
