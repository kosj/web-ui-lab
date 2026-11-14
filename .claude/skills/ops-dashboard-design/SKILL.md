---
name: ops-dashboard-design
description: web-ui-lab에서 운영·관제(NOC, 라이브옵스, 장애 대응) 대시보드나 보드 UI를 만들거나 고칠 때 사용. 정보 구조, 디자인 토큰, 상태·원인 색 규칙, 차트 규칙(ECharts), 모션(재생·롤링 숫자·경보 링·입자 흐름·뷰 전환), 상호작용, 시각 QA 절차를 담는다. 렉 보드 같은 게임 서비스 보드, 지표 히트맵, KPI 스트립, 장애 판정 카드, 서버 그리드를 만들 때 먼저 읽는다.
---

# 관제 대시보드 디자인 스킬

새 보드는 `boards/<name>/`에 만들고 `design-system/`을 공유한다. 시작 전에 읽을 것:

1. `knowledge/learnings.md` — 이전 보드의 결정·버그·백로그
2. `knowledge/references.md` §2 — 출처가 달린 25개 디자인 규칙
3. 참조 구현: `boards/lag-board/src/` (컴포넌트별 패턴은 아래 표)

## 1. 정보 구조 — 위에서 아래로 "요약 → 패턴 → 개체 → 근거"

| 층 | 역할 | 렉 보드 구현 |
|---|---|---|
| 요약 배너 | 한 문장으로 "지금 무엇이 얼마나 나쁜가" + 진행 중 장애 칩 | `SummaryBanner.tsx` |
| KPI 스트립 | 4~6개 숫자 + 등급 필 + 델타 + 스파크라인 | `KpiStrip.tsx` |
| 필터 행 | 범위를 정하는 칩 한 줄. 모든 차트가 같은 필터를 따름 | `App.tsx` `.filters` |
| 패턴 | 그룹 × 시간 히트맵 + 장애 레인(같은 시간축) | `RegionHeatmap.tsx` |
| 원인 | 기준선 + 원인별 초과분 누적 영역 + 현재 기여 막대 | `CauseBreakdown.tsx` |
| 판정 | 원인 배지·등급·범위·시간·감지·영향·신뢰도·근거(범위/신호/배제) | `IncidentList.tsx` |
| 개체 | 토폴로지 순서(권역 → DC 랙) 타일 격자 | `ServerGrid.tsx` |
| 세그먼트 | 통신사 매트릭스(전체) / 통신사 표 + 강조 추이(권역) | `IspDrilldown.tsx` |
| 분포 | 유저 단위 지연 분포 히트맵(로그 축) + 두 갈래 안내 | `DistributionHeatmap.tsx` |
| 근거 | 선택 개체의 small multiples (축 하나씩, 십자선 동기화) | `ServerDetail.tsx` |
| 방법 | 임계값·공식·판정 규칙·출처 | `MethodNote.tsx` |

## 2. 토큰과 색 (design-system/tokens.css)

- **다크 우선**: bare `:root`에 다크 값, `prefers-color-scheme: light` + `:not([data-theme=dark])`와 `[data-theme=light]`에 라이트 값. 컴포넌트는 토큰만 쓴다.
- 중립색은 청색으로 살짝 기운 슬레이트. 순수 회색 금지.
- **hue 예산**: UI 크롬(버튼·선택·포커스)은 무채색. 색은 데이터(원인)와 상태에만.
- **상태 5단계** 쾌적·양호·주의·경고·심각. 쾌적·양호는 무채(조용함), 주의 이상만 노랑·주황·빨강. 항상 아이콘 모양 + 한글 라벨을 함께 쓴다.
  - 필 안 글자: 노랑·주황 → 짙은 글자, 빨강 → 흰 글자.
  - 아이콘만 상태색, 글자는 잉크색(`.tier-ink-*`).
- **원인 4색**: blue·aqua·violet·magenta. 상태색과 hue가 겹치지 않는다. 새 범주색을 추가하면 반드시 검증한다.
  ```bash
  node <dataviz-skill>/scripts/validate_palette.js "#3987e5,#199e70,#9085e9,#d55181" --mode dark --surface "#14171c"
  ```
  배지는 색 점 + 아이콘 + 라벨로 만들어 색만으로 구분하지 않게 한다.
