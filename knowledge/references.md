# 렉 보드(Lag Board) 참고 자료 & 디자인 규칙

> MMORPG 장애 대응용 다크 우선 NOC/라이브옵스 대시보드. 6개 글로벌 리전 × 게임 서버별 체감 렉 추이와 원인 4분류(인프라 / 네트워크 / 서버 / 클라이언트)를 보여준다.
>
> - 조사일: 2026-11-14
> - 수집 방법: 웹 검색 결과와 일부 페이지 직접 열람. 이번 세션에서는 `github.com`만 직접 열 수 있었다(DataDog/effective-dashboards, grafana/promql-anomaly-detection, twitter/AnomalyDetection). `grafana.com`, `sre.google`, `blog.cloudflare.com`, `brendangregg.com`, `datawrapper.de`, `finalfantasyxiv.com` 등은 네트워크 정책 때문에 열 수 없었다. 이 출처들의 요약은 검색 결과에 노출된 본문 발췌에 근거한다. 수치나 문구를 그대로 인용하려면 원문을 한 번 더 확인할 것.
> - 아래 URL은 모두 검색 결과에 실제로 나왔거나 직접 열어 본 주소다.

---

## 1. 출처 목록

### 1-1. 관측성(Observability) 대시보드

**Grafana**
- [Grafana dashboard best practices](https://grafana.com/docs/grafana/next/visualizations/dashboards/build-dashboards/best-practices/): 대시보드는 하나의 이야기를 하거나 하나의 질문에 답해야 하고, 큰 것에서 작은 것, 전체에서 세부 순서로 흘러가야 한다. 인지 부하를 줄이고, 색은 임계값처럼 의미가 있을 때만 쓰고, 링크로 탐색 경로를 정해 두라고 권한다. USE·RED 방법도 함께 소개한다.
- [Grafana best practices v12.4 (축 정규화 예시)](https://grafana.com/docs/grafana/v12.4/visualizations/dashboards/build-dashboards/best-practices/): CPU를 코어 수로 나눠 100%가 곧 포화가 되게 만드는 식으로 축을 정규화하면 인지 부하가 줄어든다. 단위가 다른 패널은 성격별로 나누고, 집계값 때문에 세부 정보가 묻히지 않게 비교 대상끼리 같은 패널에 둔다.
- [Amazon Managed Grafana: Best practices for dashboards](https://docs.aws.amazon.com/grafana/latest/userguide/v10-dash-bestpractices.html): 같은 Grafana 지침을 AWS가 정리한 문서. 경보는 원인이 아니라 증상에 걸고(주로 RED 대시보드에서), 불필요한 자동 새로고침을 피해 백엔드 부하를 줄이라고 한다.
- [Getting started with Grafana: best practices to design your first dashboard](https://grafana.com/blog/2024/07/03/getting-started-with-grafana-best-practices-to-design-your-first-dashboard/): 대시보드 디자인 웨비나와 짝을 이루는 글. 의사결정을 이끄는 대시보드를 만드는 원칙을 다룬다.
- [Heatmap 패널 (Amazon Managed Grafana v13 문서)](https://docs.aws.amazon.com/grafana/latest/userguide/v13-panels-heatmap.html): 히트맵은 시간에 따른 히스토그램을 보여 준다. 데이터가 이미 버킷으로 나뉘어 있으면 "Calculate from data"를 끈다.
- [How to visualize Prometheus histograms in Grafana](https://grafana.com/blog/2020/04/21/how-to-visualize-prometheus-histograms-in-grafana/): 막대 게이지에는 시간 정보가 없으니, 버킷 분포가 시간에 따라 어떻게 변하는지 보려면 히트맵을 써야 한다. 쿼리 포맷을 Heatmap으로 지정한다.
- [State timeline](https://grafana.com/docs/grafana/next/panels-visualizations/visualizations/state-timeline/): 임계값으로 시계열을 상태 구간으로 바꿔 그린다. "같은 값이 연속되면 병합" 옵션이 있고, null이 나오면 상태가 끊긴다. 리전 × 시간 상태 띠를 그릴 때 기본 패턴으로 삼을 만하다.
- [Status history](https://grafana.com/docs/grafana/next/visualizations/status-history/): State timeline과 달리 연속값을 병합하지 않고 데이터 포인트마다 칸을 하나씩 그린다. null은 빈칸으로 보인다. 서버 × 분 단위 격자에 적합하다.
- [Grafana annotations (Graphite 데이터소스 예)](https://grafana.com/docs/grafana/latest/datasources/graphite/annotations/): 배포·점검 이벤트를 모든 시계열 패널에 마커로 겹쳐 그린다. 시작과 끝이 있는 이벤트는 구간(region) 주석으로 표시한다.
- [Tom Wilkie, GrafanaCon EU 2018 (RED 방법)](https://grafana.com/files/grafanacon_eu_2018/Tom_Wilkie_GrafanaCon_EU_2018.pdf): Rate·Errors·Duration. Duration은 평균이 아니라 분포(p99 등)로 본다.
- [How to use Prometheus to efficiently detect anomalies at scale (Grafana Labs, 2024)](https://grafana.com/blog/2024/10/03/how-to-use-prometheus-to-efficiently-detect-anomalies-at-scale/): PromQL 레코딩 룰만으로 상한·하한 밴드를 만드는 이상 탐지 프레임워크.
- [PromCon 2024 슬라이드: Practical anomaly detection at scale with PromQL](https://grafana.com/files/Promcon-2024-Practical-anomaly-detection-at-scale-with-PromQL.pdf): 페이징은 SLO로 하고, 이상 탐지는 사람의 주의를 끄는 용도로만 쓰라고 권한다.
- [grafana/promql-anomaly-detection (GitHub)](https://github.com/grafana/promql-anomaly-detection) *(직접 열람)*: adaptive 전략은 평균과 표준편차에 26시간 스무딩과 high-pass 필터를 쓰고, robust 전략은 중앙값과 MAD를 쓴다. 밴드는 단기·장기(계절성)·마진(최소 폭) 세 부분으로 구성된다. 알림은 밴드를 "상당 기간" 벗어났을 때만 울린다.

**Datadog**
- [DataDog/effective-dashboards](https://github.com/DataDog/effective-dashboards) · [guidelines.md](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md) *(직접 열람)*: 목표(개요 / 디버깅 / 학습)를 먼저 정한다. 설명란은 "필수"이며, 매일 보지 않는 사람을 기준으로 쓴다. 관련 위젯은 항상 그룹으로 묶는다. 12컬럼 그리드에서 시계열은 최소 4컬럼, 로그 스트림은 최소 6컬럼을 쓴다. 넓은 화면에서는 고밀도(2×12) 모드로 바뀐다.
- [Host Map 문서](https://docs.datadoghq.com/infrastructure/hostmap) · [Host Maps Just Got Better](https://datadoghq.com/blog/host-maps-just-got-better): 육각형 타일 하나가 호스트 하나다. Fill(색)과 Size(크기)에 서로 다른 지표를 매핑한다(예: 색은 CPU, 크기는 세션 수). 색맹 친화 팔레트를 고를 수 있다. 서버 수십~수백 대를 한 화면에 보여 주는 데 직접 참고할 만하다.
- [How we built the Datadog heatmap…](https://datadoghq.com/blog/engineering/how-we-built-the-datadog-heatmap-to-visualize-distributions-over-time-at-arbitrary-scale): DDSketch 기반 분포 히트맵. 로그 스케일과 색 설계를 다룬다. 집계 간격이 데이터 간격과 어긋나면(예: 10초 데이터를 7초 간격으로) 앨리어싱 무늬가 생긴다고 경고한다.
- [Outlier monitor (DBSCAN / MAD)](https://docs.datadoghq.com/monitors/types/outlier/) · [Outlier detection algorithms at Datadog](https://datadoghq.com/blog/outlier-detection-algorithms-at-datadog) · [Scaled outlier algorithms](https://datadoghq.com/blog/scaling-outlier-algorithms): 3개 이상 멤버가 비슷하게 움직이는 그룹이 전제다. 그룹 전체가 함께 움직여야 정상이면 DBSCAN, 동기화가 우연에 가까우면 MAD가 맞다. 값이 크고 촘촘히 모여 있으면 scaled 변형을 쓴다. "같은 리전 서버 중 혼자 튀는 서버"를 찾는 데 그대로 쓸 수 있다.
- [Anomaly monitor (basic / agile / robust)](https://docs.datadoghq.com/monitors/types/anomaly/): basic은 롤링 분위수, agile은 레벨 변화에 빨리 따라가는 robust SARIMA, robust는 STL 분해 기반으로 긴 이상에도 기준선이 흔들리지 않는다. 주간 계절성에는 최소 3주, 일간 계절성에는 최소 3일 데이터가 필요하고, 최대 6주까지 사용한다.
- [Change Overlays (한국어 문서)](https://docs.datadoghq.com/ko/dashboards/change_overlays) · [블로그](https://datadoghq.com/blog/change-overlays): 배포와 피처 플래그 변경을 시계열 위에 겹쳐 그려서 지표 변화와 맞춰 볼 수 있게 한다.
- [Watchdog RCA](https://docs.datadoghq.com/watchdog/rca/): 결과를 근본 원인 / 최초 증상(critical failure) / 영향 범위 셋으로 나눈다. 지연 증가 같은 성능 저하는 원인이 아니라 증상으로만 분류한다. 버전 변경(배포)은 근본 원인 유형으로 인정한다.

**Honeycomb**
- [Identify outliers (BubbleUp)](https://docs.honeycomb.io/investigate/analyze/identify-outliers/): `duration_ms` 히트맵에서 영역을 드래그로 고르면, 선택 영역과 기준선(나머지)에서 속성 분포가 어떻게 다른지 자동으로 비교해 준다.
- [Heatmaps make ops better](https://www.honeycomb.io/blog/heatmaps-make-ops-better/): 최소·최대·평균은 풍부한 세부 정보를 숨긴다. 히트맵은 백분위를 정확히 읽기는 어렵지만 변화, 추세, 이상치를 찾기에는 탁월하다.
- [Handle unruly outliers with log-scale heatmaps](https://www.honeycomb.io/blog/handle-unruly-outliers-with-log-scale-heatmaps): 극단값이 차트를 납작하게 만들면 지연 축을 로그 스케일로 바꾼다.
- [Core analysis loop](https://docs.honeycomb.io/get-started/honeycomb/core-analysis-loop.md): 시각화로 이상을 찾고, 차원별로 쪼개 원인을 좁히고, 다시 시각화하는 조사 루프.

**New Relic**
- [New Relic Lookout](https://docs.newrelic.com/docs/new-relic-solutions/new-relic-one/core-concepts/new-relic-lookout-monitor-your-estate-glance/): 엔티티 하나를 원 하나로 그리고, 원의 크기를 추세 대비 편차의 크기로 정한다. 편차가 큰 엔티티는 지표 크기와 편차 크기를 함께 고려해 순위를 매긴다. 별도 설정이 없어도 동작한다.
- [New Relic Explorer / Navigator](https://docs.newrelic.com/docs/new-relic-solutions/new-relic-one/core-concepts/new-relic-explorer-view-performance-across-apps-services-hosts/): 전체 시스템을 고밀도 벌집(honeycomb) 격자로 보여 주고, 알림 상태에 따라 신호등 색을 칠한다.
- [Anomaly detection (alerts)](https://docs.newrelic.com/docs/alerts/create-alert/set-thresholds/anomaly-detection/): 과거 추세로 예측 기준선을 만들고 그 주변 허용 범위를 회색 밴드로 그린다.

**인터넷·네트워크 관측**
- [Traffic anomalies and notifications with Cloudflare Radar](https://blog.cloudflare.com/traffic-anomalies-notifications-radar/): 지도(주황 원), 바로 아래 타임라인(점에 호버하면 상세), 이상 목록 테이블을 한 세트로 묶는다. 여러 데이터 소스에서 확인되지 않은 이상은 오탐으로 보고 목록에서 뺀다. 급등보다 급락을 중심으로 탐지한다.
- [Detecting internet outages (Cloudflare)](https://blog.cloudflare.com/detecting-internet-outages/): Radar Outage Center의 이상 탐지 배경을 설명한다.
- [Introducing Radar Internet Quality page](https://blog.cloudflare.com/introducing-radar-internet-quality-page/) · [예: Internet Quality in Argentina](https://radar.cloudflare.com/quality/ar): 국가·대륙별로 유휴(idle) 지연과 부하(loaded) 지연, 지터를 보여 준다. 지터는 연속된 지연 측정값의 평균 변동으로 정의한다.
- [ThousandEyes Path Visualization 사용법](https://docs.thousandeyes.com/product-documentation/internet-and-wan-monitoring/path-visualization/using-the-path-visualization-view): 에이전트에서 대상까지 홉을 노드와 링크로 그린다. 공유 홉은 노드 하나로 합치고, 노드별 전달 손실과 링크별 지연에 임계값을 둔다. 중간 경로 손실과 목적지 손실을 구분해서 누가 고쳐야 하는지 가린다.
- [Why can't I see packet loss in path visualization?](https://docs.thousandeyes.com/product-documentation/internet-and-wan-monitoring/path-visualization/troubleshooting/why-cant-i-see-packet-loss-in-path-visualization): 경로 추적은 패킷을 적게 보내므로 짧은 손실을 놓칠 수 있다. 측정 방식마다 맹점이 다르다는 점을 보여 준다.
- [ThousandEyes Internet Insights 개요 화면](https://docs.thousandeyes.com/product-documentation/internet-insights/int-screens/int-overview-screen): 네트워크 장애는 빨강, 애플리케이션 장애는 보라로 칠한다. 노드 크기는 장애 범위를 뜻하고, 호버하면 위치별 목록이 나온다.
- [GSMA: Downdetector helped early detection of major outages (2024 H1)](https://www.gsma.com/get-involved/gsma-membership/gsma_resources/downdetector-helped-the-early-detection-of-major-outages-during-the-first-half-of-2024/): Downdetector는 서비스별로 "평소 이 시각의" 신고량을 기준선으로 두고, 신고가 그보다 유의하게 많을 때만 사건으로 판정한다. 시각별 계절 기준선의 대표 사례다.
- [Atlassian Statuspage: top-level status & incident impact](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations) · [Show service status with components](https://support.atlassian.com/statuspage/docs/show-service-status-with-components/): 상태는 정상(녹) / 점검(청) / 성능 저하(황) / 부분 장애(주황) / 주요 장애(적) 5단계다. 페이지 전체 상태는 가장 나쁜 구성요소를 따른다. 커뮤니티 답변에 따르면 "성능 저하"는 가동률 기록에서 장애로 세지 않는다.

### 1-2. 게임 서비스 상태 & 라이브옵스

- [Riot: Fixing the Internet for Real Time Applications, Part I](https://technology.riotgames.com/node/25) · [Part III](https://technology.riotgames.com/node/43): Riot Direct 사례. 비효율적인 ISP 경로 때문에 14ms면 될 거리가 70ms가 된다. 지연뿐 아니라 패킷 손실과 지터를 핵심 지표로 추적한다. 네트워크 원인 판정의 근거가 된다.
- [Riot tech blog: Artificial latency for remote competitors (MSI 2022)](https://lolesports.com/news/riot-games-tech-blog-artificial-latency-for-remote-competitors): 지연 측정 도구 자체에 버그가 있어서 모니터링은 "정상"을 보여 줬지만 실제로는 문제가 있었다. 측정 파이프라인의 건강 상태도 보드에 보여야 하는 이유다.
- [VALORANT's 128-Tick Servers](https://technology.riotgames.com/node/112): 128틱 서버는 프레임당 처리 예산이 약 7.8ms다. 서버 틱 처리 시간이 "서버 원인 렉"의 핵심 신호라는 것을 보여 준다.
- [VALORANT Game and Network Instability Basics (Riot 공식)](https://playvalorant.com/en-us/news/game-updates/valorant-game-and-network-instability-basics): 네트워크 문제 표시기는 지속적인 패킷 손실이나 짧은 끊김이 움직임과 입력에 영향을 줄 때 뜨고, 높은 핑 표시기는 그와 별도로 존재한다. 손실은 클라이언트 쪽과 서버 쪽으로 나눠 표시된다. 서드파티 가이드에 따르면 "서버 FPS 저하"는 그 매치에 접속한 **모든** 플레이어에게 영향을 준다. 원인 4분류에 그대로 대응한다.
- [Blizzard 지원: Overwatch 네트워크 성능 그래프](https://support.blizzard.com/en/article/7779): SIM은 클라이언트가 틱 하나를 처리하는 데 걸린 시간, IND는 보간 버퍼(보통 50–60ms), LOSS IN은 서버에서 클라이언트로 오는 손실률이다. 클라이언트 원인(SIM)과 네트워크 원인(RTT·IND·손실)을 가르는 실제 지표 세트다.
- [Warcraft Wiki: Latency (Home vs World)](https://warcraft.wiki.gg/wiki/Latency): WoW는 4.0.6부터 Home 지연과 World 지연을 나눠 보여 준다. 위키는 "Home은 내 회선, World는 Blizzard 쪽"이라는 흔한 해석이 틀렸다고 지적한다. 지표 이름만 보고 원인을 단정하면 위험하다는 교훈이다.
- [Blizzard 포럼: New Realm Population Label System](https://eu.forums.blizzard.com/en/wow/t/new-realm-population-label-system/76968) · [Blizzard Watch: How to find WoW realm status](https://blizzardwatch.com/2020/01/02/find-world-warcraft-realm-status/): 렐름 목록은 유형, 인구(혼잡도), 시간대, 위치를 함께 보여 준다. 인구 라벨은 총 캐릭터 수가 아니라 현재 동시 접속을 기준으로 한다.
- [FINAL FANTASY XIV Lodestone: Server Status](https://na.finalfantasyxiv.com/lodestone/worldstatus/): 데이터센터(리전)별로 월드를 묶고, 월드마다 상태 아이콘과 분류(Standard / Preferred / Congested), 캐릭터 생성 가능 여부를 표시한다. "리전 → 서버" 계층 목록의 표준적인 형태다.
- [EVE Online: Introducing Time Dilation (TiDi)](https://eveonline.com/article/introducing-time-dilation-tidi): 노드가 과부하되면 게임 시간을 최대 10%까지 느리게 해서 작업 큐를 0에 가깝게 유지한다. 노드 단위로 적용되므로 같은 노드의 한산한 성계도 함께 느려진다. 서버(샤드) 원인 렉이 같은 노드 전체에 퍼진다는 증거다.
- [New to EVE API: Server Status](https://www.eveonline.com/news/view/new-to-eve-api-server-status): ESI `/status`는 접속자 수, 서버 시작 시각, 버전을 반환한다. 동접 지표를 렉 지표와 나란히 두는 근거로 쓴다.
- [Lol-Status-v4 / TFT-Status-v1 API (서드파티 미러)](https://glama.ai/mcp/servers/@chirpon9/riot-docs-mcp/blob/bd23bbcbe155efed4c6774a7dde0bb8020d76191/src/riot_docs/tft-status-v1.md): `maintenance_status`(scheduled / in_progress / complete)와 `incident_severity`(info / warning / critical). 사건 심각도를 3단계로 나누는 게임사 스키마의 예다. LoL 쪽 열거값은 공식 문서에서 다시 확인해야 한다.
- [PC Gamer: Lost Ark server list & status](https://www.pcgamer.com/lost-ark-servers-list-status-down/): 한국 MMO인 로스트아크의 서버 상태 범주는 Good / Busy / Full / Maintenance다. 플레이어용 상태 어휘의 예다.
- [SteamDB Steam Server Status](https://steamdb.com/server-status) · [ExitLag: Steam status 가이드(벤더 블로그)](https://www.exitlag.com/blog/steam-status/): steamstat.us는 Connection Manager를 지역별로 나눠 따로 보여 주고, 행 단위로 노랑(저하)과 빨강(장애)을 표시한다.
- [GDC: How LiveOps allows games to be played as intended, always (Riot)](https://schedule.gdconf.com/session/how-liveops-allows-games-to-be-played-as-intended-always/900744): Riot이 프로덕션 관점에서 라이브옵스 조직을 어떻게 운영하는지 다룬 세션.
- [Honeycomb 컨퍼런스 토크: Observability Into Game Server Deployment & Performance](https://www.honeycomb.io/resources/conference-talks/observability-into-game-server-deployment) · [CCP Games(EVE) 케이스 스터디](https://www.honeycomb.io/resources/ccp-games-case-study-video): 게임 서버 배포와 성능을 계측으로 관측한 사례.
- [Metaplay: Introduction to game server metrics](https://docs.metaplay.io/operating-a-live-game/game-server-metrics/introduction-to-game-server-metrics): 라이브옵스 대시보드(비즈니스·기술 요약)와 Grafana(상세 기술 지표)로 역할을 나눈다. 렉 보드도 요약 화면과 심층 화면을 분리하는 편이 좋다.
- [Amazon GameLift Servers: 대시보드 구성](https://docs.amazonaws.cn/en_us/gameliftservers/latest/developerguide/gamelift-servers-metrics-dashboards.html): 플릿 개요 → 서버 성능 상세 → 컨테이너 순으로 내려가는 대시보드 계층.

### 1-3. 2025–2026 모던 대시보드 디자인

- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) · [Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh): 테마를 HSL이 아닌 LCH에서 생성한다(기본색, 강조색, 대비 세 값으로). 그래서 어떤 기본색을 넣어도 일관되고, 고대비 테마도 같은 방식으로 만든다. 표면 elevation을 명도 단계로 처리한다. 중립 캔버스에 색은 의미에만 쓰는 "calm" 미학의 대표 사례다.
- [Vercel Geist 디자인 시스템](https://vercel.com/geist) · [Geist Font](https://vercel.com/geist/font): 고대비 접근성 색, Geist Sans와 Geist Mono 조합. 서드파티 분석에 따르면 수치 캡션에는 `tnum`을 쓴다.
- [Vercel Speed Insights metrics](https://vercel.com/docs/speed-insights/metrics): 기본 보기가 **P75**이고 P90을 선택할 수 있다. 점수는 0–49 빨강(Poor), 50–89 주황, 90–100 초록으로 나누고, 지도도 P75 점수로 칠한다. 백분위와 등급 색을 결합하는 방식의 레퍼런스다.
- [Tremor Tracker 컴포넌트](https://tremor-so-git-doc-tremor.vercel.app/docs/components/tracker) · [Tremor](https://npm.tremor.so/): 시간 단위마다 색 블록을 하나씩 두고 툴팁을 단다(30일 가동률 카드 예시). BarList는 랭킹과 비교용 가로 막대로, 기본적으로 정렬되어 나온다.
- [shadcn/ui Chart](https://ui.shadcn.com/docs/components/chart): 차트 색을 `--chart-1…5` CSS 변수로 정의하고 `.dark`에서 따로 덮어쓴다. ChartConfig 키마다 `--color-<key>` 변수가 생기고, Recharts v3에서는 `var(--chart-1)`로 직접 참조한다.
- [Radix Colors: Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) · [Aliasing](https://radix-ui.com/colors/docs/overview/aliasing): 12단계 역할은 1–2 앱 배경, 3–5 컴포넌트 배경과 상태, 6–8 테두리와 포커스 링, 9–10 솔리드 채움과 호버, 11 보조 텍스트, 12 본문 텍스트다. 상태색 토큰 체계를 짤 때 뼈대로 쓴다.
- [Material Design 2: Dark theme](https://m2.material.io/design/color/dark-theme): 순흑 대신 #121212를 쓰고, 높은 표면일수록 반투명 흰 오버레이로 밝게 한다. 주요 색은 채도를 낮춰 모든 elevation에서 본문 대비 4.5:1을 지킨다.
- [MDN: font-variant-numeric](https://developer.mozilla.org/docs/Web/CSS/font-variant-numeric) · [Tailwind: font-variant-numeric](https://tailwindcss.com/docs/font-variant-numeric) · [Maersk DS: Monospaced numbers](https://designsystem.maersk.com/content/numbers/monospaced-numbers/): `tabular-nums`(= OpenType `tnum`)는 숫자 폭을 고정해 표 정렬을 맞추고, 실시간으로 바뀌는 숫자 때문에 레이아웃이 흔들리는 것을 막는다. 제목 같은 디스플레이 텍스트에는 쓰지 않는다.
- [Pretendard (GitHub)](https://github.com/orioncactus/pretendard) · [Pretendard tnum 적용기 (tistory)](https://donghyk2.tistory.com/174): 한국어 UI의 사실상 표준 폰트. 기본 숫자가 비례폭이라 거래소 UI에서 정렬이 깨졌고, `font-feature-settings: "tnum"`으로 해결했다. 사용하는 빌드(서브셋, 가변)가 tnum을 포함하는지 확인해야 한다.
- [IBM Carbon: Status indicator pattern](https://www.carbondesignsystem.com/patterns/status-indicator-pattern): 상태는 아이콘, 모양, 색, 텍스트 라벨의 조합으로 표현하고 색만으로 전달하지 않는다. 좁은 공간이나 대량 스캔용으로는 모양 표시기를 쓴다. 회색은 미시작, 보라는 이상치나 미정의 상태다. 행동이 필요 없으면 상태 표시기를 쓰지 말라고 한다.
- [shadcn.io blocks: Monitoring edge function latency (갤러리)](https://www.shadcn.io/blocks/monitoring-edge-function-latency): 다크 테마에서 리전·엣지별 응답시간과 p99 분포를 보여 주는 블록 예시. 레이아웃 참고용.
- [VMware: dashboards for the big screen](https://docs.vmware.com/en/Management-Packs-for-vRealize-Operations/2.0/Horizon/GUID-71647CD7-1C67-4F70-8652-0C934A93BE31.html): 월 디스플레이에는 최소한의 핵심 정보만 둔다. 같은 대시보드라도 벽에서는 관제용, 데스크에서는 드릴다운용으로 쓰임새가 다르다.

### 1-4. 데이터 시각화 원칙 (운영 관점)

- [Stephen Few, Common Pitfalls in Dashboard Design (13 pitfalls, ITRS 사본)](https://support.itrsgroup.com/hc/en-us/article_attachments/115004392393) · [Few, Why Most Dashboards Fail (Berkeley 사본)](https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf): 첫 번째 함정은 한 화면을 넘어서는 것이다. 전체를 봐야 하는데 화면을 잘게 쪼개는 것, 색을 남용하는 것, 적록 대비에 의존하는 것도 함정이다. 필요한 정보를 명확하고 빠르게 주지 못하는 대시보드는 결국 쓰이지 않는다.
- [Edward Tufte: Executive dashboards](https://www.edwardtufte.com/notebook/executive-dashboards/): "관제센터·조종석" 같은 과장된 은유를 피하고, 데이터 밀도가 높은 단순한 그래픽(스파크라인, small multiples)을 쓰라고 한다.
- [Heer, Kong, Agrawala, Sizing the Horizon (CHI 2009)](https://idl.uw.edu/papers/horizon): 차트 높이를 줄이면 정확도가 급격히 떨어지는 지점이 있다. 밀도를 높인다고 지각 성능이 좋아지는 것은 아니며, 아주 낮은 행 높이에서는 horizon 그래프가 유리하다.
- [Google SRE Book, Ch.6 Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) · [SRE Workbook: Monitoring](https://sre.google/workbook/monitoring/) · [Ch.10 Practical Alerting](https://sre.google/sre-book/practical-alerting/): 4대 골든 시그널은 지연, 트래픽, 에러, 포화다. 단순하고 빠른 모니터링을 선호하고, 임계값을 스스로 학습하는 "마법" 시스템은 피한다. 페이지는 사용자에게 실제로 영향이 있는 증상에 대해서만 보낸다.
- [Brendan Gregg: The USE Method](https://www.brendangregg.com/usemethod.html): 자원마다 Utilization, Saturation, Errors를 본다. 포화는 0이 아니기만 해도 지연을 더한다. 인프라 원인을 판정하는 체크리스트로 쓴다.
- [The New Stack: Monitoring microservices with the RED method](https://thenewstack.io/monitoring-microservices-red-method/): 요청 기반 서비스에는 RED, 자원에는 USE를 함께 쓴다.
- [Gil Tene, How NOT to Measure Latency (QCon SF 2015 슬라이드)](https://videog.infoq.com/downloads/pdfdownloads/presentations/QConSF2015-GilTene-HowNOTtomeasureLatency.pdf): 백분위는 평균낼 수 없다. 10초 단위 p99를 아무리 모아도 1시간 p99.999는 나오지 않는다. 95·99에서 멈추지 말고 백분위 스펙트럼 전체를 봐야 하며, 타임아웃이나 재시도 같은 "misery metric"도 함께 추적한다.
- [Mechanical Sympathy: Coordinated Omission 스레드](https://groups.google.com/g/mechanical-sympathy/c/icNZJejUHfE/m/BfDekfBEs_sJ): 정지가 일어나면 그동안의 요청이 기록되지 않아 측정이 낙관적으로 왜곡된다. 클라이언트 하트비트를 일정 간격으로 보내 측정해야 하는 이유다.
- [HdrHistogram (.NET 포트, GitHub)](https://github.com/HdrHistogram/HdrHistogram.NET): 마이크로초부터 시간 단위까지 넓은 범위를 고정 유효숫자로 기록하는 지연 히스토그램. coordinated omission 보정 모드가 있다.
- [Brave New Geek: Everything you know about latency is wrong](https://bravenewgeek.com/everything-you-know-about-latency-is-wrong/): 지연은 정규분포가 아니므로 평균, 중앙값, 표준편차만으로는 판단할 수 없다.
- [theburningmonk: We can do better than percentile latencies](https://theburningmonk.com/2018/10/we-can-do-better-than-percentile-latencies/): 미리 집계해 둔 백분위는 분포 정보를 잃고, 집계 방법에 따라 p99가 자릿수 단위로 달라진다.
- [State Farm Engineering: Watching your tail with latency histograms](https://engineering.statefarm.com/blog/observing-latency-tail): 꼬리 지연을 히스토그램으로 관찰한 실무 사례.
- [The Tail at Scale (Dean & Barroso, CACM 2013)](https://research.google/pubs/pub40801/?hl=es): 규모가 커질수록 드문 고지연 구간이 전체 성능을 지배한다. 100ms 이내 반응이 자연스럽게 느껴진다.
- [Prometheus: Histograms and summaries](https://prometheus.io/docs/practices/histograms/): 여러 인스턴스를 합친 분위수는 히스토그램(`histogram_quantile`)으로 서버 쪽에서 계산한다. summary의 분위수는 합칠 수 없다. native histogram을 권장한다.
- [Brendan Gregg: Latency Heat Maps](https://brendangregg.com/HeatMaps/latency.html) · [Visualizing System Latency (CACM 2010)](https://cacmb4.acm.org/magazines/2010/7/95062-visualizing-system-latency): x축 시간, y축 지연 버킷, 색 농도는 건수다. 평균선이 놓치는 이봉 분포와 이상치가 드러난다.
- [Okabe-Ito 팔레트 (R `see` 문서)](https://rdrr.io/cran/see/man/palette_okabeito.html): 색각이상 유형 대부분에서 구분되는 8색(#E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7, #000000).
- [Datawrapper: Colorblindness part 2](https://www.datawrapper.de/blog/colorblindness-part2): 적·녹 쌍을 피하고, 명도 차이와 직접 라벨로 보완한다.
- [W3C: Understanding SC 1.4.11 Non-text Contrast](https://w3.org/WAI/WCAG22/Understanding/non-text-contrast): 의미를 가진 그래픽 요소(선, 막대, 상태 칩)는 인접색 대비 3:1 이상이어야 한다. 색만으로 정보를 전달하는 것은 1.4.1 위반이다.
- [colorcet: Perceptually uniform continuous colormaps](https://colorcet.holoviz.org/user_guide/Continuous.html): 무지개나 jet 계열은 지각적으로 균일하지 않으니 피한다. 히트맵에는 지각 균일 램프를 쓴다.

### 1-5. 이상/변화 탐지 통계

- [NIST e-Handbook: Detection of outliers (modified z-score)](https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm): Iglewicz와 Hoaglin의 수정 z-점수는 `M = 0.6745·(x − median)/MAD`이고, `|M| > 3.5`이면 이상치 후보로 본다.
- [NIST e-Handbook: EWMA control charts](https://itl.nist.gov/div898/handbook/pmc/section3/pmc324.htm): EWMA는 1–1.5σ 정도의 작은 이동을 Shewhart 차트보다 잘 잡는다. 예제는 λ=0.3, 관리한계 배수 k는 보통 3이다.
- [Wikipedia: EWMA chart](https://en.wikipedia.org/wiki/EWMA_chart): 1986년 논문을 인용해 0.1 ≤ λ ≤ 0.3을 권장한다.
- [NIST e-Handbook: CUSUM control charts](https://itl.nist.gov/div898/handbook/pmc/section3/pmc3231.htm) · [SAS/QC: one-sided CUSUM with decision interval](https://support.sas.com/documentation/cdl/en/qcug/63964/HTML/default/qcug_cusum_a0000000292.htm): 기준값 k와 결정구간 h를 쓴다. `S_t = max(0, S_{t−1} + z_t − k)`이고, SAS 예제(h=3, k=0.5)의 관리 상태 평균 런 길이(ARL)는 약 117.6이다.
- [twitter/AnomalyDetection (S-H-ESD)](https://github.com/twitter/AnomalyDetection) *(직접 열람)*: 시계열을 분해한 뒤 중앙값과 MAD 기반의 일반화 ESD 검정을 적용한다. 계절 패턴 안의 국소 이상까지 잡는다. 예시 파라미터는 `max_anoms=0.02`, `direction='both'`, `period=1440`(분 단위 하루).
- [GitLab: Anomaly detection using Prometheus](https://about.gitlab.com/blog/anomaly-detection-using-prometheus/) · [슬라이드](https://speakerdeck.com/suprememoocow/anomaly-detection-using-prometheus): 1주 평균과 1주 표준편차로 z-점수를 계산한다. 결론은 z-점수가 정규분포일 때만 유효하고, 집계 수준이 핵심이며, 계절성 예측이 더 정확하다는 것.
- [Etsy Skyline (GitHub)](https://github.com/etsy/skyline) · [earthgecko-skyline overview](https://earthgecko-skyline.readthedocs.io/en/latest/overview.html): 수십만 개 지표를 임계값 설정 없이 감시하려 한 시도. 이후 관리자는 단순한 3-sigma 탐지가 운영 지표에는 대체로 쓸모없었다고 평가했다. Kale의 교훈은 앙상블, 다수결, 자동 보정이다.

---

### 1-6. 커맨드 센터 · 세계 지도 · 영화 FUI (v0.6, 2026-11-14)

검색 결과 요약에 근거한다(원문 직접 열람 아님). 적용 방식은 `knowledge/command-center.md` §2에 있다.

| 출처 | 요점 |
|---|---|
| [GitHub — How we built the GitHub globe](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/) | 실제 PR·활동 데이터가 지구본의 호·점을 그린다 — 움직임 자체가 서비스가 살아 있다는 증거 |
| [Cloudflare — Radar 개편 이야기](https://blog.cloudflare.com/radar-redesign/) | 2026년 10월 첫 화면을 위젯 격자에서 상단 세계 지도 + 아래 탭 차트로 바꿨다. 초기 시안은 "너무 빽빽"했다. 공격 지도는 방향 있는 흐름선이다 |
| [Mark Coleran 인터뷰 (Pushing Pixels)](https://www.pushing-pixels.org/?p=18414) | 영화 인터페이스도 장면 구도 원칙(빛·형태·움직임)으로 시선을 이끈다. 생김새보다 느낌이 중요하다 |
| [Territory Studio — Sci-fi interfaces and emerging technology](https://medium.com/territory-film/sci-fi-interfaces-and-emerging-technology-d8390b1c1b33) | SF UI일수록 엄격한 절제가 필요하다 |
| [InfoQ — SpaceX Dragon의 웹 기술 화면](https://www.infoq.com/news/2020/06/javascript-spacex-dragon/) | 비행 화면은 Chromium·JS 기반이다. 임무 단계에 필요한 정보만 보인다 |
| [SaaSFrame — Designing Bento Grids That Actually Work (2026)](https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide) | 크기가 다른 칸은 콘텐츠 위계가 분명할 때만 쓴다. 모두 같은 무게면 일반 격자를 쓴다 |
| [Natural Earth via world-atlas](https://github.com/topojson/world-atlas) | 1:110m 육지 TopoJSON(퍼블릭 도메인). 점묘 대륙의 원본이다 |

---

## 2. 렉 보드에 적용할 디자인 규칙

> 각 규칙 끝의 괄호는 근거가 된 출처다. "(추론)"이라고 적은 부분은 출처들을 조합해 이 프로젝트에 맞게 도출한 판단이다.

1. **세 가지 질문을 스크롤 없이 답한다.** 첫 화면이 "지금 어디가 아픈가 → 언제부터인가 → 왜인가"에 바로 답해야 한다. 이 순서대로 위에서 아래로 쌓는다. ① 글로벌 요약 스트립(6개 리전 타일) → ② 리전 × 시간 상태 타임라인과 지연 히트맵 → ③ 선택한 리전의 서버별 small multiples와 원인 분해. (Few 함정 #1 "한 화면 초과"; Grafana "tell a story", 일반에서 구체로; GameLift·Metaplay의 개요→상세 계층)

2. **리전 타일은 지도보다 고정 순서 격자로 만든다.** 6개 리전을 서→동 순서로 항상 같은 자리에 둬서 위치 기억을 활용한다. 타일 하나에 ① 리전명(한국어와 코드), ② 현재 p95 숫자, ③ 상태(아이콘, 라벨, 색), ④ 최근 3시간 스파크라인, ⑤ 지배 원인 배지, ⑥ 영향받는 플레이어 비율을 담는다. 지도는 보조 미니맵으로만 쓴다. (Cloudflare Radar의 지도·타임라인·테이블 3종 세트; FFXIV의 데이터센터별 그룹; 추론: 리전 6개는 지도의 면적 왜곡보다 고정 배치가 빠르게 읽힌다)

3. **평균은 그리지 않는다. p50, p95, p99를 한 세트로 보여 준다.** 기본 라인은 p95로 하고, p50–p99를 옅은 밴드로 깐다. 평균은 표시하지 않거나 툴팁에만 둔다. 리전과 글로벌 값은 서버별 백분위를 평균내지 말고 히스토그램을 병합해서 다시 계산한다. (Gil Tene; Prometheus histograms; RED의 Duration=분포; Brave New Geek)

4. **분포는 히트맵으로 보여 준다.** x축 시간, y축 로그 스케일 지연 버킷(예: 20, 40, 80, 160, 320, 640ms 이상), 색은 단일 색상의 명도 램프(지각 균일)로 칠한다. 이봉 분포(예: 일부 ISP만 300ms대)가 보이면 그 자체가 원인 단서다. 집계 간격은 수집 간격의 정수배로 맞춰 앨리어싱을 막는다. (Brendan Gregg; Honeycomb 로그 스케일; Datadog heatmap 앨리어싱; colorcet; Grafana heatmap)

5. **"체감 렉"을 비율 지표로도 보여 준다.** 백분위 옆에 "임계 초과 플레이어 비율"(예: RTT 150ms 초과 또는 손실 2% 초과 세션 비율)과 끊김·재접속 수를 misery metric으로 둔다. 상태 판정은 P75 또는 P95 등급 색과 비율 지표를 함께 본다. (Tene "misery metrics"; Vercel Speed Insights P75 + 등급 색; Riot의 "80ms 미만 플레이어 비율" 목표)

6. **기본 화면은 중립색으로 두고, 색은 이상이 생겼을 때만 쓴다.** 정상 상태에서는 화면이 거의 무채색이어야 한다(회색 스파크라인, 회색 텍스트). 심각도 색은 주의가 필요한 곳에만 칠한다. 장식적인 그라데이션이나 브랜드 색 배경은 쓰지 않는다. (Linear "calm"; Grafana "color with meaning"; Carbon "행동이 필요 없으면 상태 표시기를 쓰지 말 것"; Few 색 남용)

7. **심각도는 5단계로 고정하고 한국어 라벨을 단다.** 정상 / 지연(성능 저하) / 불안정(부분 장애) / 장애(주요 장애) / 점검. 여기에 **데이터 없음**을 별도 상태로 둔다. 점검은 파랑, 데이터 없음은 회색 빗금으로 칠한다. 사건 심각도는 info / warning / critical 3단계로 따로 운용한다. 페이지 전체 상태는 가장 나쁜 리전을 따른다. (Atlassian Statuspage; Riot status API; Lost Ark; Grafana status history의 null 빈칸)

8. **색만으로 상태를 전달하지 않는다.** 상태마다 아이콘 모양을 다르게 하고(예: ● 정상, ▲ 지연, ◆ 불안정, ■ 장애, ⏸ 점검) 짧은 텍스트 라벨을 붙인다. 적·녹 대비를 피하고 명도 차이를 크게 준다. 의미를 가진 그래픽 요소는 배경 대비 3:1 이상이어야 한다. "색을 모두 지워도 상태를 읽을 수 있는가"로 검수한다. (Carbon; WCAG 1.4.1, 1.4.11; Datawrapper; Few)

9. **원인 4분류에는 심각도와 겹치지 않는 범주형 색을 쓴다.** 심각도가 노랑, 주황, 주홍(빨강) 계열을 쓰므로 원인 색은 Okabe-Ito에서 그 색들을 뺀 나머지로 고른다. 출발안은 인프라 `#0072B2`(blue), 네트워크 `#56B4E9`(sky blue), 서버 `#CC79A7`(reddish purple), 클라이언트 `#009E73`(bluish green)이다. #121212 배경 대비는 각각 3.6 / 8.1 / 6.1 / 5.5:1로 계산된다. 인프라와 네트워크의 상호 대비는 2.25:1밖에 안 되므로, 원인 표시에는 항상 한 글자 배지(`인`·`네`·`서`·`클`)나 패턴을 함께 붙인다. 클라이언트의 초록이 "정상"으로 읽힐 수 있다는 점은 사용성 테스트로 확인한다. (Okabe-Ito; Carbon "보라=이상치/미정의"; 대비값은 WCAG 공식으로 직접 계산)

10. **다크 테마는 순흑을 쓰지 않고 명도 단계로 깊이를 만든다.** 배경은 #0f1011–#121212 부근, 패널은 +1–2단계 밝게, 툴팁과 팝오버는 +3단계로 둔다. 그림자 대신 표면 명도로 elevation을 표현한다. 강조색과 상태색은 다크 전용으로 채도를 낮추고 밝게 만든 변형을 쓴다. 본문 텍스트는 순백이 아니라 #E0E0E0 계열로 한다. 토큰은 Radix 12단계 역할(1–2 배경, 6–8 테두리, 9–10 솔리드, 11–12 텍스트)에 맞춰 정의하고, LCH나 OKLCH에서 생성해 라이트 테마에서도 일관되게 한다. (Material Dark theme; Radix Colors; Linear LCH; shadcn `.dark` 변수)

11. **모든 수치에 tabular-nums를 적용한다.** 지연, 비율, 동접, 시각 표시에는 `font-variant-numeric: tabular-nums`(Pretendard에는 `font-feature-settings: "tnum"`)를 건다. 숫자는 오른쪽 정렬하고, 단위(ms, %)는 작은 회색 접미사로 붙이며, 자릿수를 고정한다(예: `1,284 ms`, `3.2%`). 서버 ID나 IP 같은 식별자는 고정폭 폰트(Geist Mono류)로 쓴다. 값이 바뀌어도 레이아웃이 흔들리면 안 된다. (MDN; Tailwind; Maersk; Pretendard tnum 사례; Geist)

12. **서버가 많으면 small multiples와 공유 축을 쓴다.** 리전 안의 서버들은 같은 y축(같은 ms 범위)을 쓰는 스파크라인 격자로 그린다. 서버가 수십 대를 넘거나 행 높이가 아주 낮아지면 horizon 차트나 host map식 타일로 바꾼다. 타일은 색으로 기준선 대비 편차, 크기로 동접(영향 규모)을 나타낸다. (Tufte; Heer et al. Sizing the Horizon; Datadog Host Map의 Fill/Size)

13. **절대값과 "평소 대비" 편차를 함께 보여 준다.** 현재 라인 뒤에 계절 기준선(지난 4주의 같은 요일·시각 중앙값)과 강건 밴드를 옅은 회색 리본으로 깐다. 서버 목록과 타일의 정렬·강조는 편차 크기(수정 z-점수)와 영향받는 플레이어 수를 함께 반영한 점수로 정한다. (New Relic Lookout·anomaly 회색 밴드; Datadog anomaly; Downdetector 시각별 기준선; 통계 메모 참고)

14. **리전 × 시간 상태는 state timeline으로, 서버 × 분은 status history로 그린다.** 리전 행에서는 같은 상태가 연속되면 하나의 구간으로 합쳐 "사건 블록"으로 읽히게 한다. 서버 격자는 1분 칸을 병합하지 않고 그대로 그린다. 값이 없으면 정상색으로 채우지 말고 빈칸이나 빗금으로 둔다. (Grafana State timeline / Status history; Tremor Tracker)

15. **사건과 변경은 모든 시간 차트에 주석으로 겹친다.** 배포, 패치, 설정·피처 플래그 변경은 세로선 마커로, 점검과 장애 기간은 구간 음영으로 그린다. 모든 패널에 같은 시간 커서를 공유하게 한다. 주석은 원인을 추정할 때 가장 먼저 볼 단서다(배포 버전 변경도 근본 원인 유형에 포함된다). (Grafana annotations; Datadog Change Overlays; Watchdog RCA)

16. **원인 판정에는 근거 칩과 신뢰도를 붙인다.** "왜 네트워크로 판정했나"를 2–3개 증거 칩과 신뢰도(%)로 보여 준다. 판정 휴리스틱(추론, 출처 조합)은 다음과 같다.
    - **클라이언트**: 특정 클라이언트 버전, 기기, OS, GPU 드라이버에 집중된다. 클라이언트 프레임 처리 시간(SIM류)이 올라가는데 RTT와 서버 틱은 정상이다. (Overwatch SIM; Valorant 클라이언트 측 손실)
    - **네트워크**: RTT, 지터, 손실이 오르는데 서버 틱은 정상이다. 특정 ISP, ASN, 경로, PoP에 국한된다. (Riot Direct; Valorant client/server loss; ThousandEyes 홉 국소화; Cloudflare Radar 지터 정의)
    - **서버**: 서버 틱 처리 시간이 오르거나 틱률이 떨어지고, 그 서버나 샤드의 **모든** 플레이어가 ISP와 무관하게 동시에 악화된다. (Valorant "server FPS"; EVE TiDi는 노드 단위; VALORANT 128틱 예산 7.8ms)
    - **인프라**: 같은 호스트, 랙, AZ, DB, 스토리지를 공유하는 여러 서버가 동시에 악화되고 USE 포화 지표가 오른다. (USE method; Datadog outlier에서 그룹 전체 이상)
    - 지표 이름만 보고 단정하지 않는다. 예를 들어 WoW의 Home·World 지연에 대한 통념은 틀린 것으로 알려져 있다. (Warcraft Wiki)

17. **원인 분해는 시간축 100% 누적 영역과 리전별 가로 막대로 보여 준다.** "어떤 원인이 렉 시간을 얼마나 차지하나"는 원인별 기여 비율을 시간축 누적 영역(100%)으로 그린다. 리전 비교는 정렬된 가로 막대(BarList)로 한다. 파이·도넛 차트는 쓰지 않는다. "렉"은 늘 **증상**으로 표시하고, 원인 레이어는 그와 시각적으로 분리한다. (Watchdog RCA의 원인/증상/영향 구분; Tremor BarList; Few)

18. **정해진 드릴다운 경로를 두고, 선택 영역을 기준선과 비교하는 기능을 넣는다.** 경로는 글로벌 → 리전 → 서버 → (호스트·경로·클라이언트 세그먼트)로 한다. 히트맵에서 영역을 드래그하면 "선택 구간 vs 기준선"으로 ISP, 클라이언트 버전, 서버, 호스트별 분포 차이를 자동 정렬해 보여 준다. 필터와 시간 범위는 URL에 저장해서 공유할 수 있게 한다. (Grafana directed browsing; Honeycomb BubbleUp·core analysis loop; ThousandEyes ASN → 위치 → IP 드릴다운)

19. **보드는 페이징 수단이 아니라 주의를 이끄는 도구다.** 사람을 깨우는 경보는 SLO 소진이나 사용자 영향 증상에 걸어 둔다. 보드의 이상 배지는 지속 조건(예: 5분 중 3분 이상 임계 초과)과 교차 확인(예: 클라이언트 텔레메트리와 서버 지표가 함께 악화)을 만족할 때만 띄워 오탐을 줄인다. (Google SRE; PromCon 2024 "Page on SLOs"; Cloudflare 다중 소스 확인; Grafana "상당 기간")

20. **측정 자체의 건강 상태를 보여 준다.** 각 패널 헤더에 마지막 갱신 시각, 수집 지연, 표본 수(n)를 표시한다. n이 작으면 백분위를 흐리게 하거나 "표본 부족"으로 표시한다. 수집기가 멈추면 "정상"이 아니라 "데이터 없음"으로 바꾼다. 측정 도구 버그 때문에 모니터링이 "정상"만 보여 준 사례(Riot MSI 2022)와 coordinated omission을 고려해, 클라이언트 하트비트 기반 측정을 따로 둔다. (Riot MSI; Gil Tene; ThousandEyes 측정 방식별 맹점)

21. **시간 범위와 해상도를 정해 둔다.** 기본은 최근 3시간, 1분 버킷이고 토글로 24시간(5분), 7일(1시간)을 고른다. 표시 시각은 KST로 하고 툴팁에 UTC를 함께 둔다. 자동 새로고침은 15–30초로 하고, 탭이 백그라운드에 있으면 멈춘다. 집계 간격은 원천 간격과 정렬한다. (Datadog heatmap 앨리어싱; AWS·Grafana의 불필요한 새로고침 자제)

22. **밀도는 데스크용과 벽 모드를 나눈다.** 데스크 모드는 12컬럼 그리드, 시계열 최소 4컬럼, 관련 위젯 그룹화를 지킨다. 벽(TV) 모드는 리전 타일과 상태 타임라인만 크게 보여 주고 폰트를 키운다. 벽에서는 "이상이 눈에 띄는지", 데스크에서는 "드릴다운할 수 있는지"가 목표다. 행 높이는 너무 줄이지 않는다. (Datadog guidelines; VMware big screen; Heer et al.)

23. **영향 규모 순으로 정렬한다.** 서버와 리전 목록의 기본 정렬은 "심각도 × 영향 플레이어 수(동접)"다. 이름순 정렬은 보조 옵션으로 둔다. 동접 수를 렉 지표 옆에 같이 보여 줘서 "100명 서버의 p99 폭등"과 "2만 명 서버의 p95 상승"을 구분할 수 있게 한다. (New Relic Lookout 순위: 크기와 편차를 함께 고려; Datadog Host Map Size by; EVE ESI 동접)

24. **용어집과 설명을 보드 안에 둔다.** 대시보드 설명 패널(접을 수 있게)과 패널별 ⓘ 툴팁에 다음을 적는다. 체감 렉의 정의, p95의 의미, 각 원인 분류 기준, 기준선 계산법, 임계값. 매일 보지 않는 사람(경영진, CS, 타 팀)이 읽어도 이해할 수 있게 쓴다. (Datadog "description is a must"; Grafana 패널 description)

25. **한국어 UI 카피 원칙.** 상태 라벨은 2–3글자 명사로 짧게 쓴다(정상, 지연, 불안정, 장애, 점검, 데이터 없음). 원인 라벨은 인프라, 네트워크, 서버, 클라이언트. 수치와 단위 사이에 공백을 넣는다(`182 ms`). 영문 약어(p95, RTT)는 그대로 두고 툴팁에서 한국어로 풀이한다. 리전은 "한국어명 + 코드" 형식(예: `동아시아 (APNE)`)으로 표기한다. (추론; Pretendard 사례)

---

## 3. 통계 기법 메모

> 렉 지표는 오른쪽으로 긴 꼬리를 가진 분포라서 원값에 정규 가정 z-점수를 쓰면 오탐이 많다(GitLab 결론; Skyline의 3-sigma 회고). 그래서 **로그 변환 → 계절 기준선 잔차 → 강건 척도(MAD)로 표준화**한 뒤 EWMA와 CUSUM을 적용하는 파이프라인을 권장한다.

### 3-0. 공통 전처리 (권장)
- 입력: 서버별 1분 버킷의 p95 RTT(또는 체감 렉 점수). 리전 값은 히스토그램을 병합해서 계산한다.
- 변환: `y_t = log(x_t)`. 곱셈적 변화(예: 평소의 2배)를 덧셈으로 바꿔 다루기 위해서다.
- 계절 기준선: `b_t = median( y_{t − 1w}, y_{t − 2w}, y_{t − 3w}, y_{t − 4w} )`. 같은 요일·같은 시각의 지난 4주 중앙값이다. 데이터가 부족하면 1일 주기로 대체한다. Datadog은 주간 계절성에 최소 3주, 최대 6주를 쓰고, Downdetector는 시각별 기준선을 쓴다.
- 기준선을 만들 때는 점검 시간과 이미 확인된 장애 구간을 제외한다(중앙값이 어느 정도 막아 주지만 명시적으로 빼는 편이 낫다).
- 잔차: `r_t = y_t − b_t`.

### 3-1. MAD 기반 강건 z-점수 (Modified z-score)
- 정의 (NIST, Iglewicz & Hoaglin):
  - `MAD = median_i( |x_i − median(x)| )`
  - `M_i = 0.6745 · (x_i − median(x)) / MAD`. 0.6745는 표준정규 분포의 0.75 분위수로, `σ̂ ≈ 1.4826·MAD`와 같다.
  - `|M_i| > 3.5`이면 이상치 후보.
- 렉 보드에서는 두 가지로 쓴다.
  1. **횡단면(같은 시점, 같은 리전의 서버들)**: "혼자 튀는 서버" 찾기. 그룹은 3대 이상이어야 한다(Datadog outlier 전제). 리전 전체가 함께 오르면 개별 서버는 이상치로 잡히지 않으므로, 그 경우는 리전 단위 시계열 탐지(아래 3-2, 3-3)로 넘긴다. 이 구분 자체가 "서버 원인인가, 인프라·네트워크 원인인가"를 가르는 단서가 된다.
  2. **시계열(한 서버의 잔차 r_t)**: 최근 7일 같은 시간대 잔차의 MAD로 표준화한다. `z_t = 0.6745 · (r_t − median(r)) / MAD(r)`.
- 권장 파라미터: 경보 `|M| ≥ 3.5`, 주의 `2.5 ≤ |M| < 3.5`. 지연은 오르는 방향만 의미가 있으므로 단측(`M > 0`)으로 본다.
- **MAD가 0일 때의 보호 장치**: 값이 거의 일정하면 MAD가 0에 가까워져 점수가 폭주한다. 하한을 둔다. 예: `MAD_eff = max(MAD, 0.05·median, 2 ms)`. Grafana PromQL 프레임워크의 "margin band"(최소 밴드 폭)와 같은 개념이다.
- 참고: Twitter S-H-ESD는 시계열 분해 뒤 중앙값과 MAD 기반 ESD로 계절 속 국소 이상까지 잡는다(`max_anoms=0.02`). 사후 분석용 배치 탐지에 적합하다.

### 3-2. EWMA (지수가중이동평균)
- 정의 (NIST):
  - `z_t = λ·x_t + (1 − λ)·z_{t−1}`, `z_0 = μ_0`(기준선)
  - 관리한계: `μ_0 ± L·σ·√( λ/(2−λ) · [1 − (1−λ)^{2t}] )`. 정상상태에서는 `μ_0 ± L·σ·√(λ/(2−λ))`.
- 파라미터:
  - `λ`는 0.1–0.3(Wikipedia가 인용한 1986년 권고), NIST 예제는 0.3이다. **렉 보드 권장은 λ = 0.2, L = 3**이다. 입력은 위의 표준화된 잔차 z(σ=1로 둠)이고, σ는 MAD로 추정한다.
  - 반감기는 `ln 0.5 / ln(1−λ)`다. λ=0.2이면 약 3.1개 샘플, 즉 1분 버킷 기준 약 3분이다. λ=0.1이면 약 6.6분이다.
- 용도: ① 화면 라인 스무딩(원선은 얇게, EWMA는 굵게), ② 1–1.5σ 수준의 "서서히 나빠지는" 렉을 Shewhart(단순 임계값)보다 일찍 잡기.
- 주의: λ가 작을수록 작은 드리프트에 민감하지만 반응이 느리다. 급격한 장애는 단순 임계값이나 MAD z가 더 빨리 잡으므로 함께 쓴다.

### 3-3. CUSUM (누적합)
- 정의 (NIST, SAS/QC 계산형, 상측 단측):
  - 표준화 입력: `z_t = (x_t − μ_0)/σ`. 여기서는 3-0과 3-1의 강건 잔차 z를 그대로 쓴다.
  - `S⁺_t = max(0, S⁺_{t−1} + z_t − k)`, `S⁺_0 = 0`
  - `S⁺_t > h`이면 경보를 띄우고, 경보 뒤에는 `S⁺`를 0으로 리셋한다.
- 파라미터:
  - `k = δ/2`(δ는 잡고 싶은 이동 크기를 σ 단위로 쓴 값). 1σ 이동을 잡으려면 **k = 0.5**.
  - `h = 4–5`. 실무 경험칙으로 h=5이면 관리 상태 ARL이 약 465(오경보 간격이 길다)이고, SAS 예제 h=3, k=0.5이면 ARL이 약 117.6이다. **렉 보드 권장은 k = 0.5, h = 5**(1분 버킷이면 오경보는 대략 몇 시간에 한 번 수준)이다. 더 민감하게 하려면 h = 4로 낮춘다.
- **렉 보드에서 특히 유용한 점: 시작 시점 추정.** 경보가 울린 시점에서 거슬러 올라가 `S⁺`가 마지막으로 0이었던 시각이 변화가 시작된 시점의 추정치다. 이것을 "언제부터 나빠졌나" 주석으로 자동 표시하고, 같은 시각 근처의 배포나 변경 주석과 바로 맞대 본다(규칙 15).
- 하측 CUSUM(`S⁻`)은 지연에는 필요 없다. 다만 "트래픽 급감"(접속 불가)을 감지할 때는 동접 지표에 하측 CUSUM을 적용한다. Cloudflare Radar도 급락 위주로 탐지한다.

### 3-4. 판정 조합 (권장 파이프라인)
| 단계 | 기법 | 출력 | 표시 위치 |
|---|---|---|---|
| 1 | 로그 변환 + 4주 같은 요일·시각 중앙값 기준선 | 잔차 r | 회색 기준선 리본 |
| 2 | MAD 강건 z (시계열) | z, 주의(≥2.5) / 경보(≥3.5) | 타일 상태, 정렬 점수 |
| 3 | MAD 강건 z (리전 내 서버 횡단면) | 혼자 튀는 서버 | 서버 격자 하이라이트, "서버 원인" 근거 |
| 4 | EWMA(λ=0.2, L=3) on z | 완만한 악화 감지, 스무딩 라인 | 차트 굵은 선 |
| 5 | CUSUM(k=0.5, h=5) on z | 변화 시작 시점 | 시간 차트 "시작 추정" 주석 |
| 6 | 지속 조건(5분 중 3분) + 교차 확인(클라이언트·서버 신호) | 최종 이상 배지 | 리전 타일 배지 |

- 페이징은 SLO 소진 기준으로 하고, 위 파이프라인은 사람의 주의를 이끄는 데만 쓴다(PromCon 2024, Google SRE).
- 계절성이 강하지 않거나 데이터가 2주 미만이면 Grafana PromQL 프레임워크의 adaptive 방식(26시간 스무딩 평균·표준편차 + 마진 밴드)으로 대체한다. 지표가 뾰족하게 튀는 경우에는 robust 방식(중앙값·MAD)을 쓴다.
