import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Progress } from '../models.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('ProgressSchema mastery fields', () => {
  it('defaults masteryState to {} and interactionLog to [] for legacy docs', async () => {
    const p = await Progress.create({ userId: new mongoose.Types.ObjectId() });
    expect(p.masteryState).toEqual({});
    expect(p.interactionLog).toEqual([]);
  });

  it('stores an arbitrary mastery belief map without a fixed sub-schema', async () => {
    const userId = new mongoose.Types.ObjectId();
    const masteryState = {
      belief: { addition: 0.81, subtraction: 0.64 },
      attempts: { addition: 30, subtraction: 12 },
      lastPracticed: { addition: 1716000000000 },
      review: {},
    };
    const interactionLog = [
      { skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1716000000000 },
    ];
    const p = await Progress.create({ userId, masteryState, interactionLog });
    const reloaded = await Progress.findById(p._id).lean();
    expect(reloaded.masteryState.belief.addition).toBeCloseTo(0.81, 5);
    expect(reloaded.masteryState.attempts.subtraction).toBe(12);
    expect(reloaded.interactionLog[0].skillId).toBe('addition');
    expect(reloaded.interactionLog[0].correct).toBe(true);
  });
});
