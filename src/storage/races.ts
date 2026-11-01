import type { RaceResult } from '../race/engine';
import type { SourceKind } from '../rower/types';

export interface SavedRace extends RaceResult {
  courseId?: string;
  country?: string;
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

/** 평균 속도 (m/s) */
const speedOf = (r: SavedRace) => (r.traveledM ?? r.distance) / Math.max(1, r.finishMs / 1000);

/**
 * 같은 입력 방식·거리 중 최고 기록 (고스트).
 * 무제한(distance 0)은 1분 이상 저은 기록 중 평균 속도가 가장 빠른 것.
 */
export async function getBest(source: SourceKind, distance: number): Promise<SavedRace | null> {
  const all = await listRaces(source, distance);
  if (distance === 0) {
    return all.filter((r) => r.finishMs >= 60_000).reduce<SavedRace | null>((b, r) => (!b || speedOf(r) > speedOf(b) ? r : b), null);
  }
  return all.reduce<SavedRace | null>((best, r) => (!best || r.finishMs < best.finishMs ? r : best), null);
}

/** 이 기록이 기존 최고보다 좋은가 */
export function isBetter(r: SavedRace, best: SavedRace | null): boolean {
  if (!best) return r.distance > 0 || r.finishMs >= 60_000;
  return r.distance === 0 ? speedOf(r) > speedOf(best) : r.finishMs < best.finishMs;
}

/** 테스트용: 연결 초기화 */
export function _resetDbForTests() {
  dbPromise = null;
}
