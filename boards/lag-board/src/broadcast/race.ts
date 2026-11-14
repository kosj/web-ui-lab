/**
 * 라이브 중계 화면의 순수 데이터 — 타이밍 타워 순위, 관제 메시지(레이스 컨트롤), 하이라이트 목록.
 * UI 없이 테스트한다 (__tests__/race.test.ts).
 */
import type { BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import { CAUSE_LABEL, MINUTE, PATCH_TIME, NEW_CLIENT_VERSION, REGIONS, TIER_LABEL, tierOf, type Cause, type RegionId, type Tier } from '../data/config';
import { incidentTierAt, serverNow, TIER_RANK } from '../lib/view';
import { fmtCompact, fmtDuration, fmtInt, hhmm } from '../lib/format';

const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name])) as Record<RegionId, string>;

/** 순위는 최근 5분 평균으로 매긴다 — 분 단위 잡음으로 순위가 계속 뒤바뀌지 않게 (F1 순위가 랩 타임 기준인 것과 같은 이유) */
export const RANK_WINDOW = 5;
/** 순위 변동 비교 시점 (분 전) */
export const RANK_LOOKBACK = 10;

export interface RankRow {
  id: string;
  name: string;
  region: RegionId;
  rack: string;
  rank: number;
  /** 양수 = 10분 전보다 순위가 올라감(= 더 나빠짐) */
  change: number;
  /** 최근 5분 평균 체감 지연 */
  avg: number;
  /** 지금 이 분의 체감 지연 */
  el: number;
  base: number;
  /** 기준선 대비 (5분 평균 − 기준선) */
  excess: number;
  tier: Tier;
  cause: Cause | null;
}

function mean(arr: ArrayLike<number>, t: number, w = RANK_WINDOW) {
  let s = 0;
  let k = 0;
  for (let i = Math.max(0, t - w + 1); i <= t; i++) { s += arr[i]; k++; }
  return k ? s / k : 0;
}

/** 체감 지연이 나쁜 순 (1위 = 가장 나쁨). region을 주면 그 권역 서버만 */
export function rankServers(m: BoardModel, t: number, region: RegionId | null = null): RankRow[] {
  const servers = m.ds.servers.filter((s) => !region || s.region === region);
  const order = (tt: number) => servers
    .map((s) => ({ s, v: mean(m.an[s.id].el, tt) }))
    .sort((a, b) => b.v - a.v || a.s.id.localeCompare(b.s.id));
  const before = new Map(order(Math.max(m.viewFrom, t - RANK_LOOKBACK)).map((x, i) => [x.s.id, i + 1]));
  return order(t).map((x, i) => {
    const sn = serverNow(m, x.s.id, t);
    const base = mean(m.an[x.s.id].base, t);
    return {
      id: x.s.id, name: x.s.name, region: x.s.region, rack: x.s.rack,
      rank: i + 1, change: (before.get(x.s.id) ?? i + 1) - (i + 1),
      avg: x.v, el: sn.el, base, excess: x.v - base, tier: tierOf(x.v), cause: sn.dominant,
    };
  });
}

/** 순위 고정 문턱 (ms) — 이보다 작게 앞선 서버는 자리를 바꾸지 않는다 */
export const RANK_HYSTERESIS = 3;

/**
 * 순위 안정화(히스테리시스) — 이전 순서에서 출발해, 바로 위 서버보다 H ms 넘게 나쁠 때만 한 칸씩 올린다(삽입 정렬).
 * 값이 거의 같은 서버끼리 재생 틱마다 자리를 바꿔 타워가 출렁이는 것을 막는다. 순위가 바뀌면 의미 있는 변화다.
 * 결과는 "인접한 두 줄의 값 차이가 H 이하일 때만 순서가 뒤집혀 있을 수 있다"를 만족한다.
 */
export function stabilizeRanks(raw: RankRow[], prev: Map<string, number>, h = RANK_HYSTERESIS): RankRow[] {
  const arr = [...raw].sort((a, b) => (prev.get(a.id) ?? 1e6 + a.rank) - (prev.get(b.id) ?? 1e6 + b.rank));
  for (let i = 1; i < arr.length; i++) {
    for (let j = i; j > 0 && arr[j].avg > arr[j - 1].avg + h; j--) {
      [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]];
    }
  }
  return arr.map((r, i) => ({ ...r, rank: i + 1 }));
}

export type MsgKind = 'detect' | 'escalate' | 'resolve' | 'deploy' | 'blind';
export interface RaceMsg {
  id: string;
  /** 메시지 시각 (분 인덱스) */
  idx: number;
  kind: MsgKind;
  level: Tier | 'info' | 'resolved';
  cause?: Cause;
  region?: RegionId;
  incidentId?: string;
  /** 짧은 머리말: "경보", "격상", "해소" … */
  tag: string;
  title: string;
  detail: string;
}

