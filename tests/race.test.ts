import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { hexToDataView, parseGeneralStatus } from '../src/pm5/parse';
import { RaceEngine } from '../src/race/engine';
import { distanceAt, timeAt, type Trace } from '../src/race/ghost';
import { RowingPhysics } from '../src/rower/testSource';
import type { RowerSample } from '../src/rower/types';
import { getBest, listRaces, saveRace } from '../src/storage/races';
import capture from './fixtures/pm5-justrow-520m.json';

const sample = (at: number, distanceM: number, spm = 28): RowerSample => ({ at, distanceM, paceSec: 120, spm, watts: 203 });

/** 일정 속도(m/s)로 250ms마다 샘플 생성 */
function constantRow(engine: RaceEngine, opts: { from: number; to: number; speed: number; base?: number; offset?: number }) {
  const { from, to, speed, base = 0, offset = 0 } = opts;
  // 카운트다운 중에도 샘플은 계속 들어온다 (출발 1초 전부터), 출발 신호에 정지 상태에서 출발
  for (let at = from - 1000 + offset; at <= to; at += 250) {
    const moving = Math.max(0, at - engine.startAt);
    engine.push(sample(at, base + (speed * moving) / 1000));
    if (engine.phase === 'finished') break;
  }
}

describe('RaceEngine', () => {
  it('출발 전에 저은 거리는 무시한다 (기준점)', () => {
    const e = new RaceEngine(500, 10_000);
    // 출발 전 10초 동안 300m를 이미 저어 둔 상태, 출발 후 정지
    e.push(sample(9_900, 300));
    e.push(sample(10_150, 300));
    expect(e.distanceM).toBe(0);
    e.push(sample(10_400, 302.5));
    expect(e.distanceM).toBeCloseTo(2.5);
  });

  it('기준점은 출발 직전 마지막 샘플의 거리', () => {
    const e = new RaceEngine(500, 10_000);
    e.push(sample(9_650, 100));
    e.push(sample(9_900, 100)); // 출발 0.1초 전, 정지
    e.push(sample(10_150, 100.6)); // 출발 후 0.15초 동안 0.6m
    expect(e.distanceM).toBeCloseTo(0.6);
  });

  it('출발 순간에 PM5가 리셋되면 새 구간은 0부터', () => {
    const e = new RaceEngine(500, 10_000);
    e.push(sample(9_900, 1944.7));
    e.push(sample(10_150, 0.8));
    expect(e.distanceM).toBeCloseTo(0.8);
  });

  it('결승 시각을 두 샘플 사이에서 보간한다', () => {
    const e = new RaceEngine(500, 0);
    // 4m/s, 샘플은 출발 후 100ms 지점부터 250ms 간격 → 500m 도달 = 125,000ms
    constantRow(e, { from: 0, to: 200_000, speed: 4, offset: 100 });
    expect(e.phase).toBe('finished');
    expect(e.finishMs).toBe(125_000);
    const r = e.result()!;
    expect(r.avgPaceSec).toBeCloseTo(125);
    expect(r.trace.at(-1)).toEqual([125_000, 500]);
  });

  it('레이스 중 PM5가 리셋돼도(거리 감소) 거리를 이어 붙인다', () => {
    const e = new RaceEngine(500, 0);
    e.push(sample(0, 1000));
    e.push(sample(250, 1001));
    e.push(sample(500, 1002)); // 레이스 2m
    e.push(sample(750, 0.5)); // 리셋 후 0.5m
    expect(e.distanceM).toBeCloseTo(2.5);
    e.push(sample(1000, 1.5));
    expect(e.distanceM).toBeCloseTo(3.5);
  });

  it('실측: 이전 운동 값(1944m)이 남은 PM5에서 Just Row를 새로 시작해도 0부터 잰다', () => {
    const packets = (capture.packets as { t: number; ch: string; hex: string }[]).filter((p) => p.ch === '0031');
    // 실측 기록의 첫 패킷 직후에 출발 신호
    const startAt = packets[0].t + 100;
    const e = new RaceEngine(500, startAt);
    for (const p of packets) {
      const g = parseGeneralStatus(hexToDataView(p.hex));
      e.push({ at: p.t, distanceM: g.distanceM, paceSec: 0, spm: 0, watts: 0 });
    }
    expect(e.phase).toBe('finished');
    // PM5 표시 기준으로는 약 115초에 500m. 출발 신호부터 재므로 그보다 길다
    expect(e.finishMs!).toBeGreaterThan(115_000);
    expect(e.finishMs!).toBeLessThan(125_000);
  });

  it('출발 전 샘플이 하나뿐이고 다음 샘플이 한참 늦게 와도 그 사이 거리를 센다', () => {
    const e = new RaceEngine(500, 5_000);
    e.push(sample(4_000, 100)); // 출발 전 마지막 값 (정지)
    e.push(sample(11_900, 131.4)); // 화면이 멈췄다가 6.9초 뒤 도착
    expect(e.distanceM).toBeCloseTo(31.4);
  });

  it('출발 전 샘플은 기록하지 않는다', () => {
    const e = new RaceEngine(500, 5_000);
    e.push(sample(1_000, 10));
    e.push(sample(4_000, 20));
    expect(e.phase).toBe('countdown');
    expect(e.trace).toEqual([[0, 0]]);
  });
});

describe('무제한 레이스', () => {
  it('끝날 때까지 결승하지 않고, 종료하면 저은 거리로 결과', () => {
    const e = new RaceEngine(Infinity, 0);
    constantRow(e, { from: 0, to: 300_000, speed: 4 });
    expect(e.phase).toBe('racing');
    e.stop(300_000);
    const r = e.result()!;
    expect(r.distance).toBe(0);
    expect(r.traveledM).toBeCloseTo(1200, 0);
    expect(r.avgPaceSec).toBeCloseTo(125, 0);
  });
});

