// Mastery-backend selector. Change this ONE value to swap the whole engine's
// mastery estimator. 'bkt' (default, pure JS, no model file) or 'dkt' (TF.js).
// Can be overridden at build time via Vite env: VITE_MASTERY_BACKEND=dkt.
const fromEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_MASTERY_BACKEND
    : undefined;

export const MASTERY_BACKEND = fromEnv === 'dkt' ? 'dkt' : 'bkt';
