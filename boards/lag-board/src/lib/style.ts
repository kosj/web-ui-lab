import { useCallback, useState } from 'react';
import type { ThemeMode } from './theme';

/**
 * 보드 스타일 프리셋 — <html data-style>. 정의·근거: design-system/styles.css, knowledge/styles.md
 * 링크로 공유할 수 있게 주소의 #style-<id>를 읽고 쓴다 (아티팩트는 단순 #이름만 전달된다).
 */
export type StyleId = 'graphite' | 'cockpit' | 'terminal' | 'editorial' | 'glass';

export interface StyleMeta {
  id: StyleId;
  name: string;
  hint: string;
  /** 지원하는 테마 — 하나뿐이면 테마 토글이 잠긴다 */
  themes: ThemeMode[];
  /** 메뉴 견본 색: 배경 · 글자 · 강조 */
  swatch: [string, string, string];
}

/** 기본 스타일 — 관제 화면의 원거리 판독성을 우선해 콕핏 (2026-11-14 결정, knowledge/styles.md) */
export const DEFAULT_STYLE: StyleId = 'cockpit';

export const STYLES: StyleMeta[] = [
  { id: 'cockpit', name: '콕핏', hint: '조종석 글래스 콕핏 · B612 · 청록 라벨', themes: ['dark'], swatch: ['#020406', '#f4f8fb', '#4fd6ff'] },
  { id: 'graphite', name: '그래파이트', hint: '차분한 슬레이트 · 무채색 크롬', themes: ['dark', 'light'], swatch: ['#10141b', '#e8edf5', '#ec835a'] },
  { id: 'terminal', name: '터미널', hint: '앰버 인광 · 등폭 숫자 · 고밀도', themes: ['dark'], swatch: ['#000000', '#ffd27a', '#ffb000'] },
  { id: 'editorial', name: '에디토리얼', hint: '스위스 그리드 · 괘선 · 큰 활자', themes: ['light'], swatch: ['#fafaf9', '#0a0a0a', '#d6001c'] },
  { id: 'glass', name: '글래스', hint: '반투명 패널 · 오로라 배경', themes: ['dark', 'light'], swatch: ['#121a33', '#f6f8ff', '#a35ee0'] },
];
export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s])) as Record<StyleId, StyleMeta>;

const KEY = 'lag-board:style';
const isStyle = (v: unknown): v is StyleId => typeof v === 'string' && v in STYLE_BY_ID;

function readInitial(): StyleId {
  const h = location.hash.replace('#style-', '').replace('#', '');
  if (isStyle(h)) return h;
  try {
    const v = localStorage.getItem(KEY);
    if (isStyle(v)) return v;
  } catch {
    /* noop */
  }
  return DEFAULT_STYLE;
}

export function useStylePref() {
  const [style, setStyleState] = useState<StyleId>(readInitial);
  const setStyle = useCallback((id: StyleId) => {
    setStyleState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* noop */
    }
    try {
      history.replaceState(null, '', `#style-${id}`);
    } catch {
      /* 주소를 못 바꾸는 환경에서도 스타일은 적용 */
    }
  }, []);
  return { style, setStyle };
}

/** 스타일이 허용하는 테마로 맞춘 실제 테마 */
export function effectiveTheme(style: StyleId, preferred: ThemeMode): ThemeMode {
  const themes = STYLE_BY_ID[style].themes;
  return themes.includes(preferred) ? preferred : themes[0];
}

/**
 * <html>에 스타일·테마를 즉시 반영한다. 렌더 중에 호출해도 되는 멱등 함수 —
 * 자식의 effect(토큰 읽기)가 부모 effect보다 먼저 돌기 때문에 effect로 미루면 한 박자 늦은 토큰을 읽는다.
 */
export function applyRootAttrs(style: StyleId, theme: ThemeMode) {
  const el = document.documentElement;
  if (el.getAttribute('data-style') !== style) el.setAttribute('data-style', style);
  if (el.getAttribute('data-theme') !== theme) el.setAttribute('data-theme', theme);
}
