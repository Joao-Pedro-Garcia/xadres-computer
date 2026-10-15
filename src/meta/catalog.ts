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
  scenery: Scenery;
}

/** Cenário mágico ao redor do tabuleiro (pintado e modelado por código). */
export interface Scenery {
  /** Céu: topo, meio e horizonte. */
  sky: [number, number, number];
  celestial: 'moon' | 'sun' | 'twinMoons' | 'planets' | 'eclipse';
  celestialColor: number;
  aurora?: number;
  stars: boolean;
  /** Montanhas: camada distante e próxima. */
  mountains: [number, number];
  castle: { style: 'gothic' | 'palace' | 'fortress' | 'ice' | 'temple' | 'floating'; stone: number; roof: number; window: number };
  mist: number;
  /** Objetos 3D ao redor do tabuleiro. */
  props: 'pines' | 'crystals' | 'obelisks' | 'spires' | 'iceShards' | 'lavaRocks' | 'asteroids' | 'columns';
  propColor: number;
  propGlow: number;
  ground: number;
  weather: 'fireflies' | 'motes' | 'embers' | 'snow' | 'stars';
}

export const THEMES: ThemeDef[] = [
  { id: 'classicRoyal', light: 0xe8d6b0, dark: 0x6b4426, frame: 0x2a1a10, roughness: 0.55, metalness: 0.05, ambient: 0x8090b0, key: 0xfff1d6, rim: 0x4f8dff, particle: 0xffd27a, background: 0x07080d, fog: 0x07080d, scenery: { sky: [0x1a2550, 0x6a4a7a, 0xf0a060], celestial: 'sun', celestialColor: 0xffd27a, stars: false, mountains: [0x4a3a5a, 0x2a2238], castle: { style: 'gothic', stone: 0x3a3448, roof: 0x2a4a8a, window: 0xffc870 }, mist: 0xd89070, props: 'pines', propColor: 0x1f3a2a, propGlow: 0xffc870, ground: 0x3a4a30, weather: 'fireflies' } },
  { id: 'arcaneBlue', light: 0x9fb7e6, dark: 0x1b2850, frame: 0x0c1430, roughness: 0.35, metalness: 0.2, ambient: 0x4060a0, key: 0xcfe0ff, rim: 0x3ab0ff, particle: 0x5fc8ff, background: 0x040814, fog: 0x050a1a, emissiveBoard: 0x08142e, scenery: { sky: [0x02040e, 0x0a1a44, 0x1a4a8a], celestial: 'moon', celestialColor: 0xcfe8ff, aurora: 0x3affd0, stars: true, mountains: [0x0c1a3a, 0x060e24], castle: { style: 'gothic', stone: 0x101c3c, roof: 0x1a3a7a, window: 0x7ae0ff }, mist: 0x2a5aa0, props: 'crystals', propColor: 0x3a8aff, propGlow: 0x5fc8ff, ground: 0x0e1a34, weather: 'motes' } },
  { id: 'goldenRealm', light: 0xf3dc9a, dark: 0x8a6420, frame: 0x3a2808, roughness: 0.3, metalness: 0.55, ambient: 0x907040, key: 0xffe4a8, rim: 0xffc24a, particle: 0xffd56a, background: 0x0d0904, fog: 0x0d0904, scenery: { sky: [0x3a2a10, 0xc08a30, 0xffe0a0], celestial: 'sun', celestialColor: 0xfff0c0, stars: false, mountains: [0x9a6a30, 0x6a4418], castle: { style: 'palace', stone: 0xc8a050, roof: 0xffd060, window: 0xfff4c0 }, mist: 0xffd8a0, props: 'obelisks', propColor: 0xc8a050, propGlow: 0xffd27a, ground: 0x8a6a30, weather: 'motes' } },
  { id: 'obsidian', light: 0x5a5a66, dark: 0x101015, frame: 0x050507, roughness: 0.15, metalness: 0.4, ambient: 0x505070, key: 0xe0e0ff, rim: 0x9a6cff, particle: 0xa77bff, background: 0x030304, fog: 0x030304, scenery: { sky: [0x050308, 0x1a0e2a, 0x3a1a4a], celestial: 'eclipse', celestialColor: 0xa77bff, stars: true, mountains: [0x140c1e, 0x08050e], castle: { style: 'fortress', stone: 0x0c0a12, roof: 0x1a1024, window: 0xb08aff }, mist: 0x3a2050, props: 'spires', propColor: 0x0c0a12, propGlow: 0x9a6cff, ground: 0x0c0a14, weather: 'stars' } },
  { id: 'mysticIce', light: 0xe6f6ff, dark: 0x6aa6c8, frame: 0x1d3a52, roughness: 0.12, metalness: 0.1, ambient: 0x90c0e0, key: 0xf0fbff, rim: 0x7ae0ff, particle: 0xbff0ff, background: 0x061018, fog: 0x0a1a26, scenery: { sky: [0x0a1a2e, 0x3a6a9a, 0xbfe8ff], celestial: 'moon', celestialColor: 0xf0fbff, aurora: 0x8affd8, stars: true, mountains: [0x8ab0d0, 0x5a80a8], castle: { style: 'ice', stone: 0xbfe0f4, roof: 0x8ad0f0, window: 0xe0fbff }, mist: 0xdaf2ff, props: 'iceShards', propColor: 0xbfe8ff, propGlow: 0x7ae0ff, ground: 0xd8ecf8, weather: 'snow' } },
  { id: 'arcaneFlames', light: 0xe0a070, dark: 0x5a1a0c, frame: 0x200804, roughness: 0.45, metalness: 0.15, ambient: 0x904030, key: 0xffd0a0, rim: 0xff6a2a, particle: 0xff8a3a, background: 0x0e0503, fog: 0x140604, emissiveBoard: 0x1a0400, scenery: { sky: [0x0e0302, 0x4a0e04, 0xd0501a], celestial: 'moon', celestialColor: 0xff8a3a, stars: false, mountains: [0x3a0e06, 0x1a0602], castle: { style: 'fortress', stone: 0x1a0806, roof: 0x3a0a04, window: 0xff7a2a }, mist: 0xa03010, props: 'lavaRocks', propColor: 0x1a0a06, propGlow: 0xff6a1a, ground: 0x200804, weather: 'embers' } },
  { id: 'cosmos', light: 0x6a5aa8, dark: 0x140c30, frame: 0x07041a, roughness: 0.25, metalness: 0.35, ambient: 0x504090, key: 0xe8dcff, rim: 0xff5ad8, particle: 0xd6a8ff, background: 0x020108, fog: 0x050214, emissiveBoard: 0x0a0420, scenery: { sky: [0x020108, 0x1a0a3a, 0x4a1a6a], celestial: 'planets', celestialColor: 0xd6a8ff, aurora: 0xff5ad8, stars: true, mountains: [0x140a2a, 0x0a0518], castle: { style: 'floating', stone: 0x2a1a4a, roof: 0x5a2a8a, window: 0xff9ae8 }, mist: 0x3a1a6a, props: 'asteroids', propColor: 0x3a2a5a, propGlow: 0xd6a8ff, ground: 0x140a24, weather: 'stars' } },
  { id: 'ancientMarble', light: 0xf2f0ea, dark: 0x8a8f96, frame: 0x3c3e44, roughness: 0.25, metalness: 0.05, ambient: 0x909098, key: 0xffffff, rim: 0xb0c8ff, particle: 0xffffff, background: 0x0a0b0e, fog: 0x0a0b0e, scenery: { sky: [0x2a5a9a, 0x7ab0e0, 0xf0f4f8], celestial: 'sun', celestialColor: 0xffffff, stars: false, mountains: [0x8aa0b8, 0x6a7a8a], castle: { style: 'temple', stone: 0xeeeae2, roof: 0xd0ccc4, window: 0xfff8e0 }, mist: 0xf4f6f8, props: 'columns', propColor: 0xeeeae2, propGlow: 0xfff0c0, ground: 0xc8c4b8, weather: 'motes' } },
];

