import { Chess } from 'chess.js';
import type { Color, Difficulty, GameState } from '../core/types';
import { outcomeFor, type MatchSummary } from './profile';

export interface SavedGame {
  version: 1;
  state: GameState;
  difficulty: Difficulty;
  playerColor: Color;
  undoUsed: number;
  startedAt: number;
  /** Estados anteriores ao último lance do jogador (para desfazer). */
  undoStack: GameState[];
}

export const MAX_UNDO = 20;

/** Valida uma partida salva; retorna null se estiver corrompida ou concluída. */
export function validateSaved(v: unknown): SavedGame | null {
  try {
    const s = v as SavedGame;
    if (!s || s.version !== 1 || !s.state || s.state.version !== 1) return null;
    if (!['easy', 'medium', 'hard', 'master'].includes(s.difficulty)) return null;
    if (s.playerColor !== 'w' && s.playerColor !== 'b') return null;
    if (s.state.result) return null;
    new Chess(s.state.fen); // lança erro se o FEN for inválido
    const e = s.state.energy;
    if (!e || [e.w, e.b].some((x) => typeof x !== 'number' || x < 0 || x > 200)) return null;
    if (!Array.isArray(s.undoStack)) s.undoStack = [];
    return s;
  } catch {
    return null;
  }
}

export interface HistoryEntry {
  gameId: string;
  date: number;
  difficulty: Difficulty;
  playerColor: Color;
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
  plies: number;
  xp: number;
  coins: number;
  powers: number;
  moves: string[];
}

export const MAX_HISTORY = 50;

export function isHistory(v: unknown): v is HistoryEntry[] {
  return Array.isArray(v);
}

export function buildSummary(saved: SavedGame, endedAt = Date.now()): MatchSummary {
  const s = saved.state;
  const me = saved.playerColor;
  const result = s.result!;
  return {
    gameId: s.id,
    difficulty: saved.difficulty,
    playerColor: me,
    result,
    outcome: outcomeFor(result, me),
    plies: s.ply,
    playerMoves: s.history.filter((h) => h.color === me).length,
    playerPowers: s.powerLog.filter((p) => p.color === me).map((p) => p.power),
    playerCaptures: s.history.filter((h) => h.color === me && h.captured).length,
    finalEnergy: s.energy[me],
    undoUsed: saved.undoUsed,
    startedAt: saved.startedAt,
    endedAt,
  };
}
