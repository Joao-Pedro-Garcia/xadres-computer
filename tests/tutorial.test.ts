import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/core/game';
import { LESSONS } from '../src/tutorial/lessons';
import { ptBR } from '../src/i18n/pt-BR';
import { en } from '../src/i18n/en';

describe('tutorial', () => {
  it('cobre os 10 tópicos', () => {
    expect(new Set(LESSONS.map((l) => l.topic))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it.each(LESSONS.filter((l) => l.kind === 'exercise').map((l) => [l.id, l] as const))('exercício %s tem solução válida que cumpre o objetivo', (_id, lesson) => {
    let s = createGame(lesson.fen, { startEnergy: lesson.energy ?? 0 });
    let done = false;
    for (const a of lesson.solution!) {
      const r = applyAction(s, a);
      expect(r.ok, JSON.stringify(a)).toBe(true);
      if (!r.ok) return;
      done = lesson.goal!({ before: s, after: r.state, action: a, events: r.events });
      s = r.state;
    }
    expect(done).toBe(true);
  });

  it('um lance qualquer não cumpre o objetivo', () => {
    const lesson = LESSONS.find((l) => l.id === 'capture')!;
    const s = createGame(lesson.fen);
    const r = applyAction(s, { kind: 'move', from: 'e1', to: 'f1' });
    expect(r.ok && lesson.goal!({ before: s, after: r.state, action: { kind: 'move', from: 'e1', to: 'f1' }, events: r.events })).toBe(false);
  });

  it('todas as lições têm texto em português e inglês', () => {
    for (const l of LESSONS) {
      for (const d of [ptBR, en]) {
        const t = (d.tutorial.lessons as Record<string, { title: string; body: string }>)[l.id];
        expect(t?.title, `${l.id}`).toBeTruthy();
        expect(t?.body).toBeTruthy();
      }
    }
  });
});
