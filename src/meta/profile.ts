import type { Color, Difficulty, GameResult, PowerId } from '../core/types';
import { CATALOG, catalogItem, type ItemCategory } from './catalog';

export interface Stats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  checkmates: number;
  winsByDifficulty: Record<Difficulty, number>;
  powersUsed: Partial<Record<PowerId, number>>;
  captures: number;
  promotions: number;
  winStreak: number;
  bestStreak: number;
}

export interface Profile {
  version: 1;
  xp: number;
  coins: number;
  owned: string[];
  equipped: Record<ItemCategory, string>;
  achievements: Record<string, number>;
  stats: Stats;
  rewardedGames: string[];
  levelLog: { level: number; at: number }[];
}

export function newProfile(): Profile {
  return {
    version: 1,
    xp: 0,
    coins: 0,
    owned: CATALOG.filter((i) => !i.unlock.coins && !i.unlock.level && !i.unlock.achievement).map((i) => i.id),
    equipped: { theme: 'theme:classicRoyal', pieces: 'pieces:ivoryEbony', trail: 'trail:arcaneSpark', capture: 'capture:standard' },
    achievements: {},
    stats: {
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      checkmates: 0,
      winsByDifficulty: { easy: 0, medium: 0, hard: 0, master: 0 },
      powersUsed: {},
      captures: 0,
      promotions: 0,
      winStreak: 0,
      bestStreak: 0,
    },
    rewardedGames: [],
    levelLog: [{ level: 1, at: Date.now() }],
  };
}

/** Completa perfis salvos por versões anteriores com campos novos. */
export function migrateProfile(v: Profile): Profile {
  const base = newProfile();
  return {
    ...base,
    ...v,
    equipped: { ...base.equipped, ...v.equipped },
    stats: { ...base.stats, ...v.stats, winsByDifficulty: { ...base.stats.winsByDifficulty, ...v.stats?.winsByDifficulty } },
  };
}

export function isProfile(v: unknown): v is Profile {
  const p = v as Profile;
  return !!p && p.version === 1 && typeof p.xp === 'number' && typeof p.coins === 'number' && Array.isArray(p.owned) && !!p.stats;
}

/* ------------------------- Níveis ------------------------- */

/** XP necessário para sair de `level` e chegar ao próximo (curva ajustável). */
export function xpToNext(level: number): number {
  return Math.round(100 + 60 * Math.pow(level - 1, 1.35));
}

export function levelInfo(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

/* ------------------------- Conquistas ------------------------- */

export interface AchievementDef {
  id: string;
  xp: number;
  coins: number;
  check: (p: Profile, m?: MatchSummary) => boolean;
}

const ALL_POWERS: PowerId[] = ['royalShield', 'arcaneStep', 'wall', 'mysticVision', 'phantomLeap', 'surge'];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstGame', xp: 20, coins: 20, check: (p) => p.stats.games >= 1 },
  { id: 'firstWin', xp: 40, coins: 40, check: (p) => p.stats.wins >= 1 },
  { id: 'firstCheckmate', xp: 50, coins: 50, check: (p) => p.stats.checkmates >= 1 },
  { id: 'winMedium', xp: 60, coins: 60, check: (p) => p.stats.winsByDifficulty.medium >= 1 },
  { id: 'winHard', xp: 100, coins: 100, check: (p) => p.stats.winsByDifficulty.hard >= 1 },
  { id: 'winMaster', xp: 200, coins: 200, check: (p) => p.stats.winsByDifficulty.master >= 1 },
  { id: 'firstPower', xp: 15, coins: 15, check: (p) => Object.values(p.stats.powersUsed).some((n) => (n ?? 0) > 0) },
  { id: 'powerAdept', xp: 80, coins: 80, check: (p) => ALL_POWERS.every((k) => (p.stats.powersUsed[k] ?? 0) > 0) },
  { id: 'purist', xp: 60, coins: 60, check: (_p, m) => !!m && m.outcome === 'win' && m.playerPowers.length === 0 },
  { id: 'tenWins', xp: 150, coins: 150, check: (p) => p.stats.wins >= 10 },
  { id: 'veteran', xp: 100, coins: 100, check: (p) => p.stats.games >= 25 },
  { id: 'level5', xp: 0, coins: 150, check: (p) => levelInfo(p.xp).level >= 5 },
  { id: 'collector', xp: 80, coins: 0, check: (p) => p.owned.length >= 8 },
  { id: 'winAsBlack', xp: 50, coins: 40, check: (_p, m) => !!m && m.outcome === 'win' && m.playerColor === 'b' },
  { id: 'arcaneMate', xp: 120, coins: 100, check: (_p, m) => !!m && m.outcome === 'win' && m.arcaneMate },
  { id: 'grandArcanist', xp: 150, coins: 120, check: (_p, m) => !!m && m.outcome === 'win' && ALL_POWERS.every((k) => m.playerPowers.includes(k)) },
  { id: 'firstPromotion', xp: 30, coins: 25, check: (p) => p.stats.promotions >= 1 },
  { id: 'streak3', xp: 120, coins: 100, check: (p) => p.stats.bestStreak >= 3 },
  { id: 'level10', xp: 0, coins: 400, check: (p) => levelInfo(p.xp).level >= 10 },
];

