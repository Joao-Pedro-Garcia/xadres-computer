import { POWERS } from '../balance';
import { opposite, squaresWithin } from '../squares';
import { chessOf } from '../board';
import type { Color, GameState, Square } from '../types';
import type { UtilityPowerModule } from './types';

/** Bispo — Visão Mística: revela informações táticas reais da posição pública. */
export const mysticVision: UtilityPowerModule = {
  kind: 'utility',
  id: 'mysticVision',
  spec: POWERS.mysticVision,
  alreadyActive: (state, color) => state.vision.some((v) => v.owner === color),
  activate(next, color, from) {
    next.vision.push({ owner: color, anchor: from, createdAtPly: next.ply, expiresAtPly: next.ply + POWERS.mysticVision.durationPlies });
    return squaresWithin(from, POWERS.mysticVision.range);
  },
};

export interface VisionInfo {
  /** Peças aliadas atacadas e quem as ataca. */
  threatened: { square: Square; attackers: Square[] }[];
  /** Casas da área sob ataque adversário. */
  dangerSquares: Square[];
  /** Casas da área onde peças aliadas defendem. */
  safeSquares: Square[];
}

/** Informação tática calculada pelo motor de regras sobre a posição pública. */
export function computeVision(state: GameState, owner: Color): VisionInfo | null {
  const v = state.vision.find((x) => x.owner === owner);
  if (!v) return null;
  const c = chessOf(state);
  const enemy = opposite(owner);
  const threatened: VisionInfo['threatened'] = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== owner || p.type === 'k') continue;
      const attackers = c.attackers(p.square, enemy);
      if (attackers.length) threatened.push({ square: p.square, attackers });
    }
  }
  const area = squaresWithin(v.anchor, POWERS.mysticVision.range);
  const dangerSquares = area.filter((s) => c.isAttacked(s, enemy));
  const safeSquares = area.filter((s) => !c.isAttacked(s, enemy) && c.isAttacked(s, owner));
  return { threatened, dangerSquares, safeSquares };
}
