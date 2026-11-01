// 레이스 시계. 개발용 배속(?speed=10)은 테스트 모드에서만 의미가 있다.

const t0 = performance.now();
let speed = 1;

const param = typeof location === 'undefined' ? 1 : Number(new URLSearchParams(location.search).get('speed'));
if (Number.isFinite(param) && param > 0) speed = param;

export const clock = {
  /** 앱 시작 후 경과 ms (배속 적용) */
  now: () => (performance.now() - t0) * speed,
  speed: () => speed,
};
