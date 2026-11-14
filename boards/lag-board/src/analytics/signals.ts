/**
 * 유저 체감 신호 분석 — 채팅 렉 제보 × TCP 재전송 × 체감 지연.
 *
 * 왜 이렇게 하나 (knowledge/user-signals.md)
 *  1. 원값끼리 상관을 보면 안 된다: 세 신호 모두 저녁 피크에 함께 오른다(공통 일주기) → 허위 상관.
 *     → 모두 "전일 동시간대 대비" 편차(z)로 바꾼 뒤 비교한다.
 *       재전송·EL: 강건 z (중앙값·MAD) / 제보(건수): 포아송 기대치 대비 Anscombe 잔차.
 *  2. 시차: 분 단위 교차상관(사전 백색화 포함)은 이 데이터에서 검정력이 없었다 — 재전송 급증이 하루 몇 번뿐이고
 *     장애 구간이 길어 AR(1) 계수가 0.99(사실상 차분)가 되면서 신호가 잡음에 묻힌다(v0.4 실험).
 *     → 드문 급증 사건에 맞는 사건 정렬 평균(superposed epoch / peri-event analysis)으로 바꿨다:
 *       서버별 재전송 급증 시작점을 0분에 맞춰 제보 z를 평균하고 95% 신뢰띠를 낸다. 시차 = 짝지어진 사건 간 지연의 중앙값.
 *  3. "제보가 오를 때 재전송도 급증한다"는 선형 상관이 아니라 '급증 사건의 동시 발생' 문제다
 *     → 사건 동시발생 분석(Event Coincidence Analysis, Donges et al. 2016)과 우연 기대치 대비 포아송 검정.
 *     전조(precursor): 제보 급증 중 재전송 급증이 먼저 있었던 비율 / 촉발(trigger): 재전송 급증 뒤 제보가 따라온 비율.
 *     둘이 비대칭이면 "재전송 급증은 거의 항상 제보를 부르지만, 제보가 전부 재전송 때문은 아니다".
 *  4. 효과 크기: 분절 포아송 회귀 log μ = log(채팅 유저) + a + b·max(0, ln(EL/T)) + c·재전송 초과(%p)
 *     → T: 제보가 꺾여 오르는 체감 지연, e^c: 체감 지연을 같게 놓고도 재전송 1%p당 제보 배수.
 *  5. 도배: 같은 문구 비율이 절반을 넘는 분은 도배 유저를 빼고 센다. 유저 단위 중복 제거는 생성 단계에서 적용됨.
 */
import { seasonalBaseline } from './attribution';
import { MAD_TO_SIGMA, median } from './stats';
import type { BoardModel } from './model';
import type { Evidence } from './incidents';
import { CATEGORY_LABEL, REPORT_CATEGORIES, type ReportCategory } from '../data/chat';
import type { RegionId } from '../data/config';

export interface SignalScope {
  region?: RegionId;
  serverId?: string;
}

export interface SignalSeries {
  ids: string[];
  /** 트래픽(동접) 가중 TCP 재전송률 % */
  retrans: Float32Array;
  retransBase: Float32Array;
  retransZ: Float32Array;
  /** 체감 지연: 권역·전체는 유저 가중 p95, 서버는 서버 EL */
  el: Float32Array;
  elBase: Float32Array;
  elZ: Float32Array;
  chatters: Float32Array;
  /** 도배 제외 제보 유저 수 */
  reports: Float32Array;
  /** 도배로 걸러낸 유저 수 */
  spamDropped: Float32Array;
  /** 기대 제보 수 (채팅 유저 × 전일 동시간대 제보율) */
  expected: Float32Array;
  /** 1만 채팅 유저당 분당 제보 */
  rate: Float32Array;
  expectedRate: Float32Array;
  /** 분 단위 Anscombe 잔차 (교차상관용) */
  reportZ1: Float32Array;
  /** 5분 합 Anscombe 잔차 (급증 판정용) */
  reportZ5: Float32Array;
  cat: Record<ReportCategory, Float32Array>;
}

const SPAM_IDENTICAL_SHARE = 0.5;

/** 포아송 Anscombe 잔차: 2(√(x+3/8) − √(λ+3/8)) — 건수가 적어도 정규에 가깝다 */
export function anscombe(x: number, lambda: number) {
  return 2 * (Math.sqrt(x + 0.375) - Math.sqrt(Math.max(0, lambda) + 0.375));
}

