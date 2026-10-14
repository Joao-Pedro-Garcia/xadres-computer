import { createGame, START_FEN } from '../core/game';
import { t } from '../i18n';
import { LESSONS, type Lesson } from '../tutorial/lessons';
import { clear, h } from './dom';
import { Match, type MatchHost } from './match';

export interface TutorialHost {
  base: Omit<MatchHost, 'save' | 'onFinished' | 'onExit' | 'practice' | 'onPlayerAction'>;
  layer: HTMLElement;
  onExit: (open?: 'shop' | 'achievements' | 'history') => void;
}

/**
 * Tutorial interativo: alterna lições informativas e exercícios no tabuleiro 3D.
 * Os exercícios rodam o motor real em modo prática (sem IA, sem salvamento e sem recompensas).
 */
export class Tutorial {
  private index = 0;
  private match: Match | null = null;
  private card: HTMLElement;
  private completed = new Set<string>();
  private resetTimer = 0;

  constructor(private host: TutorialHost, start = 0) {
    this.card = h('section', { class: 'panel tutorial-card', 'aria-live': 'polite' });
    host.layer.append(this.card);
    this.go(start);
  }

  get lesson(): Lesson {
    return LESSONS[this.index];
  }

  dispose() {
    clearTimeout(this.resetTimer);
    this.host.base.view.setLeftInset(0);
    this.match?.dispose();
    this.match = null;
    this.card.remove();
  }

  /** Reaplica textos (troca de idioma) sem perder a lição atual. */
  relabel() {
    this.match?.relabel();
    this.render();
  }

  private go(i: number) {
    clearTimeout(this.resetTimer);
    this.index = Math.max(0, Math.min(LESSONS.length - 1, i));
    this.startLesson();
  }

  private startLesson() {
    this.match?.dispose();
    this.match = null;
    const l = this.lesson;
    const view = this.host.base.view;
    if (l.kind === 'exercise') {
      this.completed.delete(l.id);
      const state = createGame(l.fen, { startEnergy: l.energy ?? 0, id: `tutorial-${l.id}` });
      this.match = new Match(
        {
          ...this.host.base,
          practice: true,
          save: () => {},
          onFinished: () => {},
          onExit: () => this.exit(),
          onPlayerAction: (ctx) => this.check(ctx),
        },
        { version: 1, state, difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: Date.now(), undoStack: [] },
        this.host.layer,
      );
      // O cartão do tutorial fica acima do HUD, e o tabuleiro é recentrado ao lado dele.
      this.host.layer.append(this.card);
      view.setLeftInset(440);
    } else {
      view.setLeftInset(0);
      view.setMode('menu');
      view.syncPieces(START_FEN);
    }
    this.render();
  }

  private check(ctx: Parameters<NonNullable<MatchHost['onPlayerAction']>>[0]) {
    const l = this.lesson;
    if (!l.goal) return;
    if (l.goal(ctx)) {
      this.completed.add(l.id);
      this.match?.lock();
      this.host.base.audio.play('win');
      this.render();
    } else if (ctx.endsTurn) {
      this.host.base.toast(t('tutorial.tryAgain'), 'info');
      this.resetTimer = window.setTimeout(() => this.startLesson(), 900);
    }
  }

  private exit(open?: 'shop' | 'achievements' | 'history') {
    this.dispose();
    this.host.onExit(open);
  }

  private render() {
    const l = this.lesson;
    const i = this.index;
    const total = LESSONS.length;
    const text = (k: string) => t(`tutorial.lessons.${l.id}.${k}`);
    const done = this.completed.has(l.id);
    const last = i === total - 1;
    clear(this.card);
    this.card.className = `panel tutorial-card ${l.kind}`;
    this.card.append(
      h(
        'div',
        { class: 'tut-top' },
        h('span', { class: 'muted small' }, `${t('tutorial.lessonOf', { n: i + 1, total })} · ${t('tutorial.topic', { n: l.topic })}`),
        h('button', { class: 'btn ghost small', onclick: () => this.exit(), 'aria-label': t('tutorial.exit') }, '✕ ', t('tutorial.exit')),
      ),
      h('div', { class: 'dots', 'aria-hidden': 'true' }, LESSONS.map((x, k) => h('span', { class: `${k === i ? 'on' : ''} ${this.completed.has(x.id) ? 'ok' : ''}` }))),
      h('h3', {}, text('title')),
      h('p', { class: 'tut-body' }, text('body')),
      l.kind === 'exercise'
        ? h(
            'div',
            { class: `tut-task ${done ? 'done' : ''}` },
            h('strong', {}, done ? `✓ ${t('tutorial.success')}` : `▶ ${t('tutorial.exercise')}`),
            h('span', {}, done ? text('done') : text('hint')),
          )
        : '',
      l.kind === 'menus'
        ? h(
            'div',
            { class: 'tut-links' },
            h('button', { class: 'btn ghost small', onclick: () => this.exit('shop') }, t('tutorial.openShop')),
            h('button', { class: 'btn ghost small', onclick: () => this.exit('achievements') }, t('tutorial.openAchievements')),
            h('button', { class: 'btn ghost small', onclick: () => this.exit('history') }, t('tutorial.openHistory')),
          )
        : '',
      h(
        'div',
        { class: 'modal-actions tut-nav' },
        h('button', { class: 'btn ghost', disabled: i === 0, onclick: () => this.go(i - 1) }, '‹ ', t('tutorial.prev')),
        l.kind === 'exercise' ? h('button', { class: 'btn ghost', onclick: () => this.startLesson() }, '↺ ', t('tutorial.restart')) : '',
        last
          ? h('button', { class: 'btn primary', onclick: () => this.exit() }, t('tutorial.finish'))
          : h('button', { class: `btn ${l.kind !== 'exercise' || done ? 'primary' : 'ghost'}`, onclick: () => this.go(i + 1) }, t('tutorial.next'), ' ›'),
      ),
    );
  }
}
