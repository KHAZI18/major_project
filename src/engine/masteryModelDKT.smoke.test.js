import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MODEL_PATH = resolve(process.cwd(), 'public/models/dkt/model.json');
const hasModel = existsSync(MODEL_PATH);

// Skip gracefully if no artifact has been exported yet (keeps CI green pre-data).
describe.skipIf(!hasModel)('masteryModelDKT — real model smoke test', () => {
  it('loads the exported tfjs model and infers a value in [0,1]', async () => {
    const mod = await import('./masteryModelDKT');
    // tf.loadLayersModel accepts a file:// URL under Node.
    await mod.loadModel(pathToFileURL(MODEL_PATH).href);
    let b = mod.createInitialBelief();
    b = mod.updateBelief(b, 'addition', true);
    b = mod.updateBelief(b, 'addition', true);
    const m = mod.getMastery(b, 'addition');
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
});
