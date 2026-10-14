import { Chess } from 'chess.js';
import type { Color, Difficulty, GameState, PowerId } from '../core/types';
import { outcomeFor, type MatchSummary, type RewardReport } from './profile';

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
  /** Data/hora de término. */
  date: number;
  difficulty: Difficulty;
  playerColor: Color;
  outcome: 'win' | 'loss' | 'draw';
  reason: string;
  plies: number;
  xp: number;
  coins: number;
  /** Quantidade de poderes usados pelo jogador (mantido por compatibilidade). */
  powers: number;
  moves: string[];
  /* Campos adicionados na versão 2 do histórico (opcionais em registros antigos). */
  durationMs?: number;
  captures?: { player: number; ai: number };
  powersUsed?: PowerId[];
  aiPowers?: number;
  finalFen?: string;
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
    playerPromotions: s.history.filter((h) => h.color === me && h.promotion).length,
    arcaneMate: result.reason === 'checkmate' && result.winner === me && !!s.history.at(-1)?.power,
    finalEnergy: s.energy[me],
    undoUsed: saved.undoUsed,
    startedAt: saved.startedAt,
    endedAt,
  };
}

/** Monta o registro do histórico (sem dados pessoais: apenas dados da partida). */
export function buildHistoryEntry(saved: SavedGame, m: MatchSummary, r: RewardReport): HistoryEntry {
  const s = saved.state;
  const ai = m.playerColor === 'w' ? 'b' : 'w';
  return {
    gameId: m.gameId,
    date: m.endedAt,
    difficulty: m.difficulty,
    playerColor: m.playerColor,
    outcome: m.outcome,
    reason: m.result.reason,
    plies: m.plies,
    xp: r.xp,
    coins: r.coins,
    powers: m.playerPowers.length,
    moves: s.history.map((h) => h.notation),
    durationMs: Math.max(0, m.endedAt - m.startedAt),
    captures: { player: m.playerCaptures, ai: s.history.filter((h) => h.color === ai && h.captured).length },
    powersUsed: m.playerPowers,
    aiPowers: s.powerLog.filter((p) => p.color === ai).length,
    finalFen: s.fen,
  };
}

export type HistoryFilter = { outcome: 'all' | 'win' | 'loss' | 'draw'; difficulty: 'all' | Difficulty };

export function filterHistory(list: HistoryEntry[], f: HistoryFilter): HistoryEntry[] {
  return list.filter((e) => (f.outcome === 'all' || e.outcome === f.outcome) && (f.difficulty === 'all' || e.difficulty === f.difficulty));
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`;
}
