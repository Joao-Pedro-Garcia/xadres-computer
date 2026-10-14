import { Chess } from 'chess.js';
import { getLang, t } from '../../i18n';
import { filterHistory, formatDuration, type HistoryEntry, type HistoryFilter } from '../../meta/session';
import type { Profile } from '../../meta/profile';
import { GLYPH, h } from '../dom';

export interface HistoryScreenCtx {
  header: HTMLElement;
  history: HistoryEntry[];
  profile: Profile;
  filter: HistoryFilter;
  onFilter: (f: HistoryFilter) => void;
  onClear: () => void;
  host: HTMLElement;
}

const OUTCOME_ICON = { win: '✓', loss: '✗', draw: '=' } as const;

/** Tela de histórico: estatísticas, filtros, lista e detalhes de cada partida. */
export function historyScreen(ctx: HistoryScreenCtx): HTMLElement {
  const st = ctx.profile.stats;
  const f = ctx.filter;
  const list = filterHistory(ctx.history, f);
  const seg = <K extends keyof HistoryFilter>(key: K, options: [HistoryFilter[K], string][]) =>
    h(
      'div',
      { class: 'seg', role: 'group' },
      options.map(([v, label]) =>
        h('button', { class: `seg-btn ${f[key] === v ? 'selected' : ''}`, 'aria-pressed': String(f[key] === v), onclick: () => ctx.onFilter({ ...f, [key]: v }) }, label),
      ),
    );

  const items = h('div', { class: 'history-list' });
  if (!ctx.history.length) items.append(h('p', { class: 'muted' }, t('history.empty')));
  else if (!list.length) items.append(h('p', { class: 'muted' }, t('history.noMatch')));
  for (const e of list) {
    items.append(
      h(
        'button',
        { class: `hist ${e.outcome}`, onclick: () => ctx.host.append(historyDetail(e)), 'aria-label': `${t(`result.${e.outcome}`)} — ${t('history.details')}` },
        h('span', { class: 'hist-icon', 'aria-hidden': 'true' }, OUTCOME_ICON[e.outcome]),
        h(
          'span',
          { class: 'hist-main' },
          h('strong', {}, `${t(`result.${e.outcome}`)} · ${t(`result.${e.reason}`)}`),
          h(
            'span',
            { class: 'hist-meta' },
            `${t(`difficulty.${e.difficulty}`)} · ${t(`difficulty.${e.playerColor === 'w' ? 'white' : 'black'}`)} · ${t('history.movesCount', { n: Math.ceil(e.plies / 2) })}` +
              (e.durationMs !== undefined ? ` · ${formatDuration(e.durationMs)}` : ''),
          ),
          h('span', { class: 'muted small' }, new Date(e.date).toLocaleString(getLang())),
        ),
        h('span', { class: 'hist-reward gold' }, `+${e.xp} XP`, h('br'), `◈ ${e.coins}`),
      ),
    );
  }

  const winRate = st.games ? Math.round((st.wins / st.games) * 100) : 0;
  return h(
    'div',
    {},
    ctx.header,
    h(
      'div',
      { class: 'panel content' },
      h(
        'div',
        { class: 'stat-row' },
        stat(t('history.statGames'), st.games),
        stat(t('history.statWins'), st.wins),
        stat(t('history.statLosses'), st.losses),
        stat(t('history.statDraws'), st.draws),
        stat(t('history.statWinRate'), `${winRate}%`),
        stat(t('history.statBestStreak'), st.bestStreak ?? 0),
      ),
      h('h3', {}, t('history.levels')),
      h('div', { class: 'level-log' }, ctx.profile.levelLog.map((l) => h('span', { class: 'chip' }, `${t('common.level')} ${l.level} · ${new Date(l.at).toLocaleDateString(getLang())}`))),
      h('h3', {}, t('history.filters')),
      h(
        'div',
        { class: 'filters' },
        seg('outcome', [['all', t('history.all')], ['win', t('result.win')], ['loss', t('result.loss')], ['draw', t('result.draw')]]),
        seg('difficulty', [['all', t('history.all')], ['easy', t('difficulty.easy')], ['medium', t('difficulty.medium')], ['hard', t('difficulty.hard')], ['master', t('difficulty.master')]]),
      ),
      items,
      ctx.history.length ? h('button', { class: 'btn ghost danger', onclick: ctx.onClear }, t('history.clear')) : '',
    ),
  );
}

