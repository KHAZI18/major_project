import { openDB } from 'idb';

const DB_NAME = 'math_village_db';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Student progress store
        if (!db.objectStoreNames.contains('student_progress')) {
          db.createObjectStore('student_progress', { keyPath: 'id' });
        }
        // Sync queue for offline operations
        if (!db.objectStoreNames.contains('sync_queue')) {
          const sq = db.createObjectStore('sync_queue', {
            keyPath: 'id',
            autoIncrement: true,
          });
          sq.createIndex('by_timestamp', 'timestamp');
        }
        // Individual game sessions
        if (!db.objectStoreNames.contains('game_sessions')) {
          const gs = db.createObjectStore('game_sessions', {
            keyPath: 'sessionId',
          });
          gs.createIndex('by_game', 'gameName');
          gs.createIndex('by_date', 'date');
        }
        // Achievements / badges
        if (!db.objectStoreNames.contains('achievements')) {
          db.createObjectStore('achievements', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function saveProgress(data) {
  const db = await getDB();
  await db.put('student_progress', { id: 'local', ...data });
}

export async function loadProgress() {
  const db = await getDB();
  return db.get('student_progress', 'local');
}

// ─── Sync Queue ────────────────────────────────────────────────────────────────

export async function pushToSyncQueue(operation) {
  const db = await getDB();
  await db.add('sync_queue', {
    ...operation,
    timestamp: Date.now(),
    retries: 0,
  });
}

export async function getAllSyncQueueItems() {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'by_timestamp');
}

export async function removeSyncQueueItem(id) {
  const db = await getDB();
  await db.delete('sync_queue', id);
}

export async function incrementSyncRetry(id) {
  const db = await getDB();
  const item = await db.get('sync_queue', id);
  if (item) {
    item.retries = (item.retries || 0) + 1;
    await db.put('sync_queue', item);
  }
}

// ─── Game Sessions ─────────────────────────────────────────────────────────────

export async function saveGameSession(session) {
  const db = await getDB();
  await db.put('game_sessions', session);
}

export async function getRecentSessions(limit = 20) {
  const db = await getDB();
  const all = await db.getAllFromIndex('game_sessions', 'by_date');
  return all.reverse().slice(0, limit);
}

// ─── Achievements ──────────────────────────────────────────────────────────────

export async function saveAchievement(achievement) {
  const db = await getDB();
  await db.put('achievements', achievement);
}

export async function getAllAchievements() {
  const db = await getDB();
  return db.getAll('achievements');
}
