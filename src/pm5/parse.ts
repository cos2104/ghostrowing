// PM5 특성 바이트 해석. 모든 다중 바이트 값은 리틀 엔디언.
// TODO(사양서 확인): 바이트 위치와 단위는 공식 사양서와 실측 패킷으로 검증할 것.

export interface GeneralStatus {
  /** 경과 시간 (초) — 원본은 0.01초 단위 3바이트 */
  elapsedSec: number;
  /** 거리 (m) — 원본은 0.1m 단위 3바이트 */
  distanceM: number;
  workoutType: number;
  intervalType: number;
  workoutState: number;
  rowingState: number;
  strokeState: number;
}

export interface AdditionalStatus1 {
  elapsedSec: number;
  /** 속도 (m/s) — 원본은 0.001m/s 단위 2바이트 */
  speedMps: number;
  /** 스트로크레이트 (spm) */
  strokeRate: number;
  /** 심박 (bpm). 255는 측정 안 됨 → null */
  heartRate: number | null;
  /** 현재 페이스 (초/500m) — 원본은 0.01초 단위 2바이트 */
  currentPaceSec: number;
  /** 평균 페이스 (초/500m) */
  averagePaceSec: number;
}

export interface AdditionalStatus2 {
  elapsedSec: number;
  intervalCount: number;
  /** 평균 파워 (W) */
  averagePowerW: number;
  /** 총 칼로리 (kcal) */
  totalCalories: number;
}

const u8 = (v: DataView, i: number) => v.getUint8(i);
const u16 = (v: DataView, i: number) => v.getUint16(i, true);
const u24 = (v: DataView, i: number) => v.getUint8(i) | (v.getUint8(i + 1) << 8) | (v.getUint8(i + 2) << 16);

function need(v: DataView, len: number, name: string) {
  if (v.byteLength < len) {
    throw new RangeError(`${name}: ${len}바이트 이상 필요, ${v.byteLength}바이트 받음`);
  }
}

/** 0x0031 일반 상태 */
export function parseGeneralStatus(v: DataView): GeneralStatus {
  need(v, 11, '0x0031');
  return {
    elapsedSec: u24(v, 0) / 100,
    distanceM: u24(v, 3) / 10,
    workoutType: u8(v, 6),
    intervalType: u8(v, 7),
    workoutState: u8(v, 8),
    rowingState: u8(v, 9),
    strokeState: u8(v, 10),
  };
}

/** 0x0032 추가 상태 1 */
export function parseAdditionalStatus1(v: DataView): AdditionalStatus1 {
  need(v, 11, '0x0032');
  const hr = u8(v, 6);
  return {
    elapsedSec: u24(v, 0) / 100,
    speedMps: u16(v, 3) / 1000,
    strokeRate: u8(v, 5),
    heartRate: hr === 255 ? null : hr,
    currentPaceSec: u16(v, 7) / 100,
    averagePaceSec: u16(v, 9) / 100,
  };
}

/** 0x0033 추가 상태 2 */
export function parseAdditionalStatus2(v: DataView): AdditionalStatus2 {
  need(v, 8, '0x0033');
  return {
    elapsedSec: u24(v, 0) / 100,
    intervalCount: u8(v, 3),
    averagePowerW: u16(v, 4),
    totalCalories: u16(v, 6),
  };
}

/**
 * 페이스(초/500m)로 파워(W) 계산. Concept2 공식: W = 2.80 / (초/m)^3.
 * 페이스가 0이면(젓지 않음) 0.
 */
export function paceToWatts(paceSec: number): number {
  if (paceSec <= 0) return 0;
  const secPerMeter = paceSec / 500;
  return 2.8 / secPerMeter ** 3;
}

/** 초/500m → "m:ss.0" */
export function formatPace(paceSec: number): string {
  if (paceSec <= 0) return '-:--.-';
  const tenths = Math.round(paceSec * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function hexToDataView(hex: string): DataView {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return new DataView(bytes.buffer);
}

export function dataViewToHex(v: DataView): string {
  let out = '';
  for (let i = 0; i < v.byteLength; i++) out += v.getUint8(i).toString(16).padStart(2, '0');
  return out;
}
