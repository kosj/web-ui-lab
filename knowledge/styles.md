# 보드 스타일 프리셋 — 레퍼런스와 표현 방식

> 2026-11-14. 질문: "더 고급스럽고 시인성 좋은 스타일 없을까? 몇 가지 형태로 만들어 고르고 싶다."
> 구현: `design-system/styles.css`(토큰), `boards/lag-board/src/style-flair.css`(시그니처), `src/lib/style.ts`, `src/components/StyleMenu.tsx`
> 비교 갤러리: `docs/style-gallery/index.html` (스크린샷 포함)
> 스타일 프리셋은 **분석 보드**에 적용된다. 첫 화면인 커맨드 센터는 다크 전용 네온 HUD 한 가지로, `knowledge/command-center.md`에 따로 정리했다.

## 1. 다섯 가지 시안

| 시안 | 레퍼런스 | 핵심 표현 | 테마 | 맞는 곳 |
|---|---|---|---|---|
| 그래파이트 | Linear·Vercel 계열 | 청색 기운 슬레이트, 무채색 크롬, 둥근 카드 | 다크·라이트 | 일상 데스크 (v0.5까지 기본값) |
| 콕핏 | 항공 글래스 콕핏 | B612, 칠흑 배경, 흰 수치·청록 라벨, 경보색은 경보에만, 모서리 베젤 브래킷 | 다크 전용 | 관제실 벽·야간 대응 — **기본값** (2026-11-14 사용자 결정) |
| 터미널 | 금융 터미널 앰버 화면 | 앰버 단색 크롬, 반전 제목 막대, 등폭 숫자, 인광 번짐, 고밀도 | 다크 전용 | 숙련자 고밀도 모니터링 |
| 에디토리얼 | 스위스 국제 타이포그래피 | 흰 종이, 상자 대신 굵은 괘선, 46px 숫자, 대문자 라벨, 넓은 여백 | 라이트 전용 | 보고·공유·사후 분석 (고급감 최고) |
| 글래스 | Apple Liquid Glass(2025) | 반투명 패널(불투명도 ≥60%) + 블러 + 정지 오로라 배경 | 다크·라이트 | 시연·발표 |

## 2. 출처

