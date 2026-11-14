import { useMemo } from 'react';
import type { BoardModel } from '../analytics/model';
import { coincidence, periEvent, type SignalScope } from '../analytics/signals';
import { REGIONS } from '../data/config';
import { fmtFixed } from '../lib/format';
import type { Tokens } from '../lib/theme';
import { rangeIdx, type RangeKey } from '../lib/view';
import { useChart } from '../charts/useChart';
import { swatch, tooltipStyle } from '../charts/common';

const pText = (p: number) => (p < 0.0001 ? 'p < 0.0001' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);

/**
 * 결합 분석 — "재전송이 급증하면 제보도 오르나?"
 *  ① 사건 동시발생(ECA): 촉발률(재전송 급증 → 10분 안 제보 급증)과 전조율(제보 급증 ← 직전 재전송 급증), 우연 기대치 대비 포아송 검정
 *  ② 사건 정렬 평균: 재전송 급증 시작을 0분에 맞춘 재전송·EL·제보의 평균 z와 95% 신뢰띠
 */
export function CouplingCard({ m, range, tokens: k, scope }: { m: BoardModel; range: RangeKey; tokens: Tokens; scope: SignalScope }) {
  const { from, to } = rangeIdx(m, range);
  const label = scope.region ? REGIONS.find((r) => r.id === scope.region)!.name : '전체';
  const eca = useMemo(() => coincidence(m, scope, from, to), [m, scope.region, scope.serverId, from, to]);
  const pe = useMemo(() => periEvent(m, scope, from, to), [m, scope.region, scope.serverId, from, to]);
  const enough = pe.events >= 3;

  const option = useMemo(() => {
    const xs = pe.offsets;
    // 신호마다 크기(σ)가 크게 달라 한 축에 그대로 두면 제보 반응이 납작해진다 → 각 신호의 사건 후 최대 반응을 100%로 맞춘다
    // (이 차트는 "언제 오르나"를 보는 용도, 크기는 아래 문장의 효과 크기로 읽는다)
    const norm = (bands: typeof pe.reports, smooth = false) => {
      // 제보는 분 단위 건수라 들쭉날쭉 → 표시용으로만 가운데 3분 이동평균 (통계값은 원자료로 계산)
      const sm = smooth
        ? bands.map((_, i) => {
            const w = bands.slice(Math.max(0, i - 1), i + 2);
            const avg = (f: (b: typeof bands[number]) => number) => w.reduce((a, b) => a + f(b), 0) / w.length;
            return { mean: avg((b) => b.mean), lo: avg((b) => b.lo), hi: avg((b) => b.hi) };
          })
        : bands;
      const peak = Math.max(...sm.filter((_, i) => xs[i] >= 0).map((b) => b.mean), 1e-6);
      return sm.map((b) => ({ mean: (b.mean / peak) * 100, lo: (b.lo / peak) * 100, hi: (b.hi / peak) * 100 }));
    };
    const lineBand = (name: string, bands: typeof pe.reports, color: string, width: number, fill: number): Record<string, unknown>[] => [
      { name: `_${name}-lo`, type: 'line', data: bands.map((b) => +b.lo.toFixed(2)), stack: name, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      {
        name: `_${name}-band`, type: 'line', data: bands.map((b) => +(b.hi - b.lo).toFixed(2)), stack: name, symbol: 'none',
        lineStyle: { opacity: 0 }, areaStyle: { color, opacity: fill }, silent: true, tooltip: { show: false },
      },
      { name, type: 'line', data: bands.map((b) => +b.mean.toFixed(2)), symbol: 'none', lineStyle: { color, width }, itemStyle: { color }, z: 4 },
    ];
    const reports = lineBand('채팅 제보', norm(pe.reports, true), k.ink1, 2.25, 0.16);
    reports[2] = {
      ...reports[2],
      markLine: {
        silent: true, symbol: 'none', animation: false,
        data: [
          { xAxis: '0', lineStyle: { color: k.causeNetwork, width: 1, type: 'solid' }, label: { formatter: '재전송 급증', position: 'insideEndTop', color: k.ink2, fontSize: 10 } },
          ...(pe.riseLag !== null ? [{ xAxis: `+${pe.riseLag}`, lineStyle: { color: k.ink1, width: 1, type: 'solid' }, label: { formatter: `제보 상승 +${pe.riseLag}분`, position: 'insideEndBottom', color: k.ink1, fontSize: 10 } }] : []),
        ],
      },
    };
    return {
      animation: false,
      textStyle: { fontFamily: k.fontChart },
      grid: { left: 40, right: 14, top: 18, bottom: 34 },
      xAxis: {
        type: 'category', data: xs.map((x) => (x > 0 ? `+${x}` : `${x}`)), boundaryGap: false,
        name: '재전송 급증 시작 기준 (분)', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: k.ink3, fontSize: 11 },
        axisLine: { lineStyle: { color: k.axis } }, axisTick: { show: false },
        axisLabel: { color: k.ink3, fontSize: 10, interval: (i: number) => xs[i] % 10 === 0 },
      },
      yAxis: {
        type: 'value', name: '최대 반응 대비 %', max: 130, nameTextStyle: { color: k.ink3, fontSize: 10, align: 'left', padding: [0, 0, 0, -30] },
        splitNumber: 3, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: k.ink3, fontSize: 10 },
        splitLine: { lineStyle: { color: k.grid } },
      },
      tooltip: {
        trigger: 'axis', ...tooltipStyle(k),
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const rows = ps.filter((p) => !p.seriesName.startsWith('_'))
            .map((p) => `<div style="display:flex;gap:12px;justify-content:space-between">${swatch(String(p.color))}<span style="flex:1">${p.seriesName}</span><b>${fmtFixed(p.value, 0)}%</b></div>`).join('');
          return `<div style="min-width:170px"><div style="color:${k.ink2};margin-bottom:4px">급증 ${xs[i] >= 0 ? '+' : ''}${xs[i]}분</div>${rows}</div>`;
        },
      },
      series: [
        ...lineBand('TCP 재전송', norm(pe.retrans), k.causeNetwork, 2, 0.12),
        ...lineBand('체감 지연', norm(pe.el), k.ink3, 1.5, 0),
        ...reports,
      ],
    };
  }, [pe, k]);
  const { ref } = useChart(option);

  const trigPct = eca.retransEvents ? Math.round((eca.triggerHits / eca.retransEvents) * 100) : 0;
  const prePct = eca.reportEvents ? Math.round((eca.precursorHits / eca.reportEvents) * 100) : 0;
  return (
    <section className="card coupling-card">
      <header className="card-head">
        <div>
          <h2>제보 × 재전송 결합 · {label}</h2>
          <p className="card-sub">서버 단위 급증 사건으로 셉니다. 우연이라면 기대되는 횟수와 비교합니다 (사건 동시발생 분석).</p>
        </div>
      </header>
      <div className="eca">
        <article className="eca-stat">
          <span className="eca-label">재전송 급증 → 10분 안에 제보 급증</span>
          <span className="eca-value"><b>{eca.triggerHits}</b>/{eca.retransEvents}<small>건 · {trigPct}%</small></span>
          <span className="eca-sub">우연 기대 {fmtFixed(eca.triggerExpected, 2)}건 · {pText(eca.triggerP)}</span>
        </article>
        <article className="eca-stat">
          <span className="eca-label">제보 급증 중 직전에 재전송 급증</span>
          <span className="eca-value"><b>{eca.precursorHits}</b>/{eca.reportEvents}<small>건 · {prePct}%</small></span>
          <span className="eca-sub">우연 기대 {fmtFixed(eca.precursorExpected, 2)}건 · {pText(eca.precursorP)}</span>
        </article>
      </div>
      <p className="coupling-read">
        {eca.retransEvents === 0
          ? '이 범위·기간에는 재전송 급증 사건이 없습니다.'
          : eca.precursorHits < eca.reportEvents
            ? `재전송이 급증하면 제보가 따라오지만, 제보 급증 ${eca.reportEvents}건 중 ${eca.reportEvents - eca.precursorHits}건은 재전송 없이 일어났습니다 — 서버·인프라·클라 렉이거나 측정 사각지대입니다.`
            : '이 범위의 제보 급증은 모두 재전송 급증 직후에 일어났습니다 — 패킷 손실형 렉입니다.'}
      </p>
      <figure className="mini">
        <figcaption>
          <b>사건 정렬 평균</b>
          <span className="muted">재전송 급증 {pe.events}건을 0분에 맞춰 평균 · 신호별 최대 반응 = 100% · 띠는 95% 신뢰구간 · 제보는 3분 이동평균</span>
        </figcaption>
        {enough ? (
          <div ref={ref} className="chart" style={{ height: 190 }} aria-label="재전송 급증 기준 사건 정렬 평균" />
        ) : (
          <p className="empty-note">재전송 급증 사건이 3건 미만이라 평균을 내지 않았습니다. 권역을 전체로 바꾸거나 기간을 늘려 보세요.</p>
        )}
      </figure>
      {enough && (
        <p className="coupling-read">
          재전송이 급증하면 제보가 평균 <b>{pe.riseLag !== null ? `${pe.riseLag}분` : '–'}</b> 뒤부터 유의하게 오르고, 급증으로 잡히기까지 중앙값 <b>{pe.lagMedian !== null ? `${fmtFixed(pe.lagMedian, 0)}분` : '–'}</b>
          {pe.lagQ1 !== null && pe.lagQ3 !== null && <span className="muted"> (사분위 {fmtFixed(pe.lagQ1, 0)}–{fmtFixed(pe.lagQ3, 0)}분)</span>} 걸렸습니다.
          사건 뒤 15분 제보는 평소보다 <b>+{fmtFixed(pe.effect.mean, 1)}σ</b> <span className="muted">(95% {fmtFixed(pe.effect.lo, 1)}~{fmtFixed(pe.effect.hi, 1)})</span>.
        </p>
      )}
    </section>
  );
}
