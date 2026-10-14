import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/core/game';
import { chooseAction, selfPlay } from '../src/ai/search';
import type { Difficulty } from '../src/core/types';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('IA', () => {
  it.each<Difficulty>(['easy', 'medium', 'hard', 'master'])('gera somente ações legais (%s)', (d) => {
    const g = createGame(undefined, { startEnergy: 120 });
    const dec = chooseAction(g, d, seeded(7));
    let s = g;
    for (const a of dec.actions) {
      const r = applyAction(s, a);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(s.ply).toBe(1);
  });

  it('encontra mate em 1', () => {
    const g = createGame('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const dec = chooseAction(g, 'medium', seeded(1));
    const last = dec.actions[dec.actions.length - 1];
    expect(last).toMatchObject({ kind: 'move', from: 'a1', to: 'a8' });
  });

  it('captura peça solta', () => {
    const g = createGame('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
    const dec = chooseAction(g, 'hard', seeded(3));
    expect(dec.actions.at(-1)).toMatchObject({ from: 'd1', to: 'd5' });
  });

  it('partidas IA x IA terminam sem ações inválidas', () => {
    const s = selfPlay(createGame(), 'easy', 'medium', 60, seeded(11));
    expect(s.ply).toBeGreaterThan(0);
    // Energia sempre dentro dos limites.
    expect(s.energy.w).toBeGreaterThanOrEqual(0);
    expect(s.energy.w).toBeLessThanOrEqual(200);
  }, 60000);
});
