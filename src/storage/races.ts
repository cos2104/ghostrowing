import type { RaceResult } from '../race/engine';
import type { SourceKind } from '../rower/types';

export interface SavedRace extends RaceResult {
  id: string;
  createdAt: number;
  source: SourceKind;
  name: string;
}

const DB_NAME = 'ghostrowing';
const STORE = 'races';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('bySourceDistance', ['source', 'distance']);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRace(race: Omit<SavedRace, 'id' | 'createdAt'>): Promise<SavedRace> {
  const saved: SavedRace = { ...race, id: crypto.randomUUID(), createdAt: Date.now() };
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await wrap(tx.objectStore(STORE).put(saved));
  return saved;
}

export async function listRaces(source: SourceKind, distance: number): Promise<SavedRace[]> {
  const db = await openDb();
  const idx = db.transaction(STORE).objectStore(STORE).index('bySourceDistance');
  return wrap(idx.getAll([source, distance]) as IDBRequest<SavedRace[]>);
}

/** 같은 입력 방식·거리 중 최고 기록 (고스트) */
export async function getBest(source: SourceKind, distance: number): Promise<SavedRace | null> {
  const all = await listRaces(source, distance);
  return all.reduce<SavedRace | null>((best, r) => (!best || r.finishMs < best.finishMs ? r : best), null);
}

/** 테스트용: 연결 초기화 */
export function _resetDbForTests() {
  dbPromise = null;
}
