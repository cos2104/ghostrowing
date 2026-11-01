/** 레이스 기록: [출발 후 ms, 레이스 거리 m, (스트로크레이트)]. 시간·거리 모두 단조 증가(거리는 같을 수 있음) */
export type TracePoint = [number, number] | [number, number, number];
export type Trace = TracePoint[];

/** 시간 ms에서의 거리. 기록 범위를 벗어나면 처음·마지막 값에 고정 */
export function distanceAt(trace: Trace, ms: number): number {
  const n = trace.length;
  if (n === 0) return 0;
  if (ms <= trace[0][0]) return trace[0][1];
  if (ms >= trace[n - 1][0]) return trace[n - 1][1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][0] <= ms) lo = mid;
    else hi = mid;
  }
  const [t1, d1] = trace[lo];
  const [t2, d2] = trace[hi];
  return t2 === t1 ? d2 : d1 + ((d2 - d1) * (ms - t1)) / (t2 - t1);
}

/** 거리 d에 처음 도달한 시각 ms. 도달하지 못했으면 null */
export function timeAt(trace: Trace, d: number): number | null {
  const n = trace.length;
  if (n === 0 || d > trace[n - 1][1]) return null;
  if (d <= trace[0][1]) return trace[0][0];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][1] < d) lo = mid;
    else hi = mid;
  }
  const [t1, d1] = trace[lo];
  const [t2, d2] = trace[hi];
  return d2 === d1 ? t2 : t1 + ((t2 - t1) * (d - d1)) / (d2 - d1);
}

/** 시간 ms의 스트로크레이트. 기록에 없으면(예전 기록) 속도로 추정 */
export function spmAt(trace: Trace, ms: number): number {
  const n = trace.length;
  if (n < 2 || ms < 0 || ms > trace[n - 1][0]) return 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][0] <= ms) lo = mid;
    else hi = mid;
  }
  const p = trace[hi];
  if (p.length === 3) return p[2];
  const dt = (trace[hi][0] - trace[lo][0]) / 1000;
  const speed = dt > 0 ? (trace[hi][1] - trace[lo][1]) / dt : 0;
  return speed < 0.5 ? 0 : Math.round(Math.min(40, 14 + speed * 3.6));
}
