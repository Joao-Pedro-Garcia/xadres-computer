import * as THREE from 'three';
import type { Color, PieceSymbol } from '../core/types';
import type { PieceSkinDef, SideMaterials } from '../meta/catalog';

/**
 * Modelos 3D procedurais das peças em três formatos:
 * - staunton: o clássico de torneio;
 * - luxe: base larga de alabastro com faixas de metal, haste metálica e topo cravejado;
 * - regal: alto e esguio, com base e golas de metal, corpo de pedra/madeira e gemas.
 * Cada parte tem um papel de material (corpo, metal, gema ou cravejado).
 */
type Role = 'base' | 'metal' | 'gem' | 'pave';
interface Part {
  geo: THREE.BufferGeometry;
  role: Role;
}
type Style = PieceSkinDef['style'];

const geoCache = new Map<string, Part[]>();

function lathe(points: [number, number][], segments = 40): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments,
  );
}

function at<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z = 0): T {
  g.translate(x, y, z);
  return g;
}

function ring(r: number, tube: number, y: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 10, 48);
  g.rotateX(Math.PI / 2);
  return at(g, 0, y);
}

function knightHead(depth = 0.2): THREE.BufferGeometry {
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
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  // Três-quartos de perfil: o focinho aponta para o adversário, mas a silhueta fica visível.
  g.rotateY(Math.PI / 2 + 0.95);
  return g;
}

/** Crina cravejada que acompanha as costas da cabeça do cavalo. */
function knightMane(yOffset: number): THREE.BufferGeometry {
  const pts = [
    [-0.17, 0.05],
    [-0.21, 0.3],
    [-0.16, 0.55],
    [-0.04, 0.72],
    [0.06, 0.8],
  ].map(([x, y]) => new THREE.Vector3(x, y + yOffset, 0));
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.045, 8, false);
  g.rotateY(Math.PI / 2 + 0.95);
  return g;
}

/* ------------------------------ Clássico ------------------------------ */

const BASE: [number, number][] = [
  [0, 0],
  [0.36, 0],
  [0.37, 0.04],
  [0.35, 0.08],
  [0.3, 0.1],
  [0.31, 0.13],
  [0.26, 0.16],
];

function staunton(type: PieceSymbol): Part[] {
  const b = (geo: THREE.BufferGeometry): Part => ({ geo, role: 'base' });
  switch (type) {
    case 'p':
      return [b(lathe([...BASE, [0.17, 0.22], [0.12, 0.36], [0.17, 0.4], [0.17, 0.42], [0.1, 0.44], [0, 0.44]])), b(at(new THREE.SphereGeometry(0.14, 24, 16), 0, 0.54))];
    case 'r': {
      const parts = [b(lathe([...BASE, [0.22, 0.24], [0.2, 0.52], [0.26, 0.56], [0.27, 0.7], [0.19, 0.7], [0.19, 0.64], [0, 0.64]]))];
      for (let i = 0; i < 6; i++) {
        const g = new THREE.BoxGeometry(0.08, 0.09, 0.08);
        const a = (i / 6) * Math.PI * 2;
        g.rotateY(-a);
        parts.push(b(at(g, Math.cos(a) * 0.23, 0.745, Math.sin(a) * 0.23)));
      }
      return parts;
    }
    case 'n':
      return [b(lathe([...BASE, [0.22, 0.2], [0.2, 0.26], [0, 0.26]])), b(at(knightHead(), 0, 0.22))];
    case 'b': {
      const mitre = new THREE.SphereGeometry(0.15, 28, 20);
      mitre.scale(1, 1.45, 1);
      return [b(lathe([...BASE, [0.18, 0.24], [0.12, 0.46], [0.19, 0.5], [0.19, 0.53], [0.1, 0.55], [0, 0.55]])), b(at(mitre, 0, 0.73)), b(at(new THREE.SphereGeometry(0.05, 16, 12), 0, 0.96))];
    }
    case 'q': {
      const parts = [b(lathe([...BASE, [0.2, 0.26], [0.13, 0.58], [0.21, 0.63], [0.21, 0.66], [0.15, 0.68], [0.22, 0.86], [0.12, 0.84], [0, 0.84]]))];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        parts.push(b(at(new THREE.SphereGeometry(0.035, 10, 8), Math.cos(a) * 0.205, 0.89, Math.sin(a) * 0.205)));
      }
      parts.push(b(at(new THREE.SphereGeometry(0.07, 18, 14), 0, 0.92)));
      return parts;
    }
    case 'k':
      return [
        b(lathe([...BASE, [0.21, 0.26], [0.14, 0.6], [0.22, 0.65], [0.22, 0.68], [0.16, 0.7], [0.2, 0.88], [0.1, 0.9], [0, 0.9]])),
        b(at(new THREE.BoxGeometry(0.06, 0.24, 0.06), 0, 1.02)),
        b(at(new THREE.BoxGeometry(0.18, 0.06, 0.06), 0, 1.05)),
      ];
  }
}

