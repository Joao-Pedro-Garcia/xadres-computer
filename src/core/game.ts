import { Chess } from 'chess.js';
import { ENERGY, POWERS, POWER_BY_PIECE } from './balance';
import { chessOf, kingSafeAfter, powerMoveFen, sideToMove } from './board';
import { canAfford, clampEnergy, grantCaptureBonus, grantTurnEnergy, spendEnergy } from './energy';
import { POWER_MODULES, computeVision, type MovementPowerModule, type VisionInfo } from './powers';
import { chebyshev, opposite } from './squares';
import { blockedSquaresFor, zoneSquares } from './zones';
import type {
  Action,
  ActionError,
  ActionResult,
  Color,
  GameEvent,
  GameResult,
  GameState,
  MovementPowerId,
  MoveAction,
  PieceSymbol,
  PowerAction,
  PowerId,
  Square,
} from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Chave de posição para detecção de repetição (sem relógios). */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createGame(fen: string = START_FEN, opts: { startEnergy?: number; id?: string } = {}): GameState {
  const chess = new Chess(fen);
  const start = opts.startEnergy ?? ENERGY.start;
  const state: GameState = {
    version: 1,
    id: opts.id ?? newId(),
    fen: chess.fen(),
    ply: 0,
    energy: { w: start, b: start },
    zones: [],
    nextZoneId: 1,
    vision: [],
    turn: { powers: [], pieces: [], captureBonusGiven: false },
    positionCounts: { [positionKey(chess.fen())]: 1 },
    history: [],
    powerLog: [],
    captured: { w: [], b: [] },
    lastMove: null,
    result: null,
  };
  // Início do primeiro turno do lado que joga.
  const side = chess.turn();
  state.energy[side] = clampEnergy(state.energy[side] + ENERGY.perTurn);
  return state;
}

function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

/* ------------------------------------------------------------------ */
/* Destinos de poderes                                                */
/* ------------------------------------------------------------------ */

function movementModule(power: PowerId): MovementPowerModule | null {
  const m = POWER_MODULES[power];
  return m.kind === 'movement' ? m : null;
}

export function powerTargets(state: GameState, power: MovementPowerId, from: Square, chess?: Chess): Square[] {
  const c = chess ?? chessOf(state);
  const piece = c.get(from);
  const mod = movementModule(power);
  if (!mod || !piece || piece.color !== c.turn() || mod.spec.piece !== piece.type) return [];
  const blocked = blockedSquaresFor(state, piece.color, c);
  return mod.rawTargets(c, from).filter((to) => !blocked.has(to) && kingSafeAfter(powerMoveFen(c, from, to), piece.color));
}

/* ------------------------------------------------------------------ */
/* Disponibilidade                                                    */
/* ------------------------------------------------------------------ */

export interface PowerAvailability {
  power: PowerId;
  cost: number;
  available: boolean;
  reason?: ActionError;
  targets: Square[];
}

export function powerAvailability(state: GameState, from: Square, chess?: Chess): PowerAvailability | null {
  const c = chess ?? chessOf(state);
  const piece = c.get(from);
  if (!piece) return null;
  const power = POWER_BY_PIECE[piece.type];
  const spec = POWERS[power];
  const base = { power, cost: spec.cost, targets: [] as Square[] };
  const check = precheck(state, c, power, from);
  if (check) {
    // Informa o motivo mais útil: sem destino possível vale mais que falta de energia.
    if (check === 'insufficientEnergy' && spec.endsTurn && piece.color === c.turn() && !powerTargets(state, power as MovementPowerId, from, c).length)
      return { ...base, available: false, reason: 'invalidTarget' };
    return { ...base, available: false, reason: check };
  }
  if (spec.endsTurn) {
    const targets = powerTargets(state, power as MovementPowerId, from, c);
    if (!targets.length) return { ...base, available: false, reason: 'invalidTarget' };
    return { ...base, available: true, targets };
  }
  return { ...base, available: true };
}

