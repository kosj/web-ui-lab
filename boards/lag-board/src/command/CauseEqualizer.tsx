import type { AggSeries } from '../analytics/model';
import { CAUSES, type Cause } from '../data/config';
import { CAUSE_ICON } from '../components/Badges';
import { fmtInt } from '../lib/format';

/**
 * 원인 이퀄라이저 — 4원인의 초과 지연(전일 동시간대 대비, 유저 가중 평균)을 LED 막대로.
 * 칸 경계는 로그 간격(2~320ms) → 작은 초과와 큰 초과를 한 화면에서 같이 읽는다.
 * 피크 홀드 = 최근 15분 최대값(실제 데이터) — 음향 이퀄라이저의 물리 감쇠를 흉내 내지 않는다.
 */
export const EQ_EDGES = [2, 4, 7, 12, 20, 32, 50, 75, 110, 160, 230, 320];
const lit = (v: number) => EQ_EDGES.filter((e) => v >= e).length;

export function CauseEqualizer({ agg, t, from, scopeLabel }: { agg: AggSeries; t: number; from: number; scopeLabel: string }) {
  const rows = CAUSES.map((c) => {
    const s = agg.excess[c.id as Cause];
    let peak = 0;
    for (let k = Math.max(from, t - 15); k <= t; k++) peak = Math.max(peak, s[k]);
    return { ...c, v: Math.max(0, s[t]), peak };
  });
  const total = rows.reduce((a, r) => a + r.v, 0);
  return (
    <section className="cc-eq" aria-label={`${scopeLabel} 원인별 초과 지연`}>
      <header className="cc-eyebrow">원인별 초과 지연 <em>전일 대비 · {scopeLabel}</em></header>
      <div className="cc-eq-cols">
        {rows.map((r) => {
          const Icon = CAUSE_ICON[r.id as Cause];
          const n = lit(r.v);
          const pk = lit(r.peak);
          return (
            <div key={r.id} className={`cc-eq-col cc-c-${r.id}`} role="meter" aria-valuemin={0} aria-valuemax={320} aria-valuenow={Math.round(r.v)}
              aria-label={`${r.label} 초과 ${fmtInt(r.v)}ms, 최근 15분 최대 ${fmtInt(r.peak)}ms`}>
              <span className="cc-eq-val num">{r.v >= 1 ? `+${fmtInt(r.v)}` : '0'}</span>
              <div className="cc-eq-stack" aria-hidden>
                {EQ_EDGES.map((e, i) => (
                  <i key={e} className={i < n ? 'on' : i === pk - 1 ? 'peak' : ''} />
                ))}
              </div>
              <span className="cc-eq-label"><Icon size={12} strokeWidth={2.3} aria-hidden />{r.label}</span>
            </div>
          );
        })}
      </div>
      <p className="cc-eq-note">합계 <b className="num">+{fmtInt(total)}ms</b> · 칸 = 로그 눈금 2–320ms · 흰 칸 = 15분 최대</p>
    </section>
  );
}
