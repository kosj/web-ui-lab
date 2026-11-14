import { describe, expect, it } from 'vitest';
import { cardSize, makeGeometry, nodeLayout, placeCards } from '../geo';
import type { RegionId } from '../../data/config';

/** 지도 노드 배치 회귀 — 폭이 바뀌어도 노드(위성 궤도 포함)가 서로 겹치지 않고 지도 안에 있어야 한다 */
describe('command map layout', () => {
  for (const w of [360, 560, 760, 1000, 1280, 1600]) {
    it(`w=${w}: 노드 궤도가 겹치지 않고 지도 안에 있다`, () => {
      const g = makeGeometry(w, w >= 760 ? Math.max(w * 0.42, 420) : undefined);
      const lay = nodeLayout(g);
      const ids = Object.keys(lay) as RegionId[];
      const R = lay.KR.ring;
      for (const id of ids) {
        const [x, y] = lay[id].node;
        expect(x - R).toBeGreaterThanOrEqual(0);
        expect(y - R).toBeGreaterThanOrEqual(0);
        expect(x + R).toBeLessThanOrEqual(g.w);
        expect(y + R).toBeLessThanOrEqual(g.h);
      }
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = lay[ids[i]].node;
          const b = lay[ids[j]].node;
          expect(Math.hypot(a[0] - b[0], a[1] - b[1]), `${ids[i]}–${ids[j]}`).toBeGreaterThan(2 * R + 8);
        }
      }
    });
  }
  for (const [w, h] of [[1090, 590], [1520, 620], [1092, 474], [760, 330], [700, 304], [366, 215], [1000, 399], [1240, 540]] as const) {
    it(`카드 배치 ${w}×${h}: 지도 안, 서로 겹치지 않음`, () => {
      const g = makeGeometry(w, h);
      const lay = nodeLayout(g);
      const card = cardSize(g.u);
      const rects = Object.values(placeCards(lay, g, card, lay.KR.ring + card.gapExtra));
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(w);
        expect(r.y + r.h).toBeLessThanOrEqual(h);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ox > 0 && oy > 0, `${i}-${j}`).toBe(false);
        }
      }
    });
  }
});
