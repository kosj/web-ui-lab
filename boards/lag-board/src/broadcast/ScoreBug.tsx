import type { BoardModel } from '../analytics/model';
import { isActiveAt } from '../analytics/model';
import { REGIONS, TIER_LABEL, tierOf, type RegionId } from '../data/config';
import { fmtInt, signed } from '../lib/format';
import { RollingNumber } from '../components/RollingNumber';

/**
 * 스코어 버그 — 중계 화면 위쪽의 점수판. 전체 + 6권역의 유저 p95.
 * 아래 띠 = 등급(정상은 회색), 오른쪽 위 점 = 진행 중 장애 수. 누르면 타워·스테이지가 그 권역으로 좁혀진다.
 */
export function ScoreBug({ m, t, region, onRegion }: { m: BoardModel; t: number; region: RegionId | null; onRegion: (r: RegionId | null) => void }) {
  const prev = Math.max(m.viewFrom, t - 60);
  const cells = [
    { id: null as RegionId | null, code: 'ALL', name: '전체', v: m.global.p95[t], p: m.global.p95[prev] },
    ...REGIONS.map((r) => ({ id: r.id as RegionId | null, code: r.id, name: r.name, v: m.regions[r.id].p95[t], p: m.regions[r.id].p95[prev] })),
  ];
  return (
    <nav className="bc-bug" aria-label="권역 점수판">
      {cells.map((c) => {
        const tier = tierOf(c.v);
        // 권역 칸은 그 권역 장애만 센다 — 전역(클라 버전) 장애까지 세면 모든 칸에 같은 숫자가 떠서 신호가 사라진다
        const active = m.incidents.filter((i) => isActiveAt(i, t) && i.detectIdx <= t && (c.id === null || (i.region === c.id && i.scopeType !== 'global'))).length;
        const sel = region === c.id;
        const d = c.v - c.p;
        return (
          <button key={c.code} type="button" className={`bc-cell bc-t-${tier} ${sel ? 'is-selected' : ''}`} aria-pressed={sel}
            onClick={() => onRegion(c.id)}
            aria-label={`${c.name} p95 ${fmtInt(c.v)}ms ${TIER_LABEL[tier]}, 1시간 ${signed(d, 'ms')}, 진행 중 장애 ${active}건`}>
            <span className="bc-cell-code">{c.code}</span>
            <span className="bc-cell-name">{c.name}</span>
            <span className="bc-cell-val num"><RollingNumber text={fmtInt(c.v)} /></span>
            <span className={`bc-cell-d num ${d >= 10 ? 'up' : d <= -10 ? 'down' : ''}`}>{signed(d)}</span>
            {active > 0 && <span className="bc-cell-alert num">{active}</span>}
          </button>
        );
      })}
    </nav>
  );
}