describe('고스트 보간', () => {
  const trace: Trace = [
    [0, 0],
    [1000, 4],
    [2000, 8],
    [3000, 8], // 쉼
    [4000, 12],
  ];

  it('시간 → 거리', () => {
    expect(distanceAt(trace, 500)).toBeCloseTo(2);
    expect(distanceAt(trace, 2500)).toBeCloseTo(8);
    expect(distanceAt(trace, 3500)).toBeCloseTo(10);
    expect(distanceAt(trace, -100)).toBe(0);
    expect(distanceAt(trace, 9999)).toBe(12); // 결승 후 정지
  });

  it('거리 → 처음 도달한 시간', () => {
    expect(timeAt(trace, 2)).toBeCloseTo(500);
    expect(timeAt(trace, 8)).toBeCloseTo(2000); // 쉼 구간의 시작
    expect(timeAt(trace, 10)).toBeCloseTo(3500);
    expect(timeAt(trace, 13)).toBeNull();
  });

  it('완료 기준: 첫 레이스 기록을 고스트로 재생하면 같은 시각에 같은 위치', () => {
    const first = new RaceEngine(500, 0);
    constantRow(first, { from: 0, to: 300_000, speed: 500 / 120, offset: 37 }); // 2:00 페이스
    const ghost = first.result()!.trace;
    expect(first.finishMs).toBe(120_000);
    for (const t of [10_000, 30_000, 60_000, 90_000, 119_000]) {
      expect(distanceAt(ghost, t)).toBeCloseTo((500 / 120) * (t / 1000), 1);
    }
    expect(distanceAt(ghost, 120_000)).toBe(500);
  });
});

describe('테스트 모드 물리', () => {
  it('30spm으로 꾸준히 저으면 약 4m/s (2:05 안팎)', () => {
    const p = new RowingPhysics();
    let t = 0;
    for (let i = 0; i < 60; i++) {
      p.stroke(t);
      for (let k = 0; k < 8; k++) {
        p.step(0.25);
        t += 0.25;
      }
    }
    // 정상 상태 1분 동안의 평균 속도
    const d0 = p.distance;
    for (let i = 0; i < 30; i++) {
      p.stroke(t);
      for (let k = 0; k < 8; k++) {
        p.step(0.25);
        t += 0.25;
      }
    }
    const avg = (p.distance - d0) / 60;
    expect(avg).toBeGreaterThan(3.8);
    expect(avg).toBeLessThan(4.2);
    expect(p.spm(t - 1)).toBe(30);
  });

  it('젓지 않으면 멈춘다', () => {
    const p = new RowingPhysics();
    p.stroke(0);
    for (let i = 0; i < 200; i++) p.step(0.25);
    expect(p.speed).toBe(0);
    expect(p.spm(50)).toBe(0);
  });
});

describe('기록 저장 (IndexedDB)', () => {
  const base = { avgPaceSec: 120, avgWatts: 203, avgSpm: 28, trace: [[0, 0]] as Trace, name: '나', traveledM: 500 };

  it('입력 방식·거리별 최고 기록을 고른다', async () => {
    await saveRace({ ...base, distance: 500, source: 'test', finishMs: 130_000 });
    await saveRace({ ...base, distance: 500, source: 'test', finishMs: 118_000 });
    await saveRace({ ...base, distance: 500, source: 'pm5', finishMs: 100_000 });
    await saveRace({ ...base, distance: 1000, source: 'test', finishMs: 90_000 });

    expect((await listRaces('test', 500)).length).toBe(2);
    expect((await getBest('test', 500))!.finishMs).toBe(118_000);
    expect((await getBest('pm5', 500))!.finishMs).toBe(100_000);
    expect(await getBest('pm5', 2000)).toBeNull();
  });

  it('무제한: 1분 이상 기록 중 평균 속도가 가장 빠른 것', async () => {
    await saveRace({ ...base, distance: 0, source: 'test', finishMs: 30_000, traveledM: 200 }); // 너무 짧음
    await saveRace({ ...base, distance: 0, source: 'test', finishMs: 600_000, traveledM: 2400 }); // 4.0 m/s
    await saveRace({ ...base, distance: 0, source: 'test', finishMs: 120_000, traveledM: 510 }); // 4.25 m/s
    expect((await getBest('test', 0))!.traveledM).toBe(510);
  });
});

describe('컴퓨터 선수 기록', async () => {
  const { aiTrace, raceProfile } = await import('../src/race/ai');
  it('500m를 기본 페이스 근처 기록으로 완주하고, 거리는 줄지 않는다', () => {
    const tr = aiTrace({ distance: 500, basePace: 115, baseSpm: 30, seed: 7 });
    const last = tr[tr.length - 1];
    expect(last[1]).toBe(500);
    expect(last[0] / 1000).toBeGreaterThan(105);
    expect(last[0] / 1000).toBeLessThan(120);
    for (let i = 1; i < tr.length; i++) expect(tr[i][1]).toBeGreaterThanOrEqual(tr[i - 1][1]);
  });
  it('출발 직후는 레이트가 높고 막판에 스퍼트', () => {
    expect(raceProfile(0, 1, 115, 30).spm).toBeGreaterThan(34);
    expect(raceProfile(0.5, 60, 115, 30).spm).toBe(30);
    expect(raceProfile(0.95, 100, 115, 30).pace).toBeLessThan(115);
  });
  it('같은 시드면 같은 기록', () => {
    expect(aiTrace({ distance: 500, basePace: 120, baseSpm: 28, seed: 3 })).toEqual(aiTrace({ distance: 500, basePace: 120, baseSpm: 28, seed: 3 }));
  });
});
