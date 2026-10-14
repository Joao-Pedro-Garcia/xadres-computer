import * as THREE from 'three';

/** Textura circular suave para partículas, gerada por código. */
let dotTexture: THREE.Texture | null = null;
export function getDotTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  age: number;
  gravity: number;
  drag: number;
}

interface Shard {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  age: number;
}

interface Transient {
  obj: THREE.Object3D;
  life: number;
  age: number;
  update: (t: number, obj: THREE.Object3D) => void;
}

export interface BurstOptions {
  count: number;
  color: number;
  speed: number;
  life: number;
  size: number;
  gravity?: number;
  spread?: 'sphere' | 'ring' | 'up';
  drag?: number;
}

/** Sistema de efeitos: explosões de partículas, ondas de choque, feixes, runas e rastros. */
export class Fx {
  private bursts: Burst[] = [];
  private transients: Transient[] = [];
  private shards: Shard[] = [];
  private static shardGeos: THREE.BufferGeometry[] = [];
  /** Multiplicador global de partículas (0 = desligado). */
  density = 1;
  /** Falso quando o jogador pede redução de movimento: luzes piscantes e feixes ficam suaves. */
  intense = true;

  constructor(private scene: THREE.Scene) {}

  /** Teto de partículas simultâneas, para manter o desempenho em aparelhos modestos. */
  static readonly MAX_PARTICLES = 2500;
  private active = 0;

