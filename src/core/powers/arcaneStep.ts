import { POWERS } from '../balance';
import { squaresWithin } from '../squares';
import type { MovementPowerModule } from './types';

/** Rainha — Passo Arcano: teleporte para casa vazia no alcance que a rainha não alcançaria normalmente. */
export const arcaneStep: MovementPowerModule = {
  kind: 'movement',
  id: 'arcaneStep',
  spec: POWERS.arcaneStep,
  symbol: '✦',
  rawTargets(chess, from) {
    const normal = new Set(chess.moves({ square: from, verbose: true }).map((m) => m.to));
    return squaresWithin(from, POWERS.arcaneStep.range).filter((s) => s !== from && !chess.get(s) && !normal.has(s));
  },
};
