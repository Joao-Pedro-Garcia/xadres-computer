/// <reference lib="webworker" />
import { chooseAction } from './search';
import type { Difficulty, GameState } from '../core/types';

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; difficulty: Difficulty }>) => {
  const { id, state, difficulty } = e.data;
  try {
    const decision = chooseAction(state, difficulty);
    (self as unknown as Worker).postMessage({ id, decision });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
