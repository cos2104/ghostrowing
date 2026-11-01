import { describe, expect, it } from 'vitest';
import {
  formatPace,
  hexToDataView,
  paceToWatts,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseGeneralStatus,
} from '../src/pm5/parse';
import { IntervalStats } from '../src/stats';

// TODO(실측 패킷으로 교체): 아래 hex는 사양 레이아웃에 맞춰 직접 만든 합성 샘플이다.
// 갤럭시탭에서 받은 "패킷 기록"이 오면 실제 값으로 바꾼다.

describe('0x0031 일반 상태', () => {
  it('경과 시간·거리를 리틀 엔디언 3바이트로 해석', () => {
    // 경과 12345 (123.45s) = 0x003039 → 39 30 00
    // 거리 5123 (512.3m)   = 0x001403 → 03 14 00
    // 운동 종류 1, 인터벌 종류 0, 운동 상태 1, 젓기 상태 1, 스트로크 상태 2, 이후 8바이트
    const v = hexToDataView('393000 031400 01 00 01 01 02 000000 000000 00 7b');
    const g = parseGeneralStatus(v);
    expect(g.elapsedSec).toBeCloseTo(123.45);
    expect(g.distanceM).toBeCloseTo(512.3);
    expect(g.workoutType).toBe(1);
    expect(g.workoutState).toBe(1);
    expect(g.rowingState).toBe(1);
    expect(g.strokeState).toBe(2);
  });

  it('3바이트 최대 범위 (상위 바이트 사용)', () => {
    // 거리 0x0186A0 = 100000 → 10000.0m
    const g = parseGeneralStatus(hexToDataView('000000 a08601 0000000000'));
    expect(g.distanceM).toBeCloseTo(10000);
  });

  it('짧은 패킷은 에러', () => {
    expect(() => parseGeneralStatus(hexToDataView('0102'))).toThrow(RangeError);
  });
});

describe('0x0032 추가 상태 1', () => {
  it('속도·스트로크레이트·페이스 해석', () => {
    // 경과 100.00s = 0x002710 → 10 27 00
    // 속도 4.167 m/s = 4167 = 0x1047 → 47 10
    // spm 28 = 0x1c, 심박 255(없음)
    // 현재 페이스 2:00.0 = 12000 = 0x2ee0 → e0 2e
    // 평균 페이스 1:55.5 = 11550 = 0x2d1e → 1e 2d
    const a = parseAdditionalStatus1(hexToDataView('102700 4710 1c ff e02e 1e2d 0000 000000'));
    expect(a.elapsedSec).toBeCloseTo(100);
    expect(a.speedMps).toBeCloseTo(4.167);
    expect(a.strokeRate).toBe(28);
    expect(a.heartRate).toBeNull();
    expect(a.currentPaceSec).toBeCloseTo(120);
    expect(a.averagePaceSec).toBeCloseTo(115.5);
  });

  it('심박이 있으면 숫자', () => {
    const a = parseAdditionalStatus1(hexToDataView('000000 0000 00 96 0000 0000'));
    expect(a.heartRate).toBe(150);
  });
});

describe('0x0033 추가 상태 2', () => {
  it('평균 파워 해석', () => {
    // 경과 0, 인터벌 0, 평균 파워 203 = 0x00cb → cb 00, 칼로리 42 → 2a 00
    const a = parseAdditionalStatus2(hexToDataView('000000 00 cb00 2a00 0000 0000 0000 000000 000000'));
    expect(a.averagePowerW).toBe(203);
    expect(a.totalCalories).toBe(42);
  });
});

describe('변환', () => {
  it('2:00/500m ≈ 203W (Concept2 계산기 값)', () => {
    expect(Math.round(paceToWatts(120))).toBe(203);
  });
  it('페이스 0은 0W', () => {
    expect(paceToWatts(0)).toBe(0);
  });
  it('페이스 표기', () => {
    expect(formatPace(120)).toBe('2:00.0');
    expect(formatPace(115.53)).toBe('1:55.5');
    expect(formatPace(99.96)).toBe('1:40.0');
    expect(formatPace(0)).toBe('-:--.-');
  });
});

describe('간격 통계', () => {
  it('250ms 간격 2분이면 통과', () => {
    const s = new IntervalStats();
    for (let t = 0; t <= 120_000; t += 250) s.add(t);
    expect(s.avgGap).toBe(250);
    expect(s.longGaps).toBe(0);
    expect(s.passed(120_100)).toBe(true);
  });
  it('400ms 넘는 공백이 있으면 실패', () => {
    const s = new IntervalStats();
    for (let t = 0; t <= 60_000; t += 250) s.add(t);
    for (let t = 60_500; t <= 121_000; t += 250) s.add(t);
    expect(s.longGaps).toBe(1);
    expect(s.maxGap).toBe(500);
    expect(s.passed(121_000)).toBe(false);
  });
  it('2분 미만이면 아직 통과 아님', () => {
    const s = new IntervalStats();
    for (let t = 0; t <= 60_000; t += 250) s.add(t);
    expect(s.passed(60_000)).toBe(false);
  });
  it('패킷이 멈춘 상태면 통과 아님', () => {
    const s = new IntervalStats();
    for (let t = 0; t <= 120_000; t += 250) s.add(t);
    expect(s.passed(121_000)).toBe(false);
  });
});
