import type { ReactNode } from 'react';
import { Lock, Radio } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { CAUSE_LABEL, CAUSES, REGIONS, THRESHOLDS, TIER_LABEL, tierOf, type Cause } from '../data/config';
import { RollingNumber } from '../components/RollingNumber';
import { TIER_ICON } from '../components/Badges';
import { fmtFixed, fmtInt, signed } from '../lib/format';
import { serverNow } from '../lib/view';
import { BC_TIER_INK } from './palette';
import { useWidth } from './useWidth';

const WINDOW = 90;
const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/**
 * ON AIR 스테이지 — 지금 "카메라가 잡은" 서버 하나를 크게.
 * 자동 연출(AUTO)이면 타워 1위 또는 방금 감지된 장애의 서버를 따라가고, 타워에서 고르면 고정된다.
 * 텔레메트리 = 최근 90분: 회색 띠(기준선) 위에 원인별 초과를 쌓고, 흰 선 = 체감 지연. F1 텔레메트리 트레이스처럼
 * "어느 구간에서 무엇 때문에 느려졌나"를 한 그림에 둔다. 서버가 바뀌면 선이 처음부터 다시 그려진다(상태 변화).
 */
export function OnAir({ m, t, id, auto, onAuto, overlay }: {
  m: BoardModel; t: number; id: string; auto: boolean; onAuto: () => void; overlay?: ReactNode;
}) {
  const sv = m.ds.servers.find((s) => s.id === id)!;
  const sn = serverNow(m, id, t);
  const a = m.an[id];
  const mt = m.ds.metrics[id];
  const prev = a.el[Math.max(m.viewFrom, t - 10)];
  const tier = tierOf(sn.el);
  const Icon = TIER_ICON[tier];
  const region = REGION[sv.region];
  const readouts = [
    { k: 'RTT p95', v: mt.rttP95[t], unit: 'ms', max: 200, warn: 120, d: 0 },
    { k: '지터', v: mt.jitter[t], unit: 'ms', max: 60, warn: 25, d: 0 },
    { k: '손실', v: mt.loss[t], unit: '%', max: 5, warn: 1, d: 1 },
    { k: '틱 p99', v: mt.tickP99[t], unit: 'ms', max: 150, warn: 50, d: 0 },
    { k: '프레임 p95', v: mt.frameP95[t], unit: 'ms', max: 120, warn: 50, d: 0 },
    { k: 'CPU steal', v: mt.steal[t], unit: '%', max: 30, warn: 8, d: 1 },
  ];
  const parts = [{ id: 'base', label: '기준선', v: Math.max(0, sn.base) }, ...CAUSES.map((c) => ({ id: c.id, label: c.label, v: Math.max(0, sn.excess[c.id as Cause]) }))];
  const sum = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <section className="bc-panel bc-onair" aria-labelledby="bc-onair-title" style={{ ['--tier' as string]: BC_TIER_INK[tier] }}>
      <header className="bc-onair-head">
        <span className="bc-onair-tag"><Radio size={13} aria-hidden />ON AIR</span>
        <h2 id="bc-onair-title" key={id} className="bc-onair-name">
          <b className="num">{id}</b> {sv.name}
        </h2>
        <span className="bc-onair-meta">{region.name} · {sv.dc} 랙 {sv.rack} · 동접 {fmtInt(mt.ccu[t])}</span>
        <button type="button" className={`bc-btn ${auto ? 'is-auto' : ''}`} onClick={onAuto} aria-pressed={auto}
          title={auto ? '자동 연출 — 가장 나쁜 서버와 새 장애를 따라갑니다' : '고정됨 — 눌러서 자동 연출로'}>
          {auto ? <><span className="bc-dot" aria-hidden />AUTO 연출</> : <><Lock size={12} aria-hidden />고정 · AUTO로</>}
        </button>
      </header>

      <div className="bc-onair-hero">
        <div className="bc-big">
          <span className="bc-big-num num"><RollingNumber text={fmtInt(sn.el)} /><small>ms</small></span>
          <span className={`bc-tier-flag bc-t-${tier}`}><Icon size={14} strokeWidth={2.6} aria-hidden />{TIER_LABEL[tier]}</span>
        </div>
        <dl className="bc-deltas">
          <div><dt>기준선 대비</dt><dd className="num">{signed(sn.el - sn.base, 'ms')}</dd></div>
          <div><dt>10분 전 대비</dt><dd className="num">{signed(sn.el - prev, 'ms')}</dd></div>
          <div><dt>주 원인</dt><dd>{sn.dominant ? <span className={`bc-cause bc-c-${sn.dominant}`}>{CAUSE_LABEL[sn.dominant]}</span> : <span className="bc-muted">없음</span>}</dd></div>
        </dl>
      </div>

      <Telemetry m={m} t={t} id={id} />

      <div className="bc-sectors" role="img" aria-label={`체감 지연 구성: ${parts.map((p) => `${p.label} ${fmtInt(p.v)}ms`).join(', ')}`}>
        {parts.map((p) => (
          <span key={p.id} className={`bc-sector bc-c-${p.id}`} style={{ flexGrow: Math.max(0.0001, p.v / sum) }}>
            {p.v / sum > 0.08 && <><b className="num">{fmtInt(p.v)}</b><em>{p.label}</em></>}
          </span>
        ))}
      </div>

      <div className="bc-readouts">
        {readouts.map((r) => (
          <div key={r.k} className={`bc-readout ${r.v >= r.warn ? 'is-over' : ''}`}>
            <span className="bc-readout-k">{r.k}</span>
            <span className="bc-readout-v num">{fmtFixed(r.v, r.d)}<small>{r.unit}</small></span>
            <span className="bc-readout-bar" aria-hidden><i style={{ width: `${Math.min(100, (r.v / r.max) * 100)}%` }} /><em style={{ left: `${(r.warn / r.max) * 100}%` }} /></span>
          </div>
        ))}
      </div>
      {overlay}
    </section>
  );
}

