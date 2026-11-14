import { useMemo } from 'react';
import type { BoardModel } from '../analytics/model';
import { NEW_CLIENT_VERSION, OLD_CLIENT_VERSION, REGIONS, TICK_BUDGET_MS } from '../data/config';
import { fmtCompact, fmtFixed, fmtInt, hhmm } from '../lib/format';
import { binMean, RANGE_BIN, rangeIdx, serverNow, type RangeKey } from '../lib/view';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { swatch, timeAxes, tooltipStyle } from '../charts/common';
import { decompositionOption } from './CauseBreakdown';
import { CauseBadge, TierPill } from './Badges';
import { ChartCursor } from '../charts/ChartCursor';
import { useMotionOn } from '../lib/motion';
import { RollingNumber } from './RollingNumber';
import { getSignals } from '../analytics/signals';

interface LineSpec {
  name: string;
  data: number[];
  color: string;
  width?: number;
  /** 기준선(전일 동시간대) — 얇은 점선, 참조선이라는 뜻 */
  reference?: boolean;
  /** 아래 시리즈와의 사이를 띠로 채움 (p50–p95 밴드) */
  bandFrom?: number[];
}

/** 축 최대값을 읽기 좋은 수로 올림 (1·2·2.5·5 × 10ⁿ) */
function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const s of [1, 2, 2.5, 5, 10]) if (s * p >= v) return s * p;
  return 10 * p;
}

function metricOption(k: Tokens, labels: string[], minutes: number[], labelEvery: number, unit: string, lines: LineSpec[], motion: boolean, hLine?: { v: number; label: string; color: string }) {
  const axes = timeAxes(k, labels, minutes, labelEvery);
  const series: Record<string, unknown>[] = [];
  for (const l of lines) {
    if (l.bandFrom) {
      series.push({ id: `${l.name}-lo`, name: `${l.name}-lo`, type: 'line', stack: l.name, data: l.bandFrom, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } });
      series.push({
        id: `${l.name}-band`, name: `${l.name}-band`, type: 'line', stack: l.name, symbol: 'none', lineStyle: { opacity: 0 }, silent: true,
        areaStyle: { color: l.color, opacity: 0.12 }, data: l.data.map((v, i) => Math.max(0, v - l.bandFrom![i])),
      });
    }
    series.push({
      id: l.name, name: l.name, type: 'line', data: l.data, symbol: 'none', smooth: false,
      lineStyle: { color: l.color, width: l.width ?? 2, type: l.reference ? 'dotted' : 'solid', cap: 'round', join: 'round' },
      itemStyle: { color: l.color }, z: l.reference ? 1 : 3,
    });
  }
  const last = series[series.length - 1];
  last.markLine = {
    silent: true, symbol: 'none', animation: false,
    data: [
      ...(hLine ? [{ yAxis: hLine.v, lineStyle: { color: hLine.color, width: 1, type: 'solid' }, label: { formatter: hLine.label, position: 'insideStartTop', color: k.ink2, fontSize: 10 } }] : []),
    ],
  };
  return {
    // 서버를 바꾸면 같은 지표 선이 새 서버 값으로 모핑된다
    animation: motion,
    animationDuration: 450,
    animationDurationUpdate: 450,
    animationEasingUpdate: 'cubicInOut' as const,
    textStyle: { fontFamily: k.fontChart },
    grid: { left: 40, right: 10, top: 10, bottom: 24 },
    ...axes,
    yAxis: { ...axes.yAxis, min: 0, max: hLine ? (v: { max: number }) => niceCeil(Math.max(v.max, hLine.v * 1.25)) : undefined },
    tooltip: {
      trigger: 'axis', ...tooltipStyle(k),
      formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
        const i = ps[0]?.dataIndex ?? 0;
        const rows = ps.filter((p) => !p.seriesName.endsWith('-lo') && !p.seriesName.endsWith('-band'))
          .map((p) => `<div style="display:flex;gap:12px;justify-content:space-between">${swatch(String(p.color))}<span style="flex:1">${p.seriesName}</span><b>${fmtFixed(p.value, unit === '%' ? 2 : 0)}${unit}</b></div>`)
          .join('');
        return `<div style="min-width:170px"><div style="color:${k.ink2};margin-bottom:4px">${labels[i]}</div>${rows}</div>`;
      },
    },
    series,
  };
}

