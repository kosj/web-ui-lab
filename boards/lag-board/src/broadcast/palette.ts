/**
 * 라이브 중계 팔레트 — 다크 전용, 중계 그래픽 관례: 검정 바탕 · 흰 글자 · 크롬은 무채색.
 * 커맨드 센터와 달리 정상(쾌적·양호)은 회색으로 두고 색은 노랑(주의)·주황(경고)·빨강(심각)에만 쓴다 —
 * 레이스의 깃발 체계(초록 = 평상, 노랑 = 주의, 빨강 = 중단)처럼 "색이 보이면 일이 났다".
 * 원인 4색은 분석 보드·커맨드 센터와 동일(검증 팔레트, 운영자 기억 유지).
 */
import type { Cause, Tier } from '../data/config';

export const BC = {
  bg: '#09090c',
  panel: '#121217',
  panel2: '#1a1a21',
  line: 'rgba(255, 255, 255, 0.09)',
  ink1: '#f6f6f8',
  ink2: '#a9a9b4',
  ink3: '#6f6f7b',
};

/** 막대·띠 등 면 색 */
export const BC_TIER: Record<Tier, string> = {
  smooth: '#34343e',
  good: '#6c6c78',
  notice: '#ffd400',
  warning: '#ff8a1c',
  critical: '#ff3434',
};
/** 글자로 쓸 때 (정상 등급은 회색 글자) */
export const BC_TIER_INK: Record<Tier, string> = {
  smooth: '#8a8a96',
  good: '#b9b9c4',
  notice: '#ffd400',
  warning: '#ff9a3a',
  critical: '#ff5a5a',
};

export const BC_CAUSE: Record<Cause, string> = {
  infra: '#3987e5',
  network: '#199e70',
  server: '#9085e9',
  client: '#d55181',
};
/** 타이어 배지처럼 원 안에 넣는 한 글자 */
export const CAUSE_GLYPH: Record<Cause, string> = { infra: '인', network: '네', server: '서', client: '클' };

export const BC_VARS = {
  '--bc-bg': BC.bg,
  '--bc-panel': BC.panel,
  '--bc-panel-2': BC.panel2,
  '--bc-line': BC.line,
  '--bc-ink-1': BC.ink1,
  '--bc-ink-2': BC.ink2,
  '--bc-ink-3': BC.ink3,
  ...Object.fromEntries(Object.entries(BC_TIER).map(([k, v]) => [`--bc-${k}`, v])),
  ...Object.fromEntries(Object.entries(BC_TIER_INK).map(([k, v]) => [`--bc-${k}-ink`, v])),
  ...Object.fromEntries(Object.entries(BC_CAUSE).map(([k, v]) => [`--bc-${k}`, v])),
} as Record<string, string>;
