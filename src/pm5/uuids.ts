// Concept2 PM5 Bluetooth Smart Interface Definition 기준 UUID.
// rowingService·0x0031~0x0034는 실제 PM5 연결로 동작 확인함 (2026-11-01).
// TODO(사양서 확인): discoveryService·deviceInfoService는 아직 공식 사양서와 대조하지 않음.

const BASE = '-43e5-11e4-916c-0800200c9a66';
const uuid = (short: string) => `ce06${short}${BASE}`;

export const PM5 = {
  /** PM5가 광고(advertise)하는 검색용 서비스 */
  discoveryService: uuid('0000'),
  /** PM5 기기 정보 서비스 */
  deviceInfoService: uuid('0010'),
  /** 로잉 데이터 서비스 */
  rowingService: uuid('0030'),
  /** 일반 상태: 경과 시간, 거리, 운동·젓기 상태 */
  generalStatus: uuid('0031'),
  /** 추가 상태 1: 속도, 스트로크레이트, 현재 페이스 */
  additionalStatus1: uuid('0032'),
  /** 추가 상태 2: 평균 파워 등 */
  additionalStatus2: uuid('0033'),
  /** 0x0031~0x0033 알림 주기 설정 (쓰기) */
  sampleRate: uuid('0034'),
} as const;

/**
 * 0x0034에 쓰는 주기 값.
 * 0=1s, 1=500ms, 2=250ms, 3=100ms. 2(250ms)는 실측으로 확인함.
 */
export const SAMPLE_RATE_250MS = 2;