/* ------------------------- Desafios por partida ------------------------- */

export interface ChallengeDef {
  id: string;
  xp: number;
  coins: number;
  check: (m: MatchSummary) => boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'quickWin', xp: 25, coins: 15, check: (m) => m.outcome === 'win' && m.playerMoves <= 30 },
  { id: 'arcanist', xp: 25, coins: 15, check: (m) => m.outcome === 'win' && new Set(m.playerPowers).size >= 3 },
  { id: 'noPowerWin', xp: 30, coins: 20, check: (m) => m.outcome === 'win' && m.playerPowers.length === 0 },
  { id: 'saver', xp: 15, coins: 10, check: (m) => m.outcome !== 'loss' && m.finalEnergy >= 150 },
];

/* ------------------------- Fim de partida ------------------------- */

export interface MatchSummary {
  gameId: string;
  difficulty: Difficulty;
  playerColor: Color;
  result: GameResult;
  outcome: 'win' | 'loss' | 'draw';
  plies: number;
  playerMoves: number;
  playerPowers: PowerId[];
  playerCaptures: number;
  playerPromotions: number;
  /** Xeque-mate dado por um poder de movimento do jogador. */
  arcaneMate: boolean;
  finalEnergy: number;
  undoUsed: number;
  startedAt: number;
  endedAt: number;
}

export interface RewardReport {
  granted: boolean;
  reason?: 'alreadyRewarded' | 'resigned' | 'tooShort';
  xp: number;
  coins: number;
  baseXp: number;
  baseCoins: number;
  challenges: string[];
  achievements: string[];
  levelBefore: number;
  levelAfter: number;
  levelCoins: number;
}

const WIN_XP: Record<Difficulty, number> = { easy: 40, medium: 70, hard: 110, master: 160 };
const WIN_COINS: Record<Difficulty, number> = { easy: 20, medium: 35, hard: 55, master: 80 };
export const MIN_PLIES_FOR_REWARD = 10;

export function outcomeFor(result: GameResult, player: Color): 'win' | 'loss' | 'draw' {
  if (!result.winner) return 'draw';
  return result.winner === player ? 'win' : 'loss';
}

/**
 * Aplica as recompensas de uma partida concluída. Retorna um novo perfil.
 * Idempotente por `gameId`: a mesma partida nunca é recompensada duas vezes.
 */
