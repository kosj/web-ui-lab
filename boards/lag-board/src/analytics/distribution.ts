/**
 * 유저 단위 체감 지연 분포 — 로그 구간별 유저 비율.
 *
 * p95 한 줄은 "누가" 느린지 숨긴다. 일부 통신사나 클라 버전만 느리면 분포가 두 갈래(이봉)로
 * 갈라지는데, 이 모양 자체가 원인 단서다. 유저 1명의 체감 지연을 다음처럼 근사한다.
 *
 *   유저 EL = RTT(통신사 경로 로그정규 분포) + 1.5×지터 + 50×손실 + 서버 성분 + 클라 성분(버전별)
 *
 * 혼합 성분: 서버 × 통신사 × 클라 버전. 각 성분 가중치 = 서버 동접 × 통신사 비중 × 버전 비중.
 * 구간 비율은 로그정규 CDF로 해석적으로 계산한다(표본 추출 없음 → 매끈하고 재현 가능).
 */
import { cdf, fromP50P95 } from './lognormal';
import { clientComponent, EL_PARAMS } from './latency';
import type { BoardModel } from './model';
import { REGION_ISPS, type RegionId } from '../data/config';

/** 구간 경계(ms). 100·150·250·500 등급 임계값이 경계와 일치하도록 잡았다 */
export const EL_EDGES = [30, 40, 55, 75, 100, 125, 150, 200, 250, 350, 500, 700, 1000, 1500];
export const AXIS_MIN = 20;
export const AXIS_MAX = 2000;
export const BUCKET_LO = [AXIS_MIN, ...EL_EDGES];
export const BUCKET_HI = [...EL_EDGES, AXIS_MAX];

/** 구간의 로그 폭 — 색은 비율이 아니라 밀도(비율 ÷ 로그 폭)로 칠해야 좁은 구간이 흐려 보이지 않는다 */
export const LOG_W = BUCKET_LO.map((lo, i) => Math.log10(BUCKET_HI[i]) - Math.log10(lo));

/**
 * 두 갈래(이봉) 분포 감지: 밀도 봉우리 두 개가 각각 유저 8% 이상을 담고,
 * 사이 골짜기가 작은 봉우리의 60% 아래로 꺼지며, 느린 쪽 봉우리가 150ms 이상(렉 구간)일 때
 * "일부 집단만 렉"으로 본다. 전체 범위는 권역마다 기본 지연이 달라 원래 여러 갈래라서 렉 구간 조건이 필요하다.
 */
export function bimodal(shares: ArrayLike<number>) {
  const d = Array.from(shares, (s, i) => s / LOG_W[i]);
  const peaks: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] >= (d[i - 1] ?? 0) && d[i] > (d[i + 1] ?? 0)) peaks.push(i);
  }
  const mass = (p: number) => (shares[p - 1] ?? 0) + shares[p] + (shares[p + 1] ?? 0);
  const big = peaks.filter((p) => mass(p) >= 0.08);
  for (let a = 0; a < big.length; a++) {
    for (let b = a + 1; b < big.length; b++) {
      const valley = Math.min(...d.slice(big[a] + 1, big[b]));
      if (big[b] - big[a] >= 2 && BUCKET_LO[big[b]] >= 150 && valley < 0.6 * Math.min(d[big[a]], d[big[b]])) {
        return { lo: big[a], hi: big[b] };
      }
    }
  }
  return null;
}

export interface DistScope {
  region?: RegionId;
  isp?: string;
  serverId?: string;
}

export interface Distribution {
  /** 열(시간 구간)별 [시작, 끝] 분 인덱스 */
  starts: number[];
  ends: number[];
  /** shares[col][bucket] — 열마다 합이 1 */
  shares: Float32Array[];
  users: number[];
  p50: number[];
  p95: number[];
  /** 150ms 이상 비율 */
  over150: number[];
  maxShare: number;
}

