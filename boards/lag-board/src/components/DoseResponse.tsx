import { useMemo } from 'react';
import type { BoardModel } from '../analytics/model';
import { doseResponse, fittedRate, periEvent, type DoseBin, type SignalScope } from '../analytics/signals';
import { REGIONS, THRESHOLDS } from '../data/config';
import { fmtFixed, fmtInt } from '../lib/format';
import type { Tokens } from '../lib/theme';
import { rangeIdx, type RangeKey } from '../lib/view';
import { useChart } from '../charts/useChart';
import { tooltipStyle } from '../charts/common';

type Api = { value: (i: number) => number; coord: (v: number[]) => number[] };

function points(k: Tokens, bins: DoseBin[]) {
  return [
    {
      // 95% 신뢰구간 수염
      type: 'custom', silent: true, z: 2,
      data: bins.map((b) => [b.x, b.ciLo, b.ciHi]),
      renderItem: (_: unknown, api: Api) => {
        const lo = api.coord([api.value(0), Math.max(api.value(1), 0.6)]);
        const hi = api.coord([api.value(0), api.value(2)]);
        return {
          type: 'group',
          children: [
            { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style: { stroke: k.ink3, lineWidth: 1.5 } },
            { type: 'line', shape: { x1: lo[0] - 3, y1: lo[1], x2: lo[0] + 3, y2: lo[1] }, style: { stroke: k.ink3, lineWidth: 1.5 } },
            { type: 'line', shape: { x1: hi[0] - 3, y1: hi[1], x2: hi[0] + 3, y2: hi[1] }, style: { stroke: k.ink3, lineWidth: 1.5 } },
          ],
        };
      },
    },
    {
      name: '구간 평균', type: 'scatter', z: 4, symbolSize: 8,
      data: bins.map((b) => [b.x, Math.max(0.6, b.rate), b.count, b.exposure]),
      itemStyle: { color: k.ink1, borderColor: k.surface1, borderWidth: 2 },
    },
  ];
}

function axes(k: Tokens, xName: string, xmin: number, xmax: number, fmt: (v: number) => string) {
  return {
    xAxis: {
      type: 'log', min: xmin, max: xmax, name: xName, nameLocation: 'middle', nameGap: 24,
      nameTextStyle: { color: k.ink3, fontSize: 11 }, axisLine: { lineStyle: { color: k.axis } }, axisTick: { show: false },
      axisLabel: { color: k.ink3, fontSize: 10, formatter: fmt }, splitLine: { lineStyle: { color: k.grid } },
    },
    yAxis: {
      type: 'log', min: 5, max: 2000, name: '제보 · 1만 명당/분', nameTextStyle: { color: k.ink3, fontSize: 10, align: 'left', padding: [0, 0, 0, -30] },
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: k.ink3, fontSize: 10 }, splitLine: { lineStyle: { color: k.grid } },
    },
  };
}

/**
 * 용량–반응 — "얼마나 나빠지면 유저가 말하기 시작하나".
 * 점: 서버·분 단위를 구간으로 묶은 평균 제보율(±95%), 선: 분절 포아송 회귀 적합 (재전송·프레임 초과는 0으로 둔 순수 EL 관계).
 * 제보는 체감보다 늦으므로 사건 정렬 평균에서 찾은 상승 시점만큼 시차를 보정한다.
 */