/** 등급이 3분 이상 유지된 첫 시점 — 한두 분 튀는 값으로 격상 메시지를 내지 않는다 */
function sustainedTierStart(m: BoardModel, inc: Incident, tier: Tier, from: number, to: number) {
  let run = 0;
  for (let t = from; t <= to; t++) {
    run = TIER_RANK[incidentTierAt(m, inc, t)] >= TIER_RANK[tier] ? run + 1 : 0;
    if (run >= 3) return t - 2;
  }
  return null;
}

/** 하루 동안의 관제 메시지 — 장애 감지·격상·해소, 배포, 측정 사각지대. 시각순 */
export function raceMessages(m: BoardModel): RaceMsg[] {
  const out: RaceMsg[] = [];
  for (const inc of m.incidents) {
    // 감지는 그 자체로 경보다 — 감지 순간 값이 아직 낮아도 '주의'로 올려 보인다
    const at0 = incidentTierAt(m, inc, inc.detectIdx);
    const lvl: Tier = TIER_RANK[at0] >= TIER_RANK.notice ? at0 : 'notice';
    out.push({
      id: `${inc.id}:detect`, idx: inc.detectIdx, kind: 'detect', level: lvl, cause: inc.cause, region: inc.region, incidentId: inc.id,
      tag: '경보', title: inc.title,
      detail: `${inc.scopeLabel} · ${CAUSE_LABEL[inc.cause]} 판정 · 신뢰도 ${Math.round(inc.confidence * 100)}% · 시작 추정 ${hhmm(m.ds.times[inc.onsetIdx])}`,
    });
    const end = inc.endIdx ?? m.last;
    let floor = TIER_RANK[lvl];
    for (const tier of ['warning', 'critical'] as Tier[]) {
      if (TIER_RANK[tier] <= floor) continue;
      const at = sustainedTierStart(m, inc, tier, inc.detectIdx + 1, end - 1);
      if (at === null) continue;
      floor = TIER_RANK[tier];
      const worst = Math.max(...inc.serverIds.map((id) => m.an[id].el[at]));
      out.push({
        id: `${inc.id}:${tier}`, idx: at, kind: 'escalate', level: tier, cause: inc.cause, region: inc.region, incidentId: inc.id,
        tag: '격상', title: `${inc.title} — ${TIER_LABEL[tier]}`,
        detail: `가장 나쁜 서버 ${fmtInt(worst)}ms · ${fmtDuration(at - inc.onsetIdx)}째`,
      });
    }
    if (inc.endIdx !== null) {
      out.push({
        id: `${inc.id}:resolve`, idx: inc.endIdx, kind: 'resolve', level: 'resolved', cause: inc.cause, region: inc.region, incidentId: inc.id,
        tag: '해소', title: inc.title,
        detail: `지속 ${fmtDuration(inc.endIdx - inc.onsetIdx)} · 최고 ${fmtInt(inc.peakEl)}ms · 최대 영향 ${fmtCompact(inc.peakUsers)}명`,
      });
    }
  }
  const patchIdx = Math.round((PATCH_TIME - m.ds.start) / MINUTE);
  if (patchIdx >= m.viewFrom && patchIdx <= m.last) {
    out.push({
      id: 'deploy', idx: patchIdx, kind: 'deploy', level: 'info',
      tag: '배포', title: `클라이언트 ${NEW_CLIENT_VERSION} 배포 시작`, detail: '전 권역 단계 배포 · 변경 이력 연동',
    });
  }
  for (const b of m.blindSpots) {
    out.push({
      id: `${b.id}:blind`, idx: Math.min(m.last, b.onsetIdx + 5), kind: 'blind', level: 'info', region: b.region,
      tag: '사각지대', title: `${REGION_NAME[b.region]} 제보 급증 — 지표는 정상`,
      detail: `채팅 렉 제보 평소의 ${b.peakX.toFixed(1)}배 · 서버 ${b.serverIds.length}대 · 측정 밖 렉 의심`,
    });
  }
  return out.sort((a, b) => a.idx - b.idx || a.id.localeCompare(b.id));
}

/** 하이라이트 = 오늘의 장애를 시작 순으로. 재생 구간은 시작 15분 전 ~ 해소 10분 후 */
export function highlights(m: BoardModel) {
  return [...m.incidents]
    .sort((a, b) => a.onsetIdx - b.onsetIdx)
    .map((inc) => ({
      inc,
      from: Math.max(m.viewFrom, inc.onsetIdx - 15),
      to: Math.min(m.last, (inc.endIdx ?? m.last) + 10),
    }));
}
