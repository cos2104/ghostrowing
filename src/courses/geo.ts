import type { LngLat } from './types';

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** 두 점 사이 거리 (m, 하버사인) */
export function distance(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** a → b 방위각 (도, 북=0 시계방향) */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** p에서 방위각 brg로 dist(m) 이동한 점 */
export function destination(p: LngLat, brg: number, dist: number): LngLat {
  const d = dist / R;
  const b = rad(brg);
  const lat1 = rad(p[1]);
  const lng1 = rad(p[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lng2), deg(lat2)];
}

/** 각도 a에서 b로 t만큼 (최단 방향으로) 보간 */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/** 경로 위 거리로 위치·방향을 구하는 폴리라인 */
export class Polyline {
  readonly cum: number[] = [0];
  readonly length: number;

  constructor(readonly coords: LngLat[]) {
    for (let i = 1; i < coords.length; i++) this.cum.push(this.cum[i - 1] + distance(coords[i - 1], coords[i]));
    this.length = this.cum[this.cum.length - 1];
  }

  private seg(d: number): number {
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** 시작점에서 d(m) 지점. 범위 밖은 끝 선분을 연장 */
  pointAt(d: number): LngLat {
    const i = this.seg(Math.max(0, Math.min(d, this.length)));
    const a = this.coords[i];
    const b = this.coords[i + 1];
    return destination(a, bearing(a, b), d - this.cum[i]);
  }

  /** d 지점의 진행 방향. smooth(m) 앞뒤 구간을 보고 방향을 정해 흔들림을 줄인다 */
  bearingAt(d: number, smooth = 0): number {
    if (smooth > 0) {
      const a = this.pointAt(Math.max(0, d - smooth));
      const b = this.pointAt(Math.min(this.length, d + smooth));
      return bearing(a, b);
    }
    const i = this.seg(Math.max(0, Math.min(d, this.length - 1e-6)));
    return bearing(this.coords[i], this.coords[i + 1]);
  }

  /** d 지점에서 진행 방향 기준 오른쪽(+)/왼쪽(-)으로 offset(m) 떨어진 점 */
  pointAtOffset(d: number, offset: number, smooth = 15): LngLat {
    const p = this.pointAt(d);
    return offset === 0 ? p : destination(p, this.bearingAt(d, smooth) + 90, offset);
  }

  /** from~to 구간을 offset만큼 옆으로 옮긴 선 (레인 줄용) */
  slice(from: number, to: number, offset = 0, step = 20): LngLat[] {
    const out: LngLat[] = [];
    for (let d = from; d < to; d += step) out.push(this.pointAtOffset(d, offset));
    out.push(this.pointAtOffset(to, offset));
    return out;
  }
}

/** 코스에서 레이스 거리 distance의 출발 지점 (결승선은 항상 코스 끝) */
export function raceStartOffset(line: Polyline, raceDistance: number): number {
  return line.length - raceDistance;
}
