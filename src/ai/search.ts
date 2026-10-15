import { Chess } from 'chess.js';
import { POWERS, PIECE_VALUE, ENERGY } from '../core/balance';
import { allPowerMoves, applyAction, chessOf, powerMoveFen } from '../core/game';
import { chebyshev, opposite, squaresWithin } from '../core/squares';
import type { Action, Color, Difficulty, GameState, PieceSymbol, PowerAction, Square } from '../core/types';
import { energyValue, evaluateBoard } from './eval';

/**
 * Acesso à API interna do chess.js 1.4.0 (versão fixada no package.json) para
 * gerar/aplicar lances sem o custo de gerar SAN. Usado apenas pela busca da IA;
 * as regras oficiais da partida passam pela API pública em core/game.ts.
 */
interface InternalMove {
  color: Color;
  from: number;
  to: number;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  flags: number;
}
interface ChessInternals {
  _moves(opts: { legal: boolean }): InternalMove[];
  _makeMove(m: InternalMove): void;
  _undoMove(): InternalMove | null;
  _board: ({ type: PieceSymbol; color: Color } | undefined)[];
  _turn: Color;
  _isKingAttacked(c: Color): boolean;
}

const MATE = 100000;

export function algebraic(i: number): Square {
  return ('abcdefgh'[i & 15] + (8 - (i >> 4))) as Square;
}

export interface DifficultyProfile {
  depth: number;
  timeMs: number;
  quiescence: boolean;
  noise: number;
  blunderChance: number;
  powerMoves: boolean;
  utilityPowers: boolean;
  powerThreats: boolean;
}

export const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { depth: 1, timeMs: 400, quiescence: false, noise: 120, blunderChance: 0.25, powerMoves: true, utilityPowers: false, powerThreats: false },
  medium: { depth: 2, timeMs: 1000, quiescence: true, noise: 25, blunderChance: 0, powerMoves: true, utilityPowers: true, powerThreats: false },
  hard: { depth: 3, timeMs: 2000, quiescence: true, noise: 0, blunderChance: 0, powerMoves: true, utilityPowers: true, powerThreats: true },
  master: { depth: 5, timeMs: 3500, quiescence: true, noise: 0, blunderChance: 0, powerMoves: true, utilityPowers: true, powerThreats: true },
};

class TimeUp extends Error {}

class Searcher {
  nodes = 0;
  private deadline: number;
  constructor(timeMs: number, private qs: boolean) {
    this.deadline = Date.now() + timeMs;
  }

  private tick() {
    if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new TimeUp();
  }

  timeLeft() {
    return Date.now() < this.deadline;
  }

