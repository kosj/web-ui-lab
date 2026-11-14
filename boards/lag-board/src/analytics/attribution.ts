/**
 * 원인 분해(attribution) — 서버별·분별로 "기준선 대비 초과 지연"을 4개 원인에 배분한다.
 *
 * 1단계 (신호 기반)
 *   - 각 구성요소(네트워크/서버/클라)와 호스트 지표(steal, I/O wait)의 기준선을
 *     "전일 동시간대 ±45분" 중앙값(계절성 기준선)으로 잡고, MAD로 강건 z-score를 계산한다.
 *     (단순 롤링 창은 저녁 피크로 오르는 지연을 이상으로 오탐한다 — v0.1 실험에서 확인)
 *   - z는 EWMA(α=0.35)로 평활한 값에 계산 → 단발성 스파이크에 과민 반응하지 않는다.
 *   - 초과분 = max(0, x − 기준선) × 게이트(z: 2.5→4.5 구간에서 0→1로 증가).
 *   - 호스트 지표 z가 높으면(2.5→5.5) 서버 초과분의 해당 비율을 '인프라'로 이관.
 * 2단계 (토폴로지 기반)
 *   - 같은 DC·랙의 서버 2대 이상이 동시에 서버측 초과 지연(≥20ms)을 보이면
 *     개별 서버 문제가 아니라 공유 자원(인프라) 문제로 재분류한다.
 */
import { clientComponent, netComponent, serverComponent } from './latency';
import { clamp, ewma, MAD_TO_SIGMA } from './stats';
import type { Dataset, ServerMetrics } from '../data/generate';
import type { Cause } from '../data/config';

export const ATTR_PARAMS = {
  seasonMin: 1440,
  halfWindowMin: 45,
  stepMin: 5,
  ewmaAlpha: 0.35,
  zGateLo: 2.5,
  zGateHi: 4.5,
  infraZLo: 2.5,
  infraZHi: 5.5,
  memberMs: 20,
} as const;

export interface Baseline {
  med: Float32Array;
  mad: Float32Array;
}

export interface ServerAnalysis {
  el: Float32Array;
  net: Float32Array;
  srv: Float32Array;
  cli: Float32Array;
  /** 기준선 (EL − 초과분 합) */
  base: Float32Array;
  excess: Record<Cause, Float32Array>;
  z: { net: Float32Array; srv: Float32Array; cli: Float32Array; infra: Float32Array };
  baselines: { net: Baseline; srv: Baseline; cli: Baseline; steal: Baseline; io: Baseline; rttP95: Baseline; tick: Baseline; loss: Baseline; jitter: Baseline };
}

/** 계절성 기준선: 하루 전 같은 시각 ±45분의 중앙값·MAD (stepMin마다 갱신) */
export function seasonalBaseline(series: ArrayLike<number>, fromIdx: number): Baseline {
  const n = series.length;
  const med = new Float32Array(n).fill(NaN);
  const madArr = new Float32Array(n).fill(NaN);
  const { seasonMin, halfWindowMin, stepMin } = ATTR_PARAMS;
  const buf = new Float64Array(halfWindowMin * 2 + 1);
  let curMed = NaN;
  let curMad = NaN;
  for (let t = fromIdx; t < n; t++) {
    if ((t - fromIdx) % stepMin === 0) {
      const c = t - seasonMin;
      let k = 0;
      for (let i = Math.max(0, c - halfWindowMin); i <= Math.min(n - 1, c + halfWindowMin); i++) {
        const v = series[i];
        if (Number.isFinite(v)) buf[k++] = v;
      }
      if (k >= 30) {
        const view = buf.slice(0, k).sort();
        curMed = view[k >> 1];
        for (let i = 0; i < k; i++) view[i] = Math.abs(view[i] - curMed);
        view.sort();
        curMad = view[k >> 1];
      }
    }
    med[t] = curMed;
    madArr[t] = curMad;
  }
  return { med, mad: madArr };
}

function zSeries(smoothed: ArrayLike<number>, b: Baseline, floor: number, fromIdx: number) {
  const z = new Float32Array(smoothed.length);
  for (let t = fromIdx; t < smoothed.length; t++) {
    const m = b.med[t];
    if (!Number.isFinite(m)) continue;
    z[t] = (smoothed[t] - m) / Math.max(MAD_TO_SIGMA * b.mad[t], floor);
  }
  return z;
}

