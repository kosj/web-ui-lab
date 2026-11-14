# web-ui-lab

웹 UI(주로 운영·관제 대시보드)를 만들고, 만드는 과정에서 얻은 디자인·통계 지식을 축적하는 저장소.

## 작업 전에 읽을 것
- `knowledge/learnings.md` — 이전 작업의 결정, 버그, 백로그 (작업 후 반드시 갱신)
- 관련 스킬: `.claude/skills/ops-dashboard-design` (UI), `.claude/skills/lag-analytics` (렉 지표·원인 판별)
- `knowledge/references.md` — 출처가 달린 레퍼런스와 디자인 규칙
- `knowledge/motion.md` — 모션 조사와 규칙 (모션을 넣거나 바꿀 때)
- `knowledge/user-signals.md` — 채팅 제보·TCP 재전송 상관 분석 방법 (유저 신호를 다룰 때)
- `knowledge/styles.md` — 스타일 프리셋 5종의 레퍼런스·구조·예외 (스타일을 바꾸거나 추가할 때). 기본 스타일은 콕핏

## 구조
- `design-system/` — 공용 토큰(`tokens.css`, 다크 우선), 모션 토큰(`motion.css`), 스타일 프리셋(`styles.css`), 베이스 스타일
- `boards/<name>/` — 보드별 Vite + React + TS 앱 (ECharts)
- `knowledge/` — 조사 노트와 학습 로그
- `tools/ui-shot.cjs` — Playwright 시각 QA 스크린샷

## 명령
- 개발: `npm run dev:lag` · 빌드: `npm run build:lag` · 테스트: `npm test`
- 시각 QA: 빌드 → `npx vite preview` → `node tools/ui-shot.cjs <url> <png> <w> <h> <theme> full`

## Git 규칙
- 기본 브랜치는 `main`. 작업은 작업 브랜치에서 하고 `main`에 머지한다
- **머지가 끝나면 작업 브랜치는 무조건 삭제한다** (원격·로컬 모두, 예외 없음)
  - 삭제 전 확인: 작업 브랜치의 모든 커밋이 `main`에 들어갔는지 `git merge-base --is-ancestor <작업 브랜치> origin/main`으로 확인
  - 작업 브랜치가 GitHub 기본 브랜치로 지정돼 있으면 삭제가 거부되므로, 먼저 기본 브랜치를 `main`으로 바꾼 뒤 삭제
  - 다음 작업은 최신 `main`에서 새 작업 브랜치를 만들어 시작

## 규칙
- UI 문구는 한국어 위주(지표 약어 p95, RTT 등은 그대로)
- 색은 데이터와 상태에만, 크롬은 무채색(예외: 터미널·콕핏 스타일, `knowledge/styles.md`). 범주색은 dataviz 검증기로 확인
- 모션은 시간 흐름·상태 변화·흐름을 설명할 때만. 모션 토글(`data-motion`)과 `prefers-reduced-motion`을 반드시 따른다
- 판별 로직을 바꾸면 시나리오 회귀 테스트가 통과해야 한다
