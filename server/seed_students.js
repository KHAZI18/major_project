// Seed test users (1 teacher + 20 students) with varied adaptive-engine mastery
// into the configured MongoDB (reads MONGODB_URI from the root .env when run as
// `node server/seed_students.js` from the project root).
//
// Idempotent: removes any prior @mathvillage.test test accounts (and their
// Progress) before inserting, so it can be re-run safely. It NEVER touches real
// accounts (only the @mathvillage.test domain).
//
// Writes all logins + a per-student mastery summary to ../seed-students-credentials.md
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Progress } from './models.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DOMAIN = 'mathvillage.test';
const STUDENT_PASSWORD = 'Student@123';
const TEACHER_PASSWORD = 'Teacher@123';

// 13 skills — must match src/engine/knowledgeGraph.js SKILL_IDS.
const SKILL_IDS = ['counting', 'addition', 'subtraction', 'multiplication', 'division',
  'patterns', 'fractions-basic', 'equiv-fractions', 'decimals', 'integers',
  'geometry-shapes', 'coord-geometry', 'algebra-basics'];

// Skills a student of each grade has plausibly encountered (cumulative).
const SKILLS_BY_GRADE = {
  2: ['counting', 'addition', 'subtraction'],
  3: ['counting', 'addition', 'subtraction', 'multiplication', 'patterns'],
  4: ['counting', 'addition', 'subtraction', 'multiplication', 'division', 'patterns', 'fractions-basic', 'geometry-shapes'],
  5: ['counting', 'addition', 'subtraction', 'multiplication', 'division', 'patterns', 'fractions-basic', 'equiv-fractions', 'decimals', 'integers', 'geometry-shapes'],
  6: SKILL_IDS,
};

// Deliberately-harder skills → kept lower so the teacher "weakness alerts" fire.
const HARDER = new Set(['division', 'fractions-basic', 'equiv-fractions', 'decimals', 'algebra-basics', 'coord-geometry']);

// Deterministic RNG so re-runs produce the same data.
let _seed = 20260523;
const rand = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Saanvi', 'Reyansh', 'Aadhya',
  'Krishna', 'Isha', 'Kabir', 'Myra', 'Vivaan', 'Anika', 'Aditya', 'Pari', 'Rohan', 'Navya',
  'Karthik', 'Meera'];
const LAST = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Gowda', 'Iyer', 'Das', 'Khan', 'Rao', 'Pillai'];
const AVATARS = ['🧒', '👦', '👧', '🧑', '🦸', '🧙', '👩‍🎓', '👨‍🎓'];
const GAMES = ['ArithmeticGame', 'MultiplicationMeteor', 'FractionFrenzy', 'PatternPuzzle', 'DecimalMall'];

// archetype distribution across 20 students (spread for a varied heatmap/ranking)
const ARCHETYPES = [
  'advanced', 'advanced', 'advanced', 'advanced', 'advanced',
  'average', 'average', 'average', 'average', 'average', 'average', 'average',
  'struggling', 'struggling', 'struggling', 'struggling', 'struggling',
  'average', 'advanced', 'struggling',
];
const BASE = { advanced: 0.82, average: 0.55, struggling: 0.3 };

function makeMastery(grade, archetype) {
  const base = BASE[archetype];
  const skills = SKILLS_BY_GRADE[grade] || SKILL_IDS;
  const belief = {};
  const attempts = {};
  for (const sk of skills) {
    const penalty = HARDER.has(sk) ? -0.18 : 0;
    const p = clamp(base + penalty + (rand() - 0.5) * 0.25, 0.05, 0.98);
    belief[sk] = Math.round(p * 1000) / 1000;
    attempts[sk] = ri(4, 30);
  }
  return { belief, attempts };
}

const calcLevel = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;

