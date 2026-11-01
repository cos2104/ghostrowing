import { paceToWatts } from '../pm5/parse';
import type { RowerSample } from '../rower/types';
import type { Trace } from './ghost';

export const COUNTDOWN_MS = 5000;

export type Phase = 'countdown' | 'racing' | 'finished';

export interface RaceResult {
  distance: number;
  finishMs: number;
  avgPaceSec: number;
  avgWatts: number;
  avgSpm: number;
  trace: Trace;
}

/**
 * 레이스 한 판의 순수 로직.
 * - 시간: 출발 시각(startAt)부터 기기 시계(clock.now)로 잰다
 * - 거리: 출발 직전 샘플의 기기 거리를 기준점으로, 이후 증가분
 * - PM5 리셋(거리 감소): 그때까지 거리를 누적하고 0부터 다시 이어 붙인다
 * - 결승: 결승선을 넘은 두 샘플 사이를 선형 보간
 */
export class RaceEngine {
  phase: Phase = 'countdown';
  /** 현재 레이스 거리 (m) */
  distanceM = 0;
  trace: Trace = [[0, 0]];
  finishMs: number | null = null;

  private prev: RowerSample | null = null; // 직전 원본 샘플
  private segBase: number | null = null; // 현재 구간의 기준 원본 거리
  private accumulated = 0; // 리셋 이전 구간들의 합
  private spmSum = 0;
  private spmCount = 0;

  constructor(
    readonly distance: number,
    readonly startAt: number,
  ) {}

  /** 시간 경과 반영 (카운트다운 → 레이스) */
  tick(now: number) {
    if (this.phase === 'countdown' && now >= this.startAt) this.phase = 'racing';
  }

  /** 레이스 시작 후 경과 ms (음수면 카운트다운 중) */
  elapsed(now: number) {
    return this.finishMs ?? now - this.startAt;
  }

  push(s: RowerSample) {
    const prev = this.prev;
    this.prev = s;
    if (this.phase === 'finished' || s.at < this.startAt) return;
    this.phase = 'racing';

    if (this.segBase === null) {
      // 기준점: 출발 직전 마지막 샘플의 거리 (정지 출발 기준. 출발 전 250ms 이내 움직임은 허용 오차)
      if (prev && prev.at < this.startAt) {
        // 출발 순간 사이에 PM5가 리셋됐으면 새 구간은 0부터
        this.segBase = s.distanceM >= prev.distanceM ? prev.distanceM : 0;
      } else {
        this.segBase = s.distanceM;
      }
    } else if (prev && s.distanceM < prev.distanceM) {
      this.accumulated += prev.distanceM - this.segBase;
      this.segBase = 0;
    }

    const d = Math.max(0, this.accumulated + s.distanceM - this.segBase);
    const t = s.at - this.startAt;
    if (s.spm > 0) {
      this.spmSum += s.spm;
      this.spmCount++;
    }

    if (d >= this.distance) {
      const [t1, d1] = this.trace[this.trace.length - 1];
      const finish = d === d1 ? t : t1 + ((t - t1) * (this.distance - d1)) / (d - d1);
      this.finishMs = Math.round(finish);
      this.distanceM = this.distance;
      this.trace.push([this.finishMs, this.distance]);
      this.phase = 'finished';
      return;
    }

    this.distanceM = d;
    const last = this.trace[this.trace.length - 1];
    if (t > last[0]) this.trace.push([Math.round(t), Math.round(Math.max(d, last[1]) * 10) / 10]);
  }

  result(): RaceResult | null {
    if (this.finishMs === null) return null;
    const avgPaceSec = (this.finishMs / 1000) * (500 / this.distance);
    return {
      distance: this.distance,
      finishMs: this.finishMs,
      avgPaceSec,
      avgWatts: Math.round(paceToWatts(avgPaceSec)),
      avgSpm: this.spmCount ? Math.round(this.spmSum / this.spmCount) : 0,
      trace: this.trace,
    };
  }
}
