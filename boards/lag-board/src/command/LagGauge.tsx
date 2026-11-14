import { TIERS, TIER_LABEL, tierOf, type Tier } from '../data/config';
import { RollingNumber } from '../components/RollingNumber';
import { TIER_ICON } from '../components/Badges';
import { fmtInt, signed } from '../lib/format';
import { useEscalation } from '../lib/useEscalation';
import { TIER_RANK } from '../lib/view';
import { CC_TIER } from './palette';

/**
 * 체감 지연 게이지 — 240° 호. 눈금은 선형이 아니라 등급 경계에 맞춘 구간 선형:
 * 0·100·150·250·500·800ms가 호의 0·25·40·60·85·100% → 운영자가 신경 쓰는 100~500ms 구간이 넓게 보인다.
 * 바깥 띠 = 등급 구간(항상 보이는 기준), 안쪽 호 = 현재 값(등급색 발광). 등급이 오를 때만 링이 한 번 퍼진다.
 */
const STOPS: [number, number][] = [[0, 0], [100, 0.25], [150, 0.4], [250, 0.6], [500, 0.85], [800, 1]];
export function gaugeFrac(ms: number) {
  if (ms <= 0) return 0;
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, y1] = STOPS[i];
    const [x0, y0] = STOPS[i - 1];
    if (ms <= x1) return y0 + ((ms - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

const CX = 130;
const CY = 124;
const R = 92;
const START = 150;
const SWEEP = 240;
const rad = (d: number) => (d * Math.PI) / 180;
const pt = (r: number, deg: number) => [CX + r * Math.cos(rad(deg)), CY + r * Math.sin(rad(deg))] as const;
function arc(r: number, f0: number, f1: number) {
  const a0 = START + SWEEP * f0;
  const a1 = START + SWEEP * f1;
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const LEN = R * rad(SWEEP);
const TIER_MAX: Record<Tier, number> = { smooth: 100, good: 150, notice: 250, warning: 500, critical: 800 };

export function LagGauge({ value, prev, scopeLabel }: { value: number; prev: number; scopeLabel: string }) {
  const tier = tierOf(value);
  const f = gaugeFrac(value);
  const pulse = useEscalation(TIER_RANK[tier]);
  const Icon = TIER_ICON[tier];
  return (
    <figure className={`cc-gauge cc-t-${tier}`} style={{ ['--tier' as string]: CC_TIER[tier] }}>
      <figcaption className="cc-eyebrow">{scopeLabel} 체감 지연 <em>유저 p95</em></figcaption>
      <div className="cc-gauge-dial">
        <svg viewBox="0 0 260 196" aria-hidden>
          {/* 등급 띠 */}
          {TIERS.map((tr) => (
            <path key={tr.id} d={arc(R + 15, gaugeFrac(tr.min) + 0.004, gaugeFrac(TIER_MAX[tr.id]) - 0.004)}
              className="cc-gauge-band" style={{ stroke: CC_TIER[tr.id], opacity: tr.id === tier ? 0.95 : 0.32 }} />
          ))}
          {/* 눈금 */}
          {[100, 150, 250, 500].map((v) => {
            const a = START + SWEEP * gaugeFrac(v);
            const [x0, y0] = pt(R + 9, a);
            const [x1, y1] = pt(R + 21, a);
            const [lx, ly] = pt(R + 31, a);
            return (
              <g key={v} className="cc-gauge-tick">
                <line x1={x0} y1={y0} x2={x1} y2={y1} />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{v}</text>
              </g>
            );
          })}
          <path d={arc(R, 0, 1)} className="cc-gauge-track" />
          <path d={arc(R, 0, 1)} className="cc-gauge-value" strokeDasharray={`${LEN} ${LEN}`} strokeDashoffset={LEN * (1 - f)} />
          <g className="cc-gauge-needle" style={{ transform: `rotate(${START + SWEEP * f}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
            <circle cx={CX + R} cy={CY} r={7} className="cc-gauge-head-glow" />
            <circle cx={CX + R} cy={CY} r={3.6} className="cc-gauge-head" />
          </g>
        </svg>
        <div className="cc-gauge-center">
          <span className="cc-gauge-num"><RollingNumber text={fmtInt(value)} /><small>ms</small></span>
          <span className={`cc-tier-tag cc-t-${tier}`}><Icon size={12} strokeWidth={2.6} aria-hidden />{TIER_LABEL[tier]}</span>
          <span className="cc-gauge-delta">1시간 전 대비 <b>{signed(value - prev, 'ms')}</b></span>
          {pulse > 0 && <span key={pulse} className="cc-gauge-pulse" aria-hidden />}
        </div>
      </div>
    </figure>
  );
}
