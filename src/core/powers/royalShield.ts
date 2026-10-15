import { POWERS } from '../balance';
import { zoneSquares } from '../zones';
import type { Zone } from '../types';
import type { UtilityPowerModule } from './types';

/** Rei — Escudo Real: zona antimagia que acompanha o rei até o fim do próximo turno adversário. */
export const royalShield: UtilityPowerModule = {
  kind: 'utility',
  id: 'royalShield',
  spec: POWERS.royalShield,
  alreadyActive: (state, color) => state.zones.some((z) => z.kind === 'shield' && z.owner === color),
  activate(next, color, _from, chess) {
    const zone: Zone = { id: next.nextZoneId++, kind: 'shield', owner: color, squares: [], createdAtPly: next.ply, expiresAtPly: next.ply + POWERS.royalShield.durationPlies };
    next.zones.push(zone);
    return zoneSquares(next, zone, chess);
  },
};
