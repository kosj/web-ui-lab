# 관제 대시보드 모션 가이드 — 조사 노트와 적용 규칙

> 조사일 2026-11-14. 질문: "렉 보드에 모션 그래픽이 들어갈 자리가 있나? 최신 자료 기준으로 어디에 어떻게?"
> 수집 방법: 웹 검색 결과 발췌. 원문을 직접 열지 못한 곳이 있어 수치는 원문 확인을 권장.

## 1. 출처 요약

| 주제 | 출처 | 렉 보드에 가져온 것 |
|---|---|---|
| 지속시간·이징 토큰 | [Carbon Motion](https://carbondesignsystem.com/elements/motion/overview/), [@carbon/motion](https://npmjs.com/package/@carbon/motion) | productive(업무용, 빠르고 조용함) / expressive(경보·알림 같은 중요한 순간). 지속시간 70·110·150·240·400·700ms, standard productive `cubic-bezier(0.2,0,0.38,0.9)`, expressive `cubic-bezier(0.4,0.14,0.3,1)` |
| 스프링 모션 | Material 3 Expressive 관련 구현·해설 ([besthub 해설](https://www.besthub.dev/articles/why-google-s-material-3-update-turns-motion-into-a-theme-it-s-not-about-the-bounce-9436fce4a345), [Koder physics spec](https://meta.koder.dev/specs/themes/motion/physics/)) | 모션을 테마 수준 토큰으로 관리, 공간(spatial)과 효과(effects) 토큰을 분리, 공간 이동은 스프링. 공식 문서는 직접 확인하지 못함(비공식 요약) |
| 애니메이션 전환 | [Heer & Robertson 2007, Animated Transitions in Statistical Data Graphics](https://idl.uw.edu/papers/animated-transitions) ([PDF](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf)) | 같은 마크는 같은 데이터를 유지하며 이동(congruence), 단순·예측 가능, 복잡하면 단계로 나누기, 필요한 만큼만 길게. 후속 연구: 추세 비교는 애니메이션보다 small multiples가 더 정확 → 비교는 정적, 시간 흐름 설명에만 애니메이션 |
| 뷰 전환 | [web.dev: same-document view transitions Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available), [Chrome: View transitions in 2025](https://developer.chrome.com/blog/view-transitions-in-2025) | 2025-10 Firefox 144 합류로 Baseline. Chrome 111·Safari 18. 라이브러리 없이 드릴다운 전환 가능 |
| 숫자 전환 | [NumberFlow](https://openapps.pro/packages/number-flow-react) | 자릿수 롤링으로 값 변화를 "흐름"으로 보여 줌. Intl.NumberFormat 기반 |
| 접근성 | [WCAG 2.2 SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide), [GOV.UK 해설](https://github.com/alphagov/guide-to-wcag/wiki/2.2.2) | 자동 갱신·움직이는 콘텐츠는 일시정지/정지/숨김 또는 갱신 주기 조절 수단 필요. 자동 갱신에는 "5초 예외"가 없다. 모든 움직임을 한 번에 멈추는 단일 수단 권장 |
| 네트워크 흐름 시각화 | [sFlow-RT particle](https://github.com/sflow-rt/particle), [NIST 네트워크 시각화](https://webarchive.library.unt.edu/web/20120924213210/http://www.itl.nist.gov/ITLPrograms/ComplexSystems/IOM_May08.pdf) | 입자 애니메이션으로 실시간 흐름 표현, 마우스를 올리면 멈춤. 크기·색·밝기를 애니메이션으로 시계열 표현 |
| 라이브러리 동향 | [Webflow: GSAP 100% 무료](https://webflow.com/blog/gsap-becomes-free) | 2025-04부터 GSAP 전체 플러그인 무료. 이번 보드는 의존성 없이 CSS·rAF로 충분해 쓰지 않음 |
| 2026 트렌드(실무 블로그) | [Tubik UI trends 2026](https://blog.tubikstudio.com/ui-design-trends-2026), [acodez micro-interactions](https://acodez.in/micro-interactions-motion-design/) | "장식이 아니라 설명·안내·확인하는 모션", 실시간 데이터가 숨 쉬듯, 모션 줄이기 옵션. 근거 수치는 출처 불명이라 인용하지 않음 |

## 2. 렉 보드 모션 규칙

1. **모션은 세 가지 일만 한다:** 시간이 흐른다(재생), 상태가 바뀌었다(값·등급 변화), 흐름이 있다(패킷). 장식용 반복 모션은 넣지 않는다.
2. **productive가 기본, expressive는 악화에만:** 값 롤링·커서 이동·전환은 240~400ms productive. 새 장애 등장과 등급 상승 링만 expressive(400~700ms)로 한다.
3. **경보 모션은 한 번만:** 등급이 올라갈 때만 링이 2회 퍼지고 끝난다. 내려갈 때는 조용하다. 무한 깜빡임은 금지다(LIVE 점만 예외: "지금 수신 중"이라는 의미가 있다).
4. **같은 마크는 같은 데이터:** 범위·서버가 바뀌면 series id를 고정한 채 모핑한다. 히트맵처럼 칸이 수천 개인 차트는 모핑하지 않는다.
5. **재생 중에는 미래를 가린다:** 커서 오른쪽을 흐리게 덮어 "그 시점에 알 수 있었던 것"만 보이게 한다. 사후 분석(postmortem)에서 판단 순서를 재현하기 위해서다.
6. **커서는 차트 밖 HTML 오버레이:** 매 틱마다 차트를 다시 그리지 않고 `transform`만 옮긴다. 재생 중에는 틱 간격(120ms)과 같은 길이의 선형 전환으로 끊김 없이 흐르게 한다.
7. **입자 모션은 데이터를 인코딩할 때만:** 속도는 RTT, 흩어짐은 지터, 사라짐은 손실이다. 강조 배율(손실 ×5)은 범례에 밝힌다. 모션이 꺼지면 같은 인코딩의 정지 화면을 보여 준다.
8. **멈춤 수단:** 상단 모션 토글 하나로 모든 CSS·캔버스 모션을 멈춘다(WCAG 2.2.2). 기본값은 OS의 `prefers-reduced-motion`을 따른다. 화면 밖이거나 탭이 숨겨지면 rAF를 멈춘다.
9. **비교는 정적으로:** 여러 통신사·서버의 비교는 small multiples나 강조 선 같은 정적 형식으로 한다. 애니메이션으로 비교시키지 않는다.

## 3. 적용 위치 (v0.3)

| 위치 | 모션 | 구현 |
|---|---|---|
| 상단 재생 컨트롤 · 장애 카드 "재생" | 시간 커서 자동 진행(10·30·60분/초), 미래 영역 흐림, 진행 막대 | `lib/useReplay.ts`, `charts/ChartCursor.tsx` |
| KPI·타일·원인 기여·서버 상세 값 | 자릿수 롤링(스프링 이징) | `components/RollingNumber.tsx` |
| 서버 타일·글로벌 지연·요약 아이콘 | 등급 상승 시 링 한 번 | `lib/useEscalation.ts`, `.pulse-ring` |
| 장애 판정 목록 | 새 장애가 위에서 내려오며 등장 + 등급 색 링 | `IncidentList.tsx` `.is-fresh` |
| 원인 기여 막대 | flex-grow 전환으로 비중 변화 | `.segbar span` |
| 원인 분해·서버 상세 차트 | series id 고정 merge로 모핑 | `useChart({ merge: true })` |
| 서버·권역·통신사 선택 | View Transitions 크로스페이드 | `lib/motion.ts` `withViewTransition` |
| 통신사 표 | 패킷 흐름 레인(캔버스) | `components/PacketLane.tsx` |
| 상단 | 모션 켜기/끄기 토글 | `lib/motion.ts` `useMotionPref` |
