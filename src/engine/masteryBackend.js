// Resolves the active mastery backend from the feature flag and presents ONE
// uniform interface to engineAPI. Both backends export the same three functions;
// only DKT needs an async model load, abstracted behind ensureBackendReady().
import { MASTERY_BACKEND } from './backendConfig';
import * as bkt from './masteryModel';
import * as dkt from './masteryModelDKT';

export const activeBackend = MASTERY_BACKEND === 'dkt' ? dkt : bkt;

/** Idempotent readiness hook. No-op for BKT; loads the model for DKT. */
export async function ensureBackendReady() {
  if (MASTERY_BACKEND === 'dkt' && typeof dkt.loadModel === 'function') {
    await dkt.loadModel();
  }
}
