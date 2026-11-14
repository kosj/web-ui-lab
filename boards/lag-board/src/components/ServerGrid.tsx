import type { BoardModel } from '../analytics/model';
import { REGIONS, THRESHOLDS, TIER_LABEL, type RegionId } from '../data/config';
import { fmtCompact, fmtInt } from '../lib/format';
import { binMean, rangeIdx, serverNow, type RangeKey } from '../lib/view';
import { CauseBadge, TIER_ICON } from './Badges';
import { Sparkline } from './Sparkline';

export function ServerGrid(props: {
  m: BoardModel; t: number; range: RangeKey; region: 'ALL' | RegionId; selected: string; onSelect: (id: string) => void;
}) {
  const { m, t, range, region, selected, onSelect } = props;
  const { from } = rangeIdx(m, range);
  const to = t;
  const sFrom = Math.min(from, to - 10);
  const bin = Math.max(1, Math.round((to - sFrom) / 48));
  const regions = REGIONS.filter((r) => region === 'ALL' || r.id === region);

  return (
    <section className="card grid-card">
      <header className="card-head">
        <div>
          <h2>서버별 현황</h2>
          <p className="card-sub">권역 → DC 랙 순서로 배치했습니다. 같은 랙이 함께 붉어지면 인프라, 권역 전체면 네트워크를 의심합니다.</p>
        </div>
      </header>
      <div className={`region-cols ${region === 'ALL' ? '' : 'single'}`}>
        {regions.map((r) => {
          const servers = m.ds.servers.filter((s) => s.region === r.id);
          const racks = [...new Set(servers.map((s) => s.rack))];
          const p95 = m.regions[r.id].p95[t];
          return (
            <div key={r.id} className="region-col">
              <div className="region-col-head">
                <h3>{r.name}</h3>
                <span className="muted">{r.city} · {r.dc}</span>
                <span className="region-p95 num">p95 {fmtInt(p95)}ms</span>
              </div>
              {racks.map((rack) => (
                <div key={rack} className="rack">
                  <span className="rack-label">{r.dc} · 랙 {rack}</span>
                  <div className="tiles">
                    {servers.filter((s) => s.rack === rack).map((s) => {
                      const now = serverNow(m, s.id, t);
                      const Icon = TIER_ICON[now.tier];
                      const tone = now.tier === 'notice' || now.tier === 'warning' || now.tier === 'critical' ? now.tier : 'neutral';
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`tile tile-${now.tier} ${selected === s.id ? 'is-selected' : ''}`}
                          onClick={() => onSelect(s.id)}
                          aria-pressed={selected === s.id}
                          aria-label={`${s.id} ${s.name} 체감 지연 ${fmtInt(now.el)}ms ${TIER_LABEL[now.tier]}`}
                        >
                          <span className="tile-top">
                            <span className="tile-id">{s.id}</span>
                            <span className="tile-name">{s.name}</span>
                          </span>
                          <span className="tile-value num">{fmtInt(now.el)}<small>ms</small></span>
                          <Sparkline values={binMean(m.an[s.id].el, sFrom, to, bin)} yMax={THRESHOLDS.warning} threshold={THRESHOLDS.notice} tone={tone} height={22} label={`${s.id} 추이`} />
                          <span className="tile-foot">
                            <span className={`tile-tier tier-ink-${now.tier}`}><Icon size={12} strokeWidth={2.4} aria-hidden />{TIER_LABEL[now.tier]}</span>
                            {now.dominant ? <CauseBadge cause={now.dominant} size="s" /> : <span className="muted num">{fmtCompact(now.ccu)}명</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
