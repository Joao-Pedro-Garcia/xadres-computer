import { POWERS } from '../balance';
import { fileOf, rankOf, squaresWithin } from '../squares';
import type { MovementPowerModule } from './types';

/** Cavalo — Salto Fantasma: casa vazia no alcance que não seja um salto normal de cavalo. */
export const phantomLeap: MovementPowerModule = {
  kind: 'movement',
  id: 'phantomLeap',
  spec: POWERS.phantomLeap,
  symbol: '≈',
  rawTargets(chess, from) {
    return squaresWithin(from, POWERS.phantomLeap.range).filter((s) => {
      if (s === from || chess.get(s)) return false;
      const df = Math.abs(fileOf(s) - fileOf(from));
      const dr = Math.abs(rankOf(s) - rankOf(from));
      return !((df === 1 && dr === 2) || (df === 2 && dr === 1));
    });
  },
};