function precheck(state: GameState, c: Chess, power: PowerId, from: Square): ActionError | null {
  if (state.result) return 'gameOver';
  const piece = c.get(from);
  const side = c.turn();
  if (!piece || piece.color !== side) return 'notYourPiece';
  const spec = POWERS[power];
  if (spec.piece !== piece.type) return 'wrongPiece';
  if (state.turn.powers.includes(power)) return 'powerAlreadyUsed';
  if (state.turn.pieces.includes(from)) return 'pieceAlreadyUsed';
  if (!canAfford(state, side, spec.cost)) return 'insufficientEnergy';
  const mod = POWER_MODULES[power];
  if (mod.kind === 'utility' && mod.alreadyActive(state, side)) return 'alreadyActive';
  return null;
}

/* ------------------------------------------------------------------ */
/* Aplicação transacional                                              */
/* ------------------------------------------------------------------ */

export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.result) return { ok: false, error: 'gameOver' };
  return action.kind === 'move' ? applyMove(state, action) : applyPower(state, action);
}

function applyMove(state: GameState, action: MoveAction): ActionResult {
  const chess = chessOf(state);
  const piece = chess.get(action.from);
  if (!piece || piece.color !== chess.turn()) return { ok: false, error: 'notYourPiece' };
  let move;
  try {
    move = chess.move({ from: action.from, to: action.to, promotion: action.promotion ?? 'q' });
  } catch {
    return { ok: false, error: 'illegalMove' };
  }
  const next = cloneState(state);
  const color = piece.color;
  const events: GameEvent[] = [];
  const ev: GameEvent = { type: 'move', color, piece: piece.type, from: move.from, to: move.to };
  if (move.captured) {
    ev.captured = move.captured;
    ev.capturedSquare = move.isEnPassant() ? ((move.to[0] + move.from[1]) as Square) : move.to;
    next.captured[color].push(move.captured);
  }
  if (move.promotion) ev.promotion = move.promotion;
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const rank = color === 'w' ? '1' : '8';
    ev.rook = move.isKingsideCastle()
      ? { from: `h${rank}` as Square, to: `f${rank}` as Square }
      : { from: `a${rank}` as Square, to: `d${rank}` as Square };
  }
  events.push(ev);
  if (move.captured) grantCaptureBonus(next, color, events);
  next.history.push({
    ply: state.ply,
    color,
    notation: move.san,
    from: move.from,
    to: move.to,
    piece: piece.type,
    captured: move.captured,
    promotion: move.promotion,
  });
  next.fen = chess.fen();
  next.lastMove = { from: move.from, to: move.to };
  endTurn(next, chess, events);
  return { ok: true, state: next, events };
}

function applyPower(state: GameState, action: PowerAction): ActionResult {
  const chess = chessOf(state);
  const err = precheck(state, chess, action.power, action.from);
  if (err) return { ok: false, error: err };
  const mod = POWER_MODULES[action.power];
  const cost = mod.spec.cost;
  const color = chess.turn();
  const piece = chess.get(action.from)!;
  const next = cloneState(state);
  const events: GameEvent[] = [];

  if (mod.kind === 'movement') {
    const to = action.to;
    if (!to || !mod.rawTargets(chess, action.from).includes(to)) return { ok: false, error: 'invalidTarget' };
    if (blockedSquaresFor(state, color, chess).has(to)) return { ok: false, error: 'blockedByZone' };
    const fen = powerMoveFen(chess, action.from, to);
    if (!kingSafeAfter(fen, color)) return { ok: false, error: 'kingInDanger' };
    // Validação concluída: confirma o estado e cobra a energia uma única vez.
    const before = spendEnergy(next, color, cost, events);
    next.fen = new Chess(fen).fen();
    next.lastMove = { from: action.from, to };
    next.history.push({
      ply: state.ply,
      color,
      notation: `${piece.type === 'p' ? '' : piece.type.toUpperCase()}${action.from}${mod.symbol}${to}`,
      from: action.from,
      to,
      piece: piece.type,
      power: mod.id,
    });
    next.powerLog.push({ ply: state.ply, color, power: mod.id, from: action.from, to, cost, energyBefore: before, energyAfter: next.energy[color] });
    next.turn.powers.push(mod.id);
    next.turn.pieces.push(action.from);
    events.push({ type: 'powerMove', power: mod.id, color, piece: piece.type, from: action.from, to });
    endTurn(next, new Chess(next.fen), events);
    return { ok: true, state: next, events };
  }

  // Poderes de suporte: não alteram o tabuleiro nem passam o turno.
  const before = spendEnergy(next, color, cost, events);
  const squares = mod.activate(next, color, action.from, chess);
  next.turn.powers.push(mod.id);
  next.turn.pieces.push(action.from);
  next.powerLog.push({ ply: state.ply, color, power: mod.id, from: action.from, cost, energyBefore: before, energyAfter: next.energy[color] });
  events.push({ type: 'powerUtility', power: mod.id, color, from: action.from, squares });
  return { ok: true, state: next, events };
}