- 폰트: Pretendard Variable(npm `pretendard`, dynamic subset). 정렬되는 숫자(표·축)엔 `tabular-nums`, 큰 히어로 숫자는 비례폭.

## 3. 차트 규칙 (ECharts 5, `boards/*/src/charts/`)

- `echarts/core`에 필요한 차트만 등록(`charts/echarts.ts`), 수명주기는 `useChart` 훅. 캔버스는 CSS 변수를 못 읽으므로 `readTokens()`로 계산값을 넘기고 테마 변경 시 다시 그린다.
- **시간축은 category + 직접 만든 KST 라벨**을 쓰고, 구간 라벨은 **끝 시각**으로 단다. `hideOverlap: true`를 켠다.
- 축은 하나만 쓴다(이중 축 금지). 단위가 다르면 small multiples로 나눈다.
- 백분위: 꼬리는 p95. 분해(가법)가 필요할 때만 평균을 쓰고 제목에 명시한다.
- 임계선은 실선 헤어라인에 상태색, 라벨은 왼쪽 `insideStartTop`(최신 데이터가 오른쪽에 몰림).
- 주석: 배포 세로선, 선택 시각 커서(잉크색 1.5px)를 모든 시간 차트에 같은 위치로 둔다.
- 참조선(전일 기준선)은 점선(dotted) — "참조"라는 의미일 때만 점선을 쓴다. 그리드는 실선 헤어라인.
- 누적 영역 사이는 1px 표면색 선으로 띄운다(테두리 대신 간격).
- 축 최대값은 `niceCeil`로 반올림한다.
- 툴팁은 보조 수단일 뿐이다. 핵심 카드엔 "표로 보기" 토글을 둔다.
- 스파크라인은 SVG(`Sparkline.tsx`)로 그린다. 늘어나는 SVG 위의 끝점 원은 HTML로 겹친다.

### 분포 히트맵 규칙
- 세로축은 로그 눈금으로 하고, 구간 경계에 등급 임계값을 포함시킨다. 축 라벨 대신 기준선(markLine) 라벨로 50·100·150·250·500·1000을 표시한다.
- 색은 **밀도(비율 ÷ 로그 폭)**로 칠한다. 감마 0.45와 하한 0.1을 적용하고, 원인·상태 hue와 겹치지 않는 무채 램프(`--density-0/1`)를 쓴다.
- 겹친 p50·p95 선에는 표면색 테(선폭+3px)를 먼저 깐다.
- 카드 하단에 선택 시점의 "150ms 이상 비율(명수) · p50 · p95"를 문장으로 쓴다. 두 갈래가 감지되면 다음 행동을 알려 주는 안내를 띄운다.

### 세그먼트(통신사 등) 규칙
- 여러 세그먼트 선은 **강조 1개 + 회색 나머지 + 끝 라벨**로 그린다. 범주색을 새로 만들지 않는다.
- 세그먼트 상태색은 "그 세그먼트 고유의 이상"일 때만 칠한다. 공통 원인(클라 패치 등)으로 오른 값으로 칠하지 않는다.
- 전체 범위에서는 매트릭스로 개요를 보여 주고 칸을 누르면 좁혀 들어간다. 선택은 필터 칩으로 보이게 하고 해제할 수 있게 한다.

## 4. 상호작용

- 상태 하나로 모든 패널을 연동한다: 기간(1h/6h/24h), 커서 시각(null=LIVE), 범위 필터, 선택 개체.
- 셀·차트를 클릭하면 커서 시각이 이동한다. 과거 시점을 볼 때는 상단에 "과거 시점 HH:MM · LIVE로 복귀"를 띄운다.
- 장애 카드를 클릭하면 범위 필터, 통신사(통신사 범위 장애), 가장 나쁜 서버, 시점(해소된 장애는 피크)이 한꺼번에 설정된다.
- 상호작용 흐름은 Playwright로 실제 클릭을 재현해 검증한다(예: 장애 카드 클릭 → 필터 칩 해제 → 분포 변화).
- 측정 자체의 상태(수집 정상·서버 수·주기)를 상단에 상시 표시한다.

## 4-1. 모션 (상세: `knowledge/motion.md`, 토큰: `design-system/motion.css`)

