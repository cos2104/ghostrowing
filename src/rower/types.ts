/** PM5와 테스트 모드가 공통으로 내보내는 샘플 (250ms마다) */
export interface RowerSample {
  /** clock.now() 기준 수신 시각 (ms) */
  at: number;
  /** 기기 누적 거리 (m). PM5는 새 운동이 시작되면 0으로 돌아갈 수 있다 */
  distanceM: number;
  /** 현재 페이스 (초/500m). 젓지 않으면 0 */
  paceSec: number;
  spm: number;
  watts: number;
}

export type SourceKind = 'pm5' | 'test';

export type SourceStatus = 'connected' | 'disconnected';

export interface RowerSource {
  kind: SourceKind;
  label: string;
  status: SourceStatus;
  last: RowerSample | null;
  onSample(cb: (s: RowerSample) => void): () => void;
  onStatus(cb: (s: SourceStatus) => void): () => void;
  /** 테스트 모드 수동 젓기용. PM5에서는 아무 일도 하지 않는다 */
  stroke(): void;
  close(): void;
}

/** 구독 관리 헬퍼 */
export class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  on(cb: (v: T) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
  emit(v: T) {
    for (const cb of this.subs) cb(v);
  }
}
