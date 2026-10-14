import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Chess } from 'chess.js';
import type { Color, GameEvent, MovementPowerId, PieceSymbol, Square, UtilityPowerId } from '../core/types';
import { FILES, fileOf, rankOf, toSquare } from '../core/squares';
import { PIECE_SKINS, type CaptureFxDef, type PieceSkinDef, type ThemeDef } from '../meta/catalog';
import { createPiece, createPieceMaterials, disposePiece, disposePieceMaterials, type PieceMaterials, type PieceObject } from './pieces';
import { Fx, getDotTexture } from './fx';
import { paintPanorama } from './backdrop';
import { Environment } from './environment';
import { ease, Tweens } from './tween';
import { constellation, disposeTree, enchantedTree, ghostTrail, mysticEye, roots, royalCrown, starVortex, stonePillars, type SpellCtx } from './spells';

export interface Highlights {
  selected?: Square | null;
  moves?: Square[];
  captures?: Square[];
  powerTargets?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  check?: Square | null;
}

export interface EffectsView {
  zones: { owner: Color; kind: 'shield' | 'wall'; squares: Square[] }[];
  vision: { threatened: Square[]; attackers: Square[]; danger: Square[]; safe: Square[] } | null;
  viewer: Color;
}

export interface RenderOptions {
  quality: 'low' | 'medium' | 'high';
  /** Quando verdadeiro, a resolução é reduzida automaticamente se o FPS cair. */
  autoQuality: boolean;
  shadows: boolean;
  particles: 'off' | 'reduced' | 'full';
  cameraMotion: boolean;
  reduceMotion: boolean;
  coordinates: boolean;
  animations: 'full' | 'skip';
  animationSpeed: number;
  cameraSensitivity: number;
  touchRotate: 'oneFinger' | 'twoFingers';
  highContrast: boolean;
}

const PIECE_FX: Record<PieceSymbol, { color: number; color2: number }> = {
  k: { color: 0xffd27a, color2: 0x4fa8ff },
  q: { color: 0x9a7bff, color2: 0x5fc8ff },
  r: { color: 0x5fa0ff, color2: 0xffffff },
  b: { color: 0x7ae0ff, color2: 0xffe7a0 },
  n: { color: 0x5fc8ff, color2: 0xffd27a },
  p: { color: 0x8ab8ff, color2: 0xffffff },
};

export function squareToPos(sq: Square, y = 0): THREE.Vector3 {
  return new THREE.Vector3(fileOf(sq) - 3.5, y, 3.5 - rankOf(sq));
}

