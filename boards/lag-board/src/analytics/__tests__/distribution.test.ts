import { beforeAll, describe, expect, test } from 'vitest';
import { buildModel, type BoardModel } from '../model';
import { bimodal, computeDistribution, cdfAt, EL_EDGES, quantileFromCdf } from '../distribution';
import { fromP50P95, mixtureQuantile, normCdf } from '../lognormal';
import { kst, NOW, REGION_ISPS } from '../../data/config';
import { ispUsers } from '../isp';

let m: BoardModel;
beforeAll(() => { m = buildModel(); });

const idxOf = (ts: number) => m.last - Math.round((NOW - ts) / 60000);

describe('lognormal', () => {
  test('normCdf', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.6448536)).toBeCloseTo(0.95, 5);
  });
  test('p50/p95 round-trip', () => {
    const d = fromP50P95(40, 90);
    expect(mixtureQuantile([d], 0.5)).toBeCloseTo(40, 0);
    expect(mixtureQuantile([d], 0.95)).toBeCloseTo(90, 0);
  });
});

describe('user latency distribution', () => {
  test('bucket shares sum to 1', () => {
    const d = computeDistribution(m, {}, m.last - 30, m.last, 5);
    for (const col of d.shares) expect(col.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });

  test('LG U+ incident splits Korea into two bands: ~LG U+ share above 150ms while median stays smooth', () => {
    const t = idxOf(kst(14, 15, 45));
    const { cdf } = cdfAt(m, { region: 'KR' }, t);
    const over150 = 1 - cdf[EL_EDGES.indexOf(150)];
    const lguIdx = REGION_ISPS.KR.findIndex((i) => i.id === 'LGU');
    const total = REGION_ISPS.KR.reduce((a, _, i) => a + ispUsers(m.ds, 'KR', i, t), 0);
    const lguShare = ispUsers(m.ds, 'KR', lguIdx, t) / total;
    expect(over150).toBeGreaterThan(lguShare * 0.8);
    expect(over150).toBeLessThan(lguShare * 1.3);
    expect(quantileFromCdf(cdf, 0.5)).toBeLessThan(100);
  });

  test('filtering to the affected ISP shows nearly everyone above 150ms', () => {
    const t = idxOf(kst(14, 15, 45));
    const { cdf } = cdfAt(m, { region: 'KR', isp: 'LGU' }, t);
    expect(1 - cdf[EL_EDGES.indexOf(150)]).toBeGreaterThan(0.8);
    const other = cdfAt(m, { region: 'KR', isp: 'KT' }, t).cdf;
    expect(1 - other[EL_EDGES.indexOf(150)]).toBeLessThan(0.05);
  });

  test('two-band detector fires for the ISP-only incident, not for normal geography', () => {
    const at = (h: number, mm: number) => idxOf(kst(14, h, mm));
    const col = (scope: Parameters<typeof cdfAt>[1], t: number) => computeDistribution(m, scope, t, t, 1).shares[0];
    expect(bimodal(col({ region: 'KR' }, at(15, 45)))).not.toBeNull();
    expect(bimodal(col({ region: 'KR' }, at(14, 0)))).toBeNull();
    expect(bimodal(col({}, at(9, 0)))).toBeNull();
  });
});