  burst(pos: THREE.Vector3, o: BurstOptions) {
    const n = Math.min(Math.round(o.count * this.density), Fx.MAX_PARTICLES - this.active);
    if (n <= 0) return;
    this.active += n;
    const positions = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions.set([pos.x, pos.y, pos.z], i * 3);
      let dx: number, dy: number, dz: number;
      if (o.spread === 'ring') {
        const a = Math.random() * Math.PI * 2;
        dx = Math.cos(a);
        dz = Math.sin(a);
        dy = Math.random() * 0.3;
      } else if (o.spread === 'up') {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.4;
        dx = Math.cos(a) * r;
        dz = Math.sin(a) * r;
        dy = 0.6 + Math.random() * 0.6;
      } else {
        dx = Math.random() * 2 - 1;
        dy = Math.random() * 2 - 1;
        dz = Math.random() * 2 - 1;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy = Math.abs(dy / l);
        dz /= l;
      }
      const s = o.speed * (0.4 + Math.random() * 0.8);
      vel.set([dx * s, dy * s, dz * s], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: o.color,
      size: o.size,
      map: getDotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.bursts.push({ points, vel, life: o.life, age: 0, gravity: o.gravity ?? -2, drag: o.drag ?? 1.5 });
  }

  /**
   * Estilhaça uma peça: fragmentos com o material dela voam, giram, quicam no
   * tabuleiro e se desfazem em brilho.
   */
  shatter(pos: THREE.Vector3, material: THREE.Material, glow: number, dir: THREE.Vector3, count = 26) {
    const n = Math.max(6, Math.round(count * Math.max(0.35, this.density)));
    if (!Fx.shardGeos.length) {
      Fx.shardGeos = [new THREE.TetrahedronGeometry(0.09), new THREE.OctahedronGeometry(0.07), new THREE.BoxGeometry(0.1, 0.06, 0.08), new THREE.TetrahedronGeometry(0.13)];
    }
    for (let i = 0; i < n; i++) {
      const mat = (material as THREE.MeshStandardMaterial).clone();
      mat.transparent = true;
      mat.emissive = new THREE.Color(glow);
      mat.emissiveIntensity = 1.4;
      const mesh = new THREE.Mesh(Fx.shardGeos[i % Fx.shardGeos.length], mat);
      mesh.position.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y + Math.random() * 0.7, pos.z + (Math.random() - 0.5) * 0.3);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const s = 0.6 + Math.random() * 0.9;
      mesh.scale.setScalar(s);
      const a = Math.random() * Math.PI * 2;
      const out = 1.2 + Math.random() * 2.4;
      const vel = new THREE.Vector3(Math.cos(a) * out + dir.x * 2.2, 2 + Math.random() * 3.2, Math.sin(a) * out + dir.z * 2.2);
      this.scene.add(mesh);
      this.shards.push({ mesh, vel, spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6), life: 1.3 + Math.random() * 0.6, age: 0 });
    }
  }

  shockwave(pos: THREE.Vector3, color: number, radius: number, life = 0.6) {
    const geo = new THREE.RingGeometry(0.85, 1, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.position.y += 0.02;
    this.add(m, life, (t, o) => {
      const s = 0.1 + t * radius;
      o.scale.set(s, 1, s);
      mat.opacity = 0.9 * (1 - t);
    });
  }

  beam(pos: THREE.Vector3, color: number, life = 0.7, height = 5) {
    const geo = new THREE.CylinderGeometry(0.12, 0.3, height, 24, 1, true);
    geo.translate(0, height / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    this.add(m, life, (t, o) => {
      mat.opacity = Math.sin(t * Math.PI) * 0.75;
      o.scale.set(1 - t * 0.6, 1, 1 - t * 0.6);
    });
  }

  runes(pos: THREE.Vector3, color: number, life = 1, radius = 0.6) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 64), mat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16), mat);
      rune.rotation.x = -Math.PI / 2;
      rune.rotation.z = a;
      rune.position.set(Math.cos(a) * radius * 0.78, 0, Math.sin(a) * radius * 0.78);
      group.add(rune);
    }
    group.position.copy(pos);
    group.position.y += 0.03;
    this.add(group, life, (t, o) => {
      o.rotation.y = t * Math.PI;
      const s = 0.6 + ease(t) * 0.5;
      o.scale.set(s, 1, s);
      mat.opacity = 0.85 * Math.sin(Math.min(1, t * 1.2) * Math.PI);
    });
  }

  flash(pos: THREE.Vector3, color: number, intensity = 6, life = 0.45) {
    if (!this.intense) intensity *= 0.35;
    const light = new THREE.PointLight(color, intensity, 5, 2);
    light.position.copy(pos);
    light.position.y += 0.6;
    this.add(light, life, (t) => {
      light.intensity = intensity * (1 - t);
    });
  }

  /** Rastro: emite pequenas explosões ao longo do tempo seguindo um objeto. */
  trail(target: THREE.Object3D, color: number, duration: number) {
    const holder = new THREE.Object3D();
    let acc = 0;
    let last = 0;
    this.add(holder, duration, (t) => {
      acc += t - last;
      last = t;
      if (acc > 0.06) {
        acc = 0;
        const p = target.position.clone();
        p.y += 0.3;
        this.burst(p, { count: 6, color, speed: 0.25, life: 0.5, size: 0.09, gravity: 0.2 });
      }
    });
  }

  private add(obj: THREE.Object3D, life: number, update: (t: number, obj: THREE.Object3D) => void) {
    this.scene.add(obj);
    this.transients.push({ obj, life, age: 0, update });
  }

  update(dt: number) {
    for (const b of this.bursts) {
      b.age += dt;
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const damp = Math.exp(-b.drag * dt);
      for (let i = 0; i < arr.length; i += 3) {
        b.vel[i] *= damp;
        b.vel[i + 1] = b.vel[i + 1] * damp + b.gravity * dt;
        b.vel[i + 2] *= damp;
        arr[i] += b.vel[i] * dt;
        arr[i + 1] = Math.max(0.02, arr[i + 1] + b.vel[i + 1] * dt);
        arr[i + 2] += b.vel[i + 2] * dt;
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / b.life);
    }
    for (const b of this.bursts.filter((x) => x.age >= x.life)) {
      this.active -= b.vel.length / 3;
      this.dispose(b.points);
    }
    this.bursts = this.bursts.filter((x) => x.age < x.life);

    for (const sh of this.shards) {
      sh.age += dt;
      sh.vel.y -= 9.8 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      if (sh.mesh.position.y < 0.04) {
        // Quica no tabuleiro perdendo energia.
        sh.mesh.position.y = 0.04;
        sh.vel.y = Math.abs(sh.vel.y) * 0.35;
        sh.vel.x *= 0.6;
        sh.vel.z *= 0.6;
        sh.spin.multiplyScalar(0.6);
      }
      sh.mesh.rotation.x += sh.spin.x * dt;
      sh.mesh.rotation.y += sh.spin.y * dt;
      sh.mesh.rotation.z += sh.spin.z * dt;
      const k = sh.age / sh.life;
      const mat = sh.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = Math.max(0, 1.4 - k * 2);
      mat.opacity = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
      if (k > 0.6) sh.mesh.scale.multiplyScalar(1 - dt * 1.5);
    }
    for (const sh of this.shards.filter((x) => x.age >= x.life)) {
      this.scene.remove(sh.mesh);
      (sh.mesh.material as THREE.Material).dispose();
    }
    this.shards = this.shards.filter((x) => x.age < x.life);

    for (const tr of this.transients) {
      tr.age += dt;
      tr.update(Math.min(1, tr.age / tr.life), tr.obj);
    }
    for (const tr of this.transients.filter((x) => x.age >= x.life)) this.dispose(tr.obj);
    this.transients = this.transients.filter((x) => x.age < x.life);
  }

  clear() {
    for (const b of this.bursts) this.dispose(b.points);
    for (const t of this.transients) this.dispose(t.obj);
    this.active = 0;
    for (const sh of this.shards) {
      this.scene.remove(sh.mesh);
      (sh.mesh.material as THREE.Material).dispose();
    }
    this.bursts = [];
    this.transients = [];
    this.shards = [];
  }

  private dispose(obj: THREE.Object3D) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

function ease(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