export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private fx: Fx;
  private tweens = new Tweens();
  private clock = new THREE.Timer();
  private pieces = new Map<Square, PieceObject>();
  private boardGroup = new THREE.Group();
  private squareMeshes: THREE.Mesh[] = [];
  private lightMat = new THREE.MeshStandardMaterial();
  private darkMat = new THREE.MeshStandardMaterial();
  private frameMat = new THREE.MeshStandardMaterial();
  private inlayMat = new THREE.MeshStandardMaterial({ color: 0xd4a84a, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a08 });
  private hlGroup = new THREE.Group();
  private effectGroup = new THREE.Group();
  private coordGroup = new THREE.Group();
  private pulseMats: THREE.MeshBasicMaterial[] = [];
  private pieceMats: PieceMaterials;
  private theme: ThemeDef | null = null;
  private ambient = new THREE.HemisphereLight(0xffffff, 0x202030, 0.6);
  private keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  private rimLight = new THREE.DirectionalLight(0x4f8dff, 1.2);
  private accentA = new THREE.PointLight(0x4f8dff, 6, 9, 2);
  private accentB = new THREE.PointLight(0xffc24a, 4, 9, 2);
  private motes: THREE.Points | null = null;
  private weather: ThemeDef['scenery']['weather'] = 'motes';
  private env = new Environment();
  private panorama: THREE.CanvasTexture | null = null;
  private static panoramaCache = new Map<string, THREE.CanvasTexture>();
  private stars: THREE.Points | null = null;
  private runeCircle: THREE.Mesh | null = null;
  private mode: 'menu' | 'game' = 'menu';
  private orientation: Color = 'w';
  private opts: RenderOptions = {
    quality: 'high',
    autoQuality: false,
    shadows: true,
    particles: 'full',
    cameraMotion: true,
    reduceMotion: false,
    coordinates: true,
    animations: 'full',
    animationSpeed: 1,
    cameraSensitivity: 1,
    touchRotate: 'oneFinger',
    highContrast: false,
  };
  /** Redução dinâmica de resolução no modo automático. */
  private autoScale = 1;
  private fpsFrames = 0;
  private fpsTime = 0;
  private trailColor = 0x5fc8ff;
  private captureFx: CaptureFxDef = { id: 'standard', intensity: 1, tint: null };
  private selected: PieceObject | null = null;
  private shake = 0;
  private menuAngle = 0;
  private raf = 0;
  private running = false;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  onSquareTap: (sq: Square | null) => void = () => {};
  onContextChange: (lost: boolean) => void = () => {};
  private contextLost = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add('board-canvas');

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 9, 8.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 19;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.32;
    this.controls.rotateSpeed = 0.7;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('change', () => this.clampTarget());

    this.buildEnvironment();
    // Perda de contexto WebGL (comum em celulares ao trocar de app): pausa e recupera sem perder a partida.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.stop();
      this.onContextChange(true);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.buildEnvironment();
      this.keyLight.shadow.map?.dispose();
      (this.keyLight.shadow as { map: unknown }).map = null;
      this.start();
      this.onContextChange(false);
    });

    this.fx = new Fx(this.scene);
    this.pieceMats = createPieceMaterials(PIECE_SKINS[0]);

    this.buildLights();
    this.buildBoard();
    this.scene.add(this.boardGroup, this.hlGroup, this.effectGroup, this.coordGroup, this.env.group);
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  /** Reflexos de ambiente; se o aparelho não suportar, usa só a iluminação direta (alternativa leve). */
  private buildEnvironment() {
    try {
      this.scene.environment?.dispose();
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.scene.environmentIntensity = 0.45;
    } catch (err) {
      console.warn('Reflexos indisponíveis; usando iluminação simples.', err);
      this.scene.environment = null;
      this.ambient.intensity = 1;
    }
  }

  static supported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  /* ----------------------------- Montagem ----------------------------- */

  private buildLights() {
    this.keyLight.position.set(4, 12, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const sc = this.keyLight.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 30;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.rimLight.position.set(-6, 5, -8);
    this.accentA.position.set(-5, 2.5, 3);
    this.accentB.position.set(5, 2.5, -3);
    this.scene.add(this.ambient, this.keyLight, this.rimLight, this.accentA, this.accentB);
  }

  private grainTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * 256;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,120,120'},${0.05 + Math.random() * 0.12})`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 6);
      g.stroke();
    }
    const img = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private buildBoard() {
    const grain = this.grainTexture();
    this.lightMat.map = grain;
    this.darkMat.map = grain;
    const sqGeo = new THREE.BoxGeometry(1, 0.16, 1);
    sqGeo.translate(0, -0.08, 0);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const light = (f + r) % 2 === 1;
        const m = new THREE.Mesh(sqGeo, light ? this.lightMat : this.darkMat);
        m.position.set(f - 3.5, 0, 3.5 - r);
        m.receiveShadow = true;
        m.userData.square = toSquare(f, r);
        this.squareMeshes.push(m);
        this.boardGroup.add(m);
      }
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.36, 9.3), this.frameMat);
    frame.position.y = -0.2;
    frame.receiveShadow = true;
    this.boardGroup.add(frame);
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(8.24, 0.03, 8.24), this.inlayMat);
    inlay.position.y = -0.03;
    this.boardGroup.add(inlay);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.8, 0.6, 64), this.frameMat);
    base.position.y = -0.7;
    base.receiveShadow = true;
    this.boardGroup.add(base);

    // Círculo rúnico sob o tabuleiro.
    const runeMat = new THREE.MeshBasicMaterial({ color: 0x4f8dff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rune = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.35, 128), runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = -0.98;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.4), runeMat);
      tick.position.set(Math.cos(a) * 7.7, Math.sin(a) * 7.7, 0);
      tick.rotation.z = a + Math.PI / 2;
      rune.add(tick);
    }
    this.runeCircle = rune;
    this.scene.add(rune);
  }

  private buildMotes() {
    if (this.motes) {
      this.scene.remove(this.motes);
      this.motes.geometry.dispose();
      (this.motes.material as THREE.Material).dispose();
      this.motes = null;
    }
    const base = this.weather === 'snow' ? 420 : 260;
    const n = this.opts.particles === 'off' ? 0 : this.opts.particles === 'reduced' ? Math.round(base * 0.35) : base;
    if (!n) return;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 22, Math.random() * 7 - 0.8, (Math.random() - 0.5) * 22], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const w = this.weather;
    const color = w === 'snow' ? 0xffffff : w === 'embers' ? 0xff8a3a : w === 'fireflies' ? 0xd8ff7a : this.theme?.particle ?? 0xffd27a;
    const size = w === 'snow' ? 0.1 : w === 'fireflies' ? 0.12 : 0.07;
    const mat = new THREE.PointsMaterial({ color, size, map: getDotTexture(), transparent: true, opacity: w === 'snow' ? 0.85 : 0.75, depthWrite: false, blending: w === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  private buildStars(count: number) {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
    if (!count) return;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 30);
      v.y = Math.abs(v.y) * 0.8 - 5;
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, map: getDotTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(this.stars);
  }

  private buildCoordinates() {
    BoardView.disposeGroup(this.coordGroup);
    if (!this.opts.coordinates) return;
    const make = (text: string) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.font = '600 40px Inter, system-ui, sans-serif';
      g.fillStyle = '#e8d6a0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 32, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      if (this.orientation === 'b') m.rotation.z = Math.PI;
      return m;
    };
    const edge = this.orientation === 'w' ? 4.32 : -4.32;
    for (let i = 0; i < 8; i++) {
      const f = make(FILES[i]);
      f.position.set(i - 3.5, 0.005, edge);
      const r = make(String(i + 1));
      r.position.set(this.orientation === 'w' ? -4.32 : 4.32, 0.005, 3.5 - i);
      this.coordGroup.add(f, r);
    }
  }

  /* ----------------------------- Configuração ----------------------------- */

  setTheme(theme: ThemeDef) {
    this.theme = theme;
    this.lightMat.color.setHex(theme.light);
    this.darkMat.color.setHex(theme.dark);
    for (const m of [this.lightMat, this.darkMat]) {
      m.roughness = theme.roughness;
      m.metalness = theme.metalness;
      m.emissive.setHex(theme.emissiveBoard ?? 0);
      m.needsUpdate = true;
    }
    this.frameMat.color.setHex(theme.frame);
    this.frameMat.roughness = 0.4;
    this.frameMat.metalness = 0.3;
    const sc = theme.scenery;
    this.panorama = this.getPanorama(theme);
    this.scene.background = this.panorama;
    this.scene.fog = new THREE.Fog(sc.mist, 24, 70);
    this.env.build(sc, this.opts.quality);
    if (this.weather !== sc.weather) {
      this.weather = sc.weather;
      this.buildMotes();
    }
    this.ambient.color.setHex(theme.ambient);
    this.keyLight.color.setHex(theme.key);
    this.rimLight.color.setHex(theme.rim);
    this.accentA.color.setHex(theme.rim);
    this.accentB.color.setHex(theme.particle);
    if (this.runeCircle) (this.runeCircle.material as THREE.MeshBasicMaterial).color.setHex(theme.rim);
    if (this.motes) (this.motes.material as THREE.PointsMaterial).color.setHex(theme.particle);
    // O céu estrelado agora faz parte do panorama pintado.
    this.buildStars(0);
  }

  /** Panorama pintado do tema (em cache por tema e resolução). */
  private getPanorama(theme: ThemeDef): THREE.CanvasTexture {
    const H = this.opts.quality === 'low' ? 512 : this.opts.quality === 'medium' ? 768 : 1024;
    const key = `${theme.id}:${H}`;
    let tex = BoardView.panoramaCache.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = H * 4;
      c.height = H;
      paintPanorama(c, theme.scenery, 0.5);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      BoardView.panoramaCache.set(key, tex);
    }
    return tex;
  }

  /** O panorama acompanha a rotação da câmera (como um céu distante) e mantém a proporção. */
  private updatePanorama() {
    const tex = this.panorama;
    if (!tex) return;
    const rx = Math.min(1, this.camera.aspect / 4);
    const azimuth = Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    // Com a câmera inclinada para baixo (jogo), o panorama desce para o castelo
    // continuar visível acima do tabuleiro; com a câmera baixa (menu), fica no lugar.
    const d = this.camera.position.clone().sub(this.controls.target);
    const polar = Math.acos(THREE.MathUtils.clamp(d.y / d.length(), -1, 1));
    const dy = this.mode === 'menu' ? 0 : THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(polar, 0.55, 1.15, -0.24, 0), -0.24, 0);
    tex.repeat.set(rx, 1);
    tex.offset.set(0.5 - azimuth / (Math.PI * 2) - rx / 2, dy);
  }

  setSkin(skin: PieceSkinDef, fen?: string) {
    disposePieceMaterials(this.pieceMats);
    this.pieceMats = createPieceMaterials(skin, this.opts.quality === 'low');
    if (fen) this.syncPieces(fen, true);
  }

  setTrail(color: number) {
    this.trailColor = color;
  }

  setCaptureFx(def: CaptureFxDef) {
    this.captureFx = def;
  }

  setOptions(o: RenderOptions) {
    // Redução de movimento desliga movimentos de câmera e tremores.
    this.opts = { ...o, cameraMotion: o.cameraMotion && !o.reduceMotion };
    o = this.opts;
    this.autoScale = 1;
    this.applyPixelRatio();
    this.controls.rotateSpeed = 0.7 * o.cameraSensitivity;
    this.controls.zoomSpeed = o.cameraSensitivity;
    this.controls.panSpeed = o.cameraSensitivity;
    // Em 'twoFingers', um dedo nunca gira a câmera (evita giros acidentais ao tocar nas peças).
    this.controls.touches = o.touchRotate === 'twoFingers'
      ? { ONE: null as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.renderer.shadowMap.enabled = o.shadows;
    this.keyLight.castShadow = o.shadows;
    this.keyLight.shadow.mapSize.set(o.quality === 'high' ? 2048 : 1024, o.quality === 'high' ? 2048 : 1024);
    this.keyLight.shadow.map?.dispose();
    (this.keyLight.shadow as { map: unknown }).map = null;
    this.pieces.forEach((p) => p.children.forEach((c) => ((c as THREE.Mesh).castShadow = o.shadows && c !== p.userData.ring)));
    this.fx.density = o.particles === 'off' ? 0 : o.particles === 'reduced' ? 0.45 : 1;
    this.tweens.speed = o.animationSpeed;
    this.fx.intense = !o.reduceMotion;
    this.accentA.visible = this.accentB.visible = o.quality !== 'low';
    this.buildMotes();
    this.buildCoordinates();
    if (this.theme) this.setTheme(this.theme);
    this.resize();
  }

  private applyPixelRatio() {
    const pr = this.opts.quality === 'low' ? 1 : this.opts.quality === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.max(0.75, Math.min(window.devicePixelRatio || 1, pr) * this.autoScale));
  }

  /** Modo automático: mede o FPS e reduz a resolução se o aparelho não acompanhar. */
  private adaptQuality(dt: number) {
    if (!this.opts.autoQuality || document.hidden) return;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 3) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    if (fps < 40 && this.autoScale > 0.6) {
      this.autoScale -= 0.15;
      this.applyPixelRatio();
      if (this.autoScale < 0.8 && this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.keyLight.castShadow = false;
      }
    } else if (fps > 57 && this.autoScale < 1) {
      this.autoScale = Math.min(1, this.autoScale + 0.1);
      this.applyPixelRatio();
    }
  }

  setMode(mode: 'menu' | 'game') {
    this.mode = mode;
    this.controls.enabled = mode === 'game';
    this.clearHighlights();
    this.effectGroup.clear();
    if (mode === 'game') this.resetCamera(true);
  }

  setOrientation(color: Color) {
    this.orientation = color;
    this.buildCoordinates();
  }

  /** Distância que garante que o tabuleiro inteiro caiba na tela (importante em celulares em pé). */
  private fitDistance(): number {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const byWidth = 5.0 / Math.tan(hFov / 2);
    return Math.max(12.5, byWidth);
  }

  resetCamera(instant = false) {
    const d = this.fitDistance();
    this.controls.maxDistance = Math.max(19, d * 1.35);
    // Em telas estreitas, a câmera fica mais alta para aproveitar a altura.
    const elev = this.camera.aspect < 0.8 ? 0.95 : 0.8;
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev) * (this.orientation === 'w' ? 1 : -1));
    const target = new THREE.Vector3(0, 0, 0);
    const pos = dir.multiplyScalar(d);
    this.stopCameraInertia();
    if (instant || !this.opts.cameraMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.stopCameraInertia();
      return;
    }
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    void this.tweens.run(700, (t) => {
      this.camera.position.lerpVectors(p0, pos, t);
      this.controls.target.lerpVectors(t0, target, t);
      this.stopCameraInertia();
    });
  }

  /** Zera a inércia (amortecimento) restante de giros/zoom anteriores. */
  private stopCameraInertia() {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  private clampTarget() {
    const t = this.controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -3.5, 3.5);
    t.z = THREE.MathUtils.clamp(t.z, -3.5, 3.5);
    t.y = THREE.MathUtils.clamp(t.y, -0.5, 1.5);
  }

  /* ----------------------------- Entrada ----------------------------- */

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.pointerDown;
      this.pointerDown = null;
      if (!d || this.mode !== 'game') return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const tolerance = e.pointerType === 'touch' ? 14 : 7;
      if (moved > tolerance || performance.now() - d.t > 700) return;
      this.onSquareTap(this.pick(e.clientX, e.clientY));
    });
  }

  private raycaster = new THREE.Raycaster();

  pick(clientX: number, clientY: number): Square | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Peças primeiro (são altas e cobrem casas ao fundo).
    const objs = [...this.pieces.values()];
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !objs.includes(o as PieceObject)) o = o.parent;
      if (o) {
        for (const [sq, p] of this.pieces) if (p === o) return sq;
      }
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, pt)) return null;
    const f = Math.floor(pt.x + 4);
    const r = Math.floor(4 - pt.z);
    return toSquare(f, r);
  }

  /* ----------------------------- Peças ----------------------------- */

  syncPieces(fen: string, rebuild = false) {
    const board = new Chess(fen, { skipValidation: true }).board();
    const want = new Map<Square, { type: PieceSymbol; color: Color }>();
    for (const row of board) for (const p of row) if (p) want.set(p.square, { type: p.type, color: p.color });
    for (const [sq, obj] of [...this.pieces]) {
      const w = want.get(sq);
      if (rebuild || !w || w.type !== obj.userData.type || w.color !== obj.userData.color) {
        this.removePiece(sq);
      }
    }
    for (const [sq, w] of want) {
      if (!this.pieces.has(sq)) this.addPiece(sq, w.type, w.color);
      const obj = this.pieces.get(sq)!;
      obj.position.copy(squareToPos(sq));
      obj.scale.setScalar(1);
      obj.visible = true;
      obj.userData.material.opacity = 1;
      obj.userData.material.transparent = false;
      obj.userData.material.emissiveIntensity = 0;
    }
    if (this.selected && ![...this.pieces.values()].includes(this.selected)) this.selected = null;
  }

  private addPiece(sq: Square, type: PieceSymbol, color: Color): PieceObject {
    const p = createPiece(type, color, this.pieceMats, this.opts.shadows);
    p.position.copy(squareToPos(sq));
    this.scene.add(p);
    this.pieces.set(sq, p);
    return p;
  }

  private removePiece(sq: Square) {
    const p = this.pieces.get(sq);
    if (!p) return;
    this.scene.remove(p);
    disposePiece(p);
    this.pieces.delete(sq);
  }

  /* ----------------------------- Destaques ----------------------------- */

  /** Geometrias de destaque compartilhadas: criadas uma vez e reutilizadas a cada lance. */
  private static geoCache = new Map<string, THREE.BufferGeometry>();
  private static geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = BoardView.geoCache.get(key);
    if (!g) {
      g = make();
      BoardView.geoCache.set(key, g);
    }
    return g;
  }
  private static plane(size: number) {
    return BoardView.geo(`plane:${size}`, () => new THREE.PlaneGeometry(size, size));
  }
  private static circle(r: number) {
    return BoardView.geo(`circle:${r}`, () => new THREE.CircleGeometry(r, 32));
  }
  private static ring(inner: number, outer: number, seg: number, rot = 0) {
    return BoardView.geo(`ring:${inner}:${outer}:${seg}:${rot}`, () => {
      const g = new THREE.RingGeometry(inner, outer, seg);
      if (rot) g.rotateZ(rot);
      return g;
    });
  }

  /** Libera materiais/texturas de um grupo; geometrias compartilhadas do cache são mantidas. */
  private static disposeGroup(group: THREE.Object3D) {
    const cached = new Set(BoardView.geoCache.values());
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!cached.has(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    group.clear();
  }

  private clearHighlights() {
    BoardView.disposeGroup(this.hlGroup);
    this.pulseMats = [];
  }

  private overlay(sq: Square, geo: THREE.BufferGeometry, color: number, opacity: number, y = 0.012, pulse = false, additive = false) {
    if (this.opts.highContrast) opacity = Math.min(1, opacity * 1.6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    mat.userData.base = opacity;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(squareToPos(sq, y));
    m.renderOrder = 2;
    if (pulse) this.pulseMats.push(mat);
    return m;
  }

  setHighlights(h: Highlights) {
    this.clearHighlights();
    if (h.lastMove) {
      for (const s of [h.lastMove.from, h.lastMove.to]) this.hlGroup.add(this.overlay(s, BoardView.plane(0.96), 0x2f6bff, 0.3));
    }
    if (h.check) {
      this.hlGroup.add(this.overlay(h.check, BoardView.circle(0.48), 0xff3040, 0.6, 0.014, true, true));
    }
    if (h.selected) {
      this.hlGroup.add(this.overlay(h.selected, BoardView.ring(0.4, 0.48, 40), 0xffd27a, 0.9, 0.016, true, true));
      this.hlGroup.add(this.overlay(h.selected, BoardView.plane(0.96), 0xffb030, 0.35));
    }
    for (const s of h.moves ?? []) this.hlGroup.add(this.overlay(s, BoardView.circle(0.14), 0x1e8cff, 0.85, 0.016));
    for (const s of h.captures ?? []) this.hlGroup.add(this.overlay(s, BoardView.ring(0.36, 0.46, 36), 0xff9a1a, 0.9, 0.016, true));
    for (const s of h.powerTargets ?? []) {
      const ring = BoardView.ring(0.22, 0.34, 4, Math.PI / 4);
      this.hlGroup.add(this.overlay(s, ring, 0x8a4bff, 0.95, 0.017, true));
      this.hlGroup.add(this.overlay(s, BoardView.plane(0.94), 0x7a4bff, 0.28));
    }
    // Brilho da peça selecionada.
    if (this.selected) this.selected.userData.material.emissiveIntensity = 0;
    this.selected = h.selected ? this.pieces.get(h.selected) ?? null : null;
    if (this.selected) this.selected.userData.material.emissiveIntensity = 0.28;
  }

  setEffects(e: EffectsView | null) {
    BoardView.disposeGroup(this.effectGroup);
    if (!e) return;
    for (const z of e.zones) {
      const mine = z.owner === e.viewer;
      const color = mine ? 0x4fd0ff : 0xff5a8a;
      for (const s of z.squares) {
        const tile = this.overlay(s, BoardView.plane(0.9), color, 0.12, 0.011);
        this.effectGroup.add(tile);
        if (z.kind === 'wall') {
          const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.5, 0.9),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }),
          );
          pillar.position.copy(squareToPos(s, 0.25));
          this.effectGroup.add(pillar);
        }
      }
      if (z.kind === 'shield' && z.squares.length) {
        const c = z.squares.reduce((acc, s) => acc.add(squareToPos(s)), new THREE.Vector3()).divideScalar(z.squares.length);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(2.2, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }),
        );
        dome.position.copy(c);
        this.effectGroup.add(dome);
      }
    }
    if (e.vision) {
      for (const s of e.vision.danger) this.effectGroup.add(this.overlay(s, BoardView.plane(0.92), 0xff4040, 0.16, 0.013));
      for (const s of e.vision.safe) this.effectGroup.add(this.overlay(s, BoardView.plane(0.92), 0x40ff9a, 0.1, 0.013));
      for (const s of e.vision.threatened) this.effectGroup.add(this.overlay(s, BoardView.ring(0.38, 0.47, 6), 0xff8a2a, 0.95, 0.018));
      for (const s of e.vision.attackers) this.effectGroup.add(this.overlay(s, BoardView.ring(0.3, 0.38, 3), 0xff3030, 0.95, 0.018));
    }
  }

  /* ----------------------------- Animações ----------------------------- */

  skipAnimations() {
    this.tweens.finishAll();
  }

  get animating() {
    return this.tweens.busy;
  }

  /**
   * Executa as animações de um resultado já validado pelo motor e, ao final,
   * sincroniza o tabuleiro com o FEN oficial (a animação nunca decide o resultado).
   */
  async animate(events: GameEvent[], fenAfter: string): Promise<void> {
    if (this.opts.animations === 'skip') {
      for (const ev of events) this.quickFx(ev);
      this.syncPieces(fenAfter);
      return;
    }
    try {
      for (const ev of events) {
        if (ev.type === 'move') await this.animateMove(ev);
        else if (ev.type === 'powerMove') await this.animatePowerMove(ev);
        else if (ev.type === 'powerUtility') await this.animateUtility(ev);
      }
    } finally {
      this.syncPieces(fenAfter);
    }
  }

  private quickFx(ev: GameEvent) {
    if (ev.type === 'move' && ev.capturedSquare) {
      this.fx.burst(squareToPos(ev.capturedSquare, 0.4), { count: 24, color: PIECE_FX[ev.piece].color, speed: 2, life: 0.6, size: 0.12 });
    }
  }

  private arc(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, height: number, ms: number, e = ease.inOut) {
    return this.tweens.run(
      ms,
      (t) => {
        obj.position.lerpVectors(from, to, t);
        obj.position.y = from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * height;
      },
      e,
    );
  }

  private focus(target: THREE.Vector3, ms = 400) {
    if (!this.opts.cameraMotion) return Promise.resolve();
    const t0 = this.controls.target.clone();
    const goal = t0.clone().lerp(new THREE.Vector3(target.x, 0, target.z), 0.35);
    return this.tweens.run(ms, (t) => {
      this.controls.target.lerpVectors(t0, goal, t);
    });
  }

  private unfocus(ms = 600) {
    if (!this.opts.cameraMotion) return Promise.resolve();
    const t0 = this.controls.target.clone();
    return this.tweens.run(ms, (t) => {
      this.controls.target.lerpVectors(t0, new THREE.Vector3(0, 0, 0), t);
    });
  }

  private async animateMove(ev: Extract<GameEvent, { type: 'move' }>) {
    const obj = this.pieces.get(ev.from);
    if (!obj) return;
    const from = squareToPos(ev.from);
    const to = squareToPos(ev.to);
    const rookObj = ev.rook ? this.pieces.get(ev.rook.from) : undefined;
    if (ev.captured && ev.capturedSquare) {
      const victim = this.pieces.get(ev.capturedSquare);
      await this.captureSequence(ev.piece, obj, victim ?? null, from, to, squareToPos(ev.capturedSquare));
      if (victim) this.removePieceObject(ev.capturedSquare, victim);
    } else {
      const height = ev.piece === 'n' ? 0.9 : 0.25;
      this.fx.trail(obj, this.trailColor, 0.35);
      const moves = [this.arc(obj, from, to, height, 380)];
      if (rookObj && ev.rook) moves.push(this.arc(rookObj, squareToPos(ev.rook.from), squareToPos(ev.rook.to), 0.5, 420));
      await Promise.all(moves);
      this.fx.burst(to.clone().setY(0.05), { count: 10, color: this.trailColor, speed: 0.9, life: 0.4, size: 0.07, spread: 'ring', gravity: 0 });
    }
    this.pieces.delete(ev.from);
    this.pieces.set(ev.to, obj);
    if (rookObj && ev.rook) {
      this.pieces.delete(ev.rook.from);
      this.pieces.set(ev.rook.to, rookObj);
    }
    if (ev.promotion) {
      this.fx.beam(to, 0xffd27a, 0.8);
      this.fx.burst(to.clone().setY(0.5), { count: 40, color: 0xffd27a, speed: 2.2, life: 0.9, size: 0.12, spread: 'up' });
      this.fx.flash(to, 0xffd27a, 8);
      this.removePiece(ev.to);
      const np = this.addPiece(ev.to, ev.promotion, ev.color);
      await this.tweens.run(450, (t) => np.scale.setScalar(0.2 + 0.8 * t), ease.back);
    }
  }

  private removePieceObject(sq: Square, obj: PieceObject) {
    if (this.pieces.get(sq) === obj) this.pieces.delete(sq);
    this.scene.remove(obj);
    disposePiece(obj);
  }

  /** Coreografias de captura, uma para cada tipo de peça atacante. */
  private get spell(): SpellCtx {
    return { scene: this.scene, fx: this.fx, tweens: this.tweens };
  }

  /** Feitiços temáticos ficam desligados com "reduzir movimento". */
  private get magic(): boolean {
    return !this.opts.reduceMotion;
  }

  private async captureSequence(type: PieceSymbol, obj: PieceObject, victim: PieceObject | null, from: THREE.Vector3, to: THREE.Vector3, victimPos: THREE.Vector3) {
    const fxc = PIECE_FX[type];
    const k = this.captureFx.intensity;
    const tint = this.captureFx.tint;
    const c1 = tint ?? fxc.color;
    const c2 = fxc.color2;
    const impact = victimPos.clone().setY(0.45);
    const dir = to.clone().sub(from).normalize();
    void this.focus(victimPos);
    obj.userData.material.emissiveIntensity = 0.5;

    // Preparação.
    await this.tweens.run(220, (t) => {
      obj.position.copy(from).addScaledVector(dir, -0.15 * t);
      obj.position.y = 0.12 * t;
    });
    const start = obj.position.clone();
    const approach = victimPos.clone().addScaledVector(dir, -0.45);

    switch (type) {
      case 'k': {
        // Realeza: uma coroa de lâminas douradas desce sobre a vítima.
        const crown = this.magic ? royalCrown(this.spell, victimPos, c1) : null;
        await this.arc(obj, start, approach, 0.3, 380);
        await crown;
        this.fx.burst(impact, { count: 70 * k, color: c1, speed: 3, life: 1, size: 0.14 });
        this.fx.burst(impact, { count: 40 * k, color: c2, speed: 2, life: 0.9, size: 0.1 });
        this.fx.shockwave(victimPos, c1, 2.2 * k);
        this.fx.shockwave(victimPos, c2, 1.4 * k, 0.8);
        this.fx.flash(victimPos, c1, 9 * k);
        break;
      }
      case 'q': {
        // Cosmos: um vórtice de estrelas se abre sob a vítima.
        if (this.magic) void starVortex(this.spell, victimPos, c1, 1100, 0.9);
        this.fx.trail(obj, c1, 0.4);
        await this.arc(obj, start, approach, 0.6, 300, ease.in);
        this.fx.beam(victimPos, c1, 0.5, 2.5);
        this.fx.burst(impact, { count: 60 * k, color: c1, speed: 3.4, life: 0.9, size: 0.12 });
        this.fx.burst(impact, { count: 30 * k, color: c2, speed: 1.6, life: 1.1, size: 0.09, spread: 'up' });
        this.fx.flash(victimPos, c1, 7 * k);
        break;
      }
      case 'r': {
        await this.arc(obj, start, approach.clone().setY(0), 1.4, 480, ease.inOut);
        // Terra: pilares de pedra rúnica irrompem ao redor da vítima.
        if (this.magic) {
          const ring = [0, 1, 2, 3, 4, 5].map((i) => victimPos.clone().add(new THREE.Vector3(Math.cos((i / 6) * Math.PI * 2) * 0.55, 0, Math.sin((i / 6) * Math.PI * 2) * 0.55)));
          void stonePillars(this.spell, ring, c1, 250);
        }
        this.fx.shockwave(victimPos, c1, 3 * k, 0.7);
        this.fx.shockwave(victimPos, c2, 1.8 * k, 0.5);
        this.fx.burst(victimPos.clone().setY(0.1), { count: 60 * k, color: c1, speed: 2.6, life: 0.8, size: 0.12, spread: 'ring', gravity: -1 });
        this.fx.flash(victimPos, c1, 6 * k);
        if (this.opts.cameraMotion) this.shake = 0.25;
        break;
      }
      case 'b': {
        // Luz: o olho místico abre sobre a vítima e a fixa com um feixe.
        if (this.magic) void mysticEye(this.spell, victimPos, [victimPos], 250);
        this.fx.runes(victimPos, c1, 0.9, 0.6);
        this.fx.beam(victimPos, c1, 0.7);
        await this.tweens.wait(300);
        this.fx.burst(impact, { count: 50 * k, color: c1, speed: 2.4, life: 1, size: 0.11, spread: 'up' });
        this.fx.flash(victimPos, c2, 6 * k);
        await this.arc(obj, start, approach, 0.25, 320);
        break;
      }
      case 'n': {
        // Espectro: o cavalo avança deixando cópias fantasmas.
        if (this.magic) ghostTrail(this.spell, obj, c1, 340, 55);
        this.fx.trail(obj, c1, 0.35);
        await this.arc(obj, start, approach, 1.1, 340, ease.inOut);
        this.fx.burst(impact, { count: 55 * k, color: c1, speed: 3.2, life: 0.7, size: 0.1 });
        this.fx.burst(impact, { count: 20 * k, color: c2, speed: 2, life: 0.6, size: 0.08 });
        this.fx.flash(victimPos, c1, 5 * k);
        break;
      }
      case 'p': {
        // Natureza: raízes brotam do chão e prendem a vítima.
        if (this.magic) {
          const r = roots(this.spell, victimPos, 0x7dff9a, 1.0, 420);
          await this.arc(obj, start, approach, 0.35, 260);
          const grip = await r;
          void this.tweens.wait(500).then(() => disposeTree(grip));
        } else await this.arc(obj, start, approach, 0.35, 260);
        this.fx.burst(impact, { count: 30 * k, color: c1, speed: 2, life: 0.6, size: 0.1 });
        this.fx.shockwave(victimPos, c1, 1 * k, 0.4);
        this.fx.flash(victimPos, c1, 3.5 * k);
        break;
      }
    }

    // Saída épica da peça capturada.
    if (victim) await this.epicExit(victim, dir, c1);
    // O peão faz brotar uma árvore encantada onde a vítima caiu (curta e sem bloquear o jogo).
    if (type === 'p' && this.magic) void enchantedTree(this.spell, victimPos, 0x5cff8a, 0xffa8e0, 250);
    await this.arc(obj, obj.position.clone(), to, 0.15, 220);
    obj.userData.material.emissiveIntensity = 0;
    await this.unfocus();
  }

  /**
   * Saída épica: pausa de impacto, a peça é arremessada girando, explode em
   * estilhaços que quicam no tabuleiro e sobe uma coluna de luz com faíscas.
   * Com "reduzir movimento", vira uma dissolução suave.
   */
  private async epicExit(victim: PieceObject, dir: THREE.Vector3, color: number) {
    const mat = victim.userData.material;
    const v0 = victim.position.clone();
    const teamGlow = victim.userData.color === 'w' ? 0xffe2a0 : 0x9a7bff;
    mat.emissive.setHex(0xffffff);
    if (this.opts.reduceMotion) {
      mat.transparent = true;
      await this.tweens.run(450, (t) => {
        mat.emissiveIntensity = 0.8 * (1 - t);
        mat.opacity = 1 - t;
      });
      this.fx.burst(v0.clone().setY(0.4), { count: 20, color: teamGlow, speed: 0.8, life: 0.8, size: 0.1, spread: 'up', gravity: 0.5 });
      victim.visible = false;
      return;
    }
    // 1. Pausa de impacto: a peça brilha em branco, como congelada no golpe.
    mat.emissiveIntensity = 2.2;
    if (this.opts.cameraMotion) this.shake = Math.max(this.shake, 0.18);
    await this.tweens.wait(110);
    // 2. Arremesso: voa para trás girando, deixando rastro.
    mat.emissive.setHex(color);
    this.fx.trail(victim, color, 0.45);
    const peak = v0.clone().addScaledVector(dir, 1.1).setY(1.5);
    const tilt = (Math.random() < 0.5 ? -1 : 1) * 1.6;
    await this.tweens.run(
      430,
      (t) => {
        victim.position.lerpVectors(v0, peak, t);
        victim.position.y = v0.y + Math.sin(t * Math.PI * 0.5) * 1.5;
        victim.rotation.z = tilt * t;
        victim.rotation.y += 0.35;
        victim.scale.setScalar(1 - 0.15 * t);
        mat.emissiveIntensity = 1.2 + t;
      },
      ease.out,
    );
    // 3. Explosão: estilhaços com o material da peça, clarão e onda de choque.
    const at = victim.position.clone();
    this.fx.shatter(at, mat.primary, color, dir, 30);
    this.fx.burst(at, { count: 60, color, speed: 3.6, life: 0.9, size: 0.13 });
    this.fx.burst(at, { count: 30, color: 0xffffff, speed: 2, life: 0.5, size: 0.08 });
    this.fx.flash(at, color, 10);
    this.fx.shockwave(new THREE.Vector3(at.x, 0, at.z), color, 2.4, 0.7);
    victim.visible = false;
    // 4. A essência sobe: coluna de luz e faíscas na cor do exército.
    this.fx.beam(new THREE.Vector3(at.x, 0, at.z), teamGlow, 1.1, 6);
    this.fx.burst(new THREE.Vector3(at.x, 0.2, at.z), { count: 40, color: teamGlow, speed: 1.4, life: 1.6, size: 0.09, spread: 'up', gravity: 0.6, drag: 0.6 });
    this.fx.runes(new THREE.Vector3(at.x, 0, at.z), teamGlow, 1.2, 0.7);
    await this.tweens.wait(260);
  }

  private async animatePowerMove(ev: Extract<GameEvent, { type: 'powerMove' }>) {
    const obj = this.pieces.get(ev.from);
    if (!obj) return;
    const from = squareToPos(ev.from);
    const to = squareToPos(ev.to);
    const mat = obj.userData.material;
    const power: MovementPowerId = ev.power;
    if (power === 'arcaneStep') {
      // Portal de estrelas na origem e no destino, ligados por uma constelação.
      if (this.magic) {
        void starVortex(this.spell, from, 0x9a7bff, 900);
        void starVortex(this.spell, to, 0x5fc8ff, 1100);
        void constellation(this.spell, from, to);
      }
      this.fx.runes(from, 0x9a7bff, 0.8, 0.55);
      this.fx.beam(from, 0x9a7bff, 0.6, 3);
      mat.emissive.setHex(0x9a7bff);
      await this.tweens.run(320, (t) => {
        obj.scale.set(1 - 0.85 * t, 1 + 0.6 * t, 1 - 0.85 * t);
        mat.emissiveIntensity = t;
      });
      this.fx.burst(from.clone().setY(0.5), { count: 30, color: 0x9a7bff, speed: 1.6, life: 0.7, size: 0.1 });
      obj.position.copy(to);
      this.fx.runes(to, 0x5fc8ff, 0.8, 0.55);
      this.fx.flash(to, 0x9a7bff, 6);
      await this.tweens.run(340, (t) => {
        obj.scale.set(0.15 + 0.85 * t, 1.6 - 0.6 * t, 0.15 + 0.85 * t);
        mat.emissiveIntensity = 1 - t;
      }, ease.back);
    } else if (power === 'phantomLeap') {
      mat.transparent = true;
      mat.emissive.setHex(0x5fc8ff);
      this.fx.trail(obj, 0x5fc8ff, 0.6);
      // Cavalo fantasma: cópias espectrais ao longo do salto.
      if (this.magic) ghostTrail(this.spell, obj, 0x7ae0ff, 700, 60);
      await this.tweens.run(150, (t) => {
        mat.opacity = 1 - 0.55 * t;
        mat.emissiveIntensity = 0.8 * t;
      });
      await this.arc(obj, from, to, 1.8, 560);
      this.fx.shockwave(to, 0x5fc8ff, 1.2, 0.5);
      await this.tweens.run(200, (t) => {
        mat.opacity = 0.45 + 0.55 * t;
        mat.emissiveIntensity = 0.8 * (1 - t);
      });
    } else {
      // Impulso: raízes empurram o peão para frente e uma árvore brota onde ele estava.
      if (this.magic) await roots(this.spell, from, 0xb6ff6a, 0.8, 300).then((g) => void this.tweens.wait(400).then(() => disposeTree(g)));
      this.fx.trail(obj, 0xffd27a, 0.4);
      await this.arc(obj, from, to, 0.15, 300, ease.out);
      if (this.magic) void enchantedTree(this.spell, from, 0x8aff5c, 0xffe08a, 200);
      this.fx.burst(to.clone().setY(0.1), { count: 24, color: 0xffd27a, speed: 1.6, life: 0.6, size: 0.1, spread: 'ring', gravity: 0 });
    }
    this.pieces.delete(ev.from);
    this.pieces.set(ev.to, obj);
  }

  private async animateUtility(ev: Extract<GameEvent, { type: 'powerUtility' }>) {
    const at = squareToPos(ev.from);
    const power: UtilityPowerId = ev.power;
    if (power === 'royalShield') {
      if (this.magic) await royalCrown(this.spell, at, 0xffd27a);
      this.fx.runes(at, 0xffd27a, 1, 1.4);
      this.fx.burst(at.clone().setY(0.6), { count: 50, color: 0xffd27a, speed: 2, life: 0.9, size: 0.11, spread: 'ring', gravity: 0.3 });
      this.fx.flash(at, 0xffd27a, 7);
    } else if (power === 'wall') {
      if (this.magic) void stonePillars(this.spell, ev.squares.map((q) => squareToPos(q)), 0x5fa0ff, 450);
      for (const s of ev.squares) this.fx.burst(squareToPos(s, 0.05), { count: 8, color: 0x5fa0ff, speed: 1.2, life: 0.8, size: 0.09, spread: 'up', gravity: 0 });
      this.fx.shockwave(at, 0x5fa0ff, 1.6, 0.6);
      if (this.opts.cameraMotion) this.shake = 0.12;
    } else {
      this.fx.runes(at, 0x7ae0ff, 1.1, 1);
      this.fx.beam(at, 0x7ae0ff, 0.8, 4);
      if (this.magic) {
        // O olho místico lança feixes sobre as peças inimigas dentro da área revelada.
        const area = new Set(ev.squares);
        const enemies = [...this.pieces].filter(([sq, p]) => area.has(sq) && p.userData.color !== ev.color).map(([sq]) => squareToPos(sq));
        await mysticEye(this.spell, at, enemies, 450);
      }
    }
    await this.tweens.wait(450);
  }

  /* ----------------------------- Loop ----------------------------- */

  /** Espaço (px) ocupado por um painel à esquerda; o tabuleiro é recentrado na área livre. */
  private leftInset = 0;
  setLeftInset(px: number) {
    this.leftInset = px;
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Em telas estreitas (retrato), abre o campo de visão para o tabuleiro caber.
    this.camera.fov = w / h < 0.8 ? 50 : 42;
    // Desloca a projeção para centralizar o tabuleiro fora do painel lateral (apenas telas largas).
    const inset = w > 900 ? this.leftInset : 0;
    if (inset) this.camera.setViewOffset(w, h, -inset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running || this.contextLost) return;
    this.running = true;
    this.clock.update();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame() {
    this.clock.update();
    const rawDt = this.clock.getDelta();
    this.adaptQuality(rawDt);
    const dt = Math.min(0.05, rawDt);
    const time = this.clock.getElapsed();
    this.tweens.tick(performance.now());
    this.fx.update(dt);
    if (this.mode === 'menu') {
      this.menuAngle += dt * (this.opts.cameraMotion ? 0.08 : 0);
      const r = 12;
      const bob = this.opts.cameraMotion ? Math.sin(time * 0.3) * 0.4 : 0;
      this.camera.position.set(Math.sin(this.menuAngle) * r, 6.5 + bob, Math.cos(this.menuAngle) * r);
      this.camera.lookAt(0, 0.2, 0);
    } else {
      this.controls.update();
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    if (this.motes) {
      const arr = (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const w = this.weather;
      for (let i = 0; i < arr.length; i += 3) {
        const v = 0.15 + ((i * 7) % 10) * 0.02;
        if (w === 'snow') {
          // Neve cai balançando.
          arr[i + 1] -= dt * (0.5 + v);
          arr[i] += Math.sin(time * 0.8 + i) * dt * 0.25;
          if (arr[i + 1] < -0.9) arr[i + 1] = 6.5;
        } else if (w === 'fireflies') {
          // Vaga-lumes vagam em todas as direções.
          arr[i] += Math.sin(time * 0.7 + i) * dt * 0.35;
          arr[i + 1] += Math.cos(time * 0.9 + i * 0.5) * dt * 0.2;
          arr[i + 2] += Math.cos(time * 0.6 + i * 1.3) * dt * 0.35;
          if (arr[i + 1] > 4) arr[i + 1] = 0;
          if (arr[i + 1] < -0.8) arr[i + 1] = 2;
        } else {
          // Brasas sobem rápido; partículas mágicas sobem devagar.
          arr[i + 1] += dt * v * (w === 'embers' ? 3 : 1);
          arr[i] += Math.sin(time + i) * dt * (w === 'embers' ? 0.25 : 0.05);
          if (arr[i + 1] > 6.5) arr[i + 1] = -0.8;
        }
      }
      if (w === 'fireflies') (this.motes.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(time * 3) * 0.25;
      this.motes.geometry.getAttribute('position').needsUpdate = true;
    }
    if (this.runeCircle) this.runeCircle.rotation.z = time * 0.03;
    this.env.update(time);
    this.updatePanorama();
    this.accentA.position.set(Math.sin(time * 0.4) * 5, 2.5, Math.cos(time * 0.4) * 5);
    this.accentB.position.set(-Math.sin(time * 0.3) * 5, 2.2, -Math.cos(time * 0.3) * 5);
    const pulse = this.opts.reduceMotion ? 1 : 0.65 + Math.sin(time * 4) * 0.35;
    for (const m of this.pulseMats) m.opacity = (m.userData.base as number) * pulse;
    if (this.selected) {
      this.selected.userData.material.emissiveIntensity = 0.18 + Math.sin(time * 4) * 0.12;
    }
    for (const p of this.pieces.values()) {
      const ring = p.userData.ring.material as THREE.MeshBasicMaterial;
      ring.opacity = p === this.selected ? 0.95 : 0.35 + Math.sin(time * 1.5 + p.position.x) * 0.1;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Projeta um ponto do tabuleiro em coordenadas de tela (usado em testes automatizados). */
  project(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, 0.3, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
}