function makeHistory(skills) {
  const n = ri(2, 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const acc = ri(40, 98);
    out.push({
      gameId: GAMES[ri(0, GAMES.length - 1)],
      score: ri(5, 40),
      xpEarned: ri(40, 220),
      accuracy: acc,
      timestamp: new Date(Date.now() - ri(0, 6) * 86400000),
    });
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set (run from project root so root .env loads)');
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected');

  // Clean prior test accounts (only the @mathvillage.test domain).
  const prior = await User.find({ email: new RegExp(`@${TEST_DOMAIN}$`) }, '_id');
  const priorIds = prior.map((u) => u._id);
  if (priorIds.length) {
    await Progress.deleteMany({ userId: { $in: priorIds } });
    await User.deleteMany({ _id: { $in: priorIds } });
    console.log(`Removed ${priorIds.length} prior test accounts.`);
  }

  const rows = [];

  // Teacher
  const teacher = await new User({
    name: 'Class Teacher',
    email: `teacher@${TEST_DOMAIN}`,
    password: await bcrypt.hash(TEACHER_PASSWORD, 8),
    role: 'teacher',
    grade: 6,
    avatar: '👩‍🏫',
  }).save();
  await new Progress({ userId: teacher._id }).save();
  rows.push({ role: 'teacher', name: teacher.name, email: teacher.email, password: TEACHER_PASSWORD, grade: '-', archetype: '-', avg: '-', weakest: '-' });

  // Students
  for (let i = 0; i < 20; i++) {
    const grade = 2 + (i % 5);
    const archetype = ARCHETYPES[i];
    const name = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const email = `student${String(i + 1).padStart(2, '0')}@${TEST_DOMAIN}`;
    const avatar = AVATARS[i % AVATARS.length];
    const { belief, attempts } = makeMastery(grade, archetype);

    const skills = Object.keys(belief);
    const totalAttempts = Object.values(attempts).reduce((a, b) => a + b, 0);
    const avg = skills.reduce((a, s) => a + belief[s], 0) / skills.length;
    const weakest = skills.reduce((w, s) => (belief[s] < belief[w] ? s : w), skills[0]);
    const xp = Math.round(avg * totalAttempts * 60);

    const user = await new User({
      name, email, role: 'student', grade, avatar,
      password: await bcrypt.hash(STUDENT_PASSWORD, 8),
    }).save();

    await new Progress({
      userId: user._id,
      xp,
      coins: Math.round(xp / 12),
      level: calcLevel(xp),
      streak: ri(0, 14),
      lastActive: new Date(Date.now() - ri(0, 3) * 86400000),
      history: makeHistory(skills),
      achievements: avg > 0.75 ? ['first_game', 'xp_1000', 'scholar'] : ['first_game'],
      masteryState: { belief, attempts },
      interactionLog: [],
    }).save();

    rows.push({
      role: 'student', name, email, password: STUDENT_PASSWORD, grade,
      archetype, avg: avg.toFixed(2), weakest: `${weakest} (${belief[weakest].toFixed(2)})`,
    });
    console.log(`  + ${name} <${email}> grade ${grade} [${archetype}] avg=${avg.toFixed(2)}`);
  }

  // Write credentials + summary file
  const lines = [];
  lines.push('# Math Village — Seeded Test Accounts');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`DB: Atlas cluster from root .env  |  Test domain: @${TEST_DOMAIN}`);
  lines.push('');
  lines.push('> These are seed/test accounts. Re-running the seed deletes & recreates only @' + TEST_DOMAIN + ' accounts.');
  lines.push('');
  lines.push('## How to verify the ML is working');
  lines.push('1. Start app: `npm run server` (backend :4200) + `npm run dev` (frontend :5173).');
  lines.push('2. Log in as the **teacher** below → open the Teacher Dashboard.');
  lines.push('3. You should see all 20 students populate:');
  lines.push('   - **Mastery heatmap** — a gradient (advanced students green, struggling red).');
  lines.push('   - **Weakness alerts** — should flag fractions/division/decimals/algebra (seeded lower class-wide).');
  lines.push('   - **Fair-rank table** — advanced students rank above struggling ones (mastery-aware, not raw XP).');
  lines.push('   - **XP roster** — statuses derived from mastery.');
  lines.push('4. Cross-check against the per-student `avg mastery` / `weakest skill` columns below.');
  lines.push('');
  lines.push('## Logins');
  lines.push('');
  lines.push('| # | Role | Name | Email | Password | Grade | Profile | Avg mastery | Weakest skill |');
  lines.push('|---|------|------|-------|----------|-------|---------|-------------|----------------|');
  rows.forEach((r, idx) => {
    lines.push(`| ${idx} | ${r.role} | ${r.name} | ${r.email} | ${r.password} | ${r.grade} | ${r.archetype} | ${r.avg} | ${r.weakest} |`);
  });
  lines.push('');
  const outPath = path.resolve(__dirname, '..', 'seed-students-credentials.md');
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`\n📄 Credentials + verification guide written to: ${outPath}`);
  console.log(`\nTeacher login: teacher@${TEST_DOMAIN} / ${TEACHER_PASSWORD}`);
  console.log(`All 20 students password: ${STUDENT_PASSWORD}`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
