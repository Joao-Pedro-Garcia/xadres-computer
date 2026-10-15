import { test } from '@playwright/test';
import { boot } from './helpers';

// Capturas com as configurações padrão num celular (sem asserções). Executar com SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'somente com SCREENSHOTS=1');
const out = process.env.SCREENSHOTS_DIR || 'screenshots';
test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 860 }, deviceScaleFactor: 2.6 });

test('celular com configurações padrão', async ({ page }) => {
  await boot(page, { settings: { quality: 'auto', particles: 'full', animations: 'full', reduceMotion: false, cameraMotion: true, shadows: true } });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/default-menu.png` });
  await page.locator('.menu-item.accent').click();
  await page.locator('.btn.primary.big').click();
  await page.getByText('Sua vez').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/default-game.png` });
});
