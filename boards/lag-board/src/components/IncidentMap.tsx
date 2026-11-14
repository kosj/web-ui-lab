import { useMemo } from 'react';
import type { BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import { getSignals, type BlindSpot } from '../analytics/signals';
import { CAUSE_LABEL, REGIONS } from '../data/config';
import { fmtCompact, fmtFixed } from '../lib/format';
import type { Tokens } from '../lib/theme';
import { useChart } from '../charts/useChart';
import { tooltipStyle } from '../charts/common';
import { useLatest } from '../lib/useLatest';

const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));

function blindRetransRatio(m: BoardModel, b: BlindSpot) {
  const end = (b.endIdx ?? m.last + 1) - 1;
  let before = 0;
  let during = 0;
  for (const id of b.serverIds) {
    const s = getSignals(m, { serverId: id });
    before += s.retransBase[b.onsetIdx] || 0;
    let acc = 0;
    for (let t = b.onsetIdx; t <= end; t++) acc += s.retrans[t];
    during += acc / (end - b.onsetIdx + 1);
  }
  return before > 0 ? during / before : 1;
}

/**
 * 장애 지도 — 가로: TCP 재전송 배수, 세로: 채팅 제보 배수 (둘 다 평소 대비, 로그 눈금).
 * 오른쪽 위 = 손실형(네트워크) 렉, 왼쪽 위 = 재전송 없이 유저가 느끼는 렉(서버·인프라·클라·측정 사각지대).
 * 점 크기는 영향 유저 수. 원인 색은 이름표와 함께 쓴다(색만으로 구분하지 않음).
 */
