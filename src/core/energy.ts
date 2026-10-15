import { ENERGY } from './balance';
import type { Color, GameEvent, GameState } from './types';

/**
 * Sistema de energia. Toda alteração de energia passa por aqui e acontece apenas
 * dentro de `applyAction` (de forma determinística, independente de animações).
 */
export function clampEnergy(v: number): number {
  return Math.max(0, Math.min(ENERGY.max, v));
}

/** +10 no início do turno do jogador (até o máximo). */
export function grantTurnEnergy(state: GameState, color: Color, events: GameEvent[]): void {
  const before = state.energy[color];
  state.energy[color] = clampEnergy(before + ENERGY.perTurn);
  if (state.energy[color] !== before) events.push({ type: 'energy', color, delta: state.energy[color] - before, reason: 'turn' });
}

/** +15 por captura, no máximo uma vez por turno. */
export function grantCaptureBonus(state: GameState, color: Color, events: GameEvent[]): void {
  if (state.turn.captureBonusGiven) return;
  const before = state.energy[color];
  state.energy[color] = clampEnergy(before + ENERGY.captureBonus);
  state.turn.captureBonusGiven = true;
  events.push({ type: 'energy', color, delta: state.energy[color] - before, reason: 'capture' });
}

export function canAfford(state: GameState, color: Color, cost: number): boolean {
  return state.energy[color] >= cost;
}

/** Desconta o custo de um poder já validado. Retorna a energia anterior. */
export function spendEnergy(state: GameState, color: Color, cost: number, events: GameEvent[]): number {
  const before = state.energy[color];
  if (before < cost) throw new Error('spendEnergy chamado sem energia suficiente');
  state.energy[color] = before - cost;
  events.push({ type: 'energy', color, delta: -cost, reason: 'power' });
  return before;
}
