import { expect, test } from '@playwright/test';
import { applyAction, createGame } from '../src/core/game';
import { boot, clickSquare, hudAction, squarePoint, startGame, tapSquare } from './helpers';

test('navegação entre menus', async ({ page }) => {
  await boot(page);
  for (const [item, title] of [
    ['Temas', 'Temas'],
    ['Personalização', 'Personalização'],
    ['Conquistas', 'Conquistas'],
    ['Histórico', 'Histórico'],
    ['Configurações', 'Configurações'],
    ['Créditos', 'Créditos'],
  ]) {
    await page.locator('.menu-item', { hasText: item }).first().click();
    await expect(page.locator('.screen-header h2')).toHaveText(title);
    await page.locator('.back').click();
    await expect(page.locator('.menu')).toBeVisible();
  }
});

test('selecionar e mover com o mouse', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await clickSquare(page, 'e2');
  await expect(page.locator('.hud-status')).toContainText('Peão em e2 selecionado');
  await expect(page.locator('.power-name')).toHaveText('Impulso');
  await clickSquare(page, 'e4');
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.move-list li').first()).toContainText('e4');
  // A IA responde e a vez volta ao jogador.
  await expect(page.locator('.move-list .mv')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('.hud-status')).toContainText('Sua vez');
});

test.describe('toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('selecionar e mover por toque', async ({ page }) => {
    await boot(page);
    await startGame(page);
    await tapSquare(page, 'g1');
    await expect(page.locator('.hud-status')).toContainText('Cavalo em g1 selecionado');
    await tapSquare(page, 'f3');
    await page.locator('.sidebar-toggle').click();
    await expect(page.locator('.move-list li').first()).toContainText('Nf3');
  });
});

test('trocar idioma não reinicia a partida', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await clickSquare(page, 'd2');
  await clickSquare(page, 'd4');
  await expect(page.locator('.hud-status')).toContainText('Sua vez', { timeout: 60_000 });
  await hudAction(page, 'Configurações');
  await page.locator('.seg-btn', { hasText: 'English' }).click();
  await page.locator('.back').click();
  await expect(page.locator('.hud-status')).toContainText('Your turn');
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('.move-list li').first()).toContainText('d4');
  // Persistência do idioma após recarregar.
  await page.reload();
  await expect(page.locator('.menu-item.accent')).toHaveText('Continue game');
});

test('redimensionamento mantém o tabuleiro visível', async ({ page }) => {
  await boot(page);
  await startGame(page);
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    await hudAction(page, 'Restaurar câmera');
    await page.waitForTimeout(400);
    const [cw, ch] = await page.evaluate(() => (window as unknown as { __arcane: { canvasSize: () => number[] } }).__arcane.canvasSize());
    expect(cw).toBe(size.width);
    expect(ch).toBe(size.height);
    for (const sq of ['a1', 'h1', 'a8', 'h8']) {
      const p = await squarePoint(page, sq);
      expect(p.x, `${sq} @${size.width}`).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(size.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(size.height);
    }
  }
});

