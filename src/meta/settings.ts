import type { Difficulty } from '../core/types';

export type Lang = 'pt-BR' | 'en';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  version: 2;
  lang: Lang;
  difficulty: Difficulty;
  playerColor: 'w' | 'b' | 'random';
  /* Gráficos */
  quality: Quality;
  shadows: boolean;
  particles: 'off' | 'reduced' | 'full';
  coordinates: boolean;
  /* Animações e movimento */
  animations: 'full' | 'skip';
  /** Multiplicador de velocidade das animações (0,5× a 2,5×). */
  animationSpeed: number;
  /** Desliga movimentos de câmera, tremores, órbita do menu e efeitos de luz intensos. */
  reduceMotion: boolean;
  cameraMotion: boolean;
  /* Câmera e controles */
  cameraSensitivity: number;
  /** 'oneFinger': um dedo gira a câmera. 'twoFingers': um dedo só seleciona; dois dedos giram. */
  touchRotate: 'oneFinger' | 'twoFingers';
  flipView: boolean;
  /* Jogo */
  allowUndo: boolean;
  /* Áudio */
  sound: boolean;
  masterVolume: number;
  sfxVolume: number;
  /* Acessibilidade */
  highContrast: boolean;
  largeText: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function defaultSettings(): Settings {
  const reduce = prefersReducedMotion();
  return {
    version: 2,
    lang: 'pt-BR',
    difficulty: 'medium',
    playerColor: 'w',
    quality: 'auto',
    shadows: true,
    particles: 'full',
    coordinates: true,
    animations: 'full',
    animationSpeed: 1,
    reduceMotion: reduce,
    cameraMotion: !reduce,
    cameraSensitivity: 1,
    touchRotate: 'oneFinger',
    flipView: false,
    allowUndo: true,
    sound: true,
    masterVolume: 0.8,
    sfxVolume: 0.8,
    highContrast: false,
    largeText: false,
  };
}

const clamp = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d);

/** Valida e migra configurações salvas (inclusive da versão 1). Valores inválidos voltam ao padrão. */
export function sanitizeSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!v || typeof v !== 'object') return d;
  const raw = v as Record<string, unknown>;
  // Migração v1 → v2.
  if (raw.version === 1 || raw.version === undefined) {
    if (raw.animations === 'fast') {
      raw.animations = 'full';
      raw.animationSpeed = 2;
    }
    if (typeof raw.volume === 'number') raw.masterVolume = raw.volume;
  }
  const s = { ...d, ...(raw as Partial<Settings>) };
  const pick = <T>(val: T, allowed: readonly T[], fallback: T) => (allowed.includes(val) ? val : fallback);
  s.lang = pick(s.lang, ['pt-BR', 'en'] as const, d.lang);
  s.difficulty = pick(s.difficulty, ['easy', 'medium', 'hard', 'master'] as const, d.difficulty);
  s.playerColor = pick(s.playerColor, ['w', 'b', 'random'] as const, d.playerColor);
  s.quality = pick(s.quality, ['auto', 'low', 'medium', 'high'] as const, d.quality);
  s.particles = pick(s.particles, ['off', 'reduced', 'full'] as const, d.particles);
  s.animations = pick(s.animations, ['full', 'skip'] as const, d.animations);
  s.touchRotate = pick(s.touchRotate, ['oneFinger', 'twoFingers'] as const, d.touchRotate);
  s.animationSpeed = clamp(s.animationSpeed, 0.5, 2.5, d.animationSpeed);
  s.cameraSensitivity = clamp(s.cameraSensitivity, 0.3, 2, d.cameraSensitivity);
  s.masterVolume = clamp(s.masterVolume, 0, 1, d.masterVolume);
  s.sfxVolume = clamp(s.sfxVolume, 0, 1, d.sfxVolume);
  for (const k of ['shadows', 'coordinates', 'reduceMotion', 'cameraMotion', 'flipView', 'allowUndo', 'sound', 'highContrast', 'largeText'] as const) {
    if (typeof s[k] !== 'boolean') s[k] = d[k];
  }
  delete (s as Record<string, unknown>).volume;
  s.version = 2;
  return s;
}

/** Qualidade efetiva quando o modo é automático (heurística inicial; o renderizador ainda se ajusta pelo FPS). */
export function resolveQuality(q: Quality, env?: { coarse: boolean; cores: number; dpr: number }): 'low' | 'medium' | 'high' {
  if (q !== 'auto') return q;
  const e = env ?? {
    coarse: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  };
  if (e.cores <= 4 && e.coarse) return 'low';
  if (e.coarse || e.cores <= 4) return 'medium';
  return 'high';
}