function robustZ(series: Float32Array, from: number, floor: number) {
  const b = seasonalBaseline(series, from);
  const z = new Float32Array(series.length);
  for (let t = from; t < series.length; t++) {
    if (!Number.isFinite(b.med[t])) continue;
    z[t] = (series[t] - b.med[t]) / Math.max(MAD_TO_SIGMA * b.mad[t], floor);
  }
  return { base: b.med, z };
}

/** 워밍업(전일) 구간 전체의 제보율 — 수축 기준값 (1만 명당) */
const priorCache = new WeakMap<BoardModel, number>();
function priorRate(m: BoardModel) {
  const hit = priorCache.get(m);
  if (hit !== undefined) return hit;
  let x = 0;
  let c = 0;
  for (const sv of m.ds.servers) {
    const ch = m.ds.chat[sv.id];
    for (let t = 0; t < m.viewFrom; t++) { x += ch.reporters[t]; c += ch.chatters[t]; }
  }
  const r = c > 0 ? (x / c) * 1e4 : 0;
  priorCache.set(m, r);
  return r;
}

/** 계절성 비율 기준선: Σ제보 / Σ채팅유저 (전일 동시간대 ±45분), prior 쪽으로 k 채팅유저·분만큼 수축 */
function seasonalRatio(num: ArrayLike<number>, den: ArrayLike<number>, from: number, prior: number, k: number) {
  const n = num.length;
  const out = new Float32Array(n);
  let cur = prior;
  for (let t = from; t < n; t++) {
    if ((t - from) % 5 === 0) {
      const c = t - 1440;
      let x = 0;
      let d = 0;
      for (let i = Math.max(0, c - 45); i <= Math.min(n - 1, c + 45); i++) { x += num[i]; d += den[i]; }
      cur = d + k > 0 ? ((x + (prior / 1e4) * k) / (d + k)) * 1e4 : prior;
    }
    out[t] = cur;
  }
  return out;
}

const cache = new WeakMap<BoardModel, Map<string, SignalSeries>>();

export function scopeIds(m: BoardModel, scope: SignalScope) {
  return m.ds.servers
    .filter((s) => (!scope.region || s.region === scope.region) && (!scope.serverId || s.id === scope.serverId))
    .map((s) => s.id);
}

export function getSignals(m: BoardModel, scope: SignalScope): SignalSeries {
  const key = `${scope.region ?? '*'}|${scope.serverId ?? '*'}`;
  let c = cache.get(m);
  if (!c) { c = new Map(); cache.set(m, c); }
  const hit = c.get(key);
  if (hit) return hit;
  const s = computeSignals(m, scope);
  c.set(key, s);
  return s;
}

