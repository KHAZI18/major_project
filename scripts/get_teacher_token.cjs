const path = require('path');
const serverNodeModules = path.resolve(__dirname, '..', 'server', 'node_modules');
const dotenv = require(path.join(serverNodeModules, 'dotenv'));
const mongoose = require(path.join(serverNodeModules, 'mongoose'));
const jwt = require(path.join(serverNodeModules, 'jsonwebtoken'));

dotenv.config({ path: path.resolve(__dirname, '..', 'server', '.env') });

const uri = process.env.MONGODB_URI;
const secret = process.env.JWT_SECRET || 'village_secret_key_123_math_village_premium_key';

if (!uri) {
  console.error('MONGODB_URI not set in server/.env');
  process.exit(1);
}

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  grade: Number,
  avatar: String,
  createdAt: Date
});

const ProgressSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  xp: Number,
  coins: Number,
  level: Number,
  streak: Number,
  lastActive: Date,
  history: Array,
  achievements: Array,
  updatedAt: Date
});

const User = mongoose.model('TmpUser', UserSchema, 'users');
const Progress = mongoose.model('TmpProgress', ProgressSchema, 'progresses');

async function run() {
  await mongoose.connect(uri, { dbName: 'math_village' });
  console.log('Connected to Mongo');

  let teacher = await User.findOne({ role: 'teacher' }).lean();
  if (!teacher) {
    teacher = await User.create({ name: 'Dev Teacher', email: `dev.teacher.${Date.now()}@example.com`, password: 'x', role: 'teacher', grade: 0 });
    console.log('Created test teacher:', teacher.email);
  }

  const token = jwt.sign({ id: teacher._id }, secret);
  console.log('TEACHER_TOKEN=' + token);
  console.log('TEACHER_ID=' + teacher._id);
  console.log('TEACHER_NAME=' + teacher.name);

  const student = await User.findOne({ role: 'student' }).lean();
  if (student) {
    const progress = await Progress.findOne({ userId: student._id }).lean();
    console.log('Sample student:', { name: student.name, email: student.email, progressSample: progress ? { xp: progress.xp, history: (progress.history||[]).slice(0,3) } : null });
  } else {
    console.log('No student documents found to sample.');
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
