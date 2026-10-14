import { Chess } from 'chess.js';
import { ENERGY, MAX_WALLS, POWERS, POWER_BY_PIECE } from './balance';
import { chebyshev, fileOf, opposite, rankOf, squaresWithin, toSquare } from './squares';
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
  UtilityPowerId,
  Zone,
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

export function clampEnergy(v: number): number {
  return Math.max(0, Math.min(ENERGY.max, v));
}

export function chessOf(state: GameState): Chess {
  return new Chess(state.fen);
}

export function sideToMove(state: GameState): Color {
  return state.fen.split(' ')[1] as Color;
}

function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

/* ------------------------------------------------------------------ */
/* Zonas antimagia                                                    */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Geração de destinos de poderes                                     */
/* ------------------------------------------------------------------ */

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
function kingSafeAfter(fen: string, color: Color): boolean {
  const c = new Chess(fen, { skipValidation: true });
  const king = c.findPiece({ type: 'k', color })[0];
  if (!king) return false;
  return !c.isAttacked(king, opposite(color));
}

/** Destinos geométricos (antes de checar zonas e segurança do rei). */
function rawPowerTargets(chess: Chess, power: MovementPowerId, from: Square): Square[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const out: Square[] = [];
  if (power === 'arcaneStep') {
    const normal = new Set(chess.moves({ square: from, verbose: true }).map((m) => m.to));
    for (const s of squaresWithin(from, POWERS.arcaneStep.range)) {
      if (s === from || chess.get(s) || normal.has(s)) continue;
      out.push(s);
    }
  } else if (power === 'phantomLeap') {
    for (const s of squaresWithin(from, POWERS.phantomLeap.range)) {
      if (s === from || chess.get(s)) continue;
      const df = Math.abs(fileOf(s) - fileOf(from));
      const dr = Math.abs(rankOf(s) - rankOf(from));
      if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) continue; // salto normal
      out.push(s);
    }
  } else if (power === 'surge') {
    const dir = piece.color === 'w' ? 1 : -1;
    const startRank = piece.color === 'w' ? 1 : 6;
    const lastRank = piece.color === 'w' ? 7 : 0;
    const r = rankOf(from);
    if (r === startRank) return [];
    const one = toSquare(fileOf(from), r + dir);
    const two = toSquare(fileOf(from), r + 2 * dir);
    if (!one || !two) return [];
    if (chess.get(one) || chess.get(two)) return [];
    if (rankOf(two) === lastRank) return [];
    out.push(two);
  }
  return out;
}

