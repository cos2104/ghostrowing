import { clock } from '../clock';
import { paceToWatts } from '../pm5/parse';
import { raceProfile } from '../race/ai';
import { Emitter, type RowerSample, type RowerSource, type SourceStatus } from './types';

export const SAMPLE_MS = 250;

/**
 * 수동 젓기 물리 모델.
 * 스트로크마다 속도가 STROKE_DV만큼 붙고, 젓지 않으면 지수적으로 줄어든다.
 * 평균 속도 ≈ STROKE_DV × spm / (60 × DECAY): 30spm이면 약 4m/s (2:05/500m).
 */
export const STROKE_DV = 2;
export const DECAY = 0.25; // 1/s

export class RowingPhysics {
  speed = 0; // m/s
  distance = 0; // m
  private strokeTimes: number[] = []; // 초

  stroke(atSec: number) {
    this.speed += STROKE_DV;
    this.strokeTimes.push(atSec);
    if (this.strokeTimes.length > 4) this.strokeTimes.shift();
  }

  /** dtSec만큼 진행 (지수 감속을 정확히 적분) */
  step(dtSec: number) {
    const k = DECAY;
    const v0 = this.speed;
    const v1 = v0 * Math.exp(-k * dtSec);
    this.distance += (v0 - v1) / k;
    this.speed = v1 < 0.05 ? 0 : v1;
  }

  /** 최근 스트로크 간격으로 계산한 spm. 4초 넘게 안 저으면 0 */
  spm(nowSec: number) {
    const t = this.strokeTimes;
    if (t.length < 2 || nowSec - t[t.length - 1] > 4) return 0;
    const avg = (t[t.length - 1] - t[0]) / (t.length - 1);
    return Math.round(60 / avg);
  }
}

export type TestMode =
  | { type: 'manual' }
  /** profile 'race': 출발 스퍼트 → 유지 → 막판 스퍼트 (raceDistance 기준, 무제한이면 유지만) */
  | { type: 'auto'; paceSec: number; spm: number; profile?: 'steady' | 'race'; raceDistance?: number };

/** 키보드·탭(수동) 또는 일정 페이스(자동)로 젓는 가짜 로잉머신 */
export class TestSource implements RowerSource {
  kind = 'test' as const;
  label: string;
  status: SourceStatus = 'connected';
  last: RowerSample | null = null;

  private samples = new Emitter<RowerSample>();
  private statuses = new Emitter<SourceStatus>();
  private physics = new RowingPhysics();
  private timer: ReturnType<typeof setInterval>;
  private lastTick = clock.now();
  private autoDistance = 0;
  private running = true;

  constructor(private mode: TestMode) {
    this.label =
      mode.type === 'manual'
        ? '테스트 모드 (탭·스페이스)'
        : `테스트 모드 (자동 ${fmt(mode.paceSec)}${mode.profile === 'race' ? ', 실전형' : ''})`;
    this.timer = setInterval(() => this.tick(), SAMPLE_MS / clock.speed());
  }

  /** 자동 모드 기본 페이스 (초/500m) */
  get basePace(): number | undefined {
    return this.mode.type === 'auto' ? this.mode.paceSec : undefined;
  }

  get manual() {
    return this.mode.type === 'manual';
  }

  /** 자동 모드에서 젓기 시작·정지. from(clock ms)을 주면 그 시각부터 저은 것으로 계산 */
  setRunning(on: boolean, from?: number) {
    if (on) {
      this.runFrom = from ?? clock.now();
      this.startDist = null;
    }
    this.running = on;
  }

  /** 실전형 자동 젓기의 레이스 거리 (무제한이면 Infinity) */
  setRaceDistance(d: number) {
    if (this.mode.type === 'auto') this.mode = { ...this.mode, raceDistance: d };
  }
  private startDist: number | null = null;
  private runFrom = 0;

  private tick() {
    const now = clock.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    let s: RowerSample;
    if (this.mode.type === 'auto') {
      const active = this.running && now >= this.runFrom;
      let pace = active ? this.mode.paceSec : 0;
      let spm = active ? this.mode.spm : 0;
      if (active && this.mode.profile === 'race') {
        if (this.startDist === null) this.startDist = this.autoDistance;
        const rd = this.mode.raceDistance ?? Infinity;
        const progress = Number.isFinite(rd) && rd > 0 ? (this.autoDistance - this.startDist) / rd : 0.5;
        const p = raceProfile(progress, (now - this.runFrom) / 1000, this.mode.paceSec, this.mode.spm);
        pace = p.pace;
        spm = p.spm;
      }
      // 출발 시각 이전 구간은 빼고 적분
      const movingSec = Math.max(0, Math.min(dt, (now - this.runFrom) / 1000));
      if (pace > 0) this.autoDistance += (500 / pace) * movingSec;
      s = {
        at: now,
        distanceM: this.autoDistance,
        paceSec: pace,
        spm,
        watts: Math.round(paceToWatts(pace)),
      };
    } else {
      this.physics.step(dt);
      const v = this.physics.speed;
      const pace = v > 0.3 ? 500 / v : 0;
      s = {
        at: now,
        distanceM: this.physics.distance,
        paceSec: pace,
        spm: this.physics.spm(now / 1000),
        watts: Math.round(paceToWatts(pace)),
      };
    }
    this.last = s;
    this.samples.emit(s);
  }

  stroke() {
    if (this.mode.type !== 'manual') return;
    this.physics.stroke(clock.now() / 1000);
  }

  onSample(cb: (s: RowerSample) => void) {
    return this.samples.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void) {
    return this.statuses.on(cb);
  }
  close() {
    clearInterval(this.timer);
    this.status = 'disconnected';
    this.statuses.emit('disconnected');
  }
}

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/500m`;
}
