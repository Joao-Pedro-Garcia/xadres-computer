import { POWERS } from '../balance';
import { fileOf, rankOf, toSquare } from '../squares';
import type { MovementPowerModule } from './types';

/** Peão — Impulso: duas casas à frente fora da fileira inicial, ambas livres, sem chegar à última fileira. */
export const surge: MovementPowerModule = {
  kind: 'movement',
  id: 'surge',
  spec: POWERS.surge,
  symbol: '»',
  rawTargets(chess, from) {
    const piece = chess.get(from);
    if (!piece) return [];
    const dir = piece.color === 'w' ? 1 : -1;
    const startRank = piece.color === 'w' ? 1 : 6;
    const lastRank = piece.color === 'w' ? 7 : 0;
    const r = rankOf(from);
    if (r === startRank) return [];
    const one = toSquare(fileOf(from), r + dir);
    const two = toSquare(fileOf(from), r + 2 * dir);
    if (!one || !two || chess.get(one) || chess.get(two) || rankOf(two) === lastRank) return [];
    return [two];
  },
};
