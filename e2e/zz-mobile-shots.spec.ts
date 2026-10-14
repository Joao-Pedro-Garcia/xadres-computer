import { test } from '@playwright/test';
import { applyAction, createGame } from '../src/core/game';
import { boot, tapSquare } from './helpers';

// Capturas para revisão visual no celular (sem asserções). Executar com SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'somente com SCREENSHOTS=1');
const out = process.env.SCREENSHOTS_DIR || 'screenshots';
test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 780 } });

test('celular: HUD compacto e captura', async ({ page }) => {
  let s = createGame(undefined, { startEnergy: 100 });
  for (const [f, t] of [['e2', 'e4'], ['d7', 'd5']]) {
    const r = applyAction(s, { kind: 'move', from: f, to: t } as never);
    if (r.ok) s = r.state;
  }
  await boot(page, { saved: { version: 1, state: s, difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: Date.now(), undoStack: [] }, settings: { quality: 'medium', particles: 'full', animations: 'full', reduceMotion: false, cameraMotion: true, animationSpeed: 0.35 } });
  await page.locator('.menu-item.accent').click();
  await page.getByText('Sua vez').waitFor();
  await tapSquare(page, 'e4');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/m1-selected.png` });
  await tapSquare(page, 'd5');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${out}/m2-capture-${i}.png` });
  }
  await page.locator('.hud-more').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/m3-options.png` });
});

test('celular: tutorial compacto', async ({ page }) => {
  await boot(page);
  await page.locator('.menu-item', { hasText: 'Tutorial' }).click();
  for (let i = 0; i < 3; i++) await page.locator('.tutorial-card .btn', { hasText: 'Avançar' }).click();
  await page.waitForTimeout(1200);
  await tapSquare(page, 'e1');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/m4-tutorial.png` });
});
