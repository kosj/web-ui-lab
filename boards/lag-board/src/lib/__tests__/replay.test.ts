import { describe, expect, test } from 'vitest';
import { replayIndex } from '../useReplay';

describe('replay engine', () => {
  test('advances speed minutes per second and clamps at the end', () => {
    const win = { from: 100, to: 400 };
    expect(replayIndex(win, 0, 30)).toBe(100);
    expect(replayIndex(win, 1000, 30)).toBe(130);
    expect(replayIndex(win, 2500, 10)).toBe(125);
    expect(replayIndex(win, 60_000, 60)).toBe(400);
  });
});
