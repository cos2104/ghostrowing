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
import capture from './fixtures/pm5-justrow-520m.json';

// 실측 패킷: 2026-11-01 PM5 Just Row 약 520m (tests/fixtures/pm5-justrow-520m.json)
// 운동 시작 55.29초 시점 (t=60161ms)
const ROWING = {
  general: '991500ff0900010101010200000000000080e3',
  add1: '9915005c1223ffbf29342a000000000000',
  add2: '9915000016011400342a16011400000000000000',
};
// 젓기를 멈춘 뒤 (121.66초, 519.7m)
const STOPPED = {
  general: '862f004d1400010101000100000000000080df',
  add1: '862f00c90e22ffc933bd2d000000000000',
  add2: '862f0000da002500b62dda002500000000080200',
};
// Just Row 시작 전: 이전 운동의 값(645.2초, 1944.7m)이 남아 있음
const BEFORE_START = '08fc00f74b0001010000000000000000008000';

describe('0x0031 일반 상태 (실측)', () => {
  it('젓는 중', () => {
    const g = parseGeneralStatus(hexToDataView(ROWING.general));
    expect(g.elapsedSec).toBeCloseTo(55.29);
    expect(g.distanceM).toBeCloseTo(255.9);
    expect(g.workoutType).toBe(1); // Just Row
    expect(g.workoutState).toBe(1); // 운동 중
    expect(g.rowingState).toBe(1); // 젓는 중
  });

  it('멈춘 뒤에는 rowingState 0', () => {
    const g = parseGeneralStatus(hexToDataView(STOPPED.general));
    expect(g.elapsedSec).toBeCloseTo(121.66);
    expect(g.distanceM).toBeCloseTo(519.7);
    expect(g.rowingState).toBe(0);
  });

  it('시작 전에는 이전 운동 값이 남아 있다 (거리 기준점 처리 필요)', () => {
    const g = parseGeneralStatus(hexToDataView(BEFORE_START));
    expect(g.elapsedSec).toBeCloseTo(645.2);
    expect(g.distanceM).toBeCloseTo(1944.7);
    expect(g.workoutState).toBe(0);
  });

  it('짧은 패킷은 에러', () => {
    expect(() => parseGeneralStatus(hexToDataView('0102'))).toThrow(RangeError);
  });
});

describe('0x0032 추가 상태 1 (실측)', () => {
  it('속도·스트로크레이트·페이스', () => {
    const a = parseAdditionalStatus1(hexToDataView(ROWING.add1));
    expect(a.elapsedSec).toBeCloseTo(55.29);
    expect(a.speedMps).toBeCloseTo(4.7);
    expect(a.strokeRate).toBe(35);
    expect(a.heartRate).toBeNull(); // 심박계 없음 = 255
    expect(a.currentPaceSec).toBeCloseTo(106.87);
    expect(a.averagePaceSec).toBeCloseTo(108.04);
  });

  it('페이스는 속도와 일치한다 (500 / 속도)', () => {
    const a = parseAdditionalStatus1(hexToDataView(STOPPED.add1));
    expect(a.currentPaceSec).toBeCloseTo(500 / a.speedMps, 0);
  });
});

describe('0x0033 추가 상태 2 (실측)', () => {
  it('평균 파워·칼로리', () => {
    const a = parseAdditionalStatus2(hexToDataView(ROWING.add2));
    expect(a.averagePowerW).toBe(278);
    expect(a.totalCalories).toBe(20);
  });

  it('평균 파워는 평균 페이스로 계산한 값과 같다 (운동 전체 평균)', () => {
    const p1 = parseAdditionalStatus1(hexToDataView(STOPPED.add1));
    const p2 = parseAdditionalStatus2(hexToDataView(STOPPED.add2));
    expect(p2.averagePowerW).toBe(218);
    expect(Math.abs(paceToWatts(p1.averagePaceSec) - p2.averagePowerW)).toBeLessThan(2);
  });
});

describe('실측 기록 전체', () => {
  const packets = capture.packets as { t: number; ch: string; hex: string }[];

  it('모든 패킷이 해석된다', () => {
    for (const p of packets) {
      const v = hexToDataView(p.hex);
      if (p.ch === '0031') parseGeneralStatus(v);
      else if (p.ch === '0032') parseAdditionalStatus1(v);
      else parseAdditionalStatus2(v);
    }
  });

  it('운동이 시작된 뒤 거리는 줄지 않는다', () => {
    const general = packets
      .filter((p) => p.ch === '0031')
      .map((p) => parseGeneralStatus(hexToDataView(p.hex)))
      .filter((g) => g.workoutState !== 0);
    expect(general.length).toBeGreaterThan(400);
    for (let i = 1; i < general.length; i++) {
      expect(general[i].distanceM).toBeGreaterThanOrEqual(general[i - 1].distanceM);
    }
  });

  it('0x0031 간격 통계가 완료 기준을 통과한다', () => {
    const s = new IntervalStats();
    for (const p of packets) if (p.ch === '0031') s.add(p.t);
    expect(s.longGaps).toBe(0);
    expect(s.avgGap).toBeGreaterThan(240);
    expect(s.avgGap).toBeLessThan(260);
    expect(s.passed(s.lastAt!)).toBe(true);
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
