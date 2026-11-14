import { useMemo, useState } from 'react';
import { ChartArea, GitFork, Table2, X } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { AXIS_MAX, AXIS_MIN, bimodal, BUCKET_HI, BUCKET_LO, computeDistribution, LOG_W, type Distribution } from '../analytics/distribution';
import { ispName, REGIONS, THRESHOLDS, TIER_LABEL, type RegionId } from '../data/config';
import { fmtCompact, fmtFixed, fmtInt, hhmm } from '../lib/format';
import { RANGE_BIN, rangeIdx, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { mix } from '../lib/color';
import { useChart } from '../charts/useChart';
import { tooltipStyle } from '../charts/common';
import { useLatest } from '../lib/useLatest';
import { ChartCursor } from '../charts/ChartCursor';

const L = Math.log10;

type Scope = 'ALL' | RegionId;

export function DistributionHeatmap(props: {
  m: BoardModel; t: number; range: RangeKey; tokens: Tokens; scope: Scope; isp: string | null;
  onCursor: (idx: number) => void; onClearIsp: () => void;
}) {
  const { m, t, range, tokens: k, scope, isp, onCursor, onClearIsp } = props;
  const [asTable, setAsTable] = useState(false);
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];
  const region = scope === 'ALL' ? undefined : scope;
  const label = `${region ? REGIONS.find((r) => r.id === region)!.name : '전체'}${isp && region ? ` · ${ispName(region, isp)}` : ''}`;

  const dist = useMemo(
    () => computeDistribution(m, { region, isp: region ? isp ?? undefined : undefined }, from, to, bin),
    [m, region, isp, from, to, bin],
  );
  const col = Math.min(dist.starts.length - 1, Math.max(0, Math.floor((t - from) / bin)));

  const option = useMemo(() => buildOption(m, dist, k, range), [m, dist, k, range]);
  const onCursorRef = useLatest(onCursor);
  const geo = useLatest({ from, bin });
  const { ref, instance } = useChart(option, {
    onReady: (c) => {
      c.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
        if (!c.containPixel('grid', [e.offsetX, e.offsetY])) return;
        const [xi] = c.convertFromPixel('grid', [e.offsetX, e.offsetY]) as number[];
        onCursorRef.current(Math.min(m.last, geo.current.from + Math.round(xi) * geo.current.bin + geo.current.bin - 1));
      });
    },
  });

  const now = dist.shares[col];
  const split = now ? bimodal(now) : null;

  return (
    <section className="card dist-card">
      <header className="card-head">
        <div>
          <h2>체감 지연 분포 · {label}</h2>
          <p className="card-sub">유저 단위 · 세로축 로그 눈금 · 진할수록 그 지연을 겪는 유저가 많습니다</p>
        </div>
        <div className="card-tools">
          {isp && region && (
            <button type="button" className="filter-chip" onClick={onClearIsp}>
              통신사 {ispName(region, isp)}
              <X size={12} aria-hidden />
              <span className="sr-only">필터 해제</span>
            </button>
          )}
          <span className="density-legend" aria-label="밀도 범례">
            <span className="muted">적음</span>
            <i className="density-ramp" aria-hidden />
            <span className="muted">많음</span>
            <span className="line-key"><i className="p50" aria-hidden />p50</span>
            <span className="line-key"><i className="p95" aria-hidden />p95</span>
          </span>
          <button type="button" className="icon-btn" onClick={() => setAsTable((v) => !v)} aria-label={asTable ? '차트로 보기' : '표로 보기'} title={asTable ? '차트로 보기' : '표로 보기'}>
            {asTable ? <ChartArea size={16} /> : <Table2 size={16} />}
          </button>
        </div>
      </header>
      <div className="chart-wrap" hidden={asTable}>
        <div ref={ref} className="chart" style={{ height: 270 }} aria-label={`${label} 체감 지연 분포 히트맵`} />
        <ChartCursor chart={instance} index={col} mask />
      </div>
      {asTable && <DistTable dist={dist} col={col} />}
      {now && (
        <div className="dist-foot">
          <span className="num">
            <b>{hhmm(m.ds.times[dist.ends[col]])}</b> · 150ms 이상 <b>{fmtFixed(dist.over150[col] * 100, 1)}%</b>
            <span className="muted"> (약 {fmtCompact(dist.over150[col] * dist.users[col])}명)</span> · p50 {fmtInt(dist.p50[col])}ms · p95 {fmtInt(dist.p95[col])}ms
          </span>
          {split && (
            <span className="split-note">
              <GitFork size={14} aria-hidden />
              분포가 두 갈래입니다 ({BUCKET_LO[split.lo]}–{BUCKET_HI[split.lo]}ms / {BUCKET_LO[split.hi]}–{BUCKET_HI[split.hi]}ms).
              {region ? (isp ? ' 이 통신사 안에서도 갈라졌다면 클라 버전을 확인하세요.' : ' 통신사 표에서 느린 집단을 찾아보세요.') : ' 권역을 선택해 통신사별로 좁혀보세요.'}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function buildOption(m: BoardModel, dist: Distribution, k: Tokens, range: RangeKey) {
  const labels = dist.ends.map((e) => hhmm(m.ds.times[e]));
  const labelEvery = range === '1h' ? 10 : range === '6h' ? 60 : 180;
  const minutes = dist.ends.map((e) => Math.round(m.ds.times[e] / 60000));
  let maxD = 0;
  const cells: [number, number, number, number][] = [];
  dist.shares.forEach((col, xi) => {
    col.forEach((s, b) => {
      const d = s / LOG_W[b];
      maxD = Math.max(maxD, d);
      if (s >= 0.0005) cells.push([xi, b, d, s]);
    });
  });
  // 감마 0.45 + 하한 0.1 — 희박한 칸도 바탕과 구분되게, 진한 칸은 포화되지 않게
  const colorOf = (d: number) => mix(k.density0, k.density1, 0.1 + 0.9 * Math.pow(d / maxD, 0.45));
  const refLines = [50, 100, 1000].map((v) => ({
    yAxis: L(v), lineStyle: { color: k.grid, width: 1, type: 'solid' },
    label: { formatter: `${v}`, position: 'start', color: k.ink3, fontSize: 10, distance: 6 },
  }));
  const thLines = [
    { v: THRESHOLDS.notice, c: k.tierNotice, l: TIER_LABEL.notice },
    { v: THRESHOLDS.warning, c: k.tierWarning, l: TIER_LABEL.warning },
    { v: THRESHOLDS.critical, c: k.tierCritical, l: TIER_LABEL.critical },
  ].map((th) => ({
    yAxis: L(th.v), lineStyle: { color: th.c, width: 1, type: 'solid', opacity: 0.85 },
    label: { formatter: `${th.v}`, position: 'start', color: k.ink2, fontSize: 10, distance: 6 },
  }));
  const lineSeries = (name: string, data: number[], color: string, width: number) => [
    // 표면색 테(halo)를 먼저 그려 밝은 칸 위에서도 선이 보이게 한다
    { name: `${name}-halo`, type: 'line', data: data.map(L), symbol: 'none', silent: true, z: 3, lineStyle: { color: k.surface1, width: width + 3, opacity: 0.85 }, tooltip: { show: false } },
    { name, type: 'line', data: data.map(L), symbol: 'none', silent: true, z: 4, lineStyle: { color, width }, tooltip: { show: false } },
  ];

  return {
    animation: false,
    textStyle: { fontFamily: k.fontSans },
    grid: { left: 40, right: 12, top: 8, bottom: 26 },
    xAxis: {
      type: 'category', data: labels, axisLine: { lineStyle: { color: k.axis } }, axisTick: { show: false },
      axisLabel: { color: k.ink3, fontSize: 11, hideOverlap: true, interval: (i: number) => minutes[i] % labelEvery === 0 },
    },
    yAxis: { type: 'value', min: L(AXIS_MIN), max: L(AXIS_MAX), axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: {
      trigger: 'item', ...tooltipStyle(k),
      formatter: (p: { value: number[] }) => {
        const [xi, b, , s] = p.value;
        return `<b>${labels[xi]}</b> · ${BUCKET_LO[b]}–${BUCKET_HI[b]}ms<br/>유저 <b>${fmtFixed(s * 100, 1)}%</b> (약 ${fmtCompact(s * dist.users[xi])}명)<br/><span style="color:${k.ink3}">p50 ${fmtInt(dist.p50[xi])}ms · p95 ${fmtInt(dist.p95[xi])}ms · 150ms↑ ${fmtFixed(dist.over150[xi] * 100, 1)}%</span>`;
      },
    },
    series: [
      {
        type: 'custom', data: cells, z: 2,
        renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[] }) => {
          const xi = api.value(0);
          const b = api.value(1);
          const top = api.coord([xi, L(BUCKET_HI[b])]);
          const bot = api.coord([xi, L(BUCKET_LO[b])]);
          const w = api.size([1, 0])[0];
          return {
            type: 'rect',
            shape: { x: top[0] - w / 2, y: top[1], width: w + 0.4, height: bot[1] - top[1] },
            style: { fill: colorOf(api.value(2)) },
          };
        },
        encode: { x: 0, y: 1, tooltip: [3] },
        markLine: {
          silent: true, symbol: 'none', animation: false,
          data: [...refLines, ...thLines],
        },
      },
      ...lineSeries('p50', dist.p50, k.ink2, 1.5),
      ...lineSeries('p95', dist.p95, k.ink1, 2),
    ],
  };
}

function DistTable({ dist, col }: { dist: Distribution; col: number }) {
  const n = dist.shares.length;
  const avg = BUCKET_LO.map((_, b) => dist.shares.reduce((a, s) => a + s[b], 0) / n);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr><th scope="col">체감 지연 구간</th><th scope="col">선택 시점 비율</th><th scope="col">기간 평균 비율</th></tr>
        </thead>
        <tbody>
          {BUCKET_LO.map((_, b) => b).reverse().map((b) => (
            <tr key={b}>
              <th scope="row" className="num">{BUCKET_LO[b]}–{BUCKET_HI[b]}ms</th>
              <td className="num">{fmtFixed(dist.shares[col][b] * 100, 1)}%</td>
              <td className="num">{fmtFixed(avg[b] * 100, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
