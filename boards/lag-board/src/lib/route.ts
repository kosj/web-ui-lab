import { useCallback, useEffect, useState } from 'react';
import type { RegionId } from '../data/config';

/**
 * 화면 전환 — 커맨드 센터(기본) / 라이브 중계 / 분석 보드. 같은 모델을 다른 문법으로 보여 주는 UI 후보들이다.
 * 주소: #command · #broadcast · #analysis · #style-<id>(분석 보드 + 스타일). 아티팩트는 단순 #이름만 전달한다.
 */
export type ViewId = 'command' | 'broadcast' | 'analysis';
export const VIEW_HASH: Record<ViewId, string> = { command: '#command', broadcast: '#broadcast', analysis: '#analysis' };

/** 다른 화면 → 분석 보드로 넘길 초점 (장애·권역) */
export interface Handoff {
  incidentId?: string;
  region?: RegionId;
}

function readView(): ViewId {
  const h = location.hash;
  if (h === '#analysis' || h.startsWith('#style-')) return 'analysis';
  if (h === '#broadcast') return 'broadcast';
  return 'command';
}

export function useViewRoute() {
  const [view, setViewState] = useState<ViewId>(readView);
  useEffect(() => {
    const on = () => setViewState(readView());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const setView = useCallback((v: ViewId) => {
    setViewState(v);
    try {
      history.replaceState(null, '', VIEW_HASH[v]);
    } catch {
      /* 주소를 못 바꾸는 환경에서도 화면은 바뀐다 */
    }
    window.scrollTo({ top: 0 });
  }, []);
  return { view, setView };
}

/** <html data-view> — 커맨드 센터 토큰(command.css)이 이 속성으로 켜진다. 렌더 중 호출해도 되는 멱등 함수 */
export function applyViewAttr(view: ViewId) {
  const el = document.documentElement;
  if (el.getAttribute('data-view') !== view) el.setAttribute('data-view', view);
}
