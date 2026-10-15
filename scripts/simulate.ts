// Simulação de partidas IA x IA para balanceamento: `npx vite-node scripts/simulate.ts` ou via vitest.
import { applyAction, createGame } from '../src/core/game';
import { chooseAction } from '../src/ai/search';
import type { Difficulty, GameState } from '../src/core/types';

export function simulate(games: number, white: Difficulty, black: Difficulty, maxPlies = 160) {
  const powerUse: Record<string, number> = {};
  const results: Record<string, number> = {};
  let nodes = 0;
  let time = 0;
  let decisions = 0;
  for (let i = 0; i < games; i++) {
    let s: GameState = createGame();
    while (!s.result && s.ply < maxPlies) {
      const side = s.fen.split(' ')[1];
      const t0 = Date.now();
      const d = chooseAction(s, side === 'w' ? white : black);
      time += Date.now() - t0;
      nodes += d.nodes;
      decisions++;
      for (const a of d.actions) {
        const r = applyAction(s, a);
        if (!r.ok) throw new Error('invalid');
        s = r.state;
      }
    }
    for (const p of s.powerLog) powerUse[p.power] = (powerUse[p.power] ?? 0) + 1;
    const key = s.result ? `${s.result.winner ?? 'draw'}:${s.result.reason}` : 'unfinished';
    results[key] = (results[key] ?? 0) + 1;
  }
  return { powerUse, results, avgMs: Math.round(time / decisions), nps: Math.round((nodes / Math.max(1, time)) * 1000) };
}
