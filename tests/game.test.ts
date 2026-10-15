import { describe, expect, it } from 'vitest';
import {
  allPowerMoves,
  applyAction,
  computeVision,
  createGame,
  legalMovesFrom,
  powerAvailability,
  powerTargets,
  sideToMove,
} from '../src/core/game';
import { ENERGY, POWERS } from '../src/core/balance';
import type { Action, GameState } from '../src/core/types';

function play(state: GameState, ...actions: Action[]): GameState {
  let s = state;
  for (const a of actions) {
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`${JSON.stringify(a)} -> ${r.error}`);
    s = r.state;
  }
  return s;
}
const mv = (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n'): Action =>
  ({ kind: 'move', from, to, promotion }) as Action;

describe('regras tradicionais', () => {
  it('posição inicial e 20 lances legais', () => {
    const g = createGame();
    expect(sideToMove(g)).toBe('w');
    const total = ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2', 'b1', 'g1']
      .map((s) => legalMovesFrom(g, s as never).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(20);
  });

  it('rejeita lance ilegal sem alterar o estado', () => {
    const g = createGame();
    const r = applyAction(g, mv('e2', 'e5'));
    expect(r.ok).toBe(false);
    expect(g.ply).toBe(0);
  });

  it('xeque-mate do pastor', () => {
    const s = play(createGame(), mv('e2', 'e4'), mv('e7', 'e5'), mv('f1', 'c4'), mv('b8', 'c6'), mv('d1', 'h5'), mv('g8', 'f6'), mv('h5', 'f7'));
    expect(s.result).toEqual({ winner: 'w', reason: 'checkmate' });
    expect(applyAction(s, mv('a7', 'a6')).ok).toBe(false);
  });

  it('roque, en passant e promoção', () => {
    const castle = play(createGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), mv('e1', 'g1'));
    expect(castle.fen.startsWith('r3k2r/8/8/8/8/8/8/R4RK1 b kq')).toBe(true);

    const ep = applyAction(createGame('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), mv('e5', 'd6'));
    expect(ep.ok && ep.events[0].type === 'move' && ep.events[0].capturedSquare).toBe('d5');

    const promo = play(createGame('8/P6k/8/8/8/8/8/K7 w - - 0 1'), mv('a7', 'a8', 'n'));
    expect(promo.fen.startsWith('N7/')).toBe(true);
  });

  it('afogamento e repetição', () => {
    const stale = play(createGame('7k/8/6Q1/8/8/8/8/K7 w - - 0 1'), mv('g6', 'f7'));
    expect(stale.result?.reason).toBe('stalemate');
    const rep = play(createGame(), mv('g1', 'f3'), mv('g8', 'f6'), mv('f3', 'g1'), mv('f6', 'g8'), mv('g1', 'f3'), mv('g8', 'f6'), mv('f3', 'g1'), mv('f6', 'g8'));
    expect(rep.result).toEqual({ winner: null, reason: 'repetition' });
  });
});

describe('energia', () => {
  it('concede energia no início de cada turno próprio, com teto', () => {
    const g = createGame();
    expect(g.energy).toEqual({ w: ENERGY.start + ENERGY.perTurn, b: ENERGY.start });
    const s = play(g, mv('e2', 'e4'));
    expect(s.energy.b).toBe(ENERGY.start + ENERGY.perTurn);
    expect(s.energy.w).toBe(ENERGY.start + ENERGY.perTurn);
    const capped = createGame(undefined, { startEnergy: 200 });
    expect(capped.energy.w).toBe(ENERGY.max);
  });

  it('bônus de captura uma vez, regras iguais para ambos', () => {
    const s = play(createGame(), mv('e2', 'e4'), mv('d7', 'd5'));
    const w0 = s.energy.w;
    const r = applyAction(s, mv('e4', 'd5'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.energy.w).toBe(w0 + ENERGY.captureBonus);
    const b0 = r.state.energy.b;
    const r2 = applyAction(r.state, mv('d8', 'd5'));
    expect(r2.ok && r2.state.energy.b).toBe(b0 + ENERGY.captureBonus);
  });
});

describe('poderes', () => {
  it('Impulso: avanço de 2 casas fora da fileira inicial, sem en passant', () => {
    let s = play(createGame(undefined, { startEnergy: 100 }), mv('e2', 'e3'), mv('a7', 'a6'));
    expect(powerTargets(s, 'surge', 'e3')).toEqual(['e5']);
    const r = applyAction(s, { kind: 'power', power: 'surge', from: 'e3', to: 'e5' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.fen.split(' ')[3]).toBe('-');
    expect(s.energy.w).toBe(100 + 10 + 10 - POWERS.surge.cost);
    expect(sideToMove(s)).toBe('b');
    // Na fileira inicial não há impulso.
    expect(powerTargets(s, 'surge', 'd7')).toEqual([]);
  });

  it('Impulso não pode chegar à última fileira nem atravessar peças', () => {
    const g = createGame('4k3/8/P7/8/8/8/8/4K3 w - - 0 1', { startEnergy: 100 });
    expect(powerTargets(g, 'surge', 'a6')).toEqual([]);
  });

  it('Passo Arcano: destinos vazios dentro do alcance, sem captura, e cobra energia só se válido', () => {
    const g = createGame('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1', { startEnergy: 100 });
    const t = powerTargets(g, 'arcaneStep', 'd4');
    expect(t).toContain('b7'); // a 3 casas, fora das linhas da dama
    expect(t).not.toContain('d5'); // lance normal
    const bad = applyAction(g, { kind: 'power', power: 'arcaneStep', from: 'd4', to: 'h8' });
    expect(bad.ok).toBe(false);
    expect(g.energy.w).toBe(110);
  });

  it('poder de movimento não pode deixar o rei em xeque', () => {
    // Dama cravada pela torre preta.
    const g = createGame('4r1k1/8/8/8/8/8/4Q3/4K3 w - - 0 1', { startEnergy: 100 });
    for (const to of powerTargets(g, 'arcaneStep', 'e2')) expect(to[0]).toBe('e');
    const r = applyAction(g, { kind: 'power', power: 'arcaneStep', from: 'e2', to: 'b3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['kingInDanger', 'invalidTarget']).toContain(r.error);
  });

  it('em xeque, poder de movimento só se resolver o xeque', () => {
    const g = createGame('4k3/8/8/8/8/8/1N6/r3K3 w - - 0 1', { startEnergy: 100 });
    const moves = allPowerMoves(g);
    expect(moves.every((m) => m.to && ['b1', 'c1', 'd1'].includes(m.to))).toBe(true);
  });

  it('energia insuficiente impede ativação', () => {
    const g = createGame(undefined, { startEnergy: 0 });
    const r = applyAction(g, { kind: 'power', power: 'phantomLeap', from: 'g1', to: 'e2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('insufficientEnergy');
  });

  it('Salto Fantasma difere do salto normal e não captura', () => {
    const g = createGame('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', { startEnergy: 100 });
    const t = powerTargets(g, 'phantomLeap', 'd4');
    expect(t).not.toContain('e6');
    expect(t).toContain('d6');
    expect(t).toContain('d5');
  });

  it('Escudo Real: não passa o turno, bloqueia poderes inimigos perto do rei e expira', () => {
    let s = createGame('4k3/8/8/8/8/8/8/Q3K3 b - - 0 1', { startEnergy: 100 });
    const r = applyAction(s, { kind: 'power', power: 'royalShield', from: 'e8' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(sideToMove(s)).toBe('b');
    expect(applyAction(s, { kind: 'power', power: 'royalShield', from: 'e8' }).ok).toBe(false);
    s = play(s, mv('e8', 'd8'));
    // Dama branca não pode se teleportar para perto do rei protegido.
    const t = powerTargets(s, 'arcaneStep', 'a1');
    expect(t.every((sq) => Math.abs(sq.charCodeAt(0) - 'd'.charCodeAt(0)) > 2 || Number(sq[1]) < 6)).toBe(true);
    s = play(s, mv('a1', 'a2'));
    expect(s.zones.length).toBe(0);
  });

  it('Visão Mística revela apenas ameaças reais', () => {
    const g = createGame('4k3/8/8/3r4/8/8/3N4/4K3 w - - 0 1', { startEnergy: 100 });
    const r = applyAction(g, { kind: 'power', power: 'phantomLeap', from: 'd2', to: 'd3' });
    expect(r.ok).toBe(true);
    const g2 = createGame('4k3/8/8/3r4/8/2B5/3N4/4K3 w - - 0 1', { startEnergy: 100 });
    const v = applyAction(g2, { kind: 'power', power: 'mysticVision', from: 'c3' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const info = computeVision(v.state, 'w')!;
    expect(info.threatened.map((t) => t.square)).toEqual(['d2']);
  });

  it('um poder por tipo por turno e muralha limitada', () => {
    const g = createGame('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', { startEnergy: 190 });
    const a = applyAction(g, { kind: 'power', power: 'wall', from: 'a1' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = applyAction(a.state, { kind: 'power', power: 'wall', from: 'h1' });
    expect(b.ok).toBe(false);
  });

  it('disponibilidade informa custo e destinos', () => {
    const g = createGame(undefined, { startEnergy: 100 });
    const a = powerAvailability(g, 'g1')!;
    expect(a.power).toBe('phantomLeap');
    expect(a.cost).toBe(POWERS.phantomLeap.cost);
    expect(a.available).toBe(true);
    expect(a.targets.length).toBeGreaterThan(0);
  });
});
