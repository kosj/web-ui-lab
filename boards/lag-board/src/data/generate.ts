import {
  MINUTE, NEW_CLIENT_VERSION, PATCH_TIME, REGION_ISPS, REGIONS, SCENARIOS, START, TOTAL_MIN,
  type RegionDef, type RegionId, type ScenarioDef,
} from './config';
import { clamp, gaussian, mulberry32 } from '../analytics/stats';
import { fromP50P95, mixtureQuantile } from '../analytics/lognormal';

export interface ServerDef {
  id: string; // KR-01
  name: string; // 한빛
  region: RegionId;
  dc: string; // ICN
  rack: string; // R1 | R2
  /** 서버 인기도 가중치 (동접 배분) */
  weight: number;
}

/** 서버 1대의 분당 원시 지표 (컬럼형 배열, 길이 = TOTAL_MIN) */
export interface ServerMetrics {
  ccu: Float32Array; // 동시 접속자
  rttP50: Float32Array; // ms
  rttP95: Float32Array; // ms
  jitter: Float32Array; // ms
  loss: Float32Array; // %
  tickP99: Float32Array; // ms (예산 50ms)
  steal: Float32Array; // % CPU steal (호스트 경합)
  ioWait: Float32Array; // %
  frameOld: Float32Array; // 구버전 클라 프레임타임 p95 (ms)
  frameNew: Float32Array; // 신버전 클라 프레임타임 p95 (ms)
  newShare: Float32Array; // 신버전 클라 비율 0..1
  frameP95: Float32Array; // 서버 접속 유저 전체 프레임타임 p95 (ms)
}

/** 권역 × 통신사 경로 지표 — 유저 → 권역 DC 네트워크 경로 (서버 공통) */
export interface IspPath {
  rttP50: Float32Array;
  rttP95: Float32Array;
  jitter: Float32Array;
  loss: Float32Array;
}

export interface Dataset {
  start: number;
  minutes: number;
  times: Float64Array;
  servers: ServerDef[];
  metrics: Record<string, ServerMetrics>;
  /** isp[region][ispId] — REGION_ISPS 순서 */
  isp: Record<RegionId, Record<string, IspPath>>;
  /** 서버별 통신사 유저 비중 (REGION_ISPS[region] 순서, 합 1) */
  ispShare: Record<string, number[]>;
}

/** MMO 동접 일주기: 새벽 5시 반 최저, 밤 9시 반 최고 */
export function diurnal(localHour: number): number {
  const h = ((localHour % 24) + 24) % 24;
  const lo = 0.25;
  if (h >= 5.5 && h <= 21.5) {
    return lo + (1 - lo) * (1 - Math.cos((Math.PI * (h - 5.5)) / 16)) / 2;
  }
  const since = (h - 21.5 + 24) % 24; // 0..8
  return lo + (1 - lo) * (1 + Math.cos((Math.PI * since) / 8)) / 2;
}

function smoothstep(x: number) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 시나리오 강도 0..1 (램프업 → 유지 → 종료 후 8분 감쇠) */
export function intensity(s: ScenarioDef, ts: number): number {
  if (ts < s.start) return 0;
  const up = smoothstep((ts - s.start) / (s.rampMin * MINUTE));
  if (s.end === null || ts <= s.end) return up;
  return up * (1 - smoothstep((ts - s.end) / (8 * MINUTE)));
}

export function buildServers(): ServerDef[] {
  const rand = mulberry32(7);
  const out: ServerDef[] = [];
  for (const r of REGIONS) {
    r.servers.forEach((name, i) => {
      const half = Math.ceil(r.servers.length / 2);
      out.push({
        id: `${r.id}-${String(i + 1).padStart(2, '0')}`,
        name,
        region: r.id,
        dc: r.dc,
        rack: i < half ? 'R1' : 'R2',
        weight: 0.7 + rand() * 0.6,
      });
    });
  }
  return out;
}

const alloc = () => new Float32Array(TOTAL_MIN);

function localLoad(r: RegionDef, ts: number) {
  const localHour = ((ts / 3_600_000 + r.utcOffset) % 24 + 24) % 24;
  return diurnal(localHour);
}

