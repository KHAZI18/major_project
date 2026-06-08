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

async function makeTeacherToken() {
  const t = await User.create({
    name: 'Teach', email: `t${Math.random()}@x.com`,
    password: 'hash', role: 'teacher',
  });
  return jwt.sign({ id: t._id }, process.env.JWT_SECRET);
}

// A valid JWT for a STUDENT — used to prove requireTeacher rejects non-teachers (403).
async function makeStudentToken() {
  const s = await User.create({
    name: 'Pupil', email: `p${Math.random()}@x.com`,
    password: 'hash', role: 'student',
  });
  return jwt.sign({ id: s._id }, process.env.JWT_SECRET);
}

async function seedStudent(name, masteryState) {
  const u = await User.create({
    name, email: `${name}${Math.random()}@x.com`,
    password: 'hash', role: 'student',
  });
  await Progress.create({ userId: u._id, masteryState });
  return u;
}

describe('GET /api/teacher/class-mastery', () => {
  it('returns [{ id, name, attempts, mastery }] with attempts summed and only attempted skills', async () => {
    const token = await makeTeacherToken();
    await seedStudent('Asha', {
      belief: { addition: 0.81, subtraction: 0.64, multiplication: 0.2 },
      attempts: { addition: 30, subtraction: 12 }, // multiplication NOT attempted
      lastPracticed: {}, review: {},
    });

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const row = res.body[0];
    expect(row).toHaveProperty('id');
    expect(row.name).toBe('Asha');
    expect(row.attempts).toBe(42);                 // 30 + 12 (scalar total)
    expect(row.mastery.addition).toBeCloseTo(0.81, 5);
    expect(row.mastery.subtraction).toBeCloseTo(0.64, 5);
    expect(row.mastery).not.toHaveProperty('multiplication'); // belief present but 0 attempts
  });

  it('returns attempts:0 and mastery:{} for a student with no masteryState', async () => {
    const token = await makeTeacherToken();
    await seedStudent('Newbie', undefined); // Progress created, masteryState defaults to {}

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.name === 'Newbie');
    expect(row.attempts).toBe(0);
    expect(row.mastery).toEqual({});
  });

  it('excludes teachers and is the right length for the class', async () => {
    const token = await makeTeacherToken(); // a teacher exists
    await seedStudent('A', { belief: { addition: 0.5 }, attempts: { addition: 1 } });
    await seedStudent('B', { belief: { addition: 0.6 }, attempts: { addition: 2 } });

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2); // only students, not the teacher
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/teacher/class-mastery');
    expect(res.status).toBe(401);
  });

  it('rejects a non-teacher (valid student JWT) with 403', async () => {
    const studentToken = await makeStudentToken();
    // Seed another student so there is data the student must NOT be able to read.
    await seedStudent('Asha', { belief: { addition: 0.81 }, attempts: { addition: 30 } });

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    // And no class data leaks in the 403 body.
    expect(Array.isArray(res.body)).toBe(false);
  });
});
