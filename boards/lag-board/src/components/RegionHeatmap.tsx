import { useMemo, useState } from 'react';
import { Table2, ChartArea } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import { CAUSE_LABEL, PATCH_TIME, NEW_CLIENT_VERSION, REGIONS, TIER_LABEL, TIERS, THRESHOLDS, tierOf, type RegionId } from '../data/config';
import { fmtDuration, fmtInt, hhmm } from '../lib/format';
import { binMean, CAUSE_ORDER, RANGE_BIN, rangeIdx, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { useLatest } from '../lib/useLatest';
import { ChartCursor } from '../charts/ChartCursor';
import { median } from '../analytics/stats';

type RowKey = 'ALL' | RegionId;
const TIER_IDX = { smooth: 0, good: 1, notice: 2, warning: 3, critical: 4 } as const;

export function RegionHeatmap(props: {
  m: BoardModel; t: number; range: RangeKey; tokens: Tokens; region: RowKey;
  onCell: (idx: number, region: RowKey) => void;
  onIncident: (inc: Incident) => void;
}) {
  const { m, t, range, tokens: k, region, onCell, onIncident } = props;
  const [asTable, setAsTable] = useState(false);
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];

  const rows = useMemo(
    () => [{ key: 'ALL' as RowKey, label: '전체', agg: m.global }, ...REGIONS.map((r) => ({ key: r.id as RowKey, label: r.name, agg: m.regions[r.id] }))],
    [m],
  );

  const option = useMemo(() => {
    const starts: number[] = [];
    for (let s = from; s <= to; s += bin) starts.push(s);
    // 구간 끝 시각으로 라벨 → 정각 눈금이 정확히 맞는다
    const ends = starts.map((s) => Math.min(to, s + bin - 1));
    const labels = ends.map((e) => hhmm(m.ds.times[e]));
    const data: [number, number, number, number][] = [];
    rows.forEach((row, yi) => {
      binMean(row.agg.p95, from, to, bin).forEach((v, xi) => data.push([xi, yi, Math.round(v), TIER_IDX[tierOf(v)]]));
    });
    const binOf = (idx: number) => Math.min(starts.length - 1, Math.max(0, Math.floor((idx - from) / bin)));
    const laneData = m.incidents
      .map((inc, i) => ({ inc, i }))
      .filter(({ inc }) => (inc.endIdx ?? m.last + 1) > from && inc.onsetIdx <= to)
      .map(({ inc, i }) => [binOf(inc.onsetIdx), binOf((inc.endIdx ?? m.last + 1) - 1), CAUSE_ORDER.indexOf(inc.cause), i]);
    const causeColor = [k.causeInfra, k.causeNetwork, k.causeServer, k.causeClient];
    const labelEvery = range === '1h' ? 10 : range === '6h' ? 60 : 120;
    const interval = (i: number) => Math.round(m.ds.times[ends[i]] / 60000) % labelEvery === 0;
    const patchIn = PATCH_TIME >= m.ds.times[from] && PATCH_TIME <= m.ds.times[to];
    const patchBin = binOf(m.viewFrom + Math.round((PATCH_TIME - m.ds.times[m.viewFrom]) / 60000));
    const selectedRow = rows.findIndex((r) => r.key === region);

    const axisCommon = {
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    };

    return {
      animation: false,
      textStyle: { fontFamily: k.fontSans },
      grid: [
        { left: 64, right: 16, top: 22, height: rows.length * 24 },
        { left: 64, right: 16, top: 22 + rows.length * 24 + 14, height: 4 * 17 },
      ],
      xAxis: [
        { type: 'category', data: labels, gridIndex: 0, ...axisCommon, axisLabel: { show: false } },
        {
          type: 'category', data: labels, gridIndex: 1, ...axisCommon,
          axisLabel: { color: k.ink3, fontSize: 11, interval: (i: number) => interval(i), margin: 10, hideOverlap: true },
        },
      ],
      yAxis: [
        {
          type: 'category', data: rows.map((r) => r.label), inverse: true, gridIndex: 0, ...axisCommon,
          axisLabel: {
            fontSize: 12,
            formatter: (v: string, i: number) => (i === selectedRow ? `{sel|${v}}` : v),
            color: k.ink2,
            rich: { sel: { color: k.ink1, fontWeight: 700, fontSize: 12 } },
          },
        },
        {
          type: 'category', data: CAUSE_ORDER.map((c) => CAUSE_LABEL[c]), inverse: true, gridIndex: 1, ...axisCommon,
          axisLabel: { color: k.ink3, fontSize: 10, interval: 0 },
        },
      ],
      visualMap: {
        show: false, type: 'piecewise', dimension: 3, seriesIndex: 0,
        pieces: [
          { value: 0, color: k.tierSmooth }, { value: 1, color: k.tierGood }, { value: 2, color: k.tierNotice },
          { value: 3, color: k.tierWarning }, { value: 4, color: k.tierCritical },
        ],
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: k.surface2, borderColor: k.lineStrong, borderWidth: 1, padding: [8, 10],
        textStyle: { color: k.ink1, fontSize: 12, fontFamily: k.fontSans },
        extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);',
        formatter: (p: { seriesType: string; value: number[] }) => {
          if (p.seriesType === 'custom') {
            const inc = m.incidents[p.value[3]];
            const end = inc.endIdx ?? m.last;
            return `<b>${CAUSE_LABEL[inc.cause]} · ${inc.title}</b><br/>${hhmm(m.ds.times[inc.onsetIdx])} – ${inc.endIdx ? hhmm(m.ds.times[end]) : '진행 중'} (${fmtDuration(end - inc.onsetIdx)})<br/><span style="color:${k.ink3}">눌러서 장애 상세 보기</span>`;
          }
          const [xi, yi, v, ti] = p.value;
          const s = starts[xi];
          return `<b>${rows[yi].label}</b> · ${hhmm(m.ds.times[s])}${bin > 1 ? `–${hhmm(m.ds.times[Math.min(to, s + bin - 1)])}` : ''}<br/>유저 p95 <b>${fmtInt(v)}ms</b> · ${TIER_LABEL[TIERS[ti].id]}`;
        },
      },
      series: [
        {
          type: 'heatmap', xAxisIndex: 0, yAxisIndex: 0, data,
          itemStyle: { borderColor: k.surface1, borderWidth: starts.length > 150 ? 0.5 : 1, borderRadius: starts.length > 150 ? 0 : 2 },
          emphasis: { itemStyle: { borderColor: k.select, borderWidth: 1.5 } },
          markLine: {
            silent: true, symbol: 'none', animation: false,
            data: [
              ...(patchIn ? [{
                xAxis: patchBin, lineStyle: { color: k.ink3, width: 1, type: 'solid' },
                label: { show: true, position: 'start', formatter: `${NEW_CLIENT_VERSION} 배포`, color: k.ink2, fontSize: 10, distance: 4 },
              }] : []),
            ],
          },
        },
        {
          type: 'custom', xAxisIndex: 1, yAxisIndex: 1, data: laneData,
          renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
            const s = api.coord([api.value(0), api.value(2)]);
            const e = api.coord([api.value(1), api.value(2)]);
            const bw = api.size([1, 0])[0];
            const h = 8;
            return {
              type: 'rect',
              shape: { x: s[0] - bw / 2, y: s[1] - h / 2, width: Math.max(4, e[0] - s[0] + bw), height: h, r: 2 },
              style: { fill: causeColor[api.value(2)] },
            };
          },
          encode: { x: [0, 1], y: 2 },
        },
      ],
    };
  }, [m, from, to, bin, rows, k, region, range]);

  const onCellRef = useLatest(onCell);
  const onIncidentRef = useLatest(onIncident);
  const { ref, instance } = useChart(option, {
    onReady: (c) => {
      c.on('click', (p: { seriesType?: string; value?: unknown }) => {
        const v = p.value as number[];
        if (p.seriesType === 'heatmap') {
          const idx = Math.min(m.last, from + v[0] * bin + bin - 1);
          onCellRef.current(idx, rows[v[1]].key);
        } else if (p.seriesType === 'custom') {
          onIncidentRef.current(m.incidents[v[3]]);
        }
      });
    },
  });

  return (
    <section className="card heatmap-card">
      <header className="card-head">
        <div>
          <h2>권역별 체감 지연 추이</h2>
          <p className="card-sub">유저 가중 p95 · {bin}분 단위 · 셀을 누르면 그 시점과 권역으로 이동</p>
        </div>
        <div className="card-tools">
          <TierLegend />
          <button type="button" className="icon-btn" onClick={() => setAsTable((v) => !v)} aria-label={asTable ? '차트로 보기' : '표로 보기'} title={asTable ? '차트로 보기' : '표로 보기'}>
            {asTable ? <ChartArea size={16} /> : <Table2 size={16} />}
          </button>
        </div>
      </header>
      <div className="chart-wrap" hidden={asTable}>
        <div ref={ref} className="chart" style={{ height: rows.length * 24 + 4 * 17 + 70 }} aria-label="권역 × 시간 히트맵" />
        <ChartCursor chart={instance} index={Math.floor((t - from) / bin)} grids={[0, 1]} mask />
      </div>
      {asTable && <RegionTable t={t} from={from} to={to} rows={rows} />}
    </section>
  );
}

