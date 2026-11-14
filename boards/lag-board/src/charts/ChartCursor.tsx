import { useEffect, useRef } from 'react';
import type { ECharts } from './echarts';

interface Rect { x: number; y: number; width: number; height: number }

/**
 * 시간 커서 — 차트 위에 얹는 HTML 세로선.
 * 위치만 CSS transform으로 옮기므로 재생 중 매 틱마다 차트를 다시 그리지 않고, 전환(transition)으로 미끄러지듯 이동한다.
 * index: x축 카테고리 인덱스. grids: 커서가 세로로 걸칠 grid 인덱스들.
 */
export function ChartCursor({ chart, index, grids = [0], label, mask = false }: {
  chart: ECharts | null; index: number; grids?: number[]; label?: string;
  /** 재생 중: 커서 오른쪽(아직 오지 않은 시간)을 흐리게 덮는다 */
  mask?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const maskEl = useRef<HTMLDivElement>(null);
  const idx = useRef(index);
  idx.current = index;

  useEffect(() => {
    if (!chart || !el.current) return;
    const node = el.current;
    const place = () => {
      try {
        const x = chart.convertToPixel({ xAxisIndex: 0 }, idx.current) as number;
        // getModel은 공식 타입에 없지만 grid 사각형을 얻는 안정적인 방법이다
        const model = (chart as unknown as { getModel: () => { getComponent: (t: string, i: number) => { coordinateSystem: { getRect: () => Rect } } } }).getModel();
        const rects = grids.map((g) => model.getComponent('grid', g).coordinateSystem.getRect());
        const top = Math.min(...rects.map((r) => r.y));
        const bottom = Math.max(...rects.map((r) => r.y + r.height));
        if (!Number.isFinite(x)) throw new Error('no x');
        node.style.transform = `translate3d(${x}px, ${top}px, 0)`;
        node.style.height = `${bottom - top}px`;
        node.style.opacity = '1';
        const right = Math.max(...rects.map((r) => r.x + r.width));
        if (maskEl.current) {
          const mk = maskEl.current;
          mk.style.top = `${top}px`;
          mk.style.height = `${bottom - top}px`;
          mk.style.left = `${right}px`;
          // 오른쪽 끝에 고정하고 왼쪽으로 늘리는 방식 — scaleX만 바꿔 레이아웃 재계산 없이 움직인다
          mk.style.width = `${Math.max(1, right - Math.min(...rects.map((r) => r.x)))}px`;
          mk.style.transform = `translateX(-100%) scaleX(${Math.max(0, right - x) / Math.max(1, right - Math.min(...rects.map((r) => r.x)))})`;
        }
      } catch {
        node.style.opacity = '0';
      }
    };
    place();
    chart.on('finished', place);
    return () => {
      chart.off('finished', place);
    };
  }, [chart, index, grids.join(','), mask]);

  return (
    <>
      {mask && <div ref={maskEl} className="chart-future" aria-hidden />}
      <div ref={el} className="chart-cursor" aria-hidden>
        {label && <span className="chart-cursor-label">{label}</span>}
      </div>
    </>
  );
}
