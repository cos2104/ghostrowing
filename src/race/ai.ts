// 컴퓨터 선수와 실전형 자동 젓기: 실제 2000m 레이스처럼 출발 스퍼트 → 유지 → 막판 스퍼트.
import type { Trace } from './ghost';

/** 결정적 난수 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 진행률(0~1)·출발 후 시간에 따른 페이스·스트로크레이트.
 * basePace: 평균 페이스(초/500m), baseSpm: 유지 구간 스트로크레이트
 */
export function raceProfile(progress: number, tSec: number, basePace: number, baseSpm: number) {
  let paceAdj = 0;
  let spm = baseSpm;
  if (tSec < 12) {
    // 출발: 처음 몇 스트로크는 높은 레이트로 치고 나간다
    const k = 1 - tSec / 12;
    paceAdj = -6 * k;
    spm = baseSpm + 8 * k;
  }
  if (progress > 0.8) {
    // 막판 스퍼트
    const k = Math.min(1, (progress - 0.8) / 0.12);
    paceAdj -= 4 * k;
    spm += 5 * k;
  } else if (progress > 0.35 && progress < 0.75) {
    // 중반에 살짝 늦어지는 구간
    paceAdj += 1.5;
  }
  return { pace: basePace + paceAdj, spm: Math.round(spm) };
}

/** 컴퓨터 선수 기록을 미리 만든다 (250ms 간격, [ms, m, spm]) */
export function aiTrace(opts: { distance: number; basePace: number; baseSpm: number; seed: number; maxSec?: number }): Trace {
  const r = rng(opts.seed);
  const dt = 0.25;
  const open = !Number.isFinite(opts.distance) || opts.distance <= 0;
  const maxSec = opts.maxSec ?? (open ? 7200 : opts.basePace * (opts.distance / 500) * 1.6);
  const trace: Trace = [[0, 0, 0]];
  let d = 0;
  let wobble = 0; // 페이스 흔들림 (스트로크마다 조금씩)
  // 출발 반응 0.2~0.6초
  const react = 0.2 + r() * 0.4;
  for (let t = dt; t <= maxSec; t += dt) {
    if (t < react) {
      trace.push([Math.round(t * 1000), 0, 0]);
      continue;
    }
    const progress = open ? 0.5 : d / opts.distance;
    const p = raceProfile(progress, t - react, opts.basePace, opts.baseSpm);
    wobble += (r() - 0.5) * 0.4;
    wobble *= 0.97;
    const pace = p.pace + wobble;
    d += (500 / pace) * dt;
    if (!open && d >= opts.distance) {
      const prev = trace[trace.length - 1];
      const frac = (opts.distance - prev[1]) / (d - prev[1]);
      trace.push([Math.round((t - dt + dt * frac) * 1000), opts.distance, p.spm]);
      break;
    }
    trace.push([Math.round(t * 1000), Math.round(d * 10) / 10, p.spm]);
  }
  return trace;
}

const FIRST = ['M.', 'J.', 'L.', 'A.', 'K.', 'S.', 'T.', 'R.', 'P.', 'H.'];
const LAST = ['Kowalski', 'Novak', 'Müller', 'Rossi', 'Dubois', 'Jensen', 'Kim', 'Sato', 'Silva', 'Walsh', 'Ivanov', 'Larsen', 'Moreau', 'Horvat', 'Berg'];

export function aiName(seed: number) {
  const r = rng(seed * 7919 + 3);
  return `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
}
