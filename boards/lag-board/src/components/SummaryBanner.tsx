import type { BoardModel } from '../analytics/model';
import { CAUSE_LABEL, TIER_LABEL } from '../data/config';
import { fmtCompact, fmtDuration, hhmm } from '../lib/format';
import { activeIncidents, incidentTierAt, TIER_RANK } from '../lib/view';
import { CauseBadge, TIER_ICON, TierPill } from './Badges';
import type { Incident } from '../analytics/incidents';
import { useEscalation } from '../lib/useEscalation';

/** 화면 최상단 한 줄 요약 — "어디서, 얼마나, 왜"를 문장으로 */
export function SummaryBanner({ m, t, onPick }: { m: BoardModel; t: number; onPick: (inc: Incident) => void }) {
  const active = activeIncidents(m, t)
    .map((inc) => ({ inc, tier: incidentTierAt(m, inc, t) }))
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const lag = m.global.lagUsers[t];
  const ccu = m.global.ccu[t];
  const worst = active[0]?.tier ?? 'smooth';
  const Icon = TIER_ICON[worst];
  const pulse = useEscalation(TIER_RANK[worst]);

  return (
    <section className={`summary summary-${worst}`} aria-live="polite">
      <div className="summary-head">
        <span className={`summary-icon tier-ink-${worst}`} aria-hidden>
          <Icon key={worst} className="swap-in" size={22} strokeWidth={2.2} />
          {pulse > 0 && <span key={pulse} className={`pulse-ring ring-${worst}`} />}
        </span>
        <p className="summary-line">
          {active.length === 0 ? (
            <>진행 중인 장애가 없습니다. 전 권역 체감 지연이 정상 범위입니다.</>
          ) : (
            <>
              진행 중 장애 <b className="num">{active.length}건</b> · 렉 체감 유저{' '}
              <b className="num">{fmtCompact(lag)}명</b>
              <span className="muted"> (동접 {fmtCompact(ccu)}명의 {Math.round((lag / ccu) * 100)}%)</span>
            </>
          )}
        </p>
      </div>
      {active.length > 0 && (
        <ul className="summary-items">
          {active.map(({ inc, tier }) => (
            <li key={inc.id}>
              <button type="button" className="summary-item" onClick={() => onPick(inc)}>
                <CauseBadge cause={inc.cause} size="s" />
                <span className="summary-title">{inc.title}</span>
                <TierPill tier={tier} />
                <span className="muted num">
                  {hhmm(m.ds.times[inc.onsetIdx])}부터 · {fmtDuration(t - inc.onsetIdx)}째
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">
        {active.map(({ inc, tier }) => `${CAUSE_LABEL[inc.cause]} ${inc.title} ${TIER_LABEL[tier]}`).join(', ')}
      </span>
    </section>
  );
}
