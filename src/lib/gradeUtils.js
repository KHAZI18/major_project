export function normalizeGrade(grade) {
  const parsed = Number(grade);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(6, Math.max(1, Math.round(parsed)));
}

export function getGradeTier(grade) {
  const normalized = normalizeGrade(grade);
  if (normalized <= 2) return 1;
  if (normalized <= 4) return 2;
  if (normalized === 5) return 3;
  return 4;
}
