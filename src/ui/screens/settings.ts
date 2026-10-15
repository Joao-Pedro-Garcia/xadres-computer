import { t } from '../../i18n';
import type { Settings } from '../../meta/settings';
import { h } from '../dom';

export interface SettingsScreenCtx {
  header: HTMLElement;
  settings: Settings;
  /** Aplica e salva imediatamente. */
  update: (patch: Partial<Settings>) => void;
  restoreDefaults: () => void;
  resetProgress: () => void;
  inMatch: boolean;
}

/** Tela de configurações: todas as opções alteram o comportamento real do jogo. */
export function settingsScreen(ctx: SettingsScreenCtx): HTMLElement {
  const s = ctx.settings;
  const row = (label: string, control: HTMLElement, hint?: string) =>
    h('div', { class: 'setting' }, h('div', { class: 'setting-label' }, h('label', {}, label), hint ? h('small', { class: 'muted' }, hint) : ''), control);
  const seg = <K extends keyof Settings>(key: K, options: [Settings[K], string][]) =>
    h(
      'div',
      { class: 'seg', role: 'radiogroup' },
      options.map(([v, l]) =>
        h('button', { class: `seg-btn ${s[key] === v ? 'selected' : ''}`, role: 'radio', 'aria-checked': String(s[key] === v), onclick: () => ctx.update({ [key]: v } as Partial<Settings>) }, l),
      ),
    );
  const toggle = (key: keyof Settings, label: string) =>
    h(
      'button',
      { class: `toggle ${s[key] ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!s[key]), 'aria-label': label, onclick: () => ctx.update({ [key]: !s[key] } as Partial<Settings>) },
      h('span', {}),
      h('em', { class: 'toggle-text' }, s[key] ? t('common.on') : t('common.off')),
    );
  const slider = (key: 'masterVolume' | 'sfxVolume' | 'musicVolume' | 'animationSpeed' | 'cameraSensitivity', min: number, max: number, step: number, fmt: (v: number) => string, label: string) => {
    const out = h('output', { class: 'slider-value' }, fmt(s[key]));
    const input = h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label }) as HTMLInputElement;
    input.addEventListener('input', () => (out.textContent = fmt(Number(input.value))));
    input.addEventListener('change', () => ctx.update({ [key]: Number(input.value) } as Partial<Settings>));
    return h('div', { class: 'slider' }, input, out);
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const mult = (v: number) => `${v.toFixed(1)}×`;

  return h(
    'div',
    {},
    ctx.header,
    h(
      'div',
      { class: 'panel content settings' },
      row(t('settings.language'), seg('lang', [['pt-BR', 'Português (BR)'], ['en', 'English']])),

      h('h3', {}, t('settings.graphics')),
      row(t('settings.quality'), seg('quality', [['auto', t('settings.auto')], ['low', t('settings.low')], ['medium', t('settings.medium')], ['high', t('settings.high')]]), t('settings.qualityHint')),
      row(t('settings.shadows'), toggle('shadows', t('settings.shadows'))),
      row(t('settings.particles'), seg('particles', [['off', t('settings.particlesOff')], ['reduced', t('settings.particlesReduced')], ['full', t('settings.particlesFull')]])),
      row(t('settings.coordinates'), toggle('coordinates', t('settings.coordinates'))),

      h('h3', {}, t('settings.motion')),
      row(t('settings.animations'), seg('animations', [['full', t('settings.animFull')], ['skip', t('settings.animSkip')]])),
      row(t('settings.animationSpeed'), slider('animationSpeed', 0.5, 2.5, 0.1, mult, t('settings.animationSpeed'))),
      row(t('settings.reduceMotion'), toggle('reduceMotion', t('settings.reduceMotion')), t('settings.reduceMotionHint')),
      row(t('settings.cameraMotion'), toggle('cameraMotion', t('settings.cameraMotion'))),

      h('h3', {}, t('settings.controls')),
      row(t('settings.cameraSensitivity'), slider('cameraSensitivity', 0.3, 2, 0.1, mult, t('settings.cameraSensitivity'))),
      row(t('settings.touchRotate'), seg('touchRotate', [['oneFinger', t('settings.oneFinger')], ['twoFingers', t('settings.twoFingers')]]), t('settings.touchHint')),
      row(t('settings.flipView'), toggle('flipView', t('settings.flipView'))),
      row(t('settings.allowUndo'), toggle('allowUndo', t('settings.allowUndo'))),

      h('h3', {}, t('settings.audio')),
      row(t('settings.sound'), toggle('sound', t('settings.sound'))),
      row(t('settings.masterVolume'), slider('masterVolume', 0, 1, 0.05, pct, t('settings.masterVolume'))),
      row(t('settings.sfxVolume'), slider('sfxVolume', 0, 1, 0.05, pct, t('settings.sfxVolume'))),
      row(t('settings.music'), toggle('music', t('settings.music')), t('settings.musicHint')),
      row(t('settings.musicVolume'), slider('musicVolume', 0, 1, 0.05, pct, t('settings.musicVolume'))),

      h('h3', {}, t('settings.accessibility')),
      row(t('settings.highContrast'), toggle('highContrast', t('settings.highContrast')), t('settings.highContrastHint')),
      row(t('settings.largeText'), toggle('largeText', t('settings.largeText'))),

      h('div', { class: 'modal-actions left' }, h('button', { class: 'btn ghost', onclick: ctx.restoreDefaults }, t('settings.restoreDefaults'))),

      h('h3', {}, t('settings.data')),
      h('p', { class: 'note' }, t('settings.storageNote')),
      ctx.inMatch ? '' : h('button', { class: 'btn ghost danger', onclick: ctx.resetProgress }, t('settings.resetProgress')),
    ),
  );
}
