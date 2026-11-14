# web-ui-lab

웹 UI(주로 운영·관제 대시보드)를 만들고, 만드는 과정에서 얻은 디자인·통계 지식을 축적하는 저장소.

## 작업 전에 읽을 것
- `knowledge/learnings.md` — 이전 작업의 결정, 버그, 백로그 (작업 후 반드시 갱신)
- 관련 스킬: `.claude/skills/ops-dashboard-design` (UI), `.claude/skills/lag-analytics` (렉 지표·원인 판별)
- `knowledge/references.md` — 출처가 달린 레퍼런스와 디자인 규칙

## 구조
- `design-system/` — 공용 토큰(`tokens.css`, 다크 우선)과 베이스 스타일
- `boards/<name>/` — 보드별 Vite + React + TS 앱 (ECharts)
- `knowledge/` — 조사 노트와 학습 로그
- `tools/ui-shot.cjs` — Playwright 시각 QA 스크린샷

## 명령
- 개발: `npm run dev:lag` · 빌드: `npm run build:lag` · 테스트: `npm test`
- 시각 QA: 빌드 → `npx vite preview` → `node tools/ui-shot.cjs <url> <png> <w> <h> <theme> full`

## 규칙
- UI 문구는 한국어 위주(지표 약어 p95, RTT 등은 그대로)
- 색은 데이터와 상태에만, 크롬은 무채색. 범주색은 dataviz 검증기로 확인
- 판별 로직을 바꾸면 시나리오 회귀 테스트가 통과해야 한다
