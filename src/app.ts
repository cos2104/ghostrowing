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
  /** 컴퓨터 선수와 함께 탄 경우 내 순위 */
  place?: number;
  fieldSize?: number;
  /** 결승 순위표 (나·고스트·컴퓨터) */
  field?: { name: string; country: string; timeMs: number | null; me?: boolean; ghost?: boolean }[];
  courseName?: string;
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
  /** 컴퓨터 선수 수 (0·2·4) */
  get aiCount(): number {
    const n = Number(safeGet('aiCount'));
    return [0, 2, 4].includes(n) ? n : 0;
  },
  set aiCount(n: number) {
    safeSet('aiCount', String(n));
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
/** 초/500m → m:ss.0 */
export function fmtPace(sec: number) {
  if (!sec || !Number.isFinite(sec)) return '-:--.-';
  const t = Math.floor(sec * 10); // 로잉 표기 관례: 0.1초 단위 버림 (기록 표기와 일치)
  return `${Math.floor(t / 600)}:${((t % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

/** 뒤로 가기용 아이콘 등 공용 SVG */
export const ICON = {
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  bt: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg>',
  auto: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/></svg>',
  tap: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5a2 2 0 014 0v6"/><path d="M13 10a2 2 0 014 0v4a6 6 0 01-6 6h-1a6 6 0 01-5-3l-1.5-3a1.6 1.6 0 012.6-1.8L9 15"/></svg>',
  full: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/></svg>',
};

export function formatDiff(v: number, unit: string) {
  if (Math.abs(v) < 0.05) return { text: `±0.0${unit}`, cls: 'even' };
  return { text: `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}${unit}`, cls: v < 0 ? 'ahead' : 'behind' };
}
