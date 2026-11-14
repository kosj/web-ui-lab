import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * 모션 설정 — 'full' | 'reduced'.
 * 기본값은 OS의 prefers-reduced-motion, 사용자가 상단 토글로 바꾸면 그 선택을 기억한다.
 * <html data-motion>에 반영되어 CSS 애니메이션·전환이 일괄로 꺼진다 (design-system/motion.css).
 */
export type MotionMode = 'full' | 'reduced';
const KEY = 'lag-board:motion';
const mq = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);

function readStored(): MotionMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'full' || v === 'reduced' ? v : null;
  } catch {
    return null;
  }
}

export function useMotionPref() {
  const [stored, setStored] = useState<MotionMode | null>(readStored);
  const [osReduced, setOsReduced] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setOsReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const mode: MotionMode = stored ?? (osReduced ? 'reduced' : 'full');
  useEffect(() => {
    document.documentElement.setAttribute('data-motion', mode);
  }, [mode]);
  const toggle = useCallback(() => {
    const next: MotionMode = mode === 'full' ? 'reduced' : 'full';
    setStored(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* 저장 실패해도 이번 세션에는 적용 */
    }
  }, [mode]);
  return { mode, toggle };
}

export const MotionContext = createContext<MotionMode>('full');
/** 모션을 써도 되는가 */
export const useMotionOn = () => useContext(MotionContext) === 'full';

/**
 * View Transitions API로 상태 변경을 감싼다 (2025-10 Baseline: Chrome 111, Safari 18, Firefox 144).
 * 지원하지 않거나 모션이 꺼져 있으면 그냥 바로 적용한다.
 */
export function withViewTransition(update: () => void, enabled: boolean) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!enabled || typeof d.startViewTransition !== 'function') {
    update();
    return;
  }
  d.startViewTransition(() => flushSync(update));
}
