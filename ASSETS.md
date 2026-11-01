# 외부 에셋과 데이터 출처

| 무엇 | 출처 | 라이선스 | 쓰는 곳 |
| --- | --- | --- | --- |
| 3D 엔진 | [three.js](https://threejs.org) (`Water`, `Sky`, `GLTFLoader` 포함) | MIT | 3D 레이스 화면 |
| 물 노멀 텍스처 (`public/assets/three/waternormals.jpg`) | three.js 저장소 `examples/textures` | MIT | 물결·반사 |
| 3D 배경 모델 (`public/assets/kenney3d/`) | [Kenney](https://www.kenney.nl) Nature Kit, City Kit (Commercial·Suburban), Racing Kit | CC0 1.0 | 나무·빌딩·주택·관중석·깃발 |
| 2D 나룻배·캐릭터 (`public/assets/kenney/`) | Kenney Pirate Pack, Racing Pack | CC0 1.0 | 시작 화면 캐릭터 미리보기, 3D를 못 쓰는 기기의 대체 화면 |
| 경기정·선수 3D 모델 | 직접 제작 (`src/three/scull.ts`) | — | 배와 노 젓는 선수 |
| 국기 | 직접 그림 (`src/countries.ts`, 단순화) | — | 레인 카드·순위표 |
| 지도 엔진 | [MapLibre GL JS](https://maplibre.org) | BSD-3-Clause | 코스 전체 미니맵 |
| 지도 타일·스타일 | [OpenFreeMap](https://openfreemap.org) (Liberty) | 무료, API 키 없음 | 미니맵 |
| 지도 데이터 | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | ODbL | 미니맵, 코스 좌표(`src/courses/data.ts`) |

- Kenney 에셋 원본은 GitHub 미러 `shorepine/kenney`에서 받았고, 라이선스 원문은 각 폴더의 `LICENSE.txt`에 있다.
- 미니맵의 OpenStreetMap 출처 표기는 지우지 않는다.
- 중계 그래픽은 실제 중계 화면의 배치를 참고했지만 World Rowing·올림픽 로고나 디자인은 쓰지 않는다. 광고판 문구도 자체 문구.
