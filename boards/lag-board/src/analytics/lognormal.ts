/**
 * 로그정규 분포 유틸 — 네트워크 지연은 오른쪽 꼬리가 긴 분포라 로그정규로 근사한다.
 * 통신사별 (p50, p95)만 알면 분포 전체를 복원할 수 있고, 여러 통신사·서버를 섞은
 * 혼합 분포의 분위수나 구간 비율을 해석적으로 계산할 수 있다.
 */

const Z95 = 1.6448536269514722;

/** 표준정규 CDF — Abramowitz & Stegun 7.1.26 (최대 오차 1.5e-7) */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
    Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface LogNormal {
  /** ln(중앙값) */
  mu: number;
  sigma: number;
  /** 고정 지연(지터·손실·서버·클라 성분) — 분포 전체를 오른쪽으로 민다 */
  shift: number;
  weight: number;
}

export function fromP50P95(p50: number, p95: number, shift = 0, weight = 1): LogNormal {
  const a = Math.max(0.5, p50);
  const b = Math.max(a * 1.05, p95);
  return { mu: Math.log(a), sigma: Math.log(b / a) / Z95, shift, weight };
}

export function cdf(d: LogNormal, x: number): number {
  const v = x - d.shift;
  if (v <= 0) return 0;
  return normCdf((Math.log(v) - d.mu) / d.sigma);
}

export function mixtureCdf(ds: LogNormal[], x: number): number {
  let acc = 0;
  let w = 0;
  for (const d of ds) {
    if (d.weight <= 0) continue;
    acc += d.weight * cdf(d, x);
    w += d.weight;
  }
  return w > 0 ? acc / w : 0;
}

/** 혼합 분포의 분위수 — 로그 공간 이분 탐색 */
export function mixtureQuantile(ds: LogNormal[], q: number, iters = 16): number {
  let lo = Infinity;
  let hi = 0;
  for (const d of ds) {
    if (d.weight <= 0) continue;
    lo = Math.min(lo, d.shift + Math.exp(d.mu - 4 * d.sigma));
    hi = Math.max(hi, d.shift + Math.exp(d.mu + 4 * d.sigma));
  }
  if (!Number.isFinite(lo)) return NaN;
  let a = Math.log(Math.max(lo, 0.1));
  let b = Math.log(hi);
  for (let i = 0; i < iters; i++) {
    const mid = (a + b) / 2;
    if (mixtureCdf(ds, Math.exp(mid)) < q) a = mid;
    else b = mid;
  }
  return Math.exp((a + b) / 2);
}