- **모션의 역할:** 시간 흐름, 상태 변화, 흐름 세 가지를 설명할 때만 쓴다. 장식용 반복 모션은 금지한다(LIVE 점만 예외).
- **productive/expressive 구분:** 값·커서·전환은 productive(`--dur-moderate-02`~`--dur-slow-01`, `--ease-productive`)로 한다. 새 장애 등장과 등급 상승처럼 악화를 알릴 때만 expressive로 한다.
- **재생(replay):** `useReplay`(rAF, React 갱신 120ms)를 쓴다. 커서는 `ChartCursor` HTML 오버레이로 그린다. `:root[data-replay=on]`일 때 미래 영역을 흐리게 하고 커서를 선형 이동시킨다. 사용자가 직접 시점을 고르면 재생을 끝낸다. 현재 시각에 도달하면 LIVE로 복귀한다.
- **커서를 차트 옵션에 넣지 않는다:** 옵션 memo에서 커서(t) 의존성을 빼야 재생 중 차트를 다시 그리지 않는다.
- **차트 모핑:** series에 id를 주고 `useChart(option, { merge: true })`로 쓴다. 칸이 수천 개인 히트맵은 `animation: false`로 둔다.
- **숫자:** `RollingNumber`를 쓴다. 고스트 숫자로 기준선을 유지하고, 롤링 중에는 tabular-nums를 쓴다.
- **경보 링:** `useEscalation(rank)` 키로 `.pulse-ring`을 다시 마운트해서, 등급이 오를 때만 2회 재생되게 한다.
- **입자·캔버스 모션:** 반드시 지표를 인코딩해야 하고, 강조 배율은 범례에 적는다. 모션이 꺼지면 같은 인코딩의 정지 화면을 그린다. IntersectionObserver와 `visibilitychange`로 멈춘다.
- **드릴다운 전환:** `withViewTransition(fn, enabled)`로 감싼다. 재생 중이거나 모션이 꺼져 있으면 즉시 적용한다.
- **접근성:** 상단 모션 토글 하나로 모든 모션을 멈춘다(`<html data-motion>`, WCAG 2.2.2). 기본값은 `prefers-reduced-motion`을 따른다.
- **검증:** Playwright로 재생 버튼 클릭 → 시계와 커서 transform이 진행하는지 확인한다. 캔버스는 `toDataURL()`을 두 번 비교해 모션 켜짐이면 바뀌고 꺼짐이면 그대로인지 본다. 녹화(`recordVideo`) 후 ffmpeg로 mp4·gif를 만든다.

## 5. 반응형

- 거터는 `max(16px, env(safe-area-inset-*))`. 가로 스크롤은 0이어야 하고, 표만 `overflow-x: auto` 컨테이너를 허용한다.
- 그룹 열 수는 항목 수의 약수로 고정한다(6권역 → 6/3/2/1열). 혼자 남는 행을 만들지 않는다.
- 좁은 타일의 라벨은 `nowrap`, 줄 단위로 `flex-wrap`.

## 6. 시각 QA 절차 (매 변경 후)

```bash
npm run build -w boards/<name>
```

```bash
npx vite preview --port 4173 --strictPort
```

```bash
node tools/ui-shot.cjs http://localhost:4173/ shots/dark-1600.png 1600 1000 dark full
```

다음 세 가지 조합을 찍는다.

- 1600 다크
- 1280 라이트
- 400 다크(모바일)

출력의 `overflowX`가 0이고 `problems`가 비어 있어야 한다. 스크린샷에서 확인할 것:

- 라벨 겹침·잘림(축, 임계선 라벨, 레인 라벨)
- 혼자 남은 행, 소수점 축 눈금
- 데모 데이터의 대비: 모든 것이 빨갛거나 모든 것이 정상이면 판단이 보이지 않는다.

배운 점은 `knowledge/learnings.md`에 추가한다.

## 7. Artifact 미리보기 게시

`npm run build:artifact -w boards/<name>`을 실행하면 `dist-artifact/`에 본문 조각 `index.html`과 `assets/*`가 생긴다. 이를 Artifact tool의 `files`(assets 경로 매핑)로 게시한다. 페이지 조각에는 `<title>`과 `claude:viewport-fit-sides` 메타를 둔다.
