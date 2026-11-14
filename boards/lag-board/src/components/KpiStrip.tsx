import type { BoardModel } from '../analytics/model';
import { REGIONS, THRESHOLDS, tierOf } from '../data/config';
import { fmtCompact, fmtFixed, fmtInt, signed } from '../lib/format';
import { activeIncidents, binMean, CAUSE_ORDER, rangeIdx, type RangeKey } from '../lib/view';
import { CauseBadge, TierPill } from './Badges';
import { Sparkline } from './Sparkline';

const toneOf = (ms: number) => {
  const t = tierOf(ms);
  return t === 'notice' || t === 'warning' || t === 'critical' ? t : 'neutral';
};

export function KpiStrip({ m, t, range }: { m: BoardModel; t: number; range: RangeKey }) {
  const { from } = rangeIdx(m, range);
  const to = t;
  const sFrom = Math.min(from, to - 10);
  const bin = Math.max(1, Math.round((to - sFrom) / 60));
  const g = m.global;
  const p95 = g.p95[t];
  const prev = g.p95[Math.max(m.viewFrom, t - 60)];
  const lag = g.lagUsers[t];
  const ccu = g.ccu[t];
  const ccuPrev = g.ccu[Math.max(m.viewFrom, t - 60)];
  const active = activeIncidents(m, t);
  const worst = REGIONS.map((r) => ({ r, v: m.regions[r.id].p95[t] })).sort((a, b) => b.v - a.v)[0];
  const done = m.incidents.filter((i) => i.detectIdx <= t);
  const mttd = done.length ? done.reduce((a, i) => a + (i.detectIdx - i.onsetIdx), 0) / done.length : 0;

  return (
    <section className="kpis" aria-label="핵심 지표">
      <article className="kpi">
        <span className="kpi-label">글로벌 체감 지연 <em>유저 p95</em></span>
        <div className="kpi-value-row">
          <span className="kpi-value">{fmtInt(p95)}<small>ms</small></span>
          <TierPill tier={tierOf(p95)} />
        </div>
        <span className="kpi-delta num">1시간 전 대비 {signed(p95 - prev, 'ms')}</span>
        <Sparkline values={binMean(g.p95, sFrom, to, bin)} threshold={THRESHOLDS.notice} tone={toneOf(p95)} label="글로벌 p95 추이" />
      </article>

      <article className="kpi">
        <span className="kpi-label">렉 체감 유저 <em>150ms 이상</em></span>
        <div className="kpi-value-row">
          <span className="kpi-value">{fmtCompact(lag)}<small>명</small></span>
        </div>
        <span className="kpi-delta num">동시 접속의 {fmtFixed((lag / ccu) * 100, 1)}%</span>
        <Sparkline values={binMean(g.lagUsers, sFrom, to, bin)} tone={lag > 0 ? 'notice' : 'neutral'} label="렉 체감 유저 추이" />
      </article>

      <article className="kpi">
        <span className="kpi-label">진행 중 장애</span>
        <div className="kpi-value-row">
          <span className="kpi-value">{active.length}<small>건</small></span>
        </div>
        <div className="kpi-chips">
          {active.length === 0 && <span className="muted">없음</span>}
          {CAUSE_ORDER.filter((c) => active.some((i) => i.cause === c)).map((c) => (
            <CauseBadge key={c} cause={c} size="s" />
          ))}
        </div>
      </article>

      <article className="kpi">
        <span className="kpi-label">가장 나쁜 권역 <em>유저 p95</em></span>
        <div className="kpi-value-row">
          <span className="kpi-value">{worst.r.name}</span>
          <TierPill tier={tierOf(worst.v)} />
        </div>
        <span className="kpi-delta num">{fmtInt(worst.v)}ms · {worst.r.city} {worst.r.dc}</span>
        <Sparkline values={binMean(m.regions[worst.r.id].p95, sFrom, to, bin)} threshold={THRESHOLDS.notice} tone={toneOf(worst.v)} label={`${worst.r.name} p95 추이`} />
      </article>

      <article className="kpi">
        <span className="kpi-label">동시 접속</span>
        <div className="kpi-value-row">
          <span className="kpi-value">{fmtCompact(ccu)}<small>명</small></span>
        </div>
        <span className="kpi-delta num">1시간 전 대비 {signed(((ccu - ccuPrev) / ccuPrev) * 100, '%')}</span>
        <Sparkline values={binMean(g.ccu, sFrom, to, bin)} label="동시 접속 추이" />
      </article>

      <article className="kpi">
        <span className="kpi-label">평균 감지 시간 <em>CUSUM</em></span>
        <div className="kpi-value-row">
          <span className="kpi-value">{fmtFixed(mttd, 1)}<small>분</small></span>
        </div>
        <span className="kpi-delta">변화 시작 → 경보, 오늘 장애 {done.length}건 기준</span>
      </article>
    </section>
  );
}
