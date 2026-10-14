import { ENERGY, POWERS } from '../core/balance';
import {
  applyAction,
  chessOf,
  computeVision,
  legalMovesFrom,
  powerAvailability,
  resign,
  sideToMove,
  zoneSquares,
  type PowerAvailability,
} from '../core/game';
import { opposite } from '../core/squares';
import type { Action, Color, GameEvent, GameState, Square } from '../core/types';
import { t } from '../i18n';
import { MAX_UNDO, type SavedGame } from '../meta/session';
import type { Settings } from '../meta/settings';
import type { AiClient } from '../ai/client';
import type { BoardView, EffectsView } from '../render/scene';
import type { Audio } from './audio';
import { GLYPH, clear, h } from './dom';

export interface MatchHost {
  view: BoardView;
  ai: AiClient;
  audio: Audio;
  settings: () => Settings;
  save: (g: SavedGame | null) => void;
  toast: (msg: string, kind?: 'info' | 'error' | 'success') => void;
  confirm: (msg: string) => Promise<boolean>;
  onFinished: (g: SavedGame) => void;
  onExit: () => void;
}

interface Selection {
  square: Square;
  moves: { to: Square; promotion: boolean; capture: boolean }[];
  power: PowerAvailability | null;
  targeting: boolean;
}

/** Controla uma partida: entrada do jogador, fluxo transacional, IA, animações e HUD. */
export class Match {
  private sel: Selection | null = null;
  private busy = false;
  private aiThinking = false;
  private disposed = false;
  private turnStart: GameState;
  private root: HTMLElement;
  private els!: {
    top: HTMLElement;
    status: HTMLElement;
    powerPanel: HTMLElement;
    moves: HTMLElement;
    effects: HTMLElement;
    skip: HTMLButtonElement;
    undo: HTMLButtonElement;
    sidebar: HTMLElement;
  };

  constructor(
    private host: MatchHost,
    private g: SavedGame,
    container: HTMLElement,
  ) {
    this.turnStart = g.state;
    this.root = h('div', { class: 'hud' });
    container.append(this.root);
    this.buildHud();
    const v = host.view;
    v.setMode('game');
    v.setOrientation(this.viewColor());
    v.resetCamera(true);
    v.syncPieces(g.state.fen, true);
    v.onSquareTap = (sq) => this.onTap(sq);
    this.refresh();
    if (sideToMove(g.state) !== g.playerColor && !g.state.result) void this.runAi();
  }

  private get state() {
    return this.g.state;
  }

  private viewColor(): Color {
    const s = this.host.settings();
    return s.flipView ? opposite(this.g.playerColor) : this.g.playerColor;
  }

  dispose() {
    this.disposed = true;
    this.host.ai.cancelAll();
    this.host.view.onSquareTap = () => {};
    this.host.view.skipAnimations();
    this.root.remove();
    window.removeEventListener('keydown', this.onKey);
  }

  /* ------------------------------- HUD ------------------------------- */

