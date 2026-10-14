/** Catálogo de cosméticos. Todos os itens são puramente visuais. */
export type ItemCategory = 'theme' | 'pieces' | 'trail' | 'capture';

export interface Unlock {
  coins?: number;
  level?: number;
  achievement?: string;
}

export interface CatalogItem {
  id: string;
  category: ItemCategory;
  unlock: Unlock;
}

export interface ThemeDef {
  id: string;
  light: number;
  dark: number;
  frame: number;
  roughness: number;
  metalness: number;
  ambient: number;
  key: number;
  rim: number;
  particle: number;
  background: number;
  fog: number;
  emissiveBoard?: number;
}

export const THEMES: ThemeDef[] = [
  { id: 'classicRoyal', light: 0xe8d6b0, dark: 0x6b4426, frame: 0x2a1a10, roughness: 0.55, metalness: 0.05, ambient: 0x8090b0, key: 0xfff1d6, rim: 0x4f8dff, particle: 0xffd27a, background: 0x07080d, fog: 0x07080d },
  { id: 'arcaneBlue', light: 0x9fb7e6, dark: 0x1b2850, frame: 0x0c1430, roughness: 0.35, metalness: 0.2, ambient: 0x4060a0, key: 0xcfe0ff, rim: 0x3ab0ff, particle: 0x5fc8ff, background: 0x040814, fog: 0x050a1a, emissiveBoard: 0x08142e },
  { id: 'goldenRealm', light: 0xf3dc9a, dark: 0x8a6420, frame: 0x3a2808, roughness: 0.3, metalness: 0.55, ambient: 0x907040, key: 0xffe4a8, rim: 0xffc24a, particle: 0xffd56a, background: 0x0d0904, fog: 0x0d0904 },
  { id: 'obsidian', light: 0x5a5a66, dark: 0x101015, frame: 0x050507, roughness: 0.15, metalness: 0.4, ambient: 0x505070, key: 0xe0e0ff, rim: 0x9a6cff, particle: 0xa77bff, background: 0x030304, fog: 0x030304 },
  { id: 'mysticIce', light: 0xe6f6ff, dark: 0x6aa6c8, frame: 0x1d3a52, roughness: 0.12, metalness: 0.1, ambient: 0x90c0e0, key: 0xf0fbff, rim: 0x7ae0ff, particle: 0xbff0ff, background: 0x061018, fog: 0x0a1a26 },
  { id: 'arcaneFlames', light: 0xe0a070, dark: 0x5a1a0c, frame: 0x200804, roughness: 0.45, metalness: 0.15, ambient: 0x904030, key: 0xffd0a0, rim: 0xff6a2a, particle: 0xff8a3a, background: 0x0e0503, fog: 0x140604, emissiveBoard: 0x1a0400 },
  { id: 'cosmos', light: 0x6a5aa8, dark: 0x140c30, frame: 0x07041a, roughness: 0.25, metalness: 0.35, ambient: 0x504090, key: 0xe8dcff, rim: 0xff5ad8, particle: 0xd6a8ff, background: 0x020108, fog: 0x050214, emissiveBoard: 0x0a0420 },
  { id: 'ancientMarble', light: 0xf2f0ea, dark: 0x8a8f96, frame: 0x3c3e44, roughness: 0.25, metalness: 0.05, ambient: 0x909098, key: 0xffffff, rim: 0xb0c8ff, particle: 0xffffff, background: 0x0a0b0e, fog: 0x0a0b0e },
];

export interface PieceSkinDef {
  id: string;
  white: number;
  black: number;
  metalness: number;
  roughness: number;
  glow: number;
}

export const PIECE_SKINS: PieceSkinDef[] = [
  { id: 'ivoryEbony', white: 0xf1e8d6, black: 0x1c1a22, metalness: 0.1, roughness: 0.35, glow: 0x4f8dff },
  { id: 'goldSilver', white: 0xe8c66a, black: 0x8c95a6, metalness: 0.85, roughness: 0.25, glow: 0xffd27a },
  { id: 'crystal', white: 0xd8f2ff, black: 0x3a2a6a, metalness: 0.2, roughness: 0.05, glow: 0x7ae0ff },
  { id: 'obsidianJade', white: 0x5fd0a0, black: 0x141418, metalness: 0.3, roughness: 0.15, glow: 0x5fffb0 },
];

export interface TrailDef {
  id: string;
  color: number;
}
export const TRAILS: TrailDef[] = [
  { id: 'arcaneSpark', color: 0x5fc8ff },
  { id: 'goldenDust', color: 0xffd27a },
  { id: 'voidMist', color: 0xa77bff },
];

export interface CaptureFxDef {
  id: string;
  /** Multiplicador de partículas/escala do impacto. */
  intensity: number;
  tint: number | null;
}
export const CAPTURE_FX: CaptureFxDef[] = [
  { id: 'standard', intensity: 1, tint: null },
  { id: 'supernova', intensity: 1.6, tint: 0xfff0c0 },
  { id: 'runeBurst', intensity: 1.2, tint: 0x9a6cff },
];

export const CATALOG: CatalogItem[] = [
  { id: 'theme:classicRoyal', category: 'theme', unlock: {} },
  { id: 'theme:arcaneBlue', category: 'theme', unlock: { coins: 150 } },
  { id: 'theme:goldenRealm', category: 'theme', unlock: { coins: 300, level: 3 } },
  { id: 'theme:obsidian', category: 'theme', unlock: { coins: 300 } },
  { id: 'theme:mysticIce', category: 'theme', unlock: { coins: 400, level: 5 } },
  { id: 'theme:arcaneFlames', category: 'theme', unlock: { achievement: 'winHard' } },
  { id: 'theme:cosmos', category: 'theme', unlock: { coins: 800, level: 8 } },
  { id: 'theme:ancientMarble', category: 'theme', unlock: { achievement: 'firstCheckmate' } },
  { id: 'pieces:ivoryEbony', category: 'pieces', unlock: {} },
  { id: 'pieces:goldSilver', category: 'pieces', unlock: { coins: 250, level: 2 } },
  { id: 'pieces:crystal', category: 'pieces', unlock: { coins: 450, level: 4 } },
  { id: 'pieces:obsidianJade', category: 'pieces', unlock: { achievement: 'winMaster' } },
  { id: 'trail:arcaneSpark', category: 'trail', unlock: {} },
  { id: 'trail:goldenDust', category: 'trail', unlock: { coins: 200 } },
  { id: 'trail:voidMist', category: 'trail', unlock: { level: 6 } },
  { id: 'capture:standard', category: 'capture', unlock: {} },
  { id: 'capture:supernova', category: 'capture', unlock: { coins: 350, level: 4 } },
  { id: 'capture:runeBurst', category: 'capture', unlock: { achievement: 'powerAdept' } },
];

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((i) => i.id === id);
}
