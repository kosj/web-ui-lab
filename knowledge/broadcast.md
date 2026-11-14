# 라이브 중계 — 레이스·e스포츠 중계 그래픽으로 만든 관제 화면

> 2026-11-14. 요청: "다른 레퍼런스를 찾아 동적인 웹 페이지로 하나 더 제작해줘" (UI 스타일을 정하는 과정, 이전 후보는 모두 보존)
> 구현: `boards/lag-board/src/broadcast/` (Broadcast · TimingTower · ScoreBug · OnAir · RaceControl · LowerThird · SessionBar · race · palette · broadcast.css)
> 데모: `docs/media/broadcast.mp4` · 후보 비교 갤러리: `docs/index.html`

## 1. 결론 — 움직임의 주제를 "흐름"에서 "순위와 사건"으로

- **세 번째 화면 후보 `#broadcast`를 만들었다.** 커맨드 센터(지도·흐름)와 같은 모델을 쓰되 중계 그래픽 문법을 쓴다.
- **지금 가장 나쁜 서버는 타이밍 타워가 답한다.**
  - 순위는 최근 5분 평균 체감 지연 기준이다. 순위가 바뀌면 줄이 실제로 자리를 옮긴다(FLIP).
  - 화면에 나온 서버는 타워에서 흰 바탕으로 반전된다.
- **무슨 일이 언제 났는지는 관제 메시지(레이스 컨트롤)와 자막(로워서드)이 답한다.**
  - 감지·격상·해소·배포·측정 사각지대가 시각순으로 쌓인다.
  - 새 경보는 6초 자막으로 뜬다.
- **ON AIR 자동 연출.** 카메라가 레이스를 따라가듯 화면이 서버를 따라간다.
  - 하이라이트 중에는 그 장애, 자막이 떠 있으면 그 장애, 아니면 타워 1위를 비춘다.
  - 타워에서 고르면 고정되고, AUTO 버튼으로 풀린다.
- **하이라이트 재생.** 오늘의 장애를 시작 순으로 이어 재생한다(중계 하이라이트 패키지). 사용자가 시작할 때만 움직인다.
- **색:** 정상(쾌적·양호)은 회색이고, 색은 노랑(주의)·주황(경고)·빨강(심각)에만 쓴다. 레이스 깃발처럼 "색이 보이면 일이 났다". 원인 4색은 다른 화면과 같다.

## 2. 레퍼런스와 가져온 것

| 레퍼런스 | 가져온 것 | 버린 것 |
|---|---|---|
| F1 중계 타이밍 타워 | 왼쪽 고정 순위표, 화면에 나온 선수 강조, 굵은 순위 숫자(HD에서 안 읽힌다는 불만 → 순위 숫자를 가장 굵게) | 0.1초 단위 간격(2026 변경이 "잘라 버림" 논란) → 기준 대비 정수 ms |
| F1 레이스 컨트롤 메시지 · 깃발 | 시각순 메시지 피드, 상태색 = 깃발(평상은 무색) | 페널티 표기 |
| F1 텔레메트리 트레이스 | ON AIR 아래 90분 트레이스: 기준선 위에 원인별 초과를 쌓고 흰 선 = 체감 지연 | 두 선수 비교(델타) |
| F1 타이어 표시 | 원 안의 한 글자로 주 원인 표시 (인/네/서/클, 테두리 = 원인색) | 타이어 수명 |
| DixonBaxi F1 그래픽 시스템 | 실시간 데이터를 미리 만든 그래픽 부품에 꽂고 연출자가 고르는 구조 → 부품(타워·스테이지·자막·메시지) + 자동 연출 | 300여 개 부품 |
| Riot Worlds (Tendril, Buck) | 모듈형 모션 시스템, 오버레이는 "경기를 읽는 시스템"이고 화면과 경쟁하지 않는다 | 브랜드 3D·XR |
| Fox IndyCar(2025)·NASCAR(2026) | 원시 숫자를 쏟지 않는 편집형 데이터, 굵은 활자 | 고스트카 AR |
| 스포츠 자막 가이드 | 자막 노출 3~6초, 짧은 문장, 단색 바탕 고대비, 간결한 등장 | 장식 트랜지션 |
| FLIP (Paul Lewis, 2015) | 목록 재정렬 애니메이션: 이전·이후 위치를 재고 transform으로 되돌려 재생 | 라이브러리 |

