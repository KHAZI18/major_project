import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Progress } from './models.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Auth Middleware
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
    const { xp, coins, level, streak, history, achievements } = req.body;
    const progress = await Progress.findOneAndUpdate(
      { userId: req.userId },
      { xp, coins, level, streak, history, achievements, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    res.send(progress);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

app.get('/api/teacher/students', auth, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' });
    const studentData = await Promise.all(students.map(async (s) => {
      const p = await Progress.findOne({ userId: s._id });
      return { ...s._doc, progress: p };
    }));
    res.send(studentData);
  } catch (e) {
    res.status(500).send();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));