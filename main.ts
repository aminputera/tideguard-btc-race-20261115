import { runBars } from './vendor/makefun-bars.ts';
import { Tideguard } from './strategy.ts';

const strategy = new Tideguard();
await runBars({ onBatch: (state, batch) => strategy.decide(state, batch) });
