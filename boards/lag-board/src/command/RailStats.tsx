import type { AggSeries, BoardModel } from '../analytics/model';
import { CAUSE_LABEL, THRESHOLDS } from '../data/config';
import { RollingNumber } from '../components/RollingNumber';
import { fmtCompact, fmtFixed, signed } from '../lib/format';
import { binMean, CAUSE_ORDER } from '../lib/view';
import { GlowSpark } from './GlowSpark';
import { CC, CC_TIER } from './palette';
import type { Incident } from '../analytics/incidents';

/** 레일의 2×2 수치 — 렉 체감 유저 · 동시 접속 · 진행 중 장애 · 평균 감지 시간 */
export function RailStats({ m, t, agg, active }: { m: BoardModel; t: number; agg: AggSeries; active: Incident[] }) {
  const from = Math.max(m.viewFrom, t - 120);
  const lag = agg.lagUsers[t];
  const ccu = agg.ccu[t];
  const ccuPrev = agg.ccu[Math.max(m.viewFrom, t - 60)];
  const done = m.incidents.filter((i) => i.detectIdx <= t);
  const mttd = done.length ? done.reduce((a, i) => a + (i.detectIdx - i.onsetIdx), 0) / done.length : 0;
  const share = ccu ? lag / ccu : 0;
  return (
    <div className="cc-stats">
      <div className={`cc-stat ${share > 0.05 ? 'is-hot' : ''}`}>
        <span className="cc-stat-label">렉 체감 유저 <em>≥{THRESHOLDS.notice}ms</em></span>
        <span className="cc-stat-val"><RollingNumber text={fmtCompact(lag)} /><small>명</small></span>
        <span className="cc-stat-sub num">동접의 {fmtFixed(share * 100, 1)}%</span>
        <GlowSpark values={binMean(agg.lagUsers, from, t, 3)} color={share > 0.05 ? CC_TIER.notice : CC.cyan} height={22} label="렉 체감 유저 2시간 추이" />
      </div>
      <div className="cc-stat">
        <span className="cc-stat-label">동시 접속</span>
        <span className="cc-stat-val"><RollingNumber text={fmtCompact(ccu)} /><small>명</small></span>
        <span className="cc-stat-sub num">1시간 {signed(((ccu - ccuPrev) / ccuPrev) * 100, '%')}</span>
        <GlowSpark values={binMean(agg.ccu, from, t, 3)} color={CC.cyan} height={22} label="동시 접속 2시간 추이" />
      </div>
      <div className={`cc-stat ${active.length ? 'is-alert' : ''}`}>
        <span className="cc-stat-label">진행 중 장애</span>
        <span className="cc-stat-val"><RollingNumber text={String(active.length)} /><small>건</small></span>
        <span className="cc-stat-causes">
          {active.length === 0 && <span className="cc-stat-sub">없음</span>}
          {CAUSE_ORDER.filter((c) => active.some((i) => i.cause === c)).map((c) => (
            <span key={c} className={`cc-cause mini cc-c-${c}`}>{CAUSE_LABEL[c]}</span>
          ))}
        </span>
      </div>
      <div className="cc-stat">
        <span className="cc-stat-label">평균 감지 <em>CUSUM</em></span>
        <span className="cc-stat-val"><RollingNumber text={fmtFixed(mttd, 1)} /><small>분</small></span>
        <span className="cc-stat-sub">변화 시작 → 경보 · {done.length}건</span>
      </div>
    </div>
  );
}
