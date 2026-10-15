import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { simulate } from './simulate';

// Executar com `npm run simulate`. O relatório é gravado em scripts/sim-report.json.
it('simulação de balanceamento', () => {
  const report = {
    easyVsMedium: simulate(4, 'easy', 'medium'),
    mediumVsHard: simulate(2, 'medium', 'hard', 120),
  };
  writeFileSync('scripts/sim-report.json', JSON.stringify(report, null, 2));
}, 900000);
