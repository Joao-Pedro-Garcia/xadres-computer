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
  /** Multiplicador global de partículas (0 = desligado). */
  density = 1;
  /** Falso quando o jogador pede redução de movimento: luzes piscantes e feixes ficam suaves. */
  intense = true;

  constructor(private scene: THREE.Scene) {}

  burst(pos: THREE.Vector3, o: BurstOptions) {
    const n = Math.round(o.count * this.density);
    if (n <= 0) return;
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
    for (const b of this.bursts.filter((x) => x.age >= x.life)) this.dispose(b.points);
    this.bursts = this.bursts.filter((x) => x.age < x.life);

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
    this.bursts = [];
    this.transients = [];
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
