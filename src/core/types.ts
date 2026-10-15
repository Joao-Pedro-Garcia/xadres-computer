import type { Square, PieceSymbol, Color } from 'chess.js';

export type { Square, PieceSymbol, Color };

export type PowerId =
  | 'royalShield'
  | 'arcaneStep'
  | 'wall'
  | 'mysticVision'
  | 'phantomLeap'
  | 'surge';

/** Poderes que movem uma peça e encerram o turno. */
export type MovementPowerId = 'arcaneStep' | 'phantomLeap' | 'surge';
/** Poderes de suporte: não movem peças e não encerram o turno. */
export type UtilityPowerId = 'royalShield' | 'wall' | 'mysticVision';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'master';

export interface MoveAction {
  kind: 'move';
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface PowerAction {
  kind: 'power';
  power: PowerId;
  from: Square;
  /** Obrigatório para poderes de movimento. */
  to?: Square;
}

export type Action = MoveAction | PowerAction;

/** Zona antimagia: impede que poderes de movimento adversários terminem nas casas cobertas. */
export interface Zone {
  id: number;
  kind: 'shield' | 'wall';
  owner: Color;
  /** Para a muralha: casas fixas. Para o escudo: vazio (calculado a partir do rei). */
  squares: Square[];
  createdAtPly: number;
  /** A zona é removida quando `ply >= expiresAtPly`. */
  expiresAtPly: number;
}

export interface VisionEffect {
  owner: Color;
  /** Casa do bispo no momento da ativação (centro da área). */
  anchor: Square;
  createdAtPly: number;
  expiresAtPly: number;
}

export interface MoveRecord {
  ply: number;
  color: Color;
  /** Notação: SAN para jogadas normais, forma especial para poderes. */
  notation: string;
  from: Square;
  to: Square;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  power?: MovementPowerId;
  promotion?: PieceSymbol;
}

export interface PowerLogEntry {
  ply: number;
  color: Color;
  power: PowerId;
  from: Square;
  to?: Square;
  cost: number;
  energyBefore: number;
  energyAfter: number;
}

export type ResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'repetition'
  | 'fiftyMove'
  | 'insufficient'
  | 'resign';

export interface GameResult {
  winner: Color | null;
  reason: ResultReason;
}

export interface TurnUsage {
  powers: PowerId[];
  pieces: Square[];
  captureBonusGiven: boolean;
}

export interface GameState {
  version: 1;
  id: string;
  fen: string;
  ply: number;
  energy: Record<Color, number>;
  zones: Zone[];
  nextZoneId: number;
  vision: VisionEffect[];
  turn: TurnUsage;
  positionCounts: Record<string, number>;
  history: MoveRecord[];
  powerLog: PowerLogEntry[];
  captured: Record<Color, PieceSymbol[]>;
  lastMove: { from: Square; to: Square } | null;
  result: GameResult | null;
}

/** Eventos gerados por uma ação validada; usados pela renderização e pelo áudio. */
export type GameEvent =
  | {
      type: 'move';
      color: Color;
      piece: PieceSymbol;
      from: Square;
      to: Square;
      captured?: PieceSymbol;
      capturedSquare?: Square;
      promotion?: PieceSymbol;
      rook?: { from: Square; to: Square };
    }
  | { type: 'powerMove'; power: MovementPowerId; color: Color; piece: PieceSymbol; from: Square; to: Square }
  | { type: 'powerUtility'; power: UtilityPowerId; color: Color; from: Square; squares: Square[] }
  | { type: 'energy'; color: Color; delta: number; reason: 'turn' | 'capture' | 'power' }
  | { type: 'check'; color: Color; king: Square }
  | { type: 'gameOver'; result: GameResult };

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ActionError };

export type ActionError =
  | 'gameOver'
  | 'notYourPiece'
  | 'illegalMove'
  | 'insufficientEnergy'
  | 'wrongPiece'
  | 'powerAlreadyUsed'
  | 'pieceAlreadyUsed'
  | 'invalidTarget'
  | 'kingInDanger'
  | 'blockedByZone'
  | 'alreadyActive';