/** 1단계: 권역 × 통신사 경로 지표 생성 (네트워크 장애는 여기에 주입) */
function generateIspPaths(rand: () => number, times: Float64Array) {
  const out = {} as Record<RegionId, Record<string, IspPath>>;
  for (const r of REGIONS) {
    out[r.id] = {};
    const scen = SCENARIOS.filter((s) => s.cause === 'network' && s.target.region === r.id);
    for (const isp of REGION_ISPS[r.id]) {
      const p: IspPath = { rttP50: alloc(), rttP95: alloc(), jitter: alloc(), loss: alloc() };
      const farJitter = 1 + isp.rttP50 / 100;
      for (let t = 0; t < TOTAL_MIN; t++) {
        const ts = times[t];
        const load = localLoad(r, ts);
        let rtt50 = isp.rttP50 * (1 + 0.08 * load) + gaussian(rand) * 0.4;
        let rtt95 = isp.rttP95 * (1 + 0.12 * load) + Math.abs(gaussian(rand)) * 1.2;
        let jitter = (2.4 + 2.2 * load) * farJitter + Math.abs(gaussian(rand)) * 0.4;
        let loss = 0.04 + 0.05 * load + Math.abs(gaussian(rand)) * 0.02;
        for (const s of scen) {
          const w = s.target.isps ? (s.target.isps[isp.id] ?? 0) : 1;
          const I = intensity(s, ts) * w;
          if (I <= 0) continue;
          if (s.id === 'S5') {
            // 국제망 우회 — 지연이 크게 늘고 손실은 소폭
            rtt50 += 118 * I + gaussian(rand) * 3 * I;
            rtt95 += 165 * I + Math.abs(gaussian(rand)) * 10 * I;
            jitter += 10 * I;
            loss += 0.8 * I * (0.75 + 0.5 * rand());
          } else {
            // 해저 케이블 손상 — 지연·지터·손실 모두 악화
            rtt50 += 60 * I + gaussian(rand) * 4 * I;
            rtt95 += 110 * I + Math.abs(gaussian(rand)) * 14 * I;
            jitter += 32 * I + Math.abs(gaussian(rand)) * 6 * I;
            loss += 6 * I * (0.75 + 0.5 * rand());
          }
        }
        p.rttP50[t] = Math.max(1, rtt50);
        p.rttP95[t] = Math.max(rtt50 + 2, rtt95);
        p.jitter[t] = Math.max(0, jitter);
        p.loss[t] = clamp(loss, 0, 100);
      }
      out[r.id][isp.id] = p;
    }
  }
  return out;
}