출처는 다음과 같다(검색 결과 요약 근거).

- [GPFans — 2026 타이밍 타워 변경 반응](https://www.gpfans.com/en/f1-news/1078428/f1-2026-tv-broadcast-new-timing-tower-graphic/)
- [Autosport 포럼 — 타이밍 타워 비판](https://forums.autosport.com/topic/225206-death-by-a-thousand-cuts-is-f1s-timing-tower-too-much-of-a-good-thing)
- [Motorsport Broadcasting — 2018 F1 그래픽 분석](https://motorsportbroadcasting.com/2018/04/22/analysing-formula-1s-new-on-air-package/)
- [Black Book Motorsport — DixonBaxi](https://www.blackbookmotorsport.com/features/dixonbaxi_the_business_behind_formula_ones_broadcast_branding/)
- [DixonBaxi F1 사례](https://dixonbaxi.com/case-study/formula-1)
- [Stash — Tendril Worlds 2022](https://www.stashmedia.tv/tendril-ramps-up-riot-worlds-2022-with-branding-toolkit/)
- [Buck — Worlds](https://buck.co/work/riot-games-world-championships)
- [LHM — LoL 오버레이 원칙](https://lhm.gg/blog/what-makes-a-good-lol-broadcast-overlay)
- [NewscastStudio — Fox IndyCar](https://www.newscaststudio.com/2025/03/21/indycar-on-fox-broadcast-design/)
- [NewscastStudio — Fox NASCAR 2026](https://www.newscaststudio.com/2026/02/26/fox-sports-redesigns-nascar-graphics-with-bold-type-and-upgraded-data-display)
- [School of Motion — 스포츠 자막](https://www.schoolofmotion.com/blog/sports-lower-thirds)
- [Josh Comeau — Animating the unanimatable (FLIP)](https://www.joshwcomeau.com/react/animating-the-unanimatable/)
- [Creative Bloq — FLIP technique](https://www.creativebloq.com/features/create-animations-with-the-flip-technique)

## 3. 배치

```
상단: [LAG|LIVE] 렉 라이브 중계 · [커맨드 센터 | 라이브 중계 | 분석 보드] · LIVE 시계 · 모션
점수판: 전체 + 6권역 (값 · 1시간 증감 · 등급 띠 · 장애 수)
┌ 타이밍 타워 384 ─┬ ON AIR 스테이지 ───────────────────┬ 관제 메시지 330 ┐
│ 16위까지         │ 서버명 · 큰 숫자 · 등급 깃발 · 델타 │ 최신이 위        │
│ 순위·변동·원인   │ 텔레메트리 90분 · 구성 막대 · 계기 6 │                  │
│                  │ (자막이 아래에 6초)                │                  │
├ 세션 막대(24시간) + 하이라이트 카드(장애별 재생·분석 보드로) ─────────────┤
```

- **반응형:** ≤1360px에서는 메시지가 아래 전폭이 되고, ≤900px에서는 한 줄이다. ≤560px 점수판은 4열 두 줄이며, 코드 위·값 아래로 놓고 증감은 생략한다.

## 4. 규칙

- **순위 안정화(히스테리시스 3ms):** 이전 순서에서 출발해, 바로 위보다 3ms 넘게 나쁠 때만 올린다(`stabilizeRanks`).
  - 하이라이트 재생 9초 동안 타워 애니메이션 호출이 758회에서 112회로 줄었다. 거의 같은 값끼리 매 틱 자리를 바꾸던 출렁임이 사라졌다.
  - 회귀 테스트(`__tests__/race.test.ts`): 문턱보다 큰 역전이 없을 것, 재생 중 자리 바뀜이 원래의 70% 미만일 것.
- **5분 평균 순위:** 분 단위 잡음으로 순위가 흔들리지 않게 한다. 지금 이 분의 값은 ON AIR가 보여 준다.
- **순위 변동:** 10분 전 대비이고, 위 화살표는 악화(노랑), 아래 화살표는 회복(회색)이다. 순위를 올린 줄은 0.9초 노란 번쩍임을 준다.
- **관제 메시지 생성(`raceMessages`):**
  - 감지는 등급이 낮아도 최소 '주의'로 표시한다(감지 자체가 경보).
  - 격상은 경고·심각이 **3분 이상 유지**될 때만 낸다(한두 분 튐 무시).
  - 배포는 변경 이력 시각, 사각지대는 시작 5분 뒤에 낸다.
- **자막:** 그 시점의 최근 30분 안 경보가 바뀔 때만 6초 동안 띄운다(퇴장 0.32초). 메시지를 누르면 그 시점으로 가서 다시 띄운다.
- **점수판 장애 수:** 권역 칸은 그 권역 장애만 센다. 전역(클라) 장애까지 세면 모든 칸에 같은 숫자가 떠서 신호가 사라진다.
- **타이포:** 숫자·코드는 Barlow Condensed(좁은 고딕, 600~800 기울임 없음), 순위·코드만 기울임이다. 한글은 Pretendard 700~800이다.
- **크롬:** 무채색이다. 흰 바탕 검정 글자의 기울인 탭(clip-path)이 시그니처다. 모서리는 각지게(반경 0~2px) 둔다.

### 모션 목록

| 모션 | 의미 | 모션 끔 |
|---|---|---|
| 타워 줄 이동(FLIP 300~560ms) · 노란 번쩍임 | 순위 변화(악화) | 즉시 재배치 |
| 자막 와이프 인(480ms) · 6초 노출 | 새 경보 | 즉시 표시, 같은 6초 |
| 관제 메시지 내려오기 | 새 메시지 | 즉시 |
| ON AIR 서버명 미끄러짐 · 텔레메트리 선 그리기 | 카메라 전환(상태 변화) | 즉시 |
| 패널 와이프(처음 한 번) | 로딩 → 준비 | 즉시 |
| LIVE 점 · AUTO 점 깜빡임 | 지금 생방송·자동 연출 중 | 정지 |
| 하이라이트 연속 재생 | 시간 흐름 (사용자가 시작) | 재생은 되고 전환만 즉시 |

## 5. 버그·교훈

- **텔레메트리 선이 점선으로 보였다.** `pathLength=1`과 `stroke-dasharray: 1`로 그리기 애니메이션을 하면 Chrome이 대시를 정규화하지 않아 1px 점선이 된다.
  - 충분히 긴 고정 대시(4000)로 바꿨다. 교훈: pathLength 정규화에 기대지 말 것.
- **FLIP은 WAAPI(`element.animate`)로 했다.** CSS 전환이 아니므로 `data-motion` 전역 규칙이 닿지 않는다. 그래서 `useMotionOn()`으로 직접 끈다.
- **점수판 칸이 모바일에서 세로로 쪼개졌다.** 코드가 한 글자씩 줄바꿈되고 증감이 "+12/6"으로 갈라졌다.
  - 좁은 폭 전용 배치(두 줄, 증감 생략)를 두고 `white-space: nowrap`을 줬다.
- **화면별 구분:** 세 번째 화면도 접두어 클래스(`bc-*`), 버튼 리셋 `:where(.bc) button`, 루트 토큰 `:root[data-view='broadcast'][data-style][data-theme]`를 따랐다.
  - 커맨드 센터에서 배운 충돌 방지 규칙을 그대로 적용했고, 충돌은 없었다.

## 6. 백로그

- 타워 행이 16개를 넘으면 접은 나머지를 "외 20개"로만 표시한다. 권역 필터를 켜면 전부 보인다. 벽 화면용 자동 페이지 넘김을 검토한다.
- 두 서버 비교(F1 델타 트레이스)를 스테이지에 추가한다: 같은 랙의 정상 서버와 비교.
- 관제 메시지에 사람 조치(확인·담당 배정)를 붙이려면 저장소가 필요하다(아티팩트 db 기능 검토).
