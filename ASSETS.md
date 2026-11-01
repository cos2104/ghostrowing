# 외부 에셋과 데이터 출처

| 무엇 | 출처 | 라이선스 | 쓰는 곳 |
| --- | --- | --- | --- |
| 나룻배 (`dinghyLarge1~3.png`) | [Kenney](https://www.kenney.nl) Pirate Pack | CC0 1.0 | 레이스 화면의 배 |
| 선수 캐릭터 (`character_*.png`) | [Kenney](https://www.kenney.nl) Racing Pack | CC0 1.0 | 배에 탄 선수, 캐릭터 선택 |
| 지도 엔진 | [MapLibre GL JS](https://maplibre.org) | BSD-3-Clause | 레이스 화면 지도 |
| 지도 타일·스타일 | [OpenFreeMap](https://openfreemap.org) (Liberty 스타일) | 무료, API 키 없음 | 레이스 화면 지도 |
| 지도 데이터 | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | ODbL | 지도, 코스 좌표(`src/courses/data.ts`) |

- Kenney 에셋 원본은 GitHub 미러 `shorepine/kenney`에서 받았고, 라이선스 원문은 `public/assets/kenney/LICENSE.txt`에 있다.
- OpenStreetMap 출처 표기는 지도 오른쪽 아래 표기로 한다(지우지 말 것).
- 코스 좌표는 OpenFreeMap 타일의 수면(water) 데이터로 강 중앙선을 계산해 만들었다. 경로가 양쪽 강변에서 20m 이상 떨어져 있는지 검사했다.
