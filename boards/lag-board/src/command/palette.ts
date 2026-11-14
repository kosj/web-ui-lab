/**
 * 커맨드 센터 팔레트 — 다크 전용. 캔버스(지도·리본)와 CSS(command.css의 --cc-*)가 같은 값을 쓰도록 여기서 한 번만 정의한다.
 *
 * - 크롬(테두리·라벨·눈금): 시안 계열을 낮은 불투명도로만. 경보색과 겹치지 않게 채도 높은 시안은 선택·포커스에만 쓴다.
 * - 등급 5색: 쾌적·양호도 색을 가진다 (발광 화면에서 "살아 있음"을 보여주는 정상 흐름). 주의·경고·심각은 노랑·주황·빨강 —
 *   항공 경보 관례(빨강 = 경고, 앰버 = 주의)를 따른다. 등급은 항상 라벨·아이콘과 함께 표시한다.
 * - 원인 4색: 분석 보드 다크 팔레트 그대로 (dataviz 검증 통과, 운영자 기억 유지). 발광은 색이 아니라 번짐으로 더한다.
 */
import type { Cause, Tier } from '../data/config';

export const CC = {
  bg: '#03050c',
  panel: 'rgba(8, 14, 28, 0.78)',
  ink1: '#eef6ff',
  ink2: '#a3b6cc',
  ink3: '#62789a',
  cyan: '#38e8ff',
  violet: '#8b5cff',
  magenta: '#ff3df2',
  line: 'rgba(56, 232, 255, 0.14)',
  dot: 'rgba(120, 165, 215, 0.26)',
};

export const CC_TIER: Record<Tier, string> = {
  smooth: '#2de2c4',
  good: '#a3e635',
  notice: '#ffd60a',
  warning: '#ff8a1f',
  critical: '#ff2e63',
};

export const CC_CAUSE: Record<Cause, string> = {
  infra: '#3987e5',
  network: '#199e70',
  server: '#9085e9',
  client: '#d55181',
};

/** CSS 변수로 내보내기 — .cc 루트의 style에 넣는다 */
export const CC_VARS = {
  '--cc-bg': CC.bg,
  '--cc-panel': CC.panel,
  '--cc-ink-1': CC.ink1,
  '--cc-ink-2': CC.ink2,
  '--cc-ink-3': CC.ink3,
  '--cc-cyan': CC.cyan,
  '--cc-violet': CC.violet,
  '--cc-magenta': CC.magenta,
  '--cc-line': CC.line,
  ...Object.fromEntries(Object.entries(CC_TIER).map(([k, v]) => [`--cc-${k}`, v])),
  ...Object.fromEntries(Object.entries(CC_CAUSE).map(([k, v]) => [`--cc-${k}`, v])),
} as Record<string, string>;

/** '#rrggbb' + 불투명도 → rgba() */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 두 색 섞기 (선형 RGB 근사) */
export function mixHex(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
