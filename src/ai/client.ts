import type { Difficulty, GameState } from '../core/types';
import type { AiDecision } from './search';

/** Executa a IA em um Web Worker para não travar a interface; recorre à thread principal se necessário. */
export class AiClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (d: AiDecision) => void; reject: (e: Error) => void }>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; decision?: AiDecision; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.decision) p.resolve(e.data.decision);
        else p.reject(new Error(e.data.error ?? 'ai error'));
      };
      this.worker.onerror = () => {
        for (const p of this.pending.values()) p.reject(new Error('worker crashed'));
        this.pending.clear();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  async decide(state: GameState, difficulty: Difficulty): Promise<AiDecision> {
    if (!this.worker) {
      const { chooseAction } = await import('./search');
      await new Promise((r) => setTimeout(r, 30));
      return chooseAction(state, difficulty);
    }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, state, difficulty });
    });
  }

  /** Descarta respostas pendentes (ex.: ao sair da partida ou desfazer). */
  cancelAll() {
    for (const p of this.pending.values()) p.reject(new Error('cancelled'));
    this.pending.clear();
  }
}
