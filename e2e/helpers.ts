import type { Page } from '@playwright/test';

/** Configurações leves para os testes (animações puladas, gráficos baixos). */
export const FAST_SETTINGS = {
  version: 2,
  lang: 'pt-BR',
  quality: 'low',
  shadows: false,
  particles: 'off',
  animations: 'skip',
  reduceMotion: true,
  cameraMotion: false,
};

export async function boot(page: Page, opts: { settings?: object; profile?: object; saved?: object; fresh?: boolean } = {}) {
  await page.addInitScript(
    ({ settings, profile, saved, fresh }) => {
      if (sessionStorage.getItem('__booted')) return;
      sessionStorage.setItem('__booted', '1');
      localStorage.clear();
      if (!fresh) localStorage.setItem('arcane.settings.v1', JSON.stringify(settings));
      if (profile) localStorage.setItem('arcane.profile.v1', JSON.stringify(profile));
      if (saved) localStorage.setItem('arcane.savedGame.v1', JSON.stringify(saved));
    },
    { settings: { ...FAST_SETTINGS, ...opts.settings }, profile: opts.profile ?? (opts.fresh ? null : { ...SEEN_PROFILE }), saved: opts.saved ?? null, fresh: !!opts.fresh },
  );
  await page.goto('/?debug');
  await page.waitForFunction(() => !!(window as unknown as { __arcane?: unknown }).__arcane);
  await page.locator('.menu').waitFor();
}

/** Perfil mínimo que já viu o tutorial (o app completa os demais campos). */
const SEEN_PROFILE = { version: 1, xp: 0, coins: 0, owned: [], stats: {}, tutorialSeen: true };

export async function squarePoint(page: Page, sq: string) {
  return page.evaluate((s) => {
    const w = window as unknown as { __arcane: { project: (x: number, z: number) => { x: number; y: number } } };
    return w.__arcane.project(s.charCodeAt(0) - 97 - 3.5, 3.5 - (Number(s[1]) - 1));
  }, sq);
}

export async function clickSquare(page: Page, sq: string) {
  const p = await squarePoint(page, sq);
  await page.mouse.click(p.x, p.y);
}

export async function tapSquare(page: Page, sq: string) {
  const p = await squarePoint(page, sq);
  await page.touchscreen.tap(p.x, p.y);
}

export async function startGame(page: Page) {
  await page.locator('.menu-item.accent').click();
  await page.locator('.btn.primary.big').click();
  await page.locator('.hud').waitFor();
  await page.getByText('Sua vez').waitFor();
}
