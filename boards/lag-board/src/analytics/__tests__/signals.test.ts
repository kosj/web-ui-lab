import { beforeAll, describe, expect, test } from 'vitest';
import { buildModel, type BoardModel } from '../model';
import { anscombe, coincidence, doseResponse, eventOnsets, getSignals, periEvent, poissonTail } from '../signals';
import { CHAT_MODEL, VOICE_SCENARIOS } from '../../data/chat';
import { MINUTE, NOW, SCENARIOS } from '../../data/config';

/**
 * 채팅 제보 × TCP 재전송 분석이 가상 데이터에 심어 둔 "정답"을 되찾는지 검증한다.
 * 정답: 꺾임점 175ms, 재전송 1%p당 ×e^0.35, 제보 지연 1~12분, 사각지대(대만 로딩), 도배(북미).
 */
let m: BoardModel;
beforeAll(() => { m = buildModel(); });
const idxOf = (ts: number) => m.last - Math.round((NOW - ts) / MINUTE);

describe('primitives', () => {
  test('anscombe residual is ~0 at expectation and grows with excess', () => {
    expect(Math.abs(anscombe(10, 10))).toBeLessThan(0.05);
    expect(anscombe(40, 10)).toBeGreaterThan(5);
  });
  test('poisson tail', () => {
    expect(poissonTail(0, 3)).toBe(1);
    expect(poissonTail(1, 0.1)).toBeCloseTo(1 - Math.exp(-0.1), 6);
  });
  test('event onsets need a sustained run and are declustered', () => {
    const z = [0, 5, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, ...Array(30).fill(0), 5, 5, 5];
    expect(eventOnsets(z, 0, z.length - 1, 4, 3, 15)).toEqual([3, 42]);
  });
});

describe('chat reports vs TCP retransmission', () => {
  test('spikes co-occur far beyond chance (event coincidence analysis)', () => {
    const c = coincidence(m, {}, m.viewFrom, m.last);
    expect(c.precursorHits).toBeGreaterThan(c.precursorExpected * 10);
    expect(c.precursorP).toBeLessThan(1e-4);
    // 하지만 모든 제보 급증이 재전송 때문은 아니다 (서버·인프라·클라·사각지대)
    expect(c.precursorHits).toBeLessThan(c.reportEvents);
  });

  test('in the cable-loss region every report spike was preceded by a retransmission spike', () => {
    const c = coincidence(m, { region: 'SEA' }, m.viewFrom, m.last);
    expect(c.reportEvents).toBeGreaterThan(0);
    expect(c.precursorHits).toBe(c.reportEvents);
  });

  test('peri-event: reports rise a few minutes after retransmission spikes', () => {
    const p = periEvent(m, { region: 'SEA' }, m.viewFrom, m.last);
    expect(p.events).toBeGreaterThanOrEqual(3);
    expect(p.effect.lo).toBeGreaterThan(0.5);
    expect(p.riseLag).not.toBeNull();
    expect(p.riseLag!).toBeGreaterThanOrEqual(1);
    expect(p.riseLag!).toBeLessThanOrEqual(CHAT_MODEL.delayMax);
  });

  test('dose–response recovers the designed breakpoint and retransmission effect', () => {
    const d = doseResponse(m, {}, m.viewFrom, m.last, 3);
    expect(Math.abs(d.fit.T - CHAT_MODEL.breakpoint)).toBeLessThanOrEqual(30);
    expect(d.fit.c).toBeGreaterThan(CHAT_MODEL.gamma - 0.15);
    expect(d.fit.c).toBeLessThan(CHAT_MODEL.gamma + 0.15);
    // 원값 구간 평균도 꺾임점 위에서 확실히 높다
    const low = d.byEl.find((b) => b.hi <= 110)!;
    const high = d.byEl.find((b) => b.lo >= 300)!;
    expect(high.rate).toBeGreaterThan(low.rate * 5);
  });

  test('incident evidence: retransmission confirms network incidents and is absent for others', () => {
    for (const inc of m.incidents) {
      const tcp = inc.evidence.find((e) => e.text.includes('TCP 재전송'))!;
      expect(tcp, inc.id).toBeDefined();
      if (inc.cause === 'network') {
        expect(tcp.kind, inc.title).toBe('signal');
        expect(inc.voice!.retransUp).toBe(true);
      } else {
        expect(tcp.kind, inc.title).toBe('exclude');
      }
      expect(inc.voice!.reportX, inc.title).toBeGreaterThan(1.5);
    }
    const cable = m.incidents.find((i) => i.cause === 'network' && i.region === 'SEA')!;
    expect(cable.voice!.reportX).toBeGreaterThan(10);
  });
});

describe('measurement blind spot and spam', () => {
  test('the TW loading lag is the only blind spot', () => {
    const v1 = VOICE_SCENARIOS.find((v) => v.kind === 'blindspot')!;
    expect(m.blindSpots).toHaveLength(1);
    const b = m.blindSpots[0];
    expect(b.region).toBe('TW');
    expect(b.serverIds.every((id) => v1.servers.includes(id))).toBe(true);
    expect(Math.abs(m.ds.times[b.onsetIdx] - v1.start)).toBeLessThanOrEqual(20 * MINUTE);
    expect(b.topCategory).toBe('loading');
  });

  test('copy-paste spam is filtered and does not look like a lag spike', () => {
    const v2 = VOICE_SCENARIOS.find((v) => v.kind === 'spam')!;
    const s = getSignals(m, { serverId: v2.servers[0] });
    const a = idxOf(v2.start);
    const b = idxOf(v2.end) - 1;
    let dropped = 0;
    for (let t = a; t <= b; t++) { dropped += s.spamDropped[t]; expect(s.reportZ5[t]).toBeLessThan(4); }
    expect(dropped).toBeGreaterThan(100);
  });

  test('designed lag scenarios are unchanged by the new signals', () => {
    expect(m.incidents).toHaveLength(SCENARIOS.length);
  });
});
