import { test } from '@playwright/test';
import { boot } from './helpers';

// Capturas para revisão visual (sem asserções). Executar com SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'somente com SCREENSHOTS=1');
const out = process.env.SCREENSHOTS_DIR || 'screenshots';
const pretty = { quality: 'high', particles: 'reduced', animations: 'full', reduceMotion: false, cameraMotion: false };

test('loja de peças', async ({ page }) => {
  await boot(page, { settings: pretty });
  await page.locator('.menu-item', { hasText: 'Personalização' }).click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/shop-pieces.png`, fullPage: true });
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/shop-pieces-2.png` });
});

for (const skin of ['alabasterGold', 'malachiteGold', 'woodTournament']) {
  test(`peças ${skin}`, async ({ page }) => {
    await boot(page, { settings: pretty, profile: { version: 1, xp: 0, coins: 0, owned: [`pieces:${skin}`], stats: {}, tutorialSeen: true, equipped: { pieces: `pieces:${skin}` } } });
    await page.locator('.menu-item.accent').click();
    await page.locator('.btn.primary.big').click();
    await page.getByText('Sua vez').waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${out}/pieces-${skin}.png` });
  });
}
