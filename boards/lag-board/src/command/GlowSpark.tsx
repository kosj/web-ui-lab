import { useId } from 'react';

/** 발광 스파크라인 — 값 배열을 면+선으로. 마지막 점에 현재값 표식. 장식 없는 SVG 하나 */
export function GlowSpark({ values, color, threshold, max, height = 30, label }: {
  values: number[]; color: string; threshold?: number; max?: number; height?: number; label: string;
}) {
  const id = useId().replace(/:/g, '');
  const W = 120;
  const H = height;
  const lo = Math.min(0, ...values);
  const hi = Math.max(max ?? 0, threshold ? threshold * 1.15 : 0, ...values) || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 5);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1] ?? 0;
  return (
    <svg className="cc-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {threshold !== undefined && <line x1="0" x2={W} y1={y(threshold)} y2={y(threshold)} className="cc-spark-th" />}
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="cc-spark-line" />
      <circle cx={W} cy={y(last)} r="2.2" fill={color} className="cc-spark-dot" />
    </svg>
  );
}