/* ------------------------------ Luxo ------------------------------ */

/** Saia larga de alabastro com faixas de metal + haste metálica até `top`. */
function luxeBody(top: number, skirtScale = 1): Part[] {
  const k = skirtScale;
  const skirt = lathe([
    [0, 0],
    [0.4 * k, 0],
    [0.405 * k, 0.035],
    [0.36 * k, 0.075],
    [0.29 * k, 0.13],
    [0.21 * k, 0.21],
    [0.155, 0.31],
    [0.135, 0.38],
    [0, 0.38],
  ]);
  const stem = lathe([
    [0, 0.38],
    [0.135, 0.38],
    [0.115, 0.43],
    [0.08, 0.5],
    [0.07, top - 0.08],
    [0.115, top - 0.03],
    [0.12, top],
    [0, top],
  ]);
  return [
    { geo: skirt, role: 'base' },
    { geo: ring(0.39 * k, 0.018, 0.05), role: 'metal' },
    { geo: ring(0.205 * k, 0.014, 0.215), role: 'metal' },
    { geo: ring(0.14, 0.02, 0.37), role: 'metal' },
    { geo: stem, role: 'metal' },
  ];
}

function luxe(type: PieceSymbol): Part[] {
  switch (type) {
    case 'p':
      return [...luxeBody(0.6, 0.85), { geo: at(new THREE.SphereGeometry(0.12, 28, 20), 0, 0.71), role: 'pave' }];
    case 'r':
      return [
        ...luxeBody(0.62),
        { geo: lathe([[0, 0.62], [0.16, 0.62], [0.2, 0.78], [0.2, 0.86], [0.14, 0.86], [0.14, 0.8], [0, 0.8]]), role: 'metal' },
        { geo: ring(0.18, 0.038, 0.86), role: 'pave' },
        { geo: ring(0.2, 0.012, 0.77), role: 'metal' },
      ];
    case 'b':
      return [
        ...luxeBody(0.7),
        { geo: lathe([[0, 0.7], [0.1, 0.7], [0.145, 0.78], [0.135, 0.88], [0.085, 0.97], [0.025, 1.02], [0, 1.02]]), role: 'pave' },
        { geo: ring(0.11, 0.02, 0.71), role: 'metal' },
        { geo: at(new THREE.SphereGeometry(0.04, 14, 10), 0, 1.05), role: 'metal' },
      ];
    case 'n':
      return [...luxeBody(0.5, 1.02), { geo: at(knightHead(0.2), 0, 0.46), role: 'metal' }, { geo: knightMane(0.46), role: 'pave' }];
    case 'q':
      return [
        ...luxeBody(0.86),
        { geo: lathe([[0, 0.86], [0.09, 0.86], [0.165, 0.99], [0.175, 1.03], [0.06, 1.0], [0, 1.0]]), role: 'pave' },
        ...Array.from({ length: 8 }, (_, i): Part => {
          const a = (i / 8) * Math.PI * 2;
          return { geo: at(new THREE.SphereGeometry(0.028, 10, 8), Math.cos(a) * 0.17, 1.045, Math.sin(a) * 0.17), role: 'gem' };
        }),
        { geo: at(new THREE.SphereGeometry(0.055, 16, 12), 0, 1.08), role: 'gem' },
      ];
    case 'k':
      return [
        ...luxeBody(0.9),
        { geo: lathe([[0, 0.9], [0.1, 0.9], [0.165, 1.0], [0.165, 1.05], [0, 1.05]]), role: 'metal' },
        { geo: ring(0.165, 0.035, 1.0), role: 'pave' },
        { geo: at(new THREE.BoxGeometry(0.05, 0.22, 0.05), 0, 1.16), role: 'metal' },
        { geo: at(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0, 1.19), role: 'metal' },
        { geo: at(new THREE.OctahedronGeometry(0.04), 0, 1.19, 0.03), role: 'gem' },
      ];
  }
}

