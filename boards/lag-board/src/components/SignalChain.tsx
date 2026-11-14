import { useMemo } from 'react';
import type { BoardModel } from '../analytics/model';
import { eventOnsets, getSignals, type SignalScope } from '../analytics/signals';
import { REGIONS, THRESHOLDS, TIER_LABEL } from '../data/config';
import { fmtFixed, fmtInt, hhmm } from '../lib/format';
import { binMean, RANGE_BIN, rangeIdx, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { ChartCursor } from '../charts/ChartCursor';
import { tooltipStyle, swatch } from '../charts/common';
import { useLatest } from '../lib/useLatest';
import { RollingNumber } from './RollingNumber';

/**
 * 신호 연쇄 — TCP 재전송 → 체감 지연 → 채팅 제보를 같은 시간축의 세 칸에 쌓는다.
 * 단위가 다르므로 한 축에 겹치지 않는다(이중 축 금지). 세 칸이 같은 x를 공유하고 십자선·커서가 함께 움직인다.
 * ▲ 표시는 급증 사건(평소 대비 z ≥ 4가 3분 이상) 시작점.
 */
export function SignalChain(props: { m: BoardModel; t: number; range: RangeKey; tokens: Tokens; scope: SignalScope; onCursor: (idx: number) => void }) {
  const { m, t, range, tokens: k, scope, onCursor } = props;
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];
  const s = getSignals(m, scope);
  const label = scope.region ? REGIONS.find((r) => r.id === scope.region)!.name : '전체';

  const option = useMemo(() => {
    const starts: number[] = [];
    for (let i = from; i <= to; i += bin) starts.push(i);
    const ends = starts.map((i) => Math.min(to, i + bin - 1));
    const labels = ends.map((e) => hhmm(m.ds.times[e]));
    const minutes = ends.map((e) => Math.round(m.ds.times[e] / 60000));
    const labelEvery = range === '1h' ? 10 : range === '6h' ? 60 : 180;
    const b = (arr: ArrayLike<number>, d = 2) => binMean(arr, from, to, bin).map((v) => +v.toFixed(d));
    const binOf = (i: number) => Math.min(starts.length - 1, Math.max(0, Math.floor((i - from) / bin)));
    const retEv = eventOnsets(s.retransZ, from, to, 4, 3).map(binOf);
    const repEv = eventOnsets(s.reportZ5, from, to, 4, 3).map(binOf);
    const retrans = b(s.retrans);
    const rate = b(s.rate, 1);
    const grids = [
      { left: 52, right: 14, top: 30, height: 74 },
      { left: 52, right: 14, top: 136, height: 74 },
      { left: 52, right: 14, top: 242, height: 74 },
    ];
    const xAxis = grids.map((_, gi) => ({
      type: 'category', data: labels, gridIndex: gi, boundaryGap: gi === 2,
      axisLine: { lineStyle: { color: k.axis } }, axisTick: { show: false },
      axisLabel: gi === 2 ? { color: k.ink3, fontSize: 11, hideOverlap: true, interval: (i: number) => minutes[i] % labelEvery === 0 } : { show: false },
    }));
    const yBase = {
      type: 'value', splitNumber: 2, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: k.ink3, fontSize: 10 }, splitLine: { lineStyle: { color: k.grid } },
      nameTextStyle: { color: k.ink2, fontSize: 11, fontWeight: 600, align: 'left', padding: [0, 0, 2, -44] },
    };
    const pins = (bins: number[], vals: number[], color: string) => ({
      symbol: 'triangle', symbolSize: 9, symbolRotate: 180, silent: true, label: { show: false },
      itemStyle: { color }, data: bins.map((bi) => ({ coord: [bi, Math.max(...vals) * 1.02] })),
    });
    return {
      animation: false,
      textStyle: { fontFamily: k.fontSans },
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: k.ink3 } },
      grid: grids,
      xAxis,
      yAxis: [
        { ...yBase, gridIndex: 0, name: 'TCP 재전송 %', min: 0 },
        { ...yBase, gridIndex: 1, name: '체감 지연 p95 ms', min: 0 },
        { ...yBase, gridIndex: 2, name: '렉 제보 · 1만 명당/분', min: 0 },
      ],
      tooltip: {
        trigger: 'axis', ...tooltipStyle(k),
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const rows = ps.filter((p) => !p.seriesName.startsWith('_'))
            .map((p) => `<div style="display:flex;gap:12px;justify-content:space-between">${swatch(String(p.color))}<span style="flex:1">${p.seriesName}</span><b>${fmtFixed(p.value, p.seriesName.includes('재전송') ? 2 : 0)}</b></div>`)
            .join('');
          return `<div style="min-width:200px"><div style="color:${k.ink2};margin-bottom:4px">${labels[i]}</div>${rows}</div>`;
        },
      },
      series: [
        { name: '재전송 전일 기준', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: b(s.retransBase), symbol: 'none', lineStyle: { color: k.ink3, width: 1.25, type: 'dotted' }, itemStyle: { color: k.ink3 } },
        {
          name: 'TCP 재전송 %', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: retrans, symbol: 'none',
          lineStyle: { color: k.causeNetwork, width: 2 }, itemStyle: { color: k.causeNetwork }, areaStyle: { color: k.causeNetwork, opacity: 0.1 },
          markPoint: pins(retEv, retrans, k.causeNetwork),
        },
        {
          name: '체감 지연 p95', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: b(s.el, 0), symbol: 'none',
          lineStyle: { color: k.ink1, width: 2 }, itemStyle: { color: k.ink1 },
          markLine: {
            silent: true, symbol: 'none', animation: false,
            data: [
              { yAxis: THRESHOLDS.notice, lineStyle: { color: k.tierNotice, width: 1, type: 'solid' }, label: { formatter: `${TIER_LABEL.notice} 150`, position: 'insideStartTop', color: k.ink2, fontSize: 10 } },
              { yAxis: THRESHOLDS.warning, lineStyle: { color: k.tierWarning, width: 1, type: 'solid' }, label: { formatter: `${TIER_LABEL.warning} 250`, position: 'insideStartTop', color: k.ink2, fontSize: 10 } },
            ],
          },
        },
        {
          name: '렉 제보율', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, data: rate, barCategoryGap: '20%',
          itemStyle: { color: k.ink2, borderRadius: [2, 2, 0, 0] },
          markPoint: pins(repEv, rate, k.ink1),
        },
        { name: '평소 기대치', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: b(s.expectedRate, 1), symbol: 'none', lineStyle: { color: k.ink3, width: 1.25, type: 'dotted' }, itemStyle: { color: k.ink3 }, z: 3 },
      ],
    };
  }, [m, s, from, to, bin, k, range]);

  const onCursorRef = useLatest(onCursor);
  const geo = useLatest({ from, bin });
  const { ref, instance } = useChart(option, {
    onReady: (c) => {
      c.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
        for (let gi = 0; gi < 3; gi++) {
          if (!c.containPixel({ gridIndex: gi }, [e.offsetX, e.offsetY])) continue;
          const [xi] = c.convertFromPixel({ gridIndex: gi }, [e.offsetX, e.offsetY]) as number[];
          onCursorRef.current(Math.min(m.last, geo.current.from + Math.round(xi) * geo.current.bin + geo.current.bin - 1));
          return;
        }
      });
    },
  });

  const retNow = s.retrans[t];
  const rateNow = s.rate[t];
  const expNow = s.expectedRate[t];
  return (
    <section className="card chain-card">
      <header className="card-head">
        <div>
          <h2>신호 연쇄 · {label}</h2>
          <p className="card-sub">패킷 손실 → TCP 재전송 → 체감 지연 → 채팅 제보. 같은 시간축에 쌓았고 ▼는 급증 시작(평소 대비 z ≥ 4, 3분 이상)입니다.</p>
        </div>
        <dl className="chain-now">
          <div><dt>재전송</dt><dd><RollingNumber text={fmtFixed(retNow, 2)} /><small>%</small></dd></div>
          <div><dt>제보율</dt><dd><RollingNumber text={fmtInt(rateNow)} /><small>/1만</small></dd></div>
          <div><dt>평소 대비</dt><dd><RollingNumber text={expNow > 0 ? fmtFixed(rateNow / expNow, 1) : '–'} /><small>배</small></dd></div>
        </dl>
      </header>
      <div className="chart-wrap">
        <div ref={ref} className="chart" style={{ height: 348 }} aria-label={`${label} 재전송·체감 지연·채팅 제보 시계열`} />
        <ChartCursor chart={instance} index={Math.floor((t - from) / bin)} grids={[0, 1, 2]} mask />
      </div>
      <ul className="chain-legend">
        <li><i style={{ background: k.causeNetwork }} />TCP 재전송률</li>
        <li><i style={{ background: k.ink1 }} />체감 지연 p95</li>
        <li><i className="bar" style={{ background: k.ink2 }} />렉 제보율 (도배 제외, 유저 단위)</li>
        <li><i className="ref" style={{ borderColor: k.ink3 }} />전일 동시간대 기준</li>
      </ul>
    </section>
  );
}