test('controles de câmera: girar e restaurar', async ({ page }) => {
  await boot(page);
  await startGame(page);
  const cam = () => page.evaluate(() => (window as unknown as { __arcane: { camera: () => number[] } }).__arcane.camera());
  const before = await cam();
  await page.mouse.move(640, 700);
  await page.mouse.down();
  await page.mouse.move(900, 650, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const rotated = await cam();
  expect(Math.hypot(rotated[0] - before[0], rotated[2] - before[2])).toBeGreaterThan(0.5);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  await hudAction(page, 'Restaurar câmera');
  await page.waitForTimeout(400);
  const reset = await cam();
  reset.forEach((v, i) => expect(Math.abs(v - before[i])).toBeLessThan(0.05));
});

test('XP, moedas, conquistas e histórico persistem após recarregar', async ({ page }) => {
  // Partida salva a um lance do mate (pelo menos 10 meios-lances para valer recompensa).
  let s = createGame();
  for (const [f, t] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6']]) {
    const r = applyAction(s, { kind: 'move', from: f, to: t } as never);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  await boot(page, { saved: { version: 1, state: s, difficulty: 'hard', playerColor: 'w', undoUsed: 0, startedAt: Date.now() - 60000, undoStack: [] } });
  await page.locator('.menu-item.accent').click();
  await page.getByText('Sua vez').waitFor();
  await clickSquare(page, 'h5');
  await clickSquare(page, 'f7');
  const modal = page.locator('.modal.result');
  await expect(modal).toContainText('Vitória');
  await expect(modal).toContainText('Primeiro xeque-mate');
  await modal.locator('.btn.ghost').click();
  await page.reload();
  await page.locator('.menu').waitFor();
  await expect(page.locator('.menu-footer')).not.toContainText('0/100 XP');
  await page.locator('.menu-item', { hasText: 'Conquistas' }).click();
  await expect(page.locator('.ach.done', { hasText: 'Primeiro xeque-mate' })).toBeVisible();
  await page.locator('.back').click();
  await page.locator('.menu-item', { hasText: 'Histórico' }).click();
  await page.locator('.hist.win').first().click();
  await expect(page.locator('.modal.detail')).toContainText('Xeque-mate');
  await expect(page.locator('.modal.detail .mini-board .sq')).toHaveCount(64);
  // A mesma partida não é recompensada de novo (não há partida salva para "continuar").
  await page.locator('.modal.detail .btn.primary').click();
  await page.locator('.back').click();
  await expect(page.locator('.menu-item.accent')).toHaveText('Jogar');
});

test('tutorial: oferta no primeiro acesso e exercício prático', async ({ page }) => {
  await boot(page, { fresh: true, settings: {} });
  await expect(page.locator('.modal')).toContainText('Primeira vez aqui?');
  await page.locator('.modal .btn.primary').click();
  await expect(page.locator('.tutorial-card h3')).toHaveText('Bem-vindo ao Arcane Chess');
  await page.locator('.tutorial-card .btn', { hasText: 'Avançar' }).click();
  await expect(page.locator('.tutorial-card h3')).toHaveText('Selecionar e mover');
  await clickSquare(page, 'e2');
  await clickSquare(page, 'e4');
  await expect(page.locator('.tut-task.done')).toContainText('Muito bem!', { timeout: 30_000 });
  await page.locator('.tutorial-card .btn', { hasText: 'Voltar' }).click();
  await expect(page.locator('.tutorial-card h3')).toHaveText('Bem-vindo ao Arcane Chess');
  await page.locator('.tutorial-card .btn', { hasText: 'Sair do tutorial' }).click();
  await expect(page.locator('.menu')).toBeVisible();
  // Não é oferecido de novo.
  await page.reload();
  await page.locator('.menu').waitFor();
  await expect(page.locator('.modal')).toHaveCount(0);
});

test('música: desligar, ajustar volume e manter após recarregar', async ({ page }) => {
  await boot(page);
  const playing = () => page.evaluate(() => (window as unknown as { __arcane: { musicPlaying: () => boolean } }).__arcane.musicPlaying());
  const btn = page.locator('.menu-footer .music-btn');
  await expect(btn).toHaveText('♫ Música: ligada');
  // O navegador só libera áudio após um gesto do usuário.
  expect(await playing()).toBe(false);
  await page.mouse.click(300, 300);
  await expect.poll(playing).toBe(true);
  await btn.click();
  await expect(page.locator('.menu-footer .music-btn')).toHaveText('♫ Música: desligada');
  await expect.poll(playing).toBe(false);
  await page.locator('.menu-item', { hasText: 'Configurações' }).click();
  await expect(page.locator('.setting', { hasText: 'Música' }).first().locator('.toggle')).toHaveAttribute('aria-checked', 'false');
  const vol = page.getByLabel('Volume da música');
  await vol.fill('0.2');
  await vol.dispatchEvent('change');
  await page.reload();
  await page.locator('.menu').waitFor();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arcane.settings.v1')!));
  expect(saved.music).toBe(false);
  expect(saved.musicVolume).toBeCloseTo(0.2);
  await expect(page.locator('.menu-footer .music-btn')).toHaveText('♫ Música: desligada');
});
