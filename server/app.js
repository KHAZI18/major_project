import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, Progress } from './models.js';

// Game ID to display name mapping for enriching history entries
const GAME_ID_TO_NAME = {
  'arithmetic': 'Number Ninja',
  'number-catcher': 'Number Catcher',
  'balloon-pop': 'Balloon Pop',
  'geometry': 'Shape Explorer',
  'meteor': 'Multiplication Meteor',
  'fractions': 'Fraction Frenzy',
  'farm-multiply': 'Multiplication Farm',
  'math-racing': 'Math Racing',
  'balancer': 'Equation Balancer',
  'decimal-mall': 'Decimal Mall',
  'fraction-ninja': 'Fraction Ninja',
  'patterns': 'Pattern Puzzle',
  'coordinate-treasure': 'Treasure Map',
  'integer-mountain': 'Integer Mountain',
  'algebra-dungeon': 'Algebra Dungeon',
};

function hasCompletedAssignedSupport(progress) {
  const assigned = progress?.assignedSupport;
  if (!assigned?.gameId || assigned.completed) return Boolean(assigned?.completed);

  const assignedAt = assigned.assignedAt ? new Date(assigned.assignedAt).getTime() : 0;
  const expectedName = GAME_ID_TO_NAME[assigned.gameId]?.toLowerCase();

  return (progress.history || []).some((entry) => {
    const gameId = entry.gameId;
    const gameName = entry.gameName?.toLowerCase();
    const playedAt = new Date(entry.date || entry.timestamp || 0).getTime();
    const matchesGame =
      gameId === assigned.gameId ||
      gameName === assigned.gameId.toLowerCase() ||
      (expectedName && gameName === expectedName);

    return matchesGame && (!assignedAt || !playedAt || playedAt >= assignedAt);
  });
}

function isSameSupportAssignment(a, b) {
  if (!a?.gameId || !b?.gameId) return false;
  const aAssignedAt = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
  const bAssignedAt = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
  return a.gameId === b.gameId && aAssignedAt === bAssignedAt;
}