function computeSignals(m: BoardModel, scope: SignalScope): SignalSeries {
  const n = m.ds.minutes;
  const from = Math.max(60, m.viewFrom - 120);
  const ids = scopeIds(m, scope);
  const mk = () => new Float32Array(n);
  const retrans = mk();
  const chatters = mk();
  const reports = mk();
  const spamDropped = mk();
  const cat = Object.fromEntries(REPORT_CATEGORIES.map((k) => [k, mk()])) as Record<ReportCategory, Float32Array>;
  for (let t = 0; t < n; t++) {
    let w = 0;
    let r = 0;
    for (const id of ids) {
      const mx = m.ds.metrics[id];
      const ch = m.ds.chat[id];
      w += mx.ccu[t];
      r += mx.ccu[t] * mx.retrans[t];
      chatters[t] += ch.chatters[t];
      // 도배 판정: 같은 문구 메시지가 그 분 제보 메시지의 절반을 넘으면 도배 유저를 뺀다
      const total = ch.msgs[t] + ch.spamMsgs[t];
      const spammy = total > 0 && ch.spamMsgs[t] / total > SPAM_IDENTICAL_SHARE;
      reports[t] += ch.reporters[t] + (spammy ? 0 : ch.spamUsers[t]);
      spamDropped[t] += spammy ? ch.spamUsers[t] : 0;
      for (const k of REPORT_CATEGORIES) cat[k][t] += ch.cat[k][t];
    }
    retrans[t] = w > 0 ? r / w : 0;
  }
  const el = scope.serverId
    ? m.an[scope.serverId].el
    : scope.region ? m.regions[scope.region].p95 : m.global.p95;

  const rate = mk();
  for (let t = 0; t < n; t++) rate[t] = chatters[t] > 0 ? (reports[t] / chatters[t]) * 1e4 : 0;
  // 기대 제보율: 전일 동시간대 ±45분의 "합의 비" (분당 비율의 중앙값은 건수가 적으면 0이 된다)
  // + 경험적 베이즈 수축: 건수가 적은 서버는 전체 기준 제보율 쪽으로 당긴다
  const rateB = seasonalRatio(reports, chatters, from, priorRate(m), 2000);
  const expected = mk();
  const expectedRate = mk();
  const reportZ1 = mk();
  const reportZ5 = mk();
  for (let t = from; t < n; t++) {
    const br = rateB[t];
    expectedRate[t] = br;
    expected[t] = (chatters[t] * br) / 1e4;
    reportZ1[t] = anscombe(reports[t], expected[t]);
    let x5 = 0;
    let l5 = 0;
    for (let k = 0; k < 5 && t - k >= 0; k++) { x5 += reports[t - k]; l5 += expected[t - k]; }
    reportZ5[t] = anscombe(x5, l5);
  }
  const rz = robustZ(retrans, from, 0.02);
  const ez = robustZ(el instanceof Float32Array ? el : Float32Array.from(el), from, 3);
  return {
    ids, retrans, retransBase: rz.base, retransZ: rz.z, el: el as Float32Array, elBase: ez.base, elZ: ez.z,
    chatters, reports, spamDropped, expected, rate, expectedRate, reportZ1, reportZ5, cat,
  };
}

// ───────────────────────── 사건 정렬 평균 (peri-event) ─────────────────────────

export interface Band { mean: number; lo: number; hi: number }

export interface PeriEventResult {
  offsets: number[];
  retrans: Band[];
  reports: Band[];
  el: Band[];
  events: number;
  /** 짝지어진 사건의 지연(제보 급증 시작 − 재전송 급증 시작, 분) */
  lags: number[];
  lagMedian: number | null;
  lagQ1: number | null;
  lagQ3: number | null;
  /** 사건별 [+2,+15]분 평균 − [−15,−1]분 평균의 평균과 95% 신뢰구간 (제보 z) */
  effect: Band;
  /** 제보 평균이 사건 전 수준보다 유의하게(95% 하한 기준) 오르기 시작한 분 */
  riseLag: number | null;
}

const winsor = (v: number) => Math.max(-5, Math.min(20, v));

function band(vals: number[]): Band {
  const k = vals.length;
  if (!k) return { mean: NaN, lo: NaN, hi: NaN };
  const mean = vals.reduce((a, b) => a + b, 0) / k;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, k - 1));
  const h = (1.96 * sd) / Math.sqrt(k);
  return { mean, lo: mean - h, hi: mean + h };
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 재전송 급증 시작점(서버별)을 0분에 맞춰 재전송·EL·제보 z를 평균한다 */
export function periEvent(m: BoardModel, scope: SignalScope, from: number, to: number, pre = 20, post = 40): PeriEventResult {
  const offsets = Array.from({ length: pre + post + 1 }, (_, i) => i - pre);
  const cols = { retrans: offsets.map(() => [] as number[]), reports: offsets.map(() => [] as number[]), el: offsets.map(() => [] as number[]) };
  const lags: number[] = [];
  const effects: number[] = [];
  let events = 0;
  for (const id of scopeIds(m, scope)) {
    const s = getSignals(m, { serverId: id });
    const ret = eventOnsets(s.retransZ, from, to, 4, 3);
    const rep = eventOnsets(s.reportZ5, from, to, 4, 3);
    for (const e of ret) {
      if (e - pre < 0 || e + post >= m.ds.minutes) continue;
      events++;
      offsets.forEach((k, i) => {
        cols.retrans[i].push(winsor(s.retransZ[e + k]));
        cols.reports[i].push(winsor(s.reportZ1[e + k]));
        cols.el[i].push(winsor(s.elZ[e + k]));
      });
      let a = 0;
      let b = 0;
      for (let k = -15; k <= -1; k++) a += winsor(s.reportZ1[e + k]);
      for (let k = 2; k <= 15; k++) b += winsor(s.reportZ1[e + k]);
      effects.push(b / 14 - a / 15);
      // 제보 급증 시작은 5분 합 기준이라 약 2분 늦게 잡힌다 → 5분 창의 가운데로 보정
      const hit = rep.find((tr) => tr >= e - PRE.after && tr <= e + PRE.before + 5);
      if (hit !== undefined) lags.push(hit - 2 - e);
    }
  }
  const sorted = [...lags].sort((a, b) => a - b);
  const reportsBand = cols.reports.map(band);
  const preLevel = reportsBand.slice(pre - 15, pre).reduce((a, b) => a + b.mean, 0) / 15;
  const riseIdx = events >= 3 ? reportsBand.findIndex((b, i) => offsets[i] >= 0 && b.lo > preLevel) : -1;
  return {
    riseLag: riseIdx >= 0 ? offsets[riseIdx] : null,
    offsets,
    retrans: cols.retrans.map(band),
    reports: reportsBand,
    el: cols.el.map(band),
    events,
    lags,
    lagMedian: quantile(sorted, 0.5),
    lagQ1: quantile(sorted, 0.25),
    lagQ3: quantile(sorted, 0.75),
    effect: band(effects),
  };
}

