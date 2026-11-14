import { useEffect, useRef, useState } from 'react';

/** 요소의 내용 폭 — SVG를 실제 픽셀 좌표로 그리기 위해 (viewBox 늘리기는 글자를 찌그러뜨린다) */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
