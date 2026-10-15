import type { Color, Square } from './types';

export const FILES = 'abcdefgh';

export function fileOf(sq: Square): number {
  return sq.charCodeAt(0) - 97;
}

export function rankOf(sq: Square): number {
  return sq.charCodeAt(1) - 49;
}

export function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return (FILES[file] + (rank + 1)) as Square;
}

export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

export const ALL_SQUARES: Square[] = (() => {
  const out: Square[] = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) out.push(toSquare(f, r)!);
  return out;
})();

export function squaresWithin(center: Square, radius: number): Square[] {
  const out: Square[] = [];
  const f0 = fileOf(center);
  const r0 = rankOf(center);
  for (let df = -radius; df <= radius; df++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const s = toSquare(f0 + df, r0 + dr);
      if (s) out.push(s);
    }
  }
  return out;
}

export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export function isLightSquare(sq: Square): boolean {
  return (fileOf(sq) + rankOf(sq)) % 2 === 1;
}
