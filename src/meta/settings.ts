import type { Difficulty } from '../core/types';

export type Lang = 'pt-BR' | 'en';

export interface Settings {
  version: 1;
  lang: Lang;
  difficulty: Difficulty;
  playerColor: 'w' | 'b' | 'random';
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  particles: 'off' | 'reduced' | 'full';
  animations: 'full' | 'fast' | 'skip';
  cameraMotion: boolean;
  coordinates: boolean;
  flipView: boolean;
  allowUndo: boolean;
  sound: boolean;
  volume: number;
}

export function defaultSettings(): Settings {
  const mobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return {
    version: 1,
    lang: 'pt-BR',
    difficulty: 'medium',
    playerColor: 'w',
    quality: mobile ? 'medium' : 'high',
    shadows: !mobile,
    particles: mobile ? 'reduced' : 'full',
    animations: 'full',
    cameraMotion: true,
    coordinates: true,
    flipView: false,
    allowUndo: true,
    sound: true,
    volume: 0.6,
  };
}

export function sanitizeSettings(v: unknown): Settings {
  const d = defaultSettings();
  if (!v || typeof v !== 'object') return d;
  const s = { ...d, ...(v as Partial<Settings>) };
  const pick = <T>(val: T, allowed: readonly T[], fallback: T) => (allowed.includes(val) ? val : fallback);
  s.lang = pick(s.lang, ['pt-BR', 'en'] as const, d.lang);
  s.difficulty = pick(s.difficulty, ['easy', 'medium', 'hard', 'master'] as const, d.difficulty);
  s.playerColor = pick(s.playerColor, ['w', 'b', 'random'] as const, d.playerColor);
  s.quality = pick(s.quality, ['low', 'medium', 'high'] as const, d.quality);
  s.particles = pick(s.particles, ['off', 'reduced', 'full'] as const, d.particles);
  s.animations = pick(s.animations, ['full', 'fast', 'skip'] as const, d.animations);
  s.volume = typeof s.volume === 'number' ? Math.max(0, Math.min(1, s.volume)) : d.volume;
  for (const k of ['shadows', 'cameraMotion', 'coordinates', 'flipView', 'allowUndo', 'sound'] as const) {
    if (typeof s[k] !== 'boolean') s[k] = d[k];
  }
  s.version = 1;
  return s;
}
