import { describe, expect, it } from 'vitest';
import { buildModel } from '../../analytics/model';
import { highlights, raceMessages, rankServers, RANK_HYSTERESIS, stabilizeRanks } from '../race';

const m = buildModel();

describe('라이브 중계 — 타이밍 타워', () => {
  it('지금 1위는 한국 랙 R2 서버 (인프라 장애 진행 중)', () => {
    const rows = rankServers(m, m.last);
    expect(rows).toHaveLength(36);
    expect(rows[0].region).toBe('KR');
    expect(rows[0].rack).toBe('R2');
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].avg).toBeGreaterThanOrEqual(rows[i].avg);
  });
  it('권역 필터와 순위 변동', () => {
    const jp = rankServers(m, m.last, 'JP');
    expect(jp.every((r) => r.region === 'JP')).toBe(true);
    // 동남아 케이블 장애 시작 무렵: 동남아 서버가 10분 사이 순위를 끌어올린다
    const s2 = m.incidents.find((i) => i.region === 'SEA' && i.cause === 'network')!;
    const rows = rankServers(m, s2.detectIdx + 8);
    expect(rows.slice(0, 6).every((r) => r.region === 'SEA')).toBe(true);
    expect(rows.slice(0, 6).some((r) => r.change > 0)).toBe(true);
  });
});

describe('라이브 중계 — 순위 안정화', () => {
  it('이전 순서가 없으면 그냥 값 순서, 있으면 차이가 문턱 이하일 때만 뒤집힘을 허용', () => {
    const raw = rankServers(m, m.last);
    expect(stabilizeRanks(raw, new Map()).map((r) => r.id)).toEqual(raw.map((r) => r.id));
    // 거꾸로 된 이전 순서에서 출발해도 문턱보다 큰 역전은 남지 않는다
    const reversed = new Map(raw.map((r, i) => [r.id, raw.length - i]));
    const st = stabilizeRanks(raw, reversed);
    for (let i = 1; i < st.length; i++) expect(st[i].avg - st[i - 1].avg).toBeLessThanOrEqual(RANK_HYSTERESIS + 1e-9);
    expect(st.map((r) => r.rank)).toEqual(st.map((_, i) => i + 1));
  });
  it('재생처럼 4분씩 넘길 때 자리 바뀜이 줄어든다', () => {
    let prev = new Map<string, number>();
    let swapsRaw = 0;
    let swapsSt = 0;
    let lastRaw: string[] = [];
    let lastSt: string[] = [];
    for (let t = m.last - 180; t <= m.last; t += 4) {
      const raw = rankServers(m, t);
      const st = stabilizeRanks(raw, prev);
      prev = new Map(st.map((r) => [r.id, r.rank]));
      const ids = raw.map((r) => r.id).slice(0, 16);
      const sids = st.map((r) => r.id).slice(0, 16);
      if (lastRaw.length) {
        swapsRaw += ids.filter((id, i) => lastRaw[i] !== id).length;
        swapsSt += sids.filter((id, i) => lastSt[i] !== id).length;
      }
      lastRaw = ids;
      lastSt = sids;
    }
    expect(swapsSt).toBeLessThan(swapsRaw * 0.7);
  });
});

describe('라이브 중계 — 관제 메시지', () => {
  const msgs = raceMessages(m);
  it('장애마다 감지 메시지, 해소된 장애는 해소 메시지', () => {
    for (const inc of m.incidents) {
      expect(msgs.some((x) => x.id === `${inc.id}:detect` && x.idx === inc.detectIdx)).toBe(true);
      expect(msgs.some((x) => x.id === `${inc.id}:resolve`)).toBe(inc.endIdx !== null);
    }
  });
  it('시각순 정렬, 배포·사각지대 포함, 격상은 감지 뒤', () => {
    for (let i = 1; i < msgs.length; i++) expect(msgs[i].idx).toBeGreaterThanOrEqual(msgs[i - 1].idx);
    expect(msgs.some((x) => x.kind === 'deploy')).toBe(true);
    expect(msgs.filter((x) => x.kind === 'blind')).toHaveLength(m.blindSpots.length);
    for (const e of msgs.filter((x) => x.kind === 'escalate')) {
      const inc = m.incidents.find((i) => i.id === e.incidentId)!;
      expect(e.idx).toBeGreaterThan(inc.detectIdx);
    }
  });
  it('하이라이트는 장애 수만큼, 시작 순, 창이 장애를 감싼다', () => {
    const h = highlights(m);
    expect(h).toHaveLength(m.incidents.length);
    for (let i = 1; i < h.length; i++) expect(h[i].inc.onsetIdx).toBeGreaterThanOrEqual(h[i - 1].inc.onsetIdx);
    for (const x of h) {
      expect(x.from).toBeLessThanOrEqual(x.inc.onsetIdx);
      expect(x.to).toBeGreaterThanOrEqual(x.inc.endIdx ?? m.last);
    }
  });
});
