import type { Action, GameEvent, GameState } from '../core/types';

/**
 * Lições do tutorial. Exercícios usam o motor real (`applyAction`): o jogador
 * executa lances de verdade no tabuleiro 3D, e `goal` verifica se o objetivo foi
 * cumprido. Textos ficam no i18n em `tutorial.lessons.<id>`.
 */
export interface Lesson {
  id: string;
  /** Tópico do currículo (1 a 10). */
  topic: number;
  kind: 'info' | 'exercise' | 'menus';
  fen?: string;
  energy?: number;
  /** Objetivo cumprido após uma ação válida do jogador? */
  goal?: (ctx: { before: GameState; after: GameState; action: Action; events: GameEvent[] }) => boolean;
  /** Sequência que resolve o exercício (usada nos testes automatizados). */
  solution?: Action[];
}

const mv = (from: string, to: string): Action => ({ kind: 'move', from, to }) as Action;

export const LESSONS: Lesson[] = [
  { id: 'welcome', topic: 1, kind: 'info' },
  {
    id: 'move',
    topic: 1,
    kind: 'exercise',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    goal: ({ action }) => action.kind === 'move' && action.from === 'e2' && action.to === 'e4',
    solution: [mv('e2', 'e4')],
  },
  {
    id: 'capture',
    topic: 2,
    kind: 'exercise',
    fen: '4k3/8/8/3b4/8/4N3/8/4K3 w - - 0 1',
    goal: ({ events }) => events.some((e) => e.type === 'move' && e.piece === 'n' && !!e.captured),
    solution: [mv('e3', 'd5')],
  },
  {
    id: 'castle',
    topic: 2,
    kind: 'exercise',
    fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    goal: ({ events }) => events.some((e) => e.type === 'move' && !!e.rook),
    solution: [mv('e1', 'g1')],
  },
  {
    id: 'mate',
    topic: 3,
    kind: 'exercise',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    goal: ({ after }) => after.result?.reason === 'checkmate',
    solution: [mv('a1', 'a8')],
  },
  {
    id: 'energy',
    topic: 4,
    kind: 'exercise',
    fen: '4k3/8/8/4p3/3P4/8/8/4K3 w - - 0 1',
    energy: 30,
    goal: ({ events }) => events.some((e) => e.type === 'energy' && e.reason === 'capture'),
    solution: [mv('d4', 'e5')],
  },
  {
    id: 'power',
    topic: 5,
    kind: 'exercise',
    fen: '4k3/8/8/8/8/3P4/8/4K3 w - - 0 1',
    energy: 60,
    goal: ({ action }) => action.kind === 'power' && action.power === 'surge',
    solution: [{ kind: 'power', power: 'surge', from: 'd3', to: 'd5' }],
  },
  {
    id: 'costs',
    topic: 6,
    kind: 'exercise',
    fen: '4k3/8/8/8/3Q4/8/3N4/4K3 w - - 0 1',
    energy: 70,
    goal: ({ action }) => action.kind === 'power' && action.power === 'phantomLeap',
    solution: [{ kind: 'power', power: 'phantomLeap', from: 'd2', to: 'b2' }],
  },
  {
    id: 'recovery',
    topic: 7,
    kind: 'exercise',
    fen: '4k3/pppp4/8/8/8/8/8/R3K3 w - - 0 1',
    energy: 60,
    goal: ({ after, action }) => action.kind === 'move' && after.powerLog.some((p) => p.power === 'royalShield' || p.power === 'wall'),
    solution: [{ kind: 'power', power: 'royalShield', from: 'e1' }, mv('a1', 'a7')],
  },
  {
    id: 'animations',
    topic: 8,
    kind: 'exercise',
    fen: '4k3/8/8/1r6/8/8/8/1Q2K3 w - - 0 1',
    goal: ({ events }) => events.some((e) => e.type === 'move' && e.piece === 'q' && e.captured === 'r'),
    solution: [mv('b1', 'b5')],
  },
  {
    id: 'win',
    topic: 9,
    kind: 'exercise',
    fen: '6rk/6pp/8/5N2/8/8/8/6K1 w - - 0 1',
    energy: 100,
    goal: ({ after }) => after.result?.reason === 'checkmate' && after.result.winner === 'w',
    solution: [{ kind: 'power', power: 'phantomLeap', from: 'f5', to: 'f7' }],
  },
  { id: 'menus', topic: 10, kind: 'menus' },
];