// ───────────────────────── 사건 동시발생 분석 ─────────────────────────

/** z가 thr 이상으로 minRun분 이상 이어진 구간의 시작점들 (gap분 이내 재발은 같은 사건) */
export function eventOnsets(z: ArrayLike<number>, from: number, to: number, thr = 4, minRun = 3, gap = 15) {
  const out: number[] = [];
  let run = 0;
  let lastEnd = -Infinity;
  for (let t = from; t <= to; t++) {
    if (z[t] >= thr) {
      run++;
      if (run === minRun) {
        const start = t - minRun + 1;
        if (start - lastEnd > gap) out.push(start);
      }
      if (run >= minRun) lastEnd = t;
    } else run = 0;
  }
  return out;
}

export interface CoincidenceResult {
  reportEvents: number;
  retransEvents: number;
  /** 제보 급증 중 앞(−10분~+2분)에 재전송 급증이 있었던 수 */
  precursorHits: number;
  precursorExpected: number;
  precursorP: number;
  /** 재전송 급증 중 뒤(−2분~+10분)에 제보 급증이 따라온 수 */
  triggerHits: number;
  triggerExpected: number;
  triggerP: number;
  /** 서버별 사건 목록 (표시용) */
  pairs: { serverId: string; report: number; retrans: number | null }[];
}

/** 포아송 꼬리확률 P(K ≥ k | 평균 mu) */
export function poissonTail(k: number, mu: number) {
  if (k <= 0) return 1;
  let term = Math.exp(-mu);
  let cdf = term;
  for (let i = 1; i < k; i++) { term *= mu / i; cdf += term; }
  return Math.max(0, 1 - cdf);
}

const PRE = { before: 10, after: 2 };

/**
 * 서버 단위로 사건을 찾고(급증은 서버에서 먼저 보인다) 범위 안의 서버를 합산한다.
 * 우연 기대치: 서버 s에서 재전송 사건 N_A개가 무작위로 흩어졌을 때 길이 W 창에 하나라도 걸릴 확률
 *   p_s = 1 − (1 − W/T)^{N_A}  →  기대 동시발생 = Σ p_s (제보 사건마다), 검정은 포아송 근사.
 */
export function coincidence(m: BoardModel, scope: SignalScope, from: number, to: number): CoincidenceResult {
  const ids = scopeIds(m, scope);
  const T = to - from + 1;
  const W = PRE.before + PRE.after + 1;
  const res: CoincidenceResult = {
    reportEvents: 0, retransEvents: 0, precursorHits: 0, precursorExpected: 0, precursorP: 1,
    triggerHits: 0, triggerExpected: 0, triggerP: 1, pairs: [],
  };
  for (const id of ids) {
    const s = getSignals(m, { serverId: id });
    const rep = eventOnsets(s.reportZ5, from, to, 4, 3);
    const ret = eventOnsets(s.retransZ, from, to, 4, 3);
    res.reportEvents += rep.length;
    res.retransEvents += ret.length;
    const pA = 1 - (1 - W / T) ** ret.length;
    const pB = 1 - (1 - W / T) ** rep.length;
    for (const tr of rep) {
      const hit = ret.find((ta) => ta >= tr - PRE.before && ta <= tr + PRE.after);
      if (hit !== undefined) res.precursorHits++;
      res.precursorExpected += pA;
      res.pairs.push({ serverId: id, report: tr, retrans: hit ?? null });
    }
    for (const ta of ret) {
      if (rep.some((tr) => tr >= ta - PRE.after && tr <= ta + PRE.before)) res.triggerHits++;
      res.triggerExpected += pB;
    }
  }
  res.precursorP = poissonTail(res.precursorHits, res.precursorExpected);
  res.triggerP = poissonTail(res.triggerHits, res.triggerExpected);
  return res;
}

