/**
 * 통신사(ISP) 경로 분석 — 권역 × 통신사별 네트워크 성분, 계절성 기준선, z.
 * 네트워크 장애가 "권역 전체"인지 "특정 통신사 경로"인지 가르는 근거가 된다.
 */
import { seasonalBaseline, type Baseline } from './attribution';
import { netComponent } from './latency';
import { ewma, MAD_TO_SIGMA } from './stats';
import { REGION_ISPS, REGIONS, type RegionId } from '../data/config';
import type { Dataset } from '../data/generate';

export interface IspAnalysis {
  /** 네트워크 성분 (RTT p95 + 1.5×지터 + 50×손실) */
  net: Float32Array;
  z: Float32Array;
  baselines: { net: Baseline; rttP50: Baseline; rttP95: Baseline; jitter: Baseline; loss: Baseline };
}

export type IspModel = Record<RegionId, Record<string, IspAnalysis>>;

export function analyzeIsps(ds: Dataset, fromIdx: number): IspModel {
  const out = {} as IspModel;
  for (const r of REGIONS) {
    out[r.id] = {};
    for (const isp of REGION_ISPS[r.id]) {
      const p = ds.isp[r.id][isp.id];
      const n = p.rttP95.length;
      const net = new Float32Array(n);
      for (let t = 0; t < n; t++) net[t] = netComponent(p.rttP95[t], p.jitter[t], p.loss[t]);
      const bNet = seasonalBaseline(net, fromIdx);
      const sm = ewma(net, 0.35);
      const z = new Float32Array(n);
      for (let t = fromIdx; t < n; t++) {
        if (!Number.isFinite(bNet.med[t])) continue;
        z[t] = (sm[t] - bNet.med[t]) / Math.max(MAD_TO_SIGMA * bNet.mad[t], 3);
      }
      out[r.id][isp.id] = {
        net, z,
        baselines: {
          net: bNet,
          rttP50: seasonalBaseline(p.rttP50, fromIdx),
          rttP95: seasonalBaseline(p.rttP95, fromIdx),
          jitter: seasonalBaseline(p.jitter, fromIdx),
          loss: seasonalBaseline(p.loss, fromIdx),
        },
      };
    }
  }
  return out;
}

/** 권역 내 통신사 i의 동접 (서버별 동접 × 서버별 통신사 비중의 합) */
export function ispUsers(ds: Dataset, region: RegionId, ispIdx: number, t: number) {
  let users = 0;
  for (const s of ds.servers) {
    if (s.region !== region) continue;
    users += ds.metrics[s.id].ccu[t] * ds.ispShare[s.id][ispIdx];
  }
  return users;
}
