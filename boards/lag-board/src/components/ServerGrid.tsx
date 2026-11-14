import type { BoardModel } from '../analytics/model';
import { REGIONS, THRESHOLDS, TIER_LABEL, type RegionId } from '../data/config';
import { fmtCompact, fmtInt } from '../lib/format';
import { binMean, rangeIdx, serverNow, TIER_RANK, type RangeKey } from '../lib/view';
import { CauseBadge, TIER_ICON } from './Badges';
import { Sparkline } from './Sparkline';
import { RollingNumber } from './RollingNumber';
import { useEscalation } from '../lib/useEscalation';

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
                    {servers.filter((s) => s.rack === rack).map((s) => (
                      <ServerTile key={s.id} m={m} id={s.id} name={s.name} t={t} sFrom={sFrom} bin={bin} selected={selected === s.id} onSelect={onSelect} />
                    ))}
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

function ServerTile({ m, id, name, t, sFrom, bin, selected, onSelect }: {
  m: BoardModel; id: string; name: string; t: number; sFrom: number; bin: number; selected: boolean; onSelect: (id: string) => void;
}) {
  const now = serverNow(m, id, t);
  const Icon = TIER_ICON[now.tier];
  const tone = now.tier === 'notice' || now.tier === 'warning' || now.tier === 'critical' ? now.tier : 'neutral';
  // 등급이 올라가는 순간에만 한 번 링이 퍼진다 (주의 이상으로 악화될 때)
  const pulse = useEscalation(TIER_RANK[now.tier]);
  const showPulse = pulse > 0 && TIER_RANK[now.tier] >= TIER_RANK.notice;
  return (
    <button
      type="button"
      className={`tile tile-${now.tier} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`${id} ${name} 체감 지연 ${fmtInt(now.el)}ms ${TIER_LABEL[now.tier]}`}
    >
      {showPulse && <span key={pulse} className={`pulse-ring ring-${now.tier}`} aria-hidden />}
      <span className="tile-top">
        <span className="tile-id">{id}</span>
        <span className="tile-name">{name}</span>
      </span>
      <span className="tile-value"><RollingNumber text={fmtInt(now.el)} /><small>ms</small></span>
      <Sparkline values={binMean(m.an[id].el, sFrom, t, bin)} yMax={THRESHOLDS.warning} threshold={THRESHOLDS.notice} tone={tone} height={22} label={`${id} 추이`} />
      <span className="tile-foot">
        <span className={`tile-tier tier-ink-${now.tier}`}><Icon size={12} strokeWidth={2.4} aria-hidden />{TIER_LABEL[now.tier]}</span>
        {now.dominant ? <CauseBadge key={now.dominant} cause={now.dominant} size="s" /> : <span className="muted num">{fmtCompact(now.ccu)}명</span>}
      </span>
    </button>
  );
}
