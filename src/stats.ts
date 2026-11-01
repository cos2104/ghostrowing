// 0단계 완료 기준 판정: 2분 동안 250ms 간격으로 끊김 없이 들어오는가.

export const GAP_LIMIT_MS = 400;
export const REQUIRED_MS = 120_000;

export class IntervalStats {
  count = 0;
  firstAt: number | null = null;
  lastAt: number | null = null;
  sumGap = 0;
  maxGap = 0;
  /** GAP_LIMIT_MS를 넘게 비어 있던 횟수 */
  longGaps = 0;

  add(at: number) {
    if (this.lastAt !== null) {
      const gap = at - this.lastAt;
      this.sumGap += gap;
      if (gap > this.maxGap) this.maxGap = gap;
      if (gap > GAP_LIMIT_MS) this.longGaps++;
    } else {
      this.firstAt = at;
    }
    this.lastAt = at;
    this.count++;
  }

  get durationMs() {
    return this.firstAt === null || this.lastAt === null ? 0 : this.lastAt - this.firstAt;
  }

  get avgGap() {
    return this.count > 1 ? this.sumGap / (this.count - 1) : 0;
  }

  /** 측정 중 마지막 패킷 이후 지금까지 비어 있는 시간도 끊김으로 본다 */
  passed(now: number) {
    const stalled = this.lastAt !== null && now - this.lastAt > GAP_LIMIT_MS;
    return this.durationMs >= REQUIRED_MS && this.longGaps === 0 && !stalled;
  }
}