function TierLegend() {
  return (
    <ul className="tier-legend" aria-label="등급 범례">
      {TIERS.map((tr) => (
        <li key={tr.id}>
          <span className={`swatch sw-${tr.id}`} aria-hidden />
          {tr.label}
          <span className="muted num">{tr.id === 'smooth' ? `<${THRESHOLDS.good}` : `${tr.min}+`}</span>
        </li>
      ))}
    </ul>
  );
}

function RegionTable({ t, from, to, rows }: { t: number; from: number; to: number; rows: { key: RowKey; label: string; agg: BoardModel['global'] }[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">권역</th>
            <th scope="col">현재 p95</th>
            <th scope="col">등급</th>
            <th scope="col">기간 중앙값</th>
            <th scope="col">기간 최대</th>
            <th scope="col">150ms 이상 시간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vals = Array.from({ length: to - from + 1 }, (_, i) => r.agg.p95[from + i]);
            const over = vals.filter((v) => v >= THRESHOLDS.notice).length;
            return (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td className="num">{fmtInt(r.agg.p95[t])}ms</td>
                <td>{TIER_LABEL[tierOf(r.agg.p95[t])]}</td>
                <td className="num">{fmtInt(median(vals))}ms</td>
                <td className="num">{fmtInt(Math.max(...vals))}ms</td>
                <td className="num">{fmtDuration(over)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
