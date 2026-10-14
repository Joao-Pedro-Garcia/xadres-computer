import { test } from '@playwright/test';
import { boot, clickSquare } from './helpers';

// Capturas de tela para revisão visual (não fazem asserções). Executar com SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'somente com SCREENSHOTS=1');
const out = process.env.SCREENSHOTS_DIR || 'screenshots';

test('capturas', async ({ page }) => {
  await boot(page, { settings: { quality: 'medium', particles: 'reduced', animations: 'full', reduceMotion: false, cameraMotion: true } });
  for (const [item, file] of [['Configurações', 'settings'], ['Conquistas', 'achievements']]) {
    await page.locator('.menu-item', { hasText: item }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${file}.png` });
    await page.locator('.back').click();
  }
  await page.locator('.menu-item', { hasText: 'Tutorial' }).click();
  await page.waitForTimeout(800);
  for (let i = 0; i < 6; i++) await page.locator('.tutorial-card .btn', { hasText: 'Avançar' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/tutorial-power.png` });
  await clickSquare(page, 'd3');
  await page.locator('.power-panel .btn.primary').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/tutorial-targets.png` });
});
