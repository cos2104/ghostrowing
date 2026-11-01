export type LngLat = [number, number];

export interface CourseDef {
  id: string;
  name: string;
  region: string;
  description: string;
  /** 레인 간격 (m). 강폭이 좁은 코스는 작게 */
  laneWidth: number;
  /** 카메라 줌 (기본 17.4). 강폭이 넓으면 작게 해서 강변이 보이게 */
  zoom?: number;
  /** 3D 배경 테마 */
  theme: 'lake' | 'city' | 'countryside' | 'brick';
  /** 순환 코스 (거리 제한 없이 탈 수 있음) */
  loop?: boolean;
  /** 출발 쪽 → 결승선(마지막 점). 2000m 이상. 순환 코스는 빈 배열 */
  coords: LngLat[];
}