export function DoseResponse({ m, range, tokens: k, scope }: { m: BoardModel; range: RangeKey; tokens: Tokens; scope: SignalScope }) {
  const { from, to } = rangeIdx(m, range);
  const label = scope.region ? REGIONS.find((r) => r.id === scope.region)!.name : '전체';
  const lag = useMemo(() => {
    const pe = periEvent(m, {}, from, to);
    return Math.max(1, Math.min(6, pe.riseLag ?? 3));
  }, [m, from, to]);
  // 곡선·꺾임점은 항상 전체 서버로 적합한다. 권역 하나는 장애가 1~2건뿐이라 EL과 재전송이 함께 움직여(공선성) 효과를 가를 수 없다.
  const g = useMemo(() => doseResponse(m, {}, from, to, lag), [m, from, to, lag]);
  const sc = useMemo(() => (scope.region || scope.serverId ? doseResponse(m, scope, from, to, lag) : g), [m, scope.region, scope.serverId, from, to, lag, g]);
  const d = { ...sc, fit: g.fit };
  const scoped = sc !== g;

  const elOpt = useMemo(() => {
    const curve: number[][] = [];
    for (let i = 0; i <= 48; i++) {
      const el = 50 * (800 / 50) ** (i / 48);
      curve.push([el, Math.max(0.6, fittedRate(d.fit, el))]);
    }
    return {
      animation: false,
      textStyle: { fontFamily: k.fontChart },
      grid: { left: 42, right: 12, top: 30, bottom: 38 },
      ...axes(k, '체감 지연 (ms, 로그)', 50, 800, (v) => `${v}`),
      tooltip: {
        trigger: 'item', ...tooltipStyle(k),
        formatter: (p: { seriesName: string; value: number[] }) => p.seriesName === '구간 평균'
          ? `체감 지연 ~${fmtInt(p.value[0])}ms<br/>제보 <b>${fmtFixed(p.value[1], 1)}</b> /1만 명·분<br/><span style="color:${k.ink3}">제보 ${fmtInt(p.value[2])}건 · 노출 ${fmtInt(p.value[3])}명·분</span>`
          : '',
      },
      series: [
        {
          name: '적합', type: 'line', data: curve, symbol: 'none', silent: true, z: 3,
          lineStyle: { color: k.ink2, width: 2 },
          markArea: {
            silent: true,
            data: [
              [{ xAxis: THRESHOLDS.notice, itemStyle: { color: k.tierNotice, opacity: 0.08 } }, { xAxis: THRESHOLDS.warning }],
              [{ xAxis: THRESHOLDS.warning, itemStyle: { color: k.tierWarning, opacity: 0.08 } }, { xAxis: THRESHOLDS.critical }],
              [{ xAxis: THRESHOLDS.critical, itemStyle: { color: k.tierCritical, opacity: 0.08 } }, { xAxis: 800 }],
            ],
          },
          markLine: {
            silent: true, symbol: 'none', animation: false,
            data: [{ xAxis: d.fit.T, lineStyle: { color: k.ink1, width: 1.5, type: 'solid' }, label: { formatter: `꺾임 ${d.fit.T}ms`, position: 'insideEndTop', color: k.ink1, fontSize: 10, fontWeight: 600 } }],
          },
        },
        ...points(k, d.byEl),
      ],
    };
  }, [d, k]);

  const rxOpt = useMemo(() => {
    const base = 0.18;
    const curve: number[][] = [];
    for (let i = 0; i <= 40; i++) {
      const r = 0.05 * (20 / 0.05) ** (i / 40);
      curve.push([r, Math.max(0.6, Math.exp(d.fit.a + d.fit.c * Math.max(0, r - base)) * 1e4)]);
    }
    return {
      animation: false,
      textStyle: { fontFamily: k.fontChart },
      grid: { left: 42, right: 12, top: 30, bottom: 38 },
      ...axes(k, 'TCP 재전송률 (%, 로그)', 0.05, 20, (v) => `${v}`),
      tooltip: {
        trigger: 'item', ...tooltipStyle(k),
        formatter: (p: { seriesName: string; value: number[] }) => p.seriesName === '구간 평균'
          ? `재전송 ~${fmtFixed(p.value[0], 2)}%<br/>제보 <b>${fmtFixed(p.value[1], 1)}</b> /1만 명·분<br/><span style="color:${k.ink3}">제보 ${fmtInt(p.value[2])}건 · 노출 ${fmtInt(p.value[3])}명·분</span>`
          : '',
      },
      series: [
        { name: '적합', type: 'line', data: curve, symbol: 'none', silent: true, z: 3, lineStyle: { color: k.causeNetwork, width: 2 } },
        ...points(k, d.byRetrans),
      ],
    };
  }, [d, k]);

  const a = useChart(elOpt);
  const b = useChart(rxOpt);
  return (
    <section className="card dose-card">
      <header className="card-head">
        <div>
          <h2>얼마나 나빠지면 제보하나 · {label}</h2>
          <p className="card-sub">점: {label} 서버·분 단위 제보율 구간 평균(±95%) · 선: 전체 서버 분절 포아송 회귀{scoped ? ' (권역 하나로는 효과를 가르기 어려워 전체로 적합)' : ''} · 제보 시차 {d.lag}분 보정</p>
        </div>
      </header>
      <div className="dose-grid">
        <figure className="mini">
          <figcaption><b>체감 지연</b><span className="muted">선: 재전송·프레임 영향을 뺀 순수 관계</span></figcaption>
          <div ref={a.ref} className="chart" style={{ height: 210 }} aria-label="체감 지연별 제보율" />
        </figure>
        <figure className="mini">
          <figcaption><b>TCP 재전송</b><span className="muted">선: 체감 지연이 꺾임점 아래일 때</span></figcaption>
          <div ref={b.ref} className="chart" style={{ height: 210 }} aria-label="재전송률별 제보율" />
        </figure>
      </div>
      <ul className="dose-read">
        <li>
          제보가 꺾여 오르는 체감 지연은 <b>{d.fit.T}ms</b> <span className="muted">(95% {d.fit.Tlo}–{d.fit.Thi}ms, 준포아송 산포 φ {fmtFixed(d.fit.phi, 1)})</span>. 그 위에서는 체감 지연이 2배가 되면 제보가 <b>×{fmtFixed(2 ** d.fit.b, 1)}</b>.
          {' '}연구 기반 주의 임계값 150ms와 {Math.abs(d.fit.T - THRESHOLDS.notice) <= 25 ? '가깝습니다' : `${d.fit.T > THRESHOLDS.notice ? '+' : ''}${d.fit.T - THRESHOLDS.notice}ms 차이 — 재보정 후보입니다`}.
        </li>
        <li>
          체감 지연을 같게 놓고도 TCP 재전송이 1%p 늘 때마다 제보 <b>×{fmtFixed(d.fit.perRetransPct, 2)}</b> — 평균 지연에 다 담기지 않는 멈칫·순간이동(HOL 블로킹)을 유저가 따로 체감합니다.
        </li>
      </ul>
    </section>
  );
}