/** Fecha o turno: avança o ply, expira efeitos, concede energia e verifica o fim de jogo. */
function endTurn(next: GameState, chess: Chess, events: GameEvent[]): void {
  next.ply += 1;
  next.zones = next.zones.filter((z) => next.ply < z.expiresAtPly);
  next.vision = next.vision.filter((v) => next.ply < v.expiresAtPly);
  next.turn = { powers: [], pieces: [], captureBonusGiven: false };
  const key = positionKey(next.fen);
  next.positionCounts[key] = (next.positionCounts[key] ?? 0) + 1;

  const side = chess.turn();
  if (chess.inCheck()) {
    const king = chess.findPiece({ type: 'k', color: side })[0];
    if (king) events.push({ type: 'check', color: side, king });
  }
  const result = detectResult(next, chess);
  if (result) {
    next.result = result;
    events.push({ type: 'gameOver', result });
    return;
  }
  grantTurnEnergy(next, side, events);
}

/** Fim de jogo pelas regras tradicionais (os poderes não salvam de mate nem de afogamento). */
export function detectResult(state: GameState, chess: Chess): GameResult | null {
  if (chess.isCheckmate()) return { winner: opposite(chess.turn()), reason: 'checkmate' };
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: 'fiftyMove' };
  if ((state.positionCounts[positionKey(state.fen)] ?? 0) >= 3) return { winner: null, reason: 'repetition' };
  return null;
}

export function resign(state: GameState, color: Color): GameState {
  if (state.result) return state;
  const next = cloneState(state);
  next.result = { winner: opposite(color), reason: 'resign' };
  return next;
}

/* ------------------------------------------------------------------ */
/* Consultas para a interface                                          */
/* ------------------------------------------------------------------ */

export function legalMovesFrom(state: GameState, from: Square, chess?: Chess): { to: Square; promotion: boolean; capture: boolean }[] {
  if (state.result) return [];
  const c = chess ?? chessOf(state);
  const seen = new Map<Square, { to: Square; promotion: boolean; capture: boolean }>();
  for (const m of c.moves({ square: from, verbose: true })) {
    if (!seen.has(m.to)) seen.set(m.to, { to: m.to, promotion: m.isPromotion(), capture: m.isCapture() });
  }
  return [...seen.values()];
}

export function kingSquare(state: GameState, color: Color): Square | undefined {
  return chessOf(state).findPiece({ type: 'k', color })[0];
}

export function isInCheck(state: GameState): boolean {
  return chessOf(state).inCheck();
}

export function pieceAt(state: GameState, sq: Square): { type: PieceSymbol; color: Color } | undefined {
  return chessOf(state).get(sq);
}

/** Todas as ações de poder de movimento legais para o lado que joga. */
export function allPowerMoves(state: GameState, chess?: Chess): PowerAction[] {
  const c = chess ?? chessOf(state);
  const side = c.turn();
  const out: PowerAction[] = [];
  if (state.result) return out;
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== side) continue;
      const power = POWER_BY_PIECE[p.type];
      if (!POWERS[power].endsTurn) continue;
      if (precheck(state, c, power, p.square)) continue;
      for (const to of powerTargets(state, power as MovementPowerId, p.square, c)) {
        out.push({ kind: 'power', power, from: p.square, to });
      }
    }
  }
  return out;
}

export { chebyshev, chessOf, clampEnergy, sideToMove, powerMoveFen, zoneSquares, blockedSquaresFor, computeVision };
export type { VisionInfo };
