import { beforeAll, describe, expect, test } from 'vitest';
import { buildModel, type BoardModel } from '../model';
import { MINUTE, SCENARIOS } from '../../data/config';

/**
 * 가상 데이터에 주입한 "정답" 시나리오를 분류기가 지표만으로 맞히는지 검증.
 * 판별 로직·임계값을 바꿀 때 회귀를 잡는 안전망이다.
 */
let m: BoardModel;
beforeAll(() => { m = buildModel(); });

describe('lag cause classifier recovers injected scenarios', () => {
  test('exactly one incident per scenario, no false positives', () => {
    expect(m.incidents).toHaveLength(SCENARIOS.length);
  });

  for (const sc of SCENARIOS) {
    test(`${sc.id} ${sc.title}`, () => {
      // 같은 원인의 장애가 여럿일 수 있으므로 시작 시각이 가장 가까운 것을 매칭
      const inc = m.incidents
        .filter((i) => i.cause === sc.cause)
        .sort((a, b) => Math.abs(m.ds.times[a.onsetIdx] - sc.start) - Math.abs(m.ds.times[b.onsetIdx] - sc.start))[0];
      expect(inc, `no ${sc.cause} incident`).toBeDefined();
      const onset = m.ds.times[inc!.onsetIdx];
      // 시작 시각 추정 오차 10분 이내
      expect(Math.abs(onset - sc.start)).toBeLessThanOrEqual(10 * MINUTE);
      // 진행 중 여부 일치
      expect(inc!.endIdx === null).toBe(sc.end === null);
      // 감지는 시작 이후
      expect(inc!.detectIdx).toBeGreaterThanOrEqual(inc!.onsetIdx);
      // 범위 일치
      if (sc.target.servers) expect(inc!.serverIds).toEqual(sc.target.servers);
      if (sc.target.region) expect(inc!.region).toBe(sc.target.region);
      if (sc.target.rack) expect(inc!.serverIds.every((id) => m.ds.servers.find((s) => s.id === id)!.rack === sc.target.rack)).toBe(true);
      expect(inc!.confidence).toBeGreaterThan(0.7);
      // 통신사 범위: 한 통신사에만 주입한 장애는 그 통신사로 좁혀져야 하고, 여러 통신사면 권역 범위 유지
      if (sc.target.isps) {
        const weights = Object.entries(sc.target.isps).sort((a, b) => b[1] - a[1]);
        const single = weights.length === 1;
        expect(inc!.scopeType).toBe(single ? 'isp' : 'region');
        expect(inc!.isps?.[0] && sc.target.isps[inc!.isps[0].id]).toBeGreaterThanOrEqual(weights[1]?.[1] ?? 1);
      }
    });
  }

  test('quiet hours stay quiet — no sustained (3+ consecutive minutes) region tail ≥150ms before 02:00', () => {
    const end = m.viewFrom + 5 * 60; // 표시 시작 21:01 ~ 다음날 02:01
    for (const [rid, agg] of Object.entries(m.regions)) {
      let run = 0;
      let longest = 0;
      for (let t = m.viewFrom; t < end; t++) {
        run = agg.p95[t] >= 150 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      // 단발성 패킷 버스트(1~2분)는 허용, 3분 이상 지속은 오탐
      expect(longest, rid).toBeLessThan(3);
    }
  });
});