- **B612:**
  - 에어버스가 2010년 ENAC·툴루즈 대학과 조종석 화면용 서체를 연구했다. Intactile DESIGN이 디자인했다.
  - 저·중해상도 화면 판독성, 피로·인지 부하 감소가 목표다. OFL 등으로 공개됐다.
  - 출처: [GitHub](https://github.com/greebl3/b612), [Fontsource](https://fontsource.org/fonts/b612/about), [GIGAZINE](https://gigazine.net/gsc_news/en/20190121-b612-font-family)
- **항공 경보 색:**
  - 14 CFR / EASA CS 25.1322: 빨강 = 경고, 앰버·노랑 = 주의, 권고 = 그 외 색이다. 빨강·앰버·노랑은 경보 전용으로 남겨 둔다.
  - 청록·마젠타·흰색의 의미는 업계 관행(비규정)이다.
  - 출처: [EASA CS 25](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-large-aeroplanes-cs-25?page=42), [FAA AC 25-11](https://www.faa.gov/sites/faa.gov/files/AC25-11.pdf), [PPRuNe 토론](https://www.pprune.org/flight-testing/179347-warning-caution-advisory-colours.html)
- **금융 터미널 앰버:**
  - 초기 컴퓨팅의 검정 바탕 앰버 글자를 지금도 기본으로 쓴다. 멀리서도 알아보는 정체성이 목적이고, 색은 1991년에 추가됐다.
  - 빨강·초록 관례의 색각이상 문제를 스스로 인정하고 고대비 대안을 연구했다.
  - 출처: [Fast Company](https://www.fastcompany.com/3051883/the-bloomberg-terminal), [Tech at Bloomberg — 색 접근성](https://www.techatbloomberg.com/blog/designing-the-terminal-for-color-accessibility/)
- **스위스 양식:**
  - 수학적 그리드, 중립 산세리프, 넓은 여백, 강조색은 하나(전통적으로 빨강)를 쓴다.
  - Müller-Brockmann의 그리드 체계가 기반이다.
  - 출처: [Print](https://www.printmag.com/?p=1387), [Smashing](https://shop.smashingmagazine.com/2009/07/lessons-from-swiss-style-graphic-design), [UX Planet](https://uxplanet.org/swiss-style-web-design-everything-you-need-to-know-2b128fd327b9)
- **Liquid Glass 가독성 논란:**
  - 2025년 iOS 26 출시 후 반투명 때문에 글자가 안 읽힌다는 비판이 나왔다.
  - Apple은 투명도 조절 옵션과 더 불투명한 변형을 추가했다.
  - 출처: [MacRumors](https://www.macrumors.com/2025/09/17/ios-26-liquid-glass-critiques/), [Infinum](https://infinum.com/blog/apples-ios-26-liquid-glass-sleek-shiny-and-questionably-accessible/), [Digital Trends](https://www.digitaltrends.com/computing/apple-made-liquid-glass-adjustable-which-says-plenty-about-liquid-glass/)
- **텔레메트리 화면:** 흑백 고대비로 경기 중에도 읽히게 하고, 갱신 속도를 묶어 부드럽게 하며, 끊김·지연 상태를 정직하게 표시한다.
  - 출처: [telemetry-type](https://telemetry-type.web.app/), [LightningChart](https://lightningchart.com/?p=90286)

## 3. 구조 — 어떻게 스타일을 바꾸나

- **구조 토큰:** `tokens.css`에 구조 토큰을 추가했다(그래파이트 기본값).
  - `--page-bg`
  - 서체 역할 4종: `--font-display / --font-num / --font-label / --font-chart`
  - 라벨 처리: `--label-color/-case/-track`
  - 카드: `--card-bg/-border/-radius/-shadow/-blur`, 안쪽 면 `--inset-*`, 모서리 `--tile-radius`, `--pill-radius`
  - 크기: `--h2-*`, `--num-*`, `--kpi-size`, `--pad-card`
- **스타일 정의:** `styles.css`의 `:root[data-style='x'][data-theme]`가 색·구조 토큰을 한꺼번에 바꾼다.
  - 특이도를 (0,3,0)으로 두어 테마 블록을 이긴다. 그래서 단일 테마 스타일은 사용자 테마와 무관하게 적용된다.
- **시그니처:** 토큰으로 안 되는 시그니처만 `style-flair.css`에 둔다(베젤 브래킷, 반전 제목 막대, 괘선, 유리 하이라이트).
- **차트:** 캔버스라 CSS를 못 읽는다.
  - `--font-chart`를 포함해 토큰을 다시 읽어 넘긴다.
  - 스타일 서체는 처음 쓰일 때 늦게 내려오므로 `document.fonts`의 `loadingdone`에서 한 번 더 읽어 다시 그린다.
- **적용 순서 버그 방지:** `<html data-style data-theme>`는 렌더 중 멱등 함수(`applyRootAttrs`)로 바로 반영한다.
  - 자식 effect(토큰 읽기)가 부모 effect보다 먼저 돌아서, effect로 미루면 한 박자 늦은 토큰을 읽는다.
- **공유:** 주소의 `#style-<id>`로 특정 스타일을 바로 연다. 아티팩트는 단순 `#이름`만 전달한다.

## 4. 원칙과 예외

- **원인 4색:** 스타일마다 dataviz 검증기로 다시 확인했다.
  - 콕핏·터미널은 기존 다크 팔레트를 그대로 써서 원인 색이 스타일을 바꿔도 같다(운영자 기억 유지).
  - 글래스·에디토리얼은 각 면에 맞게 다시 골랐다.
  - 첫 시안(밝은 청록 등)은 다크 밴드(L 0.48~0.67) 초과·정상시 ΔE 12.8로 실패해 버렸다.
- **크롬 무채색 원칙의 예외:**
  - 터미널은 크롬 전체가 앰버 단색이다(단색 화면에서 데이터 색이 가장 잘 튄다).
  - 콕핏은 라벨·선택이 청록이다(항공 관례 "흰 값 / 청록 조작").
  - 두 예외는 스타일 정의에 명시했다.
- **B612에는 한글이 없다:** 영문·숫자만 B612이고 한글은 Pretendard로 대체된다.
  - B612 Mono는 '.' ':'가 한 칸을 차지해 "5. 5만"처럼 띄어 보여서, 수치는 비례폭 B612를 쓴다.
- **글래스의 가독성 보강:** 패널 불투명도 60% 이상, 배경은 움직이지 않는 그라데이션, 큰 수치에만 옅은 빛 번짐을 둔다. 관제 기본값으로는 권하지 않는다.
- **에디토리얼:** 상자를 없애는 대신 굵은 상단 괘선으로 구획을 유지한다(요약 6px, 카드 3px, KPI 1px). 정보량이 줄어드는 것은 의도한 트레이드오프다.
