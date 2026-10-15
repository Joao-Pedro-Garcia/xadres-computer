import { describe, expect, it } from 'vitest';
import { applyAction, createGame, powerTargets, sideToMove } from '../src/core/game';
import { POWERS } from '../src/core/balance';
import { POWER_MODULES } from '../src/core/powers';
import { chooseAction } from '../src/ai/search';
import { validateSaved } from '../src/meta/session';
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
const mv = (from: string, to: string): Action => ({ kind: 'move', from, to }) as Action;

describe('módulos de poderes', () => {
  it('cada poder tem módulo com o custo da tabela', () => {
    for (const [id, mod] of Object.entries(POWER_MODULES)) {
      expect(mod.id).toBe(id);
      expect(mod.spec).toBe(POWERS[mod.id]);
    }
    expect([POWERS.royalShield.cost, POWERS.arcaneStep.cost, POWERS.wall.cost, POWERS.mysticVision.cost, POWERS.phantomLeap.cost, POWERS.surge.cost]).toEqual([40, 80, 60, 40, 60, 40]);
  });
});

describe('duração dos efeitos', () => {
  it('Muralha dura 2 turnos adversários e expira sozinha', () => {
    let s = createGame('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { startEnergy: 100 });
    s = play(s, { kind: 'power', power: 'wall', from: 'a1' }, mv('e1', 'f1'));
    expect(s.zones).toHaveLength(1);
    s = play(s, mv('e8', 'd8'), mv('f1', 'e1'));
    expect(s.zones).toHaveLength(1);
    s = play(s, mv('d8', 'e8'));
    expect(s.zones).toHaveLength(0);
  });

  it('Visão Mística vale para este turno e o próximo turno próprio', () => {
    let s = createGame('4k3/p7/8/8/8/8/P7/2B1K3 w - - 0 1', { startEnergy: 100 });
    s = play(s, { kind: 'power', power: 'mysticVision', from: 'c1' }, mv('e1', 'f1'), mv('e8', 'd8'));
    expect(s.vision).toHaveLength(1);
    s = play(s, mv('f1', 'e1'));
    expect(s.vision).toHaveLength(0);
  });

  it('Muralha bloqueia destino de poder inimigo dentro da zona', () => {
    let s = createGame('4k3/8/8/3q4/8/8/8/R3K3 w - - 0 1', { startEnergy: 150 });
    s = play(s, { kind: 'power', power: 'wall', from: 'a1' }, mv('e1', 'f1'));
    const targets = powerTargets(s, 'arcaneStep', 'd5');
    expect(targets.some((t) => ['a2', 'b2', 'b1'].includes(t))).toBe(false);
    const r = applyAction(s, { kind: 'power', power: 'arcaneStep', from: 'd5', to: 'b2' });
    expect(r.ok).toBe(false);
  });
});

describe('xeque-mate e poderes', () => {
  it('mate dado por um poder de movimento é detectado', () => {
    // Mate sufocado: o cavalo vai de f5 para f7 (2 casas em linha reta, não é salto normal).
    const g = createGame('6rk/6pp/8/5N2/8/8/8/6K1 w - - 0 1', { startEnergy: 100 });
    const t = powerTargets(g, 'phantomLeap', 'f5');
    expect(t).toContain('f7');
    const r = applyAction(g, { kind: 'power', power: 'phantomLeap', from: 'f5', to: 'f7' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.result).toEqual({ winner: 'w', reason: 'checkmate' });
  });

  it('poder não salva de xeque-mate tradicional', () => {
    const g = createGame('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', { startEnergy: 200 });
    // Posição já é mate (mate do louco): ações do perdedor são recusadas.
    expect(g.result).toBeNull(); // createGame não avalia a posição inicial
    expect(applyAction(g, { kind: 'power', power: 'surge', from: 'a2', to: 'a4' }).ok).toBe(false);
  });
});

describe('energia sem cobrança dupla', () => {
  it('custo descontado exatamente uma vez; falhas não cobram', () => {
    const g = createGame('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1', { startEnergy: 100 });
    const e0 = g.energy.w;
    const bad = applyAction(g, { kind: 'power', power: 'arcaneStep', from: 'd4', to: 'd5' });
    expect(bad.ok).toBe(false);
    expect(g.energy.w).toBe(e0);
    const ok = applyAction(g, { kind: 'power', power: 'arcaneStep', from: 'd4', to: 'b7' });
    expect(ok.ok && ok.state.energy.w).toBe(e0 - 80);
    if (ok.ok) {
      expect(ok.state.powerLog).toHaveLength(1);
      expect(ok.events.filter((e) => e.type === 'energy' && e.reason === 'power')).toHaveLength(1);
      // Repetir a mesma ação no estado novo não é possível (não é mais a vez das brancas).
      expect(applyAction(ok.state, { kind: 'power', power: 'arcaneStep', from: 'b7', to: 'd5' }).ok).toBe(false);
    }
  });
});

describe('persistência da partida', () => {
  it('salvar e carregar restaura energia, turno e efeitos ativos', () => {
    let s = createGame('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { startEnergy: 120 });
    s = play(s, { kind: 'power', power: 'wall', from: 'a1' }, { kind: 'power', power: 'royalShield', from: 'e1' }, mv('e1', 'f1'));
    const saved = { version: 1, state: s, difficulty: 'medium', playerColor: 'w', undoUsed: 0, startedAt: 0, undoStack: [] };
    const loaded = validateSaved(JSON.parse(JSON.stringify(saved)))!;
    expect(loaded).not.toBeNull();
    expect(loaded.state).toEqual(s);
    expect(sideToMove(loaded.state)).toBe('b');
    expect(loaded.state.zones.map((z) => z.kind).sort()).toEqual(['shield', 'wall']);
    // O jogo continua normalmente a partir do estado carregado.
    const next = play(loaded.state, mv('e8', 'd8'));
    expect(next.energy.w).toBe(s.energy.w + 10);
  });
});

describe('IA e poderes', () => {
  it('IA nunca propõe destino bloqueado por zona', () => {
    let s = createGame('4k3/8/8/3q4/8/8/8/R3K3 w - - 0 1', { startEnergy: 150 });
    s = play(s, { kind: 'power', power: 'wall', from: 'a1' }, mv('e1', 'f1'));
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const dec = chooseAction(s, d);
      let x = s;
      for (const a of dec.actions) {
        const r = applyAction(x, a);
        expect(r.ok).toBe(true);
        if (r.ok) x = r.state;
      }
    }
  });
});