function stat(label: string, value: string | number) {
  return h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));
}

/** Tabuleiro 2D compacto com a posição final (texto + símbolos, acessível). */
export function miniBoard(fen: string, flip = false): HTMLElement {
  const board = new Chess(fen, { skipValidation: true }).board();
  const rows = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;
  const grid = h('div', { class: 'mini-board', role: 'img', 'aria-label': fen });
  rows.forEach((row, ri) =>
    row.forEach((p, fi) => {
      const light = (ri + fi) % 2 === 0;
      grid.append(h('span', { class: `sq ${light ? 'l' : 'd'} ${p ? (p.color === 'w' ? 'pw' : 'pb') : ''}` }, p ? GLYPH[p.type] : ''));
    }),
  );
  return grid;
}

function historyDetail(e: HistoryEntry): HTMLElement {
  const overlay = h('div', { class: 'modal-backdrop', onclick: (ev: Event) => ev.target === overlay && overlay.remove() });
  const moves = h('ol', { class: 'move-list detail' });
  for (let i = 0; i < e.moves.length; i += 2) moves.append(h('li', {}, h('span', { class: 'mv' }, e.moves[i]), e.moves[i + 1] ? h('span', { class: 'mv' }, e.moves[i + 1]) : ''));
  const powerCounts = new Map<string, number>();
  for (const p of e.powersUsed ?? []) powerCounts.set(p, (powerCounts.get(p) ?? 0) + 1);
  const row = (k: string, v: string) => h('div', { class: 'kv' }, h('span', { class: 'muted' }, k), h('strong', {}, v));
  const na = '—';
  overlay.append(
    h(
      'div',
      { class: `modal detail ${e.outcome}`, role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, `${OUTCOME_ICON[e.outcome]} ${t(`result.${e.outcome}`)}`),
      h('p', { class: 'muted' }, t(`result.${e.reason}`)),
      h(
        'div',
        { class: 'detail-grid' },
        h(
          'div',
          {},
          row(t('history.date'), new Date(e.date).toLocaleString(getLang())),
          row(t('history.color'), t(`difficulty.${e.playerColor === 'w' ? 'white' : 'black'}`)),
          row(t('menu.difficulty'), t(`difficulty.${e.difficulty}`)),
          row(t('history.duration'), e.durationMs !== undefined ? formatDuration(e.durationMs) : na),
          row(t('history.moveCount'), String(Math.ceil(e.plies / 2))),
          row(t('history.capturesLabel'), e.captures ? `${e.captures.player} × ${e.captures.ai}` : na),
          row(t('history.powersLabel'), e.powersUsed ? String(e.powersUsed.length) : String(e.powers)),
          row(t('history.aiPowers'), e.aiPowers !== undefined ? String(e.aiPowers) : na),
          row(t('result.rewards'), `+${e.xp} XP · ◈ ${e.coins}`),
          powerCounts.size
            ? h('div', { class: 'chips' }, [...powerCounts].map(([p, c]) => h('span', { class: 'chip' }, `${t(`powers.${p}.name`)} ×${c}`)))
            : '',
        ),
        e.finalFen ? h('div', {}, h('div', { class: 'muted small' }, t('history.finalPosition')), miniBoard(e.finalFen, e.playerColor === 'b')) : '',
      ),
      h('h4', {}, t('game.moves')),
      moves,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onclick: () => overlay.remove() }, t('common.close'))),
    ),
  );
  return overlay;
}

