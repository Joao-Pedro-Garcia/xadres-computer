import * as THREE from 'three';
import type { Scenery } from '../meta/catalog';

/**
 * Cenário 3D ao redor do tabuleiro: pátio circular, braseiros com chamas e
 * objetos temáticos (pinheiros, cristais, obeliscos, agulhas, gelo, lava,
 * asteroides ou colunas). Tudo procedural; geometrias são compartilhadas.
 */
export class Environment {
  readonly group = new THREE.Group();
  private animated: { obj: THREE.Object3D; kind: 'bob' | 'flame' | 'orbit' | 'spin'; phase: number; base: THREE.Vector3; radius?: number; speed?: number }[] = [];

  build(sc: Scenery, quality: 'low' | 'medium' | 'high') {
    this.dispose();
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;

    // Pátio circular sob o tabuleiro, com borda rúnica brilhante.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(10.8, 96),
      new THREE.MeshStandardMaterial({ map: flagstones(sc.ground, sc.propGlow), roughness: 0.85, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.0;
    ground.receiveShadow = true;
    this.group.add(ground);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(10.8, 0.08, 8, 120),
      new THREE.MeshBasicMaterial({ color: sc.propGlow, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = -0.98;
    this.group.add(edge);
    // Base rochosa: o pátio é uma ilha flutuante.
    const rock = new THREE.Mesh(new THREE.ConeGeometry(10.8, 7, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 1, side: THREE.DoubleSide }));
    rock.rotation.x = Math.PI;
    rock.position.y = -1 - 3.5;
    this.group.add(rock);
    // Lajes concêntricas do pátio.
    for (const r of [7.9, 9.6]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 96), new THREE.MeshBasicMaterial({ color: sc.propGlow, transparent: true, opacity: 0.18, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.985;
      this.group.add(ring);
    }

    // Braseiros nas diagonais.
    if (sc.props !== 'asteroids' && sc.props !== 'iceShards') {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        this.brazier(new THREE.Vector3(Math.cos(a) * 7.7, -1, Math.sin(a) * 7.7), sc);
      }
    }

    // Objetos temáticos em anel ao redor do pátio.
    const count = Math.round(18 * density);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (i % 2) * 0.12;
      const r = 8.7 + (i % 3) * 0.7;
      this.prop(sc, new THREE.Vector3(Math.cos(a) * r, -1, Math.sin(a) * r), i);
    }
  }

  private brazier(at: THREE.Vector3, sc: Scenery) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.8, roughness: 0.4 });
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.2, 8), metal);
    stand.position.y = 0.6;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.28, 12, 1, true), metal);
    bowl.position.y = 1.32;
    const flameMat = new THREE.MeshBasicMaterial({ color: sc.propGlow, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 10, 1, true), flameMat);
    flame.position.y = 1.85;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = 1.7;
    g.add(stand, bowl, flame, core);
    g.position.copy(at);
    this.group.add(g);
    this.animated.push({ obj: flame, kind: 'flame', phase: Math.random() * 10, base: flame.position.clone() });
    this.animated.push({ obj: core, kind: 'flame', phase: Math.random() * 10, base: core.position.clone() });
  }

  private prop(sc: Scenery, at: THREE.Vector3, i: number) {
    const s = 0.8 + ((i * 37) % 10) / 20;
    const glow = (o = 0.85) => new THREE.MeshStandardMaterial({ color: sc.propColor, emissive: new THREE.Color(sc.propGlow), emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: o });
    const solid = new THREE.MeshStandardMaterial({ color: sc.propColor, roughness: 0.8 });
    const g = new THREE.Group();
    switch (sc.props) {
      case 'pines': {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.9 }));
        trunk.position.y = 0.4;
        g.add(trunk);
        // Pinheiro em camadas com pontas caídas e leve variação de tom.
        for (let k = 0; k < 4; k++) {
          const layer = new THREE.ConeGeometry(0.95 - k * 0.2, 1.0, 18, 1, true);
          const pos = layer.attributes.position;
          for (let v = 0; v < pos.count; v++) {
            if (pos.getY(v) < -0.4) pos.setY(v, pos.getY(v) - 0.12 * Math.abs(Math.sin(v * 1.7)));
          }
          layer.computeVertexNormals();
          const tone = solid.clone();
          tone.color.offsetHSL(0, 0, k * 0.035);
          tone.side = THREE.DoubleSide;
          const c = new THREE.Mesh(layer, tone);
          c.position.y = 1.0 + k * 0.5;
          c.rotation.y = k * 0.7;
          g.add(c);
        }
        if (i % 3 === 0) {
          // Lanterna mágica pendurada.
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: sc.propGlow }));
          lamp.position.set(0.5, 1.4, 0);
          g.add(lamp);
          this.animated.push({ obj: lamp, kind: 'bob', phase: i, base: lamp.position.clone() });
        }
        break;
      }
      case 'crystals': {
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 1), glow());
          c.scale.set(0.7, 2.6 - k * 0.5, 0.7);
          c.position.set((k - 1) * 0.4, 0.9 + k * 0.1, (k % 2) * 0.3);
          c.rotation.z = (k - 1) * 0.25;
          g.add(c);
        }
        const floating = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glow(0.95));
        floating.position.y = 2.6;
        g.add(floating);
        this.animated.push({ obj: floating, kind: 'bob', phase: i * 1.3, base: floating.position.clone() });
        break;
      }
      case 'obelisks': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: sc.propColor, metalness: 0.7, roughness: 0.3 }));
        body.position.y = 1.3;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 4), glow(1));
        tip.position.y = 2.9;
        tip.rotation.y = Math.PI / 4;
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), glow(1));
        band.position.y = 2.0;
        g.add(body, tip, band);
        break;
      }
      case 'spires': {
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.35 - k * 0.07, 2.4 - k * 0.5, 7), new THREE.MeshStandardMaterial({ color: sc.propColor, metalness: 0.6, roughness: 0.15, emissive: new THREE.Color(sc.propGlow), emissiveIntensity: 0.25 }));
          c.position.set((k - 1) * 0.45, (2.4 - k * 0.5) / 2, (k % 2) * 0.3);
          c.rotation.z = (k - 1) * 0.2;
          g.add(c);
        }
        break;
      }
      case 'iceShards': {
        const ice = new THREE.MeshStandardMaterial({ color: sc.propColor, emissive: new THREE.Color(sc.propGlow), emissiveIntensity: 0.25, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8 });
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.8 - k * 0.3, 8), ice);
          c.position.set(Math.cos(k * 1.7) * 0.35, (1.8 - k * 0.3) / 2, Math.sin(k * 1.7) * 0.35);
          c.rotation.set(Math.cos(k) * 0.3, 0, Math.sin(k) * 0.3);
          g.add(c);
        }
        break;
      }
      case 'lavaRocks': {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: sc.propColor, roughness: 0.9, emissive: new THREE.Color(sc.propGlow), emissiveIntensity: 0.35 }));
        rock.position.y = 0.4;
        rock.scale.set(1, 0.8, 1.1);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: sc.propGlow, transparent: true, opacity: 0.7 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(0.8, 0.02, 0.3);
        g.add(rock, pool);
        this.animated.push({ obj: pool, kind: 'flame', phase: i, base: pool.position.clone() });
        break;
      }
      case 'asteroids': {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: sc.propColor, roughness: 0.8, emissive: new THREE.Color(sc.propGlow), emissiveIntensity: 0.15 }));
        rock.scale.set(1, 0.7, 0.9);
        g.add(rock);
        g.position.copy(at).setY(0.5 + (i % 4) * 0.7);
        this.group.add(g);
        this.animated.push({ obj: g, kind: 'orbit', phase: Math.atan2(at.z, at.x), base: g.position.clone(), radius: Math.hypot(at.x, at.z), speed: 0.04 + (i % 3) * 0.015 });
        this.animated.push({ obj: rock, kind: 'spin', phase: i, base: rock.position.clone() });
        return;
      }
      case 'columns': {
        const h = i % 3 === 0 ? 1.0 : 2.4;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, h, 20), new THREE.MeshStandardMaterial({ color: sc.propColor, roughness: 0.35 }));
        col.position.y = h / 2;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.75), col.material);
        cap.position.y = h + 0.08;
        g.add(col);
        if (h > 2) g.add(cap);
        if (i % 2) {
          const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.9 }));
          bush.position.set(0.7, 0.3, 0.2);
          g.add(bush);
        }
        break;
      }
    }
    g.position.copy(at);
    g.scale.setScalar(s);
    g.rotation.y = i * 1.37;
    this.group.add(g);
  }

  update(time: number) {
    for (const a of this.animated) {
      if (a.kind === 'bob') {
        a.obj.position.y = a.base.y + Math.sin(time * 1.4 + a.phase) * 0.15;
        a.obj.rotation.y = time * 0.8 + a.phase;
      } else if (a.kind === 'flame') {
        const f = 0.85 + Math.sin(time * 13 + a.phase) * 0.08 + Math.sin(time * 7.3 + a.phase * 2) * 0.07;
        a.obj.scale.set(f, 0.9 + (1 - f) * 2 + Math.sin(time * 9 + a.phase) * 0.12, f);
      } else if (a.kind === 'orbit') {
        const ang = a.phase + time * (a.speed ?? 0.05);
        a.obj.position.set(Math.cos(ang) * a.radius!, a.base.y + Math.sin(time * 0.7 + a.phase) * 0.3, Math.sin(ang) * a.radius!);
      } else if (a.kind === 'spin') {
        a.obj.rotation.x = time * 0.3 + a.phase;
        a.obj.rotation.y = time * 0.2;
      }
    }
  }

  dispose() {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      geos.add(m.geometry);
      mats.add(m.material as THREE.Material);
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    this.group.clear();
    this.animated = [];
  }
}