export function finalizeMatch(profile: Profile, m: MatchSummary): { profile: Profile; report: RewardReport } {
  const p: Profile = structuredClone(profile);
  const levelBefore = levelInfo(p.xp).level;
  const report: RewardReport = {
    granted: false,
    xp: 0,
    coins: 0,
    baseXp: 0,
    baseCoins: 0,
    challenges: [],
    achievements: [],
    levelBefore,
    levelAfter: levelBefore,
    levelCoins: 0,
  };
  if (p.rewardedGames.includes(m.gameId)) return { profile, report: { ...report, reason: 'alreadyRewarded' } };
  p.rewardedGames = [...p.rewardedGames, m.gameId].slice(-300);

  // Estatísticas registram toda partida concluída (inclusive desistência).
  p.stats.games++;
  if (m.outcome === 'win') {
    p.stats.wins++;
    p.stats.winStreak++;
    p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.winStreak);
    p.stats.winsByDifficulty[m.difficulty]++;
    if (m.result.reason === 'checkmate') p.stats.checkmates++;
  } else {
    p.stats.winStreak = 0;
    if (m.outcome === 'loss') p.stats.losses++;
    else p.stats.draws++;
  }
  p.stats.promotions += m.playerPromotions;
  for (const pw of m.playerPowers) p.stats.powersUsed[pw] = (p.stats.powersUsed[pw] ?? 0) + 1;
  p.stats.captures += m.playerCaptures;

  let xp = 0;
  let coins = 0;
  if (m.result.reason === 'resign' && m.outcome === 'loss') report.reason = 'resigned';
  else if (m.plies < MIN_PLIES_FOR_REWARD) report.reason = 'tooShort';
  else {
    report.granted = true;
    const mult = m.undoUsed > 0 ? 0.5 : 1;
    if (m.outcome === 'win') {
      xp = WIN_XP[m.difficulty];
      coins = WIN_COINS[m.difficulty];
    } else if (m.outcome === 'draw') {
      xp = Math.round(WIN_XP[m.difficulty] * 0.4);
      coins = 10;
    } else {
      xp = Math.round(WIN_XP[m.difficulty] * 0.25);
      coins = 5;
    }
    xp = Math.round(xp * mult);
    coins = Math.round(coins * mult);
    report.baseXp = xp;
    report.baseCoins = coins;
    for (const c of CHALLENGES) {
      if (c.check(m)) {
        report.challenges.push(c.id);
        xp += Math.round(c.xp * mult);
        coins += Math.round(c.coins * mult);
      }
    }
  }
  p.xp += xp;
  p.coins += coins;

  // Conquistas (podem desbloquear também por estatística acumulada).
  const unlocked = checkAchievements(p, report.granted ? m : undefined);
  for (const a of unlocked) {
    xp += a.xp;
    coins += a.coins;
  }
  report.achievements = unlocked.map((a) => a.id);

  // Recompensas de nível.
  const levelAfter = levelInfo(p.xp).level;
  for (let l = levelBefore + 1; l <= levelAfter; l++) {
    const bonus = 50 * l;
    report.levelCoins += bonus;
    p.coins += bonus;
    p.levelLog.push({ level: l, at: m.endedAt });
  }
  // Conquistas de nível podem ser liberadas pelo XP recém-ganho.
  for (const a of checkAchievements(p, undefined)) {
    report.achievements.push(a.id);
    xp += a.xp;
    coins += a.coins;
  }
  report.xp = xp;
  report.coins = coins + report.levelCoins;
  report.levelAfter = levelInfo(p.xp).level;
  return { profile: p, report };
}

/** Desbloqueia conquistas pendentes e concede suas recompensas uma única vez. */
export function checkAchievements(p: Profile, m?: MatchSummary): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (a.check(p, m)) {
      p.achievements[a.id] = Date.now();
      p.xp += a.xp;
      p.coins += a.coins;
      out.push(a);
    }
  }
  return out;
}

/* ------------------------- Loja ------------------------- */

export type PurchaseError = 'unknownItem' | 'alreadyOwned' | 'levelTooLow' | 'achievementRequired' | 'notEnoughCoins' | 'notForSale';

export function canUnlock(p: Profile, id: string): PurchaseError | null {
  const item = catalogItem(id);
  if (!item) return 'unknownItem';
  if (p.owned.includes(id)) return 'alreadyOwned';
  if (item.unlock.level && levelInfo(p.xp).level < item.unlock.level) return 'levelTooLow';
  if (item.unlock.achievement && !p.achievements[item.unlock.achievement]) return 'achievementRequired';
  if ((item.unlock.coins ?? 0) > p.coins) return 'notEnoughCoins';
  return null;
}

export function purchase(p: Profile, id: string): { ok: true; profile: Profile } | { ok: false; error: PurchaseError } {
  const err = canUnlock(p, id);
  if (err) return { ok: false, error: err };
  const item = catalogItem(id)!;
  const next = structuredClone(p);
  next.coins -= item.unlock.coins ?? 0;
  next.owned.push(id);
  checkAchievements(next);
  return { ok: true, profile: next };
}

export function equip(p: Profile, id: string): Profile | null {
  const item = catalogItem(id);
  if (!item || !p.owned.includes(id)) return null;
  const next = structuredClone(p);
  next.equipped[item.category] = id;
  return next;
}