function Mini({ title, sub, option, group, cursor }: { title: string; sub: string; option: Record<string, unknown>; group: string; cursor: number }) {
  const { ref, instance } = useChart(option, { group, merge: true });
  return (
    <figure className="mini">
      <figcaption>
        <b>{title}</b>
        <span className="muted">{sub}</span>
      </figcaption>
      <div className="chart-wrap">
        <div ref={ref} className="chart" style={{ height: 150 }} />
        <ChartCursor chart={instance} index={cursor} mask />
      </div>
    </figure>
  );
}

function LegendRow({ items }: { items: { label: string; color: string; reference?: boolean }[] }) {
  return (
    <span className="mini-legend">
      {items.map((it) => (
        <span key={it.label}><i className={it.reference ? 'ref' : ''} style={{ background: it.reference ? 'none' : it.color, borderColor: it.color }} aria-hidden />{it.label}</span>
      ))}
    </span>
  );
}

export function ServerDetail({ m, t, range, tokens: k, serverId }: { m: BoardModel; t: number; range: RangeKey; tokens: Tokens; serverId: string }) {
  const sv = m.ds.servers.find((s) => s.id === serverId)!;
  const r = REGIONS.find((x) => x.id === sv.region)!;
  const a = m.an[serverId];
  const mx = m.ds.metrics[serverId];
  const now = serverNow(m, serverId, t);
  const { from, to } = rangeIdx(m, range);
  const bin = RANGE_BIN[range];
  const labelEvery = range === '1h' ? 15 : range === '6h' ? 120 : 360;
  // 그룹은 서버와 무관하게 고정 — 서버를 바꿔도 차트를 다시 만들지 않고 모핑한다
  const group = 'server-detail';
  const motion = useMotionOn();
  const cursor = Math.floor((t - from) / bin);

  const sig = getSignals(m, { serverId });
  const built = useMemo(() => {
    const starts: number[] = [];
    for (let s = from; s <= to; s += bin) starts.push(s);
    const ends = starts.map((s) => Math.min(to, s + bin - 1));
    const labels = ends.map((e) => hhmm(m.ds.times[e]));
    const minutes = ends.map((e) => Math.round(m.ds.times[e] / 60000));
    const b = (arr: ArrayLike<number>) => binMean(arr, from, to, bin).map((v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN));
    const mo = (unit: string, lines: LineSpec[], h?: { v: number; label: string; color: string }) =>
      metricOption(k, labels, minutes, labelEvery, unit, lines, motion, h);
    return {
      decomp: decompositionOption({ m, agg: { base: a.base, excess: a.excess, total: a.el }, from, to, bin, k, labelEvery, compact: false, motion }),
      rtt: mo('ms', [
        { name: '전일 p95', data: b(a.baselines.rttP95.med), color: k.ink3, width: 1.5, reference: true },
        { name: 'RTT p50', data: b(mx.rttP50), color: k.ink2, width: 1.5 },
        { name: 'RTT p95', data: b(mx.rttP95), color: k.causeNetwork, bandFrom: b(mx.rttP50) },
      ]),
      jitter: mo('ms', [
        { name: '전일', data: b(a.baselines.jitter.med), color: k.ink3, width: 1.5, reference: true },
        { name: '지터', data: b(mx.jitter), color: k.causeNetwork },
      ]),
      loss: mo('%', [
        { name: '전일', data: b(a.baselines.loss.med), color: k.ink3, width: 1.5, reference: true },
        { name: '손실률', data: b(mx.loss), color: k.causeNetwork },
      ], { v: 1, label: '1%', color: k.tierNotice }),
      tick: mo('ms', [
        { name: '전일', data: b(a.baselines.tick.med), color: k.ink3, width: 1.5, reference: true },
        { name: '틱 p99', data: b(mx.tickP99), color: k.causeServer },
      ], { v: TICK_BUDGET_MS, label: `예산 ${TICK_BUDGET_MS}ms`, color: k.tierNotice }),
      host: mo('%', [
        { name: 'I/O 대기', data: b(mx.ioWait), color: k.ink2, width: 1.5 },
        { name: 'CPU steal', data: b(mx.steal), color: k.causeInfra },
      ]),
      retrans: mo('%', [
        { name: '전일', data: b(sig.retransBase), color: k.ink3, width: 1.5, reference: true },
        { name: 'TCP 재전송', data: b(mx.retrans), color: k.causeNetwork },
      ]),
      reports: mo('', [
        { name: '평소 기대', data: b(sig.expectedRate), color: k.ink3, width: 1.5, reference: true },
        { name: '렉 제보 /1만', data: b(sig.rate), color: k.ink1 },
      ]),
      frame: mo('ms', [
        { name: OLD_CLIENT_VERSION, data: b(mx.frameOld), color: k.ink2, width: 1.5 },
        { name: NEW_CLIENT_VERSION, data: b(mx.frameNew), color: k.causeClient },
      ], { v: 50, label: '스톨 50ms', color: k.tierNotice }),
    };
  }, [m, a, mx, sig, from, to, bin, k, labelEvery, motion]);

  const decomp = useChart(built.decomp, { group, merge: true });

  return (
    <section className="card detail-card" aria-label={`${sv.id} 상세`} style={{ viewTransitionName: 'server-detail' }}>
      <header className="detail-head">
        <div className="detail-title">
          <span className="eyebrow">서버 상세</span>
          <h2>{sv.id} <span className="muted">{sv.name}</span></h2>
          <p className="card-sub">{r.name} {r.city} · {sv.dc} 랙 {sv.rack} · 동접 {fmtCompact(now.ccu)}명 · 신버전 비율 {Math.round(mx.newShare[t] * 100)}%</p>
        </div>
        <div className="detail-now">
          <span className="detail-el"><RollingNumber text={fmtInt(now.el)} /><small>ms</small></span>
          <TierPill tier={now.tier} />
          {now.dominant && <CauseBadge cause={now.dominant} />}
        </div>
      </header>

      <figure className="mini wide">
        <figcaption><b>체감 지연 구성</b><span className="muted">네트워크 + 서버 + 클라 성분, 기준선 위 초과분을 원인별로 표시</span></figcaption>
        <div className="chart-wrap">
          <div ref={decomp.ref} className="chart" style={{ height: 200 }} />
          <ChartCursor chart={decomp.instance} index={cursor} mask />
        </div>
      </figure>

      <div className="minis">
        <Mini group={group} cursor={cursor} title="RTT" sub="p50–p95 밴드" option={built.rtt} />
        <Mini group={group} cursor={cursor} title="지터" sub="ms" option={built.jitter} />
        <Mini group={group} cursor={cursor} title="패킷 손실" sub="%" option={built.loss} />
        <Mini group={group} cursor={cursor} title="서버 틱 p99" sub="ms · 20Hz" option={built.tick} />
        <Mini group={group} cursor={cursor} title="호스트 자원" sub="CPU steal · I/O 대기 %" option={built.host} />
        <Mini group={group} cursor={cursor} title="클라 프레임 p95" sub="버전별 ms" option={built.frame} />
        <Mini group={group} cursor={cursor} title="TCP 재전송" sub="% · 손실 → HOL 블로킹" option={built.retrans} />
        <Mini group={group} cursor={cursor} title="채팅 렉 제보" sub="1만 채팅 유저당/분" option={built.reports} />
      </div>
      <div className="detail-legend">
        <LegendRow items={[
          { label: '네트워크 신호', color: k.causeNetwork }, { label: '서버 신호', color: k.causeServer },
          { label: '인프라 신호', color: k.causeInfra }, { label: '클라 신호', color: k.causeClient },
          { label: '전일 동시간대 중앙값', color: k.ink3, reference: true },
        ]} />
      </div>
    </section>
  );
}
