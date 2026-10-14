import * as THREE from 'three';
import type { Color, PieceSymbol } from '../core/types';
import type { PieceSkinDef } from '../meta/catalog';

/** Modelos 3D procedurais (torneamento + extrusão), criados uma vez e compartilhados. */
const geoCache = new Map<PieceSymbol, THREE.BufferGeometry[]>();

function lathe(points: [number, number][], segments = 40): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

const BASE: [number, number][] = [
  [0, 0],
  [0.36, 0],
  [0.37, 0.04],
  [0.35, 0.08],
  [0.3, 0.1],
  [0.31, 0.13],
  [0.26, 0.16],
];

function knightHead(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.17, 0);
  s.lineTo(0.2, 0);
  s.bezierCurveTo(0.24, 0.18, 0.12, 0.3, 0.14, 0.42);
  s.bezierCurveTo(0.2, 0.46, 0.3, 0.42, 0.33, 0.5);
  s.bezierCurveTo(0.34, 0.58, 0.24, 0.66, 0.12, 0.7);
  s.lineTo(0.06, 0.8);
  s.lineTo(0.01, 0.71);
  s.bezierCurveTo(-0.12, 0.7, -0.22, 0.56, -0.2, 0.36);
  s.bezierCurveTo(-0.19, 0.2, -0.13, 0.1, -0.17, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -0.1);
  // Três-quartos de perfil: o focinho aponta para o adversário, mas a silhueta fica visível.
  g.rotateY(Math.PI / 2 + 0.95);
  return g;
}

function buildGeometries(type: PieceSymbol): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  switch (type) {
    case 'p': {
      parts.push(lathe([...BASE, [0.17, 0.22], [0.12, 0.36], [0.17, 0.4], [0.17, 0.42], [0.1, 0.44], [0, 0.44]]));
      const head = new THREE.SphereGeometry(0.14, 24, 16);
      head.translate(0, 0.54, 0);
      parts.push(head);
      break;
    }
    case 'r': {
      parts.push(lathe([...BASE, [0.22, 0.24], [0.2, 0.52], [0.26, 0.56], [0.27, 0.7], [0.19, 0.7], [0.19, 0.64], [0, 0.64]]));
      for (let i = 0; i < 6; i++) {
        const b = new THREE.BoxGeometry(0.08, 0.09, 0.08);
        const a = (i / 6) * Math.PI * 2;
        b.rotateY(-a);
        b.translate(Math.cos(a) * 0.23, 0.745, Math.sin(a) * 0.23);
        parts.push(b);
      }
      break;
    }
    case 'n': {
      parts.push(lathe([...BASE, [0.22, 0.2], [0.2, 0.26], [0, 0.26]]));
      const head = knightHead();
      head.translate(0, 0.22, 0);
      parts.push(head);
      break;
    }
    case 'b': {
      parts.push(lathe([...BASE, [0.18, 0.24], [0.12, 0.46], [0.19, 0.5], [0.19, 0.53], [0.1, 0.55], [0, 0.55]]));
      const mitre = new THREE.SphereGeometry(0.15, 28, 20);
      mitre.scale(1, 1.45, 1);
      mitre.translate(0, 0.73, 0);
      parts.push(mitre);
      const tip = new THREE.SphereGeometry(0.05, 16, 12);
      tip.translate(0, 0.96, 0);
      parts.push(tip);
      break;
    }
    case 'q': {
      parts.push(lathe([...BASE, [0.2, 0.26], [0.13, 0.58], [0.21, 0.63], [0.21, 0.66], [0.15, 0.68], [0.22, 0.86], [0.12, 0.84], [0, 0.84]]));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = new THREE.SphereGeometry(0.035, 10, 8);
        s.translate(Math.cos(a) * 0.205, 0.89, Math.sin(a) * 0.205);
        parts.push(s);
      }
      const top = new THREE.SphereGeometry(0.07, 18, 14);
      top.translate(0, 0.92, 0);
      parts.push(top);
      break;
    }
    case 'k': {
      parts.push(lathe([...BASE, [0.21, 0.26], [0.14, 0.6], [0.22, 0.65], [0.22, 0.68], [0.16, 0.7], [0.2, 0.88], [0.1, 0.9], [0, 0.9]]));
      const v = new THREE.BoxGeometry(0.06, 0.24, 0.06);
      v.translate(0, 1.02, 0);
      const h = new THREE.BoxGeometry(0.18, 0.06, 0.06);
      h.translate(0, 1.05, 0);
      parts.push(v, h);
      break;
    }
  }
  return parts;
}

export function pieceGeometries(type: PieceSymbol): THREE.BufferGeometry[] {
  let g = geoCache.get(type);
  if (!g) {
    g = buildGeometries(type);
    geoCache.set(type, g);
  }
  return g;
}

export interface PieceMaterials {
  w: THREE.MeshStandardMaterial;
  b: THREE.MeshStandardMaterial;
  glowW: THREE.MeshBasicMaterial;
  glowB: THREE.MeshBasicMaterial;
}

/** `lite` usa MeshStandardMaterial (sem verniz), mais leve para aparelhos modestos. */
export function createPieceMaterials(skin: PieceSkinDef, lite = false): PieceMaterials {
  const base = { metalness: skin.metalness, roughness: skin.roughness, emissive: new THREE.Color(skin.glow), emissiveIntensity: 0 };
  const make = (color: number) =>
    lite ? new THREE.MeshStandardMaterial({ color, ...base }) : new THREE.MeshPhysicalMaterial({ color, ...base, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  return {
    w: make(skin.white),
    b: make(skin.black),
    glowW: new THREE.MeshBasicMaterial({ color: skin.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    glowB: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

const ringGeo = new THREE.TorusGeometry(0.31, 0.012, 8, 48);
ringGeo.rotateX(Math.PI / 2);
ringGeo.translate(0, 0.115, 0);

export interface PieceObject extends THREE.Group {
  userData: { type: PieceSymbol; color: Color; material: THREE.MeshStandardMaterial; ring: THREE.Mesh };
}

export function createPiece(type: PieceSymbol, color: Color, mats: PieceMaterials, shadows: boolean): PieceObject {
  const group = new THREE.Group() as PieceObject;
  // Material próprio por peça para permitir brilho/dissolução individuais.
  const material = (color === 'w' ? mats.w : mats.b).clone();
  for (const g of pieceGeometries(type)) {
    const m = new THREE.Mesh(g, material);
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    group.add(m);
  }
  const ring = new THREE.Mesh(ringGeo, (color === 'w' ? mats.glowW : mats.glowB).clone());
  group.add(ring);
  group.userData = { type, color, material, ring };
  // Peças pretas olham para o lado das brancas (cavalos).
  if (color === 'b') group.rotation.y = Math.PI;
  return group;
}

export function disposePiece(p: PieceObject) {
  p.userData.material.dispose();
  (p.userData.ring.material as THREE.Material).dispose();
}
