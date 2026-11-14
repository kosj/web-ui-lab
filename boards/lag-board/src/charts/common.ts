import type { Tokens } from '../lib/theme';

export function tooltipStyle(k: Tokens) {
  return {
    backgroundColor: k.surface2,
    borderColor: k.lineStrong,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: k.ink1, fontSize: 12, fontFamily: k.fontSans },
    extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.28);',
  };
}

/** 시간축(카테고리) 공통 — 브라우저 시간대와 무관하게 KST 라벨을 직접 넣는다 */
export function timeAxes(k: Tokens, labels: string[], minutes: number[], labelEvery: number, yName?: string) {
  return {
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: k.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: k.ink3, fontSize: 11, hideOverlap: true,
        interval: (i: number) => minutes[i] % labelEvery === 0,
      },
      axisPointer: { lineStyle: { color: k.ink3, width: 1 } },
    },
    yAxis: {
      type: 'value',
      name: yName,
      nameTextStyle: { color: k.ink3, fontSize: 11, align: 'left', padding: [0, 0, 0, -28] },
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: k.ink3, fontSize: 11 },
      splitLine: { lineStyle: { color: k.grid, width: 1, type: 'solid' } },
    },
  };
}

export const swatch = (color: string) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>`;
