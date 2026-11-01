// 화면 사이에서 공유하는 상태와 해시 라우팅.

import { countryByCode, type Country } from './countries';
import { COURSES } from './courses/data';
import type { CourseDef } from './courses/types';
import { SHIRTS, type Character } from './render/sprites';
import type { RowerSource } from './rower/types';
import type { SavedRace } from './storage/races';

/** 0 = 무제한 (순환 코스 전용) */
export const DISTANCES = [500, 1000, 2000, 0] as const;

export const distanceLabel = (d: number) => (d === 0 ? '무제한' : `${d}m`);

export interface LastRace {
  race: SavedRace;
  ghost: SavedRace | null;
  isBest: boolean;
}

export const app = {
  source: null as RowerSource | null,
  distance: 500 as number, // 0 = 무제한
  lastRace: null as LastRace | null,
  get course(): CourseDef {
    return COURSES.find((c) => c.id === safeGet('course')) ?? COURSES[0];
  },
  set course(c: CourseDef) {
    safeSet('course', c.id);
  },
  get character(): Character {
    const [gender, shirt] = safeGet('character').split('_');
    return {
      gender: gender === 'w' ? 'w' : 'm',
      shirt: (SHIRTS as readonly string[]).includes(shirt) ? (shirt as Character['shirt']) : 'blue',
    };
  },
  set character(c: Character) {
    safeSet('character', `${c.gender}_${c.shirt}`);
  },
  get country(): Country {
    return countryByCode(safeGet('country') || 'KOR');
  },
  set country(c: Country) {
    safeSet('country', c.code);
  },
  /** 3D 화질. 느린 기기는 low */
  get quality(): 'high' | 'low' {
    return safeGet('quality') === 'low' ? 'low' : 'high';
  },
  set quality(q: 'high' | 'low') {
    safeSet('quality', q);
  },
  get name(): string {
    return safeGet('name') || '나';
  },
  set name(v: string) {
    safeSet('name', v.trim().slice(0, 12));
  },
};

export function setSource(src: RowerSource | null) {
  if (app.source && app.source !== src) app.source.close();
  app.source = src;
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(`ghostrowing.${k}`) ?? '';
  } catch {
    return '';
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(`ghostrowing.${k}`, v);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

export type Route = 'home' | 'connect' | 'race' | 'result' | 'debug';

export function go(route: Route) {
  location.hash = `#/${route === 'home' ? '' : route}`;
}

export function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '');
  return (['connect', 'race', 'result', 'debug'] as Route[]).includes(r as Route) ? (r as Route) : 'home';
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function formatTime(ms: number) {
  const tenths = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** 고스트 대비 차이 표기. 음수 = 앞섬. |v| < 0.05는 동률 */
export function formatDiff(v: number, unit: string) {
  if (Math.abs(v) < 0.05) return { text: `±0.0${unit}`, cls: 'even' };
  return { text: `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}${unit}`, cls: v < 0 ? 'ahead' : 'behind' };
}
