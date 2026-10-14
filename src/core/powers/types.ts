import type { Chess } from 'chess.js';
import type { PowerSpec } from '../balance';
import type { Color, GameState, MovementPowerId, Square, UtilityPowerId } from '../types';

/** Poder de movimento: move a peça para uma casa vazia e encerra o turno. */
export interface MovementPowerModule {
  kind: 'movement';
  id: MovementPowerId;
  spec: PowerSpec;
  /** Símbolo usado na notação dos lances. */
  symbol: string;
  /** Destinos geométricos possíveis (antes de zonas antimagia e segurança do rei). */
  rawTargets(chess: Chess, from: Square): Square[];
}

/** Poder de suporte: cria um efeito sem mover peças e sem encerrar o turno. */
export interface UtilityPowerModule {
  kind: 'utility';
  id: UtilityPowerId;
  spec: PowerSpec;
  /** Pré-condição específica: o efeito já está ativo / no limite para este jogador? */
  alreadyActive(state: GameState, color: Color): boolean;
  /** Aplica o efeito ao novo estado (já clonado). Retorna as casas afetadas, para a animação. */
  activate(next: GameState, color: Color, from: Square, chess: Chess): Square[];
}

export type PowerModule = MovementPowerModule | UtilityPowerModule;
