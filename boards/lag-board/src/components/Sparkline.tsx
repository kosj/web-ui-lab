/**
 * SVG 스파크라인 — 영역 워시 + 2px 선 + 끝점 강조. 임계선(선택)은 헤어라인.
 * 여러 개를 나란히 둘 때 비교 가능하도록 yMax를 고정할 수 있다.
 */
export function Sparkline({
  values, yMax, threshold, tone = 'neutral', height = 32, label,
}: {
  values: number[];
  yMax?: number;
  threshold?: number;
  tone?: 'neutral' | 'notice' | 'warning' | 'critical';
  height?: number;
  label: string;
}) {
  const w = 120;
  const h = height;
  const n = values.length;
  const max = Math.max(yMax ?? 0, ...values, 1) * 1.08;
  const x = (i: number) => (n <= 1 ? w : (i / (n - 1)) * w);
  const y = (v: number) => h - 2 - (Math.max(0, v) / max) * (h - 4);
  let d = '';
  values.forEach((v, i) => (d += `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`));
  const area = `${d}L${w},${h}L0,${h}Z`;
  const lastV = values[n - 1] ?? 0;
  return (
    <div className={`spark spark-${tone}`} style={{ height }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <path className="spark-area" d={area} />
        {threshold !== undefined && threshold < max && (
          <line className="spark-th" x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} vectorEffect="non-scaling-stroke" />
        )}
        <path className="spark-line" d={d} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* 끝점은 HTML로 — SVG를 늘려도 원이 찌그러지지 않게 */}
      <span className="spark-dot" style={{ top: `${(y(lastV) / h) * 100}%` }} />
    </div>
  );
}
