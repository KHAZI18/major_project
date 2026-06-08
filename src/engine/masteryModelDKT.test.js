import { describe, it, expect, beforeEach } from 'vitest';
import { SKILL_IDS } from './knowledgeGraph';
import {
  NUM_SKILLS,
  INPUT_DIM,
  SEQ_LEN,
  encodeInteraction,
  createInitialBelief,
  updateBelief,
  getMastery,
  __setModelForTest,
} from './masteryModelDKT';

// A fake tf.LayersModel whose predict() returns a known per-skill vector that
// depends on how many CORRECT interactions the sequence holds — enough to test
// "rises after correct, falls after incorrect" without training a real net.
function makeFakeModel() {
  return {
    predict(inputTensor) {
      // inputTensor is a tf.Tensor of shape [1, SEQ_LEN, INPUT_DIM].
      const data = inputTensor.dataSync(); // Float32Array length SEQ_LEN*INPUT_DIM
      // LOCKED one-hot convention: hot index = skill_idx*2 + correct, so a CORRECT
      // interaction is an ODD hot index; an incorrect one is EVEN.
      let correctCount = 0;
      let lastReal = -1;
      for (let t = 0; t < SEQ_LEN; t++) {
        const base = t * INPUT_DIM;
        let isReal = false;
        for (let k = 0; k < INPUT_DIM; k++) {
          if (data[base + k] === 1) {
            isReal = true;
            if (k % 2 === 1) correctCount += 1; // odd index == answered-correctly
          }
        }
        if (isReal) lastReal = t;
      }
      // Map correctCount -> a probability in (0,1), monotone increasing.
      const p = 1 / (1 + Math.exp(-(correctCount - 1)));
      return {
        // getMastery reads [0, lastReal, skillIndex]; provide arraySync().
        arraySync: () => {
          const seq = [];
          for (let t = 0; t < SEQ_LEN; t++) {
            const row = new Array(NUM_SKILLS).fill(p);
            seq.push(row);
          }
          return [seq];
        },
        _lastReal: lastReal,
        dispose() {},
      };
    },
  };
}

describe('masteryModelDKT — dims', () => {
  it('derives 26-dim input and 13-dim output from SKILL_IDS (not 24/12)', () => {
    expect(NUM_SKILLS).toBe(SKILL_IDS.length);
    expect(NUM_SKILLS).toBe(13);
    expect(INPUT_DIM).toBe(26);
    expect(SEQ_LEN).toBe(50);
  });

  it('encodes (skill, correct) with the LOCKED one-hot convention idx*2 + correct', () => {
    const idx = SKILL_IDS.indexOf('addition');
    const v = encodeInteraction('addition', true);
    expect(v).toHaveLength(INPUT_DIM);
    expect(v[idx * 2 + 1]).toBe(1);            // correct -> odd slot
    expect(v.reduce((a, b) => a + b, 0)).toBe(1);
    const w = encodeInteraction('addition', false);
    expect(w[idx * 2 + 0]).toBe(1);            // incorrect -> even slot
  });

  it('encodeInteraction matches the data-producer dkt_input_idx for every skill', () => {
    SKILL_IDS.forEach((sid, idx) => {
      expect(encodeInteraction(sid, false).indexOf(1)).toBe(idx * 2 + 0);
      expect(encodeInteraction(sid, true).indexOf(1)).toBe(idx * 2 + 1);
    });
  });
});

describe('masteryModelDKT — backend contract parity with BKT', () => {
  beforeEach(() => __setModelForTest(makeFakeModel()));

  it('cold start returns the prior 0.2 for every skill (matches BKT pL0)', () => {
    const b = createInitialBelief();
    expect(getMastery(b, 'addition')).toBeCloseTo(0.2, 5);
  });

  it('mastery rises after a correct answer', () => {
    let b = createInitialBelief();
    const before = getMastery(b, 'addition');
    b = updateBelief(b, 'addition', true);
    const after = getMastery(b, 'addition');
    expect(after).toBeGreaterThan(before);
  });

  it('mastery falls (relative to all-correct) after an incorrect answer', () => {
    let correct = updateBelief(createInitialBelief(), 'addition', true);
    correct = updateBelief(correct, 'addition', true);
    let mixed = updateBelief(createInitialBelief(), 'addition', true);
    mixed = updateBelief(mixed, 'addition', false);
    expect(getMastery(mixed, 'addition')).toBeLessThan(getMastery(correct, 'addition'));
  });

  it('always returns a value in [0,1]', () => {
    let b = createInitialBelief();
    for (let i = 0; i < 60; i++) b = updateBelief(b, 'addition', i % 2 === 0);
    const m = getMastery(b, 'addition');
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });

  it('does not mutate the input belief (immutability, like BKT)', () => {
    const b = createInitialBelief();
    updateBelief(b, 'addition', true);
    expect(b.seq).toHaveLength(0);
  });

  it('caps the sequence window at SEQ_LEN interactions', () => {
    let b = createInitialBelief();
    for (let i = 0; i < SEQ_LEN + 10; i++) b = updateBelief(b, 'addition', true);
    expect(b.seq.length).toBe(SEQ_LEN);
  });
});