  private buildHud() {
    const s = this.host.settings();
    const top = h('div', { class: 'hud-top' });
    const status = h('div', { class: 'hud-status', role: 'status', 'aria-live': 'polite' });
    const powerPanel = h('div', { class: 'panel power-panel' });
    const moves = h('ol', { class: 'move-list' });
    const effects = h('div', { class: 'effects-list' });
    const skip = h('button', { class: 'btn ghost skip-btn hidden', onclick: () => this.host.view.skipAnimations() }, t('game.skip')) as HTMLButtonElement;
    const undo = h('button', { class: 'btn ghost', onclick: () => void this.undo(), title: t('game.undo') }, '↶ ', t('game.undo')) as HTMLButtonElement;
    if (!s.allowUndo) undo.classList.add('hidden');
    const sidebar = h(
      'aside',
      { class: 'panel sidebar collapsed' },
      h('button', { class: 'sidebar-toggle', onclick: () => sidebar.classList.toggle('collapsed'), 'aria-label': t('game.moves') }, '☰ ', t('game.moves')),
      h('div', { class: 'sidebar-body' }, effects, moves),
    );
    const actions = h(
      'div',
      { class: 'hud-actions' },
      h('button', { class: 'btn ghost', onclick: () => void this.leave() }, '☰ ', t('game.menu')),
      undo,
      h('button', { class: 'btn ghost', onclick: () => this.host.view.resetCamera() }, '⟲ ', t('game.resetCamera')),
      h('button', { class: 'btn ghost', onclick: () => this.flip() }, '⇅ ', t('game.flip')),
      h('button', { class: 'btn ghost danger', onclick: () => void this.resign() }, '⚑ ', t('game.resign')),
    );
    this.root.append(top, status, actions, sidebar, powerPanel, skip);
    this.els = { top, status, powerPanel, moves, effects, skip, undo, sidebar };
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.host.view.animating) this.host.view.skipAnimations();
      else this.deselect();
    }
  };

  private playerPanel(color: Color) {
    const me = color === this.g.playerColor;
    const e = this.state.energy[color];
    const captured = this.state.captured[color];
    const active = sideToMove(this.state) === color && !this.state.result;
    return h(
      'div',
      { class: `player-card ${active ? 'active' : ''} ${color === 'w' ? 'white' : 'black'}` },
      h('div', { class: 'player-name' }, h('span', { class: 'side-dot' }), me ? t('game.you') : t('game.ai', { difficulty: t(`difficulty.${this.g.difficulty}`) })),
      h(
        'div',
        { class: 'energy', title: `${t('common.energy')}: ${e}/${ENERGY.max}` },
        h('div', { class: 'energy-bar' }, h('div', { class: 'energy-fill', style: `width:${(e / ENERGY.max) * 100}%` })),
        h('span', { class: 'energy-value' }, `⚡ ${e}`),
      ),
      h('div', { class: 'captured', 'aria-label': t('game.captured') }, captured.map((p) => GLYPH[p]).join('')),
    );
  }

  private refresh() {
    if (this.disposed) return;
    const st = this.state;
    clear(this.els.top);
    const opp = opposite(this.g.playerColor);
    this.els.top.append(this.playerPanel(this.g.playerColor), this.playerPanel(opp));

    // Status.
    const chess = chessOf(st);
    const myTurn = sideToMove(st) === this.g.playerColor;
    let status = '';
    if (st.result) status = '';
    else if (this.aiThinking) status = t('game.aiTurn');
    else if (myTurn) status = chess.inCheck() ? `${t('game.check')} · ${t('game.yourTurn')}` : t('game.yourTurn');
    else if (chess.inCheck()) status = t('game.check');
    clear(this.els.status);
    if (status) this.els.status.append(this.aiThinking ? h('span', { class: 'spinner' }) : '', status);
    this.els.status.classList.toggle('check', chess.inCheck() && !st.result);

    // Lances.
    clear(this.els.moves);
    for (let i = 0; i < st.history.length; i += 2) {
      const a = st.history[i];
      const b = st.history[i + 1];
      this.els.moves.append(
        h('li', {}, h('span', { class: `mv ${a.power ? 'power' : ''}` }, a.notation), b ? h('span', { class: `mv ${b.power ? 'power' : ''}` }, b.notation) : ''),
      );
    }
    this.els.moves.scrollTop = this.els.moves.scrollHeight;

    // Efeitos ativos.
    clear(this.els.effects);
    if (st.zones.length || st.vision.length) {
      const items = [
        ...st.zones.map((z) => `${z.owner === this.g.playerColor ? '◆' : '◇'} ${t(`powers.${z.kind === 'shield' ? 'royalShield' : 'wall'}.name`)} (${Math.max(0, z.expiresAtPly - st.ply)})`),
        ...st.vision.filter((v) => v.owner === this.g.playerColor).map((v) => `◆ ${t('powers.mysticVision.name')} (${Math.max(0, v.expiresAtPly - st.ply)})`),
      ];
      this.els.effects.append(h('div', { class: 'effects-title' }, t('game.zonesActive')), ...items.map((x) => h('div', { class: 'effect-item' }, x)));
    }

    this.els.undo.disabled = !this.g.undoStack.length && this.turnStart === st;
    this.renderPowerPanel();
    this.updateBoardOverlays();
  }

  private updateBoardOverlays() {
    const st = this.state;
    const chess = chessOf(st);
    const king = chess.inCheck() ? chess.findPiece({ type: 'k', color: chess.turn() })[0] : null;
    const sel = this.sel;
    this.host.view.setHighlights({
      lastMove: st.lastMove,
      check: king ?? null,
      selected: sel?.square ?? null,
      moves: sel && !sel.targeting ? sel.moves.filter((m) => !m.capture).map((m) => m.to) : [],
      captures: sel && !sel.targeting ? sel.moves.filter((m) => m.capture).map((m) => m.to) : [],
      powerTargets: sel?.targeting ? sel.power?.targets ?? [] : [],
    });
    const me = this.g.playerColor;
    const vision = computeVision(st, me);
    const effects: EffectsView = {
      viewer: me,
      zones: st.zones.map((z) => ({ owner: z.owner, kind: z.kind, squares: zoneSquares(st, z, chess) })),
      vision: vision
        ? {
            threatened: vision.threatened.map((x) => x.square),
            attackers: [...new Set(vision.threatened.flatMap((x) => x.attackers))],
            danger: vision.dangerSquares,
            safe: vision.safeSquares,
          }
        : null,
    };
    this.host.view.setEffects(effects);
  }

  private renderPowerPanel() {
    const panel = this.els.powerPanel;
    clear(panel);
    const sel = this.sel;
    const st = this.state;
    if (st.result || !sel || !sel.power) {
      panel.classList.add('empty');
      panel.append(h('div', { class: 'muted' }, t('game.noPowers')));
      return;
    }
    panel.classList.remove('empty');
    const a = sel.power;
    const spec = POWERS[a.power];
    const piece = chessOf(st).get(sel.square)!;
    const energy = st.energy[this.g.playerColor];
    const canAct = !this.busy && sideToMove(st) === this.g.playerColor;
    const btn = h(
      'button',
      {
        class: `btn primary ${sel.targeting ? 'active' : ''}`,
        disabled: !a.available || !canAct,
        onclick: () => (sel.targeting ? this.cancelTargeting() : this.activatePower()),
      },
      sel.targeting ? t('common.cancel') : `${t('powers.activate')} · ⚡${a.cost}`,
    );
    panel.append(
      h(
        'div',
        { class: 'power-head' },
        h('span', { class: 'power-glyph' }, GLYPH[piece.type]),
        h('div', {}, h('div', { class: 'power-name' }, t(`powers.${a.power}.name`)), h('div', { class: 'power-kind' }, spec.endsTurn ? t('powers.movement') : t('powers.support'))),
        h('div', { class: `power-cost ${energy < a.cost ? 'short' : ''}` }, `⚡ ${a.cost}`),
      ),
      h('p', { class: 'power-desc' }, t(`powers.${a.power}.desc`, { range: spec.range })),
      !a.available && a.reason ? h('div', { class: 'power-reason' }, t(`errors.${a.reason}`)) : '',
      sel.targeting ? h('div', { class: 'power-hint' }, t('powers.chooseTarget')) : '',
      btn,
    );
  }

  /* ------------------------------- Entrada ------------------------------- */

  private canInput() {
    return !this.busy && !this.aiThinking && !this.state.result && sideToMove(this.state) === this.g.playerColor;
  }

  private onTap(sq: Square | null) {
    if (!this.canInput()) return;
    const st = this.state;
    const sel = this.sel;
    if (!sq) return this.deselect();
    if (sel?.targeting) {
      if (sel.power?.targets.includes(sq)) {
        void this.perform({ kind: 'power', power: sel.power.power, from: sel.square, to: sq });
        return;
      }
      this.cancelTargeting();
      return;
    }
    const chess = chessOf(st);
    const piece = chess.get(sq);
    if (sel) {
      const mv = sel.moves.find((m) => m.to === sq);
      if (mv) {
        if (mv.promotion) void this.promote(sel.square, sq);
        else void this.perform({ kind: 'move', from: sel.square, to: sq });
        return;
      }
    }
    if (piece && piece.color === this.g.playerColor) {
      if (sel?.square === sq) return this.deselect();
      this.host.audio.play('select');
      this.sel = { square: sq, moves: legalMovesFrom(st, sq, chess), power: powerAvailability(st, sq, chess), targeting: false };
      this.refresh();
      return;
    }
    this.deselect();
  }

  private deselect() {
    if (!this.sel) return;
    this.sel = null;
    this.refresh();
  }

  private cancelTargeting() {
    if (this.sel) this.sel.targeting = false;
    this.refresh();
  }

  private activatePower() {
    const sel = this.sel;
    if (!sel?.power || !sel.power.available || !this.canInput()) return;
    if (POWERS[sel.power.power].endsTurn) {
      sel.targeting = true;
      this.refresh();
      return;
    }
    void this.perform({ kind: 'power', power: sel.power.power, from: sel.square });
  }

  private promote(from: Square, to: Square): Promise<void> {
    return new Promise((resolve) => {
      const overlay = h('div', { class: 'modal-backdrop' });
      const choose = (p: 'q' | 'r' | 'b' | 'n') => {
        overlay.remove();
        void this.perform({ kind: 'move', from, to, promotion: p }).then(resolve);
      };
      overlay.append(
        h(
          'div',
          { class: 'modal promo' },
          h('h3', {}, t('game.promotion')),
          h(
            'div',
            { class: 'promo-row' },
            (['q', 'r', 'b', 'n'] as const).map((p) => h('button', { class: 'btn promo-btn', onclick: () => choose(p), 'aria-label': t(`pieces.${p}`) }, h('span', { class: 'glyph' }, GLYPH[p]), t(`pieces.${p}`))),
          ),
          h('button', { class: 'btn ghost', onclick: () => (overlay.remove(), resolve()) }, t('common.cancel')),
        ),
      );
      this.root.append(overlay);
    });
  }

  /* ------------------------------- Fluxo ------------------------------- */

  /** Aplica uma ação do jogador de forma transacional; nada muda se a validação falhar. */
  private async perform(action: Action) {
    if (!this.canInput()) return;
    const before = this.state;
    const r = applyAction(before, action);
    if (!r.ok) {
      this.host.audio.play('error');
      this.host.toast(t(`errors.${r.error}`), 'error');
      return;
    }
    this.sel = null;
    const endsTurn = action.kind === 'move' || POWERS[action.power].endsTurn;
    if (endsTurn) {
      this.g.undoStack = [...this.g.undoStack, this.turnStart].slice(-MAX_UNDO);
    }
    this.g.state = r.state;
    this.host.save(this.g);
    await this.present(r.events, r.state.fen);
    if (this.disposed) return;
    if (endsTurn) this.afterTurn();
    else this.refresh();
  }

  private async present(events: GameEvent[], fen: string) {
    this.busy = true;
    this.refresh();
    this.sounds(events);
    this.els.skip.classList.remove('hidden');
    try {
      await this.host.view.animate(events, fen);
    } finally {
      this.els.skip.classList.add('hidden');
      this.busy = false;
    }
  }

  private sounds(events: GameEvent[]) {
    const a = this.host.audio;
    if (events.some((e) => e.type === 'powerMove' || e.type === 'powerUtility')) a.play('power');
    else if (events.some((e) => e.type === 'move' && e.captured)) a.play('capture');
    else if (events.some((e) => e.type === 'move')) a.play('move');
    if (events.some((e) => e.type === 'check')) setTimeout(() => a.play('check'), 250);
  }

  private afterTurn() {
    if (this.state.result) {
      this.refresh();
      this.host.save(null);
      this.host.onFinished(this.g);
      return;
    }
    if (sideToMove(this.state) === this.g.playerColor) {
      this.turnStart = this.state;
      this.refresh();
    } else {
      void this.runAi();
    }
  }

  private async runAi() {
    if (this.disposed || this.state.result) return;
    this.aiThinking = true;
    this.refresh();
    const requested = this.state;
    let decision;
    try {
      const [d] = await Promise.all([this.host.ai.decide(requested, this.g.difficulty), new Promise((r) => setTimeout(r, 350))]);
      decision = d as Awaited<ReturnType<AiClient['decide']>>;
    } catch (e) {
      if (this.disposed || String(e).includes('cancelled')) return;
      this.aiThinking = false;
      this.host.toast(t('errors.aiFailed'), 'error');
      this.refresh();
      return;
    }
    // A partida pode ter mudado (desfazer, sair) enquanto a IA pensava.
    if (this.disposed || this.state !== requested) return;
    this.aiThinking = false;
    for (const action of decision.actions) {
      const r = applyAction(this.state, action);
      if (!r.ok) {
        console.warn('IA propôs ação inválida', action, r.error);
        continue;
      }
      this.g.state = r.state;
      this.host.save(this.g);
      await this.present(r.events, r.state.fen);
      if (this.disposed) return;
    }
    if (sideToMove(this.state) !== this.g.playerColor && !this.state.result) {
      // Segurança: se nenhuma jogada válida foi aplicada, joga o primeiro lance legal.
      const m = chessOf(this.state).moves({ verbose: true })[0];
      if (m) {
        const r = applyAction(this.state, { kind: 'move', from: m.from, to: m.to, promotion: 'q' });
        if (r.ok) {
          this.g.state = r.state;
          await this.present(r.events, r.state.fen);
        }
      }
    }
    this.afterTurn();
  }

  private async undo() {
    if (!this.host.settings().allowUndo || this.busy || this.state.result) return;
    let target: GameState | undefined;
    if (this.turnStart !== this.state && sideToMove(this.state) === this.g.playerColor) {
      // Desfaz poderes de suporte usados neste turno.
      target = this.turnStart;
    } else {
      target = this.g.undoStack.pop();
    }
    if (!target) return;
    this.host.ai.cancelAll();
    this.aiThinking = false;
    this.g.undoUsed++;
    this.g.state = target;
    this.turnStart = target;
    this.sel = null;
    this.host.view.syncPieces(target.fen);
    this.host.save(this.g);
    this.refresh();
    if (sideToMove(target) !== this.g.playerColor) void this.runAi();
  }

  private flip() {
    const s = this.host.settings();
    s.flipView = !s.flipView;
    this.host.view.setOrientation(this.viewColor());
    this.host.view.resetCamera();
  }

  private async resign() {
    if (this.state.result) return;
    if (!(await this.host.confirm(t('game.resignConfirm')))) return;
    this.host.ai.cancelAll();
    this.aiThinking = false;
    this.g.state = resign(this.state, this.g.playerColor);
    this.host.save(null);
    this.refresh();
    this.host.onFinished(this.g);
  }

  private async leave() {
    if (this.state.result) return this.host.onExit();
    if (!(await this.host.confirm(t('game.leaveConfirm')))) return;
    this.host.save(this.g);
    this.host.onExit();
  }
}