// ───────────────────────── 용량–반응 ─────────────────────────

export interface DoseBin { lo: number; hi: number; x: number; exposure: number; count: number; rate: number; ciLo: number; ciHi: number }

export interface DoseResult {
  lag: number;
  byRetrans: DoseBin[];
  byEl: DoseBin[];
  fit: { T: number; Tlo: number; Thi: number; a: number; b: number; c: number; d: number; perRetransPct: number; phi: number };
}

function poissonCi(count: number, exposure: number) {
  // 제곱근 변환 근사 — 건수가 적을 때도 하한이 음수가 되지 않는다
  const lo = Math.max(0, Math.sqrt(count) - 0.98) ** 2;
  const hi = (Math.sqrt(count + 1) + 0.98) ** 2;
  return [(lo / exposure) * 1e4, (hi / exposure) * 1e4];
}

function binBy(cells: { v: number; e: number; y: number }[], edges: number[]): DoseBin[] {
  const out: DoseBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const inBin = cells.filter((c) => c.v >= edges[i] && c.v < edges[i + 1]);
    const e = inBin.reduce((a, c) => a + c.e, 0);
    const y = inBin.reduce((a, c) => a + c.y, 0);
    if (e < 2000) continue; // 노출이 너무 적은 구간은 표시하지 않는다 (채팅 유저·분 2천 미만)
    const xm = inBin.reduce((a, c) => a + c.v * c.e, 0) / e;
    const [lo, hi] = poissonCi(y, e);
    out.push({ lo: edges[i], hi: edges[i + 1], x: xm, exposure: e, count: y, rate: (y / e) * 1e4, ciLo: lo, ciHi: hi });
  }
  return out;
}

