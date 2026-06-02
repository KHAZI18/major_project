// Teacher-side pure helpers over the class payload. Imports only labels from the graph.
import { SKILL_IDS } from './knowledgeGraph';

export const WEAKNESS_THRESHOLD = 0.5; // class-mean mastery below this == weak skill

// Mean over the skills a student has actually practiced (sparse map). 0 if none.
export function meanPracticedMastery(mastery = {}) {
  const vals = Object.values(mastery);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Replaces the old `xp > 5000 ? 'excellent' : ...` rule with a mastery rule.
export function statusFromMastery(mastery = {}) {
  if (Object.keys(mastery).length === 0) return 'at_risk';
  const m = meanPracticedMastery(mastery);
  if (m >= 0.75) return 'excellent';
  if (m >= 0.5) return 'good';
  if (m >= 0.3) return 'needs_review';
  return 'at_risk';
}

// students x skills grid. cells[i] is the student's mastery for skills[i], or null.
export function buildHeatmapMatrix(students, skills = SKILL_IDS) {
  return {
    skills,
    rows: students.map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      cells: skills.map((sk) => (s.mastery?.[sk] != null ? s.mastery[sk] : null)),
    })),
  };
}

// Count how many students have practiced each skill (for minLearners gating).
export function learnerCounts(students, skills = SKILL_IDS) {
  const counts = {};
  for (const sk of skills) counts[sk] = 0;
  for (const s of students) {
    for (const sk of skills) {
      if (s.mastery?.[sk] != null) counts[sk] += 1;
    }
  }
  return counts;
}

// Skills whose class-mean mastery (perSkill) is below threshold, weakest first.
export function weakSkills(perSkill, counts = {}, threshold = WEAKNESS_THRESHOLD, minLearners = 1) {
  return Object.entries(perSkill)
    .filter(([id, mean]) => mean > 0 && mean < threshold && (counts[id] ?? 0) >= minLearners)
    .map(([id, mean]) => ({ skillId: id, mean, learners: counts[id] ?? 0 }))
    .sort((a, b) => a.mean - b.mean);
}

// Human label: 'fractions-basic' -> 'Fractions Basic'.
export function skillLabel(skillId) {
  return String(skillId)
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export { SKILL_IDS };
