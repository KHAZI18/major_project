import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, Progress } from '../models.js';

let mongod;
let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Progress.deleteMany({});
});

async function makeStudent() {
  const user = await User.create({
    name: 'Asha', email: `asha${Math.random()}@x.com`,
    password: 'hash', role: 'student',
  });
  await Progress.create({ userId: user._id });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  return { user, token };
}

describe('POST /api/sync', () => {
  it('persists masteryState and interactionLog (MASTERY_UPDATE payload)', async () => {
    const { user, token } = await makeStudent();
    const masteryState = {
      belief: { addition: 0.81 },
      attempts: { addition: 30 },
      lastPracticed: {}, review: {},
    };
    const interactionLog = [
      { skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1 },
    ];

    const res = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ masteryState, interactionLog });

    expect(res.status).toBe(200);
    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.masteryState.belief.addition).toBeCloseTo(0.81, 5);
    expect(saved.interactionLog[0].skillId).toBe('addition');
  });

  it('still works for a GAME_SESSION payload (no mastery fields)', async () => {
    const { user, token } = await makeStudent();
    const res = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ xp: 500, coins: 50, level: 3, streak: 2, history: [], achievements: ['first'] });

    expect(res.status).toBe(200);
    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.xp).toBe(500);
    expect(saved.achievements).toEqual(['first']);
  });

  it('does NOT wipe mastery when a later GAME_SESSION sync omits it', async () => {
    const { user, token } = await makeStudent();
    // First: a mastery sync.
    await request(app).post('/api/sync').set('Authorization', `Bearer ${token}`)
      .send({ masteryState: { belief: { addition: 0.9 }, attempts: { addition: 5 } } });
    // Then: a game-session sync with no mastery fields.
    await request(app).post('/api/sync').set('Authorization', `Bearer ${token}`)
      .send({ xp: 999 });

    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.xp).toBe(999);
    expect(saved.masteryState.belief.addition).toBeCloseTo(0.9, 5); // preserved
  });

  it('rejects an unauthenticated sync', async () => {
    const res = await request(app).post('/api/sync').send({ xp: 1 });
    expect(res.status).toBe(401);
  });
});
