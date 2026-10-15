import type { PieceSymbol, PowerId } from './types';

/**
 * Tabela de balanceamento. Todos os números de jogo ficam aqui para que possam
 * ser ajustados após simulações sem tocar na lógica.
 */
export const ENERGY = {
  max: 200,
  start: 20,
  perTurn: 10,
  captureBonus: 15,
} as const;

export interface PowerSpec {
  id: PowerId;
  piece: PieceSymbol;
  cost: number;
  /** Alcance (distância de Chebyshev) quando aplicável. */
  range: number;
  /** Duração em plies (meios-lances) para efeitos persistentes. 0 = instantâneo. */
  durationPlies: number;
  endsTurn: boolean;
}

export const POWERS: Record<PowerId, PowerSpec> = {
  // Rei — Escudo Real: zona antimagia de raio 2 ao redor do rei até o fim do próximo turno adversário.
  royalShield: { id: 'royalShield', piece: 'k', cost: 40, range: 2, durationPlies: 2, endsTurn: false },
  // Rainha — Passo Arcano: teleporte para casa vazia a até 3 casas, sem capturar.
  arcaneStep: { id: 'arcaneStep', piece: 'q', cost: 80, range: 3, durationPlies: 0, endsTurn: true },
  // Torre — Muralha: zona antimagia 3x3 fixa ao redor da torre por 2 turnos adversários.
  wall: { id: 'wall', piece: 'r', cost: 60, range: 1, durationPlies: 4, endsTurn: false },
  // Bispo — Visão Mística: revela ameaças reais por este turno e pelo próximo turno próprio.
  mysticVision: { id: 'mysticVision', piece: 'b', cost: 40, range: 3, durationPlies: 3, endsTurn: false },
  // Cavalo — Salto Fantasma: salto para casa vazia a até 2 casas que não seja um salto normal.
  phantomLeap: { id: 'phantomLeap', piece: 'n', cost: 60, range: 2, durationPlies: 0, endsTurn: true },
  // Peão — Impulso: avança 2 casas fora da fileira inicial, sem capturar e sem promover.
  surge: { id: 'surge', piece: 'p', cost: 40, range: 2, durationPlies: 0, endsTurn: true },
};

export const POWER_BY_PIECE: Record<PieceSymbol, PowerId> = {
  k: 'royalShield',
  q: 'arcaneStep',
  r: 'wall',
  b: 'mysticVision',
  n: 'phantomLeap',
  p: 'surge',
};

/** Máximo de muralhas simultâneas por jogador. */
export const MAX_WALLS = 1;

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};
