import { TIERS } from '../data/config';
import { TIER_ICON } from './Badges';

const SOURCES = [
  { label: 'Claypool & Claypool (2006), Latency and Player Actions in Online Games — 3인칭 RPG 허용 약 500ms', href: 'https://www.researchgate.net/publication/220427777_Latency_and_player_actions_in_online_games' },
  { label: 'Chen, Huang, Lei (2006), How Sensitive Are Online Gamers to Network Quality? — MMORPG 150ms 4시간, 250ms 1시간 플레이', href: 'https://homepage.iis.sinica.edu.tw/~swc/pub/game_session_time.html' },
  { label: 'Raaen (2020), Latency Thresholds for Usability in Games: A Survey — 장르 평균 최소 인지 지연 100ms 미만', href: 'https://www.ntnu.no/ojs/index.php/nikt/article/download/5252/4728' },
  { label: 'Warcraft Wiki — Latency (지연 막대 색 해석과 Home/World 구분)', href: 'https://warcraft.wiki.gg/wiki/Latency' },
];

const TIER_BASIS: Record<string, string> = {
  smooth: '대부분의 유저가 지연을 알아채지 못함',
  good: '민감한 유저부터 지연 인지 (장르 평균 인지 하한 ~100ms)',
  notice: 'MMORPG 실측: 150ms 이후 플레이 시간 감소',
  warning: '250ms 유저 평균 플레이 1시간 — 이탈 급증',
  critical: '3인칭 RPG 허용 상한(약 500ms) 초과',
};

export function MethodNote() {
  return (
    <section className="card method" aria-labelledby="method-title">
      <header className="card-head">
        <div>
          <h2 id="method-title">판정 기준과 방법</h2>
          <p className="card-sub">가상 데이터로 만든 샘플 보드입니다. 수치와 장애는 시나리오로 주입했습니다.</p>
        </div>
      </header>
      <div className="method-grid">
        <div>
          <h3>체감 지연 등급 (RTT 환산 ms)</h3>
          <table className="data-table tier-table">
            <tbody>
              {TIERS.map((t, i) => {
                const Icon = TIER_ICON[t.id];
                const next = TIERS[i + 1];
                return (
                  <tr key={t.id}>
                    <th scope="row"><span className={`tier-ink-${t.id}`}><Icon size={13} aria-hidden /></span> {t.label}</th>
                    <td className="num">{next ? `${t.min}–${next.min}ms` : `${t.min}ms 이상`}</td>
                    <td>{TIER_BASIS[t.id]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h3>체감 지연(EL) 계산</h3>
          <pre className="formula">{`EL = 네트워크 + 서버 + 클라
네트워크 = RTT p95 + 1.5×지터 + 50ms×손실률(%)
서버     = ½×틱 p99 + 1.5×max(0, 틱 p99 − 50)
클라     = ½×프레임 p95 + 1.5×max(0, 프레임 p95 − 50)`}</pre>
          <p className="method-p">지터·손실 가중은 MMORPG 이탈 민감도 비(지연 1 : 지터 2 : 손실 3~4)를 반영했습니다.</p>
          <p className="method-p">분포 히트맵은 유저 1명의 EL을 <b>통신사 경로 RTT(로그정규) + 지터·손실 + 서버 성분 + 버전별 클라 성분</b>으로 근사해 서버 × 통신사 × 클라 버전 혼합으로 계산합니다. 띠가 두 갈래면 일부 집단만 느린 것입니다.</p>
        </div>
        <div>
          <h3>원인 판별</h3>
          <ol className="method-list">
            <li>기준선은 <b>전일 동시간대 ±45분 중앙값</b>, 이상 정도는 <b>MAD 기반 강건 z</b>(EWMA 평활)로 계산합니다.</li>
            <li>z가 2.5를 넘는 성분만 초과 지연으로 집계하고, 호스트 지표(CPU steal·I/O)가 함께 튀면 서버 지연을 <b>인프라</b>로 넘깁니다.</li>
            <li>같은 랙 2대 이상 동시 악화는 <b>인프라</b>, 권역 전체는 <b>네트워크</b>, 한 대만은 <b>서버</b>, 지역 무관·버전 상관은 <b>클라</b>로 묶습니다.</li>
            <li>시작 시각은 <b>CUSUM</b>(k=0.5, h=5)으로 역추정하고, 경보까지 걸린 시간을 감지 시간으로 기록합니다.</li>
            <li>
              <b>채팅 제보 × TCP 재전송</b>: 두 신호 모두 전일 동시간대 대비 편차로 바꾼 뒤(제보는 포아송 기대치 대비 Anscombe 잔차) 서버 단위 급증 사건의
              <b> 동시발생</b>을 우연 기대치와 비교하고, 재전송 급증을 0분에 맞춘 <b>사건 정렬 평균</b>으로 시차를 봅니다. 재전송이 늘면 네트워크 근거, 제보만 늘고 지표가 직전 15분부터 평소면 <b>측정 사각지대</b>로 분류합니다.
            </li>
            <li>네트워크 장애는 <b>통신사 경로별 초과 지연 기여</b>(유저 비중 × 전일 대비 증가)를 계산해, 한 통신사가 70% 이상이면 범위를 그 통신사로 좁힙니다.</li>
          </ol>
        </div>
      </div>
      <h3 className="sources-title">임계값 출처</h3>
      <ul className="sources">
        {SOURCES.map((s) => (
          <li key={s.href}><a href={s.href} target="_blank" rel="noreferrer">{s.label}</a></li>
        ))}
      </ul>
    </section>
  );
}
