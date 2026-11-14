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
      const inc = m.incidents.find((i) => i.cause === sc.cause);
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
    });
  }

  test('quiet hours stay quiet — at most a few isolated burst minutes ≥150ms before 02:00', () => {
    const end = m.viewFrom + 5 * 60; // 표시 시작 21:01 ~ 다음날 02:01
    for (const [rid, agg] of Object.entries(m.regions)) {
      let hot = 0;
      for (let t = m.viewFrom; t < end; t++) if (agg.p95[t] >= 150) hot++;
      expect(hot, rid).toBeLessThanOrEqual(3);
    }
  });
});
