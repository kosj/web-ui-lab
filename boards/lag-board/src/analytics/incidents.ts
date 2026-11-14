/**
 * 장애(incident) 탐지·판정.
 *
 * - 서버·분 단위로 원인별 초과 지연이 20ms 이상이면 해당 원인의 "구성원".
 * - 원인별 확산 범위(scope)로 묶는다:
 *     인프라 → 같은 DC 랙 / 네트워크 → 권역 / 서버 → 서버 단독 / 클라 → 전역(클라 버전)
 * - 5분 이내 공백은 이어 붙이고, 활성 분이 5분 미만인 이벤트는 버린다(단발성 노이즈 제거).
 * - 시작 시각은 CUSUM(k=0.5, h=5)으로 변화 시작점을 역추정하고,
 *   CUSUM 경보 시각을 "감지 시각"으로 기록해 감지 지연(MTTD)을 계산한다.
 * - 판정 신뢰도 = ½ × 원인 점유율 + ½ × 확산 패턴 일치도.
 */
import { ATTR_PARAMS, type ServerAnalysis } from './attribution';
import { cusum, median } from './stats';
import { NEW_CLIENT_VERSION, OLD_CLIENT_VERSION, PATCH_TIME, REGION_ISPS, REGIONS, THRESHOLDS, type Cause, type RegionId } from '../data/config';
import { ispUsers, type IspModel } from './isp';
import type { Dataset } from '../data/generate';

export interface Evidence {
  text: string;
  /** 판정을 지지(true)하는 근거인지, 반대 원인을 배제하는 근거인지 */
  kind: 'signal' | 'scope' | 'exclude';
}

export interface IspContribution {
  id: string;
  name: string;
  /** 권역 초과 지연 중 이 통신사가 차지하는 비율 */
  frac: number;
  before: number;
  during: number;
}

export interface Incident {
  id: string;
  cause: Cause;
  scopeType: 'rack' | 'region' | 'isp' | 'server' | 'global';
  /** 네트워크 장애: 통신사별 기여 (내림차순) */
  isps?: IspContribution[];
  scopeLabel: string;
  region?: RegionId;
  serverIds: string[];
  /** 분 인덱스 */
  onsetIdx: number;
  detectIdx: number;
  endIdx: number | null;
  peakIdx: number;
  peakEl: number;
  peakUsers: number;
  share: number;
  confidence: number;
  evidence: Evidence[];
  title: string;
}

const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name])) as Record<RegionId, string>;

function scopeKey(cause: Cause, sv: Dataset['servers'][number]) {
  switch (cause) {
    case 'infra': return `${sv.region}:${sv.dc}:${sv.rack}`;
    case 'network': return sv.region;
    case 'server': return sv.id;
    case 'client': return 'GLOBAL';
  }
}

const fmt = (v: number, d = 0) => v.toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });

function windowMedian(arr: ArrayLike<number>, from: number, to: number) {
  const vals: number[] = [];
  for (let t = Math.max(0, from); t < Math.min(arr.length, to); t++) if (Number.isFinite(arr[t])) vals.push(arr[t]);
  return vals.length ? median(vals) : NaN;
}

export function detectIncidents(ds: Dataset, an: Record<string, ServerAnalysis>, fromIdx: number, ispModel?: IspModel): Incident[] {
  const th = ATTR_PARAMS.memberMs;
  const causes: Cause[] = ['infra', 'network', 'server', 'client'];
  const n = ds.minutes;
  const incidents: Incident[] = [];
  const minClient = Math.ceil(ds.servers.length * 0.2);

  for (const cause of causes) {
    // scope → 분별 구성원 목록
    const scopes = new Map<string, (string[] | undefined)[]>();
    for (const sv of ds.servers) {
      const ex = an[sv.id].excess[cause];
      const key = scopeKey(cause, sv);
      if (!scopes.has(key)) scopes.set(key, new Array(n));
      const arr = scopes.get(key)!;
      for (let t = fromIdx; t < n; t++) {
        if (ex[t] >= th) (arr[t] ??= []).push(sv.id);
      }
    }

    for (const [key, members] of scopes) {
      const minCount = cause === 'client' ? minClient : 1;
      const active = (t: number) => (members[t]?.length ?? 0) >= minCount;
      let t = fromIdx;
      while (t < n) {
        if (!active(t)) { t++; continue; }
        const s = t;
        let last = t;
        let gap = 0;
        let activeCount = 0;
        while (t < n && gap <= 5) {
          if (active(t)) { last = t; gap = 0; activeCount++; } else gap++;
          t++;
        }
        // 실제 활성 분이 5분 미만이면 단발성 노이즈로 보고 버린다
        if (activeCount < 5) continue;
        incidents.push(buildIncident(ds, an, cause, key, members, s, last, n, ispModel));
      }
    }
  }

  incidents.sort((a, b) => a.onsetIdx - b.onsetIdx);
  incidents.forEach((inc, i) => (inc.id = `INC-${String(i + 1).padStart(3, '0')}`));
  return incidents;
}

