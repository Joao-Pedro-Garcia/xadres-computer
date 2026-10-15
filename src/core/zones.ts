import type { Chess } from 'chess.js';
import { POWERS } from './balance';
import { chessOf } from './board';
import { squaresWithin } from './squares';
import type { Color, GameState, Square, Zone } from './types';

/** Casas cobertas por uma zona antimagia (o Escudo Real acompanha o rei). */
export function zoneSquares(state: GameState, zone: Zone, chess?: Chess): Square[] {
  if (zone.kind === 'wall') return zone.squares;
  const c = chess ?? chessOf(state);
  const king = c.findPiece({ type: 'k', color: zone.owner })[0];
  if (!king) return [];
  return squaresWithin(king, POWERS.royalShield.range);
}

/** Casas onde poderes de movimento de `mover` não podem terminar. */
export function blockedSquaresFor(state: GameState, mover: Color, chess?: Chess): Set<Square> {
  const out = new Set<Square>();
  const c = chess ?? chessOf(state);
  for (const z of state.zones) {
    if (z.owner === mover) continue;
    for (const s of zoneSquares(state, z, c)) out.add(s);
  }
  return out;
}