/** 포아송 회귀 IRLS — X는 [1, x1, x2] 열, offset = ln(노출) */
function poissonIrls(X: number[][], y: number[], offset: number[], iters = 25) {
  const p = X[0].length;
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(Math.max(1e-9, y.reduce((a, b) => a + b, 0) / offset.reduce((a, o) => a + Math.exp(o), 0)));
  for (let it = 0; it < iters; it++) {
    const XtWX = Array.from({ length: p }, () => new Array(p).fill(0));
    const XtWz = new Array(p).fill(0);
    for (let i = 0; i < y.length; i++) {
      const eta = offset[i] + X[i].reduce((a, xv, j) => a + xv * beta[j], 0);
      const mu = Math.exp(Math.min(30, eta));
      const z = eta - offset[i] + (y[i] - mu) / mu;
      for (let j = 0; j < p; j++) {
        XtWz[j] += X[i][j] * mu * z;
        for (let k = 0; k < p; k++) XtWX[j][k] += X[i][j] * mu * X[i][k];
      }
    }
    const next = solve(XtWX, XtWz);
    if (!next) break;
    const diff = Math.max(...next.map((v, j) => Math.abs(v - beta[j])));
    beta = next;
    if (diff < 1e-7) break;
  }
  let dev = 0;
  let pearson = 0;
  for (let i = 0; i < y.length; i++) {
    const mu = Math.exp(Math.min(30, offset[i] + X[i].reduce((a, xv, j) => a + xv * beta[j], 0)));
    dev += 2 * ((y[i] > 0 ? y[i] * Math.log(y[i] / mu) : 0) - (y[i] - mu));
    pearson += (y[i] - mu) ** 2 / mu;
  }
  // 준포아송 산포 φ = 피어슨 χ² / (n − p) — 실제 제보는 포아송보다 퍼져 있어 신뢰구간을 넓혀야 한다
  const phi = Math.max(1, pearson / Math.max(1, y.length - p));
  return { beta, dev, phi };
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

export const EL_EDGES_DOSE = [50, 70, 90, 110, 130, 150, 175, 200, 250, 300, 400, 550, 800];
export const RETRANS_EDGES_DOSE = [0, 0.15, 0.25, 0.4, 0.7, 1.2, 2, 3.5, 6, 100];

export function doseResponse(m: BoardModel, scope: SignalScope, from: number, to: number, lag: number): DoseResult {
  const ids = scopeIds(m, scope);
  const L = Math.max(0, Math.min(10, lag));
  // 서버·분 셀: 제보는 L분 뒤 값과 짝지운다 (체감 → 제보 지연 보정)
  const cells: { el: number; rx: number; fx: number; r: number; e: number; y: number }[] = [];
  for (const id of ids) {
    const s = getSignals(m, { serverId: id });
    const a = m.an[id];
    for (let t = from; t <= to - L; t++) {
      const e = s.chatters[t + L];
      if (e <= 0 || s.spamDropped[t + L] > 0) continue;
      // 통제 변수: 재전송 초과(%p), 클라 프레임 성분 초과(10ms 단위) — 프레임 끊김 불만이 EL 관계를 오염시키지 않게
      const fx = Math.max(0, (a.cli[t] - (a.baselines.cli.med[t] || a.cli[t])) / 10);
      cells.push({ el: s.el[t], r: s.retrans[t], rx: Math.max(0, s.retrans[t] - (s.retransBase[t] || 0)), fx, e, y: s.reports[t + L] });
    }
  }
  const byEl = binBy(cells.map((c) => ({ v: c.el, e: c.e, y: c.y })), EL_EDGES_DOSE);
  const byRetrans = binBy(cells.map((c) => ({ v: c.r, e: c.e, y: c.y })), RETRANS_EDGES_DOSE);

  // 회귀용 3차원 집계: ln EL(0.05) × 재전송 초과(0.25%p) × 프레임 초과(0.5)
  const agg = new Map<string, { lnEl: number; rx: number; fx: number; e: number; y: number }>();
  for (const c of cells) {
    const a = Math.round(Math.log(c.el) / 0.05) * 0.05;
    const b = Math.min(8, Math.round(c.rx / 0.25) * 0.25);
    const f = Math.min(12, Math.round(c.fx / 0.5) * 0.5);
    const k = `${a}|${b}|${f}`;
    const g = agg.get(k) ?? { lnEl: a, rx: b, fx: f, e: 0, y: 0 };
    g.e += c.e;
    g.y += c.y;
    agg.set(k, g);
  }
  const rows = [...agg.values()].filter((g) => g.e > 0);
  const offset = rows.map((g) => Math.log(g.e));
  const y = rows.map((g) => g.y);
  let best = { T: 175, dev: Infinity, beta: [0, 0, 0, 0], phi: 1 };
  const profile: { T: number; dev: number }[] = [];
  for (let T = 100; T <= 350; T += 5) {
    const lnT = Math.log(T);
    const X = rows.map((g) => [1, Math.max(0, g.lnEl - lnT), g.rx, g.fx]);
    const f = poissonIrls(X, y, offset);
    profile.push({ T, dev: f.dev });
    if (f.dev < best.dev) best = { T, dev: f.dev, beta: f.beta, phi: f.phi };
  }
  // 프로파일 우도 95% 구간 (준포아송): 이탈도 증가 < 3.84 × φ
  const ok = profile.filter((p) => p.dev - best.dev < 3.84 * best.phi).map((p) => p.T);
  const [a, b, c, d] = best.beta;
  return {
    lag: L, byEl, byRetrans,
    fit: { T: best.T, Tlo: Math.min(...ok), Thi: Math.max(...ok), a, b, c, d, perRetransPct: Math.exp(c), phi: best.phi },
  };
}

/** 적합 곡선: EL에 대한 기대 제보율(1만 명당), 재전송 초과 0 기준 */
export function fittedRate(fit: DoseResult['fit'], el: number) {
  return Math.exp(fit.a + fit.b * Math.max(0, Math.log(el / fit.T))) * 1e4;
}

// ───────────────────────── 측정 사각지대 · 장애 근거 ─────────────────────────

export interface BlindSpot {
  id: string;
  region: RegionId;
  serverIds: string[];
  onsetIdx: number;
  endIdx: number | null;
  peakX: number;
  topCategory: ReportCategory;
  topShare: number;
  reports: number;
}

/** 제보만 급증하고 지표(EL 초과·재전송)는 평소인 구간 → "측정 사각지대" */
export function detectBlindSpots(m: BoardModel, from: number): BlindSpot[] {
  const n = m.ds.minutes;
  const found: BlindSpot[] = [];
  const perServer: { id: string; region: RegionId; s: number; e: number }[] = [];
  for (const sv of m.ds.servers) {
    const s = getSignals(m, { serverId: sv.id });
    const ex = m.an[sv.id].excess;
    // 제보는 체감 후 최대 12분까지 이어지므로, 직전 15분 동안 지표가 계속 평소였어야 "지표에 안 보이는 렉"이다
    const calm = new Uint8Array(n);
    for (let t = 0; t < n; t++) calm[t] = ex.infra[t] + ex.network[t] + ex.server[t] + ex.client[t] < 20 && s.retransZ[t] < 2 ? 1 : 0;
    const calmFor = (t: number) => { for (let k = 0; k <= 15; k++) if (t - k >= 0 && !calm[t - k]) return false; return true; };
    // 이 서버가 포함된 장애의 앞뒤 15분은 제외 (장애의 선행·후행 제보)
    const near = (t: number) => m.incidents.some((i) => i.serverIds.includes(sv.id) && t >= i.onsetIdx - 15 && t <= (i.endIdx ?? n) + 15);
    const active = (t: number) => s.reportZ5[t] >= 4 && s.spamDropped[t] === 0 && calmFor(t) && !near(t);
    let t = from;
    while (t < n) {
      if (!active(t)) { t++; continue; }
      const st = t;
      let last = t;
      let gap = 0;
      let cnt = 0;
      while (t < n && gap <= 5) {
        if (active(t)) { last = t; gap = 0; cnt++; } else gap++;
        t++;
      }
      if (cnt >= 5) perServer.push({ id: sv.id, region: sv.region, s: st, e: last });
    }
  }
  // 같은 권역에서 겹치는 구간은 하나로
  perServer.sort((a, b) => a.s - b.s);
  for (const p of perServer) {
    const g = found.find((f) => f.region === p.region && p.s <= (f.endIdx ?? n) + 5 && p.e >= f.onsetIdx - 5);
    if (g) {
      g.serverIds.push(p.id);
      g.onsetIdx = Math.min(g.onsetIdx, p.s);
      g.endIdx = Math.max(g.endIdx ?? 0, p.e + 1);
    } else {
      found.push({ id: '', region: p.region, serverIds: [p.id], onsetIdx: p.s, endIdx: p.e + 1, peakX: 0, topCategory: 'generic', topShare: 0, reports: 0 });
    }
  }
  found.forEach((f, i) => {
    f.id = `VOC-${String(i + 1).padStart(3, '0')}`;
    if ((f.endIdx ?? 0) >= n - 2) f.endIdx = null;
    const end = f.endIdx ?? n;
    let x = 0;
    let l = 0;
    const cats = Object.fromEntries(REPORT_CATEGORIES.map((k) => [k, 0])) as Record<ReportCategory, number>;
    for (const id of f.serverIds) {
      const s = getSignals(m, { serverId: id });
      for (let t = f.onsetIdx; t < end; t++) {
        x += s.reports[t];
        l += s.expected[t];
        for (const k of REPORT_CATEGORIES) cats[k] += s.cat[k][t];
      }
    }
    f.reports = x;
    f.peakX = l > 0 ? x / l : 0;
    const top = REPORT_CATEGORIES.filter((k) => k !== 'generic').sort((a, b) => cats[b] - cats[a])[0];
    f.topCategory = top;
    f.topShare = x > 0 ? cats[top] / x : 0;
  });
  return found;
}

export interface VoiceEvidence {
  /** 재전송이 유의하게 늘었는가 (강건 z ≥ 4) */
  retransUp: boolean;
  reportX: number;
  lagMin: number | null;
  retransBefore: number;
  retransDuring: number;
  rtoDuring: number;
  topCategory: ReportCategory;
  topShare: number;
}

const fmt1 = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const fmt2 = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/** 판정된 장애마다 "유저 제보"와 "TCP 재전송" 근거를 붙인다 */
export function attachVoice(m: BoardModel) {
  for (const inc of m.incidents) {
    const end = (inc.endIdx ?? m.last + 1) - 1;
    let x = 0;
    let l = 0;
    const cats = Object.fromEntries(REPORT_CATEGORIES.map((k) => [k, 0])) as Record<ReportCategory, number>;
    const sigs = inc.serverIds.map((id) => getSignals(m, { serverId: id }));
    for (const s of sigs) {
      for (let t = inc.onsetIdx; t <= end; t++) {
        x += s.reports[t];
        l += s.expected[t];
        for (const k of REPORT_CATEGORIES) cats[k] += s.cat[k][t];
      }
    }
    // 제보 급증 시각: 구성 서버 합산 5분 Anscombe 잔차가 3을 처음 넘는 분 (장애 기간 전체에서)
    let lagMin: number | null = null;
    for (let t = inc.onsetIdx; t <= end; t++) {
      let x5 = 0;
      let l5 = 0;
      for (const s of sigs) for (let k = 0; k < 5; k++) { x5 += s.reports[t - k]; l5 += s.expected[t - k]; }
      if (anscombe(x5, l5) >= 3) { lagMin = t - inc.onsetIdx; break; }
    }
    const during = (pick: (s: SignalSeries, t: number) => number) =>
      median(sigs.flatMap((s) => Array.from({ length: end - inc.onsetIdx + 1 }, (_, i) => pick(s, inc.onsetIdx + i))));
    // 통신사 범위 장애는 그 통신사 경로의 재전송으로 본다 (서버 평균은 다른 통신사에 희석된다)
    const ispId = inc.scopeType === 'isp' && inc.region ? inc.isps?.[0]?.id : undefined;
    const path = ispId && inc.region ? m.ds.isp[inc.region][ispId] : null;
    let retransBefore: number;
    let retransDuring: number;
    let rtoDuring: number;
    let retransZ: number;
    if (path) {
      const b = seasonalBaseline(path.retrans, Math.max(60, m.viewFrom - 120));
      retransBefore = b.med[inc.onsetIdx];
      retransDuring = median(Array.from({ length: end - inc.onsetIdx + 1 }, (_, i) => path.retrans[inc.onsetIdx + i]));
      rtoDuring = path.rtoShare[Math.min(end, inc.peakIdx)];
      retransZ = (retransDuring - retransBefore) / Math.max(MAD_TO_SIGMA * b.mad[inc.onsetIdx], 0.02);
    } else {
      retransBefore = median(sigs.map((s) => s.retransBase[inc.onsetIdx] || 0));
      retransDuring = during((s, t) => s.retrans[t]);
      rtoDuring = median(inc.serverIds.map((id) => m.ds.metrics[id].rtoShare[Math.min(end, inc.peakIdx)]));
      retransZ = during((s, t) => s.retransZ[t]);
    }
    const top = REPORT_CATEGORIES.filter((k) => k !== 'generic').sort((a, b) => cats[b] - cats[a])[0];
    const v: VoiceEvidence = {
      retransUp: retransZ >= 4,
      reportX: l > 0 ? x / l : 0, lagMin, retransBefore, retransDuring, rtoDuring,
      topCategory: top, topShare: x > 0 ? cats[top] / x : 0,
    };
    inc.voice = v;
    const ev: Evidence[] = [];
    const lagText = lagMin === null ? '급증 없음' : `시작 ${lagMin}분 뒤 급증`;
    ev.push({ kind: 'voice', text: `유저 제보 평소의 ${fmt1(v.reportX)}배 · ${lagText} · 주요 표현 '${CATEGORY_LABEL[top]}' ${Math.round(v.topShare * 100)}%` });
    // 판정: 재전송 강건 z ≥ 4 (전일 동시간대 대비)
    if (retransZ >= 4) {
      const who = path ? `${inc.isps![0].name} 경로 ` : '';
      ev.push({ kind: 'signal', text: `${who}TCP 재전송 ${fmt2(retransBefore)}% → ${fmt2(retransDuring)}% (RTO ${Math.round(rtoDuring * 100)}%) — 손실이 HOL 블로킹으로 체감됨` });
    } else {
      ev.push({ kind: 'exclude', text: `TCP 재전송 평소 수준 (${fmt2(retransBefore)}% → ${fmt2(retransDuring)}%) — 네트워크 손실 아님` });
    }
    inc.evidence.push(...ev);
  }
}

export { CATEGORY_LABEL };
