import { useMemo } from 'react';
import { Waypoints } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { ispUsers } from '../analytics/isp';
import { REGION_ISPS, REGIONS, tierOf, TIER_LABEL, type IspDef, type RegionId, type Tier } from '../data/config';
import { fmtCompact, fmtFixed, fmtInt, hhmm, signed } from '../lib/format';
import { binMean, RANGE_BIN, rangeIdx, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { swatch, timeAxes, tooltipStyle } from '../charts/common';
import { TIER_ICON, TierPill } from './Badges';
import { ChartCursor } from '../charts/ChartCursor';
import { LOSS_EMPHASIS, PacketLane } from './PacketLane';
import { CircleCheck } from 'lucide-react';

export interface IspRow {
  def: IspDef;
  users: number;
  share: number;
  rttP50: number;
  rttP95: number;
  rttBase: number;
  jitter: number;
  loss: number;
  lossBase: number;
  net: number;
  netBase: number;
  /** 네트워크 성분의 전일 대비 증가 (ms) */
  delta: number;
  /** 이 통신사 유저의 체감 지연 추정 = 통신사 네트워크 성분 + 권역 평균 서버·클라 성분 */
  el: number;
  tier: Tier;
  /** 경로 이상 여부: 네트워크 성분 강건 z ≥ 3 이고 전일 대비 +15ms 이상 */
  anomaly: boolean;
}

export function ispRows(m: BoardModel, region: RegionId, t: number): IspRow[] {
  const defs = REGION_ISPS[region];
  let w = 0;
  let srvCli = 0;
  for (const s of m.ds.servers) {
    if (s.region !== region) continue;
    const c = m.ds.metrics[s.id].ccu[t];
    w += c;
    srvCli += c * (m.an[s.id].srv[t] + m.an[s.id].cli[t]);
  }
  srvCli /= w || 1;
  const users = defs.map((_, i) => ispUsers(m.ds, region, i, t));
  const total = users.reduce((a, b) => a + b, 0) || 1;
  return defs.map((def, i) => {
    const p = m.ds.isp[region][def.id];
    const a = m.isp[region][def.id];
    const el = a.net[t] + srvCli;
    return {
      def, users: users[i], share: users[i] / total,
      rttP50: p.rttP50[t], rttP95: p.rttP95[t], rttBase: a.baselines.rttP95.med[t],
      jitter: p.jitter[t], loss: p.loss[t], lossBase: a.baselines.loss.med[t],
      net: a.net[t], netBase: a.baselines.net.med[t], delta: a.net[t] - a.baselines.net.med[t],
      el, tier: tierOf(el),
      anomaly: a.z[t] >= 3 && a.net[t] - a.baselines.net.med[t] >= 15,
    };
  });
}


export function IspDrilldown(props: {
  m: BoardModel; t: number; range: RangeKey; tokens: Tokens; scope: 'ALL' | RegionId; isp: string | null;
  onIsp: (region: RegionId, isp: string | null) => void;
}) {
  const { scope } = props;
  return (
    <section className="card isp-card">
      <header className="card-head">
        <div>
          <h2><Waypoints size={16} aria-hidden className="h-icon" /> 통신사별 네트워크 경로{scope === 'ALL' ? '' : ` · ${REGIONS.find((r) => r.id === scope)!.name}`}</h2>
          <p className="card-sub">
            {scope === 'ALL'
              ? '권역 × 통신사 RTT p95와 전일 대비 변화. 칸을 누르면 그 통신사로 좁혀 봅니다.'
              : '통신사를 누르면 오른쪽 분포가 그 통신사 유저로 좁혀집니다. 체감 지연은 통신사 네트워크 성분에 권역 평균 서버·클라 성분을 더한 추정치입니다.'}
          </p>
        </div>
      </header>
      {scope === 'ALL' ? <IspMatrix {...props} /> : <IspRegion {...props} region={scope} />}
    </section>
  );
}

function IspMatrix({ m, t, onIsp }: { m: BoardModel; t: number; onIsp: (region: RegionId, isp: string | null) => void }) {
  return (
    <div className="isp-matrix" role="table" aria-label="권역별 통신사 현황">
      {REGIONS.map((r) => {
        const rows = ispRows(m, r.id, t);
        return (
          <div key={r.id} className="isp-matrix-row" role="row">
            <span className="isp-matrix-region" role="rowheader">{r.name}<span className="muted">{r.dc}</span></span>
            <div className="isp-cells">
              {rows.map((row) => {
                // 칸의 상태는 '경로 이상'일 때만 칠한다 — 클라·서버 문제로 오른 체감 지연이 통신사 탓처럼 보이지 않게
                const Icon = row.anomaly ? TIER_ICON[row.tier] : CircleCheck;
                const tone = row.anomaly ? `tile-${row.tier}` : '';
                return (
                  <button
                    key={row.def.id}
                    type="button"
                    role="cell"
                    className={`isp-cell ${tone}`}
                    onClick={() => onIsp(r.id, row.def.id)}
                    aria-label={`${r.name} ${row.def.name} RTT p95 ${fmtInt(row.rttP95)}ms, 전일 대비 ${signed(row.delta, 'ms')}, ${TIER_LABEL[row.tier]}`}
                  >
                    <span className="isp-cell-name">{row.def.name}</span>
                    <span className="isp-cell-val num">{fmtInt(row.rttP95)}<small>ms</small></span>
                    <span className={`isp-cell-delta num ${row.anomaly ? 'up' : ''}`}>
                      <span className={row.anomaly ? `tier-ink-${row.tier}` : 'tier-ink-smooth'}><Icon size={11} strokeWidth={2.4} aria-hidden /></span>
                      {row.anomaly ? `경로 이상 ${signed(row.delta, 'ms')}` : Math.abs(row.delta) < 5 ? '평소 수준' : signed(row.delta, 'ms')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IspRegion({ m, t, range, tokens: k, isp, onIsp, region }: {
  m: BoardModel; t: number; range: RangeKey; tokens: Tokens; isp: string | null; region: RegionId;
  onIsp: (region: RegionId, isp: string | null) => void;
}) {
  const rows = ispRows(m, region, t);
  const focus = isp ?? [...rows].sort((a, b) => b.delta - a.delta)[0].def.id;
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];
  const maxShare = Math.max(...rows.map((r) => r.share));

  const option = useMemo(() => {
    const starts: number[] = [];
    for (let s = from; s <= to; s += bin) starts.push(s);
    const ends = starts.map((s) => Math.min(to, s + bin - 1));
    const labels = ends.map((e) => hhmm(m.ds.times[e]));
    const minutes = ends.map((e) => Math.round(m.ds.times[e] / 60000));
    const axes = timeAxes(k, labels, minutes, range === '1h' ? 15 : range === '6h' ? 120 : 360, 'RTT p95 ms');
    const defs = REGION_ISPS[region];
    const focusDef = defs.find((d) => d.id === focus)!;
    const series: Record<string, unknown>[] = defs
      .filter((d) => d.id !== focus)
      .map((d) => ({
        name: d.name, type: 'line', symbol: 'none', z: 2,
        data: binMean(m.ds.isp[region][d.id].rttP95, from, to, bin).map((v) => Math.round(v)),
        lineStyle: { color: k.ink3, width: 1.25, opacity: 0.6 }, itemStyle: { color: k.ink3 },
        emphasis: { disabled: true },
      }));
    series.push({
      name: '전일 기준선', type: 'line', symbol: 'none', z: 3,
      data: binMean(m.isp[region][focus].baselines.rttP95.med, from, to, bin).map((v) => Math.round(v)),
      lineStyle: { color: k.ink2, width: 1.5, type: 'dotted' }, itemStyle: { color: k.ink2 },
    });
    series.push({
      name: focusDef.name, type: 'line', symbol: 'none', z: 4,
      data: binMean(m.ds.isp[region][focus].rttP95, from, to, bin).map((v) => Math.round(v)),
      lineStyle: { color: k.ink1, width: 2.25 }, itemStyle: { color: k.ink1 },
      endLabel: { show: true, formatter: focusDef.name, color: k.ink1, fontSize: 11, fontWeight: 600, distance: 6 },
    });
    return {
      animation: false,
      textStyle: { fontFamily: k.fontSans },
      grid: { left: 44, right: 96, top: 26, bottom: 26 },
      ...axes,
      tooltip: {
        trigger: 'axis', ...tooltipStyle(k),
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const sorted = [...ps].sort((a, b) => b.value - a.value);
          return `<div style="min-width:180px"><div style="color:${k.ink2};margin-bottom:4px">${labels[i]} · RTT p95</div>${sorted
            .map((p) => `<div style="display:flex;justify-content:space-between;gap:12px">${swatch(String(p.color))}<span style="flex:1">${p.seriesName}</span><b>${fmtInt(p.value)}ms</b></div>`)
            .join('')}</div>`;
        },
      },
      series,
    };
  }, [m, region, focus, from, to, bin, k, range]);
  const { ref, instance } = useChart(option);

  return (
    <div className="isp-region">
      <div className="table-wrap">
        <table className="data-table isp-table">
          <thead>
            <tr>
              <th scope="col">통신사</th>
              <th scope="col">유저 비중</th>
              <th scope="col" className="lane-col">경로 흐름 <span className="muted">유저 → DC</span></th>
              <th scope="col">RTT p50 · p95</th>
              <th scope="col">전일 대비</th>
              <th scope="col">지터 · 손실</th>
              <th scope="col">체감 지연 추정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = isp === row.def.id;
              return (
                <tr
                  key={row.def.id}
                  className={`${selected ? 'is-selected' : ''} ${row.def.id === focus && !isp ? 'is-focus' : ''} ${row.anomaly ? 'is-hot' : ''}`}
                  onClick={() => onIsp(region, selected ? null : row.def.id)}
                >
                  <th scope="row">
                    <button type="button" className="row-btn" aria-pressed={selected} onClick={(e) => { e.stopPropagation(); onIsp(region, selected ? null : row.def.id); }}>
                      {row.def.name}
                    </button>
                    {row.def.country && <span className="muted"> {row.def.country}</span>}
                  </th>
                  <td>
                    <span className="share-cell">
                      <span className="share-bar" aria-hidden><i style={{ width: `${(row.share / maxShare) * 100}%` }} /></span>
                      <span className="num">{fmtFixed(row.share * 100, 0)}%</span>
                      <span className="muted num">{fmtCompact(row.users)}명</span>
                    </span>
                  </td>
                  <td className="lane-col">
                    <PacketLane
                      rtt={row.rttP50} jitter={row.jitter} loss={row.loss}
                      color={row.anomaly ? laneColor(k, row.tier) : k.ink2} track={k.lineStrong}
                      label={`${row.def.name} 경로: RTT ${fmtInt(row.rttP50)}ms, 지터 ${fmtInt(row.jitter)}ms, 손실 ${fmtFixed(row.loss, 2)}%`}
                    />
                  </td>
                  <td className="num">{fmtInt(row.rttP50)} · <b>{fmtInt(row.rttP95)}</b>ms</td>
                  <td className={`num ${row.anomaly ? 'delta-up' : 'muted'}`}>{row.anomaly ? `경로 이상 ${signed(row.delta, 'ms')}` : Math.abs(row.delta) < 5 ? '평소 수준' : signed(row.delta, 'ms')}</td>
                  <td className="num">{fmtInt(row.jitter)}ms · {fmtFixed(row.loss, row.loss < 1 ? 2 : 1)}%</td>
                  <td>
                    <span className="el-cell">
                      <span className="num">{fmtInt(row.el)}ms</span>
                      <TierPill tier={row.tier} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="lane-legend muted">
        경로 흐름: 입자가 건너는 시간 = RTT, 뭉침·벌어짐 = 지터, 중간에 떨어져 사라짐 = 패킷 손실(실제의 {LOSS_EMPHASIS}배로 강조). 모션을 끄면 정지 화면으로 바뀝니다.
      </p>
      <figure className="mini isp-trend">
        <figcaption>
          <b>통신사별 RTT p95 추이</b>
          <span className="mini-legend">
            <span><i style={{ background: k.ink1, borderColor: k.ink1 }} aria-hidden />{REGION_ISPS[region].find((d) => d.id === focus)!.name}{isp ? ' (선택)' : ' (변화 최대)'}</span>
            <span><i style={{ background: k.ink3, borderColor: k.ink3 }} aria-hidden />다른 통신사</span>
            <span><i className="ref" style={{ borderColor: k.ink2 }} aria-hidden />전일 기준선</span>
          </span>
        </figcaption>
        <div className="chart-wrap">
          <div ref={ref} className="chart" style={{ height: 200 }} />
          <ChartCursor chart={instance} index={Math.floor((t - from) / bin)} mask />
        </div>
      </figure>
    </div>
  );
}

function laneColor(k: Tokens, tier: Tier) {
  return tier === 'critical' ? k.tierCritical : tier === 'warning' ? k.tierWarning : tier === 'notice' ? k.tierNotice : k.ink1;
}
