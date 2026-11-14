import type { BoardModel } from '../analytics/model';
import { isActiveAt } from '../analytics/model';
import { CAUSE_LABEL, REGIONS, THRESHOLDS, TIER_LABEL, tierOf, type RegionId } from '../data/config';
import { ispRows } from '../components/IspDrilldown';
import { RollingNumber } from '../components/RollingNumber';
import { CAUSE_ICON, TIER_ICON } from '../components/Badges';
import { fmtCompact, fmtFixed, fmtInt, signed } from '../lib/format';
import { binMean } from '../lib/view';
import { GlowSpark } from './GlowSpark';
import { CC_TIER } from './palette';

type Scope = 'ALL' | RegionId;

/**
 * 권역 포드 6개 — 지도에서 고른 권역과 연동. 최근 2시간 p95 궤적(150ms 기준선) + 통신사 막대.
 * 통신사 막대 높이 = 그 통신사 유저 체감 지연 추정(로그), 색 = 등급, 테두리 발광 = 경로 이상(z ≥ 3, +15ms).
 */
export function RegionPods({ m, t, scope, onScope }: { m: BoardModel; t: number; scope: Scope; onScope: (s: Scope) => void }) {
  return (
    <section className="cc-pods" aria-label="권역별 상태">
      {REGIONS.map((r) => {
        const a = m.regions[r.id];
        const v = a.p95[t];
        const prev = a.p95[Math.max(m.viewFrom, t - 60)];
        const tier = tierOf(v);
        const from = Math.max(m.viewFrom, t - 120);
        const trace = binMean(a.p95, from, t, 2);
        const rows = ispRows(m, r.id, t);
        const causes = [...new Set(m.incidents.filter((i) => i.region === r.id && i.scopeType !== 'global' && isActiveAt(i, t) && i.detectIdx <= t).map((i) => i.cause))];
        const Icon = TIER_ICON[tier];
        const sel = scope === r.id;
        return (
          <button
            key={r.id}
            type="button"
            className={`cc-pod cc-t-${tier} ${sel ? 'is-selected' : ''} ${scope !== 'ALL' && !sel ? 'is-dimmed' : ''}`}
            style={{ ['--tier' as string]: CC_TIER[tier] }}
            onClick={() => onScope(sel ? 'ALL' : r.id)}
            aria-pressed={sel}
            aria-label={`${r.name} p95 ${fmtInt(v)}ms ${TIER_LABEL[tier]}. 눌러서 ${sel ? '전체 보기' : '이 권역만 보기'}`}
          >
            <span className="cc-pod-head">
              <span className="cc-pod-name"><b>{r.name}</b><span>{r.city} · {r.dc}</span></span>
              <span className={`cc-tier-tag cc-t-${tier}`}><Icon size={11} strokeWidth={2.6} aria-hidden />{TIER_LABEL[tier]}</span>
            </span>
            <span className="cc-pod-row">
              <span className="cc-pod-val"><RollingNumber text={fmtInt(v)} /><small>ms</small></span>
              <span className="cc-pod-delta num">{signed(v - prev, 'ms')}<em>1시간</em></span>
            </span>
            <GlowSpark values={trace} color={CC_TIER[tier]} threshold={THRESHOLDS.notice} max={200} height={34} label={`${r.name} 최근 2시간 p95`} />
            <span className="cc-pod-foot">
              <span className="cc-pod-isps" aria-hidden>
                {rows.map((row) => (
                  <i
                    key={row.def.id}
                    className={row.anomaly ? 'is-anom' : ''}
                    style={{ height: `${Math.max(14, Math.min(100, (Math.log10(Math.max(30, row.el)) - 1.4) / 1.4 * 100))}%`, background: CC_TIER[row.tier] }}
                    title={`${row.def.name} ${fmtInt(row.el)}ms`}
                  />
                ))}
              </span>
              <span className="cc-pod-meta num">
                동접 {fmtCompact(a.ccu[t])} · 렉 체감 {fmtFixed((a.lagUsers[t] / a.ccu[t]) * 100, 0)}%
              </span>
              {causes.map((c) => {
                const CI = CAUSE_ICON[c];
                return <span key={c} className={`cc-cause mini cc-c-${c}`}><CI size={11} strokeWidth={2.4} aria-hidden />{CAUSE_LABEL[c]}</span>;
              })}
            </span>
          </button>
        );
      })}
    </section>
  );
}
