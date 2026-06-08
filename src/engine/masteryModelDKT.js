// Layer 2 alternative backend: Deep Knowledge Tracing (TF.js, inference only).
// Exports the SAME three functions as masteryModel.js (BKT) so it drops into
// engineAPI via the backend flag. Belief is sequence-based (the LSTM needs
// history), but the public read (getMastery) is still a scalar in [0,1].
//
// Dimensions derive from SKILL_IDS (13 skills): input 2*13=26, output 13.
import * as tf from '@tensorflow/tfjs';
import { SKILL_IDS } from './knowledgeGraph';

export const NUM_SKILLS = SKILL_IDS.length; // 13
export const INPUT_DIM = 2 * NUM_SKILLS;    // 26
export const SEQ_LEN = 50;                  // spec §5.1
export const PRIOR = 0.2;                   // cold-start mastery (matches BKT pL0)

// Default model location (tfjs LayersModel). public/ is served at the web root.
const DEFAULT_MODEL_URL = '/models/dkt/model.json';

let _model = null;        // loaded tf.LayersModel (singleton)
let _loadPromise = null;  // de-dupe concurrent loads

// Test seam: inject a fake model (see masteryModelDKT.test.js).
export function __setModelForTest(model) {
  _model = model;
}

/** Load the tfjs model once. Call from initEngine when the DKT flag is on. */
export async function loadModel(url = DEFAULT_MODEL_URL) {
  if (_model) return _model;
  if (!_loadPromise) {
    _loadPromise = tf.loadLayersModel(url).then((m) => {
      _model = m;
      return m;
    });
  }
  return _loadPromise;
}

const skillIndex = (skillId) => SKILL_IDS.indexOf(skillId);

/**
 * One-hot the (skill, correct) pair. LOCKED convention (data-producer plan,
 * schema.dkt_input_index): hot index = skillIndex*2 + (correct ? 1 : 0).
 * Even slot = answered-incorrectly, odd slot = answered-correctly.
 */
export function encodeInteraction(skillId, correct) {
  const v = new Float32Array(INPUT_DIM);
  const idx = skillIndex(skillId);
  if (idx >= 0) v[idx * 2 + (correct ? 1 : 0)] = 1;
  return v;
}

/** Cold-start belief: empty interaction sequence, no cached prediction. */
export function createInitialBelief() {
  return { seq: [], cache: null };
}

/**
 * Append an interaction; return a NEW belief (immutable, like BKT).
 * Sliding window capped at the last SEQ_LEN interactions.
 */
export function updateBelief(belief, skillId, correct) {
  const prev = belief?.seq ?? [];
  const seq = [...prev, { skill: skillId, correct: !!correct }].slice(-SEQ_LEN);
  return { seq, cache: null }; // cache invalidated; recomputed lazily on read
}

/**
 * Per-skill P(correct) for the LATEST timestep, in [0,1].
 * Returns PRIOR on cold start or if the model isn't loaded yet (graceful
 * degradation — engineAPI loads the model in initEngine before first read).
 */
export function getMastery(belief, skillId) {
  const seq = belief?.seq ?? [];
  if (seq.length === 0 || !_model) return PRIOR;

  if (!belief.cache) belief.cache = _runInference(seq); // memoize on the belief
  const idx = skillIndex(skillId);
  if (idx < 0) return PRIOR;
  const m = belief.cache[idx];
  // Clamp defensively so the contract guarantee (value in [0,1]) always holds.
  return Math.min(1, Math.max(0, m));
}

/** Run one forward pass over the padded sequence; return the last row (length NUM_SKILLS). */
function _runInference(seq) {
  // Build a (1, SEQ_LEN, INPUT_DIM) padded buffer (right-aligned newest-last).
  const buf = new Float32Array(SEQ_LEN * INPUT_DIM); // zeros = padding
  const start = SEQ_LEN - seq.length;                // left-pad
  for (let i = 0; i < seq.length; i++) {
    const v = encodeInteraction(seq[i].skill, seq[i].correct);
    buf.set(v, (start + i) * INPUT_DIM);
  }
  const lastReal = SEQ_LEN - 1; // newest interaction sits at the last slot

  return tf.tidy(() => {
    const input = tf.tensor3d(buf, [1, SEQ_LEN, INPUT_DIM]);
    const out = _model.predict(input);          // (1, SEQ_LEN, NUM_SKILLS)
    const rows = out.arraySync()[0];             // SEQ_LEN x NUM_SKILLS
    return rows[lastReal];                       // length NUM_SKILLS
  });
}
