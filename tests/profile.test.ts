import { describe, expect, it } from 'vitest';
import { canUnlock, equip, finalizeMatch, levelInfo, migrateProfile, newProfile, purchase, xpToNext, type MatchSummary } from '../src/meta/profile';
import { sanitizeSettings } from '../src/meta/settings';
import { validateSaved } from '../src/meta/session';
import { createGame } from '../src/core/game';

function match(over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    gameId: 'g1',
    difficulty: 'medium',
    playerColor: 'w',
    result: { winner: 'w', reason: 'checkmate' },
    outcome: 'win',
    plies: 40,
    playerMoves: 20,
    playerPowers: [],
    playerCaptures: 3,
    playerPromotions: 0,
    arcaneMate: false,
    finalEnergy: 50,
    undoUsed: 0,
    startedAt: 0,
    endedAt: 1,
    ...over,
  };
}

describe('progressão', () => {
  it('curva de níveis', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: xpToNext(1) });
    expect(levelInfo(xpToNext(1)).level).toBe(2);
  });

  it('recompensa uma única vez por partida', () => {
    const a = finalizeMatch(newProfile(), match());
    expect(a.report.granted).toBe(true);
    expect(a.profile.xp).toBeGreaterThan(0);
    expect(a.report.achievements).toContain('firstWin');
    expect(a.report.achievements).toContain('firstCheckmate');
    const b = finalizeMatch(a.profile, match());
    expect(b.report.reason).toBe('alreadyRewarded');
    expect(b.profile).toEqual(a.profile);
  });

  it('desistência e partidas curtas não rendem XP/moedas de partida', () => {
    const r = finalizeMatch(newProfile(), match({ outcome: 'loss', result: { winner: 'b', reason: 'resign' } }));
    expect(r.report.granted).toBe(false);
    expect(r.report.baseXp).toBe(0);
    const short = finalizeMatch(newProfile(), match({ gameId: 'x', plies: 4 }));
    expect(short.report.reason).toBe('tooShort');
  });

  it('desfazer reduz recompensas pela metade', () => {
    const full = finalizeMatch(newProfile(), match());
    const half = finalizeMatch(newProfile(), match({ undoUsed: 2 }));
    expect(half.report.baseXp).toBe(Math.round(full.report.baseXp / 2));
  });
});

describe('conquistas novas', () => {
  it('mate arcano, vitória de pretas e sequência de vitórias', () => {
    let p = newProfile();
    for (let i = 0; i < 3; i++) p = finalizeMatch(p, match({ gameId: `s${i}`, playerColor: i === 2 ? 'b' : 'w', result: { winner: i === 2 ? 'b' : 'w', reason: 'checkmate' }, arcaneMate: i === 1, playerPromotions: i === 0 ? 1 : 0 })).profile;
    for (const a of ['arcaneMate', 'winAsBlack', 'streak3', 'firstPromotion']) expect(p.achievements[a]).toBeTruthy();
    p = finalizeMatch(p, match({ gameId: 'l', outcome: 'loss', result: { winner: 'b', reason: 'checkmate' } })).profile;
    expect(p.stats.winStreak).toBe(0);
    expect(p.stats.bestStreak).toBe(3);
  });

  it('perfil antigo recebe campos novos', () => {
    const old = newProfile() as unknown as { stats: Record<string, unknown> };
    delete old.stats.bestStreak;
    expect(migrateProfile(old as never).stats.bestStreak).toBe(0);
  });
});

describe('loja', () => {
  it('impede saldo negativo, compra duplicada e requisitos', () => {
    let p = newProfile();
    expect(canUnlock(p, 'theme:arcaneBlue')).toBe('notEnoughCoins');
    expect(canUnlock(p, 'theme:classicRoyal')).toBe('alreadyOwned');
    expect(canUnlock(p, 'theme:arcaneFlames')).toBe('achievementRequired');
    p.coins = 1000;
    expect(canUnlock(p, 'theme:goldenRealm')).toBe('levelTooLow');
    const r = purchase(p, 'theme:arcaneBlue');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    p = r.profile;
    expect(p.coins).toBe(850);
    expect(purchase(p, 'theme:arcaneBlue').ok).toBe(false);
    expect(equip(p, 'theme:arcaneBlue')!.equipped.theme).toBe('theme:arcaneBlue');
    expect(equip(p, 'theme:cosmos')).toBeNull();
  });
});

