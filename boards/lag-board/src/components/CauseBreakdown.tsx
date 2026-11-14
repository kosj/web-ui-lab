import { useMemo, useState } from 'react';
import { ChartArea, Table2 } from 'lucide-react';
import type { BoardModel, AggSeries } from '../analytics/model';
import { CAUSE_LABEL, NEW_CLIENT_VERSION, PATCH_TIME, REGIONS, THRESHOLDS, TIER_LABEL, type Cause, type RegionId } from '../data/config';
import { fmtInt, hhmm } from '../lib/format';
import { binMean, CAUSE_ORDER, RANGE_BIN, rangeIdx, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { swatch, timeAxes, tooltipStyle } from '../charts/common';
import { useLatest } from '../lib/useLatest';
import { CAUSE_ICON } from './Badges';
import { RollingNumber } from './RollingNumber';
import { ChartCursor } from '../charts/ChartCursor';
import { useMotionOn } from '../lib/motion';

export function causeColors(k: Tokens): Record<Cause | 'base', string> {
  return { base: k.causeBase, infra: k.causeInfra, network: k.causeNetwork, server: k.causeServer, client: k.causeClient };
}

/** 누적 영역: 기준선(무채) 위에 원인별 초과 지연을 쌓고, 등급 임계선을 같은 축(ms)에 표시 */
export function decompositionOption(opts: {
  m: BoardModel; agg: Pick<AggSeries, 'base' | 'excess'> & { total: ArrayLike<number> }; from: number; to: number; bin: number;
  k: Tokens; labelEvery: number; compact?: boolean; motion?: boolean;
}) {
  const { m, agg, from, to, bin, k, labelEvery, compact, motion = false } = opts;
  const starts: number[] = [];
  for (let s = from; s <= to; s += bin) starts.push(s);
  const ends = starts.map((s) => Math.min(to, s + bin - 1));
  const labels = ends.map((e) => hhmm(m.ds.times[e]));
  const minutes = ends.map((e) => Math.round(m.ds.times[e] / 60000));
  const col = causeColors(k);
  const layers: (Cause | 'base')[] = ['base', ...CAUSE_ORDER];
  const series = layers.map((key) => ({
    id: key,
    name: key === 'base' ? '기준선' : CAUSE_LABEL[key],
    type: 'line',
    stack: 'el',
    symbol: 'none',
    smooth: false,
    lineStyle: { width: 1, color: k.surface1 },
    areaStyle: { color: col[key], opacity: key === 'base' ? 1 : 0.92 },
    emphasis: { disabled: true },
    data: binMean(key === 'base' ? agg.base : agg.excess[key], from, to, bin).map((v) => Math.round(v * 10) / 10),
  }));
  const totals = binMean(agg.total, from, to, bin);
  const peak = Math.max(...totals);
  const ths = [
    { v: THRESHOLDS.notice, c: k.tierNotice, l: TIER_LABEL.notice },
    { v: THRESHOLDS.warning, c: k.tierWarning, l: TIER_LABEL.warning },
    { v: THRESHOLDS.critical, c: k.tierCritical, l: TIER_LABEL.critical },
  ].filter((th) => th.v <= Math.max(peak * 1.15, THRESHOLDS.warning));
  const patchIdx = m.viewFrom + Math.round((PATCH_TIME - m.ds.times[m.viewFrom]) / 60000);
  const patchBin = patchIdx >= from && patchIdx <= to ? Math.floor((patchIdx - from) / bin) : -1;
  const axes = timeAxes(k, labels, minutes, labelEvery, compact ? undefined : 'ms');

  (series[series.length - 1] as Record<string, unknown>).markLine = {
    silent: true, symbol: 'none', animation: false,
    data: [
      ...ths.map((th) => ({
        yAxis: th.v,
        lineStyle: { color: th.c, width: 1, type: 'solid', opacity: 0.9 },
        label: { formatter: `${th.l} ${th.v}`, position: 'insideStartTop', color: k.ink2, fontSize: 10 },
      })),
      ...(patchBin >= 0 ? [{
        xAxis: patchBin, lineStyle: { color: k.ink3, width: 1, type: 'solid' },
        label: { show: !compact, formatter: `${NEW_CLIENT_VERSION} 배포`, position: 'insideEndTop', color: k.ink2, fontSize: 10 },
      }] : []),
    ],
  };

  return {
    // 범위·권역이 바뀌면 같은 원인 층이 새 값으로 모핑된다 (series id 고정 + merge)
    animation: motion,
    animationDuration: 500,
    animationDurationUpdate: 450,
    animationEasingUpdate: 'cubicInOut' as const,
    textStyle: { fontFamily: k.fontChart },
    grid: { left: compact ? 40 : 48, right: compact ? 8 : 16, top: compact ? 12 : 26, bottom: 26 },
    ...axes,
    yAxis: { ...axes.yAxis, max: (v: { max: number }) => Math.ceil(Math.max(v.max, THRESHOLDS.notice * 1.1) / 50) * 50 },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(k),
      formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
        const i = ps[0]?.dataIndex ?? 0;
        const total = totals[i];
        const rows = [...ps].reverse().filter((p) => p.seriesName === '기준선' || p.value >= 0.5)
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${swatch(String(p.color))}<span style="flex:1">${p.seriesName}</span><b>${p.seriesName === '기준선' ? '' : '+'}${fmtInt(p.value)}ms</b></div>`)
          .join('');
        return `<div style="min-width:180px"><div style="margin-bottom:4px;color:${k.ink2}">${labels[i]} · 합계 <b style="color:${k.ink1}">${fmtInt(total)}ms</b></div>${rows}</div>`;
      },
    },
    series,
  };
}

type Scope = 'ALL' | RegionId;

export function CauseBreakdown(props: { m: BoardModel; t: number; range: RangeKey; tokens: Tokens; scope: Scope; onCursor: (idx: number) => void }) {
  const { m, t, range, tokens: k, scope, onCursor } = props;
  const [asTable, setAsTable] = useState(false);
  const agg = scope === 'ALL' ? m.global : m.regions[scope];
  const scopeLabel = scope === 'ALL' ? '전체' : REGIONS.find((r) => r.id === scope)!.name;
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];

  const motion = useMotionOn();
  const option = useMemo(
    () => decompositionOption({ m, agg: { base: agg.base, excess: agg.excess, total: agg.mean }, from, to, bin, k, motion, labelEvery: range === '1h' ? 10 : range === '6h' ? 60 : 180 }),
    [m, agg, from, to, bin, k, range, motion],
  );
  const onCursorRef = useLatest(onCursor);
  const rangeRef = useLatest({ from, bin });
  const { ref, instance } = useChart(option, {
    merge: true,
    onReady: (c) => {
      c.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
        if (!c.containPixel('grid', [e.offsetX, e.offsetY])) return;
        const [xi] = c.convertFromPixel('grid', [e.offsetX, e.offsetY]) as number[];
        const r = rangeRef.current;
        onCursorRef.current(Math.min(m.last, r.from + Math.round(xi) * r.bin + r.bin - 1));
      });
    },
  });
  const col = causeColors(k);
  const ex = CAUSE_ORDER.map((c) => ({ c, v: agg.excess[c][t] }));
  const sumEx = ex.reduce((a, b) => a + b.v, 0);
  const total = agg.mean[t];

  return (
    <section className="card breakdown-card">
      <header className="card-head">
        <div>
          <h2>체감 지연 구성 · {scopeLabel}</h2>
          <p className="card-sub">유저 가중 평균. 기준선(전일 동시간대) 위에 원인별 초과 지연을 쌓았습니다.</p>
        </div>
        <div className="card-tools">
          <ul className="cause-legend" aria-label="원인 범례">
            <li><span className="swatch" style={{ background: col.base }} aria-hidden />기준선</li>
            {CAUSE_ORDER.map((c) => (
              <li key={c}><span className="swatch" style={{ background: col[c] }} aria-hidden />{CAUSE_LABEL[c]}</li>
            ))}
          </ul>
          <button type="button" className="icon-btn" onClick={() => setAsTable((v) => !v)} aria-label={asTable ? '차트로 보기' : '표로 보기'} title={asTable ? '차트로 보기' : '표로 보기'}>
            {asTable ? <ChartArea size={16} /> : <Table2 size={16} />}
          </button>
        </div>
      </header>
      <div className="breakdown-body">
        <div className="chart-wrap" hidden={asTable}>
          <div ref={ref} className="chart" style={{ height: 260 }} aria-label={`${scopeLabel} 체감 지연 구성 누적 영역 차트`} />
          <ChartCursor chart={instance} index={Math.floor((t - from) / bin)} mask />
        </div>
        {asTable && <BreakdownTable m={m} agg={agg} from={from} to={to} />}
        <aside className="contrib" aria-label="선택 시점 원인 기여">
          <span className="eyebrow">{hhmm(m.ds.times[t])} 원인 기여</span>
          <div className="contrib-total"><RollingNumber text={fmtInt(total)} /><small>ms</small></div>
          <div className="segbar" role="img" aria-label="원인별 비중 막대">
            <span style={{ flexGrow: agg.base[t], background: col.base }} />
            {/* 항상 4칸을 유지해 flex-grow 전환으로 비중 변화가 미끄러지게 한다 */}
            {ex.map((e) => (
              <span key={e.c} className={e.v < 0.5 ? 'is-empty' : ''} style={{ flexGrow: e.v < 0.5 ? 0 : e.v, background: col[e.c] }} />
            ))}
          </div>
          <ul className="contrib-list">
            <li>
              <span className="swatch" style={{ background: col.base }} aria-hidden />
              <span>기준선</span>
              <b className="num">{fmtInt(agg.base[t])}ms</b>
              <span className="muted num" />
            </li>
            {ex.map((e) => {
              const Icon = CAUSE_ICON[e.c];
              return (
                <li key={e.c} className={e.v < 0.5 ? 'is-zero' : ''}>
                  <span className="swatch" style={{ background: col[e.c] }} aria-hidden />
                  <span><Icon size={12} aria-hidden /> {CAUSE_LABEL[e.c]}</span>
                  <b className="num">+{fmtInt(e.v)}ms</b>
                  <span className="muted num">{sumEx > 0 ? `${Math.round((e.v / sumEx) * 100)}%` : '–'}</span>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </section>
  );
}

function BreakdownTable({ m, agg, from, to }: { m: BoardModel; agg: AggSeries; from: number; to: number }) {
  const step = Math.max(1, Math.round((to - from + 1) / 12));
  const idx: number[] = [];
  for (let i = to; i >= from; i -= step) idx.push(i);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">시각</th><th scope="col">합계</th><th scope="col">기준선</th>
            {CAUSE_ORDER.map((c) => <th key={c} scope="col">{CAUSE_LABEL[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {idx.map((i) => (
            <tr key={i}>
              <th scope="row" className="num">{hhmm(m.ds.times[i])}</th>
              <td className="num">{fmtInt(agg.mean[i])}</td>
              <td className="num">{fmtInt(agg.base[i])}</td>
              {CAUSE_ORDER.map((c) => <td key={c} className="num">{fmtInt(agg.excess[c][i])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