export function powerTargets(state: GameState, power: MovementPowerId, from: Square, chess?: Chess): Square[] {
  const c = chess ?? chessOf(state);
  const piece = c.get(from);
  if (!piece || piece.color !== c.turn() || POWERS[power].piece !== piece.type) return [];
  const blocked = blockedSquaresFor(state, piece.color, c);
  return rawPowerTargets(c, power, from).filter(
    (to) => !blocked.has(to) && kingSafeAfter(powerMoveFen(c, from, to), piece.color),
  );
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
  if (state.energy[side] < spec.cost) return 'insufficientEnergy';
  if (power === 'royalShield' && state.zones.some((z) => z.kind === 'shield' && z.owner === side)) return 'alreadyActive';
  if (power === 'wall' && state.zones.filter((z) => z.kind === 'wall' && z.owner === side).length >= MAX_WALLS)
    return 'alreadyActive';
  if (power === 'mysticVision' && state.vision.some((v) => v.owner === side)) return 'alreadyActive';
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
  if (move.captured && !next.turn.captureBonusGiven) {
    const before = next.energy[color];
    next.energy[color] = clampEnergy(before + ENERGY.captureBonus);
    next.turn.captureBonusGiven = true;
    events.push({ type: 'energy', color, delta: next.energy[color] - before, reason: 'capture' });
  }
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

const POWER_SYMBOL: Record<MovementPowerId, string> = { arcaneStep: '✦', phantomLeap: '≈', surge: '»' };

function applyPower(state: GameState, action: PowerAction): ActionResult {
  const chess = chessOf(state);
  const err = precheck(state, chess, action.power, action.from);
  if (err) return { ok: false, error: err };
  const spec = POWERS[action.power];
  const color = chess.turn();
  const piece = chess.get(action.from)!;
  const next = cloneState(state);
  const events: GameEvent[] = [];
  const before = next.energy[color];

  if (spec.endsTurn) {
    const power = action.power as MovementPowerId;
    const to = action.to;
    if (!to) return { ok: false, error: 'invalidTarget' };
    if (!rawPowerTargets(chess, power, action.from).includes(to)) return { ok: false, error: 'invalidTarget' };
    if (blockedSquaresFor(state, color, chess).has(to)) return { ok: false, error: 'blockedByZone' };
    const fen = powerMoveFen(chess, action.from, to);
    if (!kingSafeAfter(fen, color)) return { ok: false, error: 'kingInDanger' };
    // Validação concluída: confirma estado e cobra energia uma única vez.
    next.energy[color] = before - spec.cost;
    next.fen = new Chess(fen).fen();
    next.lastMove = { from: action.from, to };
    next.history.push({
      ply: state.ply,
      color,
      notation: `${piece.type === 'p' ? '' : piece.type.toUpperCase()}${action.from}${POWER_SYMBOL[power]}${to}`,
      from: action.from,
      to,
      piece: piece.type,
      power,
    });
    next.powerLog.push({ ply: state.ply, color, power, from: action.from, to, cost: spec.cost, energyBefore: before, energyAfter: next.energy[color] });
    next.turn.powers.push(power);
    next.turn.pieces.push(action.from);
    events.push({ type: 'energy', color, delta: -spec.cost, reason: 'power' });
    events.push({ type: 'powerMove', power, color, piece: piece.type, from: action.from, to });
    const after = new Chess(next.fen);
    endTurn(next, after, events);
    return { ok: true, state: next, events };
  }

  // Poderes de suporte: não alteram o tabuleiro nem passam o turno.
  const power = action.power as UtilityPowerId;
  let squares: Square[] = [];
  if (power === 'royalShield') {
    const zone: Zone = { id: next.nextZoneId++, kind: 'shield', owner: color, squares: [], createdAtPly: state.ply, expiresAtPly: state.ply + spec.durationPlies };
    next.zones.push(zone);
    squares = zoneSquares(next, zone, chess);
  } else if (power === 'wall') {
    squares = squaresWithin(action.from, spec.range);
    next.zones.push({ id: next.nextZoneId++, kind: 'wall', owner: color, squares, createdAtPly: state.ply, expiresAtPly: state.ply + spec.durationPlies });
  } else {
    next.vision.push({ owner: color, anchor: action.from, createdAtPly: state.ply, expiresAtPly: state.ply + spec.durationPlies });
    squares = squaresWithin(action.from, spec.range);
  }
  next.energy[color] = before - spec.cost;
  next.turn.powers.push(power);
  next.turn.pieces.push(action.from);
  next.powerLog.push({ ply: state.ply, color, power, from: action.from, cost: spec.cost, energyBefore: before, energyAfter: next.energy[color] });
  events.push({ type: 'energy', color, delta: -spec.cost, reason: 'power' });
  events.push({ type: 'powerUtility', power, color, from: action.from, squares });
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
  const before = next.energy[side];
  next.energy[side] = clampEnergy(before + ENERGY.perTurn);
  if (next.energy[side] !== before) events.push({ type: 'energy', color: side, delta: next.energy[side] - before, reason: 'turn' });
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

export interface VisionInfo {
  /** Peças aliadas atacadas e quem as ataca. */
  threatened: { square: Square; attackers: Square[] }[];
  /** Casas da área sob ataque adversário. */
  dangerSquares: Square[];
  /** Casas da área onde peças aliadas defendem. */
  safeSquares: Square[];
}

/** Informação tática real, calculada pelo motor de regras sobre a posição pública. */
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

export { chebyshev };