function buildIncident(
  ds: Dataset, an: Record<string, ServerAnalysis>, cause: Cause, key: string,
  members: (string[] | undefined)[], s: number, last: number, n: number, ispModel?: IspModel,
): Incident {
  const ids = new Set<string>();
  for (let t = s; t <= last; t++) members[t]?.forEach((id) => ids.add(id));
  const serverIds = ds.servers.filter((sv) => ids.has(sv.id)).map((sv) => sv.id);
  const first = ds.servers.find((sv) => sv.id === serverIds[0])!;
  const ongoing = last >= n - 3;

  // 피크·영향 유저
  let peakEl = 0;
  let peakIdx = s;
  let peakUsers = 0;
  for (let t = s; t <= last; t++) {
    let users = 0;
    for (const id of serverIds) {
      const e = an[id].el[t];
      if (e > peakEl) { peakEl = e; peakIdx = t; }
      if (e >= THRESHOLDS.notice) users += ds.metrics[id].ccu[t];
    }
    peakUsers = Math.max(peakUsers, users);
  }

  // 원인 점유율 (구성 서버의 전체 초과 지연 중 이 원인의 비중)
  let mine = 0;
  let all = 0;
  for (let t = s; t <= last; t++) {
    for (const id of serverIds) {
      const ex = an[id].excess;
      mine += ex[cause][t];
      all += ex.infra[t] + ex.network[t] + ex.server[t] + ex.client[t];
    }
  }
  const share = all > 0 ? mine / all : 0;

  // CUSUM으로 변화 시작·감지 시각 추정 (구성 서버 평균 z)
  const zKey = cause === 'network' ? 'net' : cause === 'server' ? 'srv' : cause === 'client' ? 'cli' : 'infra';
  const from = Math.max(0, s - 90);
  const to = Math.min(n, s + 30);
  const zAvg = new Float64Array(to - from);
  for (let t = from; t < to; t++) {
    let acc = 0;
    for (const id of serverIds) acc += Math.min(an[id].z[zKey][t], 50);
    zAvg[t - from] = acc / serverIds.length;
  }
  const cs = cusum(zAvg, 0.5, 5);
  let onsetIdx = s;
  let detectIdx = s;
  // 첫 경보 중 이후 10분간 평균 z > 2로 상승이 지속된 것을 채택 (일시적 경보는 건너뜀)
  const sustained = (a: number) => {
    let acc = 0;
    let k = 0;
    for (let i = a; i < Math.min(zAvg.length, a + 10); i++) { acc += zAvg[i]; k++; }
    return k > 0 && acc / k > 2;
  };
  const alarmPos = cs.alarms.findIndex((a) => sustained(a));
  if (alarmPos >= 0) {
    onsetIdx = Math.min(s, cs.onsets[alarmPos] + from);
    detectIdx = cs.alarms[alarmPos] + from;
  }

  const { evidence, pattern, scopeLabel, scopeType, title, isps } = explain(ds, an, cause, key, serverIds, first, onsetIdx, last, ispModel);
  const confidence = Math.min(0.99, 0.5 * share + 0.5 * pattern);

  return {
    id: '', cause, scopeType, scopeLabel, isps, region: cause === 'client' ? undefined : first.region,
    serverIds, onsetIdx, detectIdx, endIdx: ongoing ? null : last + 1, peakIdx, peakEl, peakUsers,
    share, confidence, evidence, title,
  };
}

