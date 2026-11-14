/**
 * 운영 지표용 강건(robust) 통계 유틸.
 * 평균·표준편차 대신 중앙값·MAD를 쓰는 이유: 장애 구간 자체가 이상치라서
 * 평균 기반 기준선은 장애에 끌려가 장애를 덜 이상하게 보이게 만든다.
 */

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function quantile(values: ArrayLike<number>, q: number): number {
  const s = Float64Array.from(values as ArrayLike<number>).sort();
  return quantileSorted(s, q);
}

export function median(values: ArrayLike<number>): number {
  return quantile(values, 0.5);
}

/** 중앙값 절대 편차. 정규분포에서 σ ≈ 1.4826 × MAD */
export function mad(values: ArrayLike<number>, med = median(values)): number {
  const dev = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) dev[i] = Math.abs(values[i] - med);
  return median(dev);
}

export const MAD_TO_SIGMA = 1.4826;

/** 강건 z-score: (x − median) / (1.4826 × MAD). scaleFloor로 0 나눗셈·과민 반응 방지 */
export function robustZ(x: number, med: number, madValue: number, scaleFloor = 1e-6): number {
  const scale = Math.max(MAD_TO_SIGMA * madValue, scaleFloor);
  return (x - med) / scale;
}

/**
 * 가중 분위수 — 동접(유저 수)으로 가중한 p95 등.
 * "유저 95%가 이 값 이하의 지연을 겪는다"로 읽힌다.
 */
export function weightedQuantile(values: ArrayLike<number>, weights: ArrayLike<number>, q: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, weights[i]);
  if (total <= 0) return quantile(values, q);
  const target = q * total;
  let acc = 0;
  for (const i of idx) {
    acc += Math.max(0, weights[i]);
    if (acc >= target) return values[i];
  }
  return values[idx[n - 1]];
}

/** 지수가중이동평균. alpha가 클수록 최근 값에 민감 */
export function ewma(series: ArrayLike<number>, alpha: number): Float64Array {
  const out = new Float64Array(series.length);
  let s = series[0] ?? 0;
  for (let i = 0; i < series.length; i++) {
    s = i === 0 ? series[0] : alpha * series[i] + (1 - alpha) * s;
    out[i] = s;
  }
  return out;
}

export interface CusumResult {
  /** 누적합 S_t */
  s: Float64Array;
  /** 경보 시점 인덱스 목록 (S_t가 h를 처음 넘는 시점) */
  alarms: number[];
  /** 각 경보에 대응하는 변화 시작 추정 인덱스 (S가 마지막으로 0이던 직후) */
  onsets: number[];
}

/**
 * 단측(상승) CUSUM — 표준화된 입력(z)에 적용.
 * S_t = max(0, S_{t−1} + z_t − k), S_t > h 이면 경보. 경보 후 S는 0으로 리셋.
 * k=0.5, h=5 는 1σ 평균 이동을 ARL₀≈465 수준으로 잡는 고전적 설정.
 */
export function cusum(z: ArrayLike<number>, k = 0.5, h = 5): CusumResult {
  const s = new Float64Array(z.length);
  const alarms: number[] = [];
  const onsets: number[] = [];
  let acc = 0;
  let lastZero = -1;
  for (let i = 0; i < z.length; i++) {
    acc = Math.max(0, acc + z[i] - k);
    if (acc === 0) lastZero = i;
    s[i] = acc;
    if (acc > h) {
      alarms.push(i);
      onsets.push(lastZero + 1);
      acc = 0;
      lastZero = i;
    }
  }
  return { s, alarms, onsets };
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** 시드 고정 난수 (mulberry32) — 같은 시드면 항상 같은 가상 데이터 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
