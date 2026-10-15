import { MAX_WALLS, POWERS } from '../balance';
import { squaresWithin } from '../squares';
import type { UtilityPowerModule } from './types';

/** Torre — Muralha: zona antimagia 3×3 fixa ao redor da torre. */
export const wall: UtilityPowerModule = {
  kind: 'utility',
  id: 'wall',
  spec: POWERS.wall,
  alreadyActive: (state, color) => state.zones.filter((z) => z.kind === 'wall' && z.owner === color).length >= MAX_WALLS,
  activate(next, color, from) {
    const squares = squaresWithin(from, POWERS.wall.range);
    next.zones.push({ id: next.nextZoneId++, kind: 'wall', owner: color, squares, createdAtPly: next.ply, expiresAtPly: next.ply + POWERS.wall.durationPlies });
    return squares;
  },
};