function Telemetry({ m, t, id }: { m: BoardModel; t: number; id: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 170;
  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const a = m.an[id];
  const from = Math.max(m.viewFrom, t - WINDOW + 1);
  const n = t - from + 1;
  let vmax = 300;
  for (let i = from; i <= t; i++) vmax = Math.max(vmax, a.el[i] * 1.08);
  const pw = Math.max(10, w - padL - padR);
  const x = (i: number) => padL + ((i - from) / Math.max(1, WINDOW - 1)) * pw;
  const y = (v: number) => padT + (1 - Math.min(v, vmax) / vmax) * (H - padT - padB);
  const order: Cause[] = ['infra', 'network', 'server', 'client'];
  const layers: { id: string; d: string }[] = [];
  const acc = new Float32Array(n);
  for (let k = 0; k < n; k++) acc[k] = Math.max(0, a.base[from + k]);
  const baseTop = Array.from(acc);
  layers.push({ id: 'base', d: area(Array(n).fill(0), baseTop) });
  for (const c of order) {
    const lo = Array.from(acc);
    for (let k = 0; k < n; k++) acc[k] += Math.max(0, a.excess[c][from + k]);
    layers.push({ id: c, d: area(lo, Array.from(acc)) });
  }
  function area(lo: number[], hi: number[]) {
    if (!n) return '';
    let s = `M${x(from)} ${y(hi[0])}`;
    for (let k = 1; k < n; k++) s += `L${x(from + k).toFixed(1)} ${y(hi[k]).toFixed(1)}`;
    for (let k = n - 1; k >= 0; k--) s += `L${x(from + k).toFixed(1)} ${y(lo[k]).toFixed(1)}`;
    return `${s}Z`;
  }
  let line = '';
  for (let k = 0; k < n; k++) line += `${k ? 'L' : 'M'}${x(from + k).toFixed(1)} ${y(a.el[from + k]).toFixed(1)}`;
  const ticks = [0, 30, 60, 90].map((ago) => t - ago).filter((i) => i >= from);
  return (
    <div className="bc-tele" ref={ref} style={{ height: H }}>
      <span className="bc-tele-title">텔레메트리 · 최근 90분 <em>회색 = 기준선 · 색 = 원인별 초과 · 흰 선 = 체감 지연</em></span>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`${id} 최근 90분 체감 지연 추이`}>
          {[THRESHOLDS.notice, THRESHOLDS.warning, THRESHOLDS.critical].filter((v) => v < vmax).map((v) => (
            <g key={v} className={`bc-th bc-th-${v}`}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} />
              <text x={padL - 5} y={y(v)} textAnchor="end" dominantBaseline="middle">{v}</text>
            </g>
          ))}
          {layers.map((l) => <path key={l.id} d={l.d} className={`bc-layer bc-c-${l.id}`} />)}
          <path key={id} d={line} className="bc-tele-line" />
          <circle cx={x(t)} cy={y(a.el[t])} r={4} className="bc-tele-head" />
          {ticks.map((i) => (
            <text key={i} x={x(i)} y={H - 4} textAnchor={i === t ? 'end' : 'middle'} className="bc-tele-x">{i === t ? '지금' : `−${t - i}분`}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