/** Piso de lajes de pedra em anéis, com juntas, musgo/pó e runas sutis. */
const flagCache = new Map<string, THREE.CanvasTexture>();
function flagstones(base: number, glow: number): THREE.CanvasTexture {
  const key = `${base}:${glow}`;
  const hit = flagCache.get(key);
  if (hit) return hit;
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const col = new THREE.Color(base);
  const shade = (k: number, a = 1) => {
    const x = col.clone().offsetHSL(0, -0.05, k);
    return `rgba(${Math.round(x.r * 255)},${Math.round(x.g * 255)},${Math.round(x.b * 255)},${a})`;
  };
  g.fillStyle = shade(-0.12);
  g.fillRect(0, 0, N, N);
  const cx = N / 2;
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Anéis de lajes do centro para fora.
  for (let ring = 0, r0 = N * 0.06; r0 < N * 0.5; ring++) {
    const width = N * (0.045 + ring * 0.002);
    const r1 = r0 + width;
    const count = Math.max(6, Math.round((2 * Math.PI * (r0 + width / 2)) / (width * 1.4)));
    for (let i = 0; i < count; i++) {
      const a0 = (i / count) * Math.PI * 2 + ring * 0.37;
      const a1 = ((i + 1) / count) * Math.PI * 2 + ring * 0.37;
      g.beginPath();
      g.arc(cx, cx, r1 - 3, a0 + 0.012, a1 - 0.012);
      g.arc(cx, cx, r0 + 3, a1 - 0.012, a0 + 0.012, true);
      g.closePath();
      g.fillStyle = shade((rnd() - 0.5) * 0.08);
      g.fill();
    }
    r0 = r1;
  }
  // Textura: pontos de desgaste e musgo.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? shade(0.08, 0.15) : shade(-0.2, 0.18);
    g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  // Anel rúnico gravado.
  const gc = new THREE.Color(glow);
  g.strokeStyle = `rgba(${Math.round(gc.r * 255)},${Math.round(gc.g * 255)},${Math.round(gc.b * 255)},0.16)`;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cx, N * 0.4, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * N * 0.385, cx + Math.sin(a) * N * 0.385);
    g.lineTo(cx + Math.cos(a + 0.05) * N * 0.415, cx + Math.sin(a + 0.05) * N * 0.415);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  flagCache.set(key, tex);
  return tex;
}
