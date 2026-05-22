import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher'], required: true },
  grade: { type: Number, default: 3 },
  avatar: { type: String, default: '🧒' },
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', UserSchema);

const ProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  xp: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  history: [{
    gameId: String,
    gameName: String,
    topic: String,
    score: Number,
    xpEarned: Number,
    coinsEarned: Number,
    accuracy: Number,
    date: String,
    timestamp: { type: Date, default: Date.now }
  }],
  achievements: [String],
  // Adaptive engine (spec §7): free-form per-student mastery snapshot.
  // Stored as Mixed so the server stays agnostic to the BKT/DKT belief shape.
  masteryState: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Adaptive engine (spec §7): append-only interaction records
  // ({ skillId, correct, responseTime, timestamp }); server does not validate element shape.
  interactionLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  assignedSupport: {
    gameId: { type: String, default: null },
    topic: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    completed: { type: Boolean, default: false }
  },
  updatedAt: { type: Date, default: Date.now }
});

export const Progress = mongoose.model('Progress', ProgressSchema);