import { test } from '@playwright/test';
import { applyAction, createGame } from '../src/core/game';
import { boot, clickSquare } from './helpers';

// Capturas para revisão visual (sem asserções). Executar com SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'somente com SCREENSHOTS=1');
const out = process.env.SCREENSHOTS_DIR || 'screenshots';
const pretty = { quality: 'medium', particles: 'full', animations: 'full', reduceMotion: false, cameraMotion: false, animationSpeed: 0.3 };

for (const theme of ['classicRoyal', 'mysticIce', 'arcaneFlames', 'cosmos']) {
  test(`cenário ${theme}`, async ({ page }) => {
    await boot(page, { settings: pretty, profile: { version: 1, xp: 0, coins: 0, owned: [`theme:${theme}`], stats: {}, tutorialSeen: true, equipped: { theme: `theme:${theme}` } } });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/scene-${theme}-menu.png` });
    await page.locator('.menu-item.accent').click();
    await page.locator('.btn.primary.big').click();
    await page.getByText('Sua vez').waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/scene-${theme}-game.png` });
  });
}

test('feitiço do peão na captura', async ({ page }) => {
  let s = createGame(undefined, { startEnergy: 100 });
  for (const [f, t] of [['e2', 'e4'], ['d7', 'd5']]) {
    const r = applyAction(s, { kind: 'move', from: f, to: t } as never);
    if (r.ok) s = r.state;
  }
  await boot(page, { settings: pretty, saved: { version: 1, state: s, difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: Date.now(), undoStack: [] } });
  await page.locator('.menu-item.accent').click();
  await page.getByText('Sua vez').waitFor();
  await clickSquare(page, 'e4');
  await clickSquare(page, 'd5');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/spell-pawn-${i}.png` });
  }
});

test('feitiços: escudo real e muralha', async ({ page }) => {
  const s = createGame('r3k3/pppp4/8/8/8/8/PPPP4/R3K3 w - - 0 1', { startEnergy: 150 });
  await boot(page, { settings: pretty, saved: { version: 1, state: s, difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: Date.now(), undoStack: [] } });
  await page.locator('.menu-item.accent').click();
  await page.getByText('Sua vez').waitFor();
  await clickSquare(page, 'e1');
  await page.locator('.power-panel .btn.primary').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/spell-shield-${i}.png` });
  }
  await page.waitForTimeout(2500);
  await clickSquare(page, 'a1');
  await page.locator('.power-panel .btn.primary').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/spell-wall-${i}.png` });
  }
});
