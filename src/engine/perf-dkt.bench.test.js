import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MODEL_PATH = resolve(process.cwd(), 'public/models/dkt/model.json');
const hasModel = existsSync(MODEL_PATH);

// Node CPU timing is NOT the §8.3 device target; it only flags gross regressions.
describe.skipIf(!hasModel)('masteryModelDKT — inference perf (Node, indicative)', () => {
  it('infers a single attempt well under a loose Node ceiling', async () => {
    const mod = await import('./masteryModelDKT');
    await mod.loadModel(pathToFileURL(MODEL_PATH).href);

    let b = mod.createInitialBelief();
    for (let i = 0; i < SEQ_LEN_GUESS(); i++) b = mod.updateBelief(b, 'addition', i % 2 === 0);

    // Warm up (first call compiles kernels).
    mod.getMastery(b, 'addition');

    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      // bust the per-belief memo each run by appending one interaction
      b = mod.updateBelief(b, 'addition', true);
      mod.getMastery(b, 'addition');
    }
    const perCall = (performance.now() - t0) / runs;
    // Loose Node CPU ceiling (device target is < 30 ms on mobile WebGL).
    expect(perCall).toBeLessThan(200);
  });
});

function SEQ_LEN_GUESS() { return 50; }
