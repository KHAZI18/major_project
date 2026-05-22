// Thin convenience over GAME_SKILLS so game pages stay one-liners and the
// multi-skill source of truth remains in knowledgeGraph.js. UI imports the
// public engine API for behavior; this is the only graph helper games need.
import { GAME_SKILLS } from './knowledgeGraph';

// All skills a game exercises (spec §4 game→skill table).
export function skillsForGame(gameName) {
  const skills = GAME_SKILLS[gameName];
  if (!skills) throw new Error(`gameSkills: unknown game "${gameName}"`);
  return skills;
}

// The primary (first) skill — used for difficulty selection and per-answer recording.
export function skillForGame(gameName) {
  return skillsForGame(gameName)[0];
}
