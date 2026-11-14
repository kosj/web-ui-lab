import { describe, expect, test } from 'vitest';
import { cusum, ewma, mad, median, quantile, robustZ, weightedQuantile } from '../stats';

describe('robust stats', () => {
  test('median / quantile', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([0, 10], 0.95)).toBeCloseTo(9.5);
  });
  test('MAD is insensitive to a single outlier', () => {
    const base = [10, 11, 9, 10, 12, 8, 10];
    expect(mad([...base, 10_000])).toBeLessThanOrEqual(mad(base) + 1);
  });
  test('robust z', () => {
    expect(robustZ(14, 10, 2)).toBeCloseTo(4 / (1.4826 * 2));
    expect(Number.isFinite(robustZ(5, 5, 0))).toBe(true);
  });
  test('weighted quantile follows the users, not the servers', () => {
    // 서버 3대 중 1대만 느리지만 유저 80%가 그 서버에 있다 → p95는 느린 값
    expect(weightedQuantile([50, 50, 400], [10, 10, 80], 0.95)).toBe(400);
    expect(weightedQuantile([50, 50, 400], [45, 50, 5], 0.5)).toBe(50);
  });
  test('ewma smooths a spike', () => {
    const s = ewma([0, 0, 100, 0, 0], 0.3);
    expect(s[2]).toBeCloseTo(30);
    expect(s[3]).toBeCloseTo(21);
  });
  test('cusum finds onset of a mean shift', () => {
    const z = [...Array(50).fill(0), ...Array(30).fill(2)];
    const r = cusum(z, 0.5, 5);
    expect(r.alarms.length).toBeGreaterThan(0);
    expect(r.onsets[0]).toBe(50);
    expect(r.alarms[0]).toBeGreaterThanOrEqual(50);
    expect(r.alarms[0]).toBeLessThan(56);
  });
});
