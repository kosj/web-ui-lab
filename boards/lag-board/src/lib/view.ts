import { isActiveAt, type BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import { ATTR_PARAMS } from '../analytics/attribution';
import { tierOf, type Cause, type Tier } from '../data/config';

export type RangeKey = '1h' | '6h' | '24h';
export const RANGE_MIN: Record<RangeKey, number> = { '1h': 60, '6h': 360, '24h': 1440 };
export const RANGE_LABEL: Record<RangeKey, string> = { '1h': '1시간', '6h': '6시간', '24h': '24시간' };
export const RANGE_BIN: Record<RangeKey, number> = { '1h': 1, '6h': 2, '24h': 5 };

export const CAUSE_ORDER: Cause[] = ['infra', 'network', 'server', 'client'];
export const TIER_RANK: Record<Tier, number> = { smooth: 0, good: 1, notice: 2, warning: 3, critical: 4 };

export interface ServerNow {
  el: number;
  tier: Tier;
  dominant: Cause | null;
  excess: Record<Cause, number>;
  base: number;
  ccu: number;
}

export function serverNow(m: BoardModel, id: string, t: number): ServerNow {
  const a = m.an[id];
  const excess = {
    infra: a.excess.infra[t], network: a.excess.network[t], server: a.excess.server[t], client: a.excess.client[t],
  };
  let dominant: Cause | null = null;
  let best: number = ATTR_PARAMS.memberMs;
  for (const c of CAUSE_ORDER) if (excess[c] >= best) { best = excess[c]; dominant = c; }
  return { el: a.el[t], tier: tierOf(a.el[t]), dominant, excess, base: a.base[t], ccu: m.ds.metrics[id].ccu[t] };
}

export function incidentTierAt(m: BoardModel, inc: Incident, t: number): Tier {
  let worst = 0;
  for (const id of inc.serverIds) worst = Math.max(worst, m.an[id].el[t]);
  return tierOf(worst);
}

export function activeIncidents(m: BoardModel, t: number) {
  return m.incidents.filter((i) => isActiveAt(i, t));
}

/** 범위 내 분 인덱스 [from, to] */
export function rangeIdx(m: BoardModel, range: RangeKey) {
  const to = m.last;
  return { from: Math.max(m.viewFrom, to - RANGE_MIN[range] + 1), to };
}

export function slice(arr: ArrayLike<number>, from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => arr[from + i]);
}

/** 구간 평균으로 다운샘플 */
export function binMean(arr: ArrayLike<number>, from: number, to: number, bin: number) {
  const out: number[] = [];
  for (let s = from; s <= to; s += bin) {
    let acc = 0;
    let k = 0;
    for (let t = s; t < Math.min(to + 1, s + bin); t++) { acc += arr[t]; k++; }
    out.push(acc / k);
  }
  return out;
}