const gate = (z: number, lo: number, hi: number) => clamp((z - lo) / (hi - lo), 0, 1);

export function analyzeServer(m: ServerMetrics, fromIdx: number): ServerAnalysis {
  const n = m.ccu.length;
  const net = new Float32Array(n);
  const srv = new Float32Array(n);
  const cli = new Float32Array(n);
  const el = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    net[t] = netComponent(m.rttP95[t], m.jitter[t], m.loss[t]);
    srv[t] = serverComponent(m.tickP99[t]);
    cli[t] = clientComponent(m.frameP95[t]);
    el[t] = net[t] + srv[t] + cli[t];
  }
  const a = ATTR_PARAMS.ewmaAlpha;
  const bNet = seasonalBaseline(net, fromIdx);
  const bSrv = seasonalBaseline(srv, fromIdx);
  const bCli = seasonalBaseline(cli, fromIdx);
  const bSteal = seasonalBaseline(m.steal, fromIdx);
  const bIo = seasonalBaseline(m.ioWait, fromIdx);

  const zNet = zSeries(ewma(net, a), bNet, 3, fromIdx);
  const zSrv = zSeries(ewma(srv, a), bSrv, 1.5, fromIdx);
  const zCli = zSeries(ewma(cli, a), bCli, 1.5, fromIdx);
  const zSteal = zSeries(ewma(m.steal, a), bSteal, 0.4, fromIdx);
  const zIo = zSeries(ewma(m.ioWait, a), bIo, 0.5, fromIdx);
  const zInfra = new Float32Array(n);
  for (let t = 0; t < n; t++) zInfra[t] = Math.max(zSteal[t], zIo[t]);

  const excess: Record<Cause, Float32Array> = {
    infra: new Float32Array(n), network: new Float32Array(n), server: new Float32Array(n), client: new Float32Array(n),
  };
  const base = new Float32Array(n);
  const { zGateLo, zGateHi, infraZLo, infraZHi } = ATTR_PARAMS;
  for (let t = 0; t < n; t++) {
    if (t < fromIdx || !Number.isFinite(bNet.med[t])) {
      base[t] = el[t];
      continue;
    }
    const eNet = gate(zNet[t], zGateLo, zGateHi) * Math.max(0, net[t] - bNet.med[t]);
    let eSrv = gate(zSrv[t], zGateLo, zGateHi) * Math.max(0, srv[t] - bSrv.med[t]);
    const eCli = gate(zCli[t], zGateLo, zGateHi) * Math.max(0, cli[t] - bCli.med[t]);
    const f = gate(zInfra[t], infraZLo, infraZHi);
    const eInfra = f * eSrv;
    eSrv -= eInfra;
    excess.network[t] = eNet;
    excess.server[t] = eSrv;
    excess.client[t] = eCli;
    excess.infra[t] = eInfra;
    base[t] = el[t] - eNet - eSrv - eCli - eInfra;
  }

  return {
    el, net, srv, cli, base, excess,
    z: { net: zNet, srv: zSrv, cli: zCli, infra: zInfra },
    baselines: {
      net: bNet, srv: bSrv, cli: bCli, steal: bSteal, io: bIo,
      rttP95: seasonalBaseline(m.rttP95, fromIdx),
      tick: seasonalBaseline(m.tickP99, fromIdx),
      loss: seasonalBaseline(m.loss, fromIdx),
      jitter: seasonalBaseline(m.jitter, fromIdx),
    },
  };
}

/** 2단계: 같은 랙에서 동시 다발 서버측 지연 → 인프라로 재분류 */
export function applyTopologyRule(ds: Dataset, an: Record<string, ServerAnalysis>, fromIdx: number) {
  const racks = new Map<string, string[]>();
  for (const s of ds.servers) {
    const key = `${s.region}:${s.rack}`;
    if (!racks.has(key)) racks.set(key, []);
    racks.get(key)!.push(s.id);
  }
  const th = ATTR_PARAMS.memberMs;
  for (let t = fromIdx; t < ds.minutes; t++) {
    for (const ids of racks.values()) {
      const hit = ids.filter((id) => an[id].excess.server[t] + an[id].excess.infra[t] >= th);
      if (hit.length < 2) continue;
      for (const id of hit) {
        const ex = an[id].excess;
        ex.infra[t] += ex.server[t];
        ex.server[t] = 0;
      }
    }
  }
}
