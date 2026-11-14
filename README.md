# web-ui-lab

운영·관제 대시보드 UI 실험실. 보드를 하나씩 만들며 디자인 시스템과 분석 지식을 쌓는다.

## 보드

### 렉 보드 (`boards/lag-board`)
가상 MMORPG의 6개 글로벌 권역·36개 서버에서 체감 렉 추이를 보고, 렉 원인을 **인프라 / 네트워크 / 서버 / 클라**로 판별하는 보드.

- **체감 지연(EL)**: RTT·지터·손실·서버 틱·클라 프레임을 ms 하나로 환산
- **등급**: 쾌적 <100 · 양호 100–150 · 주의 150–250 · 경고 250–500 · 심각 ≥500ms ([근거](knowledge/lag-thresholds.md))
- **판별**: 전일 동시간대 기준선, MAD 강건 z, EWMA, CUSUM, 랙·권역 확산 패턴
- **가상 장애 4건**: 서버 틱 지연(JP-03), 동남아 네트워크 손실, 클라 2.14.0 프레임 스톨, 서울 DC 랙 R2 호스트 경합. 분류기가 4건 모두 맞히는지 테스트로 검증

```bash
npm install
```

```bash
npm run dev:lag
```

```bash
npm test
```

## 구조
```
design-system/      공용 디자인 토큰 (다크 우선, 라이트 지원)
boards/lag-board/   렉 보드 앱 (Vite + React + TypeScript + ECharts)
knowledge/          레퍼런스 조사, 임계값 근거, 학습 로그
.claude/skills/     축적된 제작 지식 (ops-dashboard-design, lag-analytics)
tools/              시각 QA 도구
```
