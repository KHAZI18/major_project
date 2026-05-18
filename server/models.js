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
    score: Number,
    xpEarned: Number,
    accuracy: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  achievements: [String],
  updatedAt: { type: Date, default: Date.now }
});

export const Progress = mongoose.model('Progress', ProgressSchema);