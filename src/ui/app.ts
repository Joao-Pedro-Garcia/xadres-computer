import { createGame } from '../core/game';
import type { Color, Difficulty } from '../core/types';
import { getLang, setLang, t } from '../i18n';
import { CAPTURE_FX, CATALOG, PIECE_SKINS, THEMES, TRAILS, type CatalogItem, type ItemCategory } from '../meta/catalog';
import {
  ACHIEVEMENTS,
  MIN_PLIES_FOR_REWARD,
  canUnlock,
  equip,
  finalizeMatch,
  isProfile,
  levelInfo,
  migrateProfile,
  newProfile,
  purchase,
  type Profile,
  type RewardReport,
} from '../meta/profile';
import { historyScreen } from './screens/history';
import { MAX_HISTORY, buildHistoryEntry, type HistoryFilter, buildSummary, isHistory, validateSaved, type HistoryEntry, type SavedGame } from '../meta/session';
import { defaultSettings, resolveQuality, sanitizeSettings, type Settings } from '../meta/settings';
import { settingsScreen } from './screens/settings';
import { KEYS, defaultStore, readJson, writeJson, type KeyValueStore } from '../meta/storage';
import { AiClient } from '../ai/client';
import type { BoardView } from '../render/scene';
import { START_FEN } from '../core/game';
import { Audio } from './audio';
import { Music } from './music';
import { clear, h, hex } from './dom';
import { Match } from './match';
import { Tutorial } from './tutorial';

type Screen = 'menu' | 'newGame' | 'shop' | 'achievements' | 'history' | 'tutorial' | 'settings' | 'credits' | 'game';

export class App {
  private store: KeyValueStore = defaultStore();
  private settings: Settings;
  private profile: Profile;
  private history: HistoryEntry[];
  private saved: SavedGame | null;
  private view!: BoardView;
  private ai = new AiClient();
  private audio = new Audio();
  private music = new Music();
  private ui: HTMLElement;
  private screenEl: HTMLElement;
  private hudLayer: HTMLElement;
  private toasts: HTMLElement;
  private match: Match | null = null;
  private shopTab: ItemCategory = 'theme';
  private tutorial: Tutorial | null = null;
  private previewTheme: string | null = null;

  constructor(private root: HTMLElement) {
    this.settings = sanitizeSettings(readJson<unknown>(this.store, KEYS.settings, null));
    const p = readJson<unknown>(this.store, KEYS.profile, null);
    this.profile = isProfile(p) ? migrateProfile(p) : newProfile();
    this.history = readJson(this.store, KEYS.history, [] as HistoryEntry[], isHistory);
    const rawSaved = readJson<unknown>(this.store, KEYS.savedGame, null);
    this.saved = rawSaved ? validateSaved(rawSaved) : null;
    setLang(this.settings.lang);
    this.ui = h('div', { class: 'ui' });
    this.screenEl = h('div', { class: 'screen-host' });
    this.hudLayer = h('div', { class: 'hud-layer' });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.ui.append(this.hudLayer, this.screenEl, this.toasts);
    if (rawSaved && !this.saved) {
      this.store.removeItem(KEYS.savedGame);
      setTimeout(() => this.toast(t('errors.corruptSave'), 'error'), 600);
    }
  }

  /** Carregamento progressivo: a interface aparece logo; o módulo 3D (Three.js) é baixado em seguida. */
  async start() {
    const stage = h('div', { class: 'stage' });
    this.root.append(stage, this.ui);
    const status = document.querySelector('#loading .loading-text');
    if (status) status.textContent = t('app.loading');
    let mod: typeof import('../render/scene');
    try {
      mod = await import('../render/scene');
    } catch (err) {
      console.error(err);
      return this.fatal(t('app.loadError'), true);
    }
    if (!mod.BoardView.supported()) return this.fatal(t('app.webglError'));
    try {
      this.view = new mod.BoardView(stage);
    } catch (err) {
      console.error(err);
      return this.fatal(t('app.webglError'));
    }
    this.view.onContextChange = (lost) => this.toast(lost ? t('app.contextLost') : t('app.contextRestored'), lost ? 'error' : 'success');
    this.applyVisuals();
    this.view.syncPieces(START_FEN, true);
    this.view.setMode('menu');
    this.view.start();
    if (new URLSearchParams(location.search).has('debug')) {
      // Ganchos usados apenas pelos testes automatizados de interface (?debug).
      (window as unknown as Record<string, unknown>).__arcane = {
        project: (x: number, z: number) => this.view.project(x, z),
        camera: () => this.view.camera.position.toArray(),
        canvasSize: () => [this.view.renderer.domElement.clientWidth, this.view.renderer.domElement.clientHeight],
        musicPlaying: () => this.music.isPlaying,
      };
    }
    this.applySettings();
    document.getElementById('loading')?.remove();
    this.show('menu');
    this.offerTutorial();
  }