function explain(
  ds: Dataset, an: Record<string, ServerAnalysis>, cause: Cause, key: string,
  serverIds: string[], first: Dataset['servers'][number], s: number, last: number, ispModel?: IspModel,
) {
  let isps: IspContribution[] | undefined;
  const evidence: Evidence[] = [];
  const pre = (b: { med: Float32Array }) => b.med[s];
  const during = (pick: (id: string) => ArrayLike<number>) =>
    median(serverIds.map((id) => windowMedian(pick(id), s, last + 1)));
  const baseOf = (pick: (id: string) => number) => median(serverIds.map(pick));
  const regionServers = (rid: RegionId) => ds.servers.filter((sv) => sv.region === rid);
  let pattern = 0.5;
  let scopeLabel = '';
  let scopeType: Incident['scopeType'] = 'server';
  let title = '';

  const rttBefore = baseOf((id) => pre(an[id].baselines.rttP95));
  const rttDuring = during((id) => ds.metrics[id].rttP95);
  const tickBefore = baseOf((id) => pre(an[id].baselines.tick));
  const tickDuring = during((id) => ds.metrics[id].tickP99);
  const stealBefore = baseOf((id) => pre(an[id].baselines.steal));
  const stealDuring = during((id) => ds.metrics[id].steal);

  if (cause === 'infra') {
    const [region, dc, rack] = key.split(':');
    const rackServers = ds.servers.filter((sv) => sv.region === region && sv.rack === rack);
    const others = regionServers(region as RegionId).filter((sv) => sv.rack !== rack);
    const otherSrvExcess = median(others.map((sv) => windowMedian(an[sv.id].excess.server, s, last + 1) + windowMedian(an[sv.id].excess.infra, s, last + 1)));
    scopeType = 'rack';
    scopeLabel = `${REGION_NAME[region as RegionId]} ${dc} 랙 ${rack}`;
    title = `${REGION_NAME[region as RegionId]} ${dc} 랙 ${rack} 호스트 자원 경합`;
    evidence.push({ kind: 'scope', text: `같은 랙 서버 ${serverIds.length}/${rackServers.length}대 동시 악화 (${serverIds.join(', ')})` });
    evidence.push({ kind: 'signal', text: `CPU steal ${fmt(stealBefore, 1)}% → ${fmt(stealDuring, 1)}%` });
    evidence.push({ kind: 'signal', text: `틱 p99 ${fmt(tickBefore)} → ${fmt(tickDuring)}ms (예산 50ms)` });
    if (others.length) evidence.push({ kind: 'exclude', text: `같은 권역 다른 랙은 정상 (초과 ${fmt(otherSrvExcess)}ms)` });
    evidence.push({ kind: 'exclude', text: `RTT 변화 미미 (${fmt(rttBefore)} → ${fmt(rttDuring)}ms)` });
    const multi = serverIds.length >= 2 ? 1 : 0.6;
    const hostSignal = stealDuring - stealBefore > 5 ? 1 : 0.6;
    pattern = (multi + hostSignal) / 2;
  } else if (cause === 'network') {
    const rid = key as RegionId;
    const all = regionServers(rid);
    const lossBefore = baseOf((id) => pre(an[id].baselines.loss));
    const lossDuring = during((id) => ds.metrics[id].loss);
    const jitBefore = baseOf((id) => pre(an[id].baselines.jitter));
    const jitDuring = during((id) => ds.metrics[id].jitter);
    scopeType = 'region';
    scopeLabel = `${REGION_NAME[rid]} 권역`;
    title = `${REGION_NAME[rid]} 구간 네트워크 품질 저하`;
    pattern = (serverIds.length / all.length + (tickDuring < 50 ? 1 : 0.4)) / 2;
    isps = ispModel ? ispContributions(ds, ispModel, rid, s, last) : undefined;
    const top = isps?.[0];
    if (top && top.frac >= 0.7) {
      // 통신사 경로 하나가 초과 지연 대부분을 차지 → 범위를 통신사로 좁힌다
      const others = isps!.slice(1).map((c) => `${c.name} ${fmt(c.during - c.before, 0) === '0' ? '±0' : `+${fmt(Math.max(0, c.during - c.before))}`}ms`).join(' · ');
      scopeType = 'isp';
      scopeLabel = `${REGION_NAME[rid]} · ${top.name}`;
      title = `${REGION_NAME[rid]} ${top.name} 경로 네트워크 품질 저하`;
      evidence.push({ kind: 'scope', text: `${top.name} 유저만 악화 — 권역 초과 지연의 ${Math.round(top.frac * 100)}%` });
      evidence.push({ kind: 'signal', text: `${top.name} 네트워크 성분 ${fmt(top.before)} → ${fmt(top.during)}ms (RTT p95 + 지터 + 손실)` });
      evidence.push({ kind: 'scope', text: `${REGION_NAME[rid]} 서버 ${serverIds.length}/${all.length}대에 함께 반영 — 서버·랙 무관` });
      evidence.push({ kind: 'exclude', text: `다른 통신사 정상 (${others})` });
      evidence.push({ kind: 'exclude', text: `서버 틱 정상 (p99 ${fmt(tickDuring)}ms)` });
      pattern = (top.frac + (tickDuring < 50 ? 1 : 0.4)) / 2;
    } else {
      evidence.push({ kind: 'scope', text: `${REGION_NAME[rid]} 서버 ${serverIds.length}/${all.length}대 동시 악화 — 랙 무관` });
      evidence.push({ kind: 'signal', text: `RTT p95 ${fmt(rttBefore)} → ${fmt(rttDuring)}ms` });
      evidence.push({ kind: 'signal', text: `패킷 손실 ${fmt(lossBefore, 2)}% → ${fmt(lossDuring, 1)}% · 지터 ${fmt(jitBefore)} → ${fmt(jitDuring)}ms` });
      if (isps?.length) {
        const parts = isps.filter((c) => c.frac >= 0.1).map((c) => `${c.name} ${Math.round(c.frac * 100)}%`).join(' · ');
        evidence.push({ kind: 'scope', text: `통신사별 초과 지연 기여: ${parts}` });
      }
      evidence.push({ kind: 'exclude', text: `서버 틱 정상 (p99 ${fmt(tickDuring)}ms)` });
    }
  } else if (cause === 'server') {
    const peers = regionServers(first.region).filter((sv) => sv.id !== first.id);
    const peerExcess = median(peers.map((sv) => {
      const ex = an[sv.id].excess;
      return windowMedian(ex.server, s, last + 1) + windowMedian(ex.infra, s, last + 1) + windowMedian(ex.network, s, last + 1);
    }));
    scopeType = 'server';
    scopeLabel = `${first.id} ${first.name}`;
    title = `${first.id} 게임 서버 틱 지연`;
    evidence.push({ kind: 'scope', text: `${first.id} 단독 악화 — 같은 권역 ${peers.length}대 정상 (초과 ${fmt(peerExcess)}ms)` });
    evidence.push({ kind: 'signal', text: `틱 p99 ${fmt(tickBefore)} → ${fmt(tickDuring)}ms (예산 50ms)` });
    evidence.push({ kind: 'exclude', text: `호스트 정상 (CPU steal ${fmt(stealDuring, 1)}%)` });
    evidence.push({ kind: 'exclude', text: `RTT 정상 (p95 ${fmt(rttDuring)}ms)` });
    pattern = ((peerExcess < 10 ? 1 : 0.4) + (stealDuring - stealBefore < 3 ? 1 : 0.3)) / 2;
  } else {
    const share = median(serverIds.map((id) => ds.metrics[id].newShare[last]));
    const fNew = during((id) => ds.metrics[id].frameNew);
    const fOld = during((id) => ds.metrics[id].frameOld);
    const regions = new Set(serverIds.map((id) => ds.servers.find((sv) => sv.id === id)!.region));
    const patchMin = Math.round((ds.times[s] - PATCH_TIME) / 60000);
    scopeType = 'global';
    scopeLabel = `전 권역 · 클라 ${NEW_CLIENT_VERSION}`;
    title = `클라 ${NEW_CLIENT_VERSION} 프레임 스톨`;
    evidence.push({ kind: 'scope', text: `${regions.size}개 권역 ${serverIds.length}/${ds.servers.length}대에서 동시 발생 — 지역·랙 무관` });
    evidence.push({ kind: 'signal', text: `프레임 p95: ${NEW_CLIENT_VERSION} ${fmt(fNew)}ms vs ${OLD_CLIENT_VERSION} ${fmt(fOld)}ms` });
    evidence.push({ kind: 'signal', text: `패치 배포 ${patchMin >= 0 ? `${patchMin}분 후` : `${-patchMin}분 전`} 시작 · 신버전 비율 ${fmt(share * 100)}%` });
    evidence.push({ kind: 'exclude', text: `RTT·서버 틱 정상 (RTT p95 ${fmt(rttDuring)}ms, 틱 ${fmt(tickDuring)}ms)` });
    pattern = ((regions.size >= 3 ? 1 : 0.5) + (fNew > fOld * 2 ? 1 : 0.5)) / 2;
  }
  return { evidence, pattern, scopeLabel, scopeType, title, isps };
}

/** 통신사별 초과 지연 기여 = 유저 비중 × max(0, 장애 중 네트워크 성분 중앙값 − 기준선) */
export function ispContributions(ds: Dataset, ispModel: IspModel, rid: RegionId, s: number, last: number): IspContribution[] {
  const defs = REGION_ISPS[rid];
  const users = defs.map((_, i) => ispUsers(ds, rid, i, s));
  const total = users.reduce((a, b) => a + b, 0) || 1;
  const rows = defs.map((d, i) => {
    const a = ispModel[rid][d.id];
    const before = a.baselines.net.med[s];
    const during = windowMedian(a.net, s, last + 1);
    return { id: d.id, name: d.name, w: (users[i] / total) * Math.max(0, during - before), before, during };
  });
  const sum = rows.reduce((a, r) => a + r.w, 0) || 1;
  return rows
    .map(({ w, ...r }) => ({ ...r, frac: w / sum }))
    .sort((a, b) => b.frac - a.frac);
}