export function generateDataset(seed = 20261114): Dataset {
  const rand = mulberry32(seed);
  const servers = buildServers();
  const regionById = new Map<RegionId, RegionDef>(REGIONS.map((r) => [r.id, r]));
  const times = new Float64Array(TOTAL_MIN);
  for (let t = 0; t < TOTAL_MIN; t++) times[t] = START + t * MINUTE;

  const isp = generateIspPaths(rand, times);
  // 통신사 혼합 분위수는 권역 단위로 한 번만 계산 (서버별 통신사 구성 편차 ±15%는 지터·손실 가중에만 반영)
  const regionQ = {} as Record<RegionId, { p50: Float32Array; p95: Float32Array }>;
  for (const r of REGIONS) {
    const defs = REGION_ISPS[r.id];
    const q = { p50: alloc(), p95: alloc() };
    for (let t = 0; t < TOTAL_MIN; t++) {
      const comps = defs.map((d) => fromP50P95(isp[r.id][d.id].rttP50[t], isp[r.id][d.id].rttP95[t], 0, d.share));
      q.p50[t] = mixtureQuantile(comps, 0.5, 14);
      q.p95[t] = mixtureQuantile(comps, 0.95, 14);
    }
    regionQ[r.id] = q;
  }
  const metrics: Record<string, ServerMetrics> = {};
  const ispShare: Record<string, number[]> = {};

  for (const sv of servers) {
    const r = regionById.get(sv.region)!;
    const isps = REGION_ISPS[sv.region];
    // 서버마다 통신사 구성이 조금씩 다르다 (±15%)
    const raw = isps.map((i) => i.share * (0.85 + rand() * 0.3));
    const sum = raw.reduce((a, b) => a + b, 0);
    const shares = raw.map((v) => v / sum);
    ispShare[sv.id] = shares;
    const paths = isps.map((i) => isp[sv.region][i.id]);

    const m: ServerMetrics = {
      ccu: alloc(), rttP50: alloc(), rttP95: alloc(), jitter: alloc(), loss: alloc(),
      tickP99: alloc(), steal: alloc(), ioWait: alloc(), frameOld: alloc(), frameNew: alloc(),
      newShare: alloc(), frameP95: alloc(),
    };
    // 서버별 개성: 인프라 장애 시 영향 편차, 틱 기본값 편차
    const infraSens = 0.8 + rand() * 0.45;
    const tickBase = 22 + rand() * 5;
    const scenarios = SCENARIOS.filter((s) => {
      if (s.cause === 'network') return false; // 네트워크는 경로 단계에서 주입
      if (s.cause === 'client') return true;
      if (s.target.region && s.target.region !== sv.region) return false;
      if (s.target.servers && !s.target.servers.includes(sv.id)) return false;
      if (s.target.rack && s.target.rack !== sv.rack) return false;
      return true;
    });
    const q = regionQ[sv.region];

    let ccuNoise = 0;
    for (let t = 0; t < TOTAL_MIN; t++) {
      const ts = times[t];
      const load = localLoad(r, ts);
      ccuNoise = 0.9 * ccuNoise + 0.1 * gaussian(rand) * 0.04;

      // 2단계: 서버 네트워크 지표 = 이 서버 유저의 통신사 경로 혼합
      let jitter = 0;
      let loss = 0;
      paths.forEach((p, i) => {
        jitter += shares[i] * p.jitter[t];
        loss += shares[i] * p.loss[t];
      });
      let rtt50 = q.p50[t] + gaussian(rand) * 0.4;
      let rtt95 = q.p95[t] + Math.abs(gaussian(rand)) * 1.0;
      jitter += Math.abs(gaussian(rand)) * 0.3;

      let tick = tickBase + 11 * load * sv.weight + gaussian(rand) * 1.4;
      let steal = 1.1 + Math.abs(gaussian(rand)) * 0.35;
      let io = 1.8 + Math.abs(gaussian(rand)) * 0.5;
      const frameOld = 20 + Math.abs(gaussian(rand)) * 1.2;
      let frameNew = frameOld;
      let churn = 0;

      // 순간 노이즈: 서버 단발성 패킷 버스트 — 분류기가 과민 반응하지 않아야 함
      if (rand() < 0.002) rtt95 += 30 + rand() * 40;

      for (const s of scenarios) {
        const I = intensity(s, ts);
        if (I <= 0) continue;
        if (s.cause === 'server') {
          // 메모리 누수 → GC 정지가 점점 길어짐
          tick += 150 * I + 45 * I * rand();
          churn = Math.max(churn, 0.1 * I);
        } else if (s.cause === 'infra') {
          steal += 22 * I * infraSens + gaussian(rand) * 1.5 * I;
          io += 14 * I * infraSens + Math.abs(gaussian(rand)) * 2 * I;
          tick += 85 * I * infraSens * (0.9 + 0.2 * rand());
          churn = Math.max(churn, 0.08 * I);
        } else if (s.cause === 'client') {
          frameNew = 20 + 46 * I + Math.abs(gaussian(rand)) * 5;
        }
      }
      // 네트워크 장애로 인한 이탈 (경로 손실이 클수록)
      churn = Math.max(churn, clamp((loss - 0.5) / 30, 0, 0.14), clamp((rtt95 - 150) / 1500, 0, 0.1));

      const sinceUpdate = ts - PATCH_TIME;
      const share = sinceUpdate <= 0 ? 0 : 0.7 * (1 - Math.exp(-sinceUpdate / (90 * MINUTE)));
      // 혼합분포의 p95 근사: 신버전 비율이 5%를 넘으면 꼬리가 신버전 쪽으로 이동
      const frameP95 = frameOld + (frameNew - frameOld) * clamp((share - 0.02) / 0.13, 0, 1);

      m.ccu[t] = Math.max(0, r.peakCcu * sv.weight * load * (1 + ccuNoise) * (1 - churn));
      rtt50 = Math.max(1, rtt50);
      m.rttP50[t] = rtt50;
      m.rttP95[t] = Math.max(rtt50 + 2, rtt95);
      m.jitter[t] = Math.max(0, jitter);
      m.loss[t] = clamp(loss, 0, 100);
      m.tickP99[t] = Math.max(5, tick);
      m.steal[t] = clamp(steal, 0, 100);
      m.ioWait[t] = clamp(io, 0, 100);
      m.frameOld[t] = frameOld;
      m.frameNew[t] = share > 0 ? frameNew : NaN;
      m.newShare[t] = share;
      m.frameP95[t] = frameP95;
    }
    metrics[sv.id] = m;
  }

  return { start: START, minutes: TOTAL_MIN, times, servers, metrics, isp, ispShare };
}

export { NEW_CLIENT_VERSION };