  private fatal(msg: string, retry = false) {
    document.getElementById('loading')?.remove();
    clear(this.screenEl);
    this.screenEl.append(
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'panel content center-card', role: 'alert' }, h('h2', {}, t('app.title')), h('p', {}, msg), retry ? h('button', { class: 'btn primary', onclick: () => location.reload() }, t('app.retry')) : ''),
      ),
    );
  }

  /* ------------------------------ Persistência ------------------------------ */

  private persist(key: string, v: unknown) {
    if (!writeJson(this.store, key, v)) this.toast(t('errors.saveFailed'), 'error');
  }
  private saveProfile() {
    this.persist(KEYS.profile, this.profile);
  }
  private saveSettings() {
    this.persist(KEYS.settings, this.settings);
  }
  private saveGame(g: SavedGame | null) {
    this.saved = g;
    if (g) this.persist(KEYS.savedGame, g);
    else this.store.removeItem(KEYS.savedGame);
  }

  /* ------------------------------ Visual ------------------------------ */

  private applyVisuals(themeOverride?: string) {
    const eq = this.profile.equipped;
    const themeId = (themeOverride ?? eq.theme).split(':')[1];
    const theme = THEMES.find((x) => x.id === themeId) ?? THEMES[0];
    const skin = PIECE_SKINS.find((x) => `pieces:${x.id}` === eq.pieces) ?? PIECE_SKINS[0];
    const trail = TRAILS.find((x) => `trail:${x.id}` === eq.trail) ?? TRAILS[0];
    const cap = CAPTURE_FX.find((x) => `capture:${x.id}` === eq.capture) ?? CAPTURE_FX[0];
    const s = this.settings;
    this.view.setOptions({
      quality: resolveQuality(s.quality),
      autoQuality: s.quality === 'auto',
      shadows: s.shadows && resolveQuality(s.quality) !== 'low',
      particles: s.particles,
      cameraMotion: s.cameraMotion,
      reduceMotion: s.reduceMotion,
      coordinates: s.coordinates,
      animations: s.animations,
      animationSpeed: s.animationSpeed,
      cameraSensitivity: s.cameraSensitivity,
      touchRotate: s.touchRotate,
      highContrast: s.highContrast,
    });
    this.view.setTheme(theme);
    this.view.setSkin(skin, this.match ? undefined : START_FEN);
    this.view.setTrail(trail.color);
    this.view.setCaptureFx(cap);
    document.documentElement.style.setProperty('--theme-accent', hex(theme.rim));
  }

  /* ------------------------------ Utilidades de UI ------------------------------ */

  toast(msg: string, kind: 'info' | 'error' | 'success' = 'info') {
    const el = h('div', { class: `toast ${kind}` }, msg);
    this.toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  confirm(msg: string): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        overlay.remove();
        resolve(v);
      };
      const overlay = h(
        'div',
        { class: 'modal-backdrop' },
        h(
          'div',
          { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' },
          h('p', {}, msg),
          h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => done(false) }, t('common.cancel')), h('button', { class: 'btn primary', onclick: () => done(true) }, t('common.confirm'))),
        ),
      );
      this.ui.append(overlay);
      (overlay.querySelector('.btn.primary') as HTMLElement)?.focus();
    });
  }

  private header(title: string, back: Screen = 'menu') {
    if ((this.match || this.tutorial) && back === 'menu') back = 'game';
    return h(
      'div',
      { class: 'screen-header' },
      h('button', { class: 'btn ghost back', onclick: () => this.show(back) }, '‹ ', t('common.back')),
      h('h2', {}, title),
      this.profileChip(),
    );
  }

  private profileChip() {
    const li = levelInfo(this.profile.xp);
    return h(
      'div',
      { class: 'profile-chip', title: `${li.into}/${li.needed} XP` },
      h('span', { class: 'lvl' }, `${t('common.level')} ${li.level}`),
      h('span', { class: 'xpbar' }, h('span', { style: `width:${(li.into / li.needed) * 100}%` })),
      h('span', { class: 'coins' }, `◈ ${this.profile.coins}`),
    );
  }

  /* ------------------------------ Telas ------------------------------ */

  show(screen: Screen) {
    this.audio.play('click');
    if (this.previewTheme && screen !== 'shop') {
      this.previewTheme = null;
      this.applyVisuals();
    }
    clear(this.screenEl);
    // 'game' volta para a partida em andamento (o HUD fica em outra camada e não é recriado).
    if (screen === 'game') return;
    const el = this[`screen_${screen}`]();
    el.classList.add('screen', `screen-${screen}`);
    this.screenEl.append(el);
  }

  private screen_menu() {
    const li = levelInfo(this.profile.xp);
    const item = (label: string, onClick: () => void, cls = '') => h('button', { class: `menu-item ${cls}`, onclick: onClick }, label);
    return h(
      'div',
      { class: 'menu' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, '♛'), h('h1', {}, 'Arcane ', h('span', {}, 'Chess')), h('p', {}, t('app.subtitle'))),
      h(
        'nav',
        { class: 'menu-list panel' },
        this.saved ? item(t('menu.continue'), () => this.continueGame(), 'accent') : '',
        item(t('menu.play'), () => this.show('newGame'), this.saved ? '' : 'accent'),
        item(`${t('menu.difficulty')}: ${t(`difficulty.${this.settings.difficulty}`)}`, () => this.show('newGame')),
        item(t('menu.customize'), () => ((this.shopTab = 'pieces'), this.show('shop'))),
        item(t('menu.themes'), () => ((this.shopTab = 'theme'), this.show('shop'))),
        item(t('menu.achievements'), () => this.show('achievements')),
        item(t('menu.history'), () => this.show('history')),
        item(t('menu.tutorial'), () => this.show('tutorial')),
        item(t('menu.settings'), () => this.show('settings')),
        item(t('menu.credits'), () => this.show('credits')),
      ),
      h(
        'div',
        { class: 'menu-footer' },
        this.musicButton(),
        h('div', { class: 'profile-chip big' }, h('span', { class: 'lvl' }, `${t('common.level')} ${li.level}`), h('span', { class: 'xpbar' }, h('span', { style: `width:${(li.into / li.needed) * 100}%` })), h('span', { class: 'muted' }, `${li.into}/${li.needed} XP`), h('span', { class: 'coins' }, `◈ ${this.profile.coins}`)),
      ),
    );
  }

  private screen_newGame() {
    const diffs: Difficulty[] = ['easy', 'medium', 'hard', 'master'];
    const colors: ('w' | 'b' | 'random')[] = ['w', 'b', 'random'];
    const render = () => {
      clear(body);
      body.append(
        h('h3', {}, t('difficulty.choose')),
        h(
          'div',
          { class: 'choice-grid' },
          diffs.map((d) =>
            h(
              'button',
              { class: `choice ${this.settings.difficulty === d ? 'selected' : ''}`, onclick: () => ((this.settings.difficulty = d), this.saveSettings(), render()) },
              h('strong', {}, t(`difficulty.${d}`)),
              h('span', {}, t(`difficulty.${d}Desc`)),
            ),
          ),
        ),
        h('h3', {}, t('difficulty.color')),
        h(
          'div',
          { class: 'seg' },
          colors.map((c) =>
            h('button', { class: `seg-btn ${this.settings.playerColor === c ? 'selected' : ''}`, onclick: () => ((this.settings.playerColor = c), this.saveSettings(), render()) }, t(`difficulty.${c === 'w' ? 'white' : c === 'b' ? 'black' : 'random'}`)),
          ),
        ),
        h('button', { class: 'btn primary big', onclick: () => void this.newGame() }, t('difficulty.start')),
      );
    };
    const body = h('div', { class: 'panel content' });
    render();
    return h('div', {}, this.header(t('menu.play')), body);
  }

  private screen_shop() {
    const cats: ItemCategory[] = ['theme', 'pieces', 'trail', 'capture'];
    const body = h('div', { class: 'shop-grid' });
    const render = () => {
      clear(body);
      for (const item of CATALOG.filter((i) => i.category === this.shopTab)) body.append(this.shopCard(item, render));
    };
    render();
    const tabs = h(
      'div',
      { class: 'seg tabs' },
      cats.map((c) => h('button', { class: `seg-btn ${this.shopTab === c ? 'selected' : ''}`, onclick: () => ((this.shopTab = c), this.show('shop')) }, t(`shop.categories.${c}`))),
    );
    return h('div', {}, this.header(this.shopTab === 'theme' ? t('shop.themesTitle') : t('shop.title')), h('div', { class: 'panel content' }, tabs, h('p', { class: 'note' }, t('shop.note')), body));
  }

  private shopCard(item: CatalogItem, rerender: () => void) {
    const p = this.profile;
    const owned = p.owned.includes(item.id);
    const equipped = p.equipped[item.category] === item.id;
    const err = owned ? null : canUnlock(p, item.id);
    const name = t(`items.${item.id}.name`);
    const reqs: string[] = [];
    if (item.unlock.level) reqs.push(t('shop.requires.level', { n: item.unlock.level }));
    if (item.unlock.achievement) reqs.push(t('shop.requires.achievement', { name: t(`achievements.${item.unlock.achievement}.name`) }));
    if (item.unlock.coins) reqs.push(t('shop.requires.coins', { n: item.unlock.coins }));
    if (!reqs.length) reqs.push(t('shop.requires.free'));

    let action: HTMLElement;
    if (equipped) action = h('span', { class: 'badge gold' }, t('common.equipped'));
    else if (owned)
      action = h('button', { class: 'btn primary small', onclick: () => {
        const n = equip(p, item.id);
        if (n) {
          this.profile = n;
          this.saveProfile();
          this.previewTheme = null;
          this.applyVisuals();
          rerender();
        }
      } }, t('common.equip'));
    else
      action = h('button', { class: 'btn primary small', disabled: !!err, title: err ? t(`shop.purchaseErrors.${err}`) : '', onclick: () => {
        const r = purchase(p, item.id);
        if (!r.ok) return this.toast(t(`shop.purchaseErrors.${r.error}`), 'error');
        this.profile = r.profile;
        this.saveProfile();
        this.toast(t('shop.bought'), 'success');
        this.audio.play('win');
        this.show('shop');
      } }, item.unlock.coins ? `${t('common.buy')} ◈${item.unlock.coins}` : t('common.unlock'));

    const preview = this.previewSwatch(item);
    const canPreview = item.category === 'theme';
    return h(
      'div',
      { class: `card ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''}` },
      preview,
      h('div', { class: 'card-body' }, h('strong', {}, name), h('p', {}, t(`items.${item.id}.desc`)), h('div', { class: 'reqs' }, reqs.join(' · ')), err && err !== 'alreadyOwned' ? h('div', { class: 'reason' }, t(`shop.purchaseErrors.${err}`)) : ''),
      h(
        'div',
        { class: 'card-actions' },
        canPreview ? h('button', { class: 'btn ghost small', onclick: () => ((this.previewTheme = item.id), this.applyVisuals(item.id)) }, t('shop.preview')) : '',
        action,
      ),
    );
  }

  private previewSwatch(item: CatalogItem) {
    const id = item.id.split(':')[1];
    if (item.category === 'theme') {
      const th = THEMES.find((x) => x.id === id)!;
      const cells = [];
      for (let i = 0; i < 16; i++) cells.push(h('span', { style: `background:${hex((i + Math.floor(i / 4)) % 2 ? th.dark : th.light)}` }));
      return h('div', { class: 'swatch board', style: `--glow:${hex(th.rim)};background:${hex(th.frame)}` }, cells);
    }
    if (item.category === 'pieces') {
      const sk = PIECE_SKINS.find((x) => x.id === id)!;
      return h('div', { class: 'swatch pieces', style: `--glow:${hex(sk.glow)}` }, h('span', { style: `color:${hex(sk.white)}` }, '♛'), h('span', { style: `color:${hex(sk.black)};text-shadow:0 0 6px ${hex(sk.glow)}` }, '♛'));
    }
    if (item.category === 'trail') {
      const tr = TRAILS.find((x) => x.id === id)!;
      return h('div', { class: 'swatch trail', style: `--c:${hex(tr.color)}` }, h('span', {}), h('span', {}), h('span', {}));
    }
    const cf = CAPTURE_FX.find((x) => x.id === id)!;
    return h('div', { class: 'swatch capture', style: `--c:${hex(cf.tint ?? 0x5fc8ff)};--k:${cf.intensity}` }, h('span', {}));
  }

  private screen_achievements() {
    const done = ACHIEVEMENTS.filter((a) => this.profile.achievements[a.id]).length;
    return h(
      'div',
      {},
      this.header(t('achievements.title')),
      h(
        'div',
        { class: 'panel content' },
        h('p', { class: 'muted' }, t('achievements.progress', { done, total: ACHIEVEMENTS.length })),
        h('div', { class: 'xpbar wide' }, h('span', { style: `width:${(done / ACHIEVEMENTS.length) * 100}%` })),
        h(
          'div',
          { class: 'ach-list' },
          ACHIEVEMENTS.map((a) => {
            const at = this.profile.achievements[a.id];
            const pr = at ? null : a.progress(this.profile);
            return h(
              'div',
              { class: `ach ${at ? 'done' : ''}`, 'aria-label': `${t(`achievements.${a.id}.name`)} — ${at ? t('achievements.unlocked') : t('achievements.locked')}` },
              h('div', { class: 'ach-icon', 'aria-hidden': 'true' }, a.icon),
              h(
                'div',
                { class: 'ach-body' },
                h('strong', {}, t(`achievements.${a.id}.name`)),
                h('p', {}, t(`achievements.${a.id}.desc`)),
                a.xp || a.coins ? h('small', {}, t('achievements.reward', { xp: a.xp, coins: a.coins })) : '',
                pr
                  ? h('div', { class: 'ach-progress' }, h('span', { class: 'xpbar' }, h('span', { style: `width:${(pr.current / pr.target) * 100}%` })), h('small', { class: 'muted' }, t('achievements.progressOf', pr)))
                  : '',
              ),
              h('span', { class: `ach-state ${at ? 'ok' : ''}` }, at ? `✓ ${t('achievements.unlocked')}` : `○ ${t('achievements.locked')}`),
              at ? h('small', { class: 'date' }, new Date(at).toLocaleDateString(getLang())) : '',
            );
          }),
        ),
      ),
    );
  }

  private historyFilter: HistoryFilter = { outcome: 'all', difficulty: 'all' };

  private screen_history() {
    return historyScreen({
      header: this.header(t('history.title')),
      history: this.history,
      profile: this.profile,
      filter: this.historyFilter,
      host: this.ui,
      onFilter: (f) => {
        this.historyFilter = f;
        this.show('history');
      },
      onClear: async () => {
        if (!(await this.confirm(t('history.clearConfirm')))) return;
        this.history = [];
        this.persist(KEYS.history, this.history);
        this.show('history');
      },
    });
  }

  /** O tutorial não é uma tela comum: roda sobre o tabuleiro 3D. */
  private screen_tutorial() {
    queueMicrotask(() => this.startTutorial());
    return h('div', {});
  }

  private startTutorial() {
    clear(this.screenEl);
    this.markTutorialSeen();
    this.tutorial?.dispose();
    this.tutorial = new Tutorial({
      base: {
        view: this.view,
        ai: this.ai,
        audio: this.audio,
        settings: () => this.settings,
        toast: (m, k) => this.toast(m, k),
        confirm: (m) => this.confirm(m),
        openSettings: () => this.show('settings'),
        toggleMusic: () => this.toggleMusic(),
      },
      layer: this.hudLayer,
      onExit: (open) => {
        this.tutorial = null;
        this.view.setMode('menu');
        this.view.syncPieces(START_FEN);
        this.show(open ?? 'menu');
      },
    });
  }

  private markTutorialSeen() {
    if (this.profile.tutorialSeen) return;
    this.profile = { ...this.profile, tutorialSeen: true };
    this.saveProfile();
  }

  /** No primeiro acesso, oferece o tutorial (pode ser pulado e aberto depois pelo menu). */
  private offerTutorial() {
    if (this.profile.tutorialSeen || this.saved || this.profile.stats.games > 0) return;
    const overlay = h('div', { class: 'modal-backdrop' });
    const close = (start: boolean) => {
      overlay.remove();
      this.markTutorialSeen();
      if (start) this.show('tutorial');
    };
    overlay.append(
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h3', {}, t('tutorial.offerTitle')),
        h('p', {}, t('tutorial.offerBody')),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, t('tutorial.offerSkip')), h('button', { class: 'btn primary', onclick: () => close(true) }, t('tutorial.offerStart'))),
      ),
    );
    this.ui.append(overlay);
  }

  private screen_settings() {
    return settingsScreen({
      header: this.header(t('settings.title'), this.match || this.tutorial ? 'game' : 'menu'),
      settings: this.settings,
      inMatch: !!this.match || !!this.tutorial,
      update: (patch) => this.updateSettings(patch),
      restoreDefaults: async () => {
        if (!(await this.confirm(t('settings.restoreConfirm')))) return;
        const keep = { difficulty: this.settings.difficulty, playerColor: this.settings.playerColor };
        this.settings = { ...defaultSettings(), ...keep };
        this.applySettings();
        this.toast(t('settings.restored'), 'success');
        this.show('settings');
      },
      resetProgress: async () => {
        if (!(await this.confirm(t('settings.resetConfirm')))) return;
        this.profile = newProfile();
        this.history = [];
        this.saveProfile();
        this.persist(KEYS.history, []);
        this.saveGame(null);
        this.applyVisuals();
        this.toast(t('settings.resetDone'), 'success');
        this.show('settings');
      },
    });
  }

  /** Botão rápido para ligar/desligar a música (o volume fica nas Configurações). */
  private musicButton() {
    const on = this.settings.music;
    return h(
      'button',
      { class: `btn ghost music-btn ${on ? '' : 'off'}`, 'aria-pressed': String(on), onclick: () => this.toggleMusic() },
      '♫ ',
      on ? t('settings.musicOn') : t('settings.musicOff'),
    );
  }

  private toggleMusic() {
    this.settings = sanitizeSettings({ ...this.settings, music: !this.settings.music });
    this.applySettings();
    if (!this.match && !this.tutorial) this.show('menu');
  }

  /** Aplica uma alteração de configuração imediatamente e salva no dispositivo. */
  updateSettings(patch: Partial<Settings>) {
    const before = this.settings;
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    // Ligar "redução de movimento" também desliga os movimentos de câmera (e vice-versa ao desligar).
    if (patch.reduceMotion !== undefined) this.settings.cameraMotion = !patch.reduceMotion;
    this.applySettings();
    if (before.flipView !== this.settings.flipView) this.match?.orientationChanged();
    this.show('settings');
  }

  private applySettings() {
    this.saveSettings();
    setLang(this.settings.lang);
    this.audio.enabled = this.settings.sound;
    this.audio.volume = this.settings.masterVolume * this.settings.sfxVolume;
    this.music.configure(this.settings.music, this.settings.masterVolume * this.settings.musicVolume);
    const root = document.documentElement.classList;
    root.toggle('high-contrast', this.settings.highContrast);
    root.toggle('large-text', this.settings.largeText);
    root.toggle('reduce-motion', this.settings.reduceMotion);
    if (this.view) this.applyVisuals();
    this.match?.relabel();
    this.tutorial?.relabel();
  }

  private screen_credits() {
    return h('div', {}, this.header(t('credits.title')), h('div', { class: 'panel content credits' }, t('credits.body').split('\n\n').map((p) => h('p', {}, p))));
  }

  /* ------------------------------ Partidas ------------------------------ */

  private async newGame() {
    if (this.saved && !(await this.confirm(t('game.newGameConfirm')))) return;
    const pc = this.settings.playerColor;
    const color: Color = pc === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : pc;
    const g: SavedGame = { version: 1, state: createGame(), difficulty: this.settings.difficulty, playerColor: color, undoUsed: 0, startedAt: Date.now(), undoStack: [] };
    this.saveGame(g);
    this.enterMatch(g);
  }

  private continueGame() {
    if (!this.saved) return;
    this.enterMatch(this.saved);
  }

  private enterMatch(g: SavedGame) {
    clear(this.screenEl);
    this.match?.dispose();
    this.applyVisuals();
    this.match = new Match(
      {
        view: this.view,
        ai: this.ai,
        audio: this.audio,
        settings: () => this.settings,
        save: (x) => this.saveGame(x),
        toast: (m, k) => this.toast(m, k),
        confirm: (m) => this.confirm(m),
        onFinished: (x) => this.finish(x),
        onExit: () => this.exitMatch(),
        openSettings: () => this.show('settings'),
        toggleMusic: () => this.toggleMusic(),
      },
      g,
      this.hudLayer,
    );
  }

  private exitMatch() {
    this.match?.dispose();
    this.match = null;
    this.view.setMode('menu');
    this.view.syncPieces(START_FEN);
    this.show('menu');
  }

  private finish(g: SavedGame) {
    const summary = buildSummary(g);
    const { profile, report } = finalizeMatch(this.profile, summary);
    this.profile = profile;
    this.saveProfile();
    if (report.reason !== 'alreadyRewarded') {
      this.history = [buildHistoryEntry(g, summary, report), ...this.history].slice(0, MAX_HISTORY);
      this.persist(KEYS.history, this.history);
    }
    this.saveGame(null);
    this.audio.play(summary.outcome === 'win' ? 'win' : summary.outcome === 'loss' ? 'loss' : 'click');
    setTimeout(() => this.showResult(summary.outcome, summary.result.reason, report, g), 900);
  }

  private showResult(outcome: 'win' | 'loss' | 'draw', reason: string, r: RewardReport, g: SavedGame) {
    const overlay = h('div', { class: 'modal-backdrop' });
    const close = (again: boolean) => {
      overlay.remove();
      this.exitMatch();
      if (again) this.show('newGame');
    };
    const lines: (HTMLElement | string)[] = [];
    if (!r.granted) {
      lines.push(h('p', { class: 'muted' }, r.reason === 'resigned' ? t('result.noRewardResigned') : r.reason === 'tooShort' ? t('result.noRewardShort', { n: MIN_PLIES_FOR_REWARD }) : t('result.noReward')));
    }
    if (g.undoUsed > 0 && r.granted) lines.push(h('p', { class: 'muted' }, t('result.undoPenalty')));
    if (r.xp || r.coins) lines.push(h('div', { class: 'reward-big' }, h('span', {}, `+${r.xp} XP`), h('span', { class: 'gold' }, `+${r.coins} ◈`)));
    if (r.challenges.length) lines.push(h('h4', {}, t('result.challenges')), h('ul', {}, r.challenges.map((c) => h('li', {}, t(`challenges.${c}`)))));
    if (r.achievements.length) lines.push(h('h4', {}, t('result.achievementsUnlocked')), h('ul', {}, r.achievements.map((a) => h('li', {}, '★ ', t(`achievements.${a}.name`)))));
    if (r.levelAfter > r.levelBefore) lines.push(h('p', { class: 'level-up' }, t('result.levelUp', { level: r.levelAfter, coins: r.levelCoins })));
    const li = levelInfo(this.profile.xp);
    overlay.append(
      h(
        'div',
        { class: `modal result ${outcome}` },
        h('h2', {}, t(`result.${outcome}`)),
        h('p', { class: 'reason' }, t(`result.${reason}`)),
        h('h4', {}, t('result.rewards')),
        ...lines,
        h('div', { class: 'profile-chip big' }, h('span', { class: 'lvl' }, `${t('common.level')} ${li.level}`), h('span', { class: 'xpbar' }, h('span', { style: `width:${(li.into / li.needed) * 100}%` })), h('span', { class: 'coins' }, `◈ ${this.profile.coins}`)),
        h('div', { class: 'modal-actions' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, t('result.backToMenu')), h('button', { class: 'btn primary', onclick: () => close(true) }, t('result.playAgain'))),
      ),
    );
    this.ui.append(overlay);
  }
}