/* ------------------------------ Régio ------------------------------ */

/** Base dourada em degraus + corpo esguio de pedra/madeira até `top`, com gola dourada. */
function regalBody(top: number): Part[] {
  const foot = lathe([[0, 0], [0.33, 0], [0.34, 0.03], [0.3, 0.05], [0.31, 0.08], [0.26, 0.1], [0, 0.1]]);
  const body = lathe([[0, 0.1], [0.24, 0.1], [0.19, 0.16], [0.13, 0.28], [0.095, top - 0.1], [0.11, top - 0.04], [0, top - 0.04]]);
  return [
    { geo: foot, role: 'metal' },
    { geo: body, role: 'base' },
    { geo: ring(0.17, 0.02, 0.2), role: 'metal' },
    { geo: lathe([[0, top - 0.05], [0.14, top - 0.05], [0.15, top - 0.02], [0.1, top + 0.01], [0, top + 0.01]]), role: 'metal' },
  ];
}

function regal(type: PieceSymbol): Part[] {
  switch (type) {
    case 'p':
      return [...regalBody(0.48), { geo: at(new THREE.CylinderGeometry(0.04, 0.06, 0.08, 12), 0, 0.53), role: 'metal' }, { geo: at(new THREE.SphereGeometry(0.1, 24, 16), 0, 0.64), role: 'gem' }];
    case 'r': {
      const parts: Part[] = [...regalBody(0.56), { geo: lathe([[0, 0.56], [0.15, 0.56], [0.17, 0.74], [0.12, 0.74], [0, 0.74]]), role: 'metal' }];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const g = new THREE.BoxGeometry(0.06, 0.08, 0.06);
        g.rotateY(-a);
        parts.push({ geo: at(g, Math.cos(a) * 0.145, 0.78, Math.sin(a) * 0.145), role: 'metal' });
      }
      parts.push({ geo: at(new THREE.SphereGeometry(0.045, 14, 10), 0, 0.68, 0.16), role: 'gem' });
      return parts;
    }
    case 'b': {
      const mitre = new THREE.SphereGeometry(0.13, 28, 20);
      mitre.scale(1, 1.6, 1);
      return [...regalBody(0.66), { geo: at(mitre, 0, 0.84), role: 'metal' }, { geo: ring(0.12, 0.018, 0.78), role: 'gem' }, { geo: at(new THREE.SphereGeometry(0.05, 14, 10), 0, 1.07), role: 'gem' }];
    }
    case 'n':
      return [...regalBody(0.42), { geo: at(knightHead(0.18), 0, 0.4), role: 'metal' }, { geo: at(new THREE.SphereGeometry(0.035, 10, 8), 0.02, 0.98, 0), role: 'gem' }];
    case 'q': {
      const parts: Part[] = [...regalBody(0.8), { geo: lathe([[0, 0.8], [0.08, 0.8], [0.17, 0.97], [0.12, 0.96], [0, 0.96]]), role: 'metal' }];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        parts.push({ geo: at(new THREE.ConeGeometry(0.025, 0.09, 6), Math.cos(a) * 0.16, 1.01, Math.sin(a) * 0.16), role: 'metal' });
        parts.push({ geo: at(new THREE.SphereGeometry(0.022, 8, 6), Math.cos(a) * 0.16, 1.07, Math.sin(a) * 0.16), role: 'gem' });
      }
      parts.push({ geo: at(new THREE.SphereGeometry(0.06, 16, 12), 0, 1.04), role: 'gem' });
      return parts;
    }
    case 'k':
      return [
        ...regalBody(0.86),
        { geo: lathe([[0, 0.86], [0.08, 0.86], [0.16, 1.0], [0.16, 1.04], [0, 1.04]]), role: 'metal' },
        { geo: ring(0.15, 0.025, 1.0), role: 'gem' },
        { geo: at(new THREE.BoxGeometry(0.05, 0.24, 0.05), 0, 1.17), role: 'metal' },
        { geo: at(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0, 1.2), role: 'metal' },
        { geo: at(new THREE.OctahedronGeometry(0.045), 0, 1.2, 0.03), role: 'gem' },
      ];
  }
}

