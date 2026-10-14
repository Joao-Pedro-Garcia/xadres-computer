import type { PowerId } from '../types';
import { arcaneStep } from './arcaneStep';
import { mysticVision } from './mysticVision';
import { phantomLeap } from './phantomLeap';
import { royalShield } from './royalShield';
import { surge } from './surge';
import type { PowerModule } from './types';
import { wall } from './wall';

/** Registro de habilidades: para adicionar um poder, crie um módulo e registre aqui. */
export const POWER_MODULES: Record<PowerId, PowerModule> = {
  royalShield,
  arcaneStep,
  wall,
  mysticVision,
  phantomLeap,
  surge,
};

export { computeVision, type VisionInfo } from './mysticVision';
export type { MovementPowerModule, PowerModule, UtilityPowerModule } from './types';