describe('persistência', () => {
  it('configurações inválidas voltam ao padrão', () => {
    const s = sanitizeSettings({ lang: 'xx', masterVolume: 9, shadows: 'yes', quality: 'ultra' });
    expect(['pt-BR', 'en']).toContain(s.lang);
    expect(s.masterVolume).toBe(1);
    expect(typeof s.shadows).toBe('boolean');
    expect(s.quality).toBe('auto');
  });

  it('migra configurações da versão 1', () => {
    const s = sanitizeSettings({ version: 1, lang: 'en', animations: 'fast', volume: 0.3 });
    expect(s.version).toBe(2);
    expect(s.lang).toBe('en');
    expect(s.animations).toBe('full');
    expect(s.animationSpeed).toBe(2);
    expect(s.masterVolume).toBe(0.3);
    expect(s).not.toHaveProperty('volume');
  });

  it('qualidade automática escolhe pelo aparelho', async () => {
    const { resolveQuality } = await import('../src/meta/settings');
    expect(resolveQuality('auto', { coarse: true, cores: 4, dpr: 3 })).toBe('low');
    expect(resolveQuality('auto', { coarse: true, cores: 8, dpr: 3 })).toBe('medium');
    expect(resolveQuality('auto', { coarse: false, cores: 8, dpr: 1 })).toBe('high');
    expect(resolveQuality('low')).toBe('low');
  });

  it('partida salva corrompida é descartada', () => {
    expect(validateSaved({ version: 1 })).toBeNull();
    const ok = validateSaved({ version: 1, state: createGame(), difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: 0, undoStack: [] });
    expect(ok).not.toBeNull();
    const bad = createGame();
    bad.fen = 'garbage';
    expect(validateSaved({ version: 1, state: bad, difficulty: 'easy', playerColor: 'w', undoUsed: 0, startedAt: 0, undoStack: [] })).toBeNull();
  });
});

describe('progresso de conquistas', () => {
  it('mostra progresso parcial e conclui uma única vez', async () => {
    const { ACHIEVEMENTS } = await import('../src/meta/profile');
    const tenWins = ACHIEVEMENTS.find((a) => a.id === 'tenWins')!;
    let p = newProfile();
    for (let i = 0; i < 4; i++) p = finalizeMatch(p, match({ gameId: `w${i}` })).profile;
    expect(tenWins.progress(p)).toEqual({ current: 4, target: 10 });
    const strat = finalizeMatch(newProfile(), match({ gameId: 'q', playerMoves: 10 }));
    expect(strat.report.achievements).toContain('strategist');
    const again = finalizeMatch(strat.profile, match({ gameId: 'q2', playerMoves: 10 }));
    expect(again.report.achievements).not.toContain('strategist');
  });

  it('primeiro uso de cada poder', () => {
    const r = finalizeMatch(newProfile(), match({ playerPowers: ['surge', 'wall'] }));
    expect(r.report.achievements).toEqual(expect.arrayContaining(['power_surge', 'power_wall', 'firstPower']));
    expect(r.report.achievements).not.toContain('power_arcaneStep');
  });
});

describe('histórico', () => {
  it('registro completo e filtros', async () => {
    const { buildHistoryEntry, filterHistory, formatDuration } = await import('../src/meta/session');
    const g = createGame();
    const saved = { version: 1 as const, state: { ...g, result: { winner: 'w' as const, reason: 'checkmate' as const } }, difficulty: 'hard' as const, playerColor: 'w' as const, undoUsed: 0, startedAt: 1000, undoStack: [] };
    const m = match({ startedAt: 1000, endedAt: 66000, difficulty: 'hard', playerPowers: ['surge'] });
    const e = buildHistoryEntry(saved, m, finalizeMatch(newProfile(), m).report);
    expect(e.durationMs).toBe(65000);
    expect(formatDuration(e.durationMs!)).toBe('1:05');
    expect(e.finalFen).toBe(g.fen);
    expect(e.powersUsed).toEqual(['surge']);
    expect(e).not.toHaveProperty('email');
    const list = [e, { ...e, gameId: 'x', outcome: 'loss' as const, difficulty: 'easy' as const }];
    expect(filterHistory(list, { outcome: 'win', difficulty: 'all' })).toHaveLength(1);
    expect(filterHistory(list, { outcome: 'all', difficulty: 'easy' })[0].gameId).toBe('x');
  });
});