  static order(moves: InternalMove[]): InternalMove[] {
    const score = (m: InternalMove) =>
      (m.captured ? 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece] / 10 + 1000 : 0) + (m.promotion ? 800 : 0);
    return moves.sort((a, b) => score(b) - score(a));
  }

  static evalSide(c: ChessInternals): number {
    const e = evaluateBoard(c._board);
    return c._turn === 'w' ? e : -e;
  }

  negamax(c: ChessInternals, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const moves = c._moves({ legal: true });
    if (moves.length === 0) return c._isKingAttacked(c._turn) ? -MATE + ply : 0;
    if (depth <= 0) return this.qs ? this.quiesce(c, alpha, beta, 0) : Searcher.evalSide(c);
    for (const m of Searcher.order(moves)) {
      c._makeMove(m);
      const v = -this.negamax(c, depth - 1, -beta, -alpha, ply + 1);
      c._undoMove();
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  quiesce(c: ChessInternals, alpha: number, beta: number, qd: number): number {
    this.tick();
    const stand = Searcher.evalSide(c);
    if (stand >= beta || qd > 5) return stand;
    if (stand > alpha) alpha = stand;
    const caps = c._moves({ legal: true }).filter((m) => m.captured || m.promotion);
    for (const m of Searcher.order(caps)) {
      c._makeMove(m);
      const v = -this.quiesce(c, -beta, -alpha, qd + 1);
      c._undoMove();
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
}

interface Candidate {
  action: Action;
  /** Pontuação da busca do ponto de vista do lado que joga. */
  score: number;
  /** Pontuação final, incluindo valor da energia. */
  total: number;
  fenAfter: string;
}

function internalToAction(m: InternalMove): Action {
  return { kind: 'move', from: algebraic(m.from), to: algebraic(m.to), promotion: m.promotion as 'q' | undefined };
}

export interface AiDecision {
  /** Ações de suporte (escudo, muralha) seguidas da jogada que encerra o turno. */
  actions: Action[];
  score: number;
  nodes: number;
  depth: number;
}

function random<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

/**
 * Escolhe a jogada da IA. A IA usa somente o estado público da partida e
 * recebe energia pelas mesmas regras do jogador.
 */
export function chooseAction(state: GameState, difficulty: Difficulty, rnd: () => number = Math.random): AiDecision {
  const profile = PROFILES[difficulty];
  const chess = chessOf(state);
  const me = chess.turn();
  const internals = chess as unknown as ChessInternals;
  const stdMoves = internals._moves({ legal: true });
  const powerMoves = profile.powerMoves ? allPowerMoves(state, chess) : [];
  if (!stdMoves.length) return { actions: [], score: 0, nodes: 0, depth: 0 };

  // Erros deliberados no nível fácil (sempre lances legais).
  if (rnd() < profile.blunderChance) {
    const pool: Action[] = stdMoves.map(internalToAction);
    if (powerMoves.length && rnd() < 0.3) pool.push(random(powerMoves, rnd));
    return { actions: [random(pool, rnd)], score: 0, nodes: 0, depth: 0 };
  }

  const searcher = new Searcher(profile.timeMs, profile.quiescence);
  const myEnergy = state.energy[me];
  const rootCandidates: { action: Action; fen: string; energyAfter: number }[] = [];
  for (const m of stdMoves) {
    internals._makeMove(m);
    const fen = chess.fen();
    internals._undoMove();
    const bonus = m.captured ? ENERGY.captureBonus : 0;
    rootCandidates.push({ action: internalToAction(m), fen, energyAfter: Math.min(ENERGY.max, myEnergy + bonus) });
  }
  for (const p of powerMoves) {
    rootCandidates.push({
      action: p,
      fen: powerMoveFen(chess, p.from, p.to!),
      energyAfter: myEnergy - POWERS[p.power].cost,
    });
  }

  const margin = profile.noise * 2 + (profile.powerThreats ? 400 : 1);
  let best: Candidate[] = [];
  let reachedDepth = 0;
  // Aprofundamento iterativo com limite de tempo.
  for (let depth = 1; depth <= profile.depth; depth++) {
    const results: Candidate[] = [];
    try {
      const ordered = best.length
        ? [...rootCandidates].sort(
            (a, b) =>
              (best.find((x) => x.fenAfter === b.fen)?.total ?? -Infinity) -
              (best.find((x) => x.fenAfter === a.fen)?.total ?? -Infinity),
          )
        : rootCandidates;
      let alpha = -Infinity;
      for (const cand of ordered) {
        const child = new Chess(cand.fen, { skipValidation: true }) as unknown as ChessInternals;
        const ev = energyValue(cand.energyAfter) - energyValue(myEnergy);
        // A energia entra só na raiz. A margem mantém exatas as pontuações próximas da melhor,
        // necessárias para o ruído (níveis baixos) e para a análise de ameaças mágicas.
        const beta = alpha === -Infinity ? MATE : -(alpha - ev - margin);
        const raw = -searcher.negamax(child, depth - 1, -MATE, Math.min(MATE, beta), 1);
        const total = raw + ev;
        results.push({ action: cand.action, score: raw, total, fenAfter: cand.fen });
        if (total > alpha) alpha = total;
      }
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
      if (results.length && results.length === rootCandidates.length) best = results;
      break;
    }
    best = results;
    reachedDepth = depth;
    if (!searcher.timeLeft()) break;
    if (best.some((c) => c.score > MATE - 100)) break;
  }

  // Ameaças mágicas do adversário (Difícil/Mestre): penaliza jogadas que deixam um poder inimigo forte.
  if (profile.powerThreats) {
    best.sort((a, b) => b.total - a.total);
    for (const cand of best.slice(0, 5)) {
      const threat = enemyPowerThreat(state, cand, me);
      cand.total -= threat.gain;
    }
  }

  for (const c of best) c.total += profile.noise ? (rnd() * 2 - 1) * profile.noise : 0;
  best.sort((a, b) => b.total - a.total);
  const choice = best[0];
  const actions: Action[] = [];
  if (profile.utilityPowers) {
    const u = chooseUtility(state, choice, me);
    if (u) actions.push(u);
  }
  actions.push(choice.action);
  return { actions, score: choice.score, nodes: searcher.nodes, depth: reachedDepth };
}

/** Estado hipotético após a jogada candidata (zonas/efeitos simplificados para análise). */
function hypothetical(state: GameState, fenAfter: string): GameState {
  return {
    ...state,
    fen: fenAfter,
    turn: { powers: [], pieces: [], captureBonusGiven: false },
    zones: state.zones.filter((z) => state.ply + 1 < z.expiresAtPly),
  };
}

/** Avalia o melhor poder de movimento adversário após a jogada (1 lance + capturas). */
function enemyPowerThreat(state: GameState, cand: Candidate, me: Color): { gain: number; squares: Square[] } {
  const enemy = opposite(me);
  const h = hypothetical(state, cand.fenAfter);
  h.energy = { ...state.energy, [enemy]: Math.min(ENERGY.max, state.energy[enemy] + ENERGY.perTurn) };
  const chess = new Chess(cand.fenAfter, { skipValidation: true });
  const moves = allPowerMoves(h, chess);
  if (!moves.length) return { gain: 0, squares: [] };
  const s = new Searcher(150, true);
  const baseline = cand.score; // da minha perspectiva
  let worst = baseline;
  const squares: Square[] = [];
  for (const m of moves) {
    const fen = powerMoveFen(chess, m.from, m.to!);
    const c = new Chess(fen, { skipValidation: true }) as unknown as ChessInternals;
    let v: number;
    try {
      v = s.quiesce(c, -MATE, MATE, 0); // minha perspectiva (é minha vez)
    } catch {
      break;
    }
    if (c._moves({ legal: true }).length === 0) v = c._isKingAttacked(c._turn) ? -MATE : 0;
    if (v < baseline - 120) squares.push(m.to!);
    if (v < worst) worst = v;
  }
  const gain = Math.max(0, baseline - worst) * 0.5; // probabilidade/custo do adversário
  return { gain: Math.min(gain, 600), squares };
}

/** Decide se vale ativar Escudo Real ou Muralha antes da jogada escolhida. */
function chooseUtility(state: GameState, choice: Candidate, me: Color): PowerAction | null {
  const chess = chessOf(state);
  const energy = state.energy[me];
  const moveCost = choice.action.kind === 'power' ? POWERS[choice.action.power].cost : 0;
  const threat = enemyPowerThreat(state, choice, me);
  if (!threat.squares.length) return null;
  const after = new Chess(choice.fenAfter, { skipValidation: true });
  const myKing = after.findPiece({ type: 'k', color: me })[0];
  const reserve = 20;

  const shieldCost = POWERS.royalShield.cost;
  const kingSq = chess.findPiece({ type: 'k', color: me })[0];
  if (
    myKing &&
    kingSq &&
    !state.turn.powers.includes('royalShield') &&
    !state.zones.some((z) => z.owner === me && z.kind === 'shield') &&
    energy - moveCost - shieldCost >= reserve &&
    threat.squares.some((s) => chebyshev(s, myKing) <= POWERS.royalShield.range)
  ) {
    return { kind: 'power', power: 'royalShield', from: kingSq };
  }

  const wallCost = POWERS.wall.cost;
  if (energy - moveCost - wallCost < reserve) return null;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== me || p.type !== 'r') continue;
      if (choice.action.from === p.square) continue; // a muralha fica na casa atual da torre
      const zone = new Set(squaresWithin(p.square, POWERS.wall.range));
      const covered = threat.squares.filter((s) => zone.has(s)).length;
      if (covered && covered === threat.squares.length) {
        const r = applyAction(state, { kind: 'power', power: 'wall', from: p.square });
        if (r.ok) return { kind: 'power', power: 'wall', from: p.square };
      }
    }
  }
  return null;
}

/** Utilitário para testes e simulações: joga a partida inteira IA x IA. */
export function selfPlay(
  state: GameState,
  white: Difficulty,
  black: Difficulty,
  maxPlies = 200,
  rnd: () => number = Math.random,
): GameState {
  let s = state;
  while (!s.result && s.ply < maxPlies) {
    const side = chessOf(s).turn();
    const d = chooseAction(s, side === 'w' ? white : black, rnd);
    for (const a of d.actions) {
      const r = applyAction(s, a);
      if (!r.ok) throw new Error(`IA gerou ação inválida: ${JSON.stringify(a)} (${r.error})`);
      s = r.state;
    }
  }
  return s;
}