/** 분 t에서 범위 내 유저 EL의 경계별 누적분포 (EL_EDGES 길이) + 총 유저 수 */
export function cdfAt(m: BoardModel, scope: DistScope, t: number): { cdf: Float64Array; users: number } {
  const acc = new Float64Array(EL_EDGES.length);
  let total = 0;
  const servers = m.ds.servers.filter(
    (s) => (!scope.region || s.region === scope.region) && (!scope.serverId || s.id === scope.serverId),
  );
  for (const s of servers) {
    const mx = m.ds.metrics[s.id];
    const ccu = mx.ccu[t];
    if (ccu <= 0) continue;
    const srv = m.an[s.id].srv[t];
    const ns = mx.newShare[t];
    const versions: [number, number][] = [[1 - ns, mx.frameOld[t]]];
    if (ns > 0 && Number.isFinite(mx.frameNew[t])) versions.push([ns, mx.frameNew[t]]);
    const defs = REGION_ISPS[s.region];
    defs.forEach((d, i) => {
      if (scope.isp && d.id !== scope.isp) return;
      const p = m.ds.isp[s.region][d.id];
      const wIsp = ccu * m.ds.ispShare[s.id][i];
      const netShift = EL_PARAMS.jitterWeight * p.jitter[t] + EL_PARAMS.lossMsPerPct * p.loss[t];
      for (const [vs, frame] of versions) {
        const w = wIsp * vs;
        if (w <= 0) continue;
        const dist = fromP50P95(p.rttP50[t], p.rttP95[t], netShift + srv + clientComponent(frame), w);
        for (let e = 0; e < EL_EDGES.length; e++) acc[e] += w * cdf(dist, EL_EDGES[e]);
        total += w;
      }
    });
  }
  if (total > 0) for (let e = 0; e < acc.length; e++) acc[e] /= total;
  return { cdf: acc, users: total };
}

/** 경계 CDF에서 분위수를 로그 보간으로 추정 */
export function quantileFromCdf(c: ArrayLike<number>, q: number): number {
  let prevX = AXIS_MIN;
  let prevC = 0;
  for (let e = 0; e < EL_EDGES.length; e++) {
    if (c[e] >= q) {
      const f = c[e] - prevC > 1e-9 ? (q - prevC) / (c[e] - prevC) : 0;
      return Math.exp(Math.log(prevX) + f * (Math.log(EL_EDGES[e]) - Math.log(prevX)));
    }
    prevX = EL_EDGES[e];
    prevC = c[e];
  }
  const f = (q - prevC) / Math.max(1e-9, 1 - prevC);
  return Math.exp(Math.log(prevX) + f * (Math.log(AXIS_MAX) - Math.log(prevX)));
}

export function computeDistribution(m: BoardModel, scope: DistScope, from: number, to: number, bin: number): Distribution {
  const out: Distribution = { starts: [], ends: [], shares: [], users: [], p50: [], p95: [], over150: [], maxShare: 0 };
  const stride = Math.max(1, Math.floor(bin / 2));
  const i150 = EL_EDGES.indexOf(150);
  for (let s = from; s <= to; s += bin) {
    const e = Math.min(to, s + bin - 1);
    const acc = new Float64Array(EL_EDGES.length);
    let users = 0;
    let k = 0;
    for (let t = e; t >= s; t -= stride) {
      const r = cdfAt(m, scope, t);
      for (let i = 0; i < acc.length; i++) acc[i] += r.cdf[i];
      users += r.users;
      k++;
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= k;
    const shares = new Float32Array(EL_EDGES.length + 1);
    let prev = 0;
    for (let b = 0; b < shares.length; b++) {
      const c = b < acc.length ? acc[b] : 1;
      shares[b] = Math.max(0, c - prev);
      prev = c;
      out.maxShare = Math.max(out.maxShare, shares[b]);
    }
    out.starts.push(s);
    out.ends.push(e);
    out.shares.push(shares);
    out.users.push(users / k);
    out.p50.push(quantileFromCdf(acc, 0.5));
    out.p95.push(quantileFromCdf(acc, 0.95));
    out.over150.push(1 - acc[i150]);
  }
  return out;
}
