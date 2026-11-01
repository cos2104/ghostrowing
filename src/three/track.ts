// 3D 코스의 중심선. 직선(정규 경기 코스)과 순환(큰 호수 한 바퀴) 두 종류.
// 좌표는 미터. 평면 x-z (three.js에서 y가 위). heading은 +x에서 +z 쪽으로 도는 각도(라디안).

export interface Frame {
  x: number;
  z: number;
  /** 진행 방향 (라디안) */
  heading: number;
}

export interface Track {
  readonly length: number;
  readonly loop: boolean;
  /** 거리 d 지점, 진행 방향 오른쪽으로 offset(m) 떨어진 위치 */
  frame(d: number, offset?: number): Frame;
}

function withOffset(x: number, z: number, heading: number, offset: number): Frame {
  // 진행 방향 (cos, sin) 기준 오른쪽 = (-sin, cos)
  return { x: x - Math.sin(heading) * offset, z: z + Math.cos(heading) * offset, heading };
}

/** 정규 경기 코스: x=0에서 출발, +x 방향 직선 */
export class StraightTrack implements Track {
  readonly loop = false;
  constructor(readonly length: number) {}
  frame(d: number, offset = 0): Frame {
    return withOffset(d, 0, 0, offset);
  }
}

/** 닫힌 Catmull-Rom 곡선 순환 코스. 길이 기준으로 재표본해 일정한 속도로 움직인다 */
export class LoopTrack implements Track {
  readonly loop = true;
  readonly length: number;
  private xs: number[] = [];
  private zs: number[] = [];
  private cum: number[] = [];
  private readonly step: number;

  constructor(control: [number, number][], samplesPerSeg = 64) {
    const n = control.length;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p0 = control[(i - 1 + n) % n];
      const p1 = control[i];
      const p2 = control[(i + 1) % n];
      const p3 = control[(i + 2) % n];
      for (let k = 0; k < samplesPerSeg; k++) {
        const t = k / samplesPerSeg;
        pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    pts.push(pts[0]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.length = cum[cum.length - 1];
    // 2m 간격으로 재표본
    this.step = 2;
    let j = 0;
    for (let d = 0; d <= this.length; d += this.step) {
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.xs.push(pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t);
      this.zs.push(pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t);
      this.cum.push(d);
    }
  }

  frame(d: number, offset = 0): Frame {
    const L = this.length;
    const dd = ((d % L) + L) % L;
    const n = this.xs.length;
    const i = Math.min(Math.floor(dd / this.step), n - 2);
    const t = (dd - this.cum[i]) / this.step;
    const x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    const z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    // 방향은 앞뒤 6m를 보고 계산해 매끄럽게
    const a = (i - 3 + n - 1) % (n - 1);
    const b = (i + 3) % (n - 1);
    const heading = Math.atan2(this.zs[b] - this.zs[a], this.xs[b] - this.xs[a]);
    return withOffset(x, z, heading, offset);
  }

  /** 미니맵용 윤곽 */
  outline(step = 20): [number, number][] {
    const out: [number, number][] = [];
    for (let d = 0; d < this.length; d += step) {
      const f = this.frame(d);
      out.push([f.x, f.z]);
    }
    return out;
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 큰 호수 순환 코스 (약 5km). 여러 풍경 구간을 지나도록 굽이진 모양 */
export const GRAND_LOOP: [number, number][] = [
  [0, 0],
  [500, -40],
  [950, 60],
  [1250, 350],
  [1300, 750],
  [1100, 1050],
  [700, 1150],
  [300, 1000],
  [0, 1080],
  [-350, 1000],
  [-550, 700],
  [-500, 350],
  [-300, 80],
];
