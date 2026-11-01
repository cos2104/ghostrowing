import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/data';
import { bearing, destination, distance, lerpAngle, Polyline } from '../src/courses/geo';

describe('지리 계산', () => {
  it('거리: 위도 1도 ≈ 111.2km', () => {
    expect(distance([127, 37], [127, 38]) / 1000).toBeCloseTo(111.2, 0);
  });

  it('방위각: 북 0, 동 90', () => {
    expect(bearing([127, 37], [127, 37.01])).toBeCloseTo(0, 1);
    expect(bearing([127, 37], [127.01, 37])).toBeCloseTo(90, 0);
  });

  it('destination 후 거리·방향이 맞다', () => {
    const p: [number, number] = [127.2, 37.56];
    const q = destination(p, 140, 2000);
    expect(distance(p, q)).toBeCloseTo(2000, 0);
    expect(bearing(p, q)).toBeCloseTo(140, 0);
  });

  it('각도 보간은 0/360 경계를 넘는다', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 5);
  });
});

describe('Polyline', () => {
  const line = new Polyline([
    [127, 37],
    [127, 37.009], // 북쪽 약 1000m
    [127.0113, 37.009], // 동쪽 약 1000m
  ]);

  it('길이와 중간 지점', () => {
    expect(line.length).toBeGreaterThan(1990);
    expect(line.length).toBeLessThan(2010);
    const mid = line.pointAt(500);
    expect(distance([127, 37], mid)).toBeCloseTo(500, 0);
  });

  it('구간마다 방향', () => {
    expect(line.bearingAt(100)).toBeCloseTo(0, 0);
    expect(line.bearingAt(1500)).toBeCloseTo(90, 0);
  });

  it('오른쪽 오프셋', () => {
    const p = line.pointAtOffset(300, 10, 0);
    expect(p[0]).toBeGreaterThan(127); // 북쪽으로 갈 때 오른쪽은 동쪽
    expect(distance(p, line.pointAt(300))).toBeCloseTo(10, 0);
  });
});

describe('코스 데이터', () => {
  for (const c of COURSES.filter((c) => !c.loop)) {
    it(`${c.name}: 2000m 이상, 점 간격 30m 이하`, () => {
      const line = new Polyline(c.coords);
      expect(line.length).toBeGreaterThanOrEqual(2000);
      for (let i = 1; i < c.coords.length; i++) expect(distance(c.coords[i - 1], c.coords[i])).toBeLessThan(30);
    });
  }
});

describe('3D 트랙', async () => {
  const { StraightTrack, LoopTrack, GRAND_LOOP } = await import('../src/three/track');
  it('직선: 오른쪽 오프셋은 +z', () => {
    const t = new StraightTrack(2000);
    expect(t.frame(100, 5)).toMatchObject({ x: 100, z: 5, heading: 0 });
  });
  it('순환: 한 바퀴 4~6km, 길이를 넘으면 처음으로 돌아온다', () => {
    const t = new LoopTrack(GRAND_LOOP);
    expect(t.length).toBeGreaterThan(4000);
    expect(t.length).toBeLessThan(6000);
    const a = t.frame(10);
    const b = t.frame(t.length + 10);
    expect(b.x).toBeCloseTo(a.x, 3);
    expect(b.z).toBeCloseTo(a.z, 3);
  });
  it('순환: 2m마다 위치가 약 2m씩 움직인다', () => {
    const t = new LoopTrack(GRAND_LOOP);
    for (let d = 0; d < t.length; d += 397) {
      const p = t.frame(d);
      const q = t.frame(d + 2);
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(2, 0);
    }
  });
});
