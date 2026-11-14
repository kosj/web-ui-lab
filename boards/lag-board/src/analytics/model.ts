/**
 * 보드 전체 모델 — 데이터 생성 → 서버별 분석 → 토폴로지 재분류 → 장애 탐지 → 권역·전역 집계.
 * UI는 이 모델만 읽는다.
 */
import { analyzeServer, applyTopologyRule, type ServerAnalysis } from './attribution';
import { detectIncidents, type Incident } from './incidents';
import { analyzeIsps, type IspModel } from './isp';
import { attachVoice, detectBlindSpots, type BlindSpot } from './signals';
import { weightedQuantile } from './stats';
import { generateDataset, type Dataset } from '../data/generate';
import { REGIONS, THRESHOLDS, WARMUP_MIN, type Cause, type RegionId } from '../data/config';

export interface AggSeries {
  /** 유저 가중 p95 체감 지연 */
  p95: Float32Array;
  /** 유저 가중 평균 — 원인 분해(가법)용 */
  mean: Float32Array;
  base: Float32Array;
  excess: Record<Cause, Float32Array>;
  ccu: Float32Array;
  /** 주의(150ms) 이상 서버의 동접 합 */
  lagUsers: Float32Array;
}

export interface BoardModel {
  ds: Dataset;
  /** 화면에 보이는 첫 분 인덱스 (워밍업 이후) */
  viewFrom: number;
  last: number;
  an: Record<string, ServerAnalysis>;
  incidents: Incident[];
  isp: IspModel;
  /** 제보만 급증하고 지표는 정상인 구간 */
  blindSpots: BlindSpot[];
  regions: Record<RegionId, AggSeries>;
  global: AggSeries;
}

function aggregate(ds: Dataset, an: Record<string, ServerAnalysis>, ids: string[], from: number): AggSeries {
  const n = ds.minutes;
  const mk = () => new Float32Array(n);
  const out: AggSeries = {
    p95: mk(), mean: mk(), base: mk(), ccu: mk(), lagUsers: mk(),
    excess: { infra: mk(), network: mk(), server: mk(), client: mk() },
  };
  const vals = new Float64Array(ids.length);
  const wts = new Float64Array(ids.length);
  for (let t = from; t < n; t++) {
    let wsum = 0;
    let lag = 0;
    const acc = { el: 0, base: 0, infra: 0, network: 0, server: 0, client: 0 };
    ids.forEach((id, i) => {
      const w = ds.metrics[id].ccu[t];
      const a = an[id];
      vals[i] = a.el[t];
      wts[i] = w;
      wsum += w;
      if (a.el[t] >= THRESHOLDS.notice) lag += w;
      acc.el += w * a.el[t];
      acc.base += w * a.base[t];
      acc.infra += w * a.excess.infra[t];
      acc.network += w * a.excess.network[t];
      acc.server += w * a.excess.server[t];
      acc.client += w * a.excess.client[t];
    });
    out.p95[t] = weightedQuantile(vals, wts, 0.95);
    out.mean[t] = acc.el / wsum;
    out.base[t] = acc.base / wsum;
    out.excess.infra[t] = acc.infra / wsum;
    out.excess.network[t] = acc.network / wsum;
    out.excess.server[t] = acc.server / wsum;
    out.excess.client[t] = acc.client / wsum;
    out.ccu[t] = wsum;
    out.lagUsers[t] = lag;
  }
  return out;
}

export function buildModel(seed?: number): BoardModel {
  const ds = generateDataset(seed);
  const viewFrom = WARMUP_MIN;
  // 기준선은 워밍업 구간 안쪽(60분 전)부터 계산해 첫 화면부터 z가 유효하도록 한다
  const anFrom = Math.max(60, viewFrom - 120);
  const an: Record<string, ServerAnalysis> = {};
  for (const sv of ds.servers) an[sv.id] = analyzeServer(ds.metrics[sv.id], anFrom);
  applyTopologyRule(ds, an, anFrom);
  const isp = analyzeIsps(ds, anFrom);
  const incidents = detectIncidents(ds, an, viewFrom, isp);
  const regions = {} as Record<RegionId, AggSeries>;
  for (const r of REGIONS) {
    regions[r.id] = aggregate(ds, an, ds.servers.filter((s) => s.region === r.id).map((s) => s.id), viewFrom);
  }
  const global = aggregate(ds, an, ds.servers.map((s) => s.id), viewFrom);
  const model: BoardModel = { ds, viewFrom, last: ds.minutes - 1, an, incidents, isp, regions, global, blindSpots: [] };
  attachVoice(model);
  model.blindSpots = detectBlindSpots(model, viewFrom);
  return model;
}

export function isActiveAt(inc: Incident, t: number) {
  return inc.onsetIdx <= t && (inc.endIdx === null || t < inc.endIdx);
}