export function IncidentMap({ m, t, tokens: k, onPick }: { m: BoardModel; t: number; tokens: Tokens; onPick: (inc: Incident) => void }) {
  const points = useMemo(() => {
    const inc = m.incidents.filter((i) => i.onsetIdx <= t && i.voice).map((i) => ({
      kind: 'incident' as const, id: i.id, inc: i,
      x: Math.max(0.6, i.voice!.retransDuring / Math.max(0.01, i.voice!.retransBefore)),
      y: Math.max(0.6, i.voice!.reportX),
      label: i.scopeType === 'isp' ? i.scopeLabel : i.cause === 'client' ? '클라 2.14.0' : i.scopeType === 'server' ? i.serverIds[0] : i.scopeLabel.replace(' 권역', ''),
      cause: i.cause, users: i.peakUsers,
    }));
    const bs = m.blindSpots.filter((b) => b.onsetIdx <= t).map((b) => ({
      kind: 'blind' as const, id: b.id, inc: null,
      x: Math.max(0.6, blindRetransRatio(m, b)), y: Math.max(0.6, b.peakX),
      label: `사각지대 · ${REGION_NAME[b.region]}`, cause: null, users: 0,
    }));
    return [...inc, ...bs];
  }, [m, t]);

  const option = useMemo(() => {
    // 가까운 두 점(로그 거리 기준)은 아래쪽 점의 이름표를 왼쪽으로 돌려 점과 겹치지 않게 한다
    const near = (a: (typeof points)[number], b: (typeof points)[number]) =>
      Math.abs(Math.log10(a.x) - Math.log10(b.x)) < 0.25 && Math.abs(Math.log10(a.y) - Math.log10(b.y)) < 0.3;
    const labelPos = (d: (typeof points)[number]) => (points.some((o) => o !== d && near(o, d) && o.y > d.y) ? 'left' : 'right');
    const col = { infra: k.causeInfra, network: k.causeNetwork, server: k.causeServer, client: k.causeClient } as const;
    const qText = (text: string, pos: Record<string, number | string>) => ({
      type: 'text', ...pos, silent: true, style: { text, fill: k.ink3, font: `600 11px ${k.fontChart}` },
    });
    return {
      animation: false,
      textStyle: { fontFamily: k.fontChart },
      grid: { left: 44, right: 24, top: 30, bottom: 40 },
      xAxis: {
        type: 'log', min: 0.5, max: 50, name: 'TCP 재전송 (평소 대비 배)', nameLocation: 'middle', nameGap: 26,
        nameTextStyle: { color: k.ink3, fontSize: 11 }, axisLine: { lineStyle: { color: k.axis } }, axisTick: { show: false },
        axisLabel: { color: k.ink3, fontSize: 10, formatter: (v: number) => `×${v}` }, splitLine: { lineStyle: { color: k.grid } },
      },
      yAxis: {
        type: 'log', min: 0.5, max: 100, name: '채팅 제보 (배)', nameTextStyle: { color: k.ink3, fontSize: 11, align: 'left', padding: [0, 0, 0, -34] },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: k.ink3, fontSize: 10, formatter: (v: number) => `×${v}` }, splitLine: { lineStyle: { color: k.grid } },
      },
      graphic: [
        qText('손실형 렉', { right: 30, top: 28 }),
        qText('재전송 없는 렉', { left: 52, top: 28 }),
      ],
      tooltip: {
        trigger: 'item', ...tooltipStyle(k),
        formatter: (p: { dataIndex: number }) => {
          const d = points[p.dataIndex];
          const head = d.inc ? `${CAUSE_LABEL[d.inc.cause]} · ${d.inc.title}` : `측정 사각지대 · ${d.label}`;
          return `<b>${head}</b><br/>TCP 재전송 ×${fmtFixed(d.x, 1)} · 채팅 제보 ×${fmtFixed(d.y, 1)}${d.users ? `<br/>영향 최대 ${fmtCompact(d.users)}명` : ''}`;
        },
      },
      series: [{
        type: 'scatter',
        // 가까운 점의 이름표가 겹치면 위아래로 밀어낸다
        labelLayout: { moveOverlap: 'shiftY' },
        data: points.map((d) => ({
          value: [d.x, d.y],
          symbolSize: d.users ? 10 + Math.sqrt(d.users / 1000) * 3 : 12,
          itemStyle: d.cause
            ? { color: col[d.cause], borderColor: k.surface1, borderWidth: 2 }
            : { color: k.surface1, borderColor: k.ink1, borderWidth: 2 },
          label: { show: true, formatter: d.label, position: labelPos(d), color: k.ink2, fontSize: 11, distance: 6 },
        })),
        markLine: {
          silent: true, symbol: 'none', animation: false, label: { show: false },
          lineStyle: { color: k.axis, width: 1, type: 'solid' },
          data: [{ xAxis: 2 }, { yAxis: 2 }],
        },
      }],
    };
  }, [points, k]);

  const pick = useLatest(onPick);
  const pts = useLatest(points);
  const { ref } = useChart(option, {
    onReady: (c) => c.on('click', (p: { dataIndex?: number }) => {
      const d = pts.current[p.dataIndex ?? -1];
      if (d?.inc) pick.current(d.inc);
    }),
  });

  return (
    <section className="card map-card">
      <header className="card-head">
        <div>
          <h2>장애 지도</h2>
          <p className="card-sub">장애마다 재전송·제보가 평소의 몇 배였는지 찍었습니다. 오른쪽 위는 패킷 손실형(네트워크), 왼쪽 위는 재전송 없이 체감되는 렉(서버·인프라·클라·측정 사각지대)입니다. 점 크기는 영향 유저, 점을 누르면 그 장애로 이동합니다.</p>
        </div>
      </header>
      <div ref={ref} className="chart" style={{ height: 280 }} aria-label="장애별 재전송 배수와 제보 배수 산점도" />
      <table className="data-table map-table">
        <thead><tr><th scope="col">장애</th><th scope="col">재전송</th><th scope="col">제보</th></tr></thead>
        <tbody>
          {points.map((d) => (
            <tr key={d.id}>
              <th scope="row">{d.inc ? `${CAUSE_LABEL[d.inc.cause]} · ${d.label}` : d.label}</th>
              <td className={`num ${d.x >= 2 ? 'delta-up' : 'muted'}`}>×{fmtFixed(d.x, 1)}</td>
              <td className={`num ${d.y >= 2 ? 'delta-up' : 'muted'}`}>×{fmtFixed(d.y, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
