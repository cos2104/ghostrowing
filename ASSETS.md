# 외부 에셋과 데이터 출처

| 무엇 | 출처 | 라이선스 | 쓰는 곳 |
| --- | --- | --- | --- |
| 3D 엔진 | [three.js](https://threejs.org) (`Water`, `Sky`, `GLTFLoader` 포함) | MIT | 3D 레이스 화면 |
| 물 노멀 텍스처 (`public/assets/three/waternormals.jpg`) | three.js 저장소 `examples/textures` | MIT | 물결·반사 |
| 하늘 (`public/assets/polyhaven/`) | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) "Kloofendal 48d Partly Cloudy (Pure Sky)" — Greg Zaal, Jarod Guest | CC0 1.0 | 배경 하늘(4K/2K JPG), 조명·반사(1K HDR) |
| 나무·덤불·풀·바위·연잎 (`public/assets/quaternius/nature/`) | [Quaternius](https://quaternius.com/packs/ultimatenature.html) Ultimate Nature Pack | CC0 1.0 | 강둑 자연 |
| 선수·관중 (`public/assets/rocketbox/`) | [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) 선수 Sports_Male_04·Sports_Female_02, 관중 Female_Adult_01·03·12, Male_Adult_01·08·12 | MIT (`LICENSE.md` 동봉) | 노 젓는 선수, 강둑 관중. FBX→GLB 변환, 텍스처 축소(선수 1024px·관중 512px), meshopt 압축, 유니폼 색별 텍스처 생성 |
| 3D 건물·시설 (`public/assets/kenney3d/`) | [Kenney](https://www.kenney.nl) City Kit (Commercial·Suburban), Racing Kit | CC0 1.0 | 빌딩·주택·관중석·깃발 |
| 2D 나룻배·캐릭터 (`public/assets/kenney/`) | Kenney Pirate Pack, Racing Pack | CC0 1.0 | 시작 화면 캐릭터 미리보기, 3D를 못 쓰는 기기의 대체 화면 |
| 경기정·노 3D 모델 | 직접 제작 (`src/three/scull.ts`) | — | 배·리거·노 (선수 캐릭터를 불러오기 전 대체 몸 포함) |
| 국기 | 직접 그림 (`src/countries.ts`, 단순화) | — | 레인 카드·순위표 |
| 지도 엔진 | [MapLibre GL JS](https://maplibre.org) | BSD-3-Clause | 코스 전체 미니맵 |
| 지도 타일·스타일 | [OpenFreeMap](https://openfreemap.org) (Liberty) | 무료, API 키 없음 | 미니맵 |
| 지도 데이터 | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | ODbL | 미니맵, 코스 좌표(`src/courses/data.ts`) |

- Kenney 에셋 원본은 GitHub 미러 `shorepine/kenney`에서 받았고, 라이선스 원문은 각 폴더의 `LICENSE.txt`에 있다.
- Quaternius 에셋은 GitHub `trebeljahr/quaternius-showcase`의 GLB를 썼다(팩별 라이선스 표 `LICENSES.md` 기준 모두 CC0).
- Poly Haven 하늘은 공식 API(`api.polyhaven.com`)에서 받은 톤매핑 JPG를 4K·2K로 줄였다.
- 미니맵의 OpenStreetMap 출처 표기는 지우지 않는다.
- 중계 그래픽은 실제 중계 화면의 배치를 참고했지만 World Rowing·올림픽 로고나 디자인은 쓰지 않는다. 광고판 문구도 자체 문구.