export function pieceParts(style: Style, type: PieceSymbol): Part[] {
  const key = `${style}:${type}`;
  let parts = geoCache.get(key);
  if (!parts) {
    parts = style === 'luxe' ? luxe(type) : style === 'regal' ? regal(type) : staunton(type);
    geoCache.set(key, parts);
  }
  return parts;
}

/* ------------------------------ Materiais ------------------------------ */

/** Textura de brilho do cravejado: pontos claros (diamantes) sobre fundo escuro. */
let paveTexture: THREE.Texture | null = null;
function getPaveTexture(): THREE.Texture {
  if (paveTexture) return paveTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8c8c8c';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x < 128; x += 8) {
      const v = 200 + Math.floor(Math.random() * 55);
      const grad = g.createRadialGradient(x + 4, y + 4, 0, x + 4, y + 4, 4);
      grad.addColorStop(0, `rgb(${v},${v},${v})`);
      grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(60,60,60,0.6)');
      g.fillStyle = grad;
      g.fillRect(x, y, 8, 8);
    }
  }
  paveTexture = new THREE.CanvasTexture(c);
  paveTexture.wrapS = paveTexture.wrapT = THREE.RepeatWrapping;
  paveTexture.repeat.set(6, 3);
  paveTexture.colorSpace = THREE.SRGBColorSpace;
  return paveTexture;
}

export type SideMats = Record<Role, THREE.MeshStandardMaterial>;

export interface PieceMaterials {
  w: SideMats;
  b: SideMats;
  glowW: THREE.MeshBasicMaterial;
  glowB: THREE.MeshBasicMaterial;
  style: Style;
}

