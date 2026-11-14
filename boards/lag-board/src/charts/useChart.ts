import { useEffect, useRef } from 'react';
import { echarts, type ECharts, type Option } from './echarts';

/**
 * ECharts 인스턴스 수명주기 훅 — 한 번 init, 옵션 변경 시 setOption(notMerge), 크기 변화 자동 대응.
 * group을 주면 같은 그룹 차트끼리 십자선(axisPointer)이 동기화된다.
 */
export function useChart(option: Option, opts: { group?: string; onReady?: (c: ECharts) => void } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const ready = useRef(opts.onReady);
  ready.current = opts.onReady;

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    if (opts.group) {
      c.group = opts.group;
      echarts.connect(opts.group);
    }
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    ready.current?.(c);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, [opts.group]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return { ref, chart };
}
