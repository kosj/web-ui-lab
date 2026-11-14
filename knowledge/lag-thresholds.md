# MMORPG 렉 체감 임계값 — 조사 노트

> 조사일 2026-11-14. 질문: "MMORPG에서 유저가 렉을 느끼는 RTT 상한은 얼마인가?"
> 수집 방법: 웹 검색 결과의 본문 발췌. 원문 PDF 일부(cs.wpi.edu, cacm.acm.org, iis.sinica.edu.tw)는 이 세션의 네트워크 정책 때문에 직접 열지 못했다. 정확한 수치를 인용할 때는 원문을 다시 확인할 것.

## 결론 (렉 보드 v0.1 채택값)

| 등급 | 체감 지연(RTT 환산) | 근거 |
|---|---|---|
| 쾌적 | < 100ms | 장르 평균 최소 인지 지연이 100ms 미만 (Raaen 2020 서베이). 다수 연구가 "약 85~100ms부터 알아챔"이라고 보고 |
| 양호 | 100–150ms | 지연을 알아채는 유저가 생기기 시작. 150ms 유저도 평균 약 4시간 플레이 (Chen et al. 2006, ShenZhou Online) |
| 주의 | 150–250ms | 체감 렉. 플레이 시간이 줄기 시작하는 구간 |
| 경고 | 250–500ms | 250ms 유저 평균 플레이 약 1시간 (Chen et al.) — 이탈 급증. WoW 커뮤니티 관례상 250ms 이상을 빨간 막대로 본다 |
| 심각 | ≥ 500ms | 3인칭 아바타 게임(RPG 포함) 허용 상한 약 500ms (Claypool & Claypool 2006) |

- **"렉을 느끼는 상한"** 질문에 대한 답: 유저가 렉을 확실히 체감하고 행동(이탈)이 바뀌는 지점은 **약 250ms**, 플레이가 가능하다고 볼 수 있는 상한은 **약 500ms**다.
- 기준값은 RTT(왕복)다. 보드는 RTT p95에 지터·손실·서버 틱·클라 프레임을 더한 "체감 지연(EL)"을 같은 ms 척도로 비교한다.

## 출처별 요약

1. **Claypool & Claypool (2006), "Latency and Player Actions in Online Games", CACM**
   - 1인칭(FPS·레이싱) 약 100ms, 3인칭(스포츠·RPG) 약 500ms, 전지적 시점(RTS) 약 1000ms를 허용 한계로 제시.
   - 한 3인칭 RPG에서는 500ms가 지나기 전까지 성과 저하가 유의하지 않았다. 다만 "급격한 경계"가 아니라 저하가 시작되는 근처값이다.
   - 출처: [ResearchGate](https://www.researchgate.net/publication/220427777_Latency_and_player_actions_in_online_games), [scispace PDF](https://scispace.com/pdf/latency-and-player-actions-in-online-games-1j5qittqq5.pdf)
2. **Chen, Huang, Lei (2006), "How Sensitive Are Online Gamers to Network Quality?", CACM** — 상용 MMORPG(ShenZhou Online) 13억 패킷 트레이스
   - 150ms 유저는 평균 4시간, 250ms 유저는 평균 1시간 플레이.
   - 손실 ≤ 1% 세션은 평균 160분, > 1% 세션은 70분.
   - 이탈 민감도 비: 지연 : 지터 : 클라 손실 : 서버 손실 ≈ 1 : 2 : 4 : 3 (다른 판본은 1:2:11:6). → EL 공식의 지터·손실 가중치 근거.
   - 출처: [논문 소개](https://homepage.iis.sinica.edu.tw/~swc/pub/game_session_time.html), [CACM](https://cacm.acm.org/research/how-sensitive-are-online-gamers-to-network-quality)
3. **Fritsch, Ritter, Schiller (2005), EverQuest 2 현장 연구**
   - EQ2 유저는 수백 ms를 견딤. 행동 큐잉 시스템이 지연을 흡수하기 때문으로 해석.
   - 시사점: 같은 MMORPG라도 전투 시스템(큐잉·논타겟)에 따라 임계값이 달라진다. 논타겟 액션 MMORPG는 기준을 더 낮춰야 한다.
   - 출처: [researchr](https://researchr.org/publication/FritschRS05), [WPI 기술 보고서](https://ftp.cs.wpi.edu/pub/techreports/pdf/21-08.pdf)
4. **Raaen (2020), "Latency Thresholds for Usability in Games: A Survey"**
   - 모든 장르의 평균 최소 인지 지연이 100ms 미만. 3인칭 게임의 "인지 가능" 결론은 연구마다 45ms~500ms 이상으로 편차가 크다.
   - 출처: [NTNU](https://www.ntnu.no/ojs/index.php/nikt/article/download/5252/4728)
5. **커뮤니티·실무 관례 (비학술, 참고만)**
   - WoW 애드온 관례: < 100ms 녹색, 101–250 노랑, 251+ 빨강. 250ms를 넘으면 NPC·플레이어가 순간이동하듯 보인다는 체감 보고.
   - Warcraft Wiki: Home/World 지연의 통념적 해석은 틀렸다 — 지표 이름만으로 원인을 단정하지 말 것.
   - 출처: [Warcraft Wiki — Latency](https://warcraft.wiki.gg/wiki/Latency), [CurseForge LagGuard](https://www.curseforge.com/wow/addons/lagguard)

## 주의할 점

- 임계값은 장르·전투 방식·유저 숙련도에 따라 다르다. 실서비스에서는 자사 텔레메트리(지연 구간별 세션 길이·이탈률)로 다시 맞춰야 한다. Chen et al.의 방법(지연 구간별 세션 길이 생존 분석)을 그대로 재현할 수 있다.
- 평균 RTT보다 **지터와 손실**이 이탈에 더 민감하다. RTT만 보는 보드는 손실형 장애를 과소평가한다.
- 클라우드 게임처럼 입력→화면 경로가 긴 환경에서는 3인칭이라도 1인칭 수준으로 민감해진다는 후속 연구가 있다 (Claypool, cloud-based games).