function sideMats(m: SideMaterials, lite: boolean): SideMats {
  const make = (params: THREE.MeshPhysicalMaterialParameters) => (lite ? new THREE.MeshStandardMaterial(params as THREE.MeshStandardMaterialParameters) : new THREE.MeshPhysicalMaterial(params));
  const base = make({
    color: m.base,
    metalness: m.baseMetalness,
    roughness: m.baseRoughness,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    ...(m.frosted ? { sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5, clearcoat: 0.3, roughness: Math.max(0.35, m.baseRoughness), transmission: lite ? 0 : 0.15, thickness: 0.4 } : {}),
    emissive: new THREE.Color(0x000000),
  });
  const metal = make({ color: m.metal, metalness: 1, roughness: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const gem = make({ color: m.gem, metalness: 0.1, roughness: 0.05, emissive: new THREE.Color(m.gem), emissiveIntensity: 0.35, clearcoat: 1 });
  const pave = m.pave
    ? make({ color: m.metal, map: getPaveTexture(), metalness: 0.75, roughness: 0.08, emissive: new THREE.Color(0xffffff), emissiveMap: getPaveTexture(), emissiveIntensity: 0.35, clearcoat: 1, clearcoatRoughness: 0.02 })
    : metal;
  for (const x of [base, metal, gem, pave]) x.userData.baseEmissive = x.emissiveIntensity;
  return { base, metal, gem, pave };
}

export function createPieceMaterials(skin: PieceSkinDef, lite = false): PieceMaterials {
  return {
    w: sideMats(skin.white, lite),
    b: sideMats(skin.black, lite),
    glowW: new THREE.MeshBasicMaterial({ color: skin.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    glowB: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    style: skin.style,
  };
}

export function disposePieceMaterials(m: PieceMaterials) {
  const all = new Set<THREE.Material>([...Object.values(m.w), ...Object.values(m.b), m.glowW, m.glowB]);
  all.forEach((x) => x.dispose());
}

/**
 * Agrupa os materiais de uma peça para as animações (brilho, dissolução):
 * gemas e cravejados mantêm o brilho próprio.
 */
export class PieceMaterialGroup {
  readonly emissive: { setHex: (hex: number) => void };
  private _intensity = 0;
  private _opacity = 1;
  private _transparent = false;
  constructor(readonly list: THREE.MeshStandardMaterial[]) {
    this.emissive = { setHex: (hex) => this.list.forEach((m) => !m.userData.keepGlow && m.emissive.setHex(hex)) };
  }
  get primary() {
    return this.list[0];
  }
  get emissiveIntensity() {
    return this._intensity;
  }
  set emissiveIntensity(v: number) {
    this._intensity = v;
    for (const m of this.list) m.emissiveIntensity = Math.max(m.userData.baseEmissive ?? 0, v);
  }
  get opacity() {
    return this._opacity;
  }
  set opacity(v: number) {
    this._opacity = v;
    for (const m of this.list) m.opacity = v;
  }
  get transparent() {
    return this._transparent;
  }
  set transparent(v: boolean) {
    this._transparent = v;
    for (const m of this.list) m.transparent = v;
  }
  dispose() {
    this.list.forEach((m) => m.dispose());
  }
}

const ringGeo = new THREE.TorusGeometry(0.31, 0.012, 8, 48);
ringGeo.rotateX(Math.PI / 2);
ringGeo.translate(0, 0.115, 0);

export interface PieceObject extends THREE.Group {
  userData: { type: PieceSymbol; color: Color; material: PieceMaterialGroup; ring: THREE.Mesh };
}

export function createPiece(type: PieceSymbol, color: Color, mats: PieceMaterials, shadows: boolean): PieceObject {
  const group = new THREE.Group() as PieceObject;
  const side = color === 'w' ? mats.w : mats.b;
  // Materiais próprios por peça para permitir brilho/dissolução individuais.
  const own = new Map<Role, THREE.MeshStandardMaterial>();
  const matFor = (role: Role) => {
    let m = own.get(role);
    if (!m) {
      m = side[role].clone();
      m.userData = { ...side[role].userData, keepGlow: role === 'gem' || (role === 'pave' && side.pave !== side.metal) };
      own.set(role, m);
    }
    return m;
  };
  matFor('base');
  for (const part of pieceParts(mats.style, type)) {
    const mesh = new THREE.Mesh(part.geo, matFor(part.role));
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  }
  const ringMesh = new THREE.Mesh(ringGeo, (color === 'w' ? mats.glowW : mats.glowB).clone());
  group.add(ringMesh);
  group.userData = { type, color, material: new PieceMaterialGroup([...own.values()]), ring: ringMesh };
  // Peças pretas olham para o lado das brancas (cavalos).
  if (color === 'b') group.rotation.y = Math.PI;
  return group;
}

export function disposePiece(p: PieceObject) {
  p.userData.material.dispose();
  (p.userData.ring.material as THREE.Material).dispose();
}
