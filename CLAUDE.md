# CLAUDE.md

PLAN.md가 기준 문서다. **지금은 1단계(혼자 고스트 레이스)만 작업한다.** 0단계는 완료(PLAN.md 참고).

## 작업 규칙

- PLAN.md의 현재 단계 범위 밖 기능은 만들지 않는다. 다음 단계가 필요해 보이면 먼저 묻는다
- 단계마다 구현 계획을 먼저 제시하고, 확인을 받은 뒤 진행한다
- PM5 UUID·바이트 형식은 Concept2 공식 PM5 Bluetooth 통신 사양서로 확인한다. 추측한 값은 코드에 `TODO(사양서 확인)`로 표시한다
- PM5 바이트 해석 코드는 실제 받은 패킷 샘플로 단위 테스트를 만든다
- 단계가 끝나면 PLAN.md의 완료 기준 체크박스를 갱신하고 커밋한다

## 기술 스택

Vite + TypeScript (프레임워크 없음), Canvas 2D, Firebase Realtime Database + 익명 로그인, IndexedDB, Vercel 배포(HTTPS 필요).
