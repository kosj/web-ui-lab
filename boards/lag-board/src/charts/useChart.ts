import { useEffect, useRef, useState } from 'react';
import { echarts, type ECharts, type Option } from './echarts';

/**
 * ECharts 인스턴스 수명주기 훅.
 * - 한 번 init, 크기 변화 자동 대응, group을 주면 같은 그룹끼리 십자선 동기화.
 * - 기본은 notMerge(통째로 교체). merge: true면 series id 기준으로 병합해 데이터가 "모핑"되며 바뀐다
 *   (Heer & Robertson 2007: 같은 마크가 같은 데이터를 유지하며 이동해야 변화를 따라갈 수 있다).
 * - 시간 커서는 옵션에 넣지 않는다. <ChartCursor>가 HTML 오버레이로 그려 재생 중에도 차트를 다시 그리지 않는다.
 */
export function useChart(option: Option, opts: { group?: string; merge?: boolean; onReady?: (c: ECharts) => void } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const [instance, setInstance] = useState<ECharts | null>(null);
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
    setInstance(c);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
      setInstance(null);
    };
  }, [opts.group]);

  useEffect(() => {
    if (!instance) return;
    if (opts.merge) instance.setOption(option, { replaceMerge: ['series'], lazyUpdate: true });
    else instance.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option, instance, opts.merge]);

  return { ref, chart, instance };
}