// Factory so server.js and tests share the exact same app instance.
// Mongo connection is the caller's responsibility (server.js connects to
// the real DB; tests connect to mongodb-memory-server before calling this).
export function createApp() {
  const app = express();
  // Default mock client ID so backend doesn't crash if env is missing
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy-client-id');
  app.use(cors());
  app.use(express.json());

  // Auth Middleware (verbatim from the original server.js — verifies a valid JWT only).
  const auth = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) throw new Error();
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.id;
      next();
    } catch (e) {
      res.status(401).send({ error: 'Please authenticate.' });
    }
  };

  // Authorization Middleware (NEW — canonical cross-plan auth fix).
  // `auth` only proves the JWT is valid; it does NOT check role. The JWT payload is
  // just { id } (see signup/login), so role is not in the token and must be read from
  // the DB. Chain this AFTER `auth` so req.userId is populated. Non-teacher -> 403.
  const requireTeacher = async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(401).send({ error: 'Please authenticate.' });
      if (user.role !== 'teacher') {
        return res.status(403).send({ error: 'Teacher access required.' });
      }
      next();
    } catch (e) {
      res.status(500).send();
    }
  };

  // Routes
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password, role, grade, avatar } = req.body;
      const hashedPassword = await bcrypt.hash(password, 8);

      const user = new User({ name, email, password: hashedPassword, role, grade, avatar });
      await user.save();

      const progress = new Progress({ userId: user._id });
      await progress.save();

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.status(201).send({ user, token });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new Error('Invalid login credentials');
      }
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.status(200).send({ user, token });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    try {
      const { credential, role } = req.body;

      // Verify Google Token
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      const { email, name, picture } = payload;

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        if (!role) {
           return res.status(400).send({ error: 'Role is required for first-time Google signin' });
        }
        // Create user with a dummy password since they use Google
        const dummyPassword = await bcrypt.hash(Math.random().toString(36), 8);
        user = new User({
          name,
          email,
          password: dummyPassword,
          role: role || 'student',
          grade: 3,
          avatar: role === 'student' ? '🧒' : '👩‍🏫' // Quick default avatar
        });
        await user.save();

        const progress = new Progress({ userId: user._id });
        await progress.save();
      }

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.status(200).send({ user, token });
    } catch (e) {
      res.status(400).send({ error: 'Google authentication failed', details: e.message });
    }
  });

  app.get('/api/progress', auth, async (req, res) => {
    try {
      const progress = await Progress.findOne({ userId: req.userId });
      res.send(progress);
    } catch (e) {
      res.status(500).send();
    }
  });

  app.post('/api/sync', auth, async (req, res) => {
    try {
      // Build the update from only the fields the payload actually carries, so a
      // GAME_SESSION sync (xp/coins/...) and a MASTERY_UPDATE sync (masteryState/
      // interactionLog) can each touch their own fields without clobbering the other.
      const SYNCABLE = ['xp', 'coins', 'level', 'streak', 'history',
        'achievements', 'masteryState', 'interactionLog'];
      const update = { updatedAt: new Date() };
      for (const key of SYNCABLE) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
      }

      // Teacher-assigned remedial support: resolve completion state when the
      // payload carries assignedSupport (main's feature) before persisting.
      if (req.body.assignedSupport !== undefined) {
        const { assignedSupport, history } = req.body;
        const existingProgress = await Progress.findOne({ userId: req.userId });
        let nextAssignedSupport = assignedSupport;

        if (
          existingProgress?.assignedSupport?.completed &&
          isSameSupportAssignment(assignedSupport, existingProgress.assignedSupport)
        ) {
          nextAssignedSupport = {
            ...assignedSupport,
            completed: true,
            assignedAt: assignedSupport.assignedAt || existingProgress.assignedSupport.assignedAt,
          };
        }

        if (nextAssignedSupport?.gameId && !nextAssignedSupport.completed) {
          const progressForCheck = {
            history: history !== undefined ? history : existingProgress?.history,
            assignedSupport: nextAssignedSupport,
          };
          if (hasCompletedAssignedSupport(progressForCheck)) {
            nextAssignedSupport = { ...nextAssignedSupport, completed: true };
          }
        }

        update.assignedSupport = nextAssignedSupport;
      }

      const progress = await Progress.findOneAndUpdate(
        { userId: req.userId },
        { $set: update },
        { new: true, upsert: true }
      );
      res.send(progress);
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.delete('/api/auth/account', auth, async (req, res) => {
    try {
      // Delete user and their progress
      await User.findByIdAndDelete(req.userId);
      await Progress.findOneAndDelete({ userId: req.userId });
      res.status(200).send({ success: true, message: 'Account deleted' });
    } catch (e) {
      res.status(500).send({ error: 'Failed to delete account' });
    }
  });

  app.get('/api/teacher/students', auth, async (req, res) => {
    try {
      const students = await User.find({ role: 'student' });
      const studentData = await Promise.all(students.map(async (s) => {
        const p = await Progress.findOne({ userId: s._id });
        // Enrich history entries that are missing gameName
        if (p && Array.isArray(p.history)) {
          p.history = p.history.map(h => {
            const entry = h.toObject ? h.toObject() : { ...h };
            if (!entry.gameName && entry.gameId && GAME_ID_TO_NAME[entry.gameId]) {
              entry.gameName = GAME_ID_TO_NAME[entry.gameId];
            }
            return entry;
          });
        }
        if (p?.assignedSupport?.gameId && !p.assignedSupport.completed && hasCompletedAssignedSupport(p)) {
          p.assignedSupport.completed = true;
          p.markModified('assignedSupport');
          await p.save();
        }
        return { ...s._doc, progress: p };
      }));
      res.send(studentData);
    } catch (e) {
      res.status(500).send();
    }
  });

  app.post('/api/teacher/assign-support', auth, async (req, res) => {
    try {
      const { studentId, gameId, topic } = req.body;
      const progress = await Progress.findOneAndUpdate(
        { userId: studentId },
        {
          assignedSupport: {
            gameId,
            topic,
            assignedAt: new Date(),
            completed: false
          }
        },
        { new: true, upsert: true }
      );
      res.send(progress);
    } catch (e) {
      res.status(400).send({ error: e.message });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    try {
      // Get progress entries sorted by XP, populate user info (including role),
      // then filter to only include students in the leaderboard.
      const allProgress = await Progress.find()
        .sort({ xp: -1 })
        .populate('userId', 'name avatar grade role');

      // Keep only entries where a user exists and the user is a student
      const studentProgress = allProgress.filter(p => p.userId && p.userId.role === 'student');

      const formatted = studentProgress.slice(0, 20).map((p) => ({
        id: p.userId._id,
        name: p.userId.name,
        avatar: p.userId.avatar,
        grade: p.userId.grade,
        level: p.level,
        xp: p.xp,
        streak: p.streak
      }));

      res.send(formatted);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

  // Adaptive engine (spec §7): per-student mastery for the teacher dashboard.
  // Returns exactly the shape src/engine/engineAPI.classMastery(students) consumes:
  //   [{ id, name, attempts: <scalar>, mastery: { [skillId]: P } }]
  // The client engine computes perSkill means + fairRanking; the server only reshapes.
  // Guarded by auth (valid JWT) THEN requireTeacher (role === 'teacher', else 403).
  app.get('/api/teacher/class-mastery', auth, requireTeacher, async (req, res) => {
    try {
      const students = await User.find({ role: 'student' });
      const rows = await Promise.all(students.map(async (s) => {
        const p = await Progress.findOne({ userId: s._id }).lean();
        const ms = p?.masteryState ?? {};
        const belief = ms.belief ?? {};
        const attemptsMap = ms.attempts ?? {};

        // Scalar total attempts = sum of per-skill counts.
        const attempts = Object.values(attemptsMap)
          .reduce((sum, n) => sum + (Number(n) || 0), 0);

        // Only skills the student has actually attempted (fairRanking contract:
        // a dense prior belief map would inflate every skill's mastery).
        const mastery = {};
        for (const skillId of Object.keys(attemptsMap)) {
          if (belief[skillId] != null) mastery[skillId] = belief[skillId];
        }

        return { id: s._id, name: s.name, attempts, mastery };
      }));
      res.send(rows);
    } catch (e) {
      res.status(500).send();
    }
  });

  return app;
}
