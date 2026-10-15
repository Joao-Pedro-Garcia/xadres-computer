import { Chess } from 'chess.js';
import { opposite } from './squares';
import type { Color, GameState, Square } from './types';

/** Utilitários de tabuleiro sobre o chess.js, compartilhados por regras e poderes. */
export function chessOf(state: GameState): Chess {
  return new Chess(state.fen);
}

export function sideToMove(state: GameState): Color {
  return state.fen.split(' ')[1] as Color;
}

/** Monta o FEN resultante de um movimento mágico (sem captura) e passa o turno. */
export function powerMoveFen(chess: Chess, from: Square, to: Square): string {
  const parts = chess.fen().split(' ');
  const piece = chess.get(from)!;
  const c = new Chess(chess.fen(), { skipValidation: true });
  c.remove(from);
  c.put(piece, to);
  const board = c.fen().split(' ')[0];
  const turn = parts[1] as Color;
  const half = piece.type === 'p' ? 0 : Number(parts[4]) + 1;
  const full = Number(parts[5]) + (turn === 'b' ? 1 : 0);
  // Poderes nunca criam en passant; direitos de roque não mudam (rei/torre não se movem com poderes).
  return [board, opposite(turn), parts[2], '-', String(half), String(full)].join(' ');
}

/** Verifica se, no FEN resultante, o rei de `color` está seguro. */
export function kingSafeAfter(fen: string, color: Color): boolean {
  const c = new Chess(fen, { skipValidation: true });
  const king = c.findPiece({ type: 'k', color })[0];
  if (!king) return false;
  return !c.isAttacked(king, opposite(color));
}