/** Materiais de um lado (brancas ou pretas) de um conjunto de peças. */
export interface SideMaterials {
  /** Corpo principal (marfim, madeira, alabastro, malaquita, metal…). */
  base: number;
  baseRoughness: number;
  baseMetalness: number;
  /** Corpo translúcido/fosco (alabastro, cristal). */
  frosted?: boolean;
  /** Metal das faixas, hastes e coroas. */
  metal: number;
  /** Pedras preciosas. */
  gem: number;
  /** Partes cravejadas (pavé de diamantes). */
  pave: boolean;
}

export interface PieceSkinDef {
  id: string;
  /** Formato: clássico de torneio, luxo (base de alabastro + topo cravejado) ou régio (alto, com golas e gemas). */
  style: 'staunton' | 'luxe' | 'regal';
  white: SideMaterials;
  black: SideMaterials;
  glow: number;
}

const side = (base: number, metal: number, gem: number, o: Partial<SideMaterials> = {}): SideMaterials => ({
  base,
  baseRoughness: 0.35,
  baseMetalness: 0.1,
  metal,
  gem,
  pave: false,
  ...o,
});

export const PIECE_SKINS: PieceSkinDef[] = [
  // Clássicos
  { id: 'ivoryEbony', style: 'staunton', white: side(0xf1e8d6, 0xd4b46a, 0xffffff), black: side(0x1c1a22, 0xb0b8c8, 0xffffff), glow: 0x4f8dff },
  { id: 'woodTournament', style: 'staunton', white: side(0xe3c48e, 0xc89a4a, 0xffffff, { baseRoughness: 0.55 }), black: side(0x5a2a18, 0xc89a4a, 0xffffff, { baseRoughness: 0.5 }), glow: 0xffc870 },
  { id: 'marbleClassic', style: 'staunton', white: side(0xf4f2ee, 0xc0c0c8, 0xffffff, { baseRoughness: 0.18 }), black: side(0x2a2c30, 0xc0c0c8, 0xffffff, { baseRoughness: 0.18 }), glow: 0xbfd8ff },
  { id: 'goldSilver', style: 'staunton', white: side(0xe8c66a, 0xfff0b0, 0xffffff, { baseMetalness: 0.85, baseRoughness: 0.25 }), black: side(0x8c95a6, 0xe0e6f0, 0xffffff, { baseMetalness: 0.85, baseRoughness: 0.25 }), glow: 0xffd27a },
  // Ricos
  { id: 'crystal', style: 'luxe', white: side(0xe0f6ff, 0xdfe6f0, 0x7ae0ff, { frosted: true, baseRoughness: 0.08 }), black: side(0x3a2a6a, 0xdfe6f0, 0xb08aff, { frosted: true, baseRoughness: 0.08 }), glow: 0x7ae0ff },
  { id: 'amberGold', style: 'regal', white: side(0xd89a50, 0xf0c050, 0xffb040, { baseRoughness: 0.3 }), black: side(0x4a2410, 0xf0c050, 0x5fd0a0, { baseRoughness: 0.3 }), glow: 0xffc870 },
  { id: 'alabasterGold', style: 'luxe', white: side(0xf2ece0, 0xf4c95a, 0xffffff, { frosted: true, baseRoughness: 0.45, pave: true }), black: side(0x1e1c22, 0xe4e8f0, 0xffffff, { baseRoughness: 0.2, pave: true }), glow: 0xffe2a0 },
  { id: 'malachiteGold', style: 'regal', white: side(0xf2ead8, 0xf4c95a, 0xffffff, { baseRoughness: 0.25 }), black: side(0x0e5a3a, 0xf4c95a, 0x3affa0, { baseRoughness: 0.15 }), glow: 0x5fffb0 },
  { id: 'obsidianJade', style: 'staunton', white: side(0x5fd0a0, 0xd4b46a, 0xffffff, { baseMetalness: 0.3, baseRoughness: 0.15 }), black: side(0x141418, 0x9a8a6a, 0xffffff, { baseMetalness: 0.3, baseRoughness: 0.15 }), glow: 0x5fffb0 },
  { id: 'diamondPave', style: 'luxe', white: side(0xeef2f8, 0xf4f6fa, 0xffffff, { baseMetalness: 0.9, baseRoughness: 0.12, pave: true }), black: side(0x23262c, 0xbfc6d2, 0xffffff, { baseMetalness: 0.9, baseRoughness: 0.12, pave: true }), glow: 0xe8f4ff },
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
  { id: 'pieces:woodTournament', category: 'pieces', unlock: { coins: 120 } },
  { id: 'pieces:marbleClassic', category: 'pieces', unlock: { coins: 200 } },
  { id: 'pieces:goldSilver', category: 'pieces', unlock: { coins: 250, level: 2 } },
  { id: 'pieces:crystal', category: 'pieces', unlock: { coins: 450, level: 4 } },
  { id: 'pieces:amberGold', category: 'pieces', unlock: { coins: 650, level: 5 } },
  { id: 'pieces:alabasterGold', category: 'pieces', unlock: { coins: 900, level: 6 } },
  { id: 'pieces:malachiteGold', category: 'pieces', unlock: { coins: 1200, level: 8 } },
  { id: 'pieces:obsidianJade', category: 'pieces', unlock: { achievement: 'winMaster' } },
  { id: 'pieces:diamondPave', category: 'pieces', unlock: { achievement: 'grandArcanist', coins: 1500 } },
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
